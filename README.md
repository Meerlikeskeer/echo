# Echo

Private-first, web-first AI note-taking: capture conversations and quick thoughts, then turn them into transcripts, titles, summaries, notes, action items, and research suggestions.

**Status:** DOC-001, ENG-001 and WEB-001 are complete and integrated. The repository contains a private empty session shell, its verification tooling, and the bounded builder/checker controller (feature loop deliberately disabled). Recording, providers, persistence, and hardware are not implemented. WEB-002 is next.

## Start here

- **[Status](STATUS.md): current task state, the verification baseline, and a reading map. Read this first — it exists so a session can start work without loading the whole repository.**
- [Project context](PROJECT_CONTEXT.md): scope, priorities, and handoff context.
- [Requirements](REQUIREMENTS.md): product behavior and safety constraints.
- [Architecture](ARCHITECTURE.md): data flow, package boundaries, and provider contracts.
- [Roadmap](ROADMAP.md) and [tasks](TASKS.md): milestones and acceptance criteria.
- [Decisions](DECISIONS.md): accepted choices and unresolved questions.
- [Shared engineering rules](AGENTS.md): instructions for all contributors and agents.
- [Claude Code entry point](CLAUDE.md): points to the same shared rules.
- [Agent workflow](AGENT_WORKFLOW.md): the bounded builder/checker controller and why it stays disabled.

Repository documentation is authoritative over prior chat context. Keep decisions and implementation synchronized through reviewed commits, and keep [STATUS.md](STATUS.md) current in the same commit as any change to task status or verification.

## Technology stack (summary)

Short summary for convenience. **The `Technology Stack` section of [ARCHITECTURE.md](ARCHITECTURE.md) is the canonical source of truth** — read it, not this list, before introducing any new framework, database, hosting platform, UI library, backend framework, storage provider, or authentication system.

| Area | Choice |
| --- | --- |
| Application | Next.js (App Router), React, TypeScript |
| Styling and UI | Tailwind CSS; shadcn/ui as the base component system, Lucide for icons *(both approved, not yet installed)* |
| Backend | Next.js Route Handlers and server-side modules; no separate backend service |
| Hosting | Vercel *(approved, not yet provisioned)* |
| Tooling | npm workspaces, Node 22.23.2, committed `package-lock.json` |
| Testing/CI | ESLint, `tsc`, Node's built-in test runner via `tsx`, `next build`, production HTTP tests, Python `unittest` for the agent controller, GitHub Actions |
| Providers | Transcription and LLM behind small server-side ports using the OpenAI-compatible wire format (ADR-009); adapters `openai-compatible` and `fixture`. Groq is a **temporary** prototype default; the permanent vendor is undecided |

Intentionally undecided: relational database (PostgreSQL is the likely direction, not an approved choice), object/audio storage, the permanent transcription and LLM vendors, diarization, background/worker infrastructure, and production authentication.

Vercel is the hosted target but not Echo's runtime: the application must also run as a container on the Next.js standalone server, so platform-specific primitives require their own ADR (ADR-010).

## Repository structure

```text
apps/web/                 Next.js application (the only implemented app)
  src/app/                App Router pages, layout, session shell
  src/lib/                access policy and the server-only owner guard
  src/proxy.ts            fail-closed request gate over every route
  tests/                  unit/behavior tests (Node test runner via tsx)
scripts/agent_loop.py     ENG-001 bounded builder/checker controller
scripts/production.test.mjs  production HTTP tests against a real build
tests/test_agent_loop.py  controller tests (Python unittest)
agents/, .claude/         builder/checker role definitions and commands
agent-loop.json           controller configuration — "ready": false (disabled)
.github/workflows/        pull-request checks
packages/*                planned, not scaffolded
```

The product direction is a 30–60 second recording → transcript → generated notes, then durable chunking and offline behavior before expanding features. Modular packages for audio, transcription, AI, storage, research, reminders, and shared domain types remain planned paths.

## Configuration and privacy

