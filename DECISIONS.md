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

**Status:** Accepted; validated on Chrome 150 and Safari 26.4 · **Date:** 2026-09-06 · **Amended:** 2026-09-08 · **Task:** WEB-003

**Context:** Arbitrary MediaRecorder data events are not independently playable audio files. WEB-003 needs complete chunks and explicit overlap without selecting storage or workers.

**Decision:** Rotate independent recorders over one stream, briefly running both during overlap. Preserve actual monotonic offsets, ordering, codec and checksums in browser-memory metadata. Keep the one-minute prototype cap. After stopping, process each chunk through the existing guarded endpoint and retain separate results; stop on processing failure. Storage, durable deduplication, incremental processing and overlap stitching remain later tasks. ENG-005 uses a separate models-list authentication probe with no inference content.

**Consequences:** Overlap consumes extra encoding work and duplicates speech until WEB-006. No database, storage, authentication, provider or hosting decision changes.

**Amendment, 2026-09-08 — validated, and overlap is now mandatory.** The relay was confirmed on Chrome 150 and Safari 26.4: two `MediaRecorder` instances recording concurrently on one `MediaStream`, every container decoding independently, every checksum matching, overlap drift 0–4.8 ms against a ±250 ms tolerance. The simultaneous-encoder assumption holds in both engines.

Validation also established that **overlap cannot be optional**. `MediaRecorder` does not begin capturing when `start()` returns, and the lag is an engine difference of roughly thirty times: Chrome 150 takes **61–82 ms**, Safari 26.4 takes **0–2 ms**. With zero overlap, Chrome's outgoing recorder stops about 52 ms before the incoming one begins and that speech is captured by nothing — 13,920 ms of audio recovered from a 14,006 ms session. Safari loses nothing. A zero-overlap setting is therefore correct on one browser and lossy on another, and behaves correctly on whichever browser a developer happens to use, which is the worst failure shape available. Native recorder *state* timing reports the handoff as sound; only `start`/`stop` event windows expose the loss.

The recorder no longer offers zero overlap, and a test asserts every offered value is at least 1000 ms. `captureSession` still accepts `overlapMs: 0`, because the port itself is not wrong — the product choice is. WEB-006 stitching cannot recover audio that nothing recorded, so this must stay a capture-time guarantee rather than a downstream repair.

## ADR-012 — Browser-local durable queue (WEB-004)

**Status:** Accepted for implementation; owner acceptance pending · **Date:** 2026-09-08

**Context:** ADR-003 requires local queuing, but WEB-003 keeps chunks in memory. This resolves only the browser queue candidate in Architecture, not its deliberately open server object/audio storage decision.

**Decision:** Use native IndexedDB, with no dependency. Store each complete Blob, existing AudioChunk metadata and processing state in one transaction keyed by `(sessionId, id)`, with a unique `(sessionId, sequence)` index. Resolve writes on transaction completion, request strict transaction durability, verify checksums before writes and after recovery. Equal offers are idempotent; conflicting identities or sequence slots are rejected. Sort recovered chunks and surface gaps. A capture completion callback persists containers as they finish; failure stops further capture and keeps available audio for export/retry.

**Alternatives:** localStorage is synchronous, string-only and too small for audio; sessionStorage/memory do not survive closed tabs. Cache Storage stores responses but lacks atomic Blob/metadata/state transactions and unique indexes. OPFS fits large files but would need a separate transactional metadata journal. IndexedDB meets this bounded queue's requirements without that complexity. No service, package, server database, object store or background worker is selected. This is portable across Vercel and self-hosted origins; moving origin does not move browser data.

