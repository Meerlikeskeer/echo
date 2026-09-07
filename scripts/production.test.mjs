import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { test } from "node:test";

const username = "synthetic-owner";
const password = "synthetic-production-password-123456789";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const PAGE_MARKER = /Record a note/;
const PRIVATE_PATHS = ["/", "/api/recordings", "/api/sessions", "/_next/static/missing.js", "/?_rsc=probe"];

// Every provider variable is blanked explicitly so a developer's real
// apps/web/.env.local can never configure a server under test, and no test can
// reach a real vendor. Individual tests opt back in with the fixture adapter.
const BLANK_PROVIDERS = {
  TRANSCRIPTION_PROVIDER: "", TRANSCRIPTION_BASE_URL: "", TRANSCRIPTION_API_KEY: "", TRANSCRIPTION_MODEL: "",
  LLM_PROVIDER: "", LLM_BASE_URL: "", LLM_API_KEY: "", LLM_MODEL: "",
};
const FIXTURE_PROVIDERS = { ...BLANK_PROVIDERS, TRANSCRIPTION_PROVIDER: "fixture", TRANSCRIPTION_MODEL: "fixture-transcribe", LLM_PROVIDER: "fixture", LLM_MODEL: "fixture-notes" };

test("chunk uploads validate checksum and normalize transcription into session time", { timeout: 30000 }, async () => {
  await withServer({ configured: true, providers: FIXTURE_PROVIDERS }, async (base) => {
    const metadata = { sessionId: "synthetic-session", id: "synthetic-chunk", sequence: 1, startMs: 29000, endMs: 70000, overlapMs: 1000, mimeType: "audio/webm;codecs=opus", size: 2048, checksum: createHash("sha256").update(new Uint8Array(2048)).digest("hex") };
    const body = syntheticClip(); body.append("chunk", JSON.stringify(metadata));
    const response = await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.chunk, metadata);
    assert.ok(result.transcript.segments[0].startMs >= 29000);
    const invalid = syntheticClip(); invalid.append("chunk", JSON.stringify({ ...metadata, checksum: "0".repeat(64) }));
    assert.equal((await fetch(`${base}/api/recordings`, { method: "POST", headers: { authorization }, body: invalid })).status, 400);
  });
});

async function withServer({ configured, providers = BLANK_PROVIDERS }, run) {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  // Explicit values override any inherited secrets; never print process environment.
  const child = spawn(process.execPath, ["../../node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("../apps/web/", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", ECHO_OWNER_USERNAME: configured ? username : "", ECHO_OWNER_PASSWORD: configured ? password : "", ...providers },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
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
