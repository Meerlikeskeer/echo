// ENG-010 / ADR-008 / ADR-010: verify a *deployed* Echo origin.
//
// `npm run check` proves the application against `next start` on loopback, and
// `scripts/container-smoke.mjs` proves the self-hosted image. Neither can see
// what a hosting platform puts in front of them. This script checks the thing
// the owner actually browses to, over its real certificate.
//
// The check that justifies this file: apps/web/src/proxy.ts gates every path
// with no exclusions, and scripts/production.test.mjs proves that against a
// Node server. A hosting platform commonly serves /_next/static from a CDN edge
// that answers *before* the application runs. If it does, compiled assets are
// public on the deployed origin while every local check stays green. Below,
// every asset the page links is fetched without credentials and must be
// refused.
//
// Usage:
//   ECHO_OWNER_USERNAME=... ECHO_OWNER_PASSWORD=... \
//     node scripts/deployed-smoke.mjs https://echo.example.com
//
// Reads credentials from the environment, never prints them, and never writes
// them into a URL. Exits non-zero with a specific message on the first failure.

import assert from "node:assert/strict";

const raw = process.argv[2];
const username = process.env.ECHO_OWNER_USERNAME;
const password = process.env.ECHO_OWNER_PASSWORD;

if (!raw) {
  console.error("usage: node scripts/deployed-smoke.mjs <base-url>");
  process.exit(2);
}
if (!username || !password) {
  console.error("deployed-smoke: set ECHO_OWNER_USERNAME and ECHO_OWNER_PASSWORD to the values the deployment was configured with.");
  process.exit(2);
}

let base;
try {
  base = new URL(raw);
} catch {
  console.error(`deployed-smoke: "${raw}" is not a URL.`);
  process.exit(2);
}
if (base.username || base.password) {
  console.error("deployed-smoke: do not put credentials in the URL. They belong in ECHO_OWNER_USERNAME and ECHO_OWNER_PASSWORD.");
  process.exit(2);
}

