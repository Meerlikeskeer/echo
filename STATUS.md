# Status

**Read this file first. It is the only file every session must read.** It exists so a session can start work without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-06 · **Branch:** `feat/WEB-002-recording-slice` · **Base:** `main` @ `0931376`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## Where the project is

Echo is a private-first web AI note taker. Three tasks are merged into `main`; the fourth is implemented and awaiting review.

| Task | Status | Where |
| --- | --- | --- |
| DOC-001 Repository foundation | Done | `main` |
| ENG-001 Bounded builder/checker workflow | Done | `main` |
| WEB-001 Web shell, access gate, verification tooling | Done | `main` |
| ADR-009 / ADR-010 provider ports and deployment portability | Accepted, **not on `main`** | `docs/ADR-009-provider-selection` @ `93ec5b5` |
| WEB-002 Short recording vertical slice | Implemented, verified, **awaiting owner review** | `feat/WEB-002-recording-slice` |
| ENG-002 Self-host parity verification | Todo — independent of the WEB sequence | — |
| WEB-003 Session and playable chunk model | **Next**, after WEB-002 merges | — |

`feat/WEB-002-recording-slice` is branched from the ADR commit, not from `main`, because ADR-009 and ADR-010 were never merged. Merging WEB-002 merges those two ADRs with it.

## What exists today

- A Next.js App Router app behind a fail-closed single-owner HTTP Basic gate (Proxy over every route, plus an independent server-render guard).
- One page — the recorder — and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice: record one 30–60 second clip, post it once, get back a transcript and generated notes.
- Provider ports with two adapters each: `openai-compatible` (the ADR-009 wire format) and `fixture` (deterministic, no I/O, used by every test).
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own Python tests. **Its feature loop is disabled** (`agent-loop.json` has `"ready": false`).

## What does not exist

Sessions, chunking, overlap stitching, incremental processing, **persistence of any kind**, offline queue, history, diarization, research, reminders, background processing, hardware. No database, object storage, or production authentication. Nothing is deployed.

## Verification snapshot

Run from the repository root. Last run 2026-09-06 on `feat/WEB-002-recording-slice`.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | clean install, 0 vulnerabilities |
| `npm run check` | 0 | lint → typecheck → **31 unit tests** → production build → **4 production HTTP tests**; 0 failures |
| `python3 -m unittest discover -s tests` | 0 | **16 tests**, controller only |

`npm run check` is the aggregate gate and is what CI runs. These counts are the baseline: **if a change makes a count go down, that is a regression, not a cleanup.**

**Not verified, at all:** no live transcription/LLM vendor call has ever been made from this repository (adapters are tested against a stubbed transport); no browser has been driven, so `MediaRecorder`, permission prompts and mobile capture are unexercised; REQ-006's 5–10 second latency target is unmeasured.

## Reading map

Read `STATUS.md`, then **only** the rows that match your task. Do not read a document you have not been routed to.

| If you are… | Read | Skip |
| --- | --- | --- |
| Doing anything | this file | — |
| Implementing a `WEB-###` task | that one task entry in `TASKS.md`; `ARCHITECTURE.md` § *Technology Stack*; the § *… boundaries* section of the nearest shipped task | other task entries, `ROADMAP.md`, full `REQUIREMENTS.md` |
| Adding or swapping a transcription / LLM vendor | `DECISIONS.md` ADR-009 and ADR-010; `ARCHITECTURE.md` § *External AI Services* and § *Provider boundaries* | the rest of `DECISIONS.md` |
| Touching auth, access or credentials | `ARCHITECTURE.md` § *WEB-001 access and verification boundaries*; `apps/web/src/lib/access.ts` | product docs |
| Touching hosting, deployment or infrastructure | `DECISIONS.md` ADR-008 and ADR-010; `ARCHITECTURE.md` § *Hosting and Deployment* | product docs |
| Working on retention or deletion | `REQUIREMENTS.md` § *Raw audio lifecycle*; `DECISIONS.md` ADR-004 | the rest |
| Introducing **any** framework, database, host, UI library or major service | `AGENTS.md` § *Technology stack constraints*; `ARCHITECTURE.md` § *Changing a stack decision* — **before writing code** | — |
| Running or enabling the bounded loop | `AGENT_WORKFLOW.md` | — |
| Writing documentation only | this file and the file you are editing | — |

Two standing facts that are cheaper here than in a search: **provider credentials are server-side only, never `NEXT_PUBLIC_*`**, and **this Next.js is version 16** — its APIs and conventions differ from model training data, so check `node_modules/next/dist/docs/` before assuming an API exists.

## Update protocol

Update this file **in the same commit** as any change to: task status, the verification snapshot, an accepted ADR, or what exists / does not exist. A task is not done until its `TASKS.md` handoff and this file both say so.

When you update the snapshot, record the exit codes and counts you actually observed. Never copy a previous run's numbers forward, and never record a check you did not run — write `not run` instead. Keep this file short: if a section is growing past a screen, the detail belongs in the document that owns it, and this file should link there instead.
