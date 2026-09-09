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

**Status:** **Done and fully verified.** Merged to `main`; Echo is deployed, and on 2026-09-08 `npm run test:deployed` completed its first full pass against the hosted origin · **Branch:** `eng/ENG-010-deploy-hosted-origin`, off `main` @ `f234040`; completion recorded by DOC-004 · **Dependencies:** ENG-002 (satisfied) · **Decisions:** ADR-008, ADR-010, ADR-013, ADR-014 — none changed

**Acceptance:** A deployment can be produced from the repository rather than reconstructed from memory, and a deployed origin can be verified rather than assumed. Concretely: the build is defined in version control; a single command checks a live origin end to end without printing credentials; and the README names every step and variable the owner must supply. No new dependency, framework, host, storage or authentication decision.

**Rationale.** ADR-013 put deployment ahead of mobile capture, and it is a prerequisite for more than mobile. `checksum()` needs `crypto.subtle`, which browsers expose only in a secure context, so until Echo is served over HTTPS from a real origin, recording works nowhere except the machine running it. Nothing had been provisioned and nothing recorded how it would be — a Vercel project configured through the dashboard would leave the build arrangement invisible to Git and unreviewable.

**Scope.** Added `vercel.json` (framework, `npm ci`, `npm run build`, `apps/web/.next`, and `git.deploymentEnabled: false` per **ADR-014** — a push deploys nothing; deploying is always an explicit `npx vercel`), `scripts/deployed-smoke.mjs`, and `npm run test:deployed`. Rewrote the README *Vercel* section as a six-step provisioning runbook and cross-linked the check from the self-hosted section, since it is host-agnostic. Added an *ENG-010 deployment boundaries* section to `ARCHITECTURE.md`. Corrected two stale README claims found in the same section: the `selfhost-container` job **is** in `.github/workflows/pull-request.yml`, and the container image is therefore verified in CI.

**The failure mode the check exists to catch.** `apps/web/src/proxy.ts` gates every path with no exclusions, and `scripts/production.test.mjs` proves that against `next start`. A hosting platform commonly serves `/_next/static` from a CDN edge that answers *before* the application runs. If it does, every compiled asset is public on the deployed origin while every local check stays green — the ENG-002 static-asset failure shape, one layer further out, and invisible to any suite that runs on loopback. `deployed-smoke.mjs` fetches each linked asset without credentials and fails if any returns 200.

**Constraints honoured.** No dependency added. `vercel.json` is build configuration, not a platform primitive: no queue, blob store, cron, KV or edge binding enters application code, so ADR-010's rule is intact and the script verifies a self-hosted origin exactly as it verifies Vercel. `test:deployed` is deliberately outside `npm run check` — it needs a live URL and real credentials, so a CI gate cannot run it and must not appear to. No existing check was weakened and no test removed.

### Handoff

- **What changed:** `vercel.json` (new), `scripts/deployed-smoke.mjs` (new), `package.json` (`test:deployed` added), `README.md`, `ARCHITECTURE.md`, `TASKS.md`, `STATUS.md`. No application source file is touched.
- **Verified:** `npm ci` (0), `npm run check` (0 — 53 unit, 6 production HTTP, 4 self-host parity, production build) and the bounded-controller tests (0 — 16 tests), plus `deployed-smoke.mjs` against a local `next start` production server built from this branch, which exercises every check in it except the transport: 9 compiled assets each refused unauthenticated and served to the owner. Exact exit codes are in the `STATUS.md` snapshot.
- **The check was made to fail on purpose, six ways**, because a check that has only ever passed proves nothing. The important one: a local proxy standing in for a CDN edge, serving `/_next/static` without credentials and passing everything else through, made the script fail on the first asset with the intended message. The other five cover a wrong owner password, plain HTTP on a non-loopback host, credentials embedded in the URL, an unreachable origin and missing `ECHO_OWNER_*`. The table is in the `STATUS.md` verification snapshot.
- **Now verified, and this was the point of the task (2026-09-08).** A hosted deployment exists and the script has met a real CDN, a real certificate and Vercel's build. `npm run test:deployed` against `https://echo-73alocfwt-…vercel.app/` exited **0**: anonymous requests challenged, wrong credentials refused, the page and **9 compiled assets served to the owner only**, diagnostics hidden, the recording endpoint guarded, providers reported configured. **The CDN answers behind Echo's gate, not in front of it** — the failure this task was built to detect does not occur on Vercel. `vercel.json` is exercised; the Root Directory fallback was never needed. Getting here took three platform-side problems, none of them a code defect: `devDependencies` (ENG-011, later disproved), the `standalone` build hook (ENG-012, a real fix), the Vercel Toolbar upload error (DOC-003, resolved by disabling the toolbar), and finally Deployment Protection (ENG-013, an owner setting).
- **Owner decision recorded mid-task:** on 2026-09-08 the owner declined deploy-on-push, because parallel task branches push several times an hour and the plan's build allowance would be spent on version-control activity rather than on deployments anyone asked for — exhausting it mid-day would take the deployed origin down for reasons unrelated to the code. Recorded as ADR-014 and enforced in `vercel.json`, not by habit. CI is untouched.
- **Owner steps, which an agent cannot perform:** `vercel login` and `vercel link` are interactive (answer `./` to the code-directory prompt), and `ECHO_OWNER_PASSWORD` and the provider keys are the owner's secrets. Follow the README runbook: generate the password, create the project, set the variables server-side for Production and Preview, deploy a preview, run `npm run test:deployed` against it, then promote and run it again against production. A preview passing does not verify production; they carry different variables.
- **Next task this unblocks, and the precondition is now met:** mobile capture acceptance against the deployed origin — the task ADR-013 deferred. Step 6 of the runbook has passed, so **this can now be opened.** It has not been opened yet; doing so is the next piece of product work alongside WEB-004's browser acceptance.

## ENG-011 — The first production deployment failed: Vercel installs without devDependencies

**Status:** Merged, but **it was not the cause** — corrected by ENG-012 · **Branch:** `eng/ENG-011-vercel-dev-dependencies`, off `main` @ `318c356` · **Decisions:** none changed

