# Architecture

## Technology Stack

**This section is the canonical source of truth for Echo's approved technology stack.** `README.md` may carry a shortened summary for developer convenience, but it is not a competing source of truth. Consult this section before introducing any new framework, database, hosting platform, UI library, backend framework, storage provider, authentication system, or major infrastructure service. Approved choices are recorded in ADR-006, ADR-007 and ADR-008 in `DECISIONS.md`.

Entries are marked **Approved** (a recorded decision), **Temporary** (deliberately provisional implementation), or **Open** (intentionally undecided — do not silently choose one).

### Application

| Technology | Responsibility | Status |
| --- | --- | --- |
| Next.js (App Router) | Web application framework: UI rendering, routing, and server-side endpoints | Approved (ADR-007, ADR-008) |
| React | Component model for the user interface | Approved |
| TypeScript | Application language; strict mode, `tsc --noEmit` in CI | Approved |

Do not introduce a second frontend framework.

### Embedded device (WEB-019, WEB-020)

ADR-021 opens a bounded hardware bring-up phase at the owner's request.
`echo-device` is a separate PlatformIO build for the XIAO ESP32S3 Sense:
C++, the Arduino ESP32 framework from pinned espressif32 7.1.3, bundled peripheral
drivers, and a small HTML/JavaScript page served from flash. The existing Next.js
application stack and deployment stay unchanged. The board exposes diagnostics
only over its own password-protected local Wi-Fi network. Read the firmware README
for trust boundaries, pin conflicts, limits and the hardware acceptance checklist.
ADR-023 extends this to general-purpose offline microSD recording and explicit
`.echo` archive import into the existing browser queue. The device never holds
provider keys. The importer validates the complete archive before persistence,
uses stable chunk identities for retries, and records completion only for clean
device stops. Automatic deletion and the native Mac receiver remain future work.

ADR-029 adds deliberate per-session SD erasure from the device console, requiring exact identity and sole-copy acknowledgement. Active capture refuses it; known-file preflight, partial-failure reporting and idempotent retry remain separate from automatic retention. No remote copies are deleted.

### Temporary radio diagnostic (WEB-024)

ADR-026 permits a standalone macOS Swift CLI using bundled CoreBluetooth/Foundation under `tools/radio-test`. It tests only the existing synthetic probe and saves local reports. This is not the native receiver or a production framework decision; `echo-mac-app` remains a placeholder.

### Completed-chunk transfer (WEB-025)

ADR-027 permits bounded HTTP slice downloads of committed chunks during capture, with a shared SD mutex and RAM-published committed-prefix metadata. Temporary Swift/Foundation tooling in `tools/chunk-receiver` durably verifies a local spool and builds the existing `.echo` archive only with explicit device completion evidence. No SD deletion, cloud storage, production Mac framework, automatic network joining or transcription path is selected. Real-transfer physical acceptance remains separate from synthetic radio passes.

ADR-028 adds an opt-in independent TypeScript worker over verified local receipts. It calls the authenticated recording endpoint in transcription-only mode, persists bounded retry state and timed results locally, and reuses the domain stitcher. Provider keys remain server-side; final text requires explicit clean completion and all expected transcripts.

### Styling and UI

| Technology | Responsibility | Status |
| --- | --- | --- |
| Tailwind CSS (v4 via PostCSS) | Styling system | Approved |
| shadcn/ui | Base UI component primitives: buttons, dialogs, dropdowns, tabs, forms, cards, tooltips, sheets, command/search, progress, skeletons, notifications | Approved (ADR-008); Button and icons installed in WEB-009 |
| Lucide | Icons, where icons are required | Approved (ADR-008); Button and icons installed in WEB-009 |

shadcn/ui is the approved base component system and enters the repository when a task first needs its primitives. Echo builds its own visual identity from these primitives rather than adopting default shadcn example layouts or generic AI-SaaS dashboard patterns; the product UI direction lives in `PROJECT_CONTEXT.md`. Do not add a second design system without an explicit approved decision.

### Hosting and Deployment

| Technology | Responsibility | Status |
| --- | --- | --- |
| Vercel | Primary web hosting and deployment target | Approved (ADR-008); **provisioned, deployed and verified over HTTPS** (2026-09-08) |
| Next.js standalone output + container | Portable self-hosted deployment | Approved (ADR-010); verified by ENG-002 and built in CI, but **never deployed anywhere** — no registry, no host, no TLS |
| `vercel.json` + `scripts/deployed-smoke.mjs` | Reproducible build configuration and verification of a live origin | Added by ENG-010; **has run against the live deployment and passed** (DOC-004, 2026-09-08) |

