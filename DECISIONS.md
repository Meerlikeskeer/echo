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
