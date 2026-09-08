# Tasks

Status vocabulary: Todo, In progress, Blocked, Done. DOC-001, ENG-001 and WEB-001 are Done and integrated into `main`. **WEB-002 is implemented and awaiting owner review on `feat/WEB-002-recording-slice`**; later web tasks remain Todo. ENG-002 is independent of the WEB sequence and may run alongside WEB-002. Dependencies refer to WEB task IDs.

## DOC-001 — Shared repository foundation

**Status:** Done

Added shared context, engineering rules, architecture, requirements, roadmap, ADRs, task IDs and secret-safe configuration template. Validation passed: local Markdown links resolve, all 14 WEB task IDs exist, secret/data paths are ignored, and credential placeholders are blank. No application tests exist yet. Branch: `docs/project-foundation`. Next step: WEB-001.

## ENG-001 — Bounded builder/checker workflow

**Status:** Done

Added independent role definitions, a Codex-backed orchestrator, Claude entry points, five-attempt and regression stops, baseline/per-test evidence, protected verification, and setup documentation. Branch: `feat/bounded-agent-workflow`. Synthetic controller tests cover the control paths; live model invocation and web checks remain untested/unconfigured. Next: WEB-001/002, then independently prepare app adapters and goal acceptance tests before setting `agent-loop.json` ready.

**Integration note:** merged into `main`. The loop remains disabled: `agent-loop.json` still has `"ready": false`, and `scripts/run-app-tests.py` / `scripts/run-app-acceptance.py` do not exist. Controller tests were rerun after integration: 16 tests, 0 failures. Preflight correctly refuses to run (exit 2, "ready is false").

## ENG-002 — Self-host parity verification

**Status:** Implemented and verified, except the container build itself · **Branch:** `eng/ENG-002-self-host-parity` · **Dependencies:** WEB-001 (satisfied)

**Acceptance:** Demonstrate that Echo runs outside Vercel as required by ADR-010 and REQ-009. Add a container build using the Next.js standalone server, document the self-hosted run command and required configuration, and extend verification with a production smoke check against the container equivalent to the existing production HTTP tests. Static asset serving and build-time versus runtime environment variables must be handled explicitly, not assumed.

**Rationale:** REQ-009 makes self-hosted deployment an architectural baseline, but nothing verifies it. Proving parity is cheapest now, while the application is a single page and an access proxy, and before WEB-004/WEB-005/WEB-010 introduce queues, scheduled work and object storage — the point at which platform-specific primitives would otherwise be adopted silently. Must not weaken any existing check.

### Browser evidence (2026-09-08, macOS)

**ADR-011 is validated on Chrome 150 and Safari 26.4.** The relay works in both engines. Measured, not inferred:

- `simultaneousRecordingStates: true` at every boundary in every run, with `sameStream: true` throughout — two `MediaRecorder` instances genuinely recording at once on one `MediaStream`, which is the assumption the entire design rests on.
- Every container decoded independently through its own `decodeAudioData` call: **3/3, 3/3, 4/4 on Chrome; 3/3, 3/3, 4/4 on Safari**.
- Every SHA-256 checksum recomputed from the blob matched its capture metadata, in all six runs.
- `validateChunkOrder` passed on real metadata at every setting.
- Overlap drift against ±250 ms: **Chrome 0.6–4.8 ms, Safari 0–4 ms**. Both negotiated Opus in WebM at 48 kHz stereo.

**Finding: the zero-overlap audio gap is Chrome-specific.** `MediaRecorder` start latency differs sharply between engines:

| | `start()` → `start` event | `eventOverlapMs` at 0 ms overlap | Verdict at 0 ms |
| --- | --- | --- | --- |
| Chrome 150 | **61–82 ms** | **−54.4, −51.4** | **FAIL** — audio lost |
| Safari 26.4 | **0–2 ms** | +4, +3 | PASS |

On Chrome the previous recorder's `stop` event precedes the next recorder's `start` event by ~52 ms, so nothing captures the audio in between and it is permanently gone. Native *state* timing hides this completely — it reported +1 ms of overlap while the audio was already lost; only the event windows expose it. Safari starts essentially instantly and has no gap.

Because the loss depends on the engine, a zero-overlap setting is safe on one browser and lossy on another, with nothing in the UI to distinguish them — and it behaves correctly on whichever browser a developer happens to use, which is the worst failure shape available.

**Resolved 2026-09-08: the owner removed the option.** The recorder offers 1 second and 2 seconds only, a test asserts every offered value is at least 1000 ms and was verified to fail when zero is reintroduced, and ADR-011 is amended to record overlap as mandatory. `captureSession` still accepts `overlapMs: 0`, because the port is not wrong — the product choice was. WEB-006 stitching cannot recover audio nothing recorded, so this stays a capture-time guarantee rather than a downstream repair.

**Second finding: Safari encodes ~1.6× larger.** Same six seconds of identical synthetic audio: **~153 KB on Safari against ~96 KB on Chrome** (roughly 204 kbps against 128 kbps). At the current 60-second cap that is about 1.5 MB, comfortably inside Vercel's 4.5 MB request limit, so it forces nothing now — but WEB-004 and WEB-005 must size against Safari, not Chrome.

**Third: Safari normalises the container type with a space** — `audio/webm; codecs=opus` rather than Chrome's `audio/webm;codecs=opus`. The harness reports requested and actual MIME separately, so this passed correctly. Any future code that compares media-type strings for equality must normalise rather than match literally.

**Remaining for WEB-003 acceptance, all manual and none automatable by synthetic audio:** microphone permission Allow and Deny in the real recorder, and the recorder UI's 60-second auto-stop and chunk playback. All three run on the machine hosting Echo, over loopback.

**Deferred, not outstanding (ADR-013):** capture on a physical mobile browser, including interruption and backgrounding. Mobile needs a secure origin reachable from the device, and ENG-009 removed the LAN server that would have provided one. This check moves to its own task against a deployed HTTPS origin, once the laptop path is deployed and working. **WEB-003 is not incomplete for lacking it.**

### Handoff (2026-09-07)

**Branch base — read this before merging.** This branch is based on `feat/WEB-002-recording-slice` @ `cbd216b`, **not** on `main`. `main` is six commits behind and does not contain `STATUS.md`, the ENG-006 tracked-source guard, `npm run doctor`, the recording slice, or this task's own entry in `TASKS.md` — ENG-002 could not be defined, let alone verified against the current gate, from `main`. Merging this branch therefore also merges everything on the WEB-002 branch. If that branch is not being accepted, stop before merging this one.

**Scope delivered**

- `apps/web/next.config.ts` sets `output: "standalone"` and `outputFileTracingRoot` to the repository root. The root is the load-bearing part: Echo is an npm workspace with hoisted dependencies, so tracing from `apps/web` emits a bundle whose imports resolve to nothing — and that bundle builds cleanly and only fails on boot.
- `scripts/selfhost-assemble.mjs` — the single definition of assembling a self-hosted bundle. Copies `.next/static`, and `public/` when it exists (it does not today, which is why its absence is reported rather than fatal). Called by both the test and the `Dockerfile` so the tested layout and the shipped layout cannot drift.
- `scripts/selfhost.test.mjs` — four tests that boot the assembled bundle, not `next start`. Added to `npm run check`. One of them copies the bundle outside the repository and starts it with `cwd` and a relative `server.js` path matching the `Dockerfile`'s `WORKDIR` and `CMD`, with nothing inherited from the shell. That is the closest check to the container that needs no container runtime, and it is the only one that proves the bundle is not quietly resolving imports up into the workspace `node_modules` it otherwise sits inside.
- `Dockerfile` and `.dockerignore` — multi-stage build on `node:22.23.2-alpine`, non-root runtime user, no configuration and no environment file inside the image.
- `scripts/container-smoke.mjs` — checks a running container; reads credentials from the environment and never prints them.
- A `selfhost-container` CI job is **specified but not committed** — see *CI job, pending owner action* below.
- Documentation: `README.md` gains a self-hosted deployment section; `ARCHITECTURE.md` gains an *ENG-002 self-host parity boundaries* section and updated hosting/testing tables.

