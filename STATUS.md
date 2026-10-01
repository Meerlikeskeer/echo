# Status

**Read this file first. It is the only file every session must read.** It exists so work can start without loading the whole repository. Use the reading map below to decide what else to open — and open nothing else.

**Updated:** 2026-09-08 · **Base:** `main` @ `1559da2`

STATUS.md is a cache, not a source of truth. If it disagrees with `ARCHITECTURE.md`, `DECISIONS.md`, `REQUIREMENTS.md` or `TASKS.md`, **those win and this file is stale** — correct it in the same change.

**This file holds only what is shared and changes rarely.** Anything belonging to one task lives with that task (**ADR-015**): active work in `status/in-flight/<TASK-ID>.md`, the per-task record in `TASKS.md`. That is why parallel branches no longer collide here.

## In flight

**One file per active task in [`status/in-flight/`](status/in-flight/).** Read [`status/in-flight/README.md`](status/in-flight/README.md) before adding yours.

Create your file **before** you start work, and delete it in the pull request that finishes the task. Separate files never conflict, which is the whole point — see the *Update protocol* at the end of this file.

**What this directory shows, precisely.** On a task branch, it holds that task's working state — the thing the next session reads if this one stops without warning. On `main` it holds only work that is **started but not finished across merges**, such as WEB-004, whose code is merged while its browser acceptance is not. A task that begins and finishes inside one pull request deletes its own file there, so it never appears on `main` at all. **To see everything currently in progress, read the open pull requests** — `.github/workflows/open-pull-request.yml` guarantees one exists for every pushed task branch — and the *Status* column of the table below.

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
| **Route Handler** | A server-side URL that accepts requests. Echo has two: `POST /api/recordings` for one chunk, and `POST /api/sessions/artifacts` for a whole session. |
| **Bounded loop** | The optional automation in `AGENT_WORKFLOW.md`: a *builder* agent writes code, a separate *checker* agent verifies it, an *orchestrator* runs them in turns with hard stop rules. **Currently off.** |
| `npm run check` | The single command that runs everything: style, types, tests, a real production build, and live HTTP tests. |

## Where the project is