// HTTPS is not a preference here. Basic credentials travel in every request, and
// browsers expose crypto.subtle — which checksums every recorded chunk — only in
// a secure context. An origin served over plain HTTP cannot record at all.
const loopback = base.hostname === "localhost" || base.hostname === "127.0.0.1" || base.hostname === "[::1]";
if (base.protocol !== "https:" && !loopback) {
  console.error(`deployed-smoke: ${base.origin} is not HTTPS. Basic credentials would travel in clear text and crypto.subtle would be undefined, so recording could not work. Fix the deployment, not this check.`);
  process.exit(1);
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const owner = { authorization };
const PAGE_MARKER = /Record a note/;
const leaked = new RegExp(password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const notes = [];

const get = (path, headers = {}) => fetch(new URL(path, base), { headers, redirect: "manual" });

// 0. Reachability. An unreachable origin is a deployment answer, not a stack
//    trace: say which host did not answer rather than throwing undici internals.
try {
  await fetch(base);
} catch (cause) {
  console.error(`deployed-smoke: nothing answered at ${base.origin} (${cause?.cause?.code ?? cause?.message ?? "connection failed"}). Check the URL, that the deployment finished, and that its certificate is valid.`);
  process.exit(1);
}

// 1. The gate challenges an anonymous request.
const anonymous = await get("/");

// Before asserting, catch the case where the platform answers instead of Echo.
// Vercel's Deployment Protection redirects anonymous requests to its own SSO, so
// Echo's gate never runs and nothing below this line is testing Echo at all. That
// is worth naming precisely: a bare "302 !== 401" sends you looking at proxy.ts,
// which is not where the problem is.
const redirectedTo = anonymous.headers.get("location") ?? "";
if (/^3\d\d$/.test(String(anonymous.status)) && /vercel\.com\/sso-api|_vercel_sso/.test(redirectedTo + (anonymous.headers.get("set-cookie") ?? ""))) {
  console.error(
    `deployed-smoke: ${base.origin} is behind Vercel Deployment Protection, so Echo's own access gate is never reached.\n` +
      `  The origin answered ${anonymous.status} and redirected to Vercel's SSO instead of challenging with Basic auth.\n` +
      "  Access is currently controlled by your Vercel account, not by ECHO_OWNER_USERNAME/ECHO_OWNER_PASSWORD, and nothing\n" +
      "  below this check can run: every later assertion would be testing Vercel's login page rather than Echo.\n" +
      "  Fix: Vercel dashboard -> Project -> Settings -> Deployment Protection -> turn Vercel Authentication off, then re-run.\n" +
      "  Echo gates every path itself with no exclusions, which is what this script exists to verify.",
  );
  process.exit(1);
}

assert.notEqual(anonymous.status, 503, "the origin reports itself unconfigured: ECHO_OWNER_USERNAME and a 32+ character ECHO_OWNER_PASSWORD are not set as server-side environment variables on the deployment");
assert.equal(anonymous.status, 401, "an anonymous request to the deployed origin must be challenged");
assert.match(anonymous.headers.get("www-authenticate") ?? "", /^Basic /, "the challenge must be Basic");
assert.doesNotMatch(await anonymous.text(), PAGE_MARKER, "the challenge body must not contain the application page");

// 2. Wrong credentials are refused. A gate that only checks presence is not a gate.
const wrong = await get("/", { authorization: `Basic ${Buffer.from("wrong:wrong-password-that-is-long-enough").toString("base64")}` });
assert.equal(wrong.status, 401, "incorrect credentials must be refused");

// 3. The owner reaches the application.
const page = await get("/", owner);
assert.equal(page.status, 200, "the owner must reach the deployed page");
const html = await page.text();
assert.match(html, PAGE_MARKER, "the deployed origin served the application page");
assert.doesNotMatch(html, leaked, "the owner password must never reach the browser");
assert.doesNotMatch(html, /NEXT_PUBLIC_/, "Echo has no NEXT_PUBLIC_ variables; one appearing in the page means a secret was moved into the client bundle");
assert.match(page.headers.get("cache-control") ?? "", /no-store/, "a private page must not be cached by an intermediary");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");

// 4. The platform's asset layer must not bypass the gate. This is the check the
//    local suites structurally cannot make.
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
  .map((match) => match[1].replaceAll("&amp;", "&"));
assert.ok(assets.length > 0, "the page linked no compiled assets, so the HTML is not what we expect and the asset check below would prove nothing");
const offOrigin = new Set();
for (const asset of assets) {
  const url = new URL(asset, base);
  if (url.origin !== base.origin) offOrigin.add(url.origin);
  const refused = await fetch(url, { redirect: "manual" });
  assert.equal(refused.status, 401, `${asset} is served without credentials. The hosting platform is answering for it before Echo's proxy runs, so compiled assets are public on this origin.`);
  const served = await fetch(url, { headers: owner });
  assert.equal(served.status, 200, `the owner could not fetch ${asset}`);
  const content = await served.text();
  assert.doesNotMatch(content, leaked, `${asset} contains the owner password`);
}
if (offOrigin.size > 0) notes.push(`assets are served from ${[...offOrigin].join(", ")}, which is a different origin from ${base.origin}`);

// 5. Unknown paths are private too. proxy.ts excludes nothing on purpose.
assert.equal((await get("/definitely-not-a-route-9c1f")).status, 401, "an unknown path must be challenged rather than answered");

// 6. Diagnostics pages are development-only and must not exist in production.
for (const path of ["/diagnostics/capture", "/diagnostics/queue"]) {
  assert.equal((await get(path)).status, 401, `${path} must be challenged before anything else`);
  const asOwner = await get(path, owner);
  assert.equal(asOwner.status, 404, `${path} must not exist on a production deployment, even for the owner`);
}

// 7. The Route Handler guards itself, independently of the proxy.
const anonymousPost = await fetch(new URL("/api/recordings", base), { method: "POST", body: new FormData() });
assert.equal(anonymousPost.status, 401, "POST /api/recordings must refuse an anonymous request");
const emptyPost = await fetch(new URL("/api/recordings", base), { method: "POST", headers: owner, body: new FormData() });
assert.notEqual(emptyPost.status, 200, "POST /api/recordings accepted a request carrying no audio");
assert.ok([400, 503].includes(emptyPost.status), `POST /api/recordings answered ${emptyPost.status} to an empty body; expected 400 (rejected) or 503 (providers unconfigured)`);
const emptyBody = await emptyPost.text();
assert.doesNotMatch(emptyBody, leaked, "an error response leaked the owner password");

// ENG-021. WEB-007 added a second Route Handler and this check did not follow
// it, so a new production access surface went live unverified. The local
// production suite covers it; that runs on loopback and cannot see what a
// hosting platform does in front of the origin, which is the entire reason this
// script exists. **Every Route Handler belongs here, and a new one is not
// deployed until it is.**
const artifacts = new URL("/api/sessions/artifacts", base);
const anonymousArtifacts = await fetch(artifacts, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
assert.equal(anonymousArtifacts.status, 401, "POST /api/sessions/artifacts must refuse an anonymous request");
const emptyArtifacts = await fetch(artifacts, { method: "POST", headers: { ...owner, "content-type": "application/json" }, body: "{}" });
assert.notEqual(emptyArtifacts.status, 200, "POST /api/sessions/artifacts accepted a body that is not a session transcript");
assert.ok(
  [400, 503].includes(emptyArtifacts.status),
  `POST /api/sessions/artifacts answered ${emptyArtifacts.status} to an empty object; expected 400 (rejected) or 503 (providers unconfigured)`,
);
const artifactsBody = await emptyArtifacts.text();
assert.doesNotMatch(artifactsBody, leaked, "an error response leaked the owner password");

// 8. Report provider configuration without reading or printing any value.
const providersReady = !/Recording is unavailable/.test(html);
notes.push(providersReady
  ? "transcription and notes providers are configured"
  : "providers are NOT configured on this deployment: the page says recording is unavailable and names the missing variables. Recording will fail closed until they are set.");

// 9. Report transport hardening rather than failing on it: a self-hosted origin
//    behind the owner's own reverse proxy may set this elsewhere (ADR-010).
if (base.protocol === "https:" && !page.headers.get("strict-transport-security")) {
  notes.push("no Strict-Transport-Security header; consider enabling HSTS so a browser never retries this origin over plain HTTP");
}
if (loopback) notes.push("checked over loopback, not a real certificate: this does not verify the deployed transport");

console.log(`deployed-smoke: OK — ${base.origin} challenges anonymous requests, refuses wrong credentials, serves the page and ${assets.length} compiled assets to the owner only, hides diagnostics, and guards both Route Handlers.`);
for (const note of notes) console.log(`deployed-smoke: note — ${note}`);
