import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assembleStandalone, paths } from "./selfhost-assemble.mjs";

// ENG-002 / ADR-010: prove Echo runs outside Vercel, rather than asserting it.
//
// These tests boot the standalone bundle emitted by `npm run build` — the same
// artifact the container runs — instead of `next start`. That distinction is the
// whole point: `next start` reads the full workspace and the full node_modules,
// so it passes even when the standalone bundle is broken. Three failures are
// invisible to scripts/production.test.mjs and visible here:
//
//   1. A wrong outputFileTracingRoot emits a bundle whose imports resolve to
//      nothing. The bundle builds cleanly and dies on boot.
//   2. Missing .next/static means every stylesheet and client script 404s while
//      the page itself still returns 200.
//   3. Owner credentials baked in at build time instead of read at runtime would
//      make one image usable by exactly one deployment, and would ship a secret
//      inside the image.
//
// scripts/production.test.mjs is deliberately untouched: it owns the full access
// matrix against `next start`, and duplicating it here would mean two copies to
// keep in step. This file asserts only what the deployment shape can break.

const username = "synthetic-owner";
const password = "synthetic-selfhost-password-123456789";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const PAGE_MARKER = /Echo private workspace/;

// Blanked explicitly so a developer's real echo-web-app/.env.local can never
// configure a server under test and no test can reach a real vendor.
const BLANK_PROVIDERS = {
  TRANSCRIPTION_PROVIDER: "", TRANSCRIPTION_BASE_URL: "", TRANSCRIPTION_API_KEY: "", TRANSCRIPTION_MODEL: "",
  LLM_PROVIDER: "", LLM_BASE_URL: "", LLM_API_KEY: "", LLM_MODEL: "",
};

async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

/**
 * Boots the assembled standalone bundle exactly as a container would: `node
 * server.js`, configured only through the runtime environment. No build step and
 * no workspace access.
 *
 * With `relocate`, the bundle is first copied to a directory outside the
 * repository and started with a minimal environment, which is what the container
 * actually does (`COPY .next/standalone/ /app` then `node echo-web-app/server.js`).
 * That distinction matters: started in place, the bundle sits inside the
 * repository, so Node's module resolution can walk up into the workspace
 * node_modules and hide a dependency the trace failed to include. Relocated, it
 * cannot — the bundle either carries what it needs or it does not start.
 */
async function withStandaloneServer({ configured, relocate = false }, run) {
  await assembleStandalone();
  const port = await freePort();

  let appRoot;
  let command;
  let cwd;
  let env;
  if (relocate) {
    appRoot = await mkdtemp(path.join(tmpdir(), "echo-selfhost-"));
    await cp(paths.standalone, appRoot, { recursive: true });
    // Mirrors the Dockerfile's WORKDIR and CMD rather than an absolute path.
    cwd = appRoot;
    command = "echo-web-app/server.js";
    // Deliberately not `...process.env`: nothing inherited, so the bundle cannot
    // borrow anything from the developer's shell that a container would not have.
    env = { PATH: process.env.PATH, HOME: process.env.HOME };
  } else {
    cwd = undefined;
    command = paths.server;
    env = { ...process.env };
  }

  const child = spawn(process.execPath, [command], {
    cwd,
    // Explicit values override any inherited secrets; never print process environment.
    env: {
      ...env,
      ...BLANK_PROVIDERS,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      ECHO_OWNER_USERNAME: configured ? username : "",
      ECHO_OWNER_PASSWORD: configured ? password : "",
    },
    stdio: "pipe",
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (child.exitCode !== null) throw new Error(`Standalone server exited: ${output}`);
      try { await fetch(base); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, `Standalone server did not start: ${output}`);
    await run(base, appRoot);
  } finally {
    child.kill("SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
    if (appRoot) await rm(appRoot, { recursive: true, force: true });
  }
}

test("the standalone bundle boots and serves every compiled asset it links", { timeout: 60000 }, async () => {
  await withStandaloneServer({ configured: true }, async (base) => {
    const page = await fetch(base, { headers: { authorization } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, PAGE_MARKER);
    assert.doesNotMatch(html, new RegExp(password), "the owner password must never reach the browser");

    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    assert.ok(assets.some((asset) => asset.includes(".css")), "compiled CSS is linked");
    assert.ok(assets.some((asset) => asset.includes(".js")), "client runtime is linked");

    // The assertion this file exists for. Without the assembly step every one of
    // these is a 404 from a server that otherwise looks healthy.
    for (const asset of assets) {
      const response = await fetch(new URL(asset, base), { headers: { authorization } });
      assert.equal(response.status, 200, `standalone server did not serve ${asset}`);
      const content = await response.text();
      assert.doesNotMatch(content, new RegExp(password));
      if (asset.includes(".css")) assert.match(content, /\.text-/, "Tailwind utilities were generated and served");
    }
  });
});

test("the standalone bundle still enforces the owner access gate", { timeout: 60000 }, async () => {
  await withStandaloneServer({ configured: true }, async (base) => {
    const denied = await fetch(base);
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("www-authenticate"), /^Basic /);
    assert.doesNotMatch(await denied.text(), PAGE_MARKER);
    assert.equal((await fetch(base, { headers: { authorization: "Basic d3Jvbmc6d3Jvbmc=" } })).status, 401);
  });
});

test("the bundle runs relocated outside the repository, the way the container does", { timeout: 60000 }, async () => {
  // The closest thing to a container check that needs no container runtime. It
  // exercises the Dockerfile's three riskiest lines — the COPY source, the
  // WORKDIR, and the relative CMD path — and it is the only test that proves the
  // bundle is not quietly borrowing the workspace node_modules it sits inside.
  await withStandaloneServer({ configured: true, relocate: true }, async (base, appRoot) => {
    const topLevel = await readdir(appRoot);
    assert.ok(topLevel.includes("node_modules"), "the bundle must carry its own traced dependencies");
    assert.ok(topLevel.includes("echo-web-app"), "the workspace layout the CMD path depends on is missing");

    // An .env file reaching the image would ship a credential inside it. The
    // container job asserts this against the real image; this covers the bundle.
    const strays = [];
    const walk = async (dir, depth = 0) => {
      if (depth > 3) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        if (entry.name.startsWith(".env")) strays.push(path.join(dir, entry.name));
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), depth + 1);
      }
    };
    await walk(appRoot);
    assert.deepEqual(strays, [], "no environment file may be inside a deployable bundle");

    const denied = await fetch(base);
    assert.equal(denied.status, 401, "the relocated bundle must still enforce the gate");

    const page = await fetch(base, { headers: { authorization } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, PAGE_MARKER);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
    assert.ok(assets.length > 0, "the page linked no compiled assets");
    for (const asset of assets) {
      assert.equal((await fetch(new URL(asset, base), { headers: { authorization } })).status, 200, `relocated bundle did not serve ${asset}`);
    }
  });
});

test("the same bundle is configured at runtime, not at build time", { timeout: 60000 }, async () => {
  // Nothing is rebuilt between this test and the two above. Identical bytes,
  // different environment, different behavior: that is what makes one image
  // deployable anywhere, and what proves no credential was baked in at build.
  await withStandaloneServer({ configured: false }, async (base) => {
    for (const path of ["/", "/api/recordings"]) {
      const response = await fetch(`${base}${path}`, { headers: { authorization } });
      assert.equal(response.status, 503, path);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(await response.text(), PAGE_MARKER);
    }
  });
});