Echo is a private-first web AI note taker, **deployed and verified over HTTPS** as of 2026-09-08. This task starts from `main` at `1559da2`, including WEB-005 and DOC-005 (PRs #22 and #23). ADR-017 accepts conservative stitching and browser-local capture completion records for WEB-006; implementation and verification are in flight.

**The task list is [`tasks/INDEX.md`](tasks/INDEX.md)** — id, title, status and branch, generated from
the one-file-per-task records in [`tasks/`](tasks/).

It is not reproduced here. It used to be, and every task that changed a status had to edit this file,
so any two open branches conflicted on it (**ENG-019**). The rule that replaced it is short: **no file
that every task must edit.**

## Deferred owner follow-ups

On 2026-09-30 the owner asked to keep three items for a later product session: delete past device sessions deliberately; fix web titles staying on transcript previews rather than adopting generated notes titles; improve vague, unnatural notes and the notes page's depth. **Mention these in future Echo status reviews.** Details, reproduction limits and retention constraints: [`tasks/DOC-006.md`](tasks/DOC-006.md). All three are deferred, not implemented.

## What exists today

- WEB-029 groups transcripts into readable passages/paragraphs with hover/focus/tap playback of original timed source audio and collapsed chunk details. Synthetic mapping tests pass; browser playback/hosted acceptance remains pending in `tasks/WEB-029.md`.

- WEB-025 (ADR-027) adds bounded committed-chunk HTTP transfer during device capture and a temporary Mac receiver with verified local receipts/restart recovery and final `.echo` assembly. SD originals remain; automatic transcription and network joining are not implemented. Physical transfer acceptance: `status/acceptance/WEB-025-transfer.md`; exact verification: `tasks/WEB-025.md`.


- WEB-024 (ADR-026) adds a temporary Mac radio-test launcher under `tools/radio-test`: bounded concurrent BLE pings and byte-verified synthetic Wi-Fi transfers with local JSON reports. It does not implement the Mac receiver or assess audio; physical acceptance remains pending in `tasks/WEB-024.md`.


- WEB-023 corrects WEB-022’s false refusal when Arduino reports an unchanged sleep setting. BLE startup now applies and verifies the driver power-save state; build and regression checks pass, physical retest pending in `tasks/WEB-023.md`.

- WEB-022 repairs the modem-sleep configuration behind the owner-observed BLE coexistence crash. Firmware build and device regression checks pass; physical reflash/retest remains pending in `tasks/WEB-022.md`.

- WEB-021 (ADR-025) adds a separate board-hosted `/probe` for explicit BLE ping/pong, temporary trusted shared Wi-Fi and synthetic transfer integrity/timing. No automatic audio handoff is implemented. Firmware/UI evidence and physical acceptance limits are in `tasks/WEB-021.md` and `status/acceptance/WEB-021-probe.md`. Shared-network clients can access the bench console; use a trusted personal network.


- WEB-009 (ADR-024) provides the recording workspace: searchable sidebar, persistent
  names, selected-session notes/transcript/audio views and a single recording action.
  Complete recordings up to one minute are organized as Quick Notes, longer or
  unconfirmed recordings as Sessions; manual overrides do not alter audio or
  processing evidence. History remains browser-local and names use a separate small
  presentation store. PR #46 is owner-merged and Vercel's Production alias is
  confirmed at merged main `a7ccfba`. Hosted saved-recording navigation and reload
  recovery were exercised; fresh import/rename-save and full authenticated alias
  smoke remain pending. See `tasks/WEB-009.md` for the exact evidence and limits.

- ENG-022 pins Vercel's output directory to `echo-web-app/.next`, repairing the
  stale `apps/web/.next` lookup observed after ENG-021. The merged WEB-020 importer
  already supports `.echo` uploads and transcription. The owner reported the Vercel
  flow working on 2026-09-27; this is owner-reported acceptance, not a new automated
  deployed-origin smoke run. See `tasks/ENG-022.md` for the repair evidence.

- WEB-020 (ADR-023) adds the first general-purpose XIAO ESP32S3 Sense recording MVP: independent microSD capture, BOOT/browser start-stop, overlapping WAV chunks, a two-hour bound, partial recovery and `.echo` export into the existing web queue for transcripts and session notes. Firmware builds, host/UI tests, web checks and independent source review are complete; physical microphone, power-loss and long-session acceptance remain pending in `status/acceptance/WEB-020-device.md`. Upload instructions are in `echo-device/README.md`. Flashing firmware does not deploy the web importer.

- ENG-021 (ADR-022) organizes the repository into `echo-web-app`, `echo-device`, and a documented `echo-mac-app` placeholder. Root web commands and the `@echo/web` package name stay the same. Earlier evidence uses historical paths. PRs are ready for review by default; drafts require an explicit owner-action checklist.

- WEB-019 adds `echo-device`, a PlatformIO XIAO ESP32S3 Sense diagnostics console (ADR-021). Firmware compilation and simulated UI tests are separate from pending physical acceptance. It does not yet run Echo recording/transcription or connect to a Mac app.

- WEB-018 repairs the reviewed lecture branches: one-minute default containers (30 seconds for unknown bitrate), engine-owned four-hour limit, measured conservative storage headroom, chunk-based gap descriptions, coordinated provider/route/browser deadlines, and revision-bound browser-local study guide persistence/export. The development-only `/diagnostics/lecture` exercises a synthetic 90-minute timeline in native IndexedDB. This is not real lecture or microphone acceptance; see `tasks/WEB-018.md`.


- Quick Note mode (WEB-008): one short clip becomes pending task/reminder/note/idea suggestions through the existing recording endpoint and provider abstraction. Audio, classification and timing survive in this browser's queue; offline captures visibly wait. Date phrases require confirmation and nothing is scheduled. Verification and live-provider latency acceptance are recorded in `tasks/WEB-008.md`.
- A Next.js app behind a fail-closed single-owner access gate (checked on every route, plus an independent second check when a page renders).
- The recorder page, development-only owner-gated `/diagnostics/capture`, and two Route Handlers: `POST /api/recordings` and `POST /api/sessions/artifacts`.
- The WEB-002 slice plus the WEB-003 extension: overlapping playable chunks in browser memory, then a transcript and notes per chunk. Verified by test; **never exercised in a real browser.**
- Lecture-length capture (WEB-016, **ADR-018**): a session records until the owner stops it, in five-minute chunks with five seconds of overlap, at a bitrate Echo requests rather than the one the browser would pick. The one-minute auto-stop is gone; a four-hour runaway bound replaces it. The chunk is sized from the bitrate the recorder *reports*, not the one requested, because a browser that overshoots would otherwise build chunks the upload boundary refuses for the whole lecture. A screen wake lock is held while recording. **No long recording has been made in any browser**; every claim here is test evidence.
- Opt-in `npm run doctor`: safe per-port credential diagnostics, with an offline fixture mode.
- A verified self-hosted deployment path (ENG-002): `output: "standalone"`, an assembly step, a `Dockerfile`, and four parity tests inside `npm run check` that boot the standalone bundle a container would run. The image is built and smoke-checked by the `selfhost-container` CI job, which passed on 2026-09-08. Docker is unavailable on the development machine, so the image is verified in CI only.
- Incremental upload during capture (WEB-005): a chunk is sent as soon as it is durably committed rather than at session end, a failing chunk no longer blocks the ones behind it, retry is bounded before an entry blocks with a readable reason, and `uploading` is a **persisted** state so a page that died mid-upload is recoverable as *in flight, outcome unknown*. `POST /api/recordings` keeps a job ledger keyed by chunk identity, so a retry after a lost response replays the stored result instead of paying for a second provider call. **The ledger is in-process and best-effort, not exactly-once** — a cold start, a redeploy, a second instance or a TTL expiry all lose it (ADR-016). The drain-during-capture wiring itself is code-verified but has no automated test and awaits browser acceptance.
- A session transcript (WEB-006): overlapping chunk transcripts combined into one ordered transcript with per-segment provenance, explicit gaps, and a partial/final status. Deduplication is deliberately conservative — only whole segments lying wholly inside the *measured* adjacent-chunk overlap with agreeing timing, never invented word times, never repeated speech outside the overlap. **A session is final only when this browser saved its own record that capture stopped successfully AND no chunk or transcript is missing.** A contiguous prefix of saved chunks never implies completion, so a session recorded before this change stays partial forever, correctly. Capture-completion manifests live in a new `sessions` store behind an IndexedDB **v1 to v2 migration**. **That migration and the recovery of completion evidence across a reload have no executed evidence anywhere** — no test touches `IndexedDBQueue`, `saveCompletion` or `listCompletions`, and every one of the 23 frozen tests would still pass if the recorder never wrote a manifest at all.
- Session artifacts (WEB-007): title, summary, key points, action items and **suggested research topics** for a whole session, from the stitched transcript, generated on request through `POST /api/sessions/artifacts` because provider credentials never reach the browser. **Artifacts are accepted only when their revision equals the transcript's revision at the moment the answer lands.** A revision is a content hash and hashes do not order, so there is no "newer" to choose between two — requiring an exact match makes a stale overwrite impossible by construction rather than by a comparison. A separate monotonic generation number handles the only case equality cannot see: two attempts racing for the same revision. The endpoint computes the revision itself and never accepts one, because a mislabelled revision would defeat the rule silently. Malformed provider output is refused rather than repaired, including on **unknown fields**, which is how a vendor response shape reaches a domain type. **Research topics are suggestions: nothing is looked up and no finding is stated** (REQ-005 separates this from WEB-013's opt-in research). Verified by test only; nothing has run in a browser.
- A session note guide (WEB-017, **ADR-019**): the stitched transcript goes to `POST /api/sessions/artifacts` whole — no truncation, and a refusal past the bound rather than a silent slice — and comes back as a course (only where the recording identifies one), an outline of sections, terminology as the speaker used it, open questions, action items and suggested research. Gaps in the recording are named to the generator instead of being written across. **The notes model's context window is now a real configuration constraint**: an hour of speech is roughly 55,000 characters and all of it is sent. No real lecture transcript has been through this.
- Provider ports with two adapters each: `openai-compatible` and `fixture`.
- A secure-context guard (ENG-008) that refuses capture *before* the microphone opens on any origin without `crypto.subtle`, naming the address rather than failing later as a generic "Capture incomplete".
- Browser-local durable storage (WEB-004): each completed audio container and its metadata are saved in IndexedDB, recovered and checksummed after a reload, and retried while the page is active, with a 256 MiB audio budget and an 8 MiB warning reserve (WEB-016 raised both; 64 MiB held about forty minutes). Results never delete raw audio and no HTTP response is counted as a verified remote copy. Development-only, owner-gated `/diagnostics/queue` exercises the adapter natively. **No browser has yet run that acceptance.**
- A deployment defined in version control (ENG-010): `vercel.json`, and `npm run test:deployed` → `scripts/deployed-smoke.mjs`, which verifies a live origin over its real certificate — the gate, wrong-credential refusal, every linked compiled asset refused without credentials, `/diagnostics/*` absent, the Route Handler's own guard, and no password or `NEXT_PUBLIC_` value in anything served. Host-agnostic by design (ADR-010): it checks an origin, not a platform.
- The ENG-001 bounded controller, `scripts/agent_loop.py`, with its own tests. ENG-017 adds fixed-suite TAP-to-JSON unit and production HTTP adapters with independently frozen failure controls; verification and remaining environment blockers are recorded in its task handoff. **Its feature loop is off** (`agent-loop.json` has `"ready": false`).

