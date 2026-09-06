# Echo

Private-first, web-first AI note-taking: capture conversations and quick thoughts, then turn them into transcripts, titles, summaries, notes, action items, and research suggestions.

**Status:** architecture and repository foundation only. No application, dependencies, or runnable commands have been added yet. Hardware is deferred.

## Start here

- [Project context](PROJECT_CONTEXT.md): scope, priorities, and handoff context.
- [Requirements](REQUIREMENTS.md): product behavior and safety constraints.
- [Architecture](ARCHITECTURE.md): data flow, package boundaries, and provider contracts.
- [Roadmap](ROADMAP.md) and [tasks](TASKS.md): milestones and acceptance criteria.
- [Decisions](DECISIONS.md): accepted choices and unresolved questions.
- [Shared engineering rules](AGENTS.md): instructions for all contributors and agents.
- [Claude Code entry point](CLAUDE.md): points to the same shared rules.

Repository documentation is authoritative over prior chat context. Keep decisions and implementation synchronized through reviewed commits.

## Planned prototype

Next.js, TypeScript, and Tailwind in `apps/web`, with modular packages for audio, transcription, AI, storage, research, reminders, and shared domain types. These paths are planned, not scaffolded. Start with a 30–60 second recording → transcript → generated notes. Add durable chunking and offline behavior before expanding features.

## Configuration and privacy

[.env.example](.env.example) contains blank configuration placeholders only. Once the application is scaffolded, use an ignored local environment file; never commit actual credentials. Private repository visibility does not replace application access control. Recording content and provider keys must not appear in logs, fixtures, analytics, or browser bundles.

User-supplied keys and provider choice are core requirements. Cloud processing must be explicit; self-hosted deployment is the architectural baseline. Calendar/reminder writes require user confirmation.

## Working on Echo

Read `AGENTS.md`, choose a `WEB-###` task, create a focused branch, and update its status and relevant documentation with the implementation. Until a test toolchain exists, validate documentation links, consistency, and secret hygiene. Do not claim the app is runnable or tests pass before they exist.
