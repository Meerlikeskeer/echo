# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Branch:** `eng/ENG-010-deploy-hosted-origin` · **Base:** `main` @ `f234040`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**ENG-010 — deploy Echo to a hosted HTTPS origin. In progress on `eng/ENG-010-deploy-hosted-origin`, off `main` @ `f234040`.** This is the task ADR-013 put ahead of mobile: nothing is deployed, so nothing outside the machine running Echo has ever reached it, and the `crypto.subtle` secure-context gap has no fix until a real certificate exists.

**Scope.** Make a deployment reproducible from the repository rather than from a dashboard click-path, and make "it is deployed" a check rather than a claim. Three deliverables: a committed `vercel.json` so the build is defined in version control; `scripts/deployed-smoke.mjs`, which verifies a live origin over HTTPS without printing credentials; and a README runbook naming the exact provisioning steps and environment variables. No new dependency, framework, host or storage decision — ADR-008 and ADR-010 already govern this and neither changes.

**What this task cannot do.** Provisioning needs the owner's Vercel account and the owner's secrets. An agent cannot run `vercel login`, create the project, or set `ECHO_OWNER_PASSWORD`. So this task ends with everything the owner needs and an unrun smoke check; the first real deployment and the first green `npm run test:deployed` are the owner's step, and until they happen **Echo is still not deployed.**

**The risk this exists to catch.** `apps/web/src/proxy.ts` deliberately gates every path with no exclusions, and `scripts/production.test.mjs` proves that against `next start`. A hosted platform serves `/_next/static` from a CDN, which may answer before the proxy runs. If it does, compiled assets are public on the deployed origin while every local check stays green. `deployed-smoke.mjs` fetches each linked asset unauthenticated and fails if any returns 200. This is unverified until it runs against a real deployment.

**Not this task:** mobile capture acceptance (its own task, once a deployed origin exists), WEB-004's browser acceptance, and any server-side storage decision.

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
- A secure-context guard (ENG-008) that refuses capture *before* the microphone opens on any origin without `crypto.subtle`, naming the address rather than failing later as a generic "Capture incomplete".
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Overlap stitching, incremental processing during capture, **saving anything at all**, offline queue, history, speaker labels, research, reminders, background processing, hardware. No database, file storage, or real user accounts. Sessions/chunks exist only in page memory. Nothing is deployed.

**No network access to Echo, by decision (ADR-013).** `dev` and `start` bind `127.0.0.1` and no script binds any other interface, so Echo is reachable only from the machine running it. Capture therefore cannot be exercised from a phone or any second device, and mobile acceptance is deferred until a deployed HTTPS origin exists. Re-adding a non-loopback bind reverses an accepted decision and needs its own ADR.

## Verification snapshot

Run from the repository root. **Rows below are the ENG-009 run: 2026-09-08 on `eng/ENG-009-withdraw-lan-exposure` @ `a032a01` + this branch, Node 22.23.2 / npm 10.9.8, in a clean worktree checkout.** All four commands were executed; nothing is copied forward.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | `check:tracked` OK · lint clean · typecheck clean · **53 unit tests, 53 pass, 0 fail** · production build succeeded · **6 production HTTP tests, 6 pass, 0 fail** · **4 self-host parity tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (bounded controller only) |
| `npm run doctor` (fixture mode) | not run | Not executed for ENG-009; this change touches no provider code. Previous run: both ports PASS, no credential file read |
| `selfhost-container` CI job | 0 | **Passed 2026-09-08** — image built, no environment file inside it, gate enforced, page and every compiled asset served from the container. Docker is still unavailable locally, so this is verified only in CI |

Counts only ever rise: **33 → 46 → 52 → 53 unit** and **4 → 6 production HTTP**, plus 4 self-host parity tests added by ENG-002. Nothing was removed or relaxed. ENG-009 removed a script and a README section, not a check: its only test-file change takes `secure-context.test.ts` from 4 tests to 5, verified against `main` by diff. The WEB-003 harness added the sixth production HTTP test, which asserts `/diagnostics/capture` returns 404 in production even to an authenticated owner. The repeated `EPERM` / `exit 127` snapshots recorded agent sandbox failures, not code failures, and do not reproduce here.

`npm run check` is the gate CI runs. These counts are a floor: **if a change makes a count go down, that is a regression, not a cleanup.**

**Live service check — 2026-09-06, first one ever performed.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. This retires the previous "no live vendor call has ever been made" caveat. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** microphone permission prompts, the 60-second auto-stop and independent browser decoding — all of which run on the host machine over loopback. An earlier synthetic Safari probe was blocked by sandbox filesystem and socket restrictions; that limit was environment-specific and `npm run dev` starts normally here. No long clip has been timed. **Mobile capture is no longer listed here as unverified work in progress: under ADR-013 it is deferred until a deployed origin exists.**

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
