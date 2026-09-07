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

## ADR-008 — Vercel deployment, shadcn/ui, and initial Next.js full-stack architecture

**Status:** Accepted · **Date:** 2026-09-06

**Context:** WEB-001 established a Next.js application without recording a deliberate decision about hosting, the UI component system, or where server-side logic belongs. Successive agents were re-deriving these choices per task, risking a second frontend framework, a competing design system, or a premature separate backend service.

**Decision:** Confirm the following as intentional project decisions, canonically recorded in the `Technology Stack` section of `ARCHITECTURE.md`:

- **Vercel is Echo's web deployment target.** Feature branches must stay compatible with Vercel preview deployments: branch → GitHub → preview deployment → manual and automated verification → merge → production. Do not introduce AWS, Railway, Render, Firebase Hosting, or another application-hosting platform without a specific architectural reason and an explicit decision recorded here.
- **Next.js remains the web application framework**, with React and TypeScript as the application foundation and Tailwind CSS as the styling system. Do not introduce a second frontend framework.
- **shadcn/ui becomes Echo's base UI component system**, supplying primitives such as buttons, dialogs, dropdowns, tabs, forms, cards, tooltips, sheets, command/search interfaces, progress indicators, skeletons, and notifications. **Lucide** may supply icons. Echo builds its own visual identity from these primitives rather than adopting default shadcn example layouts or generic SaaS-dashboard patterns; see the UI direction in `PROJECT_CONTEXT.md`. Do not add a second design system without an explicit approved decision.
- **Backend and API functionality remain inside Next.js initially** — Route Handlers, server-side modules, and server-only provider integrations. Do not create a separate Express, FastAPI, NestJS, or microservice backend during WEB-001 or WEB-002 without a demonstrated technical need.
- **Separate processing infrastructure is introduced only when workload requirements justify it.** Long recordings, background transcription, retry queues, diarization, transcript stitching, asynchronous AI processing, durable offline synchronization, and large audio uploads are the likely future triggers. Keep processing boundaries extractable; do not build that infrastructure prematurely.
- **Provider API secrets remain server-side.** Never expose provider credentials in browser bundles or `NEXT_PUBLIC_*` variables.

**Consequences:** shadcn/ui is an approved but not yet installed choice; it enters the repository when a task first needs its primitives, and adding it must not weaken the WEB-001 verification suite. Vercel deployment is documented but not yet provisioned: no project, environment variables, or preview deployments are configured by this decision, and hosted use still requires the owner credentials and HTTPS described in ADR-007. This decision deliberately does **not** select a database, object/audio storage, transcription vendor, LLM vendor, background-job infrastructure, or production authentication; those remain open and are listed below and in `ARCHITECTURE.md`. Changing any decision above requires amending or superseding this ADR before implementation.

## Open decisions

Echo has deliberately **not** chosen the following. Do not silently pick one; make the choice through its implementation task and record it as an ADR.

- **Relational database:** undecided. PostgreSQL is the expected direction, but it is not an approved final choice.
- **Object/audio storage:** undecided. Large audio must not be stored in relational database rows; object/blob storage will likely be required.
- **Transcription provider:** undecided; kept behind a provider abstraction.
- **LLM / notes-generation provider:** undecided; kept behind a provider abstraction.
- **Background job and long-running processing infrastructure:** undecided; see ADR-008 for when a split becomes justified.
- **Production authentication:** undecided. The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final authentication architecture.

Also select supported mobile browsers/codecs, chunk/overlap durations, the retention warning grace period and pressure threshold, and research scope during their implementation tasks. Record measurements before promising latency or capture range.