The intended workflow is: feature branch → GitHub → Vercel preview deployment → manual and automated verification → merge → production deployment. Keep feature branches compatible with preview deployments.

**Vercel is a deployment target, not Echo's runtime (ADR-010).** REQ-009 makes self-hosted deployment an architectural baseline, so Echo must also run as a container using the Next.js standalone server. Application code targets portable primitives; introducing a platform-specific service — managed blob storage, queue, workflow, cron, KV or edge-config binding — requires an ADR stating how self-hosted deployments satisfy the same need. GPU-backed inference is always reached as a configured HTTP endpoint, never co-located with the web application. Do not introduce AWS, Railway, Render, Firebase Hosting, or another application-hosting platform without a specific architectural reason and an explicit decision recorded in `DECISIONS.md`. **Echo is deployed.** The Vercel project exists, the owner has set all ten environment variables for Production and Preview, and `npm run test:deployed` passes against the live origin over its real certificate — including the check this was built for, that Vercel's edge does not serve `/_next/static` ahead of Echo's gate. Two limits on how far that generalises: the URL tested was deployment-specific rather than a project alias, so an alias should be re-checked rather than assumed; and with Vercel Deployment Protection off, **Echo's own fail-closed gate is the only thing in front of the origin**, which makes `echo-web-app/src/proxy.ts` load-bearing in production — adding a path exclusion there is a production access change. Deploying is still an explicit owner-run command, never a push (ADR-014).

#### ENG-002 self-host parity boundaries

ADR-010's promise is verified continuously rather than asserted.

| Piece | Responsibility |
| --- | --- |
| `echo-web-app/next.config.ts` | `output: "standalone"` plus `outputFileTracingRoot` set to the repository root. The root matters: Echo is an npm workspace with hoisted dependencies, and tracing from `echo-web-app` emits a bundle whose imports resolve to nothing — a failure invisible until the emitted server is started. |
| `scripts/selfhost-assemble.mjs` | The single definition of "assemble a self-hosted bundle": copies `.next/static`, and `public/` when it exists. Both the test and the `Dockerfile` call it, so the tested layout and the shipped layout cannot drift. |
| `scripts/selfhost.test.mjs` | Boots the assembled bundle — not `next start` — and asserts it serves every asset it links, still enforces the access gate, is configured purely at runtime, and runs correctly when relocated outside the repository the way the container relocates it. Runs inside `npm run check`. |
| `Dockerfile` / `.dockerignore` | The portable deployment artifact. Carries no configuration and no environment file. |
| `scripts/container-smoke.mjs` | Checks a running container: gate enforced, page served, compiled assets served from inside the image. CI only, because it needs a container runtime. |

**The two failure modes this exists to catch**, both named in ADR-010's consequences:

- **Static asset serving.** `output: "standalone"` deliberately omits `.next/static` and `public/`, because Vercel serves them from a CDN. A bundle started without them answers 200 for the page and 404 for every stylesheet and script, which reads as a styling bug rather than a packaging bug.
- **Build-time versus runtime configuration.** `scripts/selfhost.test.mjs` builds once and boots identical bytes twice, configured and unconfigured, asserting the behavior differs. That is what makes one image deployable anywhere and proves no credential is baked in at build time. Echo has no `NEXT_PUBLIC_*` variables and provider credentials must never become one.

**Why this is not folded into `scripts/production.test.mjs`.** That file owns the full access matrix against `next start`, which reads the whole workspace and the whole `node_modules`, so it passes even when the standalone bundle is broken. The two suites cover different artifacts; the self-host suite asserts only what the deployment shape can break.

#### ENG-010 deployment boundaries

ENG-010 makes deploying Echo reproducible and verifiable. It provisions nothing: creating the project and setting secrets needs the owner's account, so the task ends with the procedure and the check, not with a running origin.

| Piece | Responsibility |
| --- | --- |
| `vercel.json` | The build, in version control: `framework`, `installCommand`, `buildCommand`, and `git.deploymentEnabled: false` so a push never triggers a build (ADR-014). ENG-022 pins `outputDirectory` to `echo-web-app/.next` after the ENG-021 move; the earlier ENG-012 omission no longer describes the deployed configuration. Echo is an npm workspace with a root lockfile and hoisted dependencies, so the Vercel Root Directory stays at the repository root and these commands make the hosted install match `npm ci` locally. A dashboard-only arrangement would be invisible to Git and unreviewable. |
| `scripts/deployed-smoke.mjs` | Verifies a live origin: HTTPS, the gate, wrong-credential refusal, every linked compiled asset refused without credentials, unknown paths private, `/diagnostics/*` absent in production, the Route Handler's own guard, and no password or `NEXT_PUBLIC_` value in anything served. Reads credentials from the environment and never prints them. |
| `npm run test:deployed` | Runs it. Deliberately **not** part of `npm run check`: it needs a live URL and real credentials, so a CI gate cannot run it and must not appear to. |