[.env.example](.env.example) contains blank configuration placeholders only. Use `apps/web/.env.local` for local configuration; never commit actual credentials. Private repository visibility does not replace application access control. Recording content and provider keys must not appear in logs, fixtures, analytics, or browser bundles.

User-supplied keys and provider choice are core requirements. Cloud processing must be explicit; self-hosted deployment is the architectural baseline. Calendar/reminder writes require user confirmation.

## Working on Echo

`main` is the canonical development branch. Read `AGENTS.md`, choose a `WEB-###` task, branch from `main`, and update its status and relevant documentation with the implementation. Run the verification commands below and record evidence; a builder does not certify its own implementation. **WEB-002 — short recording vertical slice — is implemented on `feat/WEB-002-recording-slice`; WEB-003 is the next product task.**

## Local setup and exact commands

Use Node **22.23.2** (`nvm install && nvm use` if nvm is installed) and npm **10.9.8**. From the repository root:

```sh
npm ci
cp .env.example apps/web/.env.local
# Edit apps/web/.env.local: set ECHO_OWNER_USERNAME and a random >=32-character ECHO_OWNER_PASSWORD.
npm run dev
```

Open `http://127.0.0.1:3000` and enter the owner credentials in the browser Basic authentication prompt. Missing/invalid configuration returns HTTP 503, including in development. Wrong/missing credentials return 401. No provider keys are needed for this shell. The app binds to loopback by default. Use a TLS reverse proxy before any access beyond localhost; Basic credentials require encrypted transport. This is a single-owner baseline with no logout/session management or multi-user support. Future data and mutation boundaries must enforce owner access independently.

### Echo does not listen on the network, and that is deliberate

`npm run dev` and `npm start` both bind `127.0.0.1`. Only the machine running Echo can reach it. There is no script that binds any other interface, and adding one needs the stack-change procedure and an ADR, not a convenience commit — see **ADR-013**.

An earlier `dev:lan` script (ENG-008) served HTTPS on every interface so a phone on the same Wi-Fi could open Echo. It was withdrawn on 2026-09-08: putting a development server carrying a live microphone and owner credentials on whatever network the laptop happens to join is not a trade the owner wants to make, and the access gate is not the point — the exposure is. Reaching Echo from another device is a property of a **deployed** origin with a real certificate, not of the development server.

Recording therefore works only on the machine running Echo until deployment exists. Echo checksums every recorded chunk with `crypto.subtle`, which browsers expose only in a secure context — HTTPS, or `localhost`. On any other origin served over plain HTTP it is `undefined` and recording cannot work at all; Echo detects this before opening the microphone and says so, naming the address, rather than failing afterwards as a generic capture error.

Run each check from the repository root:

```sh
npm run lint            # ESLint; warnings fail
npm run typecheck       # Next route type generation, then strict TypeScript
npm test                # synthetic access-policy and empty-state behavior tests
npm run build           # actual Next production compilation
npm run test:production # requires build; starts/stops two loopback production servers
npm run test:selfhost   # requires build; boots the standalone bundle a container would run
npm run check           # every check above, in order, plus the tracked-source guard
npm start               # serve the production build on 127.0.0.1:3000
```

The committed `package-lock.json` pins dependencies; `npm ci` installs it without rewriting resolution. Production tests supply synthetic credentials, exercise absent-config and unauthorized denial on page/API/static/RSC paths, check an old middleware-bypass header, then verify authorized HTML/RSC and emitted JS/CSS. They require permission to bind loopback sockets. No external provider calls or recording fixtures are used. Unit tests use Node's built-in test runner via `tsx`; production tests use it directly and fail on assertions/server startup failure.

GitHub Actions runs `npm ci` and `npm run check` on pull requests and pushes to `main`, with read-only repository permissions and no secrets. A second `selfhost-container` job in `.github/workflows/pull-request.yml` builds the self-hosted image, asserts no environment file is inside it, runs it with a synthetic per-run password, and smoke-checks it with `scripts/container-smoke.mjs`. It is separate from the main gate because it needs a container runtime, which development machines on this project may not have — `npm run check` proves the bundle, CI proves the image. Neither proves a deployed origin; `npm run test:deployed` does that, and it needs a live URL and credentials, so it runs on demand rather than in CI. Branch protection must be configured/observed after pushing; none of this merges or deploys anything.

