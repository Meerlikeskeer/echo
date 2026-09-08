# Status

**Read this file first, then follow the reading map.** Repository source documents win over this cache; current owner instructions can change scope.

**Updated:** 2026-09-08 · **Branch:** `feat/WEB-004-durable-queue` · **Base:** `main` @ `a032a01`

## In flight

**WEB-004 — implemented, verification incomplete, NOT Done.** [PR #9](https://github.com/Meerlikeskeer/echo/pull/9) contains only WEB-004. Code at `64ba19b` adds native IndexedDB persistence and recovery, identity-preserving retries, quota/unsaved notices, download and native-browser diagnostics. ADR-012 precedes implementation. No dependency or server-side storage choice. `capture.ts` necessarily adds an awaited per-complete-container callback because it previously built chunks only at session end; `session.ts` is unchanged. Independent read-only checker reviewed the fixes at `64ba19b` and found no remaining serious code defect; this is not browser acceptance.

**Remaining:** native browser test results, physical mobile acceptance and a green local controller command. Safari loaded the owner-gated diagnostic page with HTTP 200, but automation lost its page view and returned `elementHasNoFrame` / `noWindowsAvailable` on interaction. No native test PASS was observed. Do not claim IndexedDB/browser acceptance from unit tests or from the earlier WEB-003 capture evidence. Exact manual steps and remaining limits are in the WEB-004 handoff in TASKS.md.

**GitHub contribution works:** task commits are pushed and the automatically opened PR is reviewable. No merge performed. CI at `64ba19b` passed full application checks and the container job. Local execution has filesystem restrictions described below; these are not GitHub authentication failures.

**Existing browser evidence:** WEB-003 validated ADR-011 on Chrome 150 and Safari 26.4. Complete chunks decoded independently and checksums matched. Reuse TASKS.md's *Browser evidence* measurements: Safari ~153 KB/6 s vs Chrome ~96 KB/6 s; MIME parameter whitespace differs. Mandatory product overlap is 1 or 2 seconds. Do not re-derive these measurements. WEB-003's physical microphone/mobile checks remain manual.

**Merged base:** `a032a01` includes ENG-008 secure-context diagnosis and HTTPS LAN development, plus the earlier WEB-003 browser fixes. The old STATUS claims that no browser had run capture and that the secure-context diagnosis was missing were stale and are removed here. Phone certificate trust remains unverified. The existing provider-key diagnostic note was historical; use the opt-in doctor when investigating provider access, without reading or printing credentials.

## What exists and what does not

The approved Next.js application remains behind the owner access gate. WEB-004 saves each completed audio container and metadata in browser-local IndexedDB, recovers and checks bytes, retains processing results, and retries while the page is active. The adapter exposes no deletion operation; no HTTP response is counted as a verified remote copy. A 64 MiB audio budget and 4 MiB warning reserve use Safari sizing. Native diagnostic pages are development-only and owner-gated; production denies them.

No server audio storage, relational database, production user accounts, stitched transcript, incremental upload during capture, authenticated offline application-shell cache, background worker, history product, research/reminder export or hardware is introduced. Browser storage can be evicted or cleared. Abrupt termination can lose the unfinished container; a closed/suspended page cannot upload. Offline hard navigation must wait until the same origin's application is reachable. Exactly-once remote provider processing after an ambiguous response requires later server work; retries do not duplicate local chunk identities/results.

## Verification snapshot

**Observed for code `64ba19b`, Node 22.23.2 locally. Local results and CI are separate evidence.** Logs are summarized in TASKS.md; no substituted command is reported as the required command passing.

| Location / command | Exit | Observed result |
| --- | --- | --- |
| Original repository root: `npm ci` | 255 | EPERM removing `apps/web/node_modules/.bin`; escalated retry also failed. Dependency repair is recorded in TASKS.md. |
| Original repository root: `npm run check` | 127 | Source tracking passed; eslint executable missing after failed install. No unit, HTTP or self-host tests ran in this attempt. |
| Original root: `python3 -m unittest discover -s tests` (system Python 3.9) | 1 | RecursionError during cleanup; no final count. |
| Original root: same Python command with Python 3.12 selected through PATH | 1 | 16 tests ran; 16 cleanup errors from forbidden rmdir in temporary repositories. Not a pass. |
| Isolated checkout: `npm ci --cache /private/tmp/echo-web004-npm-cache` | 0 | Installed dependencies, 0 vulnerabilities; cleanup warnings. Same committed application sources; denied environment paths omitted. |
| Isolated checkout: `npm run check` | 1 | Source tracking, lint, types and **68 unit tests: 68 pass, 0 fail**. Build blocked by EPERM removing `.next/types`; production HTTP and self-host tests **not run locally**. Escalated attempt previously had the same failure. |
| GitHub Actions: `npm ci` | 0 | [Run 34191686984](https://github.com/Meerlikeskeer/echo/actions/runs/34191686984), code `64ba19b`. |
| GitHub Actions: `npm run check` | 0 | Same run: **68 unit, 7 production HTTP, 4 self-host parity; all pass, 0 fail**. Production build passed. |
| GitHub Actions: `selfhost-container` | 0 | Same run: container build and smoke check passed. |
| Native IndexedDB/capture persistence diagnostics | not verified | Page loaded in Safari; automation could not obtain a test result. |

The owner's incoming floor was 48 unit, 6 production HTTP and 4 self-host parity tests. Current main actually contributed 54 unit tests (including ENG-008); WEB-004 adds 14. No previous assertion or check was removed or weakened. Controller baseline remains 16 tests, but the local run is not green. Docker, live providers and provider doctor were not run locally for WEB-004.

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