### The deployed origin, and what it settled

**Echo is deployed over HTTPS, behind its own gate, and `npm run test:deployed` passes against it** (2026-09-08). The Vercel project exists, this checkout is linked to it (`.vercel/project.json`, project `echo`), and the owner set all ten environment variables for Production and Preview: `ECHO_OWNER_USERNAME`, `ECHO_OWNER_PASSWORD`, and the `TRANSCRIPTION_*` and `LLM_*` groups. The deployed check confirms the provider groups actually reach the running application rather than merely existing in the dashboard.

**The CDN question ENG-010 exists to answer is answered: Vercel's edge does not bypass Echo's gate.** The risk was that a CDN serves `/_next/static` before the application runs, leaving compiled assets public on the deployed origin while every loopback suite stays green — a failure no local check can see. **All 9 linked compiled assets were refused unauthenticated over the real certificate and served only to the owner.** The same run confirmed, on the platform rather than on loopback: the Basic challenge, refusal of wrong credentials, the owner reaching the page, an unknown path challenged rather than answered, both `/diagnostics/*` pages 404 for the authenticated owner, `POST /api/recordings` guarding itself independently of the proxy, and no owner password or `NEXT_PUBLIC_` value in the page, in any asset, or in an error body.

**Two limits on how far that generalises.** The URL tested was deployment-specific, not a project alias — same edge, same settings, but an alias should be re-checked rather than assumed. And **with Vercel Deployment Protection off, Echo's own fail-closed gate is the only thing in front of the origin.** That is the intended design under ADR-008 and the passing run is evidence it holds on the platform, but it makes `echo-web-app/src/proxy.ts` load-bearing in production: adding a path exclusion there is now a production access change.

