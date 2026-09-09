#!/usr/bin/env node
// Generates STATUS.md's task table from TASKS.md, and fails when the committed
// table does not match.
//
// ENG-014 / ADR-015. The table used to be maintained by hand, which meant every
// task edited one row of a shared fifteen-row table on its own branch. Git
// conflicts on adjacent lines, so parallel branches collided there by design,
// and the usual way out was stacking one branch on another — which AGENTS.md
// warns against for unrelated and better reasons.
//
// TASKS.md was always the real source of truth for task state; the table was a
// hand-copied view of it. A copy that fifteen branches all edit is a conflict
// generator with no compensating benefit, so it is derived now, and this check
// is what keeps the derivation honest.

import { readFileSync, writeFileSync } from "node:fs";

const TASKS = "TASKS.md";
const STATUS = "STATUS.md";
const BEGIN = "<!-- BEGIN GENERATED TASK TABLE -->";
const END = "<!-- END GENERATED TASK TABLE -->";

// A task entry looks like:
//   ## ENG-010 — Reproducible hosted deployment and deployed-origin verification
//   **Status:** Done and verified · **Branch:** `eng/ENG-010-...` · **Dependencies:** ...
// Every field after Status is optional, and Status itself runs to the first
// `·` separator or the end of the line.
const HEADING = /^## ([A-Z]{3}-\d{3}) — (.+)$/;
const STATUS_LINE = /^\*\*Status:\*\*\s*(.+)$/;

// Markdown emphasis is stripped rather than preserved: the cell is truncated,
// and truncating inside `**bold**` leaves an unbalanced marker that corrupts
// the rest of the row. The full text is one click away in TASKS.md.
function toCell(text, limit) {
  let cell = text.replace(/\*\*/g, "").replace(/\|/g, "\\|").trim();
  if (cell.length > limit) {
    const cut = cell.slice(0, limit);
    const boundary = cut.lastIndexOf(" ");
    cell = `${(boundary > limit / 2 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
  }
  // A backtick left unclosed by truncation would swallow the rest of the table.
  if ((cell.match(/`/g) ?? []).length % 2 === 1) cell = cell.replace(/`([^`]*)$/, "$1");
  return cell;
}

function parseTasks(source) {
  const tasks = [];
  let current = null;
  for (const line of source.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      current = { id: heading[1], title: heading[2], status: "Todo", branch: "" };
      tasks.push(current);
      continue;
    }
    if (!current || current.seen) continue;
    const status = STATUS_LINE.exec(line);
    if (!status) continue;
    current.seen = true;
    const fields = status[1].split("·");
    current.status = fields[0];
    const branch = fields.find((field) => field.includes("**Branch:**"));
    // The first backticked token is the branch; anything after it is a base
    // commit or a parenthetical, which belongs in TASKS.md and not in a table.
    current.branch = branch ? (/`([^`]+)`/.exec(branch)?.[1] ?? "") : "";
  }
  return tasks;
}

function renderTable(tasks) {
  const rows = tasks.map(
    (task) =>
      `| ${task.id} ${toCell(task.title, 80)} | ${toCell(task.status, 90)} | ${task.branch ? `\`${task.branch}\`` : "—"} |`,
  );
  return [
    BEGIN,
    "",
    `*Generated from \`${TASKS}\` by \`npm run status:table\`. **Do not edit this table by hand** — change the task's \`**Status:**\` line in \`${TASKS}\` instead, which is the source of truth. \`npm run check\` fails when the two disagree.*`,
    "",
    "| Task | Status | Branch |",
    "| --- | --- | --- |",
    ...rows,
    "",
    END,
  ].join("\n");
}

const tasks = parseTasks(readFileSync(TASKS, "utf8"));
if (tasks.length === 0) {
  console.error(`status-table: no task entries found in ${TASKS}. Expected headings like "## ENG-010 — Title".`);
  process.exit(2);
}

const status = readFileSync(STATUS, "utf8");
const begin = status.indexOf(BEGIN);
const end = status.indexOf(END);
if (begin === -1 || end === -1) {
  console.error(`status-table: ${STATUS} is missing the ${BEGIN} / ${END} markers that delimit the generated table.`);
  process.exit(2);
}

const table = renderTable(tasks);
const updated = status.slice(0, begin) + table + status.slice(end + END.length);

if (process.argv.includes("--check")) {
  if (updated === status) {
    console.log(`status-table: OK — ${STATUS}'s task table matches ${TASKS} (${tasks.length} tasks).`);
    process.exit(0);
  }
  console.error(
    `status-table: ${STATUS}'s task table does not match ${TASKS}.\n` +
      "  The table is generated; the source of truth is each task's **Status:** line in TASKS.md.\n" +
      "  Fix: run `npm run status:table` and commit the result. Do not edit the table by hand.",
  );
  process.exit(1);
}

writeFileSync(STATUS, updated);
console.log(`status-table: wrote ${tasks.length} tasks into ${STATUS}.`);