**The failure mode this exists to catch.** `echo-web-app/src/proxy.ts` excludes nothing, and `scripts/production.test.mjs` proves the gate covers page, RSC, API, static and unknown paths against a Node server. A hosting platform commonly serves `/_next/static` from a CDN edge that answers *before* the application runs. If it does, compiled assets become public on the deployed origin while every local check stays green — the same shape as the ENG-002 static-asset failure, one layer further out. The deployed check fetches each linked asset without credentials and fails if any is served.

**`output: "standalone"` is conditional, and that is a deployment boundary rather than a detail.** ADR-010 needs standalone output for the container; Vercel needs it absent. The platform injects its own `modifyConfig` and an `onBuildComplete` hook that reads `.next/next-server.js.nft.json`, and with standalone on that file is not where the hook looks — the build fails with `ENOENT` *after* compiling, type-checking and generating pages successfully, so it reads as a code error and is not one. `echo-web-app/next.config.ts` therefore sets `output` from `process.env.VERCEL`, and `echo-web-app/tests/next-config.test.ts` asserts both branches. Vercel performs its own output tracing, so the container loses nothing and neither does Vercel.

**Host-agnostic by construction (ADR-010).** The script takes a base URL and asserts only on HTTP behavior, so it verifies the container behind the owner's own reverse proxy exactly as it verifies Vercel. Nothing platform-specific enters application code: `vercel.json` is build configuration, not a queue, blob store, cron or KV binding, and adopting one of those still requires its own ADR.

**Deployment is a prerequisite, not a nicety.** `checksum()` in `echo-web-app/src/lib/recording/session.ts` needs `crypto.subtle`, which browsers expose only in a secure context, and ADR-013 makes a deployed HTTPS origin the only way Echo is reachable from a second device. Mobile capture acceptance depends on this task completing.

### Initial Backend

| Technology | Responsibility | Status |
| --- | --- | --- |
| Next.js Route Handlers | HTTP API endpoints | Approved (ADR-008); none implemented yet |
| Server-side Next.js modules | Server-only logic and authorization guards | Approved; `src/lib/owner-access.ts` is the current example |
| Server-only provider integrations | Transcription and LLM calls, holding credentials server-side | Approved; none implemented yet |

Backend functionality stays inside the Next.js application for now:

```text
Browser
   ↓
Next.js application
   ├── UI
   ├── API / Route Handlers
   ├── authentication
   ├── transcription provider interface
   └── LLM provider interface
```

Do not create a separate Express, FastAPI, NestJS, or microservice backend during WEB-001 or WEB-002 without a demonstrated technical need. A separate worker or processing service becomes justified only when workload requires it — long recordings, background transcription, retry queues, diarization, transcript stitching, asynchronous AI processing, durable offline synchronization, or large audio uploads. Keep processing boundaries extractable so that split remains cheap; do not build the infrastructure prematurely.

### Package and Repository Tooling

Documented from what is actually present in the repository:

| Tool | Detail |
| --- | --- |
| npm workspaces | Root `package.json` declares `workspaces: ["echo-web-app"]`; root scripts delegate to the `@echo/web` workspace |
| npm | `10.9.8` (`packageManager`), `engines.npm >=10 <11` |
| Node.js | `22.23.2` pinned in `.nvmrc`; `engines.node >=22 <23` |
| `package-lock.json` | Committed at the repository root; `npm ci` installs it without rewriting resolution |
| Python 3 | Standard library only, for the bounded agent controller in `scripts/agent_loop.py` |

There is no pnpm, Yarn, Turborepo, Nx, or other monorepo tool. The `packages/*` paths in the layout below are planned, not scaffolded.

### Testing and CI

Documented from what is actually present in the repository. Do not claim a framework that is not installed:

