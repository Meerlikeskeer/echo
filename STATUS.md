# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Branch:** `docs/DOC-002-status-after-eng-010` · **Base:** `main` @ `318c356`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**ENG-010 — DONE and merged** (PRs #11 and #12, `main` @ `318c356`). `vercel.json`, `scripts/deployed-smoke.mjs` and `npm run test:deployed` are on `main`, with the provisioning runbook in `README.md` → *Deployment*. ADR-014 was accepted mid-task: `git.deploymentEnabled` is `false`, so a push builds nothing and deploying is always an explicit command. **Merged and deployed are separate states** — check which commit is live before concluding anything from a deployed origin.

**Deployment state, 2026-09-08 — provisioning started, nothing deployed yet.** The Vercel project exists and this checkout is linked to it (`.vercel/project.json`, project `echo`). The owner set all ten environment variables for **Production and Preview**: `ECHO_OWNER_USERNAME`, `ECHO_OWNER_PASSWORD`, and the `TRANSCRIPTION_*` and `LLM_*` groups. **No deployment has been created**, so no hosted origin exists and `npm run test:deployed` has still never met a CDN or a real certificate. Remaining, and owner-only because the CLI needs their account: `npx vercel` for a preview, `npm run test:deployed -- <preview URL>`, then `npx vercel --prod` and the check again. An agent cannot run these — `npx` fails from an agent sandbox on npm cache permissions, separately from the account question.

