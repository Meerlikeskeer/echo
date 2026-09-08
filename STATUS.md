# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Branch:** `feat/WEB-003-browser-acceptance` · **Base:** `main` @ `3d0e87e`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**WEB-004 — durable offline queue, in progress on `feat/WEB-004-durable-queue`, based on `main` @ `a032a01`.** Resuming owner request: no earlier WEB-004 branch or implementation found locally or in fetched branches. First record browser-local storage ADR, then persist/recover existing chunk identities, integrate retries and diagnostics, and verify native IndexedDB plus failure cases. Initial implementation and diagnostic tests written, not verified. Root attempts: `npm ci` exit 255 (EPERM replacing node_modules/.bin, including escalated retry); `npm run check` exit 127 (eslint unavailable after failed install); Python controller command exit 1 (system Python 3.9 RecursionError, no final test count). Preparing an isolated checkout to resolve environment failures, not treating alternate checks as a passing root run. WEB-003 browser measurements below are evidence to reuse, not re-derive. WEB-004 must remain pending owner acceptance.

**Everything through ENG-007 is merged.** `main` is at `3d0e87e` and carries ADR-009 through ADR-011, WEB-002, ENG-002, ENG-003, ENG-005, ENG-006, WEB-003 and ENG-007. `main` had been fourteen commits behind; that is resolved, and the pull request workflow exists so it cannot recur.

**The container image is verified.** On 2026-09-08 the `selfhost-container` CI job built the image and its smoke check passed — the first confirmed build of Echo's Docker image, and the last open item on ENG-002.

**WEB-003 — ADR-011 validated on Chrome 150 and Safari 26.4.** Both engines ran the harness clean: two `MediaRecorder` instances recording concurrently on one `MediaStream`, every container decoding independently, every checksum matching, overlap drift 0–4.8 ms against a ±250 ms tolerance. Full measurements are in the TASKS.md *Browser evidence* section.

**The first browser run found that `captureSession` had never worked in any browser.** `capture.ts` assigned `setTimeout`/`clearTimeout` straight onto its runtime object, so `io.schedule()` set `this` to that object and every browser threw `TypeError: Illegal invocation`. Forty-six unit tests missed it because every one injects a fake runtime — the default object was constructed by no test at all. Fixed, with a regression test that reproduces the browser rule in Node and was verified to fail without the fix.

**Overlap is now mandatory (ADR-011 amended).** Chrome's `MediaRecorder` takes 61–82 ms to start, so at zero overlap ~52 ms per boundary was captured by nothing; Safari starts in 0–2 ms and lost nothing. The same setting was correct on one browser and lossy on another. The recorder now offers 1 s and 2 s only, guarded by a test verified to fail when zero is reintroduced.

**Not finished:** microphone permission, the 60-second auto-stop and chunk playback in the real recorder, and mobile capture — all manual, none coverable by synthetic audio.
**What still blocks WEB-003:**

1. **No browser has ever run the capture path.** The harness above is the fix, but it has not been run and reviewed. The riskiest untested assumption is the relay: overlap capture runs two `MediaRecorder` instances on one `MediaStream` at once. Plausible, never observed.
2. **Microphone permission and mobile capture cannot be automated** by the synthetic-audio approach. Those stay manual owner checks.

**One carried-over gap, not blocking:**

- **`crypto.subtle` secure-context gap.** `checksum()` in `apps/web/src/lib/recording/session.ts` uses `crypto.subtle.digest`, which browsers expose only over HTTPS or on `localhost`. Self-hosting over plain HTTP on a LAN — an ADR-010 baseline — makes it `undefined`; capture then fails as a generic "Capture incomplete" with no diagnosis. Unreachable today because `dev` and `start` bind `127.0.0.1`. Logged against ENG-002.
Previously recorded provider environment blocker — **`npm run doctor` now answers this in seconds; check before assuming it still holds:**

**Groq is rejecting `TRANSCRIPTION_API_KEY`** — the server log shows `port=transcription code=unauthorized upstream=401`. The same code path returned HTTP 200 against the live service earlier the same day, so this is a key that was rotated, replaced or mistyped, not a regression. Fix: put a current Groq key into **both** `TRANSCRIPTION_API_KEY` and `LLM_API_KEY` in `apps/web/.env.local` (one key serves both endpoints), with no quotes and no trailing spaces, then restart the server. Nothing in the repository needs changing.

**ENG-008 — secure-context development server, in flight on `eng/ENG-008-https-dev-server`.** Runs in parallel with WEB-004 and touches no file in that lane. `npm run dev:lan` serves HTTPS on the LAN address so a phone can reach Echo in a secure context, using Next.js 16's built-in `--experimental-https` — no dependency and no stack decision. `npm run dev` still binds `127.0.0.1` over HTTP; exposing the application to the network stays a separately named, deliberate command. A new `secure-context` module refuses capture *before* the microphone opens when `crypto.subtle` is unavailable, naming the address and the fix instead of failing later as the generic "Capture incomplete". That closes the gap logged against ENG-002 and unblocks WEB-003's remaining mobile check. **Certificate trust on the phone is unverified** — the harness has not been opened from a device yet.