#### CI job, pending owner action

The container job is **not** in `.github/workflows/pull-request.yml`. GitHub requires a separate `workflow` OAuth scope to create or modify anything under `.github/workflows/`, because those files execute code in CI with access to repository secrets, and the development token here does not hold it. Rather than grant an agent standing write access to CI configuration, the job is recorded here for the owner to add by hand. Until it is added, **the container image is unverified**: `npm run check` proves the bundle, not the image.

Append verbatim to `.github/workflows/pull-request.yml`, at the same indentation as the existing `verify:` job:

```yaml
  # ENG-002 / ADR-010. `npm run check` already proves the standalone bundle runs
  # self-hosted, and it runs anywhere. This job proves the container around that
  # bundle also builds and runs, which needs a container runtime that most
  # development machines in this project do not have. It is a separate job so a
  # container failure is legible on its own rather than buried in the main gate.
  selfhost-container:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      # Synthetic, generated per run, and never a real credential. Only ever
      # passed to the container and to the smoke check.
      ECHO_OWNER_USERNAME: synthetic-owner
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Generate a synthetic owner password for this run
        run: echo "ECHO_OWNER_PASSWORD=$(openssl rand -hex 24)" >> "$GITHUB_ENV"

      - name: Build the self-hosted image
        run: docker build -t echo:ci .

      - name: Confirm the image contains no environment file
        # A stray .env in the build context would ship a credential inside the
        # image. .dockerignore excludes them; this asserts it rather than
        # trusting it.
        run: |
          if docker run --rm --entrypoint sh echo:ci -c 'ls -A /app; find /app -maxdepth 3 -name ".env*" -print' | grep -q '\.env'; then
            echo "An environment file was found inside the image."
            exit 1
          fi

      - name: Run the container
        run: |
          docker run -d --name echo-ci -p 3000:3000 \
            -e ECHO_OWNER_USERNAME="$ECHO_OWNER_USERNAME" \
            -e ECHO_OWNER_PASSWORD="$ECHO_OWNER_PASSWORD" \
            echo:ci

      - name: Smoke-check the running container
        run: node scripts/container-smoke.mjs http://127.0.0.1:3000

      - name: Container logs on failure
        if: failure()
        run: docker logs echo-ci || true

      - name: Stop the container
        if: always()
        run: docker rm -f echo-ci || true
```

It introduces no secret: `ECHO_OWNER_PASSWORD` is generated per run and discarded with the container.

**Why a separate suite rather than extending `scripts/production.test.mjs`.** That file runs against `next start`, which reads the whole workspace and the whole `node_modules`, so it passes even when the standalone bundle is broken. It was deliberately left untouched — it owns the access matrix, duplicating it would mean two copies to keep in step, and leaving it alone also keeps this branch from conflicting with WEB-003 work happening in parallel.

**The failure mode was reproduced, not assumed.** With `.next/static` removed from the assembled bundle, the standalone server returns **200 for the page and 404 for all nine linked assets** — a deployment that looks healthy and is not. `scripts/selfhost.test.mjs` fails on the first asset in that state.

**Checks and outcomes** — run from the repository root, Node 22.23.2 / npm 10.9.8:

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | `check:tracked` OK · lint clean · typecheck clean · **46 unit tests pass** · production build succeeded · **5 production HTTP tests pass** · **4 self-host parity tests pass** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (unchanged by this task) |

Baselines of 46 unit and 5 production HTTP tests are unchanged; the 4 self-host tests are new. No existing assertion was removed or relaxed.

**Limitations and blockers**

- **The container image has never been built.** Docker is not installed in this development environment, so the `Dockerfile`, `.dockerignore` and `container-smoke.mjs` are unexecuted end to end. The relocation test covers the bundle contract the image depends on — the `COPY` source, the `WORKDIR`, the relative `CMD` path, and that the bundle carries its own dependencies — but not the base image, layer copy, file ownership or the non-root user. **The CI job that would verify it is not committed** (see *CI job, pending owner action* above). Do not describe the container as verified until that job exists and passes.
- **`.env.example` was not updated**, and this branch's copy is the older `main` version. The development sandbox forbids writing any `.env*` path, so the file could not be edited or checked out. Self-hosted configuration is documented in `README.md` instead. Someone with write access should reconcile `.env.example` and consider whether it should mention the container.
- Nothing is deployed. No registry, no host, no TLS. `ECHO_OWNER_PASSWORD` must be a random 32+ character value and the container must sit behind a TLS reverse proxy for any access beyond localhost.
- Self-hosted image-optimisation caching is untouched because Echo serves no images yet. It becomes real work when it does.

**Next step:** owner reviews; CI runs the `selfhost-container` job to verify the image; then merge with the WEB-002 branch. The ADR-010 constraint this protects — no platform-specific primitive without an ADR — binds WEB-004, WEB-005 and WEB-010.

**Carried in from WEB-003:** `checksum()` in `apps/web/src/lib/recording/session.ts` calls `crypto.subtle.digest`, which browsers expose only in a secure context. A self-hosted deployment reached over plain HTTP on a LAN leaves `crypto.subtle` undefined and capture fails as a generic "Capture incomplete". This is not fixed here — it is a WEB-003 code path — but it is a self-hosting failure and belongs on this list until it is handled.

## ENG-007 — Pull request workflow and branch protection

**Status:** Implemented; branch protection is owner-applied · **Branch:** `eng/ENG-007-pull-request-workflow` · **Dependencies:** None

**Acceptance:** `main` accepts changes only through a reviewed pull request whose checks pass. Agents open pull requests and never merge. A template makes the verification evidence and the unverified remainder a required part of every submission.

**Rationale:** The workflow already said "owner reviews, then merges", but nothing enforced it, so the merge step silently never happened and `main` fell **fourteen commits** behind. That is not a tidiness problem. It made branching from `main` impossible — ENG-002 could not even be defined from `main`, because `main` had no `STATUS.md`, no `check:tracked` and no ENG-002 entry — so every task stacked on the previous unmerged branch, compounding the review burden and making any single task impossible to revert alone. Branch protection converts a documented intention into one the system will not let anyone skip.

**Scope delivered**

- `.github/pull_request_template.md` — task ID and branch base, a verification table for observed exit codes and counts, explicit confirmation that no count went down and no check was weakened, a mandatory *Not verified* section, and credential/stack/reversibility checks.
- A workflow that opens the pull request automatically on push, specified below under *Automatic pull request creation, pending owner action* — agents cannot reach `api.github.com`, so GitHub does it for them.
- `AGENTS.md` § *Version control discipline* gains four rules: finish with a pull request and never merge to `main`; branch from `main` and disclose it when you cannot; agents cannot change CI and must hand the YAML to the owner; and the push rule now names the two times it has already been violated.

**Owner-applied settings, not in this branch.** Branch protection lives in GitHub settings and cannot be committed. On `main`: require a pull request before merging; require status checks (`verify`, adding `selfhost-container` once it has been observed green); require branches to be up to date; forbid force pushes and deletion. **Leave required approvals at zero** — GitHub does not permit approving your own pull request, so requiring one would permanently deadlock a single-owner repository. Leave bypass allowed so the owner retains an escape hatch; agents have none because they cannot click it. Prefer "Create a merge commit" over squash, so the per-commit reasoning is preserved.

