# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Branch:** `docs/DOC-004-deployed-check-passes` · **Base:** `eng/ENG-013-deployment-protection` @ `4fe9f03`, which is `main` @ `26006fb` plus DOC-003 and ENG-013

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

## In flight

**DOC-004 — done, on `docs/DOC-004-deployed-check-passes`, awaiting review.** Recorded that `npm run test:deployed` completed its first full pass against the hosted origin, and closed the CDN static-asset question ENG-010 was built to ask. Documentation only — `STATUS.md` and `TASKS.md`, no application source. Stacked on `eng/ENG-013-deployment-protection` rather than `main`, declared: the run it records is the run that made ENG-013's diagnostic stop firing, and it edits the same paragraphs, so branching from `main` would have guaranteed a conflict and split one story across two reviews.

**Two pull requests are open and mergeable, in this order: #19 then #20.** `eng/ENG-013-deployment-protection` is **#19**, and `docs/DOC-004-deployed-check-passes` is **#20**, stacked on it. DOC-003 is **already on `main`** (merged as #17, `main` @ `26006fb`) — ENG-013 carries its commit only because it branched from it, so there is nothing separate to merge there. Reviewing #20 alone is enough to see the outcome; #19 underneath it is the script change that produced the diagnosis.

**Both were opened automatically by `.github/workflows/open-pull-request.yml` on push, which is ENG-007 working as designed.** An agent cannot open them: `git push` over HTTPS succeeds from the sandbox, but `gh` and `api.github.com` fail certificate verification through the TLS-intercepting proxy — the exact condition ENG-007 documents. **An agent therefore cannot confirm a pull request exists by asking the API, and must not assume one is missing because the API was unreachable.** The reliable check from a sandbox is the git protocol, which does work: `git ls-remote origin 'refs/pull/*/head'` maps pull request numbers to head commits, and a matching `refs/pull/<n>/merge` means it is open and mergeable.

**Open, and none of it blocked by anything now.**

1. **WEB-004 native browser acceptance** — four owner checks in Chrome and Safari at `/diagnostics/queue`. The development server needs `ECHO_OWNER_USERNAME`, a 32+ character `ECHO_OWNER_PASSWORD`, and `TRANSCRIPTION_PROVIDER=fixture LLM_PROVIDER=fixture`. No real credentials required.
2. **Mobile capture acceptance** — unblocked by the deployed HTTPS origin under ADR-013, and now doubly so: the origin is not merely reachable, it is verified. **Not yet opened as a task.**
3. **WEB-005 incremental upload** — Codex is starting it on `feat/WEB-005-incremental-upload`. Do not edit that branch's files from here.
4. **`next-config.test.ts` is coupled to the checkout directory name** and therefore fails in any git worktree. Not a regression and not a code defect — see the note under the verification snapshot. It belongs to **ENG-012**; the fix is one line. It matters because parallel branches in worktrees are now the normal way of working here, and `npm run check` cannot pass in one.
5. **Proposed, not started:** split this *In flight* section into `status/in-flight/<TASK-ID>.md`, one file per active task, so parallel branches stop conflicting on it. **Needs an ADR** — this file's role as the single thing every session reads is an accepted convention, and splitting it changes that convention. This branch is itself an example of the problem: it had to stack on ENG-013 to avoid competing for these lines.

