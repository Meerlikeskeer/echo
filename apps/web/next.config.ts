import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // `next dev` otherwise writes apps/web/AGENTS.md and apps/web/CLAUDE.md on
  // every start. Echo keeps one canonical set of agent instructions at the
  // repository root, so a second nested AGENTS.md would compete with it and
  // reappear as an uncommitted change after every dev run. The one useful point
  // it carried — Next.js 16 differs from model training data, so consult
  // node_modules/next/dist/docs/ — is recorded in the root AGENTS.md instead.
  agentRules: false,
};

export default config;
