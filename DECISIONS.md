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

## ADR-009 — Provider ports and prototype transcription/LLM vendors

**Status:** Accepted · **Date:** 2026-09-06 · **Accepted:** 2026-09-06, at the start of WEB-002

**Context:** WEB-002 requires working transcription and notes generation, but `ARCHITECTURE.md` lists both vendors as **Open** and forbids choosing one silently. REQ-009 additionally promises user-supplied keys, explicit disclosure of every external processor, and self-hosted operation, so the choice must not be structural. Evaluation of the current market found that the OpenAI `/v1/audio/transcriptions` and `/v1/chat/completions` request shapes are a de-facto interop standard spoken by hosted vendors (Groq, Cerebras, Mistral, OpenRouter, OpenAI) and by self-hosted servers alike (`speaches`, `faster-whisper-server`, `whisper.cpp`, WhisperX API servers, vLLM, llama.cpp, Ollama).

**Decision:**

- **Adopt those two wire formats as Echo's provider ports.** A single `openai-compatible` adapter per port serves both hosted and self-hosted deployments; switching between them is a base-URL change, not a code change.
- **Select Groq as the prototype default**, marked **Temporary**: `whisper-large-v3-turbo` for transcription and an open-weight chat model for notes. Rationale is the REQ-006 latency target, a free tier sufficient for single-owner prototyping, and a self-serve zero-data-retention setting.
- **Name WhisperX with `pyannote` `speaker-diarization-community-1` as the self-hosted tier**, reached through an OpenAI-compatible server shim. It is documented as the private-first target; it is **not** approved infrastructure by this ADR, because it requires a GPU host (see ADR-010).
- **Define diarization as a separate, session-scoped `DiarizationProvider`**, not a per-chunk flag on `TranscriptionProvider`. Diarization assigns speaker labels per input file with no cross-file consistency, so a per-chunk pipeline cannot produce globally coherent speakers.
- **Prefer open-weight models for notes generation** where quality permits, so the same weights remain runnable locally.
- **Every provider exposes a machine-readable capability and disclosure descriptor.** External-processor disclosure required by REQ-009 is derived from that data, not from prose that can drift.

**Consequences:**

- Vendor switching becomes configuration for the whole OpenAI-compatible ecosystem. Vendors outside it (AssemblyAI, Deepgram) require their own adapters behind the same port.
- Diarization is unavailable in the prototype default. When added it runs as a finalization pass over whole-session audio, so it depends on object storage existing and follows WEB-005 rather than accompanying WEB-002.
- WEB-002 needs no database, object storage, background worker, or production authentication: a 30–60 second Opus clip is well under one megabyte and is handled by a single Route Handler request. Those decisions stay **Open**.
- Groq's zero-data-retention setting is off by default; enabling it becomes a documented setup step, and a provider must report retention as unknown until an operator confirms it.
- Free-tier token limits do not admit single-request summarisation of a multi-hour transcript. WEB-007 must be designed as map-reduce over chunk summaries.
- `TRANSCRIPTION_BASE_URL` and `LLM_BASE_URL` are added to configuration; without them the wire-format choice buys nothing.
- Selecting a specific default vendor is reversible by configuration, but this ADR must be amended if the port contract itself changes.

## ADR-010 — Deployment portability: Vercel is a target, not a runtime

**Status:** Accepted · **Date:** 2026-09-06 · **Accepted:** 2026-09-06, at the start of WEB-002 · **Amends:** ADR-008

**Context:** Evaluating self-hosted transcription raised the question of whether Echo should move off Vercel. Investigation showed the premise does not hold in the direction assumed: the reason WhisperX cannot run "on Vercel" is that it needs an NVIDIA GPU, PyTorch and multi-gigabyte weights, and no general-purpose application host — Vercel, Railway, Render, Fly.io or a Coolify VPS — provides a GPU by default. GPU inference is a separate HTTP endpoint under every option, so changing application host does not obtain it. Nothing is currently deployed, so there is also nothing to migrate.