**ENG-010 — DONE and merged** (PRs #11 and #12, `main` @ `318c356`). `vercel.json`, `scripts/deployed-smoke.mjs` and `npm run test:deployed` are on `main`, with the provisioning runbook in `README.md` → *Deployment*. ADR-014 was accepted mid-task: `git.deploymentEnabled` is `false`, so a push builds nothing and deploying is always an explicit command. **Merged and deployed are separate states** — check which commit is live before concluding anything from a deployed origin.

**Deployment state, 2026-09-08 — provisioned, deployed and verified.** The Vercel project exists and this checkout is linked to it (`.vercel/project.json`, project `echo`). The owner set all ten environment variables for **Production and Preview**: `ECHO_OWNER_USERNAME`, `ECHO_OWNER_PASSWORD`, and the `TRANSCRIPTION_*` and `LLM_*` groups — and the deployed check confirms the provider groups are actually reaching the running application, not merely present in the dashboard. **Deploying and checking stay owner-only:** `npx vercel` needs their account, and `npx` also fails from an agent sandbox on npm cache permissions, so an agent cannot run either the deploy or `npm run test:deployed`. Report an agent's inability to run them as `not run`, never infer the result.

**WEB-004 native browser acceptance — in flight elsewhere.** `test/WEB-004-browser-acceptance` (draft PR #13) records a blocked attempt: no native PASS was observed, Safari could not connect to the development server and Chrome automation refused actions. Nothing there indicates a code defect, and no application source was changed. The four acceptance steps in the WEB-004 handoff are owner checks by design; the development server needs `ECHO_OWNER_USERNAME`, a 32+ character `ECHO_OWNER_PASSWORD` and `TRANSCRIPTION_PROVIDER=fixture LLM_PROVIDER=fixture`, which requires no real credentials.

**The risk this exists to catch, and proof the check is not vacuous.** `apps/web/src/proxy.ts` deliberately gates every path with no exclusions, and `scripts/production.test.mjs` proves that against `next start`. A hosted platform serves `/_next/static` from a CDN, which may answer before the proxy runs. If it does, compiled assets are public on the deployed origin while every local check stays green. `deployed-smoke.mjs` fetches each linked asset unauthenticated and fails if any returns 200 — and on 2026-09-08 that assertion was **demonstrated to fire** against a deliberately broken origin: a local proxy standing in for a CDN edge, serving `/_next/static` without credentials and passing everything else through. The script failed on the first asset with the intended message. **On 2026-09-08 the same assertion then passed against the real Vercel edge**, which is the outcome that closes the question rather than merely proving the check works. Six other negative controls behaved correctly; see the verification snapshot.

**Not this task:** mobile capture acceptance (its own task — the deployed origin now exists, so it can be opened), WEB-004's browser acceptance, and any server-side storage decision.

**ENG-012 — CONFIRMED against Vercel: the build now completes.** Merged as `main` @ `53c0851`. The 2026-09-08 deployment log shows `Running onBuildComplete from Vercel`, the route table, and **`Build Completed in /vercel/output [20s]`** — the `ENOENT … next-server.js.nft.json` failure is gone. Making `output: "standalone"` conditional on `process.env.VERCEL` was the fix, and it is now verified on the platform rather than only locally. ADR-010's container path is unaffected; `.next/standalone` is still produced off Vercel and the four self-host parity tests still pass.

**ECHO IS DEPLOYED — 2026-09-08.** The first hosted origin exists, over HTTPS, behind the owner gate, with the owner's own credentials working in a browser. The upload-step failure that followed the successful build was Vercel's **preview comments / Vercel Toolbar** feature: `Cannot patch preview comments when immutable static file upload is enabled`, followed by an empty `Unexpected error`. Its advice to upgrade Next was inapplicable — the repository is on 16.3.4 and `16.3.0-canary.32` is a prerelease of `16.3.0`. **Disabling the Vercel Toolbar for the project resolved it.** No repository change was involved, and none should be made in response to that error if it recurs; three deployment failures in a row were the platform around the build rather than the build.

**What this unblocks.** ADR-013 deferred mobile capture until a deployed HTTPS origin existed. It exists, so **mobile capture acceptance can now be opened as its own task.** The `crypto.subtle` secure-context gap is closed on that origin for the same reason: HTTPS means `checksum()` works, so WEB-004's durable queue can operate somewhere other than the development machine.

**Vercel Deployment Protection was turned off by the owner, and it was the last thing in the way.** Before that, anonymous requests got **302** to `https://vercel.com/sso-api` rather than Echo's 401 challenge, so **Echo's own gate was never reached and access was controlled by the Vercel account instead**. ENG-013 made the script name that rather than fail with a bare `302 !== 401`; it fired correctly, and turning Vercel Authentication off in Settings → Deployment Protection cleared it. It was an owner setting, never a code change. That was the second platform-in-front-of-the-application problem the deployed check caught, which is exactly what it exists for.

**ANSWERED — 2026-09-08. `npm run test:deployed` completed its first full pass against the hosted origin, and Vercel's edge does not bypass Echo's gate.** Run by the owner against `https://echo-73alocfwt-meerlikeskeers-projects.vercel.app/`, exit 0:

> `deployed-smoke: OK — https://echo-73alocfwt-meerlikeskeers-projects.vercel.app challenges anonymous requests, refuses wrong credentials, serves the page and 9 compiled assets to the owner only, hides diagnostics, and guards the recording endpoint.`
> `deployed-smoke: note — transcription and notes providers are configured`

**This is the question ENG-010 was built to ask, and the answer is the good one.** The risk was that a CDN answers for `/_next/static` before the application runs, leaving compiled assets public on the deployed origin while every loopback suite stays green — a failure no local check can see. **All 9 linked compiled assets were refused unauthenticated over the real certificate and served only to the owner.** Vercel's edge respects `proxy.ts`. The same run also confirms, on the hosted origin rather than on loopback: the Basic challenge, refusal of wrong credentials, the owner reaching the page, an unknown path challenged rather than answered, both `/diagnostics/*` pages 404 for the authenticated owner, `POST /api/recordings` guarding itself independently of the proxy, and no owner password or `NEXT_PUBLIC_` value in the page, in any asset, or in an error body.

**Two cautions on how far this generalises.** The URL is a deployment-specific one, not a project alias — the edge and the protection setting are the same, but a future alias should be re-checked rather than assumed. And **with Deployment Protection off, Echo's own fail-closed Basic gate is now the only thing in front of the origin.** That is the intended design (ADR-008's temporary single-owner gate), and this run is the evidence it actually holds on the platform; it is not an invitation to relax it.

**Secrets were entered by hand in the Vercel dashboard**, not by script. A scripted `vercel env add` pipeline was tried and did not land the values correctly. For a one-time setup, the dashboard is the recommended path; `npm run test:deployed` reports whether the provider group is actually configured, which is the check that matters.

**ENG-011 was merged but was not the cause, and its record is corrected.** It attributed the failure to Vercel installing without devDependencies. The real build log disproves that: Vercel reported `added 378 packages`, the full tree. The local reproduction recreated a condition the platform does not create, and the conclusion was drawn before the build log was read. `npm ci --include=dev` is kept as correct and explicit, but it fixed nothing. **The lesson is cheap to write down and was expensive to learn: for a build that passes locally and fails on the platform, read the platform's log before changing anything.**

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
| ENG-010 Reproducible deployment and deployed-origin check | **Done** — merged; **Echo is deployed, reachable over HTTPS, and `npm run test:deployed` passes against it.** The CDN question is answered: the edge does not serve `/_next/static` in front of the gate | `main` |


## What exists today

- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- The recorder page, development-only owner-gated `/diagnostics/capture`, and one Route Handler, `POST /api/recordings`.
- The WEB-002 slice plus the WEB-003 extension: up to one minute of capture, overlapping playable chunks in browser memory, then a transcript and notes per chunk. Verified by test; **never exercised in a real browser.** No stitched session output yet.
- Opt-in `npm run doctor`: safe per-port credential diagnostics, with an offline fixture mode.
- A verified self-hosted deployment path (ENG-002): `output: "standalone"`, an assembly step, a `Dockerfile`, and four parity tests inside `npm run check` that boot the standalone bundle a container would run. The image is built and smoke-checked by the `selfhost-container` CI job, which passed on 2026-09-08. Docker is unavailable on the development machine, so the image is verified in CI only.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- A secure-context guard (ENG-008) that refuses capture *before* the microphone opens on any origin without `crypto.subtle`, naming the address rather than failing later as a generic "Capture incomplete".
- Browser-local durable storage (WEB-004): each completed audio container and its metadata are saved in IndexedDB, recovered and checksummed after a reload, and retried while the page is active, with a 64 MiB audio budget and a 4 MiB warning reserve. Results never delete raw audio and no HTTP response is counted as a verified remote copy. Development-only, owner-gated `/diagnostics/queue` exercises the adapter natively. **No browser has yet run that acceptance.**
- A deployment defined in version control (ENG-010): `vercel.json`, and `npm run test:deployed` → `scripts/deployed-smoke.mjs`, which verifies a live origin over its real certificate — the gate, wrong-credential refusal, every linked compiled asset refused without credentials, `/diagnostics/*` absent, the Route Handler's own guard, and no password or `NEXT_PUBLIC_` value in anything served. Host-agnostic by design (ADR-010): it checks an origin, not a platform. **It has now met a hosted deployment and passed** (2026-09-08), so its assertions are exercised against a real CDN and a real certificate rather than only against loopback.
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

## What does not exist

Overlap stitching, incremental processing during capture, history, speaker labels, research, reminders, background processing, hardware. No database, server-side file storage, or real user accounts. **A hosted origin now exists** (2026-09-08), the owner reaches it over HTTPS with their own credentials, and `npm run test:deployed` passes against it — so the CDN is asserted, with evidence, to respect the gate.

**What WEB-004 does and does not promise.** Audio is saved in *this browser*, not on a server: site data can be evicted or cleared, private browsing is temporary, and an abrupt termination can still lose the container that was mid-recording. A closed or suspended page cannot upload, and exactly-once remote provider processing after a lost HTTP response needs later server work — retries never duplicate a local chunk or result, but a provider may see the same audio twice.

**No network access to Echo, by decision (ADR-013).** `dev` and `start` bind `127.0.0.1` and no script binds any other interface, so Echo is reachable only from the machine running it. Capture therefore cannot be exercised from a phone or any second device, and mobile acceptance is deferred until a deployed HTTPS origin exists. Re-adding a non-loopback bind reverses an accepted decision and needs its own ADR.

## Verification snapshot

Run from the repository root. **Rows below are the DOC-004 run on `docs/DOC-004-deployed-check-passes`, off `eng/ENG-013-deployment-protection` @ `4fe9f03`: 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6.** Every command was executed here; nothing is copied forward. The deployed row is the owner's run, marked as such — an agent sandbox cannot reach the platform.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` (in a checkout named `echo`) | 0 | `check:tracked` OK · lint clean · typecheck clean · **72 unit tests, 72 pass, 0 fail** · production build succeeded · **7 production HTTP tests, 7 pass, 0 fail** · **4 self-host parity tests, 4 pass, 0 fail** |
| `npm run check` (in a git worktree) | **1** | **Not a regression, and not a code defect — see the note below the table.** `check:tracked` OK · lint clean · typecheck clean · **72 unit tests, 71 pass, 1 fail** · then the chain halted. The remaining steps were run individually and all passed: build exit 0, **7 production HTTP, 7 pass**, **4 self-host parity, 4 pass** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (bounded controller only) |
| `VERCEL=1 CI=1 npm run build` | 0 | Simulates the hosted build: emits `apps/web/.next/next-server.js.nft.json` — the file Vercel's `onBuildComplete` hook reads — and **no** `standalone` directory |
| Normal `npm run build` (inside `check`) | 0 | Still emits `.next/standalone`, so ADR-010's container path is intact |
| `npm run test:deployed -- http://127.0.0.1:3131` | 0 | Against a local `next start` production server built from `main`: gate challenged, wrong credentials refused, **9 compiled assets each refused unauthenticated and served to the owner**, both diagnostics pages 404 for the authenticated owner, `POST /api/recordings` refused anonymously and 503 to an empty authorized body |
| **`npm run test:deployed -- https://echo-73alocfwt-…vercel.app/`** — owner's run against the hosted origin | **0** | **The first full pass against a real deployment.** Anonymous requests challenged, wrong credentials refused, the page and **9 compiled assets served to the owner only**, diagnostics hidden, the recording endpoint guarded. Note: *transcription and notes providers are configured*. **This is the CDN answer ENG-010 exists to produce** |
| `npm run doctor` (fixture mode) | not run | Touches no provider code |
| `selfhost-container` CI job | not run locally | Docker unavailable on this machine; last passed in CI 2026-09-08 |
| **Vercel production build** | **0 at `53c0851`** | Confirmed on the platform: `Build Completed in /vercel/output [20s]`. The earlier `ENOENT … next-server.js.nft.json` failure at `617a385` is gone |
| Native IndexedDB/capture diagnostics (WEB-004) | **not verified** | Inherited; no browser has run `/diagnostics/queue` |

**The one unit failure is the test's, not the code's, and it only happens outside a directory named `echo`.** `apps/web/tests/next-config.test.ts` asserts `config.outputFileTracingRoot?.endsWith("echo")`. In a git worktree the repository root is `.claude/worktrees/<branch>`, so the assertion fails on the directory name while `next.config.ts` is behaving correctly — it resolves the tracing root from `import.meta.url`, which is right in both places. Confirmed both ways on 2026-09-08: **72 pass, 0 fail** in `~/Documents/GitHub/echo`, **71 pass, 1 fail** in a worktree, same commit. **The 72-unit floor holds.** The brittleness is real but it belongs to ENG-012, not to this documentation task: the assertion should compare against the resolved repository root rather than a hard-coded folder name. Not fixed here — one task per branch.

**Negative controls — the deployed check was made to fail on purpose, seven ways.** A check that has only ever passed proves nothing:

| Broken condition | Exit | Behaviour |
| --- | --- | --- |
| A proxy serving `/_next/static` without credentials, standing in for a CDN edge | 1 | Failed on the first asset: *"is served without credentials. The hosting platform is answering for it before Echo's proxy runs"* — **this is the failure the whole script exists for** |
| Wrong owner password | 1 | *"the owner must reach the deployed page"* |
| Plain HTTP on a non-loopback host | 1 | Refused before any request, naming Basic credentials and `crypto.subtle` |
| Credentials embedded in the URL | 2 | Refused; directs them to the environment instead |
| Unreachable origin | 1 | *"nothing answered … (ECONNREFUSED)"*, not an undici stack trace |
| Missing `ECHO_OWNER_*` in the environment | 2 | Usage error naming both variables |
| **Vercel Deployment Protection in front of the origin** (ENG-013, observed live, not simulated) | 1 | Named the platform, the consequence and the owner-side fix instead of a bare `302 !== 401`. **The only control here that fired against the real deployment rather than a stand-in** — and turning the setting off is what let the passing run above happen |

Counts only ever rise: **33 → 46 → 52 → 53 → 69 → 72 unit** and **4 → 6 → 7 production HTTP**, plus 4 self-host parity and 16 controller. ENG-012 adds the three `next-config` assertions. ENG-010 adds no test to `npm run check` and removes none: `test:deployed` is deliberately outside the gate because it needs a live URL and real credentials, so CI cannot run it and must not appear to.

`npm run check` is the gate CI runs. These counts are a floor: **if a change makes a count go down, that is a regression, not a cleanup.**

**Live service check — 2026-09-06.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** microphone permission prompts, the 60-second auto-stop and independent browser decoding; and WEB-004's IndexedDB acceptance in a native browser. **The hosted-origin items are now verified** — the transport, Vercel's build of `vercel.json`, and whether a CDN edge answers for `/_next/static` in practice (it does not). **Mobile capture acceptance is now unblocked** under ADR-013 and needs opening as its own task.

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
