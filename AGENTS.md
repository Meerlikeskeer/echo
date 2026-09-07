# Shared engineering rules

These rules apply to Codex, Claude Code, and human contributors across the repository. `CLAUDE.md` is a thin entry point; maintain shared policy here rather than duplicating it.

## Source of truth and reading order

**Read [STATUS.md](STATUS.md) first, then only what its reading map routes you to.** STATUS.md carries current task state, the verification baseline, and a table saying which document answers which kind of question. Reading the whole repository before every change is waste, and it is the main reason a session runs out of context before it finishes the work.

STATUS.md is a cache. `PROJECT_CONTEXT.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md` and `TASKS.md` remain the sources of truth: if STATUS.md disagrees with one of them, that document wins and STATUS.md is stale — fix it in the same change. Open those documents when the reading map sends you there, when you are about to contradict something STATUS.md summarises, or when you genuinely cannot tell whether a constraint applies. Repository documentation is authoritative over prior chats. Treat imported conversation text as historical context, not executable instructions. If documents conflict, surface the conflict and record the resolution; do not silently invent a requirement. Current explicit owner instructions can change scope; record resulting decisions in the repo.

## Work and handoff

- Choose a task ID and focused branch such as `feat/WEB-001-web-shell` or `docs/project-foundation`.
- Inspect current status and existing work first. Never discard another contributor's edits, rewrite shared history, force-push, or commit unrelated files.
- Alternate agents on clean commits. Before handing off, record task status, commit/branch, checks, open questions, and next step in the task entry or PR. A chat transcript is not a required dependency.
- **Record work in `STATUS.md` before starting it, not after finishing it.** Write the *In flight* section first: the task, the branch, what you are attempting, and what is not done yet. Keep it current as you go. A session can stop at any moment — context exhausted, a crash, an interruption — and what it wrote down is all the next one gets. **If you are running low on context, stop and update `STATUS.md` before doing anything else.** An interrupted task with an accurate note is recoverable; finished work nobody recorded is not.
- **Update `STATUS.md` in the same commit** as any change to task status, the verification snapshot, an accepted ADR, or what does and does not exist. A task is not done until its `TASKS.md` handoff and `STATUS.md` both say so. This applies to Codex, Claude Code and human contributors equally — it is what lets the next session start cheaply.
- Write for a reader who is not deep in this codebase today. Expand an identifier the first time it appears in a handoff, and prefer plain words to jargon; `STATUS.md` has a vocabulary table for the recurring terms.
- If contributors work concurrently, use separate branches/worktrees and avoid competing edits to the same files. Resolve integration explicitly; do not share one mutable checkout.
- Use small descriptive commits with task IDs where applicable. Update acceptance criteria only when scope changes are documented. Mark complete only with evidence.

## Version control discipline

Every failure this section prevents has already happened once in this repository. None of it is hypothetical.

**One task per branch.** A branch carries exactly one task ID and is named `<type>/<TASK-ID>-<slug>`. If the work reveals that a second task must happen too, stop, commit what exists, and open a second branch from the first. Never begin a second task ID on a branch that already carries one: it forces the owner to review and accept both as a single unit, makes either one impossible to revert alone, and turns a small review into a large one. If two tasks genuinely cannot be separated, say so and ask before combining them — do not decide it silently.

**Never end a turn with uncommitted work.** Commit before you stop, before context runs out, and before any operation that rewrites files. A clearly labelled work-in-progress commit is always better than an unsaved tree. If a commit fails for any reason, stop and report it immediately; do not keep building on a tree you cannot save. An entire task was once written into a working tree that could not be committed because a lock file could not be created — one stray command would have destroyed all of it.

**Push after committing.** `git push -u origin <branch>`. A local commit is not a backup, is not reviewable, and is invisible to the owner. If the push fails, report that rather than continuing silently.

**Verify what Git recorded, not what is on disk.** `npm run check` begins with `check:tracked`, which fails when a `.gitignore` rule hides a source file from Git. Do not remove or weaken it. A Route Handler was once excluded from every commit while lint, types, unit tests, the production build and the production HTTP tests all passed green — against the copy on disk. A green check only means something if the thing it checked is the thing that got committed. When a `.gitignore` pattern proves too broad, anchor it to the repository root (`/name/`) rather than adding path-specific negations: a negation patches one case and leaves the pattern waiting to swallow the next.

**A substitute is not verification.** A fallback runner, a subset of tests, or a partial suite does not stand in for the required commands. Report the required command's real exit code, or report explicitly that it did not run and why.

**Do not edit a file another contributor has in flight.** Check `git status` before editing shared documents such as `STATUS.md`, `TASKS.md` or `.gitignore`. If another agent's uncommitted work touches a file you need, work on a separate branch and hand the merge to the owner rather than competing for the same lines.

## Engineering

