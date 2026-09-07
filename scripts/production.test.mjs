import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { test } from "node:test";

const username = "synthetic-owner";
const password = "synthetic-production-password-123456789";
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
async function withServer(configured, run) {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  // Explicit values override any inherited secrets; never print process environment.
  const child = spawn(process.execPath, ["../../node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("../apps/web/", import.meta.url),
    env: { ...process.env, NODE_ENV: "production", ECHO_OWNER_USERNAME: configured ? username : "", ECHO_OWNER_PASSWORD: configured ? password : "" },
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
test("production denies every tested route when owner configuration is absent", { timeout: 30000 }, async () => {
  await withServer(false, async (base) => {
    for (const path of ["/", "/api/sessions", "/_next/static/missing.js", "/?_rsc=probe"]) {
      const response = await fetch(`${base}${path}`, { headers: { authorization } });
      assert.equal(response.status, 503, path);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(await response.text(), /No sessions yet/);
    }
  });
});
test("production challenges unauthorized requests and serves private HTML, RSC and compiled assets to owner", { timeout: 30000 }, async () => {
  await withServer(true, async (base) => {
    for (const path of ["/", "/api/sessions", "/_next/static/missing.js", "/?_rsc=probe"]) {
      const denied = await fetch(`${base}${path}`, { headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy", RSC: "1" } });
      assert.equal(denied.status, 401, path);
      assert.match(denied.headers.get("www-authenticate"), /^Basic /);
      assert.doesNotMatch(await denied.text(), /No sessions yet/);
    }
    assert.equal((await fetch(base, { headers: { authorization: "Basic d3Jvbmc6d3Jvbmc=" } })).status, 401);
    const page = await fetch(base, { headers: { authorization } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /No sessions yet/);
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
    assert.match(await rsc.text(), /No sessions yet/);
  });
});