**Verification:** documentation and template only; no code path changes. `npm run check` and the controller tests were run to confirm nothing regressed — numbers in `STATUS.md`. The protection rule itself is verified by observing that a direct push to `main` is refused once the owner has applied it.

#### Automatic pull request creation, pending owner action

Agents cannot open pull requests. Their sandboxes cannot reach `api.github.com` — TLS interception breaks certificate verification — and giving an agent a token that could would also let it approve its own work. GitHub opens the pull request instead, on push, using the repository's own scoped token.

**This requires a change to the existing workflow as well, and skipping it breaks the checks.** A pull request opened by `GITHUB_TOKEN` deliberately does **not** trigger further workflow runs; GitHub does this to prevent recursive automation. `.github/workflows/pull-request.yml` currently runs on `pull_request` and on pushes to `main` only, so an auto-opened pull request would arrive with **no checks at all** — and branch protection would then block it forever, waiting for a check that can never start. Changing the trigger to plain `push` fixes it: every push runs the checks, and because GitHub attaches check runs to the commit SHA, the pull request displays them and required status checks are satisfied.

**1. Change the trigger** in `.github/workflows/pull-request.yml`. Replace:

```yaml
on:
  pull_request:
  push:
    branches: [main]
```

with:

```yaml
on:
  push:
```

**2. Add** `.github/workflows/open-pull-request.yml`:

```yaml
name: Open pull request

# ENG-007. Agents cannot open pull requests: their sandboxes cannot reach
# api.github.com, and a token that could would also let an agent approve its own
# work. GitHub opens it instead, with a token scoped to this repository.
on:
  push:
    branches:
      - 'feat/**'
      - 'eng/**'
      - 'docs/**'
      - 'int/**'

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: open-pr-${{ github.ref }}
  cancel-in-progress: false

jobs:
  open-pull-request:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - name: Open a pull request if one is not already open
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BRANCH: ${{ github.ref_name }}
        run: |
          open=$(gh pr list --head "$BRANCH" --state open --json number --jq 'length')
          if [ "$open" != "0" ]; then
            echo "A pull request is already open for $BRANCH; it picks up this push automatically."
            exit 0
          fi
          # The agents' commit messages already carry the task ID, the exact
          # commands run, and what stayed unverified. That is the review
          # material, so it becomes the pull request body verbatim.
          {
            echo "Opened automatically on push. The body is the latest commit message."
            echo
            echo "---"
            echo
            git log -1 --pretty=%B
          } > "$RUNNER_TEMP/pr-body.md"
          gh pr create \
            --base main \
            --head "$BRANCH" \
            --title "$(git log -1 --pretty=%s)" \
            --body-file "$RUNNER_TEMP/pr-body.md"
```

**3. Two repository settings**, both required, both under *Settings → Actions → General*:

- **Workflow permissions** → *Read and write permissions*. A workflow cannot grant itself more than the repository default, so `pull-requests: write` is ignored while the default is read-only.
- **Allow GitHub Actions to create and approve pull requests** → checked. Without it `gh pr create` fails with a permissions error even when the token is otherwise correct.

One pull request is opened per branch and later pushes update it rather than opening another. Branches named outside the `feat/ eng/ docs/ int/` convention get no pull request, which is a useful forcing function for the naming rule.

**Next step:** owner applies the branch protection rule, then confirms a direct push to `main` is rejected. From that point every task ends in a pull request.

## ENG-008 — Secure-context development server and diagnosis

**Status:** Partially withdrawn — the `secure-context` diagnosis is Done and merged in `a032a01`; the `dev:lan` LAN server was **removed by ENG-009 (ADR-013)** and is not coming back · **Branch:** `eng/ENG-008-https-dev-server`, off `main` @ `3d0e87e` · **Dependencies:** None

**Read ADR-013 before reviving anything here.** The owner declined the LAN exposure on 2026-09-08. What survives is the half that was never about mobile: a module that refuses capture before the microphone opens when `crypto.subtle` is unavailable, and says which of the two causes applies. What was removed is the `dev:lan` script, its README section, and the assumption that mobile acceptance is reachable from a laptop on a shared network. The `Acceptance` and `Scope` below are recorded as written at the time; the first acceptance sentence is void.

**Acceptance:** A developer can reach Echo from a phone on the same network over HTTPS, so browser APIs that require a secure context work. When a secure context is genuinely unavailable, the application says so precisely instead of failing as a generic capture error.

**Rationale — two problems with one cause.** WEB-003's remaining acceptance work is mobile capture, and a phone cannot reach the `127.0.0.1` bind that `npm run dev` uses. Binding the LAN address alone does not help, because `checksum()` in `apps/web/src/lib/recording/session.ts` calls `crypto.subtle.digest`, which browsers expose only in a secure context — HTTPS or `localhost`. Over plain HTTP on a LAN `crypto.subtle` is `undefined`, capture throws, and the user sees "Capture incomplete" with no indication why. That gap is recorded against ENG-002 and is the same obstacle in both cases.

Next.js 16 provides `--experimental-https`, which generates a locally trusted certificate through `mkcert`. No dependency and no stack decision is required; this is a development script and a diagnostic, not an infrastructure choice. Production HTTPS remains a deployment concern under ADR-007 and ADR-010.

**Scope:** an opt-in `dev:lan` script serving HTTPS on the LAN address, kept separate from `npm run dev` so the safe loopback default is unchanged; a `secure-context` module that reports precisely why capture cannot run; its single call site; tests; and a README section covering certificate trust on the phone.

**Scope as delivered, after ENG-009:** the `secure-context` module, its single call site and its tests. The `dev:lan` script and the phone/certificate README section were removed; `README.md` now documents the loopback-only bind and why.

**Constraints:** `npm run dev` keeps binding `127.0.0.1` over HTTP. Exposing the application to the network stays a deliberate, separately named command. No new dependency. No weakening of the access gate — Basic credentials over a LAN require the encrypted transport this task provides.

## ENG-009 — Withdraw the LAN development server; pause mobile acceptance

**Status:** Done · **Branch:** `eng/ENG-009-withdraw-lan-exposure`, off `main` @ `a032a01` · **Dependencies:** None · **Decision:** ADR-013

**Acceptance:** No script in the repository binds Echo to a non-loopback interface; no document instructs anyone to reach Echo from another device on the network; no current task is blocked on a physical phone; and the secure-context guard keeps working with no test removed.

**Rationale.** ENG-008 shipped `npm run dev:lan`, which served the development server over HTTPS on `0.0.0.0` so a phone could reach it. The owner declined the exposure on 2026-09-08: a development server holding owner credentials and opening a live microphone should not be reachable from whatever network the laptop has joined. The gate still applying to every route is not the point — being on the network is. Underneath that was a sequencing mistake: mobile capture was an acceptance requirement for tasks whose product path is not deployed or proven, which made a security-relevant exposure look like a prerequisite for ordinary work. Deployment comes first; mobile follows against a deployed origin.

**Scope.** Removed the `dev:lan` script from both `package.json` files and the README section documenting phone access, replaced with a section stating the loopback-only bind and why. Marked ENG-008 partially withdrawn. Moved WEB-003's mobile item from outstanding to deferred. Recorded ADR-013.

**Deliberately kept — this is the judgement call in the task.** `apps/web/src/lib/recording/secure-context.ts`, its call site in `recorder.tsx` and its tests all stay. The module was written alongside `dev:lan` but never depended on it: it refuses capture *before* the microphone opens on any origin lacking `crypto.subtle`, which is precisely the ADR-010 self-hosted-over-plain-HTTP case the deployment work is walking into. Deleting it would have removed four passing tests and re-opened the ENG-002 gap to buy nothing. Only its advice changed, from `npm run dev:lan` to loopback or a properly served origin.

