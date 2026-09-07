# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-06 · **Branch:** `feat/WEB-002-recording-slice` · **Base:** `main` @ `0931376`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

*Nothing in progress.*

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

Echo is a private-first web AI note taker. Three tasks are merged into `main`; the fourth is implemented and awaiting review.

| Task | Status | Where |
| --- | --- | --- |
| DOC-001 Repository foundation | Done | `main` |
| ENG-001 Bounded builder/checker workflow | Done | `main` |
| WEB-001 Web shell, access gate, verification tooling | Done | `main` |
| ADR-009 / ADR-010 provider ports and deployment portability | Accepted, **not on `main`** | `docs/ADR-009-provider-selection` @ `93ec5b5` |
| WEB-002 Short recording vertical slice | Implemented, verified live, **awaiting owner review** | `feat/WEB-002-recording-slice` |
| ENG-003 Status file and reading map | Done | `feat/WEB-002-recording-slice` |
| ENG-002 Self-host parity verification | Todo — independent of the WEB sequence | — |
| WEB-003 Session and playable chunk model | **Next**, after WEB-002 merges | — |

`feat/WEB-002-recording-slice` is branched from the ADR commit, not from `main`, because ADR-009 and ADR-010 were never merged. Merging WEB-002 merges those two ADRs with it.

## What exists today

- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- One page — the recorder — and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice: record one 30–60 second clip, send it once, get back a transcript and generated notes.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Sessions, chunking, overlap stitching, incremental processing, **saving anything at all**, offline queue, history, speaker labels, research, reminders, background processing, hardware. No database, file storage, or real user accounts. Nothing is deployed.

## Verification snapshot

Run from the repository root. Last run 2026-09-06 on `feat/WEB-002-recording-slice`.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | clean install, 0 vulnerabilities |
| `npm run check` | 0 | style → types → **33 unit tests** → production build → **4 live HTTP tests**; 0 failures |
| `python3 -m unittest discover -s tests` | 0 | **16 tests**, bounded controller only |

`npm run check` is the gate CI runs. These counts are a floor: **if a change makes a count go down, that is a regression, not a cleanup.**

**Live service check — 2026-09-06, first one ever performed.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. This retires the previous "no live vendor call has ever been made" caveat. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** no browser has been driven by a test, so microphone permission prompts, the 60-second auto-stop and mobile capture are exercised only by hand. No long clip has been timed.

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