## Deployment

Echo has two supported deployment shapes. Vercel is the primary target; a container is the portable one. Both are verified as artifacts, and **neither is provisioned** — nothing is deployed. `scripts/deployed-smoke.mjs` verifies whichever one you deploy, over its real origin.

### Vercel (primary target)

Vercel is Echo's intended deployment target (ADR-008). The workflow is:

```text
feature branch → GitHub → Vercel preview deployment
  → manual + automated verification → merge → production deployment
```

**Nothing is deployed today.** No Vercel project or environment variables have been created. `vercel.json` and the runbook below are what ENG-010 added so that provisioning is a short, repeatable procedure rather than a remembered click-path; running it is the owner's step, because it needs the owner's account and the owner's secrets.

`vercel.json` at the repository root defines the build in version control:

```json
{ "framework": "nextjs", "installCommand": "npm ci --include=dev",
  "buildCommand": "npm run build", "outputDirectory": "apps/web/.next",
  "git": { "deploymentEnabled": false } }
```

`--include=dev` is not optional and the first production deployment failed without it. Vercel sets `NODE_ENV=production` for the install step, and npm reads that as `--omit=dev`, so a plain `npm ci` installs 26 packages instead of 373. Everything `next build` needs to compile — `typescript`, `tailwindcss`, `@tailwindcss/postcss`, the `@types/*` packages — is a devDependency, correctly so: they are build-time tools, not runtime dependencies. The build then dies resolving `@tailwindcss/postcss` from `globals.css`, and Vercel reports only `Command "npm run build" exited with 1`. Reproduce it locally with `NODE_ENV=production npm ci && npm run build`; the same commands with `--include=dev` succeed.

Echo is an npm workspace whose application lives in `apps/web` while `package-lock.json` and the hoisted `node_modules` live at the root. Keeping the Vercel **Root Directory at the repository root** — answer `./` when the CLI asks where your code is located — and naming the commands here is what makes the hosted install match `npm ci` locally. The alternative — setting Root Directory to `apps/web` in the dashboard — needs "Include source files outside of the Root Directory" enabled as well, and stores the arrangement somewhere Git cannot see. Use it only as a fallback if the build above fails, and record why.

#### Provisioning runbook

