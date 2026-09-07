# Tasks

Status vocabulary: Todo, In progress, Blocked, Done. DOC-001, ENG-001 and WEB-001 are Done and integrated into `main`. **WEB-002 is implemented and awaiting owner review on `feat/WEB-002-recording-slice`**; later web tasks remain Todo. ENG-002 is independent of the WEB sequence and may run alongside WEB-002. Dependencies refer to WEB task IDs.

## DOC-001 — Shared repository foundation

**Status:** Done

Added shared context, engineering rules, architecture, requirements, roadmap, ADRs, task IDs and secret-safe configuration template. Validation passed: local Markdown links resolve, all 14 WEB task IDs exist, secret/data paths are ignored, and credential placeholders are blank. No application tests exist yet. Branch: `docs/project-foundation`. Next step: WEB-001.

## ENG-001 — Bounded builder/checker workflow

**Status:** Done

Added independent role definitions, a Codex-backed orchestrator, Claude entry points, five-attempt and regression stops, baseline/per-test evidence, protected verification, and setup documentation. Branch: `feat/bounded-agent-workflow`. Synthetic controller tests cover the control paths; live model invocation and web checks remain untested/unconfigured. Next: WEB-001/002, then independently prepare app adapters and goal acceptance tests before setting `agent-loop.json` ready.

**Integration note:** merged into `main`. The loop remains disabled: `agent-loop.json` still has `"ready": false`, and `scripts/run-app-tests.py` / `scripts/run-app-acceptance.py` do not exist. Controller tests were rerun after integration: 16 tests, 0 failures. Preflight correctly refuses to run (exit 2, "ready is false").

## ENG-002 — Self-host parity verification

**Status:** Todo · **Dependencies:** WEB-001 (satisfied)

**Acceptance:** Demonstrate that Echo runs outside Vercel as required by ADR-010 and REQ-009. Add a container build using the Next.js standalone server, document the self-hosted run command and required configuration, and extend verification with a production smoke check against the container equivalent to the existing production HTTP tests. Static asset serving and build-time versus runtime environment variables must be handled explicitly, not assumed.

**Rationale:** REQ-009 makes self-hosted deployment an architectural baseline, but nothing verifies it. Proving parity is cheapest now, while the application is a single page and an access proxy, and before WEB-004/WEB-005/WEB-010 introduce queues, scheduled work and object storage — the point at which platform-specific primitives would otherwise be adopted silently. Must not weaken any existing check.

## ENG-003 — Shared status file and reading map

**Status:** Done — implemented on `feat/WEB-002-recording-slice` alongside WEB-002 · **Dependencies:** None

**Acceptance:** Give every session — Codex, Claude Code, or human — one short file to read first, so work can begin without loading the whole repository. `STATUS.md` carries current task state, the verification baseline with real exit codes and counts, what does and does not exist, and a reading map routing each kind of task to the few documents that answer it. `AGENTS.md`, `CLAUDE.md` and `README.md` route through it, and updating it in the same commit as any status or verification change is a stated rule.

**Rationale:** The previous instruction was to read `PROJECT_CONTEXT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md` and `TASKS.md` before changing behavior — roughly 50 KB of prose ahead of every task, which is the main reason a session exhausts its context before finishing. `STATUS.md` is explicitly a cache, not a competing source of truth: the owning document wins any disagreement and the stale summary gets fixed.

**Also in this change:** `apps/web/next.config.ts` sets `agentRules: false`, because `next dev` was generating a second `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` on every start — a competing instruction file that reappeared as an uncommitted change after each run. `next-env.d.ts` is now gitignored, matching the Next.js default, because `next dev` and `next build` write different contents into that tracked file.

**Handoff:** committed with the WEB-002 branch rather than on its own, since it documents the state that branch creates. Verification is the WEB-002 run recorded below and in `STATUS.md`.

## WEB-001 — Web shell and tooling

**Status:** Done (implemented, independently verified, and merged into `main`) · **Dependencies:** None

