# Tasks

Status vocabulary: Todo, In progress, Blocked, Done. DOC-001, ENG-001 and WEB-001 are Done and integrated into `main`. **WEB-002 is the next product-development task**; later web tasks remain Todo. Dependencies refer to WEB task IDs.

## DOC-001 — Shared repository foundation

**Status:** Done

Added shared context, engineering rules, architecture, requirements, roadmap, ADRs, task IDs and secret-safe configuration template. Validation passed: local Markdown links resolve, all 14 WEB task IDs exist, secret/data paths are ignored, and credential placeholders are blank. No application tests exist yet. Branch: `docs/project-foundation`. Next step: WEB-001.

## ENG-001 — Bounded builder/checker workflow

**Status:** Done

Added independent role definitions, a Codex-backed orchestrator, Claude entry points, five-attempt and regression stops, baseline/per-test evidence, protected verification, and setup documentation. Branch: `feat/bounded-agent-workflow`. Synthetic controller tests cover the control paths; live model invocation and web checks remain untested/unconfigured. Next: WEB-001/002, then independently prepare app adapters and goal acceptance tests before setting `agent-loop.json` ready.

**Integration note:** merged into `main`. The loop remains disabled: `agent-loop.json` still has `"ready": false`, and `scripts/run-app-tests.py` / `scripts/run-app-acceptance.py` do not exist. Controller tests were rerun after integration: 16 tests, 0 failures. Preflight correctly refuses to run (exit 2, "ready is false").

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

**Status:** Todo — **NEXT** · **Dependencies:** WEB-001 (satisfied)

**Acceptance:** Record 30–60 seconds, stop, obtain a transcript and generated notes using server-side user-supplied keys through minimal provider interfaces. Handle permission denial and provider failure; verify using synthetic audio.

**Intended vertical slice:**

```text
Browser microphone → record 30–60 seconds → Stop → server-side upload/request
  → TranscriptionProvider → Transcript → NotesProvider / LLM → Generated notes
  → display transcript + notes
```

**Must handle at least:** microphone permission denial, recording failure, transcription provider failure, and LLM provider failure — each surfaced to the user without exposing credentials.

**Constraints:** Keep provider implementations replaceable behind the `TranscriptionProvider` / `NotesProvider` abstractions; keep credentials server-side and out of `NEXT_PUBLIC_*`. Backend work stays inside Next.js Route Handlers and server modules (ADR-008). Do not introduce a database, object storage, background worker, or production auth system — those decisions are open; if WEB-002 genuinely needs one, follow the stack-change procedure in `ARCHITECTURE.md` first. Tests must not require manually recording real microphone audio; use synthetic or fixture audio. shadcn/ui may be installed here if the slice needs its primitives.

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

