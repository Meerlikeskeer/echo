# Architecture decisions

Repository decisions are authoritative over prior chat context. Amend or supersede an ADR when an explicit owner decision changes it; retain the old rationale.

## ADR-001 — Repository as shared source of truth

**Status:** Accepted · **Date:** 2026-09-06

**Context:** Codex and Claude Code will alternate work without shared chat memory.

**Decision:** Keep product context, architecture, task IDs, and decisions in Git. `AGENTS.md` owns engineering rules; `CLAUDE.md` points to them.

**Consequences:** Each implementation updates relevant docs and includes a handoff. Chat-only decisions are incomplete until recorded.

## ADR-002 — Web first, hardware deferred

**Status:** Accepted · **Date:** 2026-09-06

**Context:** Validate note-taking value before device development.

**Decision:** Plan Next.js + TypeScript + Tailwind with modular packages. Begin with a short recording → transcript → notes. No application scaffold in the foundation pass.

**Consequences:** Browser storage, codecs, and background limitations need explicit testing. Native/device features remain future work.

## ADR-003 — Sessions, chunks, and interchangeable providers

**Status:** Accepted · **Date:** 2026-09-06

**Context:** Long conversations and unreliable networks need recoverable processing; provider lock-in is undesirable.

**Decision:** Model sessions as ordered, overlapping chunks and process incrementally via transcription/LLM/storage/research/reminder interfaces. Queue locally and make retries idempotent.

**Consequences:** Chunk playability, overlap stitching, job state, and recovery require behavioral tests. Exact durations and vendors are undecided.

## ADR-004 — Guarded retention and explicit Keep

**Status:** Accepted policy; provisional defaults · **Date:** 2026-09-06

**Context:** Storage is finite, but automatic deletion must not lose unprocessed or sole-copy audio.

**Decision:** Normal retention is configurable 7–30 days. Propose 14 days as a default; confirm during WEB-010. Age or storage pressure can remove an eligible copy only after transcription, independent surviving-copy verification, delivered warning/grace period, and no Keep authorization. Fail closed on uncertainty.

**Consequences:** This is per-copy cleanup, not global erasure of all raw audio. Verification and cross-device cleanup coordination are necessary. Warning grace period and near-full threshold remain open.

## ADR-005 — Private-first credentials and external actions

**Status:** Accepted · **Date:** 2026-09-06

**Context:** Conversations and user-owned API credentials are sensitive.

**Decision:** Start with single-user/self-hosted configuration and server-only user-supplied keys; support replaceable providers. External research is opt-in; reminder/calendar writes require confirmation.

**Consequences:** No browser-bundled secrets. Hosted multi-user operation needs additional credential storage, authentication, and isolation design before use.

## Open decisions

Select initial providers/models, durable metadata store, background-job mechanism, supported mobile browsers/codecs, chunk/overlap durations, retention warning grace period and pressure threshold, and research scope during their implementation tasks. Record measurements before promising latency or capture range.

## ADR-006 — Separate specialists with a bounded controller

**Status:** Accepted · **Date:** 2026-09-06

**Context:** The owner wants automatic implementation/verification/repair without endless retries or a builder certifying itself.

**Decision:** Use separate builder and checker sessions. The checker owns the tester function with a deterministic command runner. A Python orchestrator allows five builder attempts maximum and immediately stops on regression of any formerly passing check/test. Freeze verification and require independent goal review plus all checks passing.

**Consequences:** Baselines and stable per-test reports are required. Echo's missing app checks block feature runs until configured; controller tests cannot substitute. Changed tests/configuration require a separate reviewed setup change. The initial executable uses Codex CLI, including when launched from Claude's command. It does not auto-commit or deploy, and green is evidence rather than a guarantee of perfection.

## ADR-007 — WEB-001 bootstrap and single-owner access

**Status:** Accepted for bootstrap · **Date:** 2026-09-06

**Context:** WEB-001 requires a runnable private shell and meaningful verification before capture or provider implementation. The owner explicitly requests separate builder/checker roles and disabled agent automation until real reporting works.

**Decision:** Use npm workspaces, current stable Next.js App Router, React, TypeScript and Tailwind/PostCSS, with exact dependency versions and a lockfile. Require server-only `ECHO_OWNER_USERNAME` and a random password of at least 32 characters for all environments. Gate every request with Proxy and independently guard server page rendering. Use single-owner HTTP Basic over HTTPS outside localhost. Run ESLint, generated route types plus TypeScript, synthetic unit tests, a production build, and real production HTTP tests in PR CI. Leave the agent loop disabled until check commands and per-test adapters are verified.

**Consequences:** This provides a narrow private access baseline, not logout/session management, brute-force protection, or multi-user isolation. Those need explicit design before expanding deployment. Future data access/actions must perform their own authorization. No providers or persistent data exist yet. Local production tests require loopback socket access; remote Actions and branch protection remain external setup.

**Numbering note:** `feat/bounded-agent-workflow` and `feat/WEB-001-web-shell` independently authored an ADR-006. Both decisions stand: ENG-001's controller decision keeps ADR-006 and this WEB-001 bootstrap decision was renumbered to ADR-007 during branch integration. No content was discarded.