**Constraints honoured.** No dependency added or removed. No stack decision made or reversed — ADR-008 (Vercel) and ADR-010 (portability) are untouched. No check weakened and no test deleted; the suite gained one. `Dockerfile`'s `HOSTNAME=0.0.0.0` is unchanged and deliberate: a container binds inside its own network namespace and publishing it is an operator's explicit act, which is not a laptop listening on a shared LAN.

### Handoff (2026-09-08)

- **What changed:** `package.json` and `apps/web/package.json` (script removed), `README.md` (section replaced), `DECISIONS.md` (ADR-013 added), `TASKS.md` and `STATUS.md`, `apps/web/src/lib/recording/secure-context.ts` (comment and one user-facing string), `apps/web/tests/secure-context.test.ts` (two assertions retargeted, one test added).
- **Test count moves up, not down.** The secure-context file goes from 4 tests to 5. The new test asserts that no user-facing refusal message names `dev:lan`, `0.0.0.0` or `--experimental-https`, so re-adding the script through a string fails the suite rather than passing quietly.
- **Verification:** recorded in `STATUS.md`. Report only what was executed.
- **Open follow-up for whoever merges PR #9.** The `feat/WEB-004-durable-queue` branch carries its own copy of `STATUS.md` and `TASKS.md` written before this decision, including a WEB-004 handoff step *"4. Physical mobile: microphone Allow/Deny, interruption/background/lock-screen…"* and an *"HTTPS LAN phone certificate trust remains an owner check"* line. Those are now superseded by ADR-013 and must be marked deferred when that branch merges — this branch deliberately does not edit another task's lane. Expect a small conflict in both files; ADR-013 and ADR-012 do not collide.
- **Not done here, and not this task's job:** deploying Echo. That is the work ADR-013 puts ahead of mobile, and it belongs to a deployment task under ADR-008 and ADR-010.

## ENG-010 — Reproducible hosted deployment and deployed-origin verification

**Status:** Implemented; **nothing is deployed** and the deployed check has never run against a hosted origin · **Branch:** `eng/ENG-010-deploy-hosted-origin`, off `main` @ `f234040` · **Dependencies:** ENG-002 (satisfied) · **Decisions:** ADR-008, ADR-010, ADR-013 — none changed

**Acceptance:** A deployment can be produced from the repository rather than reconstructed from memory, and a deployed origin can be verified rather than assumed. Concretely: the build is defined in version control; a single command checks a live origin end to end without printing credentials; and the README names every step and variable the owner must supply. No new dependency, framework, host, storage or authentication decision.

**Rationale.** ADR-013 put deployment ahead of mobile capture, and it is a prerequisite for more than mobile. `checksum()` needs `crypto.subtle`, which browsers expose only in a secure context, so until Echo is served over HTTPS from a real origin, recording works nowhere except the machine running it. Nothing had been provisioned and nothing recorded how it would be — a Vercel project configured through the dashboard would leave the build arrangement invisible to Git and unreviewable.

**Scope.** Added `vercel.json` (framework, `npm ci`, `npm run build`, `apps/web/.next`), `scripts/deployed-smoke.mjs`, and `npm run test:deployed`. Rewrote the README *Vercel* section as a six-step provisioning runbook and cross-linked the check from the self-hosted section, since it is host-agnostic. Added an *ENG-010 deployment boundaries* section to `ARCHITECTURE.md`. Corrected two stale README claims found in the same section: the `selfhost-container` job **is** in `.github/workflows/pull-request.yml`, and the container image is therefore verified in CI.

**The failure mode the check exists to catch.** `apps/web/src/proxy.ts` gates every path with no exclusions, and `scripts/production.test.mjs` proves that against `next start`. A hosting platform commonly serves `/_next/static` from a CDN edge that answers *before* the application runs. If it does, every compiled asset is public on the deployed origin while every local check stays green — the ENG-002 static-asset failure shape, one layer further out, and invisible to any suite that runs on loopback. `deployed-smoke.mjs` fetches each linked asset without credentials and fails if any returns 200.

**Constraints honoured.** No dependency added. `vercel.json` is build configuration, not a platform primitive: no queue, blob store, cron, KV or edge binding enters application code, so ADR-010's rule is intact and the script verifies a self-hosted origin exactly as it verifies Vercel. `test:deployed` is deliberately outside `npm run check` — it needs a live URL and real credentials, so a CI gate cannot run it and must not appear to. No existing check was weakened and no test removed.

### Handoff

- **What changed:** `vercel.json` (new), `scripts/deployed-smoke.mjs` (new), `package.json` (`test:deployed` added), `README.md`, `ARCHITECTURE.md`, `TASKS.md`, `STATUS.md`. No application source file is touched.
- **Verified:** `npm ci` (0), `npm run check` (0 — 53 unit, 6 production HTTP, 4 self-host parity, production build) and the bounded-controller tests (0 — 16 tests), plus `deployed-smoke.mjs` against a local `next start` production server built from this branch, which exercises every check in it except the transport: 9 compiled assets each refused unauthenticated and served to the owner. Exact exit codes are in the `STATUS.md` snapshot.
- **The check was made to fail on purpose, six ways**, because a check that has only ever passed proves nothing. The important one: a local proxy standing in for a CDN edge, serving `/_next/static` without credentials and passing everything else through, made the script fail on the first asset with the intended message. The other five cover a wrong owner password, plain HTTP on a non-loopback host, credentials embedded in the URL, an unreachable origin and missing `ECHO_OWNER_*`. The table is in the `STATUS.md` verification snapshot.
- **Not verified, and this is the point of the task:** no hosted deployment exists, so the script has never met a CDN, a real certificate, or Vercel's build. `vercel.json` is unexercised until the first build runs. If that build fails, the documented fallback is setting Root Directory to `apps/web` with "Include source files outside of the Root Directory" enabled — record in this entry why it was needed.
- **Owner steps, which an agent cannot perform:** `vercel login` and `vercel link` are interactive, and `ECHO_OWNER_PASSWORD` and the provider keys are the owner's secrets. Follow the README runbook: generate the password, create the project, set the variables server-side for Production and Preview, deploy a preview, run `npm run test:deployed` against it, then promote and run it again against production. A preview passing does not verify production; they carry different variables.
- **Next task this unblocks:** mobile capture acceptance against the deployed origin — the task ADR-013 deferred. Open it once step 6 of the runbook passes, not before.

## ENG-003 — Shared status file and reading map

**Status:** Done — implemented on `feat/WEB-002-recording-slice` alongside WEB-002 · **Dependencies:** None

**Acceptance:** Give every session — Codex, Claude Code, or human — one short file to read first, so work can begin without loading the whole repository. `STATUS.md` carries current task state, the verification baseline with real exit codes and counts, what does and does not exist, and a reading map routing each kind of task to the few documents that answer it. `AGENTS.md`, `CLAUDE.md` and `README.md` route through it, and updating it in the same commit as any status or verification change is a stated rule.

**Rationale:** The previous instruction was to read `PROJECT_CONTEXT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md` and `TASKS.md` before changing behavior — roughly 50 KB of prose ahead of every task, which is the main reason a session exhausts its context before finishing. `STATUS.md` is explicitly a cache, not a competing source of truth: the owning document wins any disagreement and the stale summary gets fixed.

**Also in this change:** `apps/web/next.config.ts` sets `agentRules: false`, because `next dev` was generating a second `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` on every start — a competing instruction file that reappeared as an uncommitted change after each run. `next-env.d.ts` is now gitignored, matching the Next.js default, because `next dev` and `next build` write different contents into that tracked file.