> **Correction, 2026-09-08.** The build log from the real deployment disproves the diagnosis below. Vercel's install reported `added 378 packages` — the full tree, devDependencies included — so Vercel does **not** set `NODE_ENV=production` for the install step and a plain `npm ci` was never the problem. The local reproduction was real but recreated a condition the platform does not create, and the conclusion was drawn from it before the build log was read. `--include=dev` is kept: it is correct, explicit and harmless. The actual cause is in **ENG-012**.

**Symptom.** The first `npx vercel --prod` failed at `318c356` with `Command "npm run build" exited with 1` and nothing else. The same commit builds cleanly on the development machine, and CI is green, so the failure was invisible to every check the repository had.

**Cause, reproduced rather than guessed.** Vercel sets `NODE_ENV=production` for the install step. npm reads that as `--omit=dev`, so ENG-010's `"installCommand": "npm ci"` installed **26 packages instead of 373**. Everything `next build` needs to compile is a devDependency — `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `@types/*` — and correctly so: they are build-time tools, not runtime dependencies. The build died resolving `@tailwindcss/postcss` from `apps/web/src/app/globals.css`, and Vercel surfaced only the exit code.

**Fix.** `"installCommand": "npm ci --include=dev"` in `vercel.json`. `--include=dev` overrides the inherited `--omit=dev` and restores the full tree. Moving the packages into `dependencies` would also work and is wrong: it misdescribes them and ships build tooling into the runtime bundle, which ADR-010's self-hosted image would then carry.

**Why nothing caught it.** Every existing check installs with the development default. `npm run check`, CI and the container build all run `npm ci` with `NODE_ENV` unset, so all three install devDependencies and pass. The failure needs `NODE_ENV=production` at install time, which only the hosting platform supplies — the same shape as the risk ENG-010's deployed check exists for, one step earlier in the pipeline: a condition no local suite reproduces.

### Handoff

- **What changed:** `vercel.json` (`installCommand`), `README.md` (why `--include=dev` is required, with the local reproduction), `TASKS.md`, `STATUS.md`. No application source.
- **Verified by reproduction, in a clean clone of `318c356` with no environment file:** `NODE_ENV=production npm ci` installed 26 packages, `typescript` and `tailwindcss` absent, and `npm run build` exited **1** with the PostCSS resolution failure — the reported symptom. The same clone with `NODE_ENV=production npm ci --include=dev` installed 373 packages and `npm run build` exited **0**.
- **Not verified:** that Vercel now builds. Only a real deployment shows that, and `npx vercel` cannot run from an agent sandbox (npm cache permissions). The owner runs `npx vercel` after merging this.
- **If the build still fails**, the next suspects are the Root Directory setting on the Vercel project and `output: "standalone"` in `next.config.ts`, which ENG-002 requires for ADR-010 and which Vercel handles differently from a self-hosted bundle. Neither was implicated in this failure; get the build log from the deployment's Inspect URL before changing either.

## ENG-012 — `output: "standalone"` breaks Vercel's build hook

**Status:** **Confirmed against Vercel — the build completes.** Merged as `main` @ `53c0851` · **Branch:** `eng/ENG-012-vercel-build-output`, off `main` @ `617a385` · **Decisions:** ADR-010 unchanged and the reason this is conditional rather than removed

> **Confirmed 2026-09-08.** The deployment at `53c0851` logged `Running onBuildComplete from Vercel`, the full route table and `Build Completed in /vercel/output [20s]`. The `ENOENT` is gone and the diagnosis held. Deployment then failed at Vercel's *upload* step, which is a separate matter recorded in STATUS.md and not a repository defect: `Cannot patch preview comments when immutable static file upload is enabled. Upgrade to next@v16.3.0-canary.32 or newer` — advice that does not apply, since the repository runs Next **16.3.4** and `16.3.0-canary.32` is a prerelease of `16.3.0`. Preview comments and the Vercel Toolbar are account/project features this repository neither sets nor can set.

**Symptom, from the deployment build log.** Install succeeded with all 378 packages, `next build` compiled successfully in 5.1 s, TypeScript finished, static pages generated — then:

```
Running onBuildComplete from Vercel
> Build error occurred
Error: ENOENT: no such file or directory, open
  '/vercel/path0/apps/web/.next/next-server.js.nft.json'
```

**Cause.** `onBuildComplete` is Vercel's own hook, not Next's, and it reads `.next/next-server.js.nft.json`. Vercel applies its `modifyConfig` to the project first (the log says so), and with `output: "standalone"` the trace file is not where the hook looks. Everything before it passes, so the failure arrives after a successful build and reads as a code error. It is not one: the same commit builds and runs locally, in CI and in the container.

**Fix.** `apps/web/next.config.ts` sets `output` from `process.env.VERCEL`: `standalone` everywhere Echo is self-hosted, absent on Vercel, which does its own output tracing. `vercel.json` also drops `outputDirectory`; the Next.js builder locates its own output and naming one competed with it. ADR-010 is untouched — the container path still gets exactly what it needs, which is why this is conditional rather than a removal.

**Guarded, because this class of bug is invisible locally.** `apps/web/tests/next-config.test.ts` asserts standalone off Vercel, absent on it, and the tracing root in both. Verified the guard fails without the fix: reverting `output` to an unconditional `"standalone"` fails *"Vercel builds do not, because its build hook cannot find the trace file"*, 71 of 72 passing. Unit count 69 → **72**.

### Handoff

- **What changed:** `apps/web/next.config.ts`, `vercel.json` (`outputDirectory` removed), `apps/web/tests/next-config.test.ts` (new), `README.md`, `ARCHITECTURE.md`, `TASKS.md` (including a correction to ENG-011), `STATUS.md`.
- **Verified locally, both paths:** `VERCEL=1 CI=1 npm run build` exits **0**, emits `apps/web/.next/next-server.js.nft.json` and **no** `standalone` directory — the shape Vercel's hook expects. A normal `npm run check` exits **0** with **72 unit, 7 production HTTP, 4 self-host parity**, and `.next/standalone` is still produced, so ADR-010's container path is intact. Controller **0**, 16 tests.
- **Not verified:** that Vercel now builds. Only a deployment shows that, and the CLI cannot run from an agent sandbox.
- **If it still fails**, the next suspect is the project's **Root Directory** setting, which lives in Vercel's dashboard rather than in Git and so is invisible from here. Get the build log again before changing anything; two diagnoses in this task have already been made without one, and one of them was wrong.

