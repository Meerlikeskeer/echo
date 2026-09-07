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

The intended workflow is: feature branch → GitHub → Vercel preview deployment → manual and automated verification → merge → production deployment. Keep feature branches compatible with preview deployments. Do not introduce AWS, Railway, Render, Firebase Hosting, or another application-hosting platform without a specific architectural reason and an explicit decision recorded in `DECISIONS.md`. Nothing is deployed today: no Vercel project, environment variables, or preview deployments are configured, and hosted use still requires provisioned owner credentials and HTTPS (ADR-007).

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
| `next build` | Real production compilation |
| Python `unittest` | Bounded-controller tests in `tests/test_agent_loop.py` |
| GitHub Actions | `.github/workflows/pull-request.yml` runs `npm ci` and `npm run check` on pull requests and pushes to `main`, read-only permissions, no secrets |

There is **no** Vitest, Jest, Playwright, Cypress, or Testing Library in this repository. ESLint is pinned to `9.39.5` because the current Next React lint plugin crashes under ESLint 10; upgrading remains a maintenance requirement.

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

Exact type signatures follow the implementing task. **The permanent transcription and LLM vendors remain undecided.** Credentials stay server-side; never place provider secrets in browser bundles or `NEXT_PUBLIC_*` variables. See `Provider boundaries` below for the full adapter contract table.

### Data and Infrastructure Decisions Still Open

These are intentionally unresolved. An agent encountering one must not silently choose; make the choice through its task and record an ADR.

| Decision | Current state |
| --- | --- |
| Relational database provider | **Open.** PostgreSQL is the likely direction, but it is not an approved final choice. |
| Object/audio storage provider | **Open.** Large audio must not be stored in relational database rows; object/blob storage will likely be required. |
| Production authentication | **Open.** The WEB-001 single-owner HTTP Basic gate is temporary prototype protection, not the final architecture. |
| Transcription vendor | **Open.** Kept behind `TranscriptionProvider`. |
| LLM vendor | **Open.** Kept behind `NotesProvider`. |
| Background job / worker infrastructure | **Open.** Introduce only when workload justifies it. |
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

- `apps/web`: a Next.js App Router application with one page — an empty sessions shell — rendered behind a fail-closed single-owner HTTP Basic gate.
- Verification: ESLint, strict TypeScript, unit tests, a real production build, and production HTTP tests, aggregated by `npm run check` and run in GitHub Actions.
- `scripts/agent_loop.py`: the ENG-001 bounded builder/checker controller, with its own Python tests. Its automated feature loop is deliberately **disabled** (`agent-loop.json` has `"ready": false`) and blocks before spending model tokens.

What does **not** exist yet: audio capture, chunking, upload, transcription, notes generation, persistence of any kind, offline queueing, research, reminders, background processing, and hardware. No database, object storage, or external provider is wired up. No Route Handlers exist. Everything in the sections below beyond `Current implementation state`, `Technology Stack` and `WEB-001 access and verification boundaries` describes planned design, not shipped behavior.

## Layout (only apps/web is implemented)

```text
apps/web/                 Next.js + TypeScript + Tailwind UI and server endpoints
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

Introduce directories when they contain real implementation. A separate worker service is not required for the first milestone; keep processing boundaries extractable so longer jobs can later move to a durable worker.

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
| LLM | Transcript + schema → validated artifacts or Quick Note classification |
| Storage | Put/get/delete + integrity and durable-copy verification |
| Research | Explicit query → findings with source URLs and provenance |
| Reminder | Preview proposed action; confirmed export with idempotency key |

Keep credentials in server-side configuration for the single-user prototype; future per-user keys require protected storage and access controls. Browser requests contain audio and settings, never server secrets. Define timeout, cancellation, retryability, rate-limit, and capability behavior at adapter boundaries. No specific model or vendor is selected.

## Offline and security

Use a browser-persistent queue (IndexedDB is the planned candidate). Recover it on restart and retry with bounded backoff on reconnection. Distinguish local-only, uploading, verified, and processed states. Browser quota eviction and suspended tabs remain limitations: warn about quota, show unsynced items, and test supported mobile browsers. Do not claim background execution guarantees.

Authenticate deployed access, scope sessions and storage to their owner, use private objects and short-lived authorized access, and encrypt transport. Do not send audio to research or reminder services implicitly. Rendering transcripts must treat model/transcribed text as untrusted content. External writes require a user-reviewed action.

## Retention

Run deletion as a guarded, auditable job defined by `REQUIREMENTS.md`. Check every guard again immediately before deleting each copy. A verified copy must be independent of the deletion target and remain available after deletion; do not delete the sole remaining verified copy. Storage pressure may trigger early eligible eviction only after warnings and all guards pass. Failed verification or processing blocks deletion. Persist deletion outcomes for retry without retaining sensitive content in logs.

## WEB-001 access and verification boundaries

`apps/web/src/proxy.ts` applies a fail-closed HTTP Basic gate to every route, including assets and RSC. `src/lib/access.ts` checks server configuration and exact credentials using constant-time digest comparison. The server page also calls the server-only `requireOwnerAccess` guard independently; future endpoints, actions, and data access must call the guard at their own boundary. There is no development bypass. This is a single-owner shell, not a multi-user identity system. No data store or external SDK exists. Server credentials are never passed to components.

Root npm workspace scripts delegate to `apps/web`; synthetic behavior tests and a real production HTTP smoke suite back PR CI. Tailwind compiles locally through PostCSS with system fonts; builds do not need a font service. See ADR-007 and README for limitations and disabled agent-loop requirements. The ENG-001 controller shares this repository but is independent of the web application: its Python tests certify the controller's own control flow and do not certify `apps/web`. Its `test` and `acceptance` adapters (`scripts/run-app-tests.py`, `scripts/run-app-acceptance.py`) are not implemented, so the loop stays disabled; see ADR-006 and AGENT_WORKFLOW.md.
