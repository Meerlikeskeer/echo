---
description: Run Echo's bounded builder/checker workflow from a goal file
argument-hint: path/to/goal.md
---
Use the goal file supplied in $ARGUMENTS. Read AGENT_WORKFLOW.md. Run `python3 scripts/agent_loop.py --goal-file <supplied-path>` from the repository, quoting the path as data. This launcher uses separate Codex CLI sessions even when invoked from Claude Code; it requires an installed/authenticated Codex CLI. Do not substitute an unbounded prompt loop, bypass a stop, or automatically restart. Report the final status and evidence location. If configuration is not ready, explain the missing scaffold/checks and stop.