**Deploying and checking are owner-only.** `npx vercel` needs the owner's account, and `npx` also fails from an agent sandbox on npm cache permissions. An agent can run neither the deploy nor `npm run test:deployed` against the hosted origin, and must record `not run` rather than infer a result.

**What this unblocks.** ADR-013 deferred mobile capture until a deployed HTTPS origin existed. It exists and is verified, so **mobile capture acceptance can be opened as its own task.** HTTPS also closes the `crypto.subtle` secure-context gap, so `checksum()` works and WEB-004's durable queue can operate somewhere other than the development machine.

## What does not exist

Speaker labels, research, reminders, background processing, physically verified production hardware recording or a native Mac receiver. No database, server-side file storage, or real user accounts — and therefore no job ledger that survives a cold start, which is what exactly-once chunk processing would need (ADR-016).

**What WEB-004 does and does not promise.** Audio is saved in *this browser*, not on a server: site data can be evicted or cleared, private browsing is temporary, and an abrupt termination can still lose the container that was mid-recording. A closed or suspended page cannot upload, and exactly-once remote provider processing after a lost HTTP response needs later server work — retries never duplicate a local chunk or result, but a provider may see the same audio twice.

**No network access to a local Echo, by decision (ADR-013).** `dev` and `start` bind `127.0.0.1` and no script binds any other interface, so a locally run Echo is reachable only from the machine running it. Re-adding a non-loopback bind reverses an accepted decision and needs its own ADR. Mobile acceptance is no longer blocked by this — it goes against the deployed origin.

