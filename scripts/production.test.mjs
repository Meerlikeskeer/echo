import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const username = "synthetic-owner";
const password = "synthetic-production-password-123456789";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const PAGE_MARKER = /Echo private workspace/;
const PRIVATE_PATHS = ["/diagnostics/lecture", "/diagnostics/queue", "/diagnostics/capture", "/", "/api/recordings", "/api/sessions", "/api/sessions/artifacts", "/_next/static/missing.js", "/?_rsc=probe"];

// Every provider variable is blanked explicitly so a developer's real
// echo-web-app/.env.local can never configure a server under test, and no test can
// reach a real vendor. Individual tests opt back in with the fixture adapter.
const BLANK_PROVIDERS = {
  TRANSCRIPTION_PROVIDER: "", TRANSCRIPTION_BASE_URL: "", TRANSCRIPTION_API_KEY: "", TRANSCRIPTION_MODEL: "",
  LLM_PROVIDER: "", LLM_BASE_URL: "", LLM_API_KEY: "", LLM_MODEL: "",
};
const FIXTURE_PROVIDERS = { ...BLANK_PROVIDERS, TRANSCRIPTION_PROVIDER: "fixture", TRANSCRIPTION_MODEL: "fixture-transcribe", LLM_PROVIDER: "fixture", LLM_MODEL: "fixture-notes" };

test("Quick Note uploads classify into pending suggestions and cannot replay ordinary notes", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const metadata = { sessionId: "quick-session", id: "quick-clip", sequence: 0, startMs: 0, endMs: 8000, overlapMs: 0, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex") };
    const post = (chunk) => {
      const body = syntheticClip();
      body.set("durationMs", String(chunk.endMs - chunk.startMs));
      body.append("chunk", JSON.stringify(chunk));
      return fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
    };
    const ordinary = await post(metadata);
    assert.equal(ordinary.status, 200);
    assert.equal((await ordinary.json()).quickNote, undefined);
    const quick = { ...metadata, quickNote: { stoppedAt: 1788973200000, onlineAtStop: true } };
    const response = await post(quick);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-echo-replayed"), "false");
    const result = await response.json();
    assert.deepEqual(result.quickNote, { items: [{ kind: "task", text: "Review the generated notes.", dateText: null }] });
    assert.deepEqual(result.chunk.quickNote, quick.quickNote);
    assert.ok(result.transcript.text.length);
    assert.ok(result.notes.title.length);
    assert.equal(result.disclosures.length, 2);
    const replay = await post(quick);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get("x-echo-replayed"), "true");
    assert.deepEqual((await replay.json()).quickNote, result.quickNote);
  });
});

test("Quick Note uploads reject invalid context and multi-chunk captures", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const metadata = { sessionId: "invalid-quick", id: "clip", sequence: 0, startMs: 0, endMs: 8000, overlapMs: 0, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex"), quickNote: { stoppedAt: 1788973200000, onlineAtStop: false } };
    for (const chunk of [
      { ...metadata, quickNote: { stoppedAt: -1, onlineAtStop: true } },
      { ...metadata, quickNote: { stoppedAt: 1788973200000, onlineAtStop: "true" } },
      { ...metadata, sequence: 1 },
      { ...metadata, endMs: 60001 },
    ]) {
      const body = syntheticClip(); body.set("durationMs", String(chunk.endMs - chunk.startMs)); body.append("chunk", JSON.stringify(chunk));
      const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "bad_request");
    }
  });
});

