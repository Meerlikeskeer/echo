<!--
Echo pull request. Keep this short and factual — it is the record the owner
reviews and the next session reads. AGENTS.md holds the rules; this is the
checklist form of them.
-->

## Task

<!-- One task ID. If this PR carries two, say why they could not be separated. -->

**Task:** <!-- e.g. WEB-003 -->
**Branch base:** <!-- `main`, or the branch this stacks on and why -->

## What changed

<!-- Two or three sentences in plain words. What can someone do now that they
could not before, or what is now guaranteed that was not? -->

## Verification

Record the numbers you actually observed. Never copy a previous run's numbers
forward, and write `not run` for anything you did not execute.

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | | |
| `npm run check` | | unit: ___ · production HTTP: ___ · self-host: ___ |
| `python3 -m unittest discover -s tests` | | |

- [ ] Test counts are the same or higher than the `STATUS.md` snapshot. A count going down is a regression, not a cleanup.
- [ ] No existing assertion, lint rule or check was removed, skipped or relaxed.
- [ ] `STATUS.md` and the `TASKS.md` entry are updated in this PR.

## Not verified

<!-- Say it plainly. Anything that could not run here, anything a human still
has to do by hand, anything covered only by a substitute. A substitute is not
verification. If everything ran, write "nothing outstanding". -->

## Risk and reversibility

- [ ] No credential appears in source, tests, logs, fixtures or `NEXT_PUBLIC_*`.
- [ ] No new framework, database, host, storage provider or major service — or, if there is one, the stack-change procedure in `ARCHITECTURE.md` was followed and an ADR is included.
- [ ] Nothing here is destructive or irreversible without the owner acting deliberately.