## Standing facts and hard-won lessons

Cheaper here than in a search, and each one cost something to learn.

- **Provider credentials are server-side only, never `NEXT_PUBLIC_*`.**
- **This is Next.js 16** — its APIs differ from model training data, so check `node_modules/next/dist/docs/` before assuming an API exists.
- **Merged and deployed are different states** and neither implies the other. A push deploys nothing (ADR-014); deploying is an explicit `npx vercel`. Check which commit is live before drawing conclusions from a deployed origin.
- **For a build that passes locally and fails on the platform, read the platform's log before changing anything.** ENG-011 blamed Vercel installing without devDependencies and was merged; the build log disproved it — Vercel reported `added 378 packages`, the full tree. The local reproduction recreated a condition the platform does not create, and the conclusion was drawn before the log was read. ENG-012 found the real cause: `output: "standalone"` moved the file Vercel's `onBuildComplete` hook reads.
- **Not every deployment failure is the build.** Three in a row were the platform around it. The upload-step failure `Cannot patch preview comments when immutable static file upload is enabled` was Vercel's **preview comments / Toolbar** feature; **disabling the Vercel Toolbar for the project resolved it.** Its advice to upgrade Next was inapplicable. No repository change was involved, and none should be made if it recurs.
- **Secrets go in by hand.** A scripted `vercel env add` pipeline was tried and did not land the values correctly. For one-time setup the dashboard is the right path; `npm run test:deployed` reports whether the provider group actually reaches the application, which is the check that matters.
- **An agent sandbox cannot reach `api.github.com`** — TLS interception breaks certificate verification, so `gh` fails. **`git push` over the same HTTPS works**, and so does the git protocol, which is how to check pull requests from a sandbox: `git ls-remote origin 'refs/pull/*/head'` maps pull request numbers to head commits, and a matching `refs/pull/<n>/merge` means open and mergeable. **An unreachable API is not an absent pull request** — `.github/workflows/open-pull-request.yml` opens them automatically on push (ENG-007), which is why the sandbox never needs to.
- **A test that pins an environment detail costs more than the bug it catches.** For a month `npm run check` could not pass in a worktree, because `next-config.test.ts` asserted the tracing root ends in `echo` and a worktree's root is `.claude/worktrees/<branch>`. Nothing in Echo depends on the folder's *name*; the property ENG-012 needed was that the root is the workspace root, which is what hoists dependencies. Three tasks recorded stages as *not run* because of it, every agent had to verify in the one shared checkout, and a clean install in one session then deleted the dependency tree another was using — leaving that checkout unusable with all 307 packages present and every `.bin` symlink gone. **ENG-018 replaced the assertion with the property, and the worktree ran the whole chain green.** When a test names something incidental, ask what it is really protecting and assert that instead.
- **Work that only exists in a scratch directory does not exist.** WEB-006's first builder attempt — about 300 lines — was left uncommitted in `/private/tmp` by a session that hit a usage limit, one reboot away from gone. Recover such work by committing it *verbatim first*, before modifying it, so the starting point is in history and what a later commit changed is legible. Its three typecheck errors were then attributable, rather than mixed into someone else's diff.
- **A frozen acceptance test can silently dictate user-facing copy.** WEB-006 asserts a partial session never renders `/Final/`, so the disclosure sentence had to avoid a capital F. The first rewording that satisfied the regex was factually wrong — it claimed a session is final once every transcript is present, when the code also requires a saved capture manifest. Passing tests did not catch it; an independent reader did. When a test constrains prose, check the prose is still *true*, not merely green.
- **A passing test can assert something it does not prove, and only a negative control tells you which.** WEB-007's first draft carried a test claiming its length-prefixed revision encoding stops a forged revision. Removing the prefixes left the test green: every record contributes a fixed number of fields and both counts are encoded, so the naive delimiter was already collision-free *given the surrounding structure*. The test was measuring the structure, not the prefixes. The habit that catches this is cheap — **break the thing the test names and confirm that test is the one that fails.** The same run on the acceptance rule failed exactly the two tests it should have, which is what a load-bearing test looks like.
- **A restriction nobody has tested is a guess, and guesses get written down as facts.** `AGENTS.md` stated that agents cannot push `.github/workflows/`. ENG-016 believed it, wrote a complete auto-merge workflow into its handoff, and left it unapplied. **ENG-020 pushed a workflow change on the first attempt.** The restriction is real where a token lacks the `workflow` OAuth scope; it was inherited from such an environment and never checked here. The cost was days of finished work sitting unmerged, waiting for a button that the unapplied workflow would have pressed. Three other beliefs in this file were also wrong when tested — that a worktree cannot run the full check, that `npm ci` was needed to repair a tree missing only its symlinks, and that a `.env.example` could be renamed from inside a session. **Attempt the operation and read the error.**
- **The rule is: no file that every task must edit.** ADR-015 and ENG-014 found half of this — they split the *In flight* section into one file per task because a shared section is a conflict generator — and then left every task *record* in one 1,100-line `TASKS.md`, the status table inside `STATUS.md`, and the verification counts in a sentence. So WEB-015, WEB-007, ENG-016 and ENG-018 all collided on the same two files in one afternoon, and every collision was additive: the resolution was always *keep both*. **ENG-019 finished the job.** Records are `tasks/<TASK-ID>.md`, the index is generated and marked `merge=union` so two new rows merge themselves, and the counts are measured by `npm run floor`. When a shared file conflicts twice, stop resolving it and remove the sharing.
- **A tracked file matching `.env*` locks sandboxed agents out of the whole repository.** Agent sandboxes deny writes to those paths, correctly, because that is where secrets live. But `.env.example` was *tracked*, so `git worktree add` failed on `error: unable to create file .env.example: Operation not permitted` before a single test could run — and the same rule blocked `git mv`, so the file could not even be renamed from inside a session. It was untracked with `git rm --cached` and re-added as `env.example`. **Nothing matching `.env*` is tracked any more**, and nothing should be: in this repository such a path is a secret, without exception.
- **Two agents on one machine need two worktrees, not one checkout.** `AGENTS.md` already forbids sharing a mutable checkout, and the dependency tree is the mutable thing that bites: `npm ci` deletes `node_modules` before reinstalling, so one agent's install destroys what the other is running against. Since ENG-018 a worktree can run the whole check, so each agent takes its own worktree on its own branch and neither ever touches the other's tree. **An agent sandbox may also be denied the deletes and symlinks a repair needs**, which is how a half-installed tree becomes unfixable from inside a session — `npm ci`, `npm rebuild` and even `touch` all fail with `EPERM` on a directory the operating system says is writable. Check ownership before believing the error: if the directory is yours with owner-write set, it is the sandbox, and `sudo` is the wrong answer. Repair from a plain terminal.