**WEB-004 native browser acceptance — in flight elsewhere.** `test/WEB-004-browser-acceptance` (draft PR #13) records a blocked attempt: no native PASS was observed, Safari could not connect to the development server and Chrome automation refused actions. Nothing there indicates a code defect, and no application source was changed. The four acceptance steps in the WEB-004 handoff are owner checks by design; the development server needs `ECHO_OWNER_USERNAME`, a 32+ character `ECHO_OWNER_PASSWORD` and `TRANSCRIPTION_PROVIDER=fixture LLM_PROVIDER=fixture`, which requires no real credentials.

**The risk this exists to catch, and proof the check is not vacuous.** `apps/web/src/proxy.ts` deliberately gates every path with no exclusions, and `scripts/production.test.mjs` proves that against `next start`. A hosted platform serves `/_next/static` from a CDN, which may answer before the proxy runs. If it does, compiled assets are public on the deployed origin while every local check stays green. `deployed-smoke.mjs` fetches each linked asset unauthenticated and fails if any returns 200 — and on 2026-09-08 that assertion was **demonstrated to fire** against a deliberately broken origin: a local proxy standing in for a CDN edge, serving `/_next/static` without credentials and passing everything else through. The script failed on the first asset with the intended message. Five other negative controls behaved correctly; see the verification snapshot.

**Not this task:** mobile capture acceptance (its own task, once a deployed origin exists), WEB-004's browser acceptance, and any server-side storage decision.

**ENG-011 — the first production deployment failed, and the cause is fixed on `eng/ENG-011-vercel-dev-dependencies`.** `npx vercel --prod` at `318c356` returned only `Command "npm run build" exited with 1`. Reproduced in a clean clone: Vercel sets `NODE_ENV=production` for the install, npm reads that as `--omit=dev`, and ENG-010's `npm ci` therefore installed 26 packages instead of 373 — without `typescript`, `tailwindcss` or `@tailwindcss/postcss`, all of which `next build` needs. `vercel.json` now uses `npm ci --include=dev`, verified by reproducing the failure and the fix locally. **No local suite could have caught this:** `npm run check`, CI and the container build all install with `NODE_ENV` unset. Merge that branch before deploying again. See the ENG-011 handoff in TASKS.md.

**WEB-004 merged underneath this branch (PR #9, `main` @ `6cee6fd`) and is folded in here.** Echo now saves completed audio containers in browser-local IndexedDB. That does not change ENG-010's scope, but it raises the stakes of deploying correctly: recorded audio now persists in the browser, and `checksum()` still needs `crypto.subtle`, so a deployed origin must be HTTPS for the queue to work at all. WEB-004's own remaining item — native browser acceptance of the IndexedDB path — is untouched by this task and still outstanding.

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

Echo is a private-first web AI note taker. Everything through WEB-004 is merged into `main` @ `6cee6fd`. One branch is open: this one.

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
| WEB-003 Session and playable chunk model | **Done** — merged; ADR-011 validated on Chrome 150 and Safari 26.4 | `main` |
| ENG-008 Secure-context diagnosis | **Done** — merged; its `dev:lan` half was withdrawn by ADR-013 | `main` |
| ENG-009 Withdraw LAN exposure; pause mobile | **Done** — merged (PR #10); recorded ADR-013 | `main` |
| WEB-004 Browser-local durable queue | Merged (PR #9); **native browser acceptance outstanding** and it is the only thing still open | `main` |
| ENG-010 Reproducible deployment and deployed-origin check | **Done** — merged; project linked and variables set, but **nothing is deployed yet** | `main` |


## What exists today

- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- The recorder page, development-only owner-gated `/diagnostics/capture`, and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice plus the WEB-003 extension: up to one minute of capture, overlapping playable chunks in browser memory, then a transcript and notes per chunk. Verified by test; **never exercised in a real browser.** No stitched session output yet.
- Opt-in `npm run doctor`: safe per-port credential diagnostics, with an offline fixture mode.
- A verified self-hosted deployment path (ENG-002): `output: "standalone"`, an assembly step, a `Dockerfile`, and four parity tests inside `npm run check` that boot the standalone bundle a container would run. The image is built and smoke-checked by the `selfhost-container` CI job, which passed on 2026-09-08. Docker is unavailable on the development machine, so the image is verified in CI only.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- A secure-context guard (ENG-008) that refuses capture *before* the microphone opens on any origin without `crypto.subtle`, naming the address rather than failing later as a generic "Capture incomplete".
- Browser-local durable storage (WEB-004): each completed audio container and its metadata are saved in IndexedDB, recovered and checksummed after a reload, and retried while the page is active, with a 64 MiB audio budget and a 4 MiB warning reserve. Results never delete raw audio and no HTTP response is counted as a verified remote copy. Development-only, owner-gated `/diagnostics/queue` exercises the adapter natively. **No browser has yet run that acceptance.**
- A deployment defined in version control (ENG-010): `vercel.json`, and `npm run test:deployed` → `scripts/deployed-smoke.mjs`, which verifies a live origin over its real certificate — the gate, wrong-credential refusal, every linked compiled asset refused without credentials, `/diagnostics/*` absent, the Route Handler's own guard, and no password or `NEXT_PUBLIC_` value in anything served. Host-agnostic by design (ADR-010): it checks an origin, not a platform. **It has never met a hosted deployment.**
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Overlap stitching, incremental processing during capture, history, speaker labels, research, reminders, background processing, hardware. No database, server-side file storage, or real user accounts. **No hosted origin exists.** The Vercel project is created and its Production and Preview environment variables are set, but no deployment has been run, so there is still nothing to browse to and nothing for `npm run test:deployed` to check.

**What WEB-004 does and does not promise.** Audio is saved in *this browser*, not on a server: site data can be evicted or cleared, private browsing is temporary, and an abrupt termination can still lose the container that was mid-recording. A closed or suspended page cannot upload, and exactly-once remote provider processing after a lost HTTP response needs later server work — retries never duplicate a local chunk or result, but a provider may see the same audio twice.

**No network access to Echo, by decision (ADR-013).** `dev` and `start` bind `127.0.0.1` and no script binds any other interface, so Echo is reachable only from the machine running it. Capture therefore cannot be exercised from a phone or any second device, and mobile acceptance is deferred until a deployed HTTPS origin exists. Re-adding a non-loopback bind reverses an accepted decision and needs its own ADR.

## Verification snapshot

Run from the repository root. **Rows below were re-run on merged `main` @ `318c356` — not copied forward from the ENG-010 branch: 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6.**

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | `check:tracked` OK · lint clean · typecheck clean · **69 unit tests, 69 pass, 0 fail** · production build succeeded · **7 production HTTP tests, 7 pass, 0 fail** · **4 self-host parity tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (bounded controller only) |
| `npm run test:deployed -- http://127.0.0.1:3131` | 0 | Against a local `next start` production server built from `main`: gate challenged, wrong credentials refused, page served to the owner, **9 compiled assets each refused unauthenticated and served to the owner**, **both `/diagnostics/capture` and WEB-004's `/diagnostics/queue` 404 for the authenticated owner**, `POST /api/recordings` refused anonymously and 503 to an empty authorized body. Noted providers unconfigured and that loopback does not verify transport |
| `npm run doctor` (fixture mode) | not run | Not executed for ENG-010; this change touches no provider code |
| `selfhost-container` CI job | not run locally | Docker is unavailable on this machine; last passed in CI on 2026-09-08 |
| Against a **hosted** deployment | **not run** | The Vercel project is linked and its variables are set, but no deployment has been created. `vercel.json` has never been built by Vercel and the script has never met a CDN or a real certificate |
| Native IndexedDB/capture diagnostics (WEB-004) | **not verified** | Inherited from WEB-004 and not this task's to close: no browser has run `/diagnostics/queue` |

**Negative controls — the deployed check was made to fail on purpose, six ways.** A check that has only ever passed proves nothing:

| Broken condition | Exit | Behaviour |
| --- | --- | --- |
| A proxy serving `/_next/static` without credentials, standing in for a CDN edge | 1 | Failed on the first asset: *"is served without credentials. The hosting platform is answering for it before Echo's proxy runs"* — **this is the failure the whole script exists for** |
| Wrong owner password | 1 | *"the owner must reach the deployed page"* |
| Plain HTTP on a non-loopback host | 1 | Refused before any request, naming Basic credentials and `crypto.subtle` |
| Credentials embedded in the URL | 2 | Refused; directs them to the environment instead |
| Unreachable origin | 1 | *"nothing answered … (ECONNREFUSED)"*, not an undici stack trace |
| Missing `ECHO_OWNER_*` in the environment | 2 | Usage error naming both variables |

Counts only ever rise: **33 → 46 → 52 → 53 → 69 unit** and **4 → 6 → 7 production HTTP**, plus 4 self-host parity and 16 controller. ENG-010 adds no test to `npm run check` and removes none: `test:deployed` is deliberately outside the gate because it needs a live URL and real credentials, so CI cannot run it and must not appear to.

`npm run check` is the gate CI runs. These counts are a floor: **if a change makes a count go down, that is a regression, not a cleanup.**

**Live service check — 2026-09-06.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** microphone permission prompts, the 60-second auto-stop and independent browser decoding; WEB-004's IndexedDB acceptance in a native browser; and everything that needs a hosted origin — the transport itself, Vercel's build of `vercel.json`, and whether a CDN edge answers for `/_next/static` in practice. **Mobile capture is deferred under ADR-013** until that origin exists.

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
