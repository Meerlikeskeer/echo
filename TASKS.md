# Tasks

**Every task's record lives in its own file: [`tasks/<TASK-ID>.md`](tasks/).**
[`tasks/INDEX.md`](tasks/INDEX.md) is the generated overview — id, title, status, branch.

Status vocabulary: Todo, In progress, Blocked, Done.

## Why the records moved out of this file (ENG-019)

This file used to hold every task record, about 1,100 lines of them, and every
task appended to the same place. That guaranteed a merge conflict between any two
branches open at once, and it happened to WEB-015, WEB-007, ENG-016 and ENG-018
in a single afternoon. The generated status table had the same problem for the
same reason.

**ADR-015 already knew this.** ENG-014 split `STATUS.md`'s *In flight* section
into one file per task precisely because a section every branch edits is a
conflict generator. It just stopped halfway: the *records* stayed in one file.
ENG-019 finishes the job, and states the rule plainly so it does not have to be
learned a third time.

> **No file that every task must edit.**

That covers records, the status table, and the verification-floor counts. Each is
now either one file per task, or generated from them.

## Adding or updating a task

1. Create or edit `tasks/<TASK-ID>.md`. Its heading must be `## <TASK-ID> — Title`,
   and its first `**Status:**` line is what the index reads.
2. Run `npm run tasks:build` and commit the regenerated `tasks/INDEX.md`.
   `npm run check` fails when the index and the task files disagree.
3. When your task's counts change, run `npm run floor` — never type a test count
   by hand. It runs the suites, records what actually passed, and refuses a count
   that went down.

If two branches both add a task, `tasks/INDEX.md` merges itself: it is marked
`merge=union` in `.gitattributes`, so both rows survive. If the merged order
looks wrong, run `npm run tasks:build` instead of resolving it by hand.

## Handoff template

For an active or completed task record: task ID; branch and commit; scope
changed; checks and outcomes with the exit codes you actually observed;
blockers and open decisions; next step. Write `not run` for anything you did not
run. Keep credentials and real recording content out of handoffs.

## Work that needs a person

Anything an agent cannot verify — a microphone, a real browser, a phone, a
deployment — is listed with step-by-step instructions in
[`HUMAN_TESTING.md`](HUMAN_TESTING.md).