## Verification floor

**The counts live in [`verification-floor.json`](verification-floor.json), and no one types them by hand.** Run `npm run floor` when your task changes them: it runs the suites, records what actually passed, and **refuses a count that went down**. `npm run floor:check` compares without updating.

**A hand-typed count was wrong the moment two branches were open at once, which is why the machine counts now (ENG-019).** WEB-015 and WEB-007 both branched from 114 unit tests and each recorded its own total, 126 and 149. Neither could see the other, so both were correct on their own branch and both were stale on `main`, where the real number turned out to be 161. A number every task must edit is a merge conflict with extra steps, and a number no task can compute correctly is worse than no number.

| Command | What it covers |
| --- | --- |
| `npm ci` then `npm run check` | `check:tracked` → `tasks:check` → lint → typecheck → unit → production build → production HTTP → self-host parity. Counts are in `verification-floor.json`, not written out here |
| `python3 -m unittest discover -s tests` | **16 tests**, bounded controller only — it certifies the controller, never the web application |
| `npm run test:deployed -- <origin>` | A live origin over its real certificate. **Deliberately outside `npm run check`**: it needs a URL and real credentials, so CI cannot run it and must not appear to |
| `npm run floor` | Runs the three suites, records the counts, and refuses a count that went down. Never edit `verification-floor.json` by hand |
| `npm run doctor` | Opt-in per-port credential diagnostics. Touches no provider code in fixture mode |
| `selfhost-container` CI job | The container image. Docker is unavailable on the development machine, so this is verified in CI only; last passed 2026-09-08 |

