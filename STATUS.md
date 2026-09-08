# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Branch:** `eng/ENG-007-pull-request-workflow` · **Base:** `main` @ `71f0451`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**Everything through ENG-002 is merged.** `main` is at `71f0451` and now carries ADR-009, ADR-010, ADR-011, WEB-002, ENG-003, ENG-005, ENG-006, WEB-003 and ENG-002. `main` had been fourteen commits behind; that is resolved, and ENG-007 exists so it cannot recur.

**ENG-007 — pull request workflow, in flight on `eng/ENG-007-pull-request-workflow`.** A pull request template and the `AGENTS.md` rules that make agents open pull requests and never merge. **Branch protection itself is owner-applied** — it lives in GitHub settings and cannot be committed. Required approvals must stay at **zero**: GitHub does not allow approving your own pull request, so requiring one deadlocks a single-owner repository. Not done until the owner applies the rule and confirms a direct push to `main` is refused.

**WEB-003 browser acceptance — Codex is working on it**, on `feat/WEB-002-recording-slice`. Commit `6067b9b` adds `apps/web/src/app/diagnostics/capture/`, a harness that drives the real capture path with synthetic oscillator audio so no microphone permission is needed. Do not edit that branch. As of this writing it was **committed but not pushed**; confirm it reached `origin` before relying on it.

**What still blocks WEB-003:**

1. **No browser has ever run the capture path.** The harness above is the fix, but it has not been run and reviewed. The riskiest untested assumption is the relay: overlap capture runs two `MediaRecorder` instances on one `MediaStream` at once. Plausible, never observed.
2. **Microphone permission and mobile capture cannot be automated** by the synthetic-audio approach. Those stay manual owner checks.

**Two carried-over gaps, neither blocking:**

- **`crypto.subtle` secure-context gap.** `checksum()` in `apps/web/src/lib/recording/session.ts` uses `crypto.subtle.digest`, which browsers expose only over HTTPS or on `localhost`. Self-hosting over plain HTTP on a LAN — an ADR-010 baseline — makes it `undefined`; capture then fails as a generic "Capture incomplete" with no diagnosis. Unreachable today because `dev` and `start` bind `127.0.0.1`. Logged against ENG-002.
- **The container image has never been built.** The `selfhost-container` CI job exists on `main` as of `71f0451` but has not been observed green. `npm run check` proves the standalone bundle, not the image. Do not describe the container as verified until that job passes.

Previously recorded provider environment blocker — **`npm run doctor` now answers this in seconds; check before assuming it still holds:**

**Groq is rejecting `TRANSCRIPTION_API_KEY`** — the server log shows `port=transcription code=unauthorized upstream=401`. The same code path returned HTTP 200 against the live service earlier the same day, so this is a key that was rotated, replaced or mistyped, not a regression. Fix: put a current Groq key into **both** `TRANSCRIPTION_API_KEY` and `LLM_API_KEY` in `apps/web/.env.local` (one key serves both endpoints), with no quotes and no trailing spaces, then restart the server. Nothing in the repository needs changing.

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
| ENG-002 Self-host parity verification | Merged to `main`; **container image unverified until the CI job is observed green** | `main` |
| ENG-007 Pull request workflow | Implemented; branch protection is owner-applied | `eng/ENG-007-pull-request-workflow` |
| ENG-005 Provider doctor | Implemented and verified; awaiting owner review | `feat/WEB-002-recording-slice` |
| WEB-003 Session and playable chunk model | Implemented and verified by test; **browser validation outstanding** | `feat/WEB-002-recording-slice` |

`feat/WEB-002-recording-slice` is branched from the ADR commit, not from `main`, because ADR-009 and ADR-010 were never merged. Merging WEB-002 merges those two ADRs with it.

## What exists today

- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- One page — the recorder — and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice plus the WEB-003 extension: up to one minute of capture, overlapping playable chunks in browser memory, then a transcript and notes per chunk. Verified by test; **never exercised in a real browser.** No stitched session output yet.
- Opt-in `npm run doctor`: safe per-port credential diagnostics, with an offline fixture mode.
- A verified self-hosted deployment path (ENG-002): `output: "standalone"`, an assembly step, a `Dockerfile`, and three parity tests inside `npm run check` that boot the standalone bundle a container would run. The bundle is verified; **the image itself has never been built** — no Docker in the development environment.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Overlap stitching, incremental processing during capture, **saving anything at all**, offline queue, history, speaker labels, research, reminders, background processing, hardware. No database, file storage, or real user accounts. Sessions/chunks exist only in page memory. Nothing is deployed.

## Verification snapshot

Run from the repository root. Last run 2026-09-07 on `feat/WEB-002-recording-slice` @ `67212de`, Node 22.23.2 / npm 10.9.8.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | `check:tracked` OK · lint clean · typecheck clean · **46 unit tests, 46 pass, 0 fail** · production build succeeded · **5 production HTTP tests, 5 pass, 0 fail** · **4 self-host parity tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (bounded controller only) |
| `npm run doctor` (fixture mode) | 0 | Both ports PASS; no credential file read |
| `docker build` / `scripts/container-smoke.mjs` | not run | Docker is not installed in the development environment, and the CI job that would run it is **not committed** — GitHub gates `.github/workflows/` behind a scope agents here do not hold. The job is recorded in the ENG-002 handoff in `TASKS.md` for the owner to add |

Previous green baseline: **33 unit, 4 production HTTP, 16 Python tests**. Every one still exists; ENG-005 and WEB-003 added 13 unit tests and one production HTTP test, and no assertion was removed or relaxed. The 2026-09-06 `EPERM` / `exit 127` snapshot recorded a sandbox failure, not a code failure, and does not reproduce.

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