| Tool | Responsibility |
| --- | --- |
| ESLint `9.39.5` + `eslint-config-next` | Linting; `--max-warnings=0` |
| `next typegen` + `tsc --noEmit` | Generated route types, then strict type checking |
| Node built-in test runner via `tsx` | Unit/behavior tests in `echo-web-app/tests/` |
| Node built-in test runner (`node --test`) | Production HTTP tests in `scripts/production.test.mjs` against a real production build |
| Node built-in test runner (`node --test`) | Self-host parity tests in `scripts/selfhost.test.mjs` against the standalone bundle a container runs (ENG-002) |
| `next build` | Real production compilation, emitting the standalone bundle |
| Python `unittest` | Bounded-controller tests in `tests/test_agent_loop.py` |
| GitHub Actions | `.github/workflows/pull-request.yml` runs `npm ci` and `npm run check` on pull requests and pushes to `main`, read-only permissions, no secrets. A `selfhost-container` job covering the image is specified in the ENG-002 handoff in `TASKS.md` and not yet added; see that handoff for why |

There is **no** Vitest, Jest, Playwright, Cypress, or Testing Library in this repository. The container smoke check is a plain Node script driven by CI, not a browser-automation framework; adding one would be a stack change requiring an ADR. ESLint is pinned to `9.39.5` because the current Next React lint plugin crashes under ESLint 10; upgrading remains a maintenance requirement.

### External AI Services

Transcription and notes generation are consumed through small provider abstractions, not vendor SDK calls scattered through the application:

```ts
interface TranscriptionProvider {
  transcribe(...): Promise<Transcript>
}

interface NotesProvider {
  generateNotes(...): Promise<GeneratedNotes>
}
```

Diarization is a **separate, session-scoped port** — not a flag on `TranscriptionProvider` — because speaker labels are assigned per input file with no cross-file consistency, so a per-chunk pipeline cannot produce globally coherent speakers (ADR-009):

```ts
interface DiarizationProvider {
  diarizeSession(...): Promise<SpeakerTurn[]>
}
```

Echo's provider ports use the OpenAI `/v1/audio/transcriptions` and `/v1/chat/completions` request shapes (ADR-009), which hosted vendors and self-hosted servers both implement; switching between them is a base-URL change rather than a code change. **The permanent transcription and LLM vendors remain undecided**; ADR-009 selects prototype defaults marked Temporary. Every provider exposes machine-readable capability and disclosure descriptors, and the external-processor disclosure required by REQ-009 is derived from that data rather than from prose. Credentials stay server-side; never place provider secrets in browser bundles or `NEXT_PUBLIC_*` variables. See `Provider boundaries` below for the full adapter contract table.

### Browser-local storage

Native IndexedDB is approved for the WEB-004 offline audio queue (ADR-012) and its WEB-006 capture completion records (ADR-017), with native Web Locks for same-origin retry serialization. No dependency or server-side storage choice is introduced. Browser persistence is subject to quota, eviction and user clearing; no local queue entry is an independent verified remote copy.

### Data and Infrastructure Decisions Still Open

These are intentionally unresolved. An agent encountering one must not silently choose; make the choice through its task and record an ADR.

| Decision | Current state |
| --- | --- |
| Relational database provider | **Open.** PostgreSQL is the likely direction, but it is not an approved final choice. ADR-016 records the first concrete thing it would buy: a job ledger that survives a cold start. |
| Object/audio storage provider | **Open.** Large audio must not be stored in relational database rows; object/blob storage will likely be required. |
| Production authentication | **Open.** The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final architecture. |
| Transcription vendor | **Open** for the permanent choice. ADR-009 selects a **Temporary** prototype default behind `TranscriptionProvider`. |
| LLM vendor | **Open** for the permanent choice. ADR-009 selects a **Temporary** prototype default behind `NotesProvider`. |
| Diarization vendor | **Open.** Kept behind a session-scoped `DiarizationProvider`; depends on object storage, so not required before WEB-005. |
| Background job / worker infrastructure | **Open.** Introduce only when workload justifies it; ADR-010 requires the chosen mechanism to have a self-hostable implementation. |
| Durable job ledger / exactly-once processing | **Open**, and blocked on the database row above. ADR-016 ships an in-process, best-effort ledger that closes the common retry window and explicitly does not claim exactly-once. |
| Long-running processing infrastructure | **Open.** Same trigger conditions as above. |

### Changing a stack decision

A future agent must not silently replace, or introduce an alternative to, a documented stack decision. If a stack-level change becomes necessary:

1. Identify the existing architecture decision being changed.
2. Explain the technical reason the existing decision is insufficient.
3. Create or update the appropriate ADR in `DECISIONS.md`.
4. Update this `Technology Stack` section.
5. Update any other affected documentation.
6. Only then implement the change.

## Current implementation state

What exists today, after integrating DOC-001, ENG-001 and WEB-001 into `main`:

- `echo-web-app`: a Next.js App Router application behind a fail-closed single-owner HTTP Basic gate, with one page — the recorder — and one Route Handler, `POST /api/recordings`.
- The WEB-002 vertical slice: browser microphone capture of a single 30–60 second clip, uploaded in one request, transcribed and turned into notes through the `TranscriptionProvider` and `NotesProvider` ports, then displayed. Two adapters ship per port, `openai-compatible` and `fixture` (ADR-009).
- Provider configuration is validated at server startup, so a missing key disables recording with a 503 and a named-variable explanation instead of failing at the first recording.
- Verification: ESLint, strict TypeScript, unit tests, a real production build, and production HTTP tests, aggregated by `npm run check` and run in GitHub Actions.
- `scripts/agent_loop.py`: the ENG-001 bounded builder/checker controller, with its own Python tests. Its automated feature loop is deliberately **disabled** (`agent-loop.json` has `"ready": false`) and blocks before spending model tokens.

WEB-003 adds browser-memory sessions and complete playable chunk capture on the feature branch, pending full verification. See its boundaries below. Overlap stitching, incremental processing during capture, persistence, offline queueing, history, diarization, research, reminders, background processing still do not exist in the web application. WEB-019 adds a separate, not yet hardware-verified diagnostic firmware. No database, object storage or production authentication is wired up.

## Layout (ADR-022)

```text
echo/
  echo-web-app/           Next.js + React UI, server endpoints, web tests
  echo-mac-app/           Documented placeholder; native receiver not implemented
  echo-device/            PlatformIO C++ firmware and embedded console
  scripts/               Shared build, deployment verification and controller
  tests/                 Controller and adapter tests
  tasks/, status/        Task records and acceptance evidence
```

Root npm workspace scripts target `echo-web-app`; the package name stays `@echo/web`.
Its tracing root is one directory above the web app. Standalone output mirrors this
layout at `echo-web-app/.next/standalone/echo-web-app/server.js`. Firmware is built
separately with PlatformIO, not npm. The Mac directory introduces no implementation
or new framework. Future shared packages should be added only with an immediate need.

## Flow

Browser microphone → local durable queue → authenticated upload → verified storage → incremental transcription → overlap-aware transcript stitching → structured notes → optional research / confirmed reminder export.

Capture and upload are decoupled. Persist chunk data and metadata locally before marking it queued. Upload complete playable chunks, not arbitrary recorder byte fragments assumed to be independently decodable. Browser/codec support and overlap strategy require a prototype. The initial short-clip milestone is a session with one chunk; long-session behavior follows in WEB-003 through WEB-006.

## Domain model

- **Session:** ID, owner, mode (session/quick-note), start/end, processing status, transcript revision, retention policy.
- **AudioChunk:** session ID, unique ID, sequence, recording start/end offsets, overlap duration, codec, size, checksum, local/remote locations, upload/transcription status.
- **TranscriptSegment:** chunk ID, time offsets, text, provider metadata; stitched output retains provenance and gaps.
- **GeneratedArtifacts:** title, summary, notes, action items, research topics, source transcript revision, pending/complete/failed status.
- **PendingAction:** classified task/reminder/note/idea, source reference, proposed time/timezone, confirmation and export status.
- **CopyVerification:** chunk ID, location/device, checksum, verification time, availability and durability evidence.
- **RetentionRecord:** policy days, eligibility time, warning delivery, keep authorization, deletion result.

Separate capture, upload, transcription, generation, and retention states. Stopping capture does not imply successful processing. Persist retry counts and actionable errors without content or keys. Use `(sessionId, chunkId)` for upload deduplication and `(chunkId, provider/config revision)` for transcription jobs. Generation uses a transcript revision to prevent stale output overwriting newer notes.

## Incremental transcription and stitching

Transcribe verified, independently decodable chunks as they arrive. Normalize timestamps into session time, sort by sequence and offset, and deduplicate overlap using timestamps plus text alignment. Preserve source segments for correction; never remove repeated speech outside the overlap just because text matches. Show gaps and partial transcripts; retry missing/failed chunks. Finalization requires all expected chunks accounted for, and invalidates/rebuilds artifacts when the transcript changes.

## Provider boundaries

| Provider | Contract responsibility |
| --- | --- |
| Transcription | Audio + metadata → timed segments, language, status/errors |
| Diarization | Whole-session audio → globally consistent speaker turns, joined onto the finalized transcript by time |
| LLM | Transcript + schema → validated artifacts or Quick Note classification |
| Storage | Put/get/delete + integrity and durable-copy verification |
| Research | Explicit query → findings with source URLs and provenance |
| Reminder | Preview proposed action; confirmed export with idempotency key |