test("chunk uploads validate checksum and normalize transcription into session time", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const metadata = { sessionId: "synthetic-session", id: "synthetic-chunk", sequence: 1, startMs: 29000, endMs: 70000, overlapMs: 1000, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex") };
    const body = syntheticClip(); body.append("chunk", JSON.stringify(metadata));
    const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.chunk, metadata);
    assert.ok(result.transcript.segments[0].startMs >= 29000);
    // A distinct chunk id on purpose: sharing one would key the job ledger the
    // same way and this post would be answered by a replay, so it would no
    // longer prove that Safari's MIME spacing is accepted by the pipeline.
    const spaced = syntheticClip(); spaced.append("chunk", JSON.stringify({ ...metadata, id: "synthetic-chunk-spaced", mimeType: "audio/webm; codecs=opus" }));
    const normalized = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: spaced });
    assert.equal(normalized.status, 200);
    assert.equal(normalized.headers.get("x-echo-replayed"), "false", "this must be a real transcription, not a replayed one");
    const invalid = syntheticClip(); invalid.append("chunk", JSON.stringify({ ...metadata, checksum: "0".repeat(64) }));
    assert.equal((await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: invalid })).status, 400);
  });
});

async function withServer({ configured, providers = BLANK_PROVIDERS, extraEnv = {} }, run) {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  // Explicit values override any inherited secrets; never print process environment.
  const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("../echo-web-app/", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", ECHO_AUTH_MODE: "owner", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "", ECHO_APP_URL: base, ECHO_CREDENTIAL_ENCRYPTION_KEY: "", ECHO_OWNER_USERNAME: configured ? username : "", ECHO_OWNER_PASSWORD: configured ? password : "", ...providers, ...extraEnv },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error(`Production server exited: ${output}`);
      try { await fetch(base); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, `Production server did not start: ${output}`);
    await run(base);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
}

/** Synthetic audio. No test may depend on a real microphone recording. */
function syntheticClip(bytes = 2048) {
  const body = new FormData();
  body.append("audio", new Blob([new Uint8Array(bytes)], { type: "audio/webm;codecs=opus" }), "recording");
  body.append("durationMs", "41000");
  return body;
}

test("production denies every tested route when owner configuration is absent", { timeout: 30000 }, async () => {
  await withServer({ configured: false }, async (base) => {
    for (const path of PRIVATE_PATHS) {
      const response = await fetch(`${base}${path}`, { headers: { authorization } });
      assert.equal(response.status, 503, path);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(await response.text(), PAGE_MARKER);
    }
    const posted = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: syntheticClip() });
    assert.equal(posted.status, 503);
  });
});

test("production challenges unauthorized requests and serves private HTML, RSC and compiled assets to owner", { timeout: 30000 }, async () => {
  await withServer({ configured: true }, async (base) => {
    for (const path of PRIVATE_PATHS) {
      const denied = await fetch(`${base}${path}`, { headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy", RSC: "1" } });
      assert.equal(denied.status, 401, path);
      assert.match(denied.headers.get("www-authenticate"), /^Basic /);
      assert.doesNotMatch(await denied.text(), PAGE_MARKER);
    }
    assert.equal((await fetch(base, { headers: { authorization: "Basic d3Jvbmc6d3Jvbmc=" } })).status, 401);
    const page = await fetch(base, { headers: { authorization } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, PAGE_MARKER);
    assert.doesNotMatch(html, new RegExp(password));
    const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    assert.ok(assets.some((asset) => asset.includes(".css")), "compiled Tailwind CSS is linked");
    assert.ok(assets.some((asset) => asset.includes(".js")), "client runtime is linked");
    for (const asset of assets) {
      assert.equal((await fetch(new URL(asset, base))).status, 401);
      const response = await fetch(new URL(asset, base), { headers: { authorization } });
      assert.equal(response.status, 200, asset);
      const content = await response.text();
      assert.doesNotMatch(content, new RegExp(password));
      if (asset.includes(".css")) assert.match(content, /\.text-4xl/, "Tailwind utilities were generated");
    }
    const rsc = await fetch(`${base}/?_rsc=probe`, { headers: { authorization, RSC: "1" } });
    assert.equal(rsc.status, 200);
    assert.match(await rsc.text(), PAGE_MARKER);
  });
});

test("recording fails closed while provider configuration is incomplete", { timeout: 30000 }, async () => {
  await withServer({ configured: true }, async (base) => {
    const page = await (await fetch(base, { headers: { authorization } })).text();
    assert.match(page, /Recording is unavailable/);
    assert.match(page, /TRANSCRIPTION_PROVIDER/, "the page names the missing variables");

    const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: syntheticClip() });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, "provider_unconfigured");
    assert.equal(body.error.retryable, false);
    assert.ok(body.problems.some((problem) => problem.includes("TRANSCRIPTION_PROVIDER")));
    assert.doesNotMatch(JSON.stringify(body), new RegExp(password));
  });
});

