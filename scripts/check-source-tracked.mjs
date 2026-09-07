#!/usr/bin/env node
// Fails when a source file exists on disk but Git cannot see it.
//
// This is not hypothetical. `.gitignore` carried the line `recordings/`, meant
// for saved audio. That pattern matches a directory of that name at ANY depth,
// including `apps/web/src/app/api/recordings/`. The WEB-002 Route Handler was
// silently excluded from every commit while lint, types, unit tests, the
// production build and the production HTTP tests all passed — because they ran
// against the copy sitting on disk. A fresh clone would have answered 404 to
// every recording, and nothing in the suite would have said so.
//
// A green check is only meaningful if the thing it checked is the thing that
// got committed. This guard is what makes that true.

import { execFileSync } from "node:child_process";

const SOURCE_PATHS = ["apps/web/src", "apps/web/tests", "scripts", "tests"];

// Extensions that are always source. Build artefacts and caches under these
// directories (`__pycache__`, `*.pyc`, `*.tsbuildinfo`) are legitimately
// ignored and must not trip the guard.
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx", ".css", ".py"];

const isSource = (file) => SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension));

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

const ignored = git(["ls-files", "--others", "--ignored", "--exclude-standard", "--", ...SOURCE_PATHS]).filter(isSource);
const untracked = git(["ls-files", "--others", "--exclude-standard", "--", ...SOURCE_PATHS]).filter(isSource);

if (untracked.length > 0) {
  console.log(`source-tracked: ${untracked.length} untracked source file(s) — commit them before handing off:`);
  for (const file of untracked) console.log(`  ${file}`);
}

if (ignored.length > 0) {
  console.error("\nsource-tracked: FAILED — .gitignore is hiding source files from Git.\n");
  for (const file of ignored) {
    const rule = execFileSync("git", ["check-ignore", "-v", file], { encoding: "utf8" }).trim();
    console.error(`  ${file}\n    excluded by: ${rule.split("\t")[0]}`);
  }
  console.error(
    "\nThese files exist on disk, so every other check can pass while they are " +
      "missing from the commit.\nFix the .gitignore rule — prefer anchoring it to the repository root " +
      "(`/name/`) over\nadding path-specific negations, which patch one case and leave the pattern " +
      "waiting to\nswallow the next one.\n",
  );
  process.exit(1);
}

console.log(`source-tracked: OK — no source file under ${SOURCE_PATHS.join(", ")} is hidden from Git.`);
