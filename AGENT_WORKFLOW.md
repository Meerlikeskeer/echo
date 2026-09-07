# Bounded builder/checker workflow

Give the orchestrator a goal file. It routes implementation to a builder and verification to a separate checker, repeating only when safe. The checker owns the tester responsibility: a deterministic runner executes the checks, then a fresh read-only agent reviews the evidence and goal coverage. There are two AI specialists, not a third redundant tester model.

## Roles

| Role | Responsibility | Cannot do |
| --- | --- | --- |
| Orchestrator | Establish baseline, invoke specialists, remember passes, enforce stops, retain reports | Override a stop or call unverified work complete |
| Builder | Implement goal and repair reported code failures | Certify its own work, weaken checks, change history, deploy |
| Checker/tester | Run frozen checks, inspect logs and diff, report precise failures and missing goal coverage | Fix implementation or change tests to manufacture green |

The executable controller is `scripts/agent_loop.py`. It creates fresh, separate Codex CLI sessions for each builder and checker invocation, with workspace-write and read-only sandboxes respectively. It inherits the user's configured model. It does not reuse the builder's conversation as the checker session; the checker receives the goal, current files, builder handoff, and independent command evidence. The shared role definitions are in `agents/`; Claude Code specialists in `.claude/agents/` reference the same rules.

## Stop rules

1. At most **five builder attempts**, counting the initial implementation as cycle one. Baseline verification does not consume a builder attempt. No automatic restart after exhaustion.
2. Stop as soon as a previously passing check or individual test fails or disappears. Remember passes from the baseline and every cycle. This catches regressions even inside a suite that was already failing.
3. Stop for missing commands/results, timeouts, malformed agent output, changed protected files, or changed commit history. Do not treat blocked/skipped/missing tests as green.
4. Stop successfully only when every configured check passes **and** the independent checker finds the requested goal complete with no findings. A green report means this evidence passed; it is not a proof of perfection.

A regression preserves the code and evidence for human inspection; it does not automatically roll back or attempt another repair. All non-green terminal statuses return exit code 2. Green returns 0. Builder/checker calls each have a 20-minute timeout, check commands 15 minutes; process groups are terminated on timeout/interruption. Five cycles limits attempts, not an exact token budget. Keep individual goals bounded.

## Setup before the first feature loop

Echo now has a web application (WEB-001) and a real npm toolchain, but `agent-loop.json` deliberately keeps `ready: false` and the loop still blocks before spending model tokens. Preflight exits 2 with `BLOCKED: Configure real app and goal acceptance checks; ready is false.`

What is now satisfied: `npm run typecheck`, `npm run lint` and `npm run build` are real commands backed by `apps/web`.

What still blocks enabling it:

- `scripts/run-app-tests.py` (the `test` adapter) **does not exist**.
- `scripts/run-app-acceptance.py` (the `acceptance` adapter) **does not exist**.
- No goal-specific acceptance tests have been written or independently reviewed.
- Neither adapter has been demonstrated to report individual test outcomes and to preserve failures rather than manufacturing green.

Both adapters must emit a JSON object at the path substituted for `{report}`, mapping every selected test ID to `pass` or `fail`, derived from the framework's machine-readable output. The web unit tests use Node's built-in runner via `tsx`, and the production tests use `node --test`; both emit TAP, which an adapter must parse faithfully — including failures, skips and a nonzero exit status. Do not set `ready: true` until these exist and have been independently verified.

1. Scaffold the app and add meaningful automated checks in a normal reviewed change. *(Done in WEB-001: `npm run check` runs lint, typecheck, unit tests, a production build and production HTTP tests.)*
2. Define goal-specific acceptance tests **before** the bounded loop. Review them independently of the builder. The builder cannot write its own success criteria during a run.
3. Replace example commands with actual argv arrays for tests, typecheck, lint, production build, and goal acceptance. Commands must run once, not watch or autofix. Do not use commands that silently allow no tests.
4. For test and acceptance commands, implement adapters that write a JSON object to the path substituted for `{report}`. Each key is a stable, unique individual test ID and each value is `pass` or `fail`, for example `{"audio/retry preserves chunk ID": "pass"}`. Include **every** selected case, including failed cases; do not omit skips or failures. An empty, missing, skipped or invalid report blocks. The example `scripts/run-app-tests.py` and `scripts/run-app-acceptance.py` are placeholders to implement for the chosen test framework. Never manufacture report values: derive them from the framework's machine-readable output, preserving failures and exit status.
5. Protect all tests, fixtures, check adapters, runner configuration, acceptance criteria and any other files that define green. The configured glob list is a starting point; extend it for the selected stack. Review and commit `ready: true` only once these checks and adapters are real.
6. Start with a clean committed feature branch. Put the goal in a file outside the repository (or commit it beforehand). Only one orchestrator may run per worktree.

New tests/configuration changes are separate reviewed setup changes; adding protected files during the loop also stops it. This deliberately prevents the builder from redefining success. These guards support a cooperative workflow, not a security boundary against malicious code: commands still execute project code, and a model review cannot prove tests are exhaustive.

## Run

From the repository root, with an authenticated Codex CLI and Python 3.10+ on macOS/Linux:

```sh
python3 scripts/agent_loop.py --goal-file /absolute/path/to/goal.md --preflight
python3 scripts/agent_loop.py --goal-file /absolute/path/to/goal.md
```

Preflight validates configuration only; it does not run checks or authenticate the CLI. From Claude Code, use `/orchestrate /absolute/path/to/goal.md`; that command launches the **same Codex-backed controller**. Claude's standalone builder/checker definitions are also available, but calling them manually does not enforce the executable loop's guarantees. No CLI authentication is created or bypassed by this setup.

Each run prints its private temporary evidence directory, including command logs, agent handoffs and `report.json`. Do not commit logs: they may contain goal text or application output. Review local logs before sharing and delete them when no longer needed. Reports record cycle, command argv, exit code, individual test results, findings, and terminal status. A timeout/launch failure includes its error. Missing results are a blocker, never a pass.

The loop creates no commits, pushes or deployments. Review its resulting diff before committing. If a crash leaves `.git/echo-agent-loop.lock`, confirm no run is active before removing that lock; never restart automatically to bypass the five-cycle limit.

## Verify the controller itself

```sh
python3 -m unittest discover -s tests -v
```

These tests use synthetic repositories and stub model calls; they exercise green, repairs, five-cycle exhaustion, regressions, missing reports, protected edits and process failures without model costs. **They certify the controller only — they do not validate `apps/web` or a live authenticated model run.** Last rerun after branch integration: 16 tests, 0 failures.

## Implementation references

- [Codex non-interactive sessions](https://developers.openai.com/codex/noninteractive)
- [Claude Code custom subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code commands and skills](https://code.claude.com/docs/en/slash-commands)