test("the recording endpoint guards itself and completes the slice with fixture providers", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    // The endpoint calls the owner guard at its own boundary, so it must refuse
    // even a request that has bypassed the proxy.
    const unauthorized = await fetch(`${base}/api/recordings`, { method: "POST", headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" }, body: syntheticClip() });
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(await unauthorized.text(), /fixture recording/i);

    const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: syntheticClip() });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const result = await response.json();

    // Asserting the adapter proves no request could have reached a real vendor.
    assert.deepEqual(result.disclosures.map((entry) => entry.adapter), ["fixture", "fixture"]);
    assert.deepEqual(result.disclosures.map((entry) => entry.processor), ["local", "local"]);
    assert.match(result.transcript.text, /fixture recording/i);
    assert.equal(result.transcript.segments.length, 3);
    assert.equal(result.transcript.segments[0].startMs, 0);
    assert.equal(result.notes.title, "Fixture recording");
    assert.ok(Array.isArray(result.notes.actionItems));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(password));

    const empty = new FormData();
    empty.append("durationMs", "41000");
    assert.equal((await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: empty })).status, 400);

    const oversized = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: syntheticClip(4_000_001) });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, "clip_too_large");
  });
});

// WEB-007. The session artifact endpoint, over real HTTP against a production
// build. The revision assertion is the one that matters: the endpoint computes
// it from the transcript it received, so a caller cannot mislabel a revision and
// defeat the staleness rule.
test("the artifacts endpoint guards itself and derives the revision from the transcript it was sent", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const stitched = {
      sessionId: "synthetic-session", status: "partial", text: "One. Two.",
      segments: [{ text: "One.", startMs: 0, endMs: 1000 }, { text: "Two.", startMs: 1000, endMs: 2000 }],
      gaps: [],
    };
    const post = (body, headers = { authorization }) => fetch(`${base}/api/sessions/artifacts`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body),
    });

    // The endpoint calls the owner guard at its own boundary, so it must refuse
    // even a request that has bypassed the proxy.
    const unauthorized = await post(stitched, { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" });
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(await unauthorized.text(), /fixture session/i);

    const response = await post(stitched);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const result = await response.json();

    // Asserting the adapter proves no request could have reached a real vendor.
    assert.deepEqual(result.disclosures.map((entry) => entry.adapter), ["fixture"]);
    assert.equal(result.transcriptStatus, "partial");
    assert.match(result.transcriptRevision, /^[a-f0-9]{64}$/);
    // The session answer, not the per-chunk notes answer.
    assert.equal(result.artifacts.title, "Fixture session");
    assert.ok(Array.isArray(result.artifacts.researchTopics));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(password));

    // Same transcript, same revision. A different transcript, a different one —
    // and a caller cannot choose either, because it never sends a revision.
    assert.equal((await post(stitched).then((r) => r.json())).transcriptRevision, result.transcriptRevision);
    const changed = { ...stitched, status: "final" };
    assert.notEqual((await post(changed).then((r) => r.json())).transcriptRevision, result.transcriptRevision);

    // Malformed bodies are refused before a credential is used.
    for (const body of [{}, { ...stitched, sessionId: "" }, { ...stitched, status: "done" }, { ...stitched, segments: "x" }, { ...stitched, gaps: [{ reason: "invented", sequence: 1 }] }]) {
      assert.equal((await post(body)).status, 400, `expected 400 for ${JSON.stringify(body)}`);
    }
    // Nothing to summarize is not a provider failure and must not cost a call.
    const empty = await post({ ...stitched, text: "   " });
    assert.equal(empty.status, 422);
    assert.equal((await empty.json()).error.code, "no_speech");
  });
});

