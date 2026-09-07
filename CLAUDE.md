# Claude Code entry point

Read and follow [AGENTS.md](AGENTS.md), the shared engineering instructions for this repository. Then read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) and the linked requirements, architecture, decisions, and tasks.

Do not maintain a separate Claude-specific product plan. Repository documentation is authoritative over earlier chat context. Use the same task IDs, branches, verification standards, and handoff process as Codex and human contributors.

## Before changing anything

- **[ARCHITECTURE.md](ARCHITECTURE.md) → `Technology Stack` is the canonical source of truth for Echo's approved stack.** Read it before introducing any framework, database, hosting platform, UI library, backend framework, storage provider, authentication system, or major infrastructure service. Never silently replace or add an alternative to a documented stack decision; follow the stack-change procedure recorded there and in `AGENTS.md`.
- Approved: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, Vercel hosting, and backend logic inside Next.js Route Handlers and server-side modules.
- Intentionally undecided: relational database, object/audio storage, transcription vendor, LLM vendor, background/worker infrastructure, and production authentication. Do not pick one silently.
- Provider credentials stay server-side. Never use `NEXT_PUBLIC_*` for secrets.
- Current state and next task: DOC-001, ENG-001 and WEB-001 are complete on `main`; **WEB-002 (short recording vertical slice) is next.** See [TASKS.md](TASKS.md).

## Verification

Run `npm ci` then `npm run check` from the repository root, and `python3 -m unittest discover -s tests` for the bounded controller. Report exactly what ran. Do not weaken existing checks or claim passing tests that did not execute.

## Bounded loop

For the bounded loop, read [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). `/orchestrate <goal-file>` runs its Codex-backed controller; the two local specialist definitions share `agents/` role rules. `agent-loop.json` stays `"ready": false` until real application test/report adapters and acceptance tests exist and are independently verified — the automation must fail closed.