**Acceptance:** Create apps/web with Next.js, TypeScript, Tailwind; document actual install/dev/lint/typecheck/build commands and lockfile. Add private access baseline and empty session UI. Build and checks succeed.

**Handoff:** Branch `feat/WEB-001-web-shell`; implementation commit `0137bb16b67e2f3fa9ce63f5db8f5fe484458c35`. Coordinator delegated implementation to `builder`, then handed the clean commit to the separate read-only implementation reviewer `checker`. The checker reviewed the full diff against foundation `b2e1111` and independently ran the commands below on 2026-09-06 with Node 22.23.2/npm 10.9.8. No blocking findings; implementation was not changed by the checker. No scope change to later WEB tasks.

**Independent evidence:**
- `npm ci`: exit 0; 373 packages added, 375 audited, 0 vulnerabilities. Lockfile remained unchanged. npm warned that ESLint 9.39.5 is unsupported; the documented compatible pin remains a maintenance limitation.
- `npm run check`: exit 0. ESLint with zero warnings allowed passed; Next route generation and strict TypeScript passed; 3 unit tests passed; Next 16.3.4 production build passed; 2 production HTTP tests passed. Both test runs reported 0 failed, 0 skipped, 0 cancelled, 0 todo.
- `npm ls eslint --all`: exit 0, every resolved ESLint entry is 9.39.5; no stale ESLint 10 installation remains.
- `git diff --check b2e1111..0137bb16`: exit 0. Working tree remained clean after installation/checks. `git ls-files '*agent-loop*'` returned no tracked configuration: automation remains absent/disabled.

**Review coverage:** Fail-closed missing/invalid configuration and exact credential policy; independent server render guard; unauthorized page/API/static/RSC denial including a middleware-subrequest header; authorized production HTML/RSC/assets; synthetic-password absence from responses/assets; generated Tailwind utility; disabled empty-state action. CI runs the same install and aggregate check commands with read-only permissions and no secrets. Existing assertions and lint rules were not weakened to pass.

**Limitations and next step:** Owner reviews this branch; do not merge automatically. Remote GitHub Actions has not been run and branch protection is not configured by this local change. No browser visual/mobile or deployed HTTPS verification was performed. Provision owner credentials and HTTPS before hosted use. Basic auth limitations and the ESLint compatibility requirement are documented in README. Agent-loop real check commands and per-test reporting adapters remain unresolved; do not enable it. WEB-002 remains next after review.

## WEB-002 — Short recording vertical slice

**Status:** Done — implemented and verified on `feat/WEB-002-recording-slice`; **awaiting owner review, not merged** · **Dependencies:** WEB-001 (satisfied), ADR-009 and ADR-010

**Acceptance:** Record 30–60 seconds, stop, obtain a transcript and generated notes using server-side user-supplied keys through minimal provider interfaces. Handle permission denial and provider failure; verify using synthetic audio.

**Intended vertical slice:**

```text
Browser microphone → record 30–60 seconds → Stop → server-side upload/request
  → TranscriptionProvider → Transcript → NotesProvider / LLM → Generated notes
  → display transcript + notes
```

**Must handle at least:** microphone permission denial, recording failure, transcription provider failure, and LLM provider failure — each surfaced to the user without exposing credentials.

**Constraints:** Keep provider implementations replaceable behind the `TranscriptionProvider` / `NotesProvider` abstractions; keep credentials server-side and out of `NEXT_PUBLIC_*`. Backend work stays inside Next.js Route Handlers and server modules (ADR-008). Do not introduce a database, object storage, background worker, or production auth system — those decisions are open; if WEB-002 genuinely needs one, follow the stack-change procedure in `ARCHITECTURE.md` first. Tests must not require manually recording real microphone audio; use synthetic or fixture audio. shadcn/ui may be installed here if the slice needs its primitives.