test("capture diagnostics are unavailable in production even to the owner", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const response = await fetch(`${base}/diagnostics/capture`, { headers: { authorization } });
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Run browser acceptance/);
  });
});

 test("queue and lecture diagnostics are absent from production even for the owner", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    assert.equal((await fetch(`${base}/diagnostics/queue`, { headers: { authorization } })).status, 404);
    const lecture = await fetch(`${base}/diagnostics/lecture`, { headers: { authorization } });
    assert.equal(lecture.status, 404);
    assert.doesNotMatch(await lecture.text(), /Seed synthetic lecture/);
  });
});

test("a repeated chunk upload replays the first answer instead of transcribing twice", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const metadata = { sessionId: "replay-session", id: "replay-chunk", sequence: 1, startMs: 29000, endMs: 70000, overlapMs: 1000, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex") };
    const post = async () => {
      const body = syntheticClip();
      body.append("chunk", JSON.stringify(metadata));
      const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
      assert.equal(response.status, 200);
      return { replayed: response.headers.get("x-echo-replayed"), body: await response.json() };
    };
    // The owner gate runs before the ledger, so an unauthenticated caller can
    // neither read it nor put anything in it. The owner's first request below
    // answering "not replayed" is the proof that this one populated nothing.
    const probe = syntheticClip();
    probe.append("chunk", JSON.stringify(metadata));
    const denied = await fetch(`${base}/api/recordings`, { method: "POST", headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy" }, body: probe });
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get("x-echo-replayed"), null);

    // The first response is what a client can lose: a timeout, a suspended tab,
    // a connection dropped after the provider already answered. The retry is
    // byte-identical, and must not buy a second transcription.
    const first = await post();
    const second = await post();
    assert.equal(first.replayed, "false");
    assert.equal(first.body.replayed, false);
    assert.equal(second.replayed, "true");
    assert.equal(second.body.replayed, true);
    assert.deepEqual({ ...second.body, replayed: false }, first.body);

    // Same chunk id, different bytes, is a conflict rather than a replay: the
    // checksum no longer matches the upload and the request never reaches the
    // ledger at all.
    const conflicting = syntheticClip(1024);
    conflicting.append("chunk", JSON.stringify(metadata));
    assert.equal((await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: conflicting })).status, 400);

    // A different chunk identity is its own job, answered fresh.
    const other = syntheticClip();
    other.append("chunk", JSON.stringify({ ...metadata, id: "replay-chunk-2", sequence: 2, startMs: 69000, endMs: 110000 }));
    const fresh = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: other });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("x-echo-replayed"), "false");

    // The single-clip path carries no chunk identity, so it is not ledgered and
    // its body is unchanged.
    const single = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: syntheticClip() });
    assert.equal(single.status, 200);
    assert.equal(single.headers.get("x-echo-replayed"), null);
    const body = await single.json();
    assert.equal("replayed" in body, false);
    assert.equal("chunk" in body, false);
  });
});

test("transcription-only mode omits notes and has its own authenticated replay identity", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async base => {
    const metadata = { sessionId: "transcribe-session", id: "transcribe-clip", sequence: 0, startMs: 0, endMs: 41000, overlapMs: 0, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex") };
    const post = async mode => {
      const body = syntheticClip(); body.set("chunk", JSON.stringify(metadata));
      if (mode) body.set("mode", mode);
      return fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
    };
    const first = await post("transcription-only"); assert.equal(first.status, 200);
    const result = await first.json(); assert.equal(result.processingMode, "transcription-only"); assert.equal(result.notes, undefined); assert.equal(result.replayed, false);
    assert.deepEqual(result.disclosures.map(d => d.port), ["transcription"]);
    assert.equal((await (await post("transcription-only")).json()).replayed, true);
    const ordinary = await (await post()).json(); assert.equal(ordinary.replayed, false); assert.ok(ordinary.notes);
    assert.equal((await post("unknown")).status, 400);
  });
});


