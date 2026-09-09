# ENG-017 adapter acceptance contract

Prepared independently of the builder. Both command-line adapters accept
`--report PATH` and execute their fixed suite once from the repository root.
Unit selection must match `apps/web/package.json`; production selection must
match `scripts/production.test.mjs`. Explicitly request the Node TAP reporter.
Do not add a user-controlled command override to production adapters.

## Frozen observable requirements

1. Complete TAP with two passing cases produces exactly two stable, unique
   IDs mapped to `pass`, exit 0. IDs derive from test names and nesting rather
   than ordering numbers, so insertion of another test does not rename them.
   Qualify nested names with `/` and include parent result records too. Reject
   ambiguous IDs rather than silently overwriting one.
2. A complete failed case is included as `fail`; preserve the runner's
   nonzero exit code even when every parsed case says `ok`.
3. SKIP and TODO cases are included as `fail`, never omitted or passed; the
   adapter exits nonzero even if the runner exits zero.
4. Empty output, missing TAP version, missing plan, zero selection, invalid
   plan, duplicate IDs, duplicate/out-of-order numbering, bailout, unknown
   non-diagnostic lines, and truncated diagnostics or child suites block.
5. Validate each nested scope against its plan. Include nested individual
   cases with parent-qualified IDs. Do not mistake YAML diagnostics for TAP
   results. Distinct parents may contain the same child name.
6. Runner launch errors, crashes/signals, invalid text, or output/report I/O
   errors cannot yield success. A runner nonzero exit survives parsing errors;
   a signal terminates nonzero with the corresponding conventional exit code.
7. Remove any stale report before launching. Invalid or incomplete output
   must not leave a partial or old successful JSON report. A report written
   on complete output includes every selected result, including failures.
   Publish atomically with `os.replace`; never expose partly written JSON.
8. The adapters must handle real Node/tsx output, including timing diagnostic
   blocks and final summary comments, verified separately from synthetic TAP.

## Test seam

Fixture tests execute each CLI entry point through `runpy` with fixed argv,
mocking only `subprocess.run` to return synthetic runner bytes and exit status.
This keeps runner selection visible for review, exercises real parsing and
report publication, and avoids exposing a command override in the adapters.
The implementation may share code under the protected `scripts/run-app-*.py`
glob. The subprocess call must capture runner stdout as bytes; stderr is
diagnostic only and cannot supply test outcomes. No shell execution.

The independent checker must review the fixtures before builder implementation.
These adapter tests certify the reporting boundary; the production HTTP suite
is not goal-specific acceptance for arbitrary future feature tasks. The loop
remains disabled until separate goal-specific tests and owner approval exist.