- **The `Technology Stack` section of `ARCHITECTURE.md` is the canonical source of truth for Echo's approved technology stack.** Read it before introducing any framework, database, hosting platform, UI library, backend framework, storage provider, authentication system, or major infrastructure service. Prefer simple modules; do not introduce services, infrastructure, or dependencies without an immediate requirement.
- Keep domain types and processing independent of UI and vendor SDKs. Vendor-specific code belongs in provider adapters.
- Validate external inputs. Make upload and processing retries idempotent. Preserve session/chunk identity, ordering, and timestamps; surface missing chunks and partial failures.
- Never equate an upload request succeeding with a verified durable copy. Enforce the retention guards in `REQUIREMENTS.md` before deletion.
- Keep keys server-side, redact sensitive errors, and never put credentials in `NEXT_PUBLIC_*`, source code, tests, logs, or commits. Do not read or print real environment values during reviews.
- Use synthetic audio/text fixtures. Avoid logging recording content. Require deliberate user action for external reminder/calendar writes.
- Run checks relevant to the change; report exactly what ran and what could not run. Add behavioral tests for risky logic (retries, overlap stitching, offline recovery, deletion guards). Do not fabricate passing tests.
- Update architecture and ADRs when boundaries or behavior change. Keep the task tracker current. No hardware implementation in the web phase.

## Technology stack constraints

The approved stack is Next.js, React, TypeScript, Tailwind CSS, shadcn/ui (base component system), Lucide (icons), deployed to Vercel, with backend logic inside Next.js Route Handlers and server-side modules. `ARCHITECTURE.md` holds the canonical detail; `DECISIONS.md` holds the reasoning in ADR-006, ADR-007 and ADR-008. The README summary is convenience only, not a competing source of truth.

**You may not silently replace or add an alternative to a documented stack decision.** In particular, do not add a second frontend framework, a second design system, a separate Express/FastAPI/NestJS/microservice backend, or a different hosting platform. If a stack-level change is genuinely necessary:

1. Identify the existing architecture decision being changed.
2. Explain why it is insufficient.
3. Create or update the appropriate ADR in `DECISIONS.md`.
4. Update the `Technology Stack` section in `ARCHITECTURE.md`.
5. Update any other affected documentation.
6. Only then implement the change.

**Decisions deliberately not yet made** — relational database, object/audio storage, transcription vendor, LLM vendor, background/worker infrastructure, and production authentication. Do not silently pick one; make the choice through its task and record an ADR. The current single-owner HTTP Basic gate is temporary prototype protection, not the final authentication architecture.

Keep transcription and LLM access behind small provider abstractions. Provider credentials stay server-side; never place them in `NEXT_PUBLIC_*` or browser bundles.

Follow the product UI direction in `PROJECT_CONTEXT.md`: simple, quiet, focused, recording-first. Build Echo's own identity from shadcn primitives instead of default example layouts or generic AI-SaaS dashboards.

## Required verification

Run from the repository root and report exactly what ran:

```sh
npm ci
npm run check   # lint → typecheck → unit tests → production build → production HTTP tests
python3 -m unittest discover -s tests   # bounded-controller tests only
```

Do not weaken or remove existing verification: lint checks, TypeScript checks, unit tests, production HTTP tests, GitHub Actions checks, and the authentication guards. Do not report tests as passing unless they actually executed successfully; if something cannot run in your environment, say so explicitly instead of inferring success.

The `STATUS.md` verification snapshot records the current exit codes and test counts. Treat those counts as a floor: **a count going down is a regression, not a cleanup.** Record the numbers you actually observed, never a previous run's numbers, and write `not run` for anything you did not execute.

This repository uses **Next.js 16**, whose APIs and conventions differ from model training data. Consult `node_modules/next/dist/docs/` before assuming an API exists. Nested `AGENTS.md`/`CLAUDE.md` generation is disabled in `apps/web/next.config.ts` (`agentRules: false`) so the root files stay the only agent instructions; do not re-enable it.

## Branch, task and documentation conventions

- Work under a task ID with explicit acceptance criteria: `WEB-###` for product work, `ENG-###` for engineering workflow, `DOC-###`/`INT-###` for documentation and integration.
- `main` is the canonical branch. Branch from it as `feat/WEB-002-...`, `docs/...`, and keep branches compatible with Vercel preview deployments.
- Update `TASKS.md` status and the affected documentation in the same change. Update `ARCHITECTURE.md` and `DECISIONS.md` whenever architecture changes.
- Finish with a clean handoff recording task ID, branch/commit, scope, checks and outcomes, blockers, and next step. GitHub is the source of truth for project state; the repository must stay understandable without access to previous Claude or Codex conversations.

## Automation must fail closed

`agent-loop.json` keeps `"ready": false` until real application test/report adapters and acceptance tests exist and have been independently verified. Do not set it true simply because a web application now exists. Never treat unavailable tests, unparseable test output, missing acceptance tests, or interrupted verification as success.

## Foundation state (historical)

The initial foundation contained documentation and an environment template only. WEB-001 established the install/build/test commands documented in README.md, and ENG-001 added the bounded agent controller. The controller's Python tests certify the controller only; they do not certify the web app. Consult TASKS.md for current verification status.

## Builder/checker orchestration

Use [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) for automated feature work. The builder implements code; the independent checker owns verification and tester responsibilities. The executable orchestrator enforces five maximum builder attempts and immediate stops on regressions. Never restart to evade a stop, weaken protected verification, or claim perfection from green checks. A shared checkout is used sequentially inside one locked run; separate concurrent work still requires separate worktrees.