// Synthetic Auth server: only a known test token is accepted. No real provider,
// OAuth application, mailbox or Supabase project is contacted by these checks.
test("account mode verifies identity, isolates paid requests and never falls back to owner keys", {timeout:30000}, async () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const user = {id, email:"synthetic@example.test", app_metadata:{provider:"email"}, user_metadata:{}, aud:"authenticated", created_at:"2026-01-01T00:00:00Z"};
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:id,exp:Math.floor(Date.now()/1000)+3600})}.synthetic-signature`;
  let authCalls = 0, databaseCalls = 0;
  const auth = createHttpServer((request,response) => {
    response.setHeader("content-type","application/json");
    if (request.url === "/auth/v1/user") {
      authCalls++;
      if (request.headers.authorization === `Bearer ${token}`) { response.end(JSON.stringify(user)); return; }
      response.statusCode=401; response.end(JSON.stringify({message:"Invalid token"})); return;
    }
    if (request.url.startsWith("/rest/v1/provider_credentials")) { databaseCalls++; response.end("null"); return; }
    response.statusCode=404; response.end("{}");
  });
  await new Promise(resolve => auth.listen(0,"127.0.0.1",resolve));
  try {
    await withServer({configured:true, providers:FIXTURE_PROVIDERS, extraEnv:{ECHO_AUTH_MODE:"accounts",SUPABASE_URL:`http://127.0.0.1:${auth.address().port}`,SUPABASE_PUBLISHABLE_KEY:"synthetic-public-key",ECHO_CREDENTIAL_ENCRYPTION_KEY:"ab".repeat(32)}}, async base => {
      const session = {access_token:token,refresh_token:"synthetic-refresh-token",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
      const cookie = `echo-account-session=base64-${encode(session)}`;
      assert.equal((await fetch(`${base}/login`)).status,200);
      assert.equal((await fetch(`${base}/api/account`,{headers:{authorization}})).status,401,"owner Basic cannot bypass account login");
      const identity = await fetch(`${base}/api/account`,{headers:{cookie}});
      assert.equal(identity.status,200); assert.equal((await identity.json()).userId,id);
      const post = headers => fetch(`${base}/api/recordings`,{method:"POST",headers:{cookie,...headers},body:syntheticClip()});
      assert.equal((await post({origin:base,"x-echo-user":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"})).status,401);
      assert.equal((await post({origin:"https://evil.example","x-echo-user":id})).status,401);
      assert.equal((await post({origin:base})).status,401);
      assert.equal(databaseCalls,0,"rejected requests must not load keys");
      const missing = await post({origin:base,"x-echo-user":id});
      assert.equal(missing.status,503,"fixture/owner provider config must not process account audio without personal keys");
      assert.ok(databaseCalls>0); assert.ok(authCalls>0);
      assert.match(JSON.stringify(await missing.json()),/Account settings/);
      const forged = `echo-account-session=base64-${encode({...session,access_token:token+"forged"})}`;
      assert.equal((await fetch(`${base}/api/account`,{headers:{cookie:forged}})).status,401);
    });
  } finally { await new Promise(resolve => auth.close(resolve)); }
});

test("unknown and incomplete account configuration stay closed", {timeout:30000}, async () => {
  for (const extraEnv of [{ECHO_AUTH_MODE:"unknown"},{ECHO_AUTH_MODE:"accounts",SUPABASE_URL:"",SUPABASE_PUBLISHABLE_KEY:""}]) {
    await withServer({configured:true,providers:FIXTURE_PROVIDERS,extraEnv},async base=>{
      for (const path of ["/","/login","/api/recordings","/_next/static/missing.js"]) assert.equal((await fetch(`${base}${path}`,{headers:{authorization}})).status,503);
    });
  }
});