Keep credentials in server-side configuration for the single-user prototype; future per-user keys require protected storage and access controls. Browser requests contain audio and settings, never server secrets. Define timeout, cancellation, retryability, rate-limit, and capability behavior at adapter boundaries. Adapters normalize provider timestamps into session time and must not leak vendor response shapes into domain code. Provider errors carry a retryability flag and never carry credentials, audio, or transcript text. No permanent vendor is selected; ADR-009 selects Temporary prototype defaults.

## Offline and security

Use a browser-persistent queue (IndexedDB is the planned candidate). Recover it on restart and retry with bounded backoff on reconnection. Distinguish local-only, uploading, verified, and processed states. Browser quota eviction and suspended tabs remain limitations: warn about quota, show unsynced items, and test supported mobile browsers. Do not claim background execution guarantees.

Authenticate deployed access, scope sessions and storage to their owner, use private objects and short-lived authorized access, and encrypt transport. Do not send audio to research or reminder services implicitly. Rendering transcripts must treat model/transcribed text as untrusted content. External writes require a user-reviewed action.

## Retention

Run deletion as a guarded, auditable job defined by `REQUIREMENTS.md`. Check every guard again immediately before deleting each copy. A verified copy must be independent of the deletion target and remain available after deletion; do not delete the sole remaining verified copy. Storage pressure may trigger early eligible eviction only after warnings and all guards pass. Failed verification or processing blocks deletion. Persist deletion outcomes for retry without retaining sensitive content in logs.

## WEB-002 recording slice boundaries

Historical WEB-002 behavior; WEB-003 supersedes the one-clip capture boundary below:

- **One clip per request.** The browser records a single 30–60 second clip (auto-stopped at 60 seconds), posts it once to `POST /api/recordings`, and renders the response. There is no session, no chunking, no retry queue, and nothing is persisted on the server.
- **Both provider ports carry two adapters.** `openai-compatible` speaks the ADR-009 wire formats; `fixture` returns deterministic canned output, performs no I/O, and is what the test suite uses, because the acceptance criteria forbid tests that need real microphone audio.
- **Vendor shapes stop at the adapter.** No `verbose_json` field, `choices[0]` envelope, or other vendor structure appears in a domain type or a function signature. Adapters normalize provider timestamps into session time; `sessionOffsetMs` is 0 for this single-clip slice and becomes meaningful in WEB-003.
- **Errors are typed, not textual.** `ProviderError` carries a port, a code, and a retryable flag, and its constructor accepts no free-form message — an upstream response body, credential, audio payload, or transcript cannot be attached to it.
- **Disclosure is derived from data.** Each provider exposes a machine-readable disclosure descriptor; the REQ-009 external-processor notice is rendered from it. Retention is reported as `unknown` for any remote endpoint, because Echo has no way to confirm a vendor setting yet.
- **Configuration fails closed at startup**, the way the access gate does: incomplete provider configuration is reported once at boot by variable name, disables the recorder in the UI, and makes the endpoint answer 503.
- **The endpoint guards itself.** `POST /api/recordings` calls `requireOwnerAccess` at its own boundary rather than relying on Proxy remaining in place, and transcript and model text are rendered as escaped React text nodes.

## WEB-003 session and capture boundaries

- A session and its chunks live in browser memory only. Each chunk carries stable session/chunk identifiers, sequence, monotonic session offsets, measured overlap, actual codec, byte count and SHA-256 checksum. Capture completion is separate from processing success; failures retain available clips.
- Independent MediaRecorder instances each produce one complete container. Start the next recorder before stopping the previous one; the owner can select zero, one or two seconds of overlap. Default chunk duration is 30 seconds and session capture remains capped at one minute. Timers can be delayed by browser suspension; metadata records actual boundaries and validation exposes gaps/invalid capture instead of claiming continuity.
- Once capture stops, process chunks sequentially through the existing authenticated endpoint; stop automatic processing on the first failed request and keep each successful chunk result separately. Manual retries preserve metadata. There is no server-side durable deduplication or background retry queue yet. Overlapping text is deliberately not stitched (WEB-006).
- The existing endpoint accepts optional strict chunk metadata, verifies bytes/codec/checksum/duration and passes the start offset into the provider port. Legacy single-clip requests remain valid. No new endpoint or vendor-shaped domain fields are introduced.
- Playback uses complete browser blobs with object URLs released on unmount. This is not a durable or verified remote copy. Browser decoding, mobile capture and full repository verification remain pending; synthetic tests validate timing/control flow only.

## ENG-005 diagnostic boundaries