**Handoff:** committed with the WEB-002 branch rather than on its own, since it documents the state that branch creates. Verification is the WEB-002 run recorded below and in `STATUS.md`.

## WEB-001 — Web shell and tooling

**Status:** Done (implemented, independently verified, and merged into `main`) · **Dependencies:** None

**Acceptance:** Create apps/web with Next.js, TypeScript, Tailwind; document actual install/dev/lint/typecheck/build commands and lockfile. Add private access baseline and empty session UI. Build and checks succeed.

**Handoff:** Branch `feat/WEB-001-web-shell`; implementation commit `0137bb16b67e2f3fa9ce63f5db8f5fe484458c35`. Coordinator delegated implementation to `builder`, then handed the clean commit to the separate read-only implementation reviewer `checker`. The checker reviewed the full diff against foundation `b2e1111` and independently ran the commands below on 2026-09-06 with Node 22.23.2/npm 10.9.8. No blocking findings; implementation was not changed by the checker. No scope change to later WEB tasks.

**Independent evidence:**
- `npm ci`: exit 0; 373 packages added, 375 audited, 0 vulnerabilities. Lockfile remained unchanged. npm warned that ESLint 9.39.5 is unsupported; the documented compatible pin remains a maintenance limitation.
- `npm run check`: exit 0. ESLint with zero warnings allowed passed; Next route generation and strict TypeScript passed; 3 unit tests passed; Next 16.3.4 production build passed; 2 production HTTP tests passed. Both test runs reported 0 failed, 0 skipped, 0 cancelled, 0 todo.
- `npm ls eslint --all`: exit 0, every resolved ESLint entry is 9.39.5; no stale ESLint 10 installation remains.
- `git diff --check b2e1111..0137bb16`: exit 0. Working tree remained clean after installation/checks. `git ls-files '*agent-loop*'` returned no tracked configuration: automation remains absent/disabled.

**Review coverage:** Fail-closed missing/invalid configuration and exact credential policy; independent server render guard; unauthorized page/API/static/RSC denial including a middleware-subrequest header; authorized production HTML/RSC/assets; synthetic-password absence from responses/assets; generated Tailwind utility; disabled empty-state action. CI runs the same install and aggregate check commands with read-only permissions and no secrets. Existing assertions and lint rules were not weakened to pass.

**Limitations and next step:** Owner reviews this branch; do not merge automatically. Remote GitHub Actions has not been run and branch protection is not configured by this local change. No browser visual/mobile or deployed HTTPS verification was performed. Provision owner credentials and HTTPS before hosted use. Basic auth limitations and the ESLint compatibility requirement are documented in README. Agent-loop real check commands and per-test reporting adapters remain unresolved; do not enable it. WEB-002 remains next after review.

## WEB-002 — Short recording vertical slice

**Status:** Done — implemented and verified on `feat/WEB-002-recording-slice`; **awaiting owner review, not merged** · **Dependencies:** WEB-001 (satisfied), ADR-009 and ADR-010

**Acceptance:** Record 30–60 seconds, stop, obtain a transcript and generated notes using server-side user-supplied keys through minimal provider interfaces. Handle permission denial and provider failure; verify using synthetic audio.

**Intended vertical slice:**

```text
Browser microphone → record 30–60 seconds → Stop → server-side upload/request
  → TranscriptionProvider → Transcript → NotesProvider / LLM → Generated notes
  → display transcript + notes
```

**Must handle at least:** microphone permission denial, recording failure, transcription provider failure, and LLM provider failure — each surfaced to the user without exposing credentials.

**Constraints:** Keep provider implementations replaceable behind the `TranscriptionProvider` / `NotesProvider` abstractions; keep credentials server-side and out of `NEXT_PUBLIC_*`. Backend work stays inside Next.js Route Handlers and server modules (ADR-008). Do not introduce a database, object storage, background worker, or production auth system — those decisions are open; if WEB-002 genuinely needs one, follow the stack-change procedure in `ARCHITECTURE.md` first. Tests must not require manually recording real microphone audio; use synthetic or fixture audio. shadcn/ui may be installed here if the slice needs its primitives.

**Provider approach (ADR-009, accepted at the start of this task):** Use the OpenAI-compatible wire format as the port for both providers, so hosted and self-hosted deployments share one adapter and switching is a base-URL change. Ship two adapters: `openai-compatible` and a `fixture` adapter supplying deterministic canned transcripts, since the acceptance criteria forbid tests that require real microphone audio. Validate configuration at startup so a missing key fails closed the way the WEB-001 access gate does, rather than at first recording. Diarization is explicitly out of scope: it is a separate session-scoped port that depends on object storage and cannot ship before WEB-005.

**Sizing note:** a 30–60 second Opus clip is well under one megabyte against Vercel's 4.5 MB function payload limit, so this slice needs no object storage and forces none of the open infrastructure decisions.

### Handoff

**Task:** WEB-002 — short recording vertical slice.
**Branch:** `feat/WEB-002-recording-slice`, branched from `docs/ADR-009-provider-selection` (see *Branch base* below).
**Commits:** `1ce70fe` chore — ignore `.claude/worktrees/`; `e9193ff` the implementation and its documentation.

**Branch base — read this before merging.** ADR-009 and ADR-010 were *not* on `main` when this task started. They existed only on `docs/ADR-009-provider-selection` (`93ec5b5`, one commit ahead of `main`, checked out in a worktree) and both were still marked *Proposed — awaiting owner acceptance*. Repository documentation is authoritative, so this branch was based on that commit rather than on `main`, and the two ADRs were marked **Accepted** because the owner directed the implementation to proceed against them. Merging this branch therefore also merges ADR-009 and ADR-010. If either decision is not in fact accepted, stop before merging.

**Scope delivered**

- `POST /api/recordings` (Node runtime, dynamic): accepts one multipart clip, returns transcript, notes, and provider disclosures. It calls `requireOwnerAccess` at its own boundary rather than relying on Proxy.
- Provider ports in `apps/web/src/lib/providers/`: domain `types.ts`, typed `errors.ts`, startup `config.ts`, `factory.ts`, and the module-scope `registry.ts` that evaluates configuration once at server start. `src/instrumentation.ts` reports problems at boot by variable name.
- Two adapters per port. `openai-compatible.ts` speaks the ADR-009 wire formats; `fixture.ts` returns deterministic canned output, performs no I/O, and supports injected failures so every failure path is testable without a network.
- `apps/web/src/lib/recording/pipeline.ts` validates the clip before any credential is used, then transcribes and generates notes. `http.ts` maps a `ProviderError` onto a client-safe status and body.
- UI: `recorder.tsx` (client) owns MediaRecorder, permission handling, the elapsed timer and the 60-second auto-stop; `recording-result.tsx` renders notes, timestamped transcript and the disclosure notice; `session-shell.tsx` and `page.tsx` wire them to server-side provider status.
- Documentation: ARCHITECTURE.md gains a `WEB-002 recording slice boundaries` section and an updated `Current implementation state` and layout; ADR-009/ADR-010 marked Accepted; README, `.env.example`, PROJECT_CONTEXT.md and ROADMAP.md reconciled.

**Failure paths surfaced, none carrying credentials**

| Path | Surfaced as |
| --- | --- |
| Microphone permission denied | Distinct message per `NotAllowedError`/`SecurityError`, `NotFoundError`, `NotReadableError`, and unsupported browser |
| Recording failure | `MediaRecorder` error event, empty clip, and sub-second clip each stop the recorder, release the microphone and explain that nothing was sent |
| Transcription provider failure | `ProviderError` with port `transcription`, a code, and a retryable flag → mapped status (401/403→502, 429→429, 408→504, 413→413, 422→400, 5xx→502) |
| LLM provider failure | Same, with port `notes`; the UI titles it separately |
| Incomplete configuration | Startup log by variable name, recorder replaced by an explanation, endpoint answers 503 `provider_unconfigured` |