**Capacity and eviction:** Chrome documents an origin ceiling up to 60% of disk, with lower private-mode limits; estimates are advisory and storage pressure can evict best-effort origins ([Chrome guidance](https://web.dev/articles/storage-for-the-web)). Safari 17+ documents up to 60% in browser apps / 15% in embedded apps, with overall limits, pressure and inactivity eviction; persistence is heuristic ([WebKit policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). These are ceilings, not reservations. Request `navigator.storage.persist()` on user recording action and display the actual grant; neither a grant nor a transaction commit protects against user clearing data, device loss or all power failures. Private browsing is temporary. Other engines use their own quota policies; never assume a numeric allowance.

Echo imposes a conservative 64 MiB audio budget and warns with less than 4 MiB remaining (also considering origin estimates). This reserves over two minutes at the measured Safari ~204 kbps, including overlap and headroom, rather than sizing from Chrome's ~128 kbps. Check actual Blob sizes; never rely on bitrate estimates to authorize a write. On QuotaExceededError or aborted writes, stop capture, report local-unsaved audio, preserve prior commits and offer download. Never evict to make space.

**Retry and retention:** Persist pending/attempt/backoff/result state. Serialize drains across same-origin tabs using Web Locks; fail closed for automatic processing when locks are unavailable. Retry while the page is active, after reconnect/reload, with capped backoff. Reuse existing chunk identity; completed local results skip later requests. The stateless endpoint cannot guarantee exactly-once provider execution after a lost HTTP response; retries can repeat processing, but never create a second local chunk/result. No server durable-copy claim is made. All raw Blobs remain local even after HTTP 200; no deletion API is implemented because RET-002 through RET-006 cannot yet be satisfied.

**Limits:** Mobile backgrounding may suspend capture, transactions, timers and network; closed pages cannot upload. Only committed complete containers survive; the active unfinished container can be lost on abrupt termination. An offline hard navigation still needs the application shell available; this task persists data, not an authenticated service-worker shell. Reopen the same origin when reachable to recover. Physical mobile background, termination, disk pressure and private-mode behavior require owner testing.

## ADR-013 — Echo binds loopback only; mobile waits for a deployed origin

**Status:** Accepted · **Date:** 2026-09-08 · **Task:** ENG-009 · **Supersedes:** the `dev:lan` half of ENG-008

**Context:** ENG-008 added `npm run dev:lan`, which served the development server over HTTPS on `0.0.0.0` so a phone on the same Wi-Fi could reach Echo and satisfy WEB-003's remaining mobile acceptance check. It was opt-in, separately named, and never run. The owner reviewed it and declined the exposure: a development server that holds owner credentials and opens a live microphone should not be reachable from whatever network the laptop has joined — campus, café or otherwise. The access gate is not the mitigation being questioned; being on the network at all is.

The deeper problem is sequencing. Mobile capture was being treated as an acceptance requirement for tasks whose product path is not yet deployed or proven, which made a security-relevant exposure look like a prerequisite for finishing ordinary work.

**Decision:**

1. **Echo binds `127.0.0.1` and nothing else.** `dev` and `start` keep the loopback bind and no script binds another interface. Reaching Echo from a second device is a property of a **deployed** origin with a real certificate, never of the development server. The container image (`Dockerfile`) still sets `HOSTNAME=0.0.0.0` because a container binds inside its own namespace and its publication is the operator's explicit choice; that is not the same as a laptop listening on a shared LAN.

2. **Mobile capture is paused as an acceptance requirement.** No current task is blocked on a physical phone. WEB-003 and WEB-004 keep their mobile items as *deferred*, not *outstanding*, and neither counts as incomplete for lacking one. Mobile acceptance returns as its own task once the laptop path is deployed and working end to end, and it will then run against that deployed HTTPS origin.

3. **The secure-context guard stays.** `apps/web/src/lib/recording/secure-context.ts` and its tests are kept. It was written alongside `dev:lan` but does not depend on it: it refuses capture before the microphone opens on any origin lacking `crypto.subtle`, which is exactly the ADR-010 self-hosted-over-plain-HTTP case that deployment work will meet. Only its advice changed, from `npm run dev:lan` to loopback or a properly served origin.

**Consequences:** Recording can be exercised only on the machine running Echo until deployment exists, so WEB-003's manual microphone checks and WEB-004's browser acceptance are desktop-only for now. That is accepted. Deployment moves ahead of mobile in priority; ADR-008 (Vercel) and ADR-010 (portability) already govern how it is done and neither changes here. No dependency, framework, host or storage decision is made or reversed by this ADR.

**Reversing this needs an ADR, not a convenience commit.** Re-adding a script that binds a non-loopback interface, or reinstating mobile as a blocking acceptance criterion before a deployed origin exists, is a reversal of this decision and must be recorded as one. A test in `apps/web/tests/secure-context.test.ts` asserts that no user-facing refusal message advertises such a script.

## ADR-014 — Deployments are explicit; a push does not deploy

**Status:** Accepted · **Date:** 2026-09-08 · **Task:** ENG-010 · **Refines:** ADR-008

**Context:** Vercel's default behaviour is to build and deploy on every push to a connected repository, including every branch and every preview. Echo is developed by more than one agent working on separate branches, several pushes to a task branch in an hour is normal, and the account is on a free plan with a finite build allowance. The default therefore converts ordinary version-control activity into consumption of a limited resource, and the failure lands at the worst possible moment: the allowance runs out mid-day, and the deployed origin — the thing WEB-004's queue and mobile acceptance both depend on — becomes unavailable for reasons that have nothing to do with the code.

**Decision:** Deployments are triggered explicitly, never by a push. `vercel.json` sets `git.deploymentEnabled` to `false`, so a connected repository produces no automatic build for any branch. Deploying is `npx vercel` for a preview and `npx vercel --prod` for production, run deliberately by the owner. `scripts/deployed-smoke.mjs` verifies whatever was deployed, and it is unaffected by this: it takes a URL and asserts on HTTP behaviour.

**Consequences.** The deployed origin can lag `main`, so *deployed* and *merged* are now different states and neither implies the other — check which commit is live before drawing conclusions from a deployed origin. The workflow recorded in ADR-008 and `ARCHITECTURE.md`, feature branch → preview → verification → merge → production, still holds; the preview step becomes a command rather than a side effect of pushing. CI is untouched: `.github/workflows/pull-request.yml` still runs `npm run check` and the container job on every push, so nothing about verification weakens, and the build allowance is spent only where it buys something.

**Rejected: leaving the default on and rationing by discipline.** The cost is paid by whoever pushes, not by whoever decided, and an agent following ordinary version-control instructions would spend the allowance without ever seeing it. A setting in version control is checkable; a habit is not.

**Reversing this needs an ADR.** Turning `deploymentEnabled` back on, per-branch or globally, is a reversal of this decision and must be recorded as one — including the reasoning about the plan's allowance that made it safe.

## ADR-015 — Per-task status files; STATUS.md holds only what is shared

**Status:** Accepted · **Date:** 2026-09-08 · **Task:** ENG-014 · **Refines:** the `STATUS.md` convention established by ENG-003

**Context:** `STATUS.md` is the one file every session reads, and its update protocol requires **every** task to write the same three regions: the *In flight* section, one row of a shared task table, and the verification snapshot. Git merges cleanly when branches touch different regions of a file and conflicts when they touch the same ones, so the protocol did not merely permit collisions — it mandated them. The measurements at the time of this decision: **29 of the 61 commits on `main` touched `STATUS.md`** (48%), and the two volatile sections were **92 of its 192 lines** (also 48%). Half the file was the half everyone had to rewrite.

The cost was not usually visible as conflict markers. It was paid instead by **stacking branches to avoid the conflict** — DOC-003 under ENG-013 under DOC-004 under ENG-014, four deep — which `AGENTS.md` separately warns against, because a stacked branch inherits the review burden of its base and cannot be reverted alone. One rule in the repository was pushing directly against another.

A second, quieter failure came from the same shape. Because the *In flight* section was shared and append-friendly, finished work accumulated in it instead of being moved somewhere durable. It reached 51 lines and simultaneously contained a paragraph reading "provisioning started, nothing deployed yet" and, three paragraphs later, "ECHO IS DEPLOYED". A session reading top to bottom would have believed the first.

**Decision:** `STATUS.md` keeps only content that is genuinely shared and changes rarely — the reading map, the vocabulary, what exists and does not exist, the verification **floor**, and the update protocol. The three volatile regions move:

1. **In flight → `status/in-flight/<TASK-ID>.md`,** one file per active task, created before work starts and **deleted in the pull request that finishes the task.** Separate files never conflict. Deletion on merge is what prevents the rot described above, so anything durable must be moved to a source-of-truth document *before* the file is deleted.
2. **The verification snapshot splits in two.** The **floor** — currently 72 unit, 7 production HTTP, 4 self-host parity, 16 controller — stays in `STATUS.md`, changes rarely, and changes deliberately: a count going down is still a regression, not a cleanup. The **numbers from a particular run** belong to the task that ran them, and go in its in-flight file and its pull request body.
3. **The task table is generated, not written.** `scripts/status-table.mjs` builds it from the `**Status:**` lines already present in each `TASKS.md` entry, and `npm run check` fails when the committed table does not match. `TASKS.md` was already the source of truth for task state; the table was a hand-maintained copy of it, and a copy that fifteen branches all edit is a conflict generator with no compensating benefit.

**Consequences.** Parallel branches stop competing for `STATUS.md`, which removes the main reason to stack branches and makes "branch from `main`" the easy path rather than the expensive one. `STATUS.md` gets shorter and stops carrying stale narrative, so the file every session is required to read stays cheap to read — the reason ENG-003 created it. Task state now has exactly one writable home, `TASKS.md`, and one generated view. The cost is one more directory and a script inside `npm run check`; that check is what keeps the generated table honest, so weakening or removing it is not a cleanup.

**What does not change.** `STATUS.md` is still the first thing every session reads and still the only file every session must read. The update protocol still applies in full: record before starting, keep it current, and a task is still not done until its `TASKS.md` handoff says so. The counts are still a floor. None of the version-control discipline in `AGENTS.md` is relaxed — this ADR changes where status is written, not whether it is.

**Rejected: a union merge driver on `STATUS.md`.** Marking the file `merge=union` in `.gitattributes` makes Git take both sides instead of failing. That suits an append-only changelog. `STATUS.md` is edited, not appended — rows are flipped, paragraphs are corrected, stale claims are deleted — and a union merge would silently keep both the old claim and its correction. Applied to the example above, it would have preserved "nothing deployed yet" alongside "ECHO IS DEPLOYED" and reported success. Turning a loud failure into a quiet wrong answer is the wrong trade for a file whose purpose is to be believed.

**Rejected: relaxing the update protocol instead.** The discipline is not the problem and it was expensive to learn — `main` once fell fourteen commits behind, and a Route Handler was once excluded from every commit while every check passed green. Those rules stay. The file layout was an incidental choice from ENG-003, not one of those lessons, and it is the part that was generating friction.

**Reversing this needs an ADR.** Moving *In flight* back into `STATUS.md`, or hand-maintaining the task table again, reverses this decision and must be recorded as one.

## ADR-016 — Upload during capture, and a chunk-identity job ledger

**Status:** Accepted for implementation · **Date:** 2026-09-08 · **Task:** WEB-005 · **Refines:** ADR-012

**Context:** REQ-003 asks for two things — upload and transcribe *while recording continues*, and retries that *do not duplicate chunks or jobs*. WEB-004 deliberately delivered neither, and said so. It drains the queue only after capture stops (`useAudioQueue.sync()` returns early while capture is active), and ADR-012 records the honest limit on the other half: *"The stateless endpoint cannot guarantee exactly-once provider execution after a lost HTTP response; retries can repeat processing, but never create a second local chunk/result."*

Both restrictions were correct for a task whose subject was durable storage. Both are now the task.

The second one is the harder half. `POST /api/recordings` holds no state between requests, so a response lost in transit — a timeout, a suspended tab, a dropped connection after the provider has already answered — is indistinguishable, from the client, from a request that never arrived. The client must retry, because retrying is what durability means. The provider then transcribes the same audio twice. The wasted vendor call is the smaller cost. The real cost is that two transcriptions of one chunk can differ, so *"what is this chunk's transcript"* stops having a single answer, and WEB-006 has to stitch a session whose parts are not stable.

Fixing that properly needs a ledger that survives the process. A durable ledger means a database, and `ARCHITECTURE.md` lists the relational database as **Open** with an explicit instruction not to choose one silently. A retry bug is not a good reason to settle the database question sideways.

**Decision:**

1. **Uploads run during capture.** The queue drains as soon as a container is durably committed, not when the session ends. The `echo-audio-queue-drain` Web Lock still admits one drainer per origin, so two tabs cannot double-send, and the drain stays sequential, so at most one upload is ever in flight. Persistence keeps absolute priority: capture never waits on an upload, and an upload failure never stops capture.

2. **A failing chunk no longer blocks the ones behind it.** The drain currently stops at the first send failure, which converts one unlucky chunk into a stalled session. It now continues past a failed entry and returns to it on its own backoff schedule. It still stops immediately when the browser goes offline or the page is unmounted, because continuing there is pointless rather than merely slow.

3. **Retry is bounded.** An entry that has exhausted its attempts becomes `blocked` with a reason the owner can read, instead of retrying forever against a provider that is never going to accept it. An explicit owner-initiated retry still overrides that.

4. **`uploading` is a persisted state, not an in-memory one.** ARCHITECTURE's *Offline and security* section already requires Echo to distinguish local-only, uploading, verified and processed. A page that dies mid-upload must be recoverable as *"this chunk was in flight and we do not know the outcome"* — which is exactly the state the ledger exists to resolve. On recovery a stale `uploading` entry returns to `pending` and is retried; the ledger, not the client, decides whether that retry costs a provider call.

5. **A `JobLedger` port, keyed by chunk identity.** The key is `sessionId/id/checksum` — content-addressed, and made of fields the Route Handler already validates against the uploaded bytes. Three outcomes: a **replay** returns the stored result without touching a provider; a **join** attaches to a job already in flight for the same key rather than starting a second one; a **claim** proceeds to the providers as today. A replayed response says so, in a field the client and the tests can see, because an answer that is silently identical is an answer nobody can verify.

6. **One adapter: in-process, bounded, no dependency and no platform service.** A `Map` with a capped entry count and a time-to-live. It is portable in the ADR-010 sense — identical behaviour on Vercel and in the self-hosted container — because it is just memory in the process that is already handling the request.

7. **Requests without chunk metadata are not ledgered.** The WEB-002 single-clip path has no identity to key on and is left exactly as it is.

**What this does not promise, stated plainly.** This is **not exactly-once.** A cold start, a redeploy, a second Fluid Compute instance answering the retry, or a TTL expiry each lose the ledger, and the retry then costs a provider call exactly as it does today. What it closes is the *common* window — a retry seconds after a dropped response, on the instance that just handled it — which is the case a suspended tab and a flaky connection actually produce. Exactly-once needs a ledger that outlives the process, which is the database decision, and that decision stays **Open**. This ADR narrows ADR-012's limitation; it does not reverse it, and ADR-012's sentence remains true as written.

**A ledger entry is not a durable copy of anything.** It holds a result, not audio, in memory, for minutes. RET-002 is untouched: nothing here can authorize deleting a raw chunk, and no HTTP response — replayed or fresh — becomes evidence of a verified remote copy.

**Privacy note.** The ledger holds transcript text in process memory for its TTL. The process already holds that text to answer the request; this widens the window from one request to a few minutes. It is never written to disk, never logged, and never keyed by anything an unauthenticated caller can produce — the endpoint's own owner gate runs first, unchanged.

**Alternatives rejected:**

- **A durable ledger now, in Postgres or a KV store.** This is the correct end state and it settles the Open database decision as a side effect of fixing a retry bug. Rejected on sequencing, not on merit.
- **Vercel KV, Queues or Workflow.** Platform-specific primitives, which ADR-010 forbids without an answer for self-hosted deployments. The in-process adapter needs no such answer.
- **A client-supplied `Idempotency-Key` header.** The conventional shape, and here a strictly weaker one: a client-chosen key is not derived from the bytes, so the same key carrying different audio reads as a replay. Chunk identity already exists, is already validated against the upload, and already makes that case a conflict.
- **Not retrying after an ambiguous response.** Discards results to avoid duplicating work, which is the wrong trade for a note taker whose whole promise is that a recording survives.

**Consequences.** Provider spend and result stability both improve in the ordinary case, and neither is guaranteed in the adversarial one. `ARCHITECTURE.md`'s WEB-004 boundary line *"uploads … run after capture"* is superseded by this ADR and updated in the same change. The database decision keeps its **Open** status and now has a named consequence attached to it: the first thing a durable store buys Echo is exactly-once chunk processing. Reversing decision 1 or 5 — draining only after capture again, or removing the ledger — needs an ADR.

## ADR-017 — Conservative transcript stitching and capture completion evidence

**Status:** Accepted for implementation · **Date:** 2026-09-08 · **Task:** WEB-006 · **Refines:** ADR-012

**Context:** Incremental results can arrive out of order. A contiguous prefix of saved chunks does not establish that capture finished: a crash can lose the last container. Provider timestamps already use session milliseconds, and broad segment timestamps do not establish when individual words were spoken.

**Decision:** Derive a session transcript in a pure domain module from original chunk metadata and transcripts. Order by sequence and session timestamps. Remove duplicated overlap only when matching source segments lie wholly in the measured overlap and their timing agrees; preserve ambiguous or unmatched speech, including text absent from provider segments. Never fabricate word times or remove repeated speech outside overlap. Keep original transcripts and references to all source segments, including both sources of collapsed duplicate text.

Add a completion record to the existing browser-local IndexedDB queue, listing the expected chunk metadata after a successfully stopped capture. Upgrade the database without replacing existing audio or processing rows. Validate the manifest and saved chunks before committing it, and expose it only after transaction completion. Failed capture, a failed completion write, or legacy recovered chunks without a manifest remain partial. A manifest records successful capture, not successful transcription: finalization additionally requires every expected chunk and valid transcript, with no gaps or conflicts.

Render one derived session transcript with partial/final status and readable gaps. Recompute it as results arrive or recover; do not store a second mutable transcript cache. Existing generated notes remain explicitly per-chunk; session-wide artifacts belong to WEB-007. No database service, provider, dependency, background worker, retention change or remote durability promise is introduced.

**Tradeoff:** Conservative alignment can leave repeated words visible when timestamps are too coarse to prove duplication. Preserving speech is preferable to silently deleting it. Recovered pre-manifest sessions cannot be retrospectively called complete. Native IndexedDB migration and capture lifecycle verification remain separate evidence from pure domain and rendering tests.

## ADR-018 — A session records until the owner stops it, at a bitrate Echo chooses

**Status:** Accepted for implementation · **Date:** 2026-09-10 · **Task:** WEB-016 · **Refines:** ADR-012, ADR-017

**Context:** Echo stopped every recording after one minute, and three separate limits enforced it: a timer in the recorder, a 60-second ceiling in `validateCaptureOptions`, and a 120-second span ceiling in `isAudioChunk`, which is also the upload boundary's validator. The product is a note taker for lectures and meetings, so a one-minute recording is not a smaller version of the thing — it is a different thing. Two limits made a longer recording unsafe rather than merely unavailable. Browsers pick their own Opus bitrate when none is requested, and Safari 26.4 was measured at 204 kbps; at that rate a five-minute chunk is 7.6 MB against a 4 MB upload limit, and the 64 MiB local audio budget holds about forty minutes.

**Decision:** A session records until the owner stops it, bounded only by a four-hour runaway limit. Chunks are five minutes with five seconds of overlap. Echo requests 32 kbps Opus rather than accepting the browser's default, reads back the rate the recorder says it will use, and shortens the chunk when that rate would put it over the upload limit. A chunk larger than the upload limit is refused in the browser with its own reason instead of retried over the network. The local audio budget rises to 256 MiB, so the binding constraint becomes the browser's own quota. The screen wake lock is held while a session records, as one more defence and never as something correctness rests on.

**Tradeoff:** Five-minute chunks mean a chunk lost to a refused upload costs five minutes rather than one, and the first transcript now appears five minutes in rather than one. Five seconds of overlap will usually appear twice in the stitched transcript, because ADR-017's deduplication needs identical segment timing and two separate transcription calls rarely produce it — visible repetition over dropped speech, as ADR-017 chose. 32 kbps is speech-transparent and not music-transparent; Echo is a note taker. The wake lock is unavailable in some browsers and refused in a background tab, so a long recording still depends on the tab staying open.

## ADR-019 — Session notes are a lecture guide, and an over-long transcript is refused rather than truncated

**Status:** Accepted for implementation · **Date:** 2026-09-10 · **Task:** WEB-017 · **Refines:** ADR-009, ADR-017

**Context:** The session artifact schema was a meeting summary — title, summary, key points, action items, research topics — and a lecture flattened into it loses the argument, the terminology as the speaker uses it, and what was left unresolved. Two separate bounds also made a lecture impossible rather than merely poorly served: `isRevisionInput` refused a transcript over 24,000 characters with `400 bad_request`, and both generators truncated with `slice(0, MAX_TRANSCRIPT_CHARS)` and reported nothing, so notes could describe the first third of a session with no sign the rest existed. The stitched transcript's gaps reached the endpoint and were dropped before generating.

**Decision:** `SessionArtifacts` gains a course or subject identified only from the recording itself and null otherwise, an outline of sections carrying the session's substance in order, terminology defined as the speaker defined it, and open questions. Nested objects are validated as strictly as the flat fields, unknown keys included. The transcript bound rises to a session-sized one and **the port refuses past it** rather than truncating: Echo sends the whole transcript and lets the configured model refuse what it cannot take, because a refusal is visible and a truncation is not. Gaps and partial status are stated to the generator, before the transcript, as Echo's own words about Echo's own data. Both route handlers declare `maxDuration` rather than inheriting a platform default.

**Tradeoff:** A larger transcript costs more per generation and takes longer, and a model with a small context window now fails loudly on a long session where it used to succeed on a third of one — which is the point, and is why the notes model's context window becomes a real configuration constraint (`env.example` says so). A richer schema is more for a provider to get wrong, so one malformed section costs the whole set of notes; the validator's problem list keeps naming fields and reasons and never values. The vendor remains undecided (ADR-009): nothing here names one in code.

## Open decisions

Echo has deliberately **not** chosen the following. Do not silently pick one; make the choice through its implementation task and record it as an ADR.

- **Relational database:** undecided. PostgreSQL is the expected direction, but it is not an approved final choice. ADR-016 names the first thing it buys: a job ledger that outlives the process, and with it exactly-once chunk processing.
- **Object/audio storage:** undecided. Large audio must not be stored in relational database rows; object/blob storage will likely be required. Constrained by ADR-010: prefer an S3-compatible interface so self-hosted deployments can satisfy it.
- **Transcription provider:** prototype default selected in ADR-009 and marked Temporary; the permanent vendor remains undecided. Kept behind `TranscriptionProvider`.
- **LLM / notes-generation provider:** prototype default selected in ADR-009 and marked Temporary; the permanent vendor remains undecided. Kept behind `NotesProvider`.
- **Diarization provider:** undecided. Kept behind a separate session-scoped `DiarizationProvider` (ADR-009). Depends on object storage; not required before WEB-005.
- **Background job and long-running processing infrastructure:** undecided; see ADR-008 for when a split becomes justified, and ADR-010 for the constraint that the chosen mechanism must be self-hostable.
- **Production authentication:** undecided. The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final authentication architecture.

Also select supported mobile browsers/codecs, chunk/overlap durations, the retention warning grace period and pressure threshold, and research scope during their implementation tasks. Record measurements before promising latency or capture range.

## ADR-020 — Conservative lecture recovery and guide persistence

**Status:** Accepted for implementation · **Date:** 2026-09-10 · **Task:** WEB-018 · **Refines:** ADR-018, ADR-019

The owner requested repair of the reviewed lecture reliability defects. Default session containers are one minute, with thirty-second containers when bitrate is unknown, to reduce the normal unsaved tail. The four-hour runaway deadline belongs to the capture engine. An impossible reported bitrate is refused; reported rates never guarantee encoded size. Storage headroom uses actual saved bytes per recording time, overlap, unfinished audio and a reserve. Browser suspension can still defer capture timers, so foreground operation and backup recording remain required for acceptance.

Gap descriptions carry chunk bounds only from validated chunk metadata or completion manifests; bounds identify affected chunks, not exact missing speech within overlaps. Missing transcription is distinguished from absent local audio. Both gap timing and the text sent to generation participate in transcript revision identity.

Transcription and per-chunk notes deadlines are 90 and 180 seconds, fitting together below the 300-second route allowance. Session guide generation has 240 seconds. Browser requests allow 310 seconds, so the route can return a readable provider timeout first.

Validated guides are stored in a separate browser-local IndexedDB store keyed by session and transcript revision. This introduces no provider or server durability claim, does not migrate or delete audio, and cannot make an older revision appear current. A failed guide write leaves the displayed result downloadable and raises a warning. Real browser recovery and full-lecture acceptance remain separate from synthetic evidence.


## ADR-021 — Board-hosted diagnostics for the XIAO ESP32S3 Sense

**Status:** Accepted for implementation · **Date:** 2026-09-25 · **Task:** WEB-019 · **Extends:** ADR-007, ADR-008

**Context:** The owner has received the hardware and explicitly requested a local
ESP32 console followed later by Echo recording and a Mac receiver. On this date
the owner chose to keep the firmware in the existing Echo repository. This opens
a limited hardware bring-up phase alongside the web work, superseding the earlier
blanket hardware deferral for this diagnostic task. Next.js cannot run on this
microcontroller; the approved web application stack remains in apps/web.

**Decision:** Store the PlatformIO project in firmware/echo-device. Use C++ and
the Arduino ESP32 framework delivered by the pinned espressif32 7.1.3 platform.
Use its bundled drivers and WebServer to serve a small self-contained HTML/JS
console from device flash. This is an embedded diagnostic surface, not a second
application backend, web framework, hosting provider, or replacement design system.
Camera and microphone tests require deliberate activation. The device creates
a password-protected local Wi-Fi access point; a per-device password is saved in
NVS and displayed only through the USB serial console for provisioning. Anyone
with that password is trusted to operate the bench console; no internet exposure
or production authentication claim is made. Application logs in RAM exclude that
password and recording contents. Driver/boot/crash output remains on USB.

**Limits:** No Echo API integration, automatic audio retention, battery monitoring,
Mac app, OTA flashing, arbitrary pin controls or cloud service is introduced. BLE
is a nonconnectable test beacon, not a paired control/data interface. The SD
readback test is not durable-copy evidence for Echo's retention rules. GPIO21 is
reserved for SD chip-select rather than exposed as an LED toggle. Camera preview
and microphone recording are exercised separately. Build and simulated UI tests
do not establish physical peripheral function; hardware acceptance remains pending.
