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

Run each check from the repository root:

```sh
npm run lint            # ESLint; warnings fail
npm run typecheck       # Next route type generation, then strict TypeScript
npm test                # synthetic access-policy and empty-state behavior tests
npm run build           # actual Next production compilation
npm run test:production # requires build; starts/stops two loopback production servers
npm run check           # all five checks above, in order
npm start               # serve the production build on 127.0.0.1:3000
```

The committed `package-lock.json` pins dependencies; `npm ci` installs it without rewriting resolution. Production tests supply synthetic credentials, exercise absent-config and unauthorized denial on page/API/static/RSC paths, check an old middleware-bypass header, then verify authorized HTML/RSC and emitted JS/CSS. They require permission to bind loopback sockets. No external provider calls or recording fixtures are used. Unit tests use Node's built-in test runner via `tsx`; production tests use it directly and fail on assertions/server startup failure.

GitHub Actions runs `npm ci` and `npm run check` on pull requests and pushes to `main`, with read-only repository permissions and no secrets. Remote CI execution and branch protection must be configured/observed after pushing; this change does not merge or deploy anything.

## Deployment

Vercel is Echo's intended deployment target (ADR-008). The intended workflow is:

```text
feature branch → GitHub → Vercel preview deployment
  → manual + automated verification → merge → production deployment
```

**Nothing is deployed today.** No Vercel project, environment variables, or preview deployments have been configured. Before any hosted use, provision `ECHO_OWNER_USERNAME` and a random 32+ character `ECHO_OWNER_PASSWORD` as server-side environment variables and serve over HTTPS — Basic credentials require encrypted transport. Keep future feature branches compatible with preview deployments.

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
