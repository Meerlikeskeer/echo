# Claude Code entry point

Read [STATUS.md](STATUS.md) first — current task state, the verification baseline, and a reading map saying which document answers which kind of question. Then read [AGENTS.md](AGENTS.md), the shared engineering instructions. **Open other documents only when the reading map routes you there.** Loading the whole repository before every change is waste; STATUS.md exists so you do not have to.

Do not maintain a separate Claude-specific product plan. Repository documentation is authoritative over earlier chat context. Use the same task IDs, branches, verification standards, and handoff process as Codex and human contributors.

## Before changing anything

- **[ARCHITECTURE.md](ARCHITECTURE.md) → `Technology Stack` is the canonical source of truth for Echo's approved stack.** Read it before introducing any framework, database, hosting platform, UI library, backend framework, storage provider, authentication system, or major infrastructure service. Never silently replace or add an alternative to a documented stack decision; follow the stack-change procedure recorded there and in `AGENTS.md`.
- Approved: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, Vercel hosting, and backend logic inside Next.js Route Handlers and server-side modules.
- Intentionally undecided: relational database, object/audio storage, the **permanent** transcription and LLM vendors, diarization, background/worker infrastructure, and production authentication. Do not pick one silently. ADR-009 selects a Temporary prototype default behind the provider ports; ADR-010 requires Echo to stay deployable outside Vercel.
- Provider credentials stay server-side. Never use `NEXT_PUBLIC_*` for secrets.
- Current state and next task: see [STATUS.md](STATUS.md). Fill in its *In flight* section **before** starting work and keep it current as you go, so an interrupted session is still recoverable; update the rest of it in the same commit as any change to task status, the verification snapshot, or an accepted ADR.

## Verification

Run `npm ci` then `npm run check` from the repository root, and `python3 -m unittest discover -s tests` for the bounded controller. Report exactly what ran. Do not weaken existing checks or claim passing tests that did not execute. The `STATUS.md` snapshot holds the current exit codes and test counts; a count going down is a regression, not a cleanup.

## Bounded loop

For the bounded loop, read [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). `/orchestrate <goal-file>` runs its Codex-backed controller; the two local specialist definitions share `agents/` role rules. `agent-loop.json` stays `"ready": false` until real application test/report adapters and acceptance tests exist and are independently verified — the automation must fail closed.