**Checks and outcomes** — run from the repository root on `e9193ff`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | 0 | Clean install, 0 vulnerabilities |
| `npm run check` | 0 | ESLint `--max-warnings=0` clean; `next typegen` + `tsc --noEmit` clean; **33 unit tests, 33 pass, 0 fail**; production build succeeded; **4 production HTTP tests, 4 pass, 0 fail** |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** (controller only; unchanged by this task) |

Additional evidence: no `NEXT_PUBLIC_*` appears in application source; no API-key-shaped string appears anywhere in `.next` build output; `agent-loop.json` still has `"ready": false`. Unit tests grew from 3 to 33 and production HTTP tests from 2 to 4. No existing assertion was removed or relaxed — the page content marker moved with the page, and `/api/recordings` was added to the private-path list.

**Live service check — 2026-09-06.** Machine-generated speech was posted to `POST /api/recordings` against the real Groq endpoints: HTTP 200 in 1.4 s, correct transcript, sensible notes and action items, timestamps normalized into milliseconds. This was the first live vendor call ever made from this repository.

It exposed one bug, fixed in the same branch. This wire format identifies audio by the uploaded file's **filename extension**, not by its content type, and returns 400 for a name it cannot classify. A browser recording has no extension, so every real recording failed with "The recording was not in a form the provider accepts." The adapter now derives an extension from the clip's media type, and a regression test asserts the uploaded filename. The same fix separated two failures that previously shared one message: `invalid_input` now means Echo rejected the clip, and `rejected_by_provider` means the clip reached the service and was refused. Failures are also logged server-side with port, code and upstream status — no bodies, credentials, audio or transcript.

**Limitations and blockers**

- **Latency is not measured.** REQ-006 targets 5–10 s from stop to result; the single live check ran 1.4 s for a 7-second clip on one connection. That is one measurement, not a measured claim, and nothing records clip length, device, connection or provider yet.
- **No browser was driven.** `MediaRecorder`, permission prompts, the auto-stop and mobile capture were not exercised; the client component is covered only by server-rendered markup assertions. Codec and mobile-browser validation remain WEB-003.
- Nothing is persisted, so a failed notes call discards a successful transcription. Retry re-records and re-transcribes.
- Retention is reported as `unknown` for every remote endpoint. ADR-009 requires an operator to confirm a vendor's zero-retention setting; Echo has no mechanism for that confirmation yet.
- shadcn/ui was **not** installed. The slice needs a button and two panels, and ADR-008 makes shadcn available when a task needs its primitives rather than by default. It remains approved and uninstalled.
- `agent-loop.json` remains `"ready": false`. `scripts/run-app-tests.py` and `scripts/run-app-acceptance.py` still do not exist, and this task did not create them.

**Next step:** owner reviews this branch and confirms ADR-009/ADR-010 acceptance; run the manual live-vendor and browser checks above; then merge to `main`. WEB-003 follows.

## ENG-005 — Provider configuration doctor

**Status:** Implemented and verified; awaiting owner review · **Branch:** `feat/WEB-002-recording-slice` @ `67212de`

**Acceptance:** `npm run doctor` makes one cheap authenticated request per configured remote port, reports pass/fail and relevant variable names without exposing credentials, runs fixture adapters offline, and remains outside `npm run check`.

**Scope:** GET models probes authenticate without inference or audio; they do not certify model access. Independent port validation, ten-second timeouts, no redirects, body disposal and fixed error text. The command loads local server configuration for owner use; this development session does not read that file or run a real-key probe.

**Handoff (2026-09-07):** Committed at `4675423`, typecheck fix at `67212de`, pushed to `origin/feat/WEB-002-recording-slice`. The 2026-09-06 blockers — `.git/index.lock` `EPERM`, half-deleted `node_modules`, missing `eslint` — were sandbox artifacts and do not reproduce. Full gate verified from a clean install on 2026-09-07: `npm ci` exit 0, `npm run check` exit 0 (46 unit, 5 production HTTP), `python3 -m unittest discover -s tests` exit 0 (16 tests). The four doctor tests are inside that unit count. `npm run doctor` in fixture mode exits 0 with both ports PASS and reads no credential file. **No real-key probe has ever been run** — that is owner work: populate `apps/web/.env.local` and run `npm run doctor`. A passing models probe authenticates the key; it does not prove access to any specific model. Next: owner review and merge with the rest of the branch.

## WEB-003 — Session and playable chunk model

**Status:** Implemented and verified by test; **browser acceptance outstanding** · **Branch:** `feat/WEB-002-recording-slice` @ `67212de` · **Dependencies:** WEB-002 (owner authorized proceeding before merge on 2026-09-06)

**Acceptance:** Implement timed ordered chunk metadata and independently decodable chunks with configurable overlap. Validate boundary capture, sequence, checksum and codec behavior on selected browsers.

### Browser harness handoff (2026-09-07)

- **Status:** harness implemented, unverified; WEB-003 is **not Done**. Browser evidence remains for owner review. Same branch `feat/WEB-002-recording-slice`; no other task added.
- **Run:** start `npm run dev` from the repository root with the existing owner configuration, open `http://localhost:3000/diagnostics/capture`, sign in through the existing owner gate, then click **Run browser acceptance**. Keep the tab visible for about 42 seconds. No microphone permission or provider access is needed. Production returns 404 after owner authorization; Proxy and independent server-page guard both remain in place.
- **Harness:** OscillatorNode frequency sweep (220–1320 Hz) → MediaStreamAudioDestinationNode → existing `captureSession`, with no injected runtime. Three 14-second runs use 6-second chunks and 0/1000/2000 ms overlap. A temporary native MediaRecorder subclass observes constructor MIME, same-stream identity, native states, and start/stop calls/events; restores the constructor and releases audio resources afterward. It does not replace the capture algorithm, clock, recorder implementation, events or blobs.
- **Assertions/evidence:** every independent blob must decode using `AudioContext.decodeAudioData`; every checksum is recomputed; real metadata must pass `validateChunkOrder` and contain at least three chunks. Shows all metadata, bytes, MIME types, decode duration/sample rate/channels, checksums, recorder timings and pairwise overlap/drift. Native state overlap must be within **±250 ms** of requested overlap; asynchronous event overlap is shown separately. Positive overlap requires overlapping event windows as well as simultaneous native recording states. Zero overlap checks the immediate relay handoff. A hidden tab or cancelled/incomplete run fails acceptance. Timing does not prove sample-accurate audio continuity.
- **Browser observations:** **none collected**. Dev launch could not find `next` (exit 127). Do not interpret harness code or unit tests as browser evidence.
- **Required commands actually attempted from repository root:** `npm ci` exit **255**, `EPERM` removing `apps/web/node_modules/.bin` (same on unsandboxed retry); `npm run check` exit **127**, source-tracked passed then `eslint` missing, so unit/build/HTTP stages did not execute; `python3 -m unittest discover -s tests` exit **1**, Python 3.9 unittest error reporting hit `RecursionError`, no completed count (same on unsandboxed retry). No dependencies repaired, tests skipped/rewritten, or historical green results claimed for this change. Existing 46 unit / 5 HTTP tests retained; one production exclusion test added and the diagnostic path added to existing access-denial probes. New expected HTTP count: 6, unexecuted. `git diff --check` passed.
- **Human work still required:** after the required gate succeeds, run the harness in Chromium and Safari and review every result; exercise the normal recorder with microphone Allow and Deny, and verify the real UI’s 60-second auto-stop and playback. All of this runs on the machine hosting Echo. **Mobile capture is deferred to a later task under ADR-013** and is no longer part of this acceptance. Review browser evidence before deciding task acceptance.