**The numbers from a particular run belong to the task that ran them** — its `status/in-flight/` file and its pull request body — not here (ADR-015). Record the exit codes and counts you actually observed, never a previous run's, and write `not run` for anything you did not execute. A substitute runner or a subset of tests is not verification.

**Negative controls — the deployed check was made to fail on purpose, seven ways.** A check that has only ever passed proves nothing:

| Broken condition | Exit | Behaviour |
| --- | --- | --- |
| A proxy serving `/_next/static` without credentials, standing in for a CDN edge | 1 | Failed on the first asset: *"is served without credentials. The hosting platform is answering for it before Echo's proxy runs"* — **this is the failure the whole script exists for** |
| Wrong owner password | 1 | *"the owner must reach the deployed page"* |
| Plain HTTP on a non-loopback host | 1 | Refused before any request, naming Basic credentials and `crypto.subtle` |
| Credentials embedded in the URL | 2 | Refused; directs them to the environment instead |
| Unreachable origin | 1 | *"nothing answered … (ECONNREFUSED)"*, not an undici stack trace |
| Missing `ECHO_OWNER_*` in the environment | 2 | Usage error naming both variables |
| **Vercel Deployment Protection in front of the origin** (ENG-013, observed live, not simulated) | 1 | Named the platform, the consequence and the owner-side fix instead of a bare `302 !== 401`. **The only control that fired against the real deployment rather than a stand-in** — turning that setting off is what let the passing run happen |

**Live service check — 2026-09-06.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in **1.4 s**, correct transcript, sensible notes and action items, timestamps normalized. REQ-006 targets 5–10 s from stop to result; 1.4 s for a 7-second clip is inside it, but that is one measurement of one short clip on one connection, not a measured latency claim.

