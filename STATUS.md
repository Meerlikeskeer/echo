# Status

**Read this file first, then follow the reading map.** Repository source documents win over this cache; current owner instructions can change scope.

**Updated:** 2026-09-08 · **Branch:** `test/WEB-004-browser-acceptance` · **Base:** `main` @ `6cee6fd`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**WEB-004 native browser acceptance — blocked, NOT Done.** Branch `test/WEB-004-browser-acceptance` started from remote `main` @ `6cee6fd`, in separate worktree `/private/tmp/echo-web004-browser`. Implementation is merged in PR #9; no application source changed. This attempt observed **no native PASS lines**. Safari 26.4 (21624.1.16.11.4) displayed “Safari Can’t Connect to the Server” at `http://127.0.0.1:3000/diagnostics/queue`. Chrome app selection initially failed; selecting its running translocated path worked, but subsequent actions were refused twice because the user changed the app state. Chrome version was not obtained. The earlier `elementHasNoFrame` / `noWindowsAvailable` errors did not recur in this attempt. These are not browser test failures or proof of a code defect.

`npm run dev` announced readiness, then logged repeated `EMFILE` watcher errors and development-directory restarts; it was stopped. The first check overlapped the dev process, but a standalone retry and an escalated retry failed identically in generated route types. Required-command results below are this attempt’s actual results. Environment files were excluded from the worktree because session policy denies access; no credentials were read or printed. Owner configuration/authentication with fixture providers was requested without asking for credentials in chat. Storage, reload recovery, capture persistence, disconnect/reconnect, retention, playback and two-tab acceptance all remain unverified.

**Parallel ENG-010:** deployment work remains outside this task; preserve its status and verification facts when integrating the expected STATUS conflict. No deployment files or ENG-010 task entry were edited.

**Next:** restore a stable configured local development server and idle browser automation, then execute the WEB-004 browser steps in TASKS.md. Do not infer acceptance from historical or CI checks. Mobile remains deferred under ADR-013.

## What exists and what does not

The approved Next.js application remains behind the owner access gate. WEB-004 saves each completed audio container and metadata in browser-local IndexedDB, recovers and checks bytes, retains processing results, and retries while the page is active. The adapter exposes no deletion operation; no HTTP response is counted as a verified remote copy. A 64 MiB audio budget and 4 MiB warning reserve use Safari sizing. Native diagnostic pages are development-only and owner-gated; production denies them.

No server audio storage, relational database, production user accounts, stitched transcript, incremental upload during capture, authenticated offline application-shell cache, background worker, history product, research/reminder export or hardware is introduced. Browser storage can be evicted or cleared. Abrupt termination can lose the unfinished container; a closed/suspended page cannot upload. Offline hard navigation must wait until the same origin's application is reachable. Exactly-once remote provider processing after an ambiguous response requires later server work; retries do not duplicate local chunk identities/results.

**No network access to Echo, by decision (ADR-013).** Echo is reachable only from the machine running it, so capture cannot be exercised from a phone or a second device until a deployed origin exists. Re-adding a non-loopback bind reverses an accepted decision and needs its own ADR.

**`crypto.subtle` secure-context gap — diagnosed, not solved.** `checksum()` in `apps/web/src/lib/recording/session.ts` uses `crypto.subtle.digest`, which browsers expose only over HTTPS or on `localhost`. Self-hosting over plain HTTP — an ADR-010 baseline — makes it `undefined`. ENG-008's `secure-context` module refuses capture up front and says why, and it is unreachable in development because `dev` and `start` bind `127.0.0.1`. Serving a deployed origin over HTTPS is the actual fix and belongs to the deployment task.

## Verification snapshot