### Prior implementation handoff (2026-09-07, before harness)

- **Branch/commit:** `feat/WEB-002-recording-slice`; implementation `4675423`, typecheck fix `67212de`, pushed to `origin/feat/WEB-002-recording-slice`. Working tree clean. The 2026-09-06 handoff recorded this work as uncommitted and unverifiable; that was a sandbox failure (`.git/index.lock` `EPERM`, half-deleted `node_modules`, missing `eslint`) and none of it reproduces.
- **Scope:** Browser-memory session and chunk identities, sequence, monotonic boundaries, measured overlap, and codec/size/SHA-256 metadata; independent recorder containers with configurable overlap; playback and sequential processing after stop, with separate results per chunk and clips preserved on failure. The endpoint validates optional chunk metadata, recomputes the checksum server-side, and passes real session offsets to adapters. ADR-011 records the prototype strategy. No new infrastructure, no credential-handling change, bounded loop still off.
- **Source recovery:** `apps/web/src/app/api/recordings/route.ts` had been hidden from Git by a broad `recordings/` ignore rule. The pattern is now anchored to the repository root (`/recordings/`) rather than patched with path-specific negations, and ENG-006's `check:tracked` fails the build if it recurs. The Route Handler entered `HEAD` for the first time at `67212de`.
- **Independent review fixes applied:** fully-overlapped terminal chunks, recorder callback typing, failure settlement, unexpected-stop notification, object URL lifecycle, and halting processing after an HTTP failure.
- **Verification actually executed, 2026-09-07, from the repository root, Node 22.23.2 / npm 10.9.8:** `npm ci` exit 0, 0 vulnerabilities. `npm run check` exit 0 — `check:tracked` OK, lint clean, typecheck clean, **46 unit tests, 46 pass, 0 fail**, production build succeeded, **5 production HTTP tests, 5 pass, 0 fail**. `python3 -m unittest discover -s tests` exit 0, **16 tests, OK**. Baselines were 33 unit / 4 production HTTP / 16 Python; nothing was removed or relaxed. The 2026-09-06 fallback runner and its reproducible partial commands are obsolete and were never a substitute for this gate.
- **Browser acceptance — not done, and this is what blocks the task.** No `MediaRecorder` call, permission prompt, codec negotiation, auto-stop or mobile capture has ever run in a real browser. The riskiest untested assumption is the relay itself: `captureSession` runs two `MediaRecorder` instances on one `MediaStream` during the overlap window, and no browser has confirmed it permits that. Boundaries, ordering, checksums and failure paths are covered only by an injected fake clock and fake recorder in `apps/web/tests/session.test.ts`.
- **Known gap, log against ENG-002:** `checksum()` in `apps/web/src/lib/recording/session.ts` calls `crypto.subtle.digest`, available only in a secure context (HTTPS or `localhost`). Self-hosting over plain HTTP on a LAN — an ADR-010 baseline — leaves `crypto.subtle` undefined; capture then fails as the generic "Capture incomplete" message with no diagnosis. Not reachable today because `dev` and `start` bind `127.0.0.1`.
- **Next:** validate real decoding, relay boundaries and the 60-second auto-stop in Chromium and Safari on the host machine, then mark WEB-003 complete. One mobile browser was previously part of this line and is deferred under ADR-013. Durable retry deduplication, offline storage and stitching remain WEB-004 onward.

Owner use of the diagnostic is `npm run doctor`, which reads `apps/web/.env.local`. For an offline run that touches no credential file, prefix it with `TRANSCRIPTION_PROVIDER=fixture TRANSCRIPTION_MODEL=test LLM_PROVIDER=fixture LLM_MODEL=test`. A passing models probe authenticates the key; it does not prove model-specific inference access.

## WEB-004 — Durable offline queue

**Status:** Implemented; native browser/local verification and owner acceptance pending — **NOT Done** · **Dependencies:** WEB-003

**Acceptance:** Persist chunks before upload; recover after reload and disconnect, retry on reconnect without data duplication, expose quota errors and unsynced status. Document mobile background limits.

### Handoff (2026-09-08)