**Still not verified:** microphone permission prompts, the 60-second auto-stop and independent browser decoding; WEB-004's IndexedDB acceptance in a native browser; WEB-005's drain-during-capture wiring; WEB-006's v1-to-v2 migration and completion recovery; and WEB-007's artifact generation, whose staleness rule can only be exercised by generating while chunks are still arriving. **All of these are now one script — [`status/acceptance/browser-acceptance.md`](status/acceptance/browser-acceptance.md)** — because they need the same session in a real Chrome and Safari, and were previously tracked as separate sets of manual checks across as many task handoffs. The hosted-origin items **are** now verified — the transport, Vercel's build of `vercel.json`, and whether a CDN edge answers for `/_next/static` in practice (it does not).

## Reading map

Read `STATUS.md`, then **only** the rows that match your task. Do not read a document you have not been routed to.

| If you are… | Read | Skip |
| --- | --- | --- |
| Doing anything | this file | — |
| Starting or resuming a task | `status/in-flight/README.md`, and your own `status/in-flight/<TASK-ID>.md` | other tasks' in-flight files |
| Implementing a `WEB-###` task | that one task entry in `TASKS.md`; `ARCHITECTURE.md` § *Technology Stack*; the § *… boundaries* section of the nearest shipped task | other task entries, `ROADMAP.md`, full `REQUIREMENTS.md` |
| Adding or swapping a transcription / notes service | `DECISIONS.md` ADR-009 and ADR-010; `ARCHITECTURE.md` § *External AI Services* and § *Provider boundaries* | the rest of `DECISIONS.md` |
| Touching login, access or credentials | `ARCHITECTURE.md` § *WEB-001 access and verification boundaries*; `echo-web-app/src/lib/access.ts` | product docs |
| Touching hosting, deployment or infrastructure | `DECISIONS.md` ADR-008, ADR-010 and ADR-014; `ARCHITECTURE.md` § *Hosting and Deployment* | product docs |
| Working on retention or deletion | `REQUIREMENTS.md` § *Raw audio lifecycle*; `DECISIONS.md` ADR-004 | the rest |
| Introducing **any** framework, database, host, UI library or major service | `AGENTS.md` § *Technology stack constraints*; `ARCHITECTURE.md` § *Changing a stack decision* — **before writing code** | — |
| Running or enabling the bounded loop | `AGENT_WORKFLOW.md` | — |
| Writing documentation only | this file and the file you are editing | — |

## Update protocol

The point of this section is that **an interrupted task must still be recoverable.** A session can stop at any moment — context exhausted, a crash, an interruption — and what it wrote down is all the next one gets.

1. **Before starting work**, create `status/in-flight/<TASK-ID>.md`: the task, the branch and its base, what you are attempting, and what is not done yet. Do this first, not last. See that directory's `README.md`.
2. **As you go**, keep your file current — especially after finishing a piece. If you are running low on context, **stop and update it before doing anything else.** An interrupted task with an accurate note is recoverable; finished work nobody recorded is not.
3. **When the task is done**, in the same pull request: update the `**Status:**` line and handoff in your own `tasks/<TASK-ID>.md`, run `npm run tasks:build` and `npm run floor`, **delete your `status/in-flight/` file**, and move anything durable into this file or the document that owns it.

**Step 3's last clause is the one that gets skipped, and it is the one that matters.** Your in-flight file is deleted on merge. Anything worth keeping — a fact about what exists, a decision, a lesson that cost a day — must be moved somewhere permanent before then, or it is gone. The old single *In flight* section failed the opposite way: nothing was ever moved out, so it grew to 51 lines and ended up asserting both "nothing deployed yet" and "ECHO IS DEPLOYED" three paragraphs apart.

**This file no longer carries the task table or the test counts**, because every task had to edit both and any two branches then conflicted (**ENG-019**). The index is `tasks/INDEX.md`, generated by `npm run tasks:build`; the counts are `verification-floor.json`, measured by `npm run floor`. Update `STATUS.md` itself in the same commit as any change to an accepted ADR or to what does and does not exist.

**Keep this file short.** If a section grows past a screen, the detail belongs in the document that owns it, and this file should link there.