**Provider approach (ADR-009, accepted at the start of this task):** Use the OpenAI-compatible wire format as the port for both providers, so hosted and self-hosted deployments share one adapter and switching is a base-URL change. Ship two adapters: `openai-compatible` and a `fixture` adapter supplying deterministic canned transcripts, since the acceptance criteria forbid tests that require real microphone audio. Validate configuration at startup so a missing key fails closed the way the WEB-001 access gate does, rather than at first recording. Diarization is explicitly out of scope: it is a separate session-scoped port that depends on object storage and cannot ship before WEB-005.

**Sizing note:** a 30–60 second Opus clip is well under one megabyte against Vercel's 4.5 MB function payload limit, so this slice needs no object storage and forces none of the open infrastructure decisions.

### Handoff

**Task:** WEB-002 — short recording vertical slice.
**Branch:** `feat/WEB-002-recording-slice`, branched from `docs/ADR-009-provider-selection` (see *Branch base* below).
**Commits:** `1ce70fe` chore — ignore `.claude/worktrees/`; `e9193ff` the implementation and its documentation.

**Branch base — read this before merging.** ADR-009 and ADR-010 were *not* on `main` when this task started. They existed only on `docs/ADR-009-provider-selection` (`93ec5b5`, one commit ahead of `main`, checked out in a worktree) and both were still marked *Proposed — awaiting owner acceptance*. Repository documentation is authoritative, so this branch was based on that commit rather than on `main`, and the two ADRs were marked **Accepted** because the owner directed the implementation to proceed against them. Merging this branch therefore also merges ADR-009 and ADR-010. If either decision is not in fact accepted, stop before merging.

**Scope delivered**

- `POST /api/recordings` (Node runtime, dynamic): accepts one multipart clip, returns transcript, notes, and provider disclosures. It calls `requireOwnerAccess` at its own boundary rather than relying on Proxy.
- Provider ports in `apps/web/src/lib/providers/`: domain `types.ts`, typed `errors.ts`, startup `config.ts`, `factory.ts`, and the module-scope `registry.ts` that evaluates configuration once at server start. `src/instrumentation.ts` reports problems at boot by variable name.
- Two adapters per port. `openai-compatible.ts` speaks the ADR-009 wire formats; `fixture.ts` returns deterministic canned output, performs no I/O, and supports injected failures so every failure path is testable without a network.
- `apps/web/src/lib/recording/pipeline.ts` validates the clip before any credential is used, then transcribes and generates notes. `http.ts` maps a `ProviderError` onto a client-safe status and body.
- UI: `recorder.tsx` (client) owns MediaRecorder, permission handling, the elapsed timer and the 60-second auto-stop; `recording-result.tsx` renders notes, timestamped transcript and the disclosure notice; `session-shell.tsx` and `page.tsx` wire them to server-side provider status.
- Documentation: ARCHITECTURE.md gains a `WEB-002 recording slice boundaries` section and an updated `Current implementation state` and layout; ADR-009/ADR-010 marked Accepted; README, `.env.example`, PROJECT_CONTEXT.md and ROADMAP.md reconciled.

**Failure paths surfaced, none carrying credentials**

| Path | Surfaced as |
| --- | --- |
| Microphone permission denied | Distinct message per `NotAllowedError`/`SecurityError`, `NotFoundError`, `NotReadableError`, and unsupported browser |
| Recording failure | `MediaRecorder` error event, empty clip, and sub-second clip each stop the recorder, release the microphone and explain that nothing was sent |
| Transcription provider failure | `ProviderError` with port `transcription`, a code, and a retryable flag → mapped status (401/403→502, 429→429, 408→504, 413→413, 422→400, 5xx→502) |
| LLM provider failure | Same, with port `notes`; the UI titles it separately |
| Incomplete configuration | Startup log by variable name, recorder replaced by an explanation, endpoint answers 503 `provider_unconfigured` |