**WEB-004 acceptance attempt, 2026-09-08, from the separate worktree repository root at `6cee6fd`; Node 22.23.2 / npm 10.9.8 / Python 3.9.6.** These are observed results, not the earlier successful run copied forward.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm ci` | 0 | 373 packages installed, 0 vulnerabilities; optional-package cleanup emitted EPERM warnings |
| `npm run check` | 1 | Source tracking and lint passed; generated `.next/types/validator.ts` failed TS2344 (`Route` does not satisfy `never`). Same result on standalone and escalated retries. Unit, production build, production HTTP and self-host parity stages **not run** |
| `python3 -m unittest discover -s tests` | 1 | RecursionError during cleanup/error reporting; no final test count. Escalated retry also exit 1 with no final count |
| `npm run dev` | 0 on stop | Initially Ready at 127.0.0.1:3000, then repeated EMFILE watcher errors and development-directory restarts; Safari could not connect; stopped by agent |
| Chrome native acceptance | not run | No test result or browser version obtained; app-state interference blocked actions |
| Safari native acceptance | not run | Version 26.4 (21624.1.16.11.4) observed; diagnostic navigation could not connect |

The required floor remains **69 unit, 7 production HTTP, 4 self-host parity, 16 controller**. This attempt establishes no new passing counts; unavailable stages are not a count reduction or a pass. Historical successful runs remain in the WEB-004 handoff. No verification code or assertions were changed. Full acceptance remains outstanding.

## Vocabulary

Short definitions so nobody has to reconstruct them from context.

| Term | What it means |
| --- | --- |
| `WEB-###` | A numbered piece of **product** work — something the user can see. `WEB-002` is "record a clip, get a transcript and notes back". |
| `ENG-###` | A numbered piece of **internal** work — tooling, verification, documentation plumbing. Nothing user-visible. |
| `DOC-###`, `INT-###` | Documentation work, and merging branches together. |
| **ADR-###** | *Architecture Decision Record.* A short dated note in `DECISIONS.md` saying what was decided and why, so a later session cannot silently reverse it or re-argue it. |
| **Port** | The small interface Echo defines for a job — for example "turn audio into text". Application code only ever talks to the port, never to a company's API directly. |
| **Adapter** | The piece that implements a port for one specific service. Echo ships two per port: `openai-compatible` (talks to a real service) and `fixture`. |
| **Fixture** | Fake, fixed data used by tests. Same input, same output, every time, no internet. Tests use fixtures so they never need a real microphone or a real API key. |
| **Provider / vendor** | The outside company doing the work. Currently Groq, marked temporary. |
| **The access gate** | The username-and-password check that sits in front of every page and endpoint. |
| **Fail closed** | When something is misconfigured, missing or unknown, refuse — never guess and continue. |
| **Route Handler** | A server-side URL that accepts requests. Echo has one: `POST /api/recordings`. |
| **Bounded loop** | The optional automation in `AGENT_WORKFLOW.md`: a *builder* agent writes code, a separate *checker* agent verifies it, an *orchestrator* runs them in turns with hard stop rules. **Currently off.** |
| `npm run check` | The single command that runs everything: style, types, tests, a real production build, and live HTTP tests. |

## Reading map

Read `STATUS.md`, then **only** the rows that match your task. Do not read a document you have not been routed to.

| If you are… | Read | Skip |
| --- | --- | --- |
| Doing anything | this file | — |
| Implementing a `WEB-###` task | that one task entry in `TASKS.md`; `ARCHITECTURE.md` § *Technology Stack*; the § *… boundaries* section of the nearest shipped task | other task entries, `ROADMAP.md`, full `REQUIREMENTS.md` |
| Adding or swapping a transcription / notes service | `DECISIONS.md` ADR-009 and ADR-010; `ARCHITECTURE.md` § *External AI Services* and § *Provider boundaries* | the rest of `DECISIONS.md` |
| Touching login, access or credentials | `ARCHITECTURE.md` § *WEB-001 access and verification boundaries*; `apps/web/src/lib/access.ts` | product docs |
| Touching hosting, deployment or infrastructure | `DECISIONS.md` ADR-008 and ADR-010; `ARCHITECTURE.md` § *Hosting and Deployment* | product docs |
| Working on retention or deletion | `REQUIREMENTS.md` § *Raw audio lifecycle*; `DECISIONS.md` ADR-004 | the rest |
| Introducing **any** framework, database, host, UI library or major service | `AGENTS.md` § *Technology stack constraints*; `ARCHITECTURE.md` § *Changing a stack decision* — **before writing code** | — |
| Running or enabling the bounded loop | `AGENT_WORKFLOW.md` | — |
| Writing documentation only | this file and the file you are editing | — |

Two standing facts, cheaper here than in a search: **provider credentials are server-side only, never `NEXT_PUBLIC_*`**, and **this is Next.js 16** — its APIs differ from model training data, so check `node_modules/next/dist/docs/` before assuming an API exists.

## Update protocol

The point of this section is that **an interrupted task must still be recoverable.** A session can stop at any moment — context exhausted, a crash, an interruption — and what it wrote down is all the next one gets.

1. **Before starting work**, write the *In flight* section: the task, the branch, what you are attempting, and what is not done yet. Do this first, not last.
2. **As you go**, keep it current — especially after finishing a piece. If you are running low on context, **stop and update this file before doing anything else.** An interrupted task with an accurate note is recoverable; finished work nobody recorded is not.
3. **When the task is done**, flip its row in the table, update the verification snapshot with the numbers you actually observed, clear *In flight*, and write the handoff in `TASKS.md`.

Update this file in the same commit as any change to task status, the verification snapshot, an accepted ADR, or what does and does not exist. A task is not done until its `TASKS.md` handoff and this file both say so.

Record the exit codes and counts you actually observed. Never copy a previous run's numbers forward, and never record a check you did not run — write `not run` instead. Keep this file short: if a section grows past a screen, the detail belongs in the document that owns it, and this file should link there.
