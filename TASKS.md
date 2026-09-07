# Tasks

Status vocabulary: Todo, In progress, Blocked, Done. WEB-001 is in progress; later web tasks remain Todo. Dependencies refer to WEB task IDs.

## DOC-001 — Shared repository foundation

**Status:** Done

Added shared context, engineering rules, architecture, requirements, roadmap, ADRs, task IDs and secret-safe configuration template. Validation passed: local Markdown links resolve, all 14 WEB task IDs exist, secret/data paths are ignored, and credential placeholders are blank. No application tests exist yet. Branch: `docs/project-foundation`. Next step: WEB-001.

## WEB-001 — Web shell and tooling

**Status:** In progress · **Dependencies:** None

**Acceptance:** Create apps/web with Next.js, TypeScript, Tailwind; document actual install/dev/lint/typecheck/build commands and lockfile. Add private access baseline and empty session UI. Build and checks succeed.

**Handoff:** Branch `feat/WEB-001-web-shell`; implementation commit is the WEB-001 bootstrap commit containing this entry. Scaffold, single-owner access, unit/production tests, CI, lockfile and setup documentation are implemented. Builder development run: `npm run check` exited 0 after approved escalation for test IPC/loopback sockets: lint and typecheck passed, 3 unit tests passed, Next 16.3.4 production build passed, 2 production HTTP tests passed (0 skipped). Initial sandbox run passed lint/typecheck then hit IPC EPERM; initial ESLint 10 was incompatible with the React plugin, so compatible 9.39.5 is pinned without disabling rules. Current lockfile came from a fresh manifest-only install; independent `npm ci` is still required. These are builder observations, not independent certification. No scope change to later WEB tasks. Agent-loop remains absent/disabled; real adapters are unresolved. Next step: separate checker reviews the clean implementation commit and independently runs `npm ci` and `npm run check`; only then record completion evidence. Remote CI and owner HTTPS/credentials remain setup requirements.

## WEB-002 — Short recording vertical slice

**Status:** Todo · **Dependencies:** WEB-001

**Acceptance:** Record 30–60 seconds, stop, obtain a transcript and generated notes using server-side user-supplied keys through minimal provider interfaces. Handle permission denial and provider failure; verify using synthetic audio.

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

## Handoff template

For an active/completed task record: task ID; branch and commit; scope changed; checks and outcomes; blockers/open decisions; next step. Keep credentials and real recording content out of handoffs.