**Checks and outcomes** — run from the repository root on `e9193ff`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | ESLint `--max-warnings=0` clean; `next typegen` + `tsc --noEmit` clean; **33 unit tests, 33 pass, 0 fail**; production build succeeded; **4 production HTTP tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (controller only; unchanged by this task) |

Additional evidence: no `NEXT_PUBLIC_*` appears in application source; no API-key-shaped string appears anywhere in `.next` build output; `agent-loop.json` still has `"ready": false`. Unit tests grew from 3 to 33 and production HTTP tests from 2 to 4. No existing assertion was removed or relaxed — the page content marker moved with the page, and `/api/recordings` was added to the private-path list.

**Live service check — 2026-09-06.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in 1.4 s, correct transcript, sensible notes and action items, timestamps normalized into milliseconds. This was the first live vendor call ever made from this repository.

It exposed one bug, fixed in the same branch. This wire format identifies audio by the uploaded file's **filename extension**, not by its content type, and returns 400 for a name it cannot classify. A browser recording has no extension, so every real recording failed with "The recording was not in a form the provider accepts." The adapter now derives an extension from the clip's media type, and a regression test asserts the uploaded filename. The same fix separated two failures that previously shared one message: `invalid_input` now means Echo rejected the clip, and `rejected_by_provider` means the clip reached the service and was refused. Failures are also logged server-side with port, code and upstream status — no bodies, credentials, audio or transcript.

**Limitations and blockers**

- **Latency is not measured.** REQ-006 targets 5–10 s from stop to result; the single live check ran 1.4 s for a 7-second clip on one connection. That is one measurement, not a measured claim, and nothing records clip length, device, connection or provider yet.
- **No browser was driven.** `MediaRecorder`, permission prompts, the auto-stop and mobile capture were not exercised; the client component is covered only by server-rendered markup assertions. Codec and mobile-browser validation remain WEB-003.
- Nothing is persisted, so a failed notes call discards a successful transcription. Retry re-records and re-transcribes.
- Retention is reported as `unknown` for every remote endpoint. ADR-009 requires an operator to confirm a vendor's zero-retention setting; Echo has no mechanism for that confirmation yet.
- shadcn/ui was **not** installed. The slice needs a button and two panels, and ADR-008 makes shadcn available when a task needs its primitives rather than by default. It remains approved and uninstalled.
- `agent-loop.json` remains `"ready": false`. `scripts/run-app-tests.py` and `scripts/run-app-acceptance.py` still do not exist, and this task did not create them.

**Next step:** owner reviews this branch and confirms ADR-009/ADR-010 acceptance; run the manual live-vendor and browser checks above; then merge to `main`. WEB-003 follows.

## WEB-003 — Session and playable chunk model

**Status:** Todo · **Dependencies:** WEB-002

**Acceptance:** Implement timed ordered chunk metadata and independently decodable chunks with configurable overlap. Validate boundary capture, sequence, checksum and codec behavior on selected browsers.

## WEB-004 — Durable offline queue

**Status:** Todo · **Dependencies:** WEB-003

**Acceptance:** Persist chunks before upload; recover after reload and disconnect, retry on reconnect without data duplication, expose quota errors and unsynced status. Document mobile background limits.

## WEB-005 — Incremental upload and transcription

**Status:** Todo · **Dependencies:** WEB-003, WEB-004

**Acceptance:** Upload/transcribe during recording with durable status, bounded retry/backoff and idempotent jobs; demonstrate reordered uploads and provider failures recover without duplicated work.

## WEB-006 — Transcript stitching

**Status:** Todo · **Dependencies:** WEB-005

**Acceptance:** Align session timestamps and overlap text, retain provenance, flag missing chunks, and finalize only complete sessions. Test repeated speech, overlap, gaps and out-of-order results.

## WEB-007 — Structured artifacts

**Status:** Todo · **Dependencies:** WEB-006

**Acceptance:** Generate validated title, summary, notes, action items and research topics tied to transcript revision; reject malformed output and prevent stale generation overwrites.

## WEB-008 — Quick Note mode