Whoever picks up work writes here **before starting**: what is being attempted, what is already done, and what is not. This section is what the next session reads if this one stops without warning. See *Update protocol*.

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

## Where the project is

Echo is a private-first web AI note taker. Three tasks are merged into `main`. One feature branch, `feat/WEB-002-recording-slice`, carries everything since: WEB-002, ENG-003, ENG-006, ENG-005 and WEB-003, plus ADR-009 and ADR-010. It is green and awaiting owner review as a single unit.

| Task | Status | Where |
| --- | --- | --- |
| DOC-001 Repository foundation | Done | `main` |
| ENG-001 Bounded builder/checker workflow | Done | `main` |
| WEB-001 Web shell, access gate, verification tooling | Done | `main` |
| ADR-009 / ADR-010 provider ports and deployment portability | Accepted, **not on `main`** | `docs/ADR-009-provider-selection` @ `93ec5b5` |
| WEB-002 Short recording vertical slice | Implemented, verified live, **awaiting owner review** | `feat/WEB-002-recording-slice` |
| ENG-003 Status file and reading map | Done | `feat/WEB-002-recording-slice` |
| ENG-002 Self-host parity verification | **Done** — merged, and the container image built and passed its smoke check in CI | `main` |
| ENG-007 Pull request workflow | Implemented; branch protection is owner-applied | `eng/ENG-007-pull-request-workflow` |
| ENG-005 Provider doctor | Implemented and verified; awaiting owner review | `feat/WEB-002-recording-slice` |
| WEB-003 Session and playable chunk model | Merged to `main`; browser acceptance harness on `feat/WEB-003-browser-acceptance`, **no browser has run it** | `main` + branch |

`feat/WEB-002-recording-slice` is branched from the ADR commit, not from `main`, because ADR-009 and ADR-010 were never merged. Merging WEB-002 merges those two ADRs with it.

## What exists today

- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- The recorder page, development-only owner-gated `/diagnostics/capture`, and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice plus the WEB-003 extension: up to one minute of capture, overlapping playable chunks in browser memory, then a transcript and notes per chunk. Verified by test; **never exercised in a real browser.** No stitched session output yet.
- Opt-in `npm run doctor`: safe per-port credential diagnostics, with an offline fixture mode.
- A verified self-hosted deployment path (ENG-002): `output: "standalone"`, an assembly step, a `Dockerfile`, and four parity tests inside `npm run check` that boot the standalone bundle a container would run. The image is built and smoke-checked by the `selfhost-container` CI job, which passed on 2026-09-08. Docker is unavailable on the development machine, so the image is verified in CI only.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Overlap stitching, incremental processing during capture, **saving anything at all**, offline queue, history, speaker labels, research, reminders, background processing, hardware. No database, file storage, or real user accounts. Sessions/chunks exist only in page memory. Nothing is deployed.

## Verification snapshot

Run from the repository root. Last run 2026-09-08 on `feat/WEB-003-browser-acceptance`, Node 22.23.2 / npm 10.9.8.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | `check:tracked` OK · lint clean · typecheck clean · **46 unit tests, 46 pass, 0 fail** · production build succeeded · **6 production HTTP tests, 6 pass, 0 fail** · **4 self-host parity tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (bounded controller only) |
| `npm run doctor` (fixture mode) | 0 | Both ports PASS; no credential file read |
| `selfhost-container` CI job | 0 | **Passed 2026-09-08** — image built, no environment file inside it, gate enforced, page and every compiled asset served from the container. Docker is still unavailable locally, so this is verified only in CI |

Counts only ever rise: **33 → 46 unit** and **4 → 6 production HTTP**, plus 4 self-host parity tests added by ENG-002. Nothing was removed or relaxed. The WEB-003 harness added the sixth production HTTP test, which asserts `/diagnostics/capture` returns 404 in production even to an authenticated owner. The repeated `EPERM` / `exit 127` snapshots recorded agent sandbox failures, not code failures, and do not reproduce here.

`npm run check` is the gate CI runs. These counts are a floor: **if a change makes a count go down, that is a regression, not a cleanup.**

**Live service check — 2026-09-06, first one ever performed.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. This retires the previous "no live vendor call has ever been made" caveat. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** microphone permission prompts, the 60-second auto-stop, independent browser decoding and mobile capture. An earlier synthetic Safari probe was blocked by sandbox filesystem and socket restrictions; that limit was environment-specific and `npm run dev` starts normally here. No long clip has been timed.

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
