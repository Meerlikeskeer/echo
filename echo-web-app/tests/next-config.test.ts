import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// ENG-012. `output: "standalone"` is required by ADR-010 for the self-hosted
// container and must be OFF on Vercel, whose own onBuildComplete hook reads
// .next/next-server.js.nft.json and fails with ENOENT when standalone moves it.
// That failure is invisible to every other check here: it needs the platform.
// These two assertions are the only thing standing between a green local suite
// and a production build that dies after compiling successfully.

let counter = 0;
async function loadConfig(vercel: string | undefined): Promise<NextConfig> {
  const previous = process.env.VERCEL;
  if (vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = vercel;
  try {
    // Fresh module each time: the config reads the environment at load.
    const loaded = await import(`../next.config.ts?eng012=${counter++}`);
    return loaded.default as NextConfig;
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
}

test("self-hosted builds emit standalone output, which ADR-010 depends on", async () => {
  const config = await loadConfig(undefined);
  assert.equal(config.output, "standalone");
});

test("Vercel builds do not, because its build hook cannot find the trace file", async () => {
  const config = await loadConfig("1");
  assert.equal(config.output, undefined);
});

test("output file tracing still points at the workspace root in both cases", async () => {
  // Echo is an npm workspace with hoisted dependencies; tracing from echo-web-app
  // emits a bundle whose imports resolve to nothing. That is invisible at build
  // time and appears only when the emitted server is started, which is what
  // scripts/selfhost.test.mjs does.
  //
  // ENG-018. This asserted `endsWith("echo")` until the checkout's *name* was
  // the thing under test, which no requirement anywhere depends on. A git
  // worktree lives at `.claude/worktrees/<branch>`, so the assertion failed
  // there while `next.config.ts` was correct — it derives the root from
  // `import.meta.url` and resolves properly wherever the checkout sits. The cost
  // was not cosmetic: `npm run check` could not pass in any worktree, so every
  // agent had to verify in the one shared checkout, and a clean install in one
  // session deleted the dependency tree another was reading from.
  //
  // What the root has to *be* is the directory whose package.json declares the
  // workspaces — that is what hoists dependencies into its node_modules, and it
  // is the whole reason tracing from echo-web-app breaks. Asserting that is stricter
  // than the old check, which a directory named `echo` anywhere would satisfy.
  const appDirectory = path.resolve(fileURLToPath(import.meta.url), "..", "..");
  for (const vercel of [undefined, "1"]) {
    const config = await loadConfig(vercel);
    const root = config.outputFileTracingRoot;
    assert.ok(typeof root === "string" && root.length > 0, `tracing root missing when VERCEL=${vercel}`);

    let manifest: { workspaces?: unknown };
    try {
      manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { workspaces?: unknown };
    } catch {
      assert.fail(`tracing root has no package.json when VERCEL=${vercel}: ${root}`);
    }
    assert.ok(
      Array.isArray(manifest.workspaces) && manifest.workspaces.includes("echo-web-app"),
      `tracing root is not the workspace root when VERCEL=${vercel}: ${root}`,
    );
    // And this app must sit inside it, so tracing actually covers the code being
    // built rather than some other workspace root further up the filesystem.
    assert.equal(path.resolve(root, "echo-web-app"), appDirectory, `tracing root does not contain this app when VERCEL=${vercel}`);
  }
});