- **Branch/base/PR:** `feat/WEB-004-durable-queue`, from `main` @ `a032a01`; [PR #9](https://github.com/Meerlikeskeer/echo/pull/9), implementation `5e4b9bc`, checker fixes `64ba19b`, documentation handoff in the following commit. All are pushed. Do not merge automatically.
- **Decision first:** ADR-012 committed as `c31c4de` before code. Native IndexedDB with no new dependency; browser-local storage only, no server object/audio storage choice. Alternatives, browser quota/eviction risks, Safari budget and explicit limits are recorded in DECISIONS.md and ARCHITECTURE.md.
- **Implemented:** atomic Blob/metadata/state commits; existing `(sessionId, id)` identity and unique session sequence; normalized media types at persistence and HTTP boundaries; checksum verification before save/upload and after recovery; out-of-order recovery with gap notice; bounded reconnect/reload retries under Web Locks; persisted results; explicit local-only/pending/unsaved status, capacity/persistence warnings and audio downloads. Raw audio is never deleted, including after HTTP 200, because RET-002 through RET-006 cannot yet be satisfied.
- **Collision-sensitive change:** `capture.ts` must invoke persistence at each completed container, because its former design materialized chunks only at session stop. `finished` now waits for those callbacks; failure stops capture and retains available chunks. Existing runtime/timing behavior stays covered. `session.ts` is unchanged.
- **Independent checker:** found and then confirmed fixes for playback resetting on every IndexedDB refresh, permanent provider failures being retried, and server-side MIME whitespace mismatch. Focused regression tests added; no remaining serious code defect reported at `64ba19b`. The disabled bounded loop was not enabled; this was a manual read-only checker review.

**Required command results, not substituted:**

| Environment / command | Exit | Observed result |
| --- | --- | --- |
| Original root `npm ci` | 255 | EPERM removing workspace node_modules/.bin, including escalated retry. |
| Original root `npm run check` | 127 | Source tracking passed; eslint missing after failed install. Tests/build did not execute. |
| Original root `python3 -m unittest discover -s tests`, system Python 3.9 | 1 | RecursionError during cleanup, no final count. |
| Original root same Python command, Python 3.12 selected in PATH | 1 | 16 tests, 16 cleanup errors (rmdir EPERM); not green. |
| Isolated checkout `npm ci --cache /private/tmp/echo-web004-npm-cache` | 0 | Installed same locked dependencies, 0 vulnerabilities, cleanup warnings. Environment files excluded by policy. |
| Isolated checkout `npm run check`, final code | 1 | lint/types pass; 68 unit, 68 pass, 0 fail; build EPERM deleting .next/types. HTTP/self-host did not run locally. |
| CI `npm ci` and `npm run check` | 0 / 0 | [Run 34191686984](https://github.com/Meerlikeskeer/echo/actions/runs/34191686984) on `64ba19b`: 68 unit, 7 production HTTP, 4 self-host parity, all pass; build passes. Container build/smoke job also passes. CI does not certify the Python command. |

**Local dependency repair — resolved 2026-09-09, and it was never a repository problem.** The earlier `EPERM` / exit 255 / exit 127 failures came from an agent session that lost filesystem access to the repository mid-run; the symptom was misread as a corrupt dependency tree. From a healthy session, a plain `npm ci` at the repository root succeeds (373 packages, 0 vulnerabilities) and the full `npm run check` passes including the production build. No dependency manifest or lockfile was ever changed, and the isolated-checkout workaround is no longer needed.

**Native test artifact, not a claimed pass:** `/diagnostics/queue` executes the production IndexedDB adapter in the browser, including Blob roundtrip/checksums, simultaneous duplicate offers, sequence conflict, out-of-order recovery, a quota-budget abort preserving the earlier commit, and abort after native request success. Separate buttons exercise real capture persistence before session stop and pending recovery after page reload. A new production HTTP test ensures the page is unavailable in production; the existing unauthorized route matrix includes it. Safari displayed the page (HTTP 200), but automation lost the page view / returned `elementHasNoFrame` and `noWindowsAvailable`; no native PASS result was observed. Budget injection tests do not certify real disk exhaustion.

**Human still must verify:**

1. On a development server, open `/diagnostics/queue` in Chrome and Safari. Run native storage tests; require all PASS lines. Reload, then select Recover pending clips; require 3 pending chunks with verified checksums. Run Test capture persistence; require a commit before session stop and all completed Blobs recovered. Use synthetic data only.
2. In the real recorder, record, disconnect, stop and reload/reopen the same origin when reachable. Pending audio must recover; reconnect must process once locally, retain raw Blobs/results and not reset playback every five seconds. Repeat with two tabs and an interrupted response; remote provider work may repeat because no durable server job ledger exists.
3. Exercise actual browser quota exhaustion/private mode and a mid-recording write failure. Confirm capture stops, previous commits remain, unsaved audio can be downloaded, and no raw copy is automatically deleted. Diagnostic budget/abort tests are only deterministic coverage of that path.
4. **Deferred, not outstanding (ADR-013).** Physical mobile: microphone Allow/Deny, interruption/background/lock-screen, force-close and reopen, low storage and persistent-storage refusal. Echo no longer binds a non-loopback interface, so no phone can reach it; this moves to its own task against a deployed HTTPS origin and **WEB-004 is not incomplete for lacking it.** The stated limits still hold whenever it is run: only complete committed containers survive, the active container can be lost, timers and uploads stop when suspended or closed, and the application shell is not cached for an offline hard navigation — data recovers when the same origin is available. The former "HTTPS LAN phone certificate trust" owner check is void; ADR-013 removed the LAN server it referred to.
5. **Done, 2026-09-09.** All required commands were rerun from the original repository root after merging `main` @ `f234040`: `npm ci` exit 0, `npm run check` exit 0 (69 unit, 7 production HTTP, 4 self-host parity, all pass, production build succeeded), `python3 -m unittest discover -s tests` exit 0 (16 tests, OK). The earlier failures were a broken agent sandbox, not a repository defect; see the local-environment note above. WEB-004 remains pending acceptance on native-browser evidence alone.

**Next:** owner reviews PR #9 and completes the native/manual checks above. No CI change is needed; no workflows were edited. No server copy, retention deletion, background upload or exactly-once provider execution is claimed.

## WEB-005 — Incremental upload and transcription

**Status:** Todo · **Dependencies:** WEB-003, WEB-004

**Acceptance:** Upload/transcribe during recording with durable status, bounded retry/backoff and idempotent jobs; demonstrate reordered uploads and provider failures recover without duplicated work.

## WEB-006 — Transcript stitching

**Status:** Todo · **Dependencies:** WEB-005

**Acceptance:** Align session timestamps and overlap text, retain provenance, flag missing chunks, and finalize only complete sessions. Test repeated speech, overlap, gaps and out-of-order results.

## WEB-007 — Structured artifacts

**Status:** Todo · **Dependencies:** WEB-006

**Acceptance:** Generate validated title, summary, notes, action items and research topics tied to transcript revision; reject malformed output and prevent stale generation overwrites.

## WEB-008 — Quick Note mode

**Status:** Todo · **Dependencies:** WEB-002, WEB-007

**Acceptance:** Classify task/reminder/note/idea into pending actions. Measure stop-to-result latency against 5–10 second online target with conditions documented; show pending offline state and ambiguous dates.

## WEB-009 — Session history

**Status:** Todo · **Dependencies:** WEB-004, WEB-007

**Acceptance:** List and reopen sessions and artifacts with accurate partial/failed/complete, sync and retention states; expose retry actions and owner isolation.

## WEB-010 — Guarded audio retention

**Status:** Todo · **Dependencies:** WEB-005, WEB-009

**Acceptance:** Implement RET-001–006 including verified surviving raw copy, warning delivery/grace period, persisted Keep, near-full handling and guarded idempotent deletion. Decide defaults; test failed transcription, unavailable copies, keep/deletion races and cross-device last-copy protection.

## WEB-011 — Settings and privacy hardening

**Status:** Todo · **Dependencies:** WEB-002, WEB-009

**Acceptance:** Expose provider/retention settings without returning keys; validate inputs, redact errors, enforce owner access and private storage. Document supported single-user configuration and test unauthorized access.

## WEB-012 — Private deployment and recovery validation

**Status:** Todo · **Dependencies:** WEB-006, WEB-008, WEB-010, WEB-011

**Acceptance:** Document reproducible self-hosted setup, actual checks, backup/recovery and browser support. Demonstrate interrupted recording/upload recovery and deletion guards with synthetic data.

## WEB-013 — Opt-in research

**Status:** Todo · **Dependencies:** WEB-007, WEB-011

**Acceptance:** Add replaceable research adapter with explicit opt-in, cited source URLs and provenance; distinguish suggestions from researched findings and handle provider failures.

## WEB-014 — Confirmed reminder/calendar export

**Status:** Todo · **Dependencies:** WEB-008, WEB-011

**Acceptance:** Add replaceable adapter with preview, date/timezone resolution, explicit confirmation, minimal permissions and idempotent export; test retries without duplicate events.

## INT-001 — Branch integration and architecture documentation

**Status:** Done

Created `main` as the canonical development branch by merging `feat/bounded-agent-workflow` (fast-forward from the DOC-001 base) and then `feat/WEB-001-web-shell`. Source branches `docs/project-foundation`, `feat/bounded-agent-workflow` and `feat/WEB-001-web-shell` are retained unchanged; no unique work remains outside `main`.

Conflicts resolved in `AGENTS.md`, `PROJECT_CONTEXT.md`, `README.md` and `DECISIONS.md`. The duplicate ADR-006 authored independently on both feature branches was reconciled by keeping ENG-001's controller decision as ADR-006 and renumbering WEB-001's bootstrap decision to ADR-007; both decisions are preserved in full. Added ADR-008 (Vercel deployment, shadcn/ui, initial Next.js full-stack architecture) and a canonical `Technology Stack` section in `ARCHITECTURE.md`. Corrected cross-branch stale statements: the web app is no longer "not scaffolded", and `agent-loop.json` is no longer "absent".

**Verification after integration** (Node 22.23.2, npm 10.9.8): `npm ci` exit 0, 373 packages, 0 vulnerabilities, lockfile unchanged; `npm run check` exit 0 — ESLint clean, strict TypeScript clean, 3 unit tests passed, Next 16.3.4 production build succeeded, 2 production HTTP tests passed, 0 failed/skipped in both runs; `python3 -m unittest discover -s tests` exit 0 with 16 tests passing on both Python 3.9.6 and 3.12.13; agent-loop preflight exit 2 (correctly blocked). GitHub Actions was not run remotely and no deployment was performed.

**Next step:** WEB-002. Do not enable the agent loop.

## Handoff template

For an active/completed task record: task ID; branch and commit; scope changed; checks and outcomes; blockers/open decisions; next step. Keep credentials and real recording content out of handoffs.
