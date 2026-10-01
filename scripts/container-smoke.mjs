// ENG-002 / ADR-010: smoke-check a running self-hosted container.
//
// scripts/selfhost.test.mjs already proves the standalone bundle is correct, and
// it runs everywhere. This script proves the *image* around that bundle is
// correct — base image, file ownership, working directory, CMD, PORT/HOSTNAME
// wiring — which needs a container runtime and so runs in CI and on demand
// rather than inside `npm run check`.
//
// Usage, against a container you have already started:
//   ECHO_OWNER_USERNAME=... ECHO_OWNER_PASSWORD=... node scripts/container-smoke.mjs http://127.0.0.1:3000
//
// Exits non-zero with a specific message on the first failure. It reads
// credentials from the environment and never prints them.

import assert from "node:assert/strict";

const base = process.argv[2];
const username = process.env.ECHO_OWNER_USERNAME;
const password = process.env.ECHO_OWNER_PASSWORD;

if (!base) {
  console.error("usage: node scripts/container-smoke.mjs <base-url>");
  process.exit(2);
}
if (!username || !password) {
  console.error("container-smoke: ECHO_OWNER_USERNAME and ECHO_OWNER_PASSWORD must be set to the values the container was started with.");
  process.exit(2);
}

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const PAGE_MARKER = /Echo private workspace/;

async function waitForContainer() {
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      await fetch(base);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`container-smoke: nothing answered at ${base} after 30 seconds`);
}

await waitForContainer();

const denied = await fetch(base);
assert.equal(denied.status, 401, "an unauthenticated request must be challenged");
assert.match(denied.headers.get("www-authenticate") ?? "", /^Basic /);

const page = await fetch(base, { headers: { authorization } });
assert.equal(page.status, 200, "the owner must reach the page");
const html = await page.text();
assert.match(html, PAGE_MARKER, "the container served the application page");
assert.doesNotMatch(html, new RegExp(password), "the owner password must never reach the browser");

// The image must carry .next/static. Without it the page still returns 200 and
// every stylesheet and script 404s, which reads as a styling bug rather than a
// packaging bug.
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
assert.ok(assets.length > 0, "the page linked no compiled assets, which means the HTML is not what we expect");
for (const asset of assets) {
  const response = await fetch(new URL(asset, base), { headers: { authorization } });
  assert.equal(response.status, 200, `the container did not serve ${asset}`);
}

console.log(`container-smoke: OK — gate enforced, page served, ${assets.length} compiled assets served from inside the image`);