`npm run doctor` is an opt-in server-side command, excluded from `npm run check`. It loads the owner's local configuration for normal use and makes one authenticated GET models request per remote port, with a ten-second deadline and redirects disabled. Fixtures bypass file loading when both ports are explicitly configured as fixture and make no request. Responses and exceptions are never printed; output contains fixed explanations and variable names. A successful probe certifies credential acceptance at that endpoint only, not inference or configured model access. The implementation session used synthetic configuration only.

## WEB-001 access and verification boundaries

`echo-web-app/src/proxy.ts` applies a fail-closed HTTP Basic gate to every route, including assets and RSC. `src/lib/access.ts` checks server configuration and exact credentials using constant-time digest comparison. The server page also calls the server-only `requireOwnerAccess` guard independently; future endpoints, actions, and data access must call the guard at their own boundary. There is no development bypass. This is a single-owner shell, not a multi-user identity system. No data store or external SDK exists. Server credentials are never passed to components.

Root npm workspace scripts delegate to `echo-web-app`; synthetic behavior tests and a real production HTTP smoke suite back PR CI. Tailwind compiles locally through PostCSS with system fonts; builds do not need a font service. See ADR-007 and README for limitations and disabled agent-loop requirements. The ENG-001 controller shares this repository but is independent of the web application: its Python tests certify the controller's own control flow and do not certify `echo-web-app`. Its `test` and `acceptance` adapters (`scripts/run-app-tests.py`, `scripts/run-app-acceptance.py`) are not implemented, so the loop stays disabled; see ADR-006 and AGENT_WORKFLOW.md.

## WEB-004 durable queue boundaries

The browser adapter stores Blob + metadata + processing state atomically, preserves existing identity, verifies recovered bytes and exposes ordered pending chunks and gaps. Capture hands off each complete container before session end. Uploads await persistence and are serialized with Web Locks. **ADR-016 supersedes the original "after capture" restriction**: they now run during capture as well, on each durable commit — see the WEB-005 boundaries below. Results and bounded retry timing survive reload; ambiguous network completion can repeat stateless provider work. No deletion exists: HTTP success cannot satisfy RET-002. The 64 MiB audio budget and 4 MiB warning reserve use Safari measurements in TASKS.md. Mobile suspension, eviction, offline shell navigation and origin changes are not durable-copy guarantees; see ADR-012.

## WEB-005 incremental upload boundaries

Uploads run **during** capture (ADR-016). A container is offered to the queue when it completes, the drain starts on that durable commit rather than at session end, and the `echo-audio-queue-drain` Web Lock still admits one drainer per origin. The drain stays sequential, so at most one upload is in flight at a time and capture never waits on the network. A send failure no longer stops the entries behind it; the failed entry returns on its own bounded backoff, and the drain stops only when the browser is offline or the page is gone.

Entry state is `pending`, `uploading`, `processed` or `blocked`, and it is persisted, not held in memory. `uploading` means *in flight, outcome unknown* — the state a page that died mid-upload must be recoverable as. Recovery returns a stale `uploading` entry to `pending`; whether the retry costs a provider call is then the server's decision, not the client's. Attempts are bounded, and exhausting them means `blocked` with a readable reason rather than an unbounded retry loop. An owner-initiated retry overrides backoff and `blocked`.

`POST /api/recordings` consults a `JobLedger` port keyed by chunk identity, `sessionId/id/checksum`, over fields it already validates against the uploaded bytes. A key that has completed **replays** its stored result without calling a provider; a key already in flight **joins** that job instead of starting a second one; anything else proceeds as before. A replayed response is marked as replayed. Requests carrying no chunk metadata — the WEB-002 single-clip path — have no identity and are not ledgered.

The only adapter is in-process: a bounded, expiring `Map`, no dependency and no platform service, so it behaves identically on Vercel and in the self-hosted container. **It is not exactly-once**, and nothing in the code or the interface may claim otherwise: a cold start, a redeploy, a second instance or an expiry all lose it, and the retry then costs a provider call. It holds results in memory for its TTL and never writes them to disk or to a log. A ledger entry is not a durable copy and cannot satisfy RET-002; no response, replayed or fresh, authorizes deleting raw audio.

Stitching those per-chunk results into one session transcript is WEB-006.

## WEB-006 transcript stitching boundaries

ADR-017 defines the implementation boundary: a pure domain stitcher consumes chunk metadata, original transcripts and explicit successful-capture completion evidence. Provider timestamps are already session milliseconds. Deduplication requires matching text and agreeing source segment times wholly inside measured overlap; ambiguous speech stays visible, and original text plus source references are preserved. No word timing is invented.