A different and real risk was identified instead. REQ-009 makes self-hosted deployment an architectural baseline, and ADR-008 selected Vercel without recording what that means for the promise. Next.js itself self-hosts cleanly through `output: 'standalone'` and a container. The exposure is not the host; it is platform-specific primitives entering application code. WEB-004, WEB-005 and WEB-010 will need durable queues, scheduled work and object storage, where the convenient answers are Vercel Queues, Vercel Workflow, Vercel Cron and Vercel Blob. Each one adopted silently would make Echo undeployable anywhere else while every document continued to claim otherwise.

**Decision:**

- **Vercel remains Echo's primary hosted target and preview-deployment environment.** ADR-008's workflow is unchanged. Do not migrate.
- **Echo must also remain deployable outside Vercel**, as a container running the Next.js standalone server, using only the owner credentials and configuration already documented. Self-host parity is a supported configuration, not an aspiration.
- **Application code targets portable primitives.** Introducing any platform-specific service — managed blob storage, queue, workflow, cron, KV or edge-config binding — requires an ADR that states how self-hosted deployments satisfy the same need. Prefer portable equivalents: S3-compatible object storage over a proprietary blob API, and a queue mechanism with a self-hostable implementation.
- **GPU-backed inference is always reached as an HTTP endpoint** configured by base URL, never co-located with the web application, regardless of host. This holds for hosted GPU services and for a machine on the owner's own network.
- **Verify parity rather than assert it.** A container build and a self-hosted production smoke check join the verification suite under ENG-002, before the platform coupling that would make them expensive exists.

**Consequences:**

- Some Vercel conveniences are deliberately unavailable, and self-hosting requires handling static asset serving, image-optimisation cache and build-time environment variables explicitly.
- The self-hosted verification promised by WEB-012 moves earlier in substance: proving portability is cheapest while the application is a single page and an access proxy.
- The background-worker decision stays **Open**, but is now constrained: whatever is chosen must have a self-hostable implementation.
- Should a future requirement genuinely demand a Vercel-specific primitive, this ADR is amended rather than bypassed.
- This decision costs little today and is the only moment where it is nearly free.

## ADR-011 — Prototype playable chunk capture

**Status:** Implemented on feature branch; browser validation and owner review pending · **Date:** 2026-09-06 · **Task:** WEB-003

**Context:** Arbitrary MediaRecorder data events are not independently playable audio files. WEB-003 needs complete chunks and explicit overlap without selecting storage or workers.

**Decision:** Rotate independent recorders over one stream, briefly running both during overlap. Preserve actual monotonic offsets, ordering, codec and checksums in browser-memory metadata. Keep the one-minute prototype cap. After stopping, process each chunk through the existing guarded endpoint and retain separate results; stop on processing failure. Storage, durable deduplication, incremental processing and overlap stitching remain later tasks. ENG-005 uses a separate models-list authentication probe with no inference content.

**Consequences:** Overlap consumes extra encoding work and duplicates speech until WEB-006. Browser scheduling and simultaneous encoder support require actual browser validation before this task can be marked complete. No database, storage, authentication, provider or hosting decision changes.

## Open decisions

Echo has deliberately **not** chosen the following. Do not silently pick one; make the choice through its implementation task and record it as an ADR.

- **Relational database:** undecided. PostgreSQL is the expected direction, but it is not an approved final choice.
- **Object/audio storage:** undecided. Large audio must not be stored in relational database rows; object/blob storage will likely be required. Constrained by ADR-010: prefer an S3-compatible interface so self-hosted deployments can satisfy it.
- **Transcription provider:** prototype default selected in ADR-009 and marked Temporary; the permanent vendor remains undecided. Kept behind `TranscriptionProvider`.
- **LLM / notes-generation provider:** prototype default selected in ADR-009 and marked Temporary; the permanent vendor remains undecided. Kept behind `NotesProvider`.
- **Diarization provider:** undecided. Kept behind a separate session-scoped `DiarizationProvider` (ADR-009). Depends on object storage; not required before WEB-005.
- **Background job and long-running processing infrastructure:** undecided; see ADR-008 for when a split becomes justified, and ADR-010 for the constraint that the chosen mechanism must be self-hostable.
- **Production authentication:** undecided. The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final authentication architecture.

Also select supported mobile browsers/codecs, chunk/overlap durations, the retention warning grace period and pressure threshold, and research scope during their implementation tasks. Record measurements before promising latency or capture range.