**Status:** Todo · **Dependencies:** WEB-002, WEB-007

**Acceptance:** Classify task/reminder/note/idea into pending actions. Measure stop-to-result latency against 5–10 second online target with conditions documented; show pending offline state and ambiguous dates.

## WEB-009 — Session history

**Status:** Todo · **Dependencies:** WEB-004, WEB-007

**Acceptance:** List and reopen sessions and artifacts with accurate partial/failed/complete, sync and retention states; expose retry actions and owner isolation.

## WEB-010 — Guarded audio retention

**Status:** Todo · **Dependencies:** WEB-005, WEB-009

**Acceptance:** Implement RET-001–006 including verified surviving raw copy, warning delivery/grace period, persisted Keep, near-full handling and guarded idempotent deletion. Decide defaults; test failed transcription, unavailable copies, keep/deletion races and cross-device last-copy protection.

## WEB-011 — Settings and privacy hardening

**Status:** Todo · **Dependencies:** WEB-002, WEB-009

**Acceptance:** Expose provider/retention settings without returning keys; validate inputs, redact errors, enforce owner access and private storage. Document supported single-user configuration and test unauthorized access.

## WEB-012 — Private deployment and recovery validation

**Status:** Todo · **Dependencies:** WEB-006, WEB-008, WEB-010, WEB-011

**Acceptance:** Document reproducible self-hosted setup, actual checks, backup/recovery and browser support. Demonstrate interrupted recording/upload recovery and deletion guards with synthetic data.

## WEB-013 — Opt-in research

**Status:** Todo · **Dependencies:** WEB-007, WEB-011

**Acceptance:** Add replaceable research adapter with explicit opt-in, cited source URLs and provenance; distinguish suggestions from researched findings and handle provider failures.

## WEB-014 — Confirmed reminder/calendar export

**Status:** Todo · **Dependencies:** WEB-008, WEB-011

**Acceptance:** Add replaceable adapter with preview, date/timezone resolution, explicit confirmation, minimal permissions and idempotent export; test retries without duplicate events.

## INT-001 — Branch integration and architecture documentation

**Status:** Done

Created `main` as the canonical development branch by merging `feat/bounded-agent-workflow` (fast-forward from the DOC-001 base) and then `feat/WEB-001-web-shell`. Source branches `docs/project-foundation`, `feat/bounded-agent-workflow` and `feat/WEB-001-web-shell` are retained unchanged; no unique work remains outside `main`.

Conflicts resolved in `AGENTS.md`, `PROJECT_CONTEXT.md`, `README.md` and `DECISIONS.md`. The duplicate ADR-006 authored independently on both feature branches was reconciled by keeping ENG-001's controller decision as ADR-006 and renumbering WEB-001's bootstrap decision to ADR-007; both decisions are preserved in full. Added ADR-008 (Vercel deployment, shadcn/ui, initial Next.js full-stack architecture) and a canonical `Technology Stack` section in `ARCHITECTURE.md`. Corrected cross-branch stale statements: the web app is no longer "not scaffolded", and `agent-loop.json` is no longer "absent".

**Verification after integration** (Node 22.23.2, npm 10.9.8): `npm ci` exit 0, 373 packages, 0 vulnerabilities, lockfile unchanged; `npm run check` exit 0 — ESLint clean, strict TypeScript clean, 3 unit tests passed, Next 16.3.4 production build succeeded, 2 production HTTP tests passed, 0 failed/skipped in both runs; `python3 -m unittest discover -s tests` exit 0 with 16 tests passing on both Python 3.9.6 and 3.12.13; agent-loop preflight exit 2 (correctly blocked). GitHub Actions was not run remotely and no deployment was performed.

**Next step:** WEB-002. Do not enable the agent loop.

## Handoff template

For an active/completed task record: task ID; branch and commit; scope changed; checks and outcomes; blockers/open decisions; next step. Keep credentials and real recording content out of handoffs.