The existing IndexedDB queue gains completion records listing expected chunk metadata, committed only after successful capture and validation against saved chunks. Finalization requires that manifest and every expected valid transcript, with no metadata conflict or gap. Recording, failed capture, legacy recovery and failed completion writes remain partial. The UI derives one session transcript as results change, while notes stay per-chunk until WEB-007. This boundary is being implemented; see the WEB-006 task handoff for verification.

## WEB-008 Quick Note boundaries

Quick Note mode captures one clip, stopping automatically at 30 seconds. Optional chunk metadata identifies the mode and records the browser's stop time and online state. The existing IndexedDB queue preserves that metadata, audio, classification and response time; ordinary session entries remain compatible without a database version change.

`POST /api/recordings` uses the existing notes port's `classifyQuickNote` operation after transcription. One validated classification supplies both pending task/reminder/note/idea suggestions and the compatible notes result, with no second LLM call. The in-process retry ledger distinguishes Quick Notes from ordinary notes. Date phrases remain unresolved and require review; this feature performs no reminder/calendar writes. Stop-to-result timing includes local saving, queue waiting and retries, and fixture timing does not establish the live-service target. See `tasks/WEB-008.md` for executed evidence and remaining acceptance.

### WEB-018 lecture reliability boundaries

Capture uses one-minute complete containers by default, thirty seconds when a browser cannot report bitrate, and an engine-owned four-hour deadline. These timers require an active browser; they are not a background-recording guarantee. Capacity displayed to the owner is derived from actual current-session bytes, overlap and unfinished audio with a reserve, not requested encoder bitrate.

The stitcher attaches optional chunk bounds to gaps using validated metadata or the saved capture manifest. Artifact requests retain these bounds and reasons; text and gap bounds both participate in revision identity. The generator is told whether transcription is unavailable or a local audio chunk is missing, without inferring speech times from array indexes or silence.

`request-policy.ts` coordinates deadlines: transcription 90 s plus chunk notes 180 s fit under the recordings route’s 300 s; session artifacts 240 s fit under their route’s 300 s. Both browser deadlines are 310 s. A provider body abort is retryable just like an abort before response headers.

`ArtifactStore` uses a separate browser-local IndexedDB database (`echo-session-guides-v1`), keyed by session and exact transcript revision. It does not migrate or delete audio. Restored guides are validated before rendering; a different revision is not restored as current. The React hook prevents concurrent generation, avoids overwriting a generated answer with a late storage read, resumes its generation counter from restored data, and keeps a failed save visible with a download option. This is browser-local convenience, not a server backup. The development-only `/diagnostics/lecture` uses separate synthetic storage for native recovery evidence and can mount the actual notes UI against fixture providers.

## WEB-009 recording workspace boundaries

WEB-031 (ADR-030) uses capture date/time and a local reserved session number for
default names, preserving manual renames. New capture IDs encode epoch milliseconds
(or `undated`), sequence and a collision-resistant suffix within the existing
archive identity grammar. Device IDs survive transfer/import without schema changes.
The recording page sends browser epoch time through an action-header-protected
idle-only endpoint. The board advances that clock from its monotonic timer;
reboot requires synchronization again. Historical dates remain unavailable.

ADR-024 defines automatic duration-based organization and browser-local name/type
preferences. `library.ts` groups queue audio and completion records by stable
session identity, validates clean completion against saved metadata, and derives
labels without mutating processing metadata. `use-library.ts` persists validated
presentation preferences separately from audio and listens for cross-tab changes.
The recorder remains mounted across navigation; starting, recording and finalizing
lock library navigation, and import saving prevents a concurrent capture start.
Session notes remain mounted across Notes/Transcript/Audio view switches so changing
views does not cancel generation. Historical per-clip results stay available.

shadcn/ui Button and Lucide now supply workspace controls/icons; their small runtime
helpers are dependencies of the approved component system. This remains a single-owner,
browser-local library with no remote audio copy or cloud history service.

### WEB-021 wireless probe boundaries

ADR-025 adds the board-hosted `/probe` experimental section. Explicit idle-only actions enable a ping-only connectable BLE service and temporarily join a trusted shared network; the access point stays available. The station network's clients gain access to the bench console, including recordings, so this is an opt-in trust boundary expansion, not production authentication. Credentials are not persisted or logged. A fixed synthetic HTTP payload measures integrity and elapsed time without SD access, including during capture. Neither a successful transfer nor BLE ping certifies audio sync, durable receipt or automatic handoff. Physical results belong to `status/acceptance/WEB-021-probe.md`.
