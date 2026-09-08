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

### Styling and UI

| Technology | Responsibility | Status |
| --- | --- | --- |
| Tailwind CSS (v4 via PostCSS) | Styling system | Approved |
| shadcn/ui | Base UI component primitives: buttons, dialogs, dropdowns, tabs, forms, cards, tooltips, sheets, command/search, progress, skeletons, notifications | Approved (ADR-008); **not yet installed** |
| Lucide | Icons, where icons are required | Approved (ADR-008); **not yet installed** |

shadcn/ui is the approved base component system and enters the repository when a task first needs its primitives. Echo builds its own visual identity from these primitives rather than adopting default shadcn example layouts or generic AI-SaaS dashboard patterns; the product UI direction lives in `PROJECT_CONTEXT.md`. Do not add a second design system without an explicit approved decision.

### Hosting and Deployment

| Technology | Responsibility | Status |
| --- | --- | --- |
| Vercel | Primary web hosting and deployment target | Approved (ADR-008); **not yet provisioned** |
| Next.js standalone output + container | Portable self-hosted deployment | Approved (ADR-010); verified by ENG-002, **not yet provisioned** |
| `vercel.json` + `scripts/deployed-smoke.mjs` | Reproducible build configuration and verification of a live origin | Added by ENG-010; **never yet run against a deployment** |

The intended workflow is: feature branch → GitHub → Vercel preview deployment → manual and automated verification → merge → production deployment. Keep feature branches compatible with preview deployments.

**Vercel is a deployment target, not Echo's runtime (ADR-010).** REQ-009 makes self-hosted deployment an architectural baseline, so Echo must also run as a container using the Next.js standalone server. Application code targets portable primitives; introducing a platform-specific service — managed blob storage, queue, workflow, cron, KV or edge-config binding — requires an ADR stating how self-hosted deployments satisfy the same need. GPU-backed inference is always reached as a configured HTTP endpoint, never co-located with the web application. Do not introduce AWS, Railway, Render, Firebase Hosting, or another application-hosting platform without a specific architectural reason and an explicit decision recorded in `DECISIONS.md`. Nothing is deployed today: no Vercel project, environment variables, or preview deployments are configured, and hosted use still requires provisioned owner credentials and HTTPS (ADR-007).

#### ENG-002 self-host parity boundaries

ADR-010's promise is verified continuously rather than asserted.

| Piece | Responsibility |
| --- | --- |
| `apps/web/next.config.ts` | `output: "standalone"` plus `outputFileTracingRoot` set to the repository root. The root matters: Echo is an npm workspace with hoisted dependencies, and tracing from `apps/web` emits a bundle whose imports resolve to nothing — a failure invisible until the emitted server is started. |
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
| `vercel.json` | The build, in version control: `framework`, `installCommand`, `buildCommand`, and `git.deploymentEnabled: false` so a push never triggers a build (ADR-014). No `outputDirectory`: the Next.js builder locates its own output, and naming one competed with it (ENG-012). Echo is an npm workspace with a root lockfile and hoisted dependencies, so the Vercel Root Directory stays at the repository root and these commands make the hosted install match `npm ci` locally. A dashboard-only arrangement would be invisible to Git and unreviewable. |
| `scripts/deployed-smoke.mjs` | Verifies a live origin: HTTPS, the gate, wrong-credential refusal, every linked compiled asset refused without credentials, unknown paths private, `/diagnostics/*` absent in production, the Route Handler's own guard, and no password or `NEXT_PUBLIC_` value in anything served. Reads credentials from the environment and never prints them. |
| `npm run test:deployed` | Runs it. Deliberately **not** part of `npm run check`: it needs a live URL and real credentials, so a CI gate cannot run it and must not appear to. |

**The failure mode this exists to catch.** `apps/web/src/proxy.ts` excludes nothing, and `scripts/production.test.mjs` proves the gate covers page, RSC, API, static and unknown paths against a Node server. A hosting platform commonly serves `/_next/static` from a CDN edge that answers *before* the application runs. If it does, compiled assets become public on the deployed origin while every local check stays green — the same shape as the ENG-002 static-asset failure, one layer further out. The deployed check fetches each linked asset without credentials and fails if any is served.

**`output: "standalone"` is conditional, and that is a deployment boundary rather than a detail.** ADR-010 needs standalone output for the container; Vercel needs it absent. The platform injects its own `modifyConfig` and an `onBuildComplete` hook that reads `.next/next-server.js.nft.json`, and with standalone on that file is not where the hook looks — the build fails with `ENOENT` *after* compiling, type-checking and generating pages successfully, so it reads as a code error and is not one. `apps/web/next.config.ts` therefore sets `output` from `process.env.VERCEL`, and `apps/web/tests/next-config.test.ts` asserts both branches. Vercel performs its own output tracing, so the container loses nothing and neither does Vercel.

**Host-agnostic by construction (ADR-010).** The script takes a base URL and asserts only on HTTP behavior, so it verifies the container behind the owner's own reverse proxy exactly as it verifies Vercel. Nothing platform-specific enters application code: `vercel.json` is build configuration, not a queue, blob store, cron or KV binding, and adopting one of those still requires its own ADR.

**Deployment is a prerequisite, not a nicety.** `checksum()` in `apps/web/src/lib/recording/session.ts` needs `crypto.subtle`, which browsers expose only in a secure context, and ADR-013 makes a deployed HTTPS origin the only way Echo is reachable from a second device. Mobile capture acceptance depends on this task completing.

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
| npm workspaces | Root `package.json` declares `workspaces: ["apps/web"]`; root scripts delegate to the `@echo/web` workspace |
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
| Node built-in test runner via `tsx` | Unit/behavior tests in `apps/web/tests/` |
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

