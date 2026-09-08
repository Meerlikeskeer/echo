# In flight

**One file per active task, named `<TASK-ID>.md`.** Create yours *before* you start work. Delete it in the pull request that finishes the task.

This directory exists because `STATUS.md` had a single *In flight* section that every task had to rewrite, so every pair of parallel branches collided on the same lines. Separate files never conflict. See **ADR-015**.

**Your file is branch-local working state, not a project-wide activity feed.** Its one job is recoverability: if your session stops without warning, the next one picks up your branch and reads it. Because a task that begins and finishes inside one pull request deletes its file there, `main` carries only work that is **started but not finished across merges** — WEB-004, whose code is merged while its browser acceptance is not, is the current example. To see everything in progress, read the open pull requests instead.

## What goes in your file

The next session's recovery information, and nothing else:

- **What you are attempting**, in a sentence.
- **Branch**, and its base — say so explicitly if the base is not `main`.
- **What is already done** and what is **not done yet**.
- **The numbers you actually observed**, if you ran anything. Never a previous run's numbers; write `not run` for what you did not run.

Assume you stop without warning and someone else picks this up cold. That is the only test this file has to pass.

## What does not go here

- **Durable facts about the project** — what exists, what is deployed, what a decision was. Those go in `STATUS.md` or the relevant source-of-truth document, because they outlive the task.
- **The per-task record** — scope, rationale, handoff. That is the task's entry in `TASKS.md`.
- **Narrative about finished work.** When the task merges, this file is deleted. Anything worth keeping must have been written somewhere permanent *before* then, or it is lost.

The failure this last rule prevents already happened: the old *In flight* section accumulated paragraphs about completed work until it was 51 lines and contained a paragraph saying "nothing deployed yet" three paragraphs above one saying "ECHO IS DEPLOYED". A file that is deleted on merge cannot rot that way, but only if the durable part was moved out first.

## Rules

1. **Your file is yours.** Do not edit another task's file. If you need to change what it says, say so in your own file or in the pull request.
2. **Delete it when the task merges**, in the same pull request. A file here for a merged task is a lie about what is active.
3. **It is not a substitute for `TASKS.md`.** A task is still not done until its `TASKS.md` handoff says so.