## ENG-013 — Name Vercel Deployment Protection instead of failing with `302 !== 401`

**Status:** Done; **verified against the live deployment** · **Branch:** `eng/ENG-013-deployment-protection`, off `main` @ `53c0851` · **Decisions:** none changed

**What the first real run of `npm run test:deployed` found.** The deployed origin answered **302**, not 401, and redirected anonymous requests to `https://vercel.com/sso-api`. **Vercel Deployment Protection is enabled, so Echo's own access gate is never reached.** Access to the deployment is controlled by the owner's Vercel account rather than by `ECHO_OWNER_USERNAME` / `ECHO_OWNER_PASSWORD`, and every later assertion in the script would have been testing Vercel's login page rather than Echo.

**This is the check doing its job.** It is the same class of finding ENG-010 was built for — the platform answering in front of the application, invisible to every suite that runs on loopback — and it is the second one this script has caught before a human did.

**Change.** `scripts/deployed-smoke.mjs` now detects a 3xx to Vercel's SSO (by `location` or the `_vercel_sso` cookie) before asserting, and exits 1 naming the cause, the consequence and the fix. A bare `302 !== 401` sends the reader to `proxy.ts`, which is not where the problem is.

**Owner action, not a code change:** Vercel dashboard → Project → Settings → **Deployment Protection** → turn **Vercel Authentication** off, then re-run the check. Echo gates every path itself with no exclusions; that gate is what the deployment is supposed to be protected by, and it cannot be verified while Vercel's own login sits in front of it.

### Handoff

- **What changed:** `scripts/deployed-smoke.mjs`, `TASKS.md`, `STATUS.md`. No application source.
- **Verified against the real origin** at `https://echo-73alocfwt-…vercel.app`: the new branch fires and prints the diagnosis instead of an assertion trace. Locally `npm run check` exit 0 — 72 unit, 7 production HTTP, 4 self-host parity.
- **Resolved 2026-09-08.** The owner turned Vercel Authentication off and the deployed check completed a **full pass** — see DOC-004 and the `STATUS.md` snapshot. The CDN static-asset question ENG-010 exists to answer is now answered: the edge does not serve `/_next/static` in front of the gate.
- **A consequence worth stating plainly:** with Deployment Protection off, **Echo's own fail-closed Basic gate is the only thing in front of the deployed origin.** That is the intended design under ADR-008, and the passing run is the evidence it holds on the platform — but it means the gate is now load-bearing in production, not merely a second layer behind Vercel's login. Weakening `proxy.ts` or adding a path exclusion is now a production access change.
- **This branch's diagnostic can no longer fire against the live origin,** because the condition it detects has been removed. It stays as a regression guard: if Deployment Protection is ever re-enabled, the script says so in one sentence instead of a `302 !== 401` assertion trace. It is recorded as the seventh negative control in `STATUS.md`, and it is the only one observed live rather than simulated.

## DOC-004 — Record the first full pass of the deployed check

**Status:** Done · **Branch:** `docs/DOC-004-deployed-check-passes`, off `eng/ENG-013-deployment-protection` @ `4fe9f03` (which is `main` @ `26006fb` plus DOC-003 and ENG-013) · **Decisions:** none changed

**Why it is stacked, not branched from `main`.** The run it records is the run that made ENG-013's new diagnostic stop firing, and it edits the same `STATUS.md` paragraphs ENG-013 wrote. Branching from `main` would have produced a guaranteed conflict and split one story across two reviews. Declared here per `AGENTS.md`.

**What happened.** The owner turned Vercel Authentication off in Settings → Deployment Protection and ran `npm run test:deployed` against the hosted origin. It exited **0** — the first time the check has completed a full pass against a real deployment in the project's history. Every assertion in `scripts/deployed-smoke.mjs` ran against a real CDN and a real certificate rather than loopback.

**Why this specific result matters more than "the tests pass".** ENG-010 was built around one risk that no local suite can see: a hosting platform serving `/_next/static` from an edge that answers *before* the application does, leaving every compiled asset public on the deployed origin while `npm run check` stays green. **All 9 linked assets were refused unauthenticated and served only to the owner.** Vercel's edge respects `apps/web/src/proxy.ts`. The risk was real, the check was built to detect it, the check ran, and the answer is negative — which is the only way that question could ever have been closed honestly.

### Handoff

