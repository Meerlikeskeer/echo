import test from "node:test";
import assert from "node:assert/strict";
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

test("output file tracing still points at the repository root in both cases", async () => {
  // Echo is an npm workspace with hoisted dependencies; tracing from apps/web
  // emits a bundle whose imports resolve to nothing.
  for (const vercel of [undefined, "1"]) {
    const config = await loadConfig(vercel);
    assert.ok(config.outputFileTracingRoot?.endsWith("echo"), `tracing root wrong when VERCEL=${vercel}`);
  }
});