1. **Generate an owner password.** `openssl rand -hex 24` gives 48 characters; the gate refuses anything under 32. Keep it in a password manager. It is never committed and never printed by any script here.
2. **Create the project.** `npx vercel@latest login`, then `npx vercel link` from the repository root. This is interactive and cannot be done by an agent. When it asks **"In which directory is your code located?"** answer `./` — the repository root, for the workspace reason above. Do not run `npx vercel git connect`; see *Deployments are explicit* below.
3. **Set the environment variables, server-side, for every environment you will use** (Production, Preview, Development):
   - `ECHO_OWNER_USERNAME` — any name without a colon.
   - `ECHO_OWNER_PASSWORD` — the value from step 1.
   - `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_BASE_URL`, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL`
   - `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`

   Set them as plain (encrypted, server-side) environment variables. **Never prefix any of them with `NEXT_PUBLIC_`** — that would place the value in the browser bundle. Echo has no `NEXT_PUBLIC_*` variables and `scripts/deployed-smoke.mjs` fails if one appears in the served page.

   Until the provider group is complete Echo still deploys and still gates correctly; it disables recording and names the missing variables, by design.
4. **Deploy a preview first.** `npx vercel` builds a preview URL. Nothing deploys on its own (ADR-014), so this command is the only thing that produces one. Do not deploy to production before step 5 passes against that preview.
5. **Verify the deployed origin.** From the repository root, with the same credentials you configured:

   ```sh
   ECHO_OWNER_USERNAME=... ECHO_OWNER_PASSWORD=... \
     npm run test:deployed -- https://<your-preview>.vercel.app
   ```

   It exits non-zero on the first failure and prints what failed. It reads credentials from the environment, never prints them, and refuses to accept them inside the URL.
6. **Promote to production** — `npx vercel --prod` — and run step 5 again against the production URL. A preview passing does not verify production: they carry different environment variables.

#### Deployments are explicit (ADR-014)

`vercel.json` sets `"git": { "deploymentEnabled": false }`. A push to any branch builds nothing on Vercel, and a connected repository stays connected without spending the plan's build allowance on ordinary version-control activity — several pushes an hour across parallel task branches would otherwise exhaust it, and the deployed origin would disappear for reasons unrelated to the code.

Deploying is therefore always a command you run: `npx vercel` for a preview, `npx vercel --prod` for production. **`main` moving does not change what is live**, so *merged* and *deployed* are separate states — check which commit is deployed before concluding anything from a deployed origin.

CI is unaffected: `.github/workflows/pull-request.yml` still runs `npm run check` and the container job on every push. Verification did not weaken; only the automatic builds went away. Turning this back on is a reversal of ADR-014 and needs its own ADR.

#### What the deployed check proves that the local suites cannot

`npm run check` exercises the application against `next start` on loopback, and `scripts/container-smoke.mjs` exercises the self-hosted image. Neither can see what a hosting platform puts *in front of* the application.

`apps/web/src/proxy.ts` gates every path with no exclusions — page, RSC, API, static assets and unknown paths alike — and `scripts/production.test.mjs` proves that against a Node server. A hosting platform typically serves `/_next/static` from a CDN edge that can answer **before** the application runs. If it does, Echo's compiled assets are public on the deployed origin while every local check stays green, and nothing in the repository would notice. `scripts/deployed-smoke.mjs` fetches every asset the page links without credentials and fails if any is served.

It also confirms the things only a real origin can confirm: HTTPS (Basic credentials travel in every request, and `crypto.subtle` — which checksums every recorded chunk — is undefined without a secure context), that wrong credentials are refused rather than merely absent ones, that `/diagnostics/*` does not exist in production even for the owner, that `POST /api/recordings` guards itself independently of the proxy, and that neither the page nor any compiled asset contains the owner password.

**This script has not yet been run against a hosted deployment**, because none exists. It has been run against a local production server, which exercises every check except the transport itself, and it has been deliberately broken to confirm it fails: with a proxy serving `/_next/static` without credentials in front of that server — the CDN case above — it fails on the first asset rather than passing.

#### After the first successful deployment

A deployed HTTPS origin is what ADR-013 was waiting for. Mobile capture acceptance — microphone permission, interruption, backgrounding, lock screen, force-close and reopen — becomes possible at that point and returns as its own task, run against the deployed origin rather than against a development server on the network.

### Self-hosted container (ADR-010)

REQ-009 makes self-hosted deployment an architectural baseline, so Echo must run without Vercel using only the configuration already documented. ENG-002 verifies that rather than asserting it.

```sh
docker build -t echo .
docker run --rm -p 3000:3000 --env-file apps/web/.env.local echo
```

The image contains no configuration. `ECHO_OWNER_USERNAME`, `ECHO_OWNER_PASSWORD` and the provider variables are read from the environment when the server starts, so one image serves any deployment and the image itself holds no secret. `.dockerignore` keeps every environment file out of the build context, and CI asserts that no `.env*` file exists inside the built image.

To smoke-check a container you have started:

```sh
ECHO_OWNER_USERNAME=... ECHO_OWNER_PASSWORD=... node scripts/container-smoke.mjs http://127.0.0.1:3000
```

**Two things self-hosting has to handle that Vercel handles for you**, both from ADR-010:

- **Static assets.** `output: "standalone"` deliberately omits `.next/static` and `public/`, because on Vercel a CDN serves them. A bundle started without them returns 200 for the page and 404 for every stylesheet and script — it looks like a styling bug, not a deployment bug. `npm run selfhost:assemble` copies them, the `Dockerfile` runs it, and `npm run test:selfhost` fails if it was skipped.
- **Build-time versus runtime configuration.** Nothing is inlined at build time. `npm run test:selfhost` builds once and boots the same bytes twice — configured and unconfigured — and asserts the behavior differs. Echo has no `NEXT_PUBLIC_*` variables, and provider credentials must never become one.

Without a container runtime you can still run the exact bundle the image would:

```sh
npm run build && npm run selfhost:assemble
PORT=3000 HOSTNAME=127.0.0.1 npm run selfhost:start
```

Serve behind a TLS reverse proxy for any access beyond localhost; Basic credentials require encrypted transport, and without HTTPS `crypto.subtle` is undefined and recording refuses to start.

Once it is served over its real origin, verify it the same way a hosted deployment is verified:

```sh
ECHO_OWNER_USERNAME=... ECHO_OWNER_PASSWORD=... \
  npm run test:deployed -- https://echo.your-domain.example
```

`scripts/deployed-smoke.mjs` is host-agnostic on purpose (ADR-010): it checks the origin, not the platform.

## Unresolved setup and automation

- ESLint is pinned to 9.39.5 because the current Next React lint plugin crashes under ESLint 10 (`context.getFilename` API removal). npm marks ESLint 9 unsupported; upgrading the compatible plugin/toolchain remains a maintenance requirement. No lint rules are disabled.
- Provision the owner's username and random password in the server environment and configure HTTPS before hosted use. No real credentials are checked in or required by CI.
- Recording requires provider configuration. Copy `.env.example` to `apps/web/.env.local` and set `TRANSCRIPTION_PROVIDER`/`LLM_PROVIDER` (`openai-compatible` or `fixture`) with the matching `*_BASE_URL`, `*_API_KEY` and `*_MODEL`. Echo validates this at startup and disables recording, naming the missing variables, until it is complete.
- The `openai-compatible` adapter is verified against a stubbed transport, not against a live vendor. A live check is a manual step: configure a real base URL and key, run `npm run dev`, and record a clip.
- Storage, owner-scoped persisted data, mobile-browser validation, and deployment/recovery remain their later WEB tasks.
- `agent-loop.json` is present with `"ready": false`; automation remains **disabled**. Do not set it true until its actual check commands and per-test reporting adapters are implemented and independently demonstrated to report failures and individual test outcomes. Current human/CI commands and Node TAP output are not an agent-loop adapter certification.

Scaffold API choices follow the official [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Proxy](https://nextjs.org/docs/app/getting-started/proxy), and [Tailwind Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs) documentation. Lint runs separately because Next.js production builds do not run ESLint.

## Automated builder/checker workflow

See [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for the two specialists and orchestrator command. It permits five builder attempts and stops on any regression. Run `python3 -m unittest discover -s tests -v` to verify the controller (16 tests; the controller documents Python 3.10+, and the suite has also been observed passing on 3.9.6). App feature loops remain blocked by `"ready": false` until the real web check adapters and goal acceptance tests are configured.

### Local audio recovery (WEB-004, acceptance pending)

Completed chunks are saved in this browser's IndexedDB before processing. Reopen the same origin and browser to recover them; processing retries while the page is active and online. Results do not delete raw audio. The recorder shows pending/unsaved counts and offers downloads; export unsaved clips before leaving. Browser persistence can be refused, site data can be evicted/cleared, and private browsing is temporary.

The queue has a 64 MiB audio budget and warns below a 4 MiB reserve, sized from Safari's measured ~204 kbps with overlap/headroom. Capacity failure stops capture rather than deleting sole-copy audio. A persistent-storage grant is not an independent backup. Mobile backgrounding, screen lock or force-close can suspend work and lose the unfinished container. No background upload or offline application-shell cache is included: an offline hard navigation must wait for the same origin to become reachable.

Development-only, owner-gated `/diagnostics/queue` runs native IndexedDB tests with synthetic fixtures. Run the storage suite, reload and recover pending clips, then test capture persistence. Expected outputs and remaining physical-device checks are in TASKS.md's WEB-004 handoff. Browser acceptance has not yet been established.
