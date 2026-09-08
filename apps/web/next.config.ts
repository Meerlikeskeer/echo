import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// ENG-002 / ADR-010: `standalone` output is what makes Echo deployable outside
// Vercel. It emits a self-contained server plus only the traced dependencies, so
// a container runs the application without an `npm install` at runtime.
//
// The tracing root must be the repository root, not apps/web. Echo is an npm
// workspace, so dependencies are hoisted to the root node_modules; tracing from
// apps/web would emit a bundle whose imports resolve to nothing. That failure is
// invisible at build time — it only appears when the emitted server is started,
// which is exactly what scripts/selfhost.test.mjs does.
const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  // `next dev` otherwise writes apps/web/AGENTS.md and apps/web/CLAUDE.md on
  // every start. Echo keeps one canonical set of agent instructions at the
  // repository root, so a second nested AGENTS.md would compete with it and
  // reappear as an uncommitted change after every dev run. The one useful point
  // it carried — Next.js 16 differs from model training data, so consult
  // node_modules/next/dist/docs/ — is recorded in the root AGENTS.md instead.
  agentRules: false,
};

export default config;