Native IndexedDB is approved for the WEB-004 offline audio queue only (ADR-012), with native Web Locks for same-origin retry serialization. No dependency or server-side storage choice is introduced. Browser persistence is subject to quota, eviction and user clearing; no local queue entry is an independent verified remote copy.

### Data and Infrastructure Decisions Still Open

These are intentionally unresolved. An agent encountering one must not silently choose; make the choice through its task and record an ADR.

| Decision | Current state |
| --- | --- |
| Relational database provider | **Open.** PostgreSQL is the likely direction, but it is not an approved final choice. |
| Object/audio storage provider | **Open.** Large audio must not be stored in relational database rows; object/blob storage will likely be required. |
| Production authentication | **Open.** The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final architecture. |
| Transcription vendor | **Open** for the permanent choice. ADR-009 selects a **Temporary** prototype default behind `TranscriptionProvider`. |
| LLM vendor | **Open** for the permanent choice. ADR-009 selects a **Temporary** prototype default behind `NotesProvider`. |
| Diarization vendor | **Open.** Kept behind a session-scoped `DiarizationProvider`; depends on object storage, so not required before WEB-005. |
| Background job / worker infrastructure | **Open.** Introduce only when workload justifies it; ADR-010 requires the chosen mechanism to have a self-hostable implementation. |
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

- `apps/web`: a Next.js App Router application behind a fail-closed single-owner HTTP Basic gate, with one page — the recorder — and one Route Handler, `POST /api/recordings`.
- The WEB-002 vertical slice: browser microphone capture of a single 30–60 second clip, uploaded in one request, transcribed and turned into notes through the `TranscriptionProvider` and `NotesProvider` ports, then displayed. Two adapters ship per port, `openai-compatible` and `fixture` (ADR-009).
- Provider configuration is validated at server startup, so a missing key disables recording with a 503 and a named-variable explanation instead of failing at the first recording.
- Verification: ESLint, strict TypeScript, unit tests, a real production build, and production HTTP tests, aggregated by `npm run check` and run in GitHub Actions.
- `scripts/agent_loop.py`: the ENG-001 bounded builder/checker controller, with its own Python tests. Its automated feature loop is deliberately **disabled** (`agent-loop.json` has `"ready": false`) and blocks before spending model tokens.

WEB-003 adds browser-memory sessions and complete playable chunk capture on the feature branch, pending full verification. See its boundaries below. Overlap stitching, incremental processing during capture, persistence, offline queueing, history, diarization, research, reminders, background processing and hardware still do not exist. No database, object storage or production authentication is wired up.

## Layout (only apps/web is implemented)

```text
apps/web/                 Next.js + TypeScript + Tailwind UI and server endpoints
  src/app/                Pages, client components, and Route Handlers
  src/lib/access.ts       Single-owner access policy (WEB-001)
  src/lib/providers/      Provider ports, adapters, configuration, disclosure
  src/lib/recording/      The WEB-002 clip → transcript → notes pipeline
packages/audio/           Capture, chunk metadata, durable queue contracts
packages/transcription/   Transcription provider interface and adapters
packages/ai/              Structured notes and classification providers
packages/storage/         Durable object storage and verification adapters
packages/research/        Opt-in research providers and cited results
packages/reminders/       Confirmed reminder/calendar export adapters
packages/shared/          Domain types, validation, processing states
docs/                    Future detailed designs (not scaffolded yet)
tests/                    Future integration and synthetic fixtures
```

Only `apps/web/`, `scripts/` and `tests/` exist today; the `packages/` tree is planned, not scaffolded. Introduce directories when they contain real implementation. A separate worker service is not required for the first milestone; keep processing boundaries extractable so longer jobs can later move to a durable worker.

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

`apps/web/src/proxy.ts` applies a fail-closed HTTP Basic gate to every route, including assets and RSC. `src/lib/access.ts` checks server configuration and exact credentials using constant-time digest comparison. The server page also calls the server-only `requireOwnerAccess` guard independently; future endpoints, actions, and data access must call the guard at their own boundary. There is no development bypass. This is a single-owner shell, not a multi-user identity system. No data store or external SDK exists. Server credentials are never passed to components.

Root npm workspace scripts delegate to `apps/web`; synthetic behavior tests and a real production HTTP smoke suite back PR CI. Tailwind compiles locally through PostCSS with system fonts; builds do not need a font service. See ADR-007 and README for limitations and disabled agent-loop requirements. The ENG-001 controller shares this repository but is independent of the web application: its Python tests certify the controller's own control flow and do not certify `apps/web`. Its `test` and `acceptance` adapters (`scripts/run-app-tests.py`, `scripts/run-app-acceptance.py`) are not implemented, so the loop stays disabled; see ADR-006 and AGENT_WORKFLOW.md.

## WEB-004 durable queue boundaries

The browser adapter stores Blob + metadata + processing state atomically, preserves existing identity, verifies recovered bytes and exposes ordered pending chunks and gaps. Capture hands off each complete container before session end. Uploads await persistence and run after capture, on reconnect or on recovery, serialized with Web Locks. Results and bounded retry timing survive reload; ambiguous network completion can repeat stateless provider work. No deletion exists: HTTP success cannot satisfy RET-002. The 64 MiB audio budget and 4 MiB warning reserve use Safari measurements in TASKS.md. Mobile suspension, eviction, offline shell navigation and origin changes are not durable-copy guarantees; see ADR-012.