- **What changed:** `STATUS.md` and `TASKS.md` only. No application source, no script, no configuration.
- **Verified on this branch, 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6:** `npm ci` exit 0. `npm run check` exit 0 in a checkout named `echo` — **72 unit, 72 pass**; production build; **7 production HTTP, 7 pass**; **4 self-host parity, 4 pass**. `python3 -m unittest discover -s tests` exit 0 — **16 tests, OK**. The verification floor holds: 72 / 7 / 4 / 16, nothing removed, nothing weakened.
- **One test is coupled to the checkout's directory name, and it is worth fixing under ENG-012, not here.** `apps/web/tests/next-config.test.ts` asserts `config.outputFileTracingRoot?.endsWith("echo")`. In a git worktree the repository root is `.claude/worktrees/<branch>`, so that assertion fails on the folder name while `next.config.ts` behaves correctly — it derives the root from `import.meta.url`, which is right in both locations. Confirmed both ways at the same commit: 72/72 in `~/Documents/GitHub/echo`, 71/72 in a worktree. **This is not a regression and not a code defect**, but it does mean `npm run check` cannot pass in any worktree, which matters now that parallel branches are the normal way of working here. The fix is one line — compare against the resolved repository root instead of a hard-coded name — and it belongs to ENG-012, whose test it is. Not done here: one task per branch.
- **Not verified here:** the deployed run itself was the owner's, not this session's — an agent sandbox cannot reach the platform. It is recorded as the owner's run and marked as such in the snapshot. The URL is deployment-specific rather than a project alias; a future alias should be re-checked rather than assumed.
- **Next:** open mobile capture acceptance as its own task (ADR-013's precondition is now met), finish WEB-004's four native browser checks, and decide the proposed `status/in-flight/<TASK-ID>.md` split, which needs an ADR.

## DOC-005 — The living documents still said nothing was deployed

**Status:** Done · **Branch:** `docs/DOC-005-deployed-doc-drift`, off `main` @ `b44ec5b` · **Decisions:** none changed

**What was wrong.** `ARCHITECTURE.md` and `README.md` asserted in seven places that Vercel was **not yet provisioned**, that `scripts/deployed-smoke.mjs` had **never been run against a deployment**, and that **"Nothing is deployed today: no Vercel project, environment variables, or preview deployments are configured."** ENG-010, ENG-013 and DOC-004 had disproved all of it: the project exists, the owner set all ten environment variables for Production and Preview, and the deployed check passed on 2026-09-08.

**Why this was worth a task rather than a passing edit.** `STATUS.md` states that where it disagrees with `ARCHITECTURE.md`, **`ARCHITECTURE.md` wins and `STATUS.md` is stale**. The authoritative document was therefore telling every future session that no Vercel project existed, and a session correctly following that routing rule could have tried to provision one that was already live — a real action against the owner's account, not merely a confusing sentence. This is the same failure mode ADR-015 was written about, in a different file: documentation that nobody was obliged to move forward when the facts moved.

**What the corrections say.** They record what DOC-004 actually established, and they carry its two limits forward rather than replacing one overclaim with another: the URL tested was deployment-specific rather than a project alias, so an alias must be re-checked rather than assumed; and with Vercel Deployment Protection off, **Echo's own fail-closed gate is the only thing in front of the origin**, which makes `apps/web/src/proxy.ts` load-bearing in production. Deploying remains an explicit owner-run command, never a push (ADR-014).

**The container claim was left alone, because it is true.** The self-hosted image is built and smoke-checked in CI and has never been deployed anywhere — no registry, no host, no TLS. That row now says so precisely, instead of sharing a "not yet provisioned" label with a Vercel target that no longer needs one.

### Handoff

- **What changed:** `ARCHITECTURE.md` (three Hosting and Deployment rows, and the sentence at the end of the ADR-010 paragraph) and `README.md` (the stack-table Hosting row, the Deployment section intro, and the bolded "Nothing is deployed today"). **No application source, no script, no configuration, no decision.**
- **Deliberately not touched, and this is the point of the task rather than an omission.** `DECISIONS.md` ADR-008 and ADR-013 both contain "not yet provisioned". **ADRs are dated records of what was decided and what was true then, not living status.** ADR-008's consequence was accurate when written; this repository amends or supersedes ADRs rather than rewriting them, and rewriting them here would destroy the audit trail the format exists for. `TASKS.md`'s ENG-002 *Limitations and blockers* was also left: it is a dated handoff, and it is not even wrong — it describes the **container** path, which still has no registry, no host and no TLS.
- **How the scope was found:** a repository-wide search for `not yet provisioned`, `nothing is deployed` and `never yet run against a deployment`. Nine hits: seven corrected, two left for the reasons above. The same search after the change returns only those two.
- **Verified, 2026-09-08, Node 22.23.2 / npm 10.9.8**, in the worktree `.claude/worktrees/doc-004-deployed-check-passes`: `check:tracked` 0 · `status:check` 0 (30 tasks) · lint 0 · typecheck 0 · **72 unit, 71 pass, 1 fail** · build 0 · **7 production HTTP, 7 pass** · **4 self-host parity, 4 pass**. Documentation-only, so the counts are **unchanged rather than higher**, which is the correct outcome here. The single unit failure is the known worktree artefact asserting the checkout is named `echo`, identical before and after.
- **This branch does not contain WEB-005.** It is cut from `main` @ `b44ec5b`, so its floor is the pre-WEB-005 one (72 / 7 / 4 / 16). WEB-005 raises that floor to 91 / 8 / 4 / 16 on its own branch; whichever merges second inherits the other's counts and neither weakens anything.
- **Next:** nothing follows from this task. It closes a gap rather than opening one.

## ENG-014 — Stop STATUS.md from causing merge conflicts

**Status:** Done · **Branch:** `eng/ENG-014-status-per-task-files`, branched off `docs/DOC-004-deployed-check-passes` @ `96a1b2a` and since merged with `main` @ `5402d30`, which now contains that work · **Decisions:** ADR-015 accepted

**Acceptance:** Two parallel task branches can each follow the update protocol in full without touching the same lines of any file. `STATUS.md` stops carrying per-task content, and the task table can no longer drift from `TASKS.md` without a check failing.

**The problem, measured.** `STATUS.md`'s update protocol required **every** task to write the same three regions: the *In flight* section, one row of a shared fifteen-row table, and the verification snapshot. Git conflicts when branches touch the same region, so the protocol did not merely permit collisions — it mandated them. **29 of the 61 commits on `main` touched `STATUS.md`** (48%), and the two volatile sections were **92 of its 192 lines** (also 48%). Half the file was the half everyone had to rewrite.

**The cost was mostly invisible**, because the usual escape was stacking branches rather than resolving conflicts: DOC-003 under ENG-013 under DOC-004 under this task, four deep. `AGENTS.md` warns against stacking for unrelated and better reasons — a stacked branch inherits its base's review burden and cannot be reverted alone. One rule in the repository was pushing directly against another.

**A second failure came from the same shape.** Because *In flight* was shared and easy to append to, finished work accumulated there instead of moving somewhere durable. It reached 51 lines and simultaneously contained "provisioning started, nothing deployed yet" and, three paragraphs later, "ECHO IS DEPLOYED". Removing it surfaced a second stale claim that had been sitting in the task table: a row asserting ADR-009 and ADR-010 were "Accepted, **not on `main`**" when both have been on `main` for some time.

**Scope delivered**

- `status/in-flight/<TASK-ID>.md`, one file per active task, with a `README.md` stating the convention and — more importantly — what must **not** go in these files, since they are deleted on merge.
- `scripts/status-table.mjs` and `npm run status:table` / `npm run status:check`. The table in `STATUS.md` is generated from the `**Status:**` lines already in `TASKS.md` and lives between two HTML comment markers. `npm run check` now runs `status:check` second, right after `check:tracked`.
- `STATUS.md` restructured: *In flight* becomes a pointer, the per-run verification snapshot becomes a **verification floor**, and the durable content that was buried in *In flight* moves into *What exists today* and a new *Standing facts and hard-won lessons* section. **Nothing was dropped except claims that were false.**
- **ADR-015** in `DECISIONS.md`, and the update protocol rewritten in `STATUS.md`, `AGENTS.md` and `CLAUDE.md` to match.

**What deliberately did not change.** None of the version-control discipline in `AGENTS.md` is relaxed. `STATUS.md` is still the first and only file every session must read. The protocol still applies in full — record before starting, keep it current, a task is not done until its `TASKS.md` handoff says so — and the counts are still a floor. This task changed *where* status is written, not *whether* it is.

### Handoff

- **What changed:** `STATUS.md`, `TASKS.md`, `AGENTS.md`, `CLAUDE.md`, `DECISIONS.md` (ADR-015), `package.json`, `scripts/status-table.mjs` (new), `status/in-flight/README.md` (new), `status/in-flight/ENG-014.md` (new), `status/in-flight/WEB-004.md` (new). **No application source is touched.**
- **Verified, 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6**, on `eng/ENG-014-status-per-task-files` @ `3858bd9`. `check:tracked` 0 · **`status:check` 0 (29 tasks)** · lint 0 · typecheck 0 · **72 unit, 71 pass, 1 fail** · production build 0 · **7 production HTTP, 7 pass** · **4 self-host parity, 4 pass** · **16 controller tests, OK**.
- **The single unit failure is the known worktree one and nothing else.** It is `output file tracing still points at the repository root in both cases`, which asserts the checkout is named `echo`; this branch was verified inside `.claude/worktrees/doc-004-deployed-check-passes`. Because `npm run check` halts on it, the four steps after it were run individually and all passed — that is where the build, HTTP, parity and controller numbers above come from. **This branch changes nothing under `apps/`** — `git diff --stat 96a1b2a HEAD -- apps/` is empty — so the unit suite is byte-identical to DOC-004's, which ran **72 pass, 0 fail** in a checkout named `echo`. **The 72/7/4/16 floor holds.**
- **The new check was made to fail on purpose, two ways**, because a check that has only ever passed proves nothing. Editing a generated row by hand: **exit 1**, naming `TASKS.md` as the source of truth and `npm run status:table` as the fix. Removing a marker from `STATUS.md`: **exit 2**, naming the missing marker. Restored, and `status:check` returns to exit 0 on 28 tasks.
- **The base was not `main` when this branch started, and that is declared.** At the time, `main` lacked DOC-004 and ENG-013 (pull requests #20 and #19), and restructuring `STATUS.md` from `main` would have conflicted with both across most of the file — the exact problem this task removes, and a fourth instance of it. **Both have since been merged**, so `main` @ `5402d30` now contains them; this branch was merged with that `main` and the merge was clean, because the content was already in its history. **No stacking remains: this pull request stands alone against `main`.**
- **Transitional, and worth knowing:** branches that were already in flight when ADR-015 landed have no `status/in-flight/` file. `test/WEB-004-browser-acceptance` was migrated here by hand so its content was not lost with the old section. **WEB-005 on `feat/WEB-005-incremental-upload` has not been**, deliberately — another contributor owns it, and writing their in-flight file would both guess at their state and break the rule that a task's file is its own. They should add it.
- **Not verified:** nothing about the running application changed, so no application behaviour was re-checked beyond the full suite. The generator parses the `**Status:**` line format that all 28 current entries share; an entry written in a different shape would silently fall back to `Todo`, which `status:check` would then show as a mismatch rather than a wrong row.
- **Next:** the one-line ENG-012 fix so `npm run check` passes inside a worktree; opening mobile capture acceptance as its own task; WEB-004's four browser checks.


## ENG-015 — Scope the container job to where its result can change

**Status:** Implemented; awaiting owner review · **Branch:** `eng/ENG-015-container-job-scope` · **Dependencies:** ENG-002, ENG-007

**Acceptance:** The self-hosted container image is still verified before anything merges, and is no longer rebuilt on work-in-progress pushes whose result it cannot change.

### Handoff (2026-09-08)

- **Branch/base:** `eng/ENG-015-container-job-scope`, from `main` @ `1559da2`.
- **Why.** `.github/workflows/pull-request.yml` triggers `on: push` with no branch filter, so every push to every branch ran both `verify` and a full `docker build` plus image inspection and container smoke check. Echo's builder/checker protocol freezes acceptance tests *before* the builder starts, so a task branch is deliberately red from the freeze commit until implementation lands — five pushes on WEB-006 — each paying for a container build whose result could not change until the code existed.
- **Change.** The container job moves to its own `.github/workflows/selfhost-container.yml`, triggered on `main`, on `pull_request` (`opened`, `synchronize`, `reopened`, `ready_for_review`) guarded by `if: github.event_name != 'pull_request' || github.event.pull_request.draft == false`, and on `workflow_dispatch`. `verify` is untouched and still runs `npm run check` on every push to every branch.
- **This does not weaken the gate.** A draft cannot be merged, and marking a pull request ready for review runs the job before the merge button means anything. Docker is unavailable on the development machine, so this job remains the only place the image is ever built — which is the argument for spending it where it counts.
- **Verified before commit:** both files parse as YAML, and the `verify` and `selfhost-container` job bodies were compared against `origin/main` after parsing and are identical — same runner, timeout, env and all nine container steps. Only the trigger, the `if` guard and the concurrency group differ.
- **Not claimed.** This changes no notification volume for a genuinely failing branch: `verify` and `selfhost-container` are independent jobs, so a red `verify` reports once per push either way, which is correct. What it removes is roughly fifteen minutes of CI compute per work-in-progress commit.

**Next:** owner reviews. The workflows themselves can only be exercised by GitHub, so this branch's own first push is their first real run — confirm that `verify` ran and `Self-hosted container` did **not**, since its pull request opens as a draft.

## ENG-016 — Auto-merge on green

**Status:** Specified; owner must apply the workflow and settings · **Branch:** `eng/ENG-016-auto-merge-on-green` · **Dependencies:** ENG-007, ENG-015

**Acceptance:** A branch whose required checks all pass merges into `main` without anyone pressing a button, and a branch whose checks fail never merges. What is checked does not change.

### Handoff (2026-09-08)

- **Branch/base:** `eng/ENG-016-auto-merge-on-green`, from `main` @ `f68ccca`.
- **Why.** The owner is the merge button. Review latency, not check latency, is what holds finished work on a branch, and `main` has already fallen fourteen commits behind that way once. Auto-merge does not skip a check; it presses the button the moment every required check is green.
- **Agents cannot apply this.** `.github/workflows/` is gated behind a scope agents here do not hold (`AGENTS.md` § *Version control discipline*), so the exact YAML is written out below for the owner, as that rule prescribes.

#### The prerequisite that is easy to miss

**Auto-merge is not an independent switch. It requires branch protection on `main` with at least one required status check.** GitHub refuses to enable auto-merge on a pull request that has nothing to wait for, because such a pull request is already mergeable. If *Allow auto-merge* is turned on and nothing happens, this is the reason.

#### Settings, in order

1. **Settings → General → Pull Requests:** enable **Allow auto-merge**. Enable **Allow squash merging**. Optionally enable **Automatically delete head branches**.
2. **Settings → Rules → Rulesets** (or **Branches → Branch protection**) on `main`: require a pull request before merging, and under **Require status checks to pass**, add **`verify`**. Leave required approvals at 0 for the zero-touch path; set it to 1 to keep a human gate on everything.
3. **Settings → Actions → General → Workflow permissions:** **Read and write permissions**, and **Allow GitHub Actions to create and approve pull requests** stays checked — `open-pull-request.yml` already depends on it.

**Require `verify` and not `selfhost-container`.** `verify` triggers on `push`, so it fires on every branch regardless of who opened the pull request. `selfhost-container` triggers on `pull_request`, which is unreliable here (see the finding below), and a required check that never reports leaves every pull request blocked as pending forever.

#### Scope: which branches merge themselves

`eng/**` and `docs/**` merge themselves on green. They change tooling and prose. A `feat/**` branch changes what the owner sees in the app, and several of them are gated on browser acceptance that no check can perform, so it stays a deliberate act — one click on **Enable auto-merge** in the pull request, after which GitHub does the rest.

#### Replacement `.github/workflows/open-pull-request.yml`

Only `permissions` and the final step change.

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
  # ENG-016. `contents` rises from read to write because enabling auto-merge
  # ends in a merge commit on `main`. `pull-requests: write` alone can open a
  # pull request but cannot land one.
  contents: write
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

      # ENG-016. Auto-merge skips no check. It presses the merge button the
      # moment every required check is green, and never presses it otherwise.
      # Scoped to eng/ and docs/ because those change tooling and prose; a
      # feat/ branch changes what the owner sees and stays a deliberate click.
      - name: Let eng/ and docs/ branches merge themselves once green
        if: startsWith(github.ref_name, 'eng/') || startsWith(github.ref_name, 'docs/')
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BRANCH: ${{ github.ref_name }}
        run: |
          state=$(gh pr view "$BRANCH" --json isDraft,autoMergeRequest \
            --jq '(.isDraft|tostring) + " " + ((.autoMergeRequest != null)|tostring)')
          draft=${state% *}
          armed=${state#* }

          if [ "$draft" = "true" ]; then
            echo "$BRANCH is a draft. Auto-merge is deliberately not enabled on drafts."
            exit 0
          fi
          if [ "$armed" = "true" ]; then
            echo "Auto-merge is already enabled for $BRANCH."
            exit 0
          fi

          if ! gh pr merge "$BRANCH" --auto --squash; then
            echo "::error::Could not enable auto-merge for $BRANCH."
            echo "Check Settings > General > Pull Requests > 'Allow auto-merge',"
            echo "and that main's ruleset requires at least one status check."
            echo "GitHub refuses auto-merge on a pull request with nothing to wait for."
            exit 1
          fi
```

The last step **fails loudly** rather than continuing quietly, which is the fail-closed rule applied to CI: a misconfigured setting should be visible on the first push, not discovered later as work that silently never merged.

#### A finding that belongs to ENG-015, and an optional patch

**A pull request opened with `secrets.GITHUB_TOKEN` does not raise `pull_request` events.** GitHub suppresses them to prevent workflow recursion, and `open-pull-request.yml` opens every pull request with exactly that token. ENG-015 moved `selfhost-container` onto a `pull_request` trigger, so that job likely never fires on an auto-opened pull request — whether or not it is a draft. ENG-015's handoff attributes the absence to draft status, which may not be the whole cause. This is the same constraint that made `pull-request.yml` trigger on `push` in the first place.

**Confirm before patching:** open the Actions tab and check whether `Self-hosted container` ever ran for pull request 26 from a `pull_request` event. If it did not, replace that workflow's `on:` block, which restores push coverage while keeping ENG-015's saving, because the image can only change when one of these paths does:

```yaml
on:
  push:
    paths:
      - 'Dockerfile'
      - '.dockerignore'
      - '.nvmrc'
      - 'package.json'
      - 'package-lock.json'
      - 'apps/web/next.config.ts'
      - 'scripts/**'
      - '.github/workflows/selfhost-container.yml'
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
```

Keep the existing `if:` guard on the job. A path-filtered workflow that does not run reports nothing, which is a second reason not to make `selfhost-container` a required check.

#### A consequence to watch on the first auto-merge

A push made with `GITHUB_TOKEN` does not trigger workflows, so the merge commit auto-merge creates on `main` may not run `verify` again. The merged tree was verified on the branch, so this is a lost confirmation rather than a lost gate. If it matters, add **Require branches to be up to date before merging** to the ruleset, which forces the branch to be rebased onto current `main` before the tested state can merge.

**Next:** owner applies the settings and the workflow, then pushes any `eng/` or `docs/` branch and confirms it merges itself once `verify` goes green. Nothing here has executed; a workflow can only be exercised by GitHub.

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

### Native browser acceptance attempt (2026-09-08)

- **Branch/base:** `test/WEB-004-browser-acceptance`, from remote `main` @ `6cee6fd`; separate worktree `/private/tmp/echo-web004-browser` to avoid the parallel ENG-010 checkout. This documentation handoff is the only change. PR #9 is already merged; application code was not reopened or modified.
- **Browser evidence:** Safari **26.4 (21624.1.16.11.4)** observed in About Safari. Navigation to `http://127.0.0.1:3000/diagnostics/queue` showed “Safari Can’t Connect to the Server”. Chrome bundle selection was ambiguous, a mounted-app selection failed, and the running translocated app could be selected; navigation actions were then refused twice because the user changed the app state. Chrome version not obtained. No native PASS lines, recovery count, checksum result, or capture result observed. The earlier `elementHasNoFrame` / `noWindowsAvailable` errors did not recur. Automation/navigation problems are **not application test failures**.
- **Server:** `npm run dev` initially announced Ready, then emitted repeated `EMFILE` watcher errors and development-directory restarts. Stopped by the agent (exit 0); no stable diagnostic response established. The first check ran concurrently with dev; subsequent checks ran after stopping dev and reproduced the same type error. No source defect proven. Environment files were excluded from the worktree under the session’s denied-read policy. Owner configuration and browser authentication with fixture providers were requested without requesting credentials in chat. No credentials or real audio were read, printed, or recorded.
- **Required commands, worktree repository root:** `npm ci` **exit 0**, 373 packages, zero vulnerabilities, EPERM cleanup warnings. `npm run check` **exit 1**: source tracking and lint passed; generated `.next/types/validator.ts` failed TS2344 (`Route` does not satisfy `never`); unit tests/build/production HTTP/self-host parity **not run**. Standalone and escalated retries also exit 1. `python3 -m unittest discover -s tests` **exit 1**, RecursionError during cleanup/error reporting, **no final count**; escalated retry also exit 1. Runtime: Node 22.23.2, npm 10.9.8, Python 3.9.6. No fallback runner was substituted. Floors remain 69 unit / 7 HTTP / 4 parity / 16 controller, with no new passing count claimed.
- **Still unverified:** all native storage PASS lines; three pending chunks with verified checksums after reload; commit before stop and recovery of all completed Blobs; real recorder disconnect/stop/reload/reconnect, one local processing result, retained raw audio/results, uninterrupted playback across five-second refreshes, and two-tab behavior. Existing manual quota/private-mode checks remain outstanding; mobile stays deferred under ADR-013.
- **Next:** restore stable local dev and browser automation, configure/authenticate without exposing credentials, then rerun the requested acceptance and required commands. Integrated `main` @ `f5f3521` (ENG-010, PR #11) and preserved its deployment facts alongside this attempt in STATUS.md. This attempt is partial evidence and **does not close WEB-004**.

## WEB-005 — Incremental upload and transcription

**Status:** Implemented and verified by test; the hook wiring that drains during capture is code-verified but untested and needs browser acceptance — NOT Done · **Dependencies:** WEB-003, WEB-004

**Acceptance:** Upload/transcribe during recording with durable status, bounded retry/backoff and idempotent jobs; demonstrate reordered uploads and provider failures recover without duplicated work.

### Handoff (2026-09-08)

- **Branch/base:** `feat/WEB-005-incremental-upload`, from `main` @ `b44ec5b` (the merge of ENG-014, PR #21). The branch already existed as an empty placeholder pointing at `main` with no commits of its own; ENG-014's handoff had noted that whoever owned it should add its `status/in-flight/` file, which this task did before starting work.
- **Decision first:** **ADR-016** was written and committed before any code, as ADR-012 was for WEB-004. It records both halves of REQ-003 — draining during capture, and a job ledger keyed by chunk identity — and is emphatic about what the ledger does **not** promise.
- **Implemented.** Client: `sync()` no longer refuses while capture is active and `persist()` fires a drain after each durable commit without awaiting it, so the microphone never waits on the network; `drainQueue` continues past a failed entry instead of stopping the queue behind it; retry is bounded at 8 attempts before `blocked` with a readable reason; `uploading` is a **persisted** state, and recovery on load returns a stale `uploading` row to `pending` while never touching a `processed` one. Server: `POST /api/recordings` consults a `JobLedger` keyed `sessionId/id/checksum`, replaying a stored result or joining an in-flight job rather than paying for a second provider call, marked in both a `replayed` body field and an `x-echo-replayed` header.
- **The ledger is deliberately in-process and best-effort, and the code says so.** A cold start, a redeploy, a second instance or a TTL expiry all lose it, and the retry then costs a provider call exactly as before. Nothing in the code, comments, UI or tests claims exactly-once; the only two matches for that phrase in the tree are explicit denials. Exactly-once needs a ledger that outlives the process — the relational-database decision, which stays **Open**.
- **Builder/checker, run manually.** The Codex-backed controller in `AGENT_WORKFLOW.md` was not used: it needs Codex credentials and `agent-loop.json` is still `"ready": false`. Acceptance criteria were written before the builder saw the task, and an independent read-only checker reviewed the result. This is the same manual discipline WEB-004 used, and it carries none of the executable loop's guarantees.
- **The checker found no behavioural defect** and returned `goal_met: false` on coverage alone. Two of its findings were repaired rather than documented:
  1. Updating one existing assertion from `pending` to `uploading` (required by ADR-016) had quietly left *"what is on disk after a failed result-write is still retryable"* pinned by nothing. New test `a row left uploading is re-attempted by the next drain, not stranded` restores it, and names the plausible future hardening that would break it.
  2. A **pre-existing** production test posted the same chunk twice to prove MIME normalization; once both posts shared a ledger key, its second assertion came from the replay branch instead of a real transcription. The second post now carries a distinct id, plus a new `x-echo-replayed: "false"` assertion so it cannot silently regress.
- **`IndexedDBQueue.recover()` and `.update()` execute in no automated test** — only the pure functions they delegate to. The browser harness at `/diagnostics/queue` gained a scenario for `recover()` and the `uploading` state so the real implementation is at least exercised when WEB-004's pending browser acceptance is run.

**Verified, 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6**, in the worktree `.claude/worktrees/doc-004-deployed-check-passes`. Every command below was re-run by the coordinator, not taken from the builder's report.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm run check:tracked` | 0 | no source file is hidden from version control |
| `npm run status:check` | 0 | table matches `TASKS.md` |
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 1 | **91 tests, 90 pass, 1 fail** — up from 72. The single failure is the known worktree artefact `output file tracing still points at the repository root in both cases`, unchanged from the baseline taken before this work started |
| `npm run build` | 0 | compiled |
| `npm run test:production` | 0 | **8 tests, 8 pass** — up from 7 |
| `npm run test:selfhost` | 0 | **4 pass** — floor held |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** — floor held |
| `npm run test:deployed` | not run | owner-only; needs a live URL and real credentials |

**Not verified, and this is why the task is not Done.** Acceptance items A1–A3 — that the queue actually drains during capture, that `persist()` triggers it, and that capture never waits on it — **have no automated test.** They live in `useAudioQueue`, which needs a DOM, `navigator.locks` and IndexedDB, and this repository has no browser test runner; adding one would mean a new dependency. The pieces underneath them are tested and the wiring was read and traced by an independent checker, but read is not run. The same applies to the `navigator.locks` fail-closed branch and to `IndexedDBQueue`'s own methods.

**Next:** owner reviews; the browser acceptance for this task should be run together with WEB-004's four outstanding checks at `/diagnostics/queue`, since both need the same session in a real Chrome and Safari.

## WEB-006 — Transcript stitching

**Status:** Implemented and verified by test; the IndexedDB v1→v2 migration and completion recovery have no executed evidence and need browser acceptance — NOT Done · **Branch:** `feat/WEB-006-transcript-stitching` · **Dependencies:** WEB-005

**Acceptance:** Align session timestamps and overlap text, retain provenance, flag missing chunks, and finalize only complete sessions. Test repeated speech, overlap, gaps and out-of-order results.

**Implementation boundary:** ADR-017 records conservative segment alignment and explicit browser-local capture completion evidence before implementation. WEB-005 is merged, while its browser acceptance and WEB-004's native acceptance remain outstanding; this task does not certify those earlier tasks.

### Handoff (2026-09-08)

- **Branch/base/PR:** `feat/WEB-006-transcript-stitching`, from `main` @ `1559da2` (PRs #22 and #23 merged); [PR #24](https://github.com/Meerlikeskeer/echo/pull/24). Do not merge automatically.
- **Decision first:** **ADR-017** was written and committed before any code, as ADR-012 was for WEB-004 and ADR-016 for WEB-005.
- **Acceptance was frozen before implementation** at `b0f11b6` — `status/acceptance/WEB-006.md` plus three test files, 23 tests, reviewed independently of the builder. The diff of `apps/web/tests/` between the freeze point and the final commit is **empty**: no frozen test was edited to manufacture green, and the frozen contract is unmodified.
- **Implemented.** A pure domain module `stitchSession` orders chunk transcripts by sequence and session time, deduplicates only whole segments lying wholly inside the measured adjacent-chunk overlap with agreeing timing, preserves ambiguous or unmatched speech, retains every original source including both sides of a collapsed duplicate, and fails closed to `invalid-input` rather than discarding a session. A `sessions` object store added by an IndexedDB **v1 to v2 migration** holds capture-completion manifests; `persistSessionCompletion` is the seam, and finalisation requires a manifest **and** no gaps.
- **A session is final only when capture is known to have stopped successfully.** A contiguous prefix of saved chunks never implies it, and legacy rows recorded before the store existed stay partial forever. This is the distinction ADR-017 exists to make.

**A session recorded before this change can never become final.** That is correct, not a defect: a manifest records that capture finished, and no such evidence exists for those sessions.

### Interrupted session, and what it cost

The task was started by a Codex session that hit a usage limit mid-builder, leaving roughly 300 lines of implementation **uncommitted** in `/private/tmp`. It was recovered and committed verbatim as `97ce2b9` before modification. **The generalisable lesson is in `STATUS.md`** under *Standing facts*; the specific loss here was that the recovered code carried three typecheck errors, so CI failed at the `typecheck` stage — before tests ran — on every push until attempt 2 fixed it.

### Independent checker

A fresh read-only checker reviewed the implementation against the frozen contract, tracing the v1 baseline of `queue.ts` from a second checkout to verify the migration properly. **It found no correctness defect** in the domain module, the migration, the seam or the recorder wiring, and confirmed by tracing that a save failure cannot publish a manifest as durable (three independent reasons), that a failed or still-recording capture cannot produce one, and that WEB-005's drain-during-capture, bounded retry, persisted `uploading` state and job ledger are all intact.

It returned `goal_met: false` on **evidence**, and its findings were repaired rather than documented:

1. **The footnote was inaccurate** — it stated a sufficient condition that is not sufficient, and was wrong in exactly the recovered-session case ADR-017 exists for. Fixed in `bfebece`.
2. `session-transcript.tsx` called `useId` with no `"use client"` of its own, working only because its single importer had one.
3. A rejected `listCompletions()` would have left Record disabled and hidden already-saved audio, making a **WEB-004 promise contingent on WEB-006 code**.
4. Two `tx.objectStore(...)` calls outside their try left the connection unclosed on `NotFoundError`.
5. `onblocked`'s "Close other Echo tabs" instruction was replaced by a generic message before reaching the user — swallowed precisely when the upgrade this task introduces makes it necessary.

**Verified, 2026-09-08, Node 22.23.2 / npm 10.9.8, Python 3.9.6**, in the worktree `.claude/worktrees/doc-004-deployed-check-passes`, at `bfebece`. Every command was re-run by the coordinator, not taken from the builder's report.

| Command | Exit | Observed result |
| --- | --- | --- |
| `npm run check:tracked` | 0 | no source file hidden from version control |
| `npm run status:check` | 0 | table matches `TASKS.md` |
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 1 | **114 tests, 113 pass, 1 fail** — up from 91. The single failure is the known worktree artefact `output file tracing still points at the repository root in both cases` |
| `npm run build` | 0 | compiled, 5 routes — run because the `"use client"` fix moves a client/server boundary |
| `npm run test:production` | 0 | **8 tests, 8 pass** — floor held |
| `npm run test:selfhost` | 0 | **4 pass** — floor held |
| `python3 -m unittest discover -s tests` | 0 | **16 tests, OK** — floor held |
| `npm run test:deployed` | not run | owner-only; needs a live URL and real credentials |

**Not verified, and this is why the task is not Done.** The **v1 to v2 migration and completion recovery have no executed evidence anywhere.** No test references `IndexedDBQueue`, `saveCompletion` or `listCompletions`, and the `/diagnostics/queue` harness was not extended to cover the new store. As the checker put it: every one of the 23 frozen tests would still pass if the recorder never called `queue.complete()` at all. The wiring was read and traced by an independent checker, but read is not run. Also untested: the duplicate-manifest fail-closed branch, the coarse-bounds rendering, and grouping with more than two sessions.

**Next:** owner runs `status/acceptance/browser-acceptance.md`, whose A4, A5 and B4b cover exactly these gaps, alongside WEB-004's and WEB-005's outstanding browser checks in the same session.

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
