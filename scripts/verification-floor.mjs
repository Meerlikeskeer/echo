#!/usr/bin/env node
// Runs the three suites, counts what actually passed, and refuses a count that
// went down. `--check` compares without updating; the default updates.
//
// ENG-019. The floor used to be a sentence in STATUS.md that every task edited
// by hand, and it was wrong the moment two branches were open at once. WEB-015
// and WEB-007 both branched from 114 unit tests and each recorded its own total,
// 126 and 149. Neither could see the other. Both were correct on their own
// branch and both were stale on `main`, where the real number is 161.
//
// So a hand-typed count is two bad things at once: a line every task must edit,
// which is a guaranteed merge conflict, and a number no task can compute
// correctly, which makes the conflict worse than pointless to resolve. The
// machine counts instead. A human never types one of these numbers again.
//
// This is deliberately NOT part of `npm run check` — it would run every suite a
// second time. Run it once when a task is done, and commit the result.

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const FILE = "verification-floor.json";

const SUITES = [
  { key: "unit", label: "unit", argv: ["npm", "test"] },
  { key: "productionHttp", label: "production HTTP", argv: ["npm", "run", "test:production"] },
  { key: "selfHostParity", label: "self-host parity", argv: ["npm", "run", "test:selfhost"] },
];

/** Node's test runner ends with a TAP summary. The pass count is the only number
 *  that matters: a suite that fails is not evidence of anything, and a suite
 *  that was skipped must never look like a suite that passed. */
function countPasses(output) {
  const pass = /^# pass (\d+)$/m.exec(output);
  const fail = /^# fail (\d+)$/m.exec(output);
  if (!pass || !fail) return null;
  return { pass: Number(pass[1]), fail: Number(fail[1]) };
}

function run(suite) {
  const result = spawnSync(suite.argv[0], suite.argv.slice(1), { encoding: "utf8", shell: false });
  if (result.error) return { error: `could not launch: ${result.error.message}` };
  const counted = countPasses(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (!counted) return { error: "produced no TAP summary, so nothing was counted" };
  if (counted.fail > 0) return { error: `${counted.fail} failing test(s)` , ...counted };
  return counted;
}

const checkOnly = process.argv.includes("--check");

let floor = { unit: 0, productionHttp: 0, selfHostParity: 0 };
try {
  floor = { ...floor, ...JSON.parse(readFileSync(FILE, "utf8")) };
} catch {
  if (checkOnly) {
    console.error(`verification-floor: ${FILE} is missing. Run \`npm run floor\`.`);
    process.exit(2);
  }
}

const observed = {};
let blocked = false;
for (const suite of SUITES) {
  const result = run(suite);
  if (result.error) {
    console.error(`verification-floor: ${suite.label} ${result.error}. Nothing is recorded from a run that did not pass.`);
    blocked = true;
    continue;
  }
  observed[suite.key] = result.pass;
  console.log(`verification-floor: ${suite.label} ${result.pass} pass, 0 fail (floor ${floor[suite.key]}).`);
}
if (blocked) process.exit(1);

const dropped = SUITES.filter((suite) => observed[suite.key] < floor[suite.key]);
if (dropped.length > 0) {
  for (const suite of dropped) {
    console.error(`verification-floor: ${suite.label} fell from ${floor[suite.key]} to ${observed[suite.key]}.`);
  }
  console.error("verification-floor: a count going down is a regression, not a cleanup. Restore the tests or say plainly which were removed and why.");
  process.exit(1);
}

const raised = SUITES.filter((suite) => observed[suite.key] > floor[suite.key]);

if (checkOnly) {
  if (raised.length > 0) {
    console.error(`verification-floor: ${FILE} is behind. Run \`npm run floor\` and commit the result.`);
    process.exit(1);
  }
  console.log("verification-floor: OK — no count went down.");
  process.exit(0);
}

writeFileSync(FILE, `${JSON.stringify({ ...floor, ...observed }, null, 2)}\n`);
console.log(
  raised.length > 0
    ? `verification-floor: raised ${raised.map((suite) => suite.label).join(", ")} in ${FILE}.`
    : `verification-floor: unchanged; ${FILE} already matches.`,
);
