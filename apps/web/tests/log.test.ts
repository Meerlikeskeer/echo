import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCause, reportFailure } from "../src/lib/recording/log";

/** Captures what reportFailure writes, so the assertions are about the real
 *  console call rather than a stand-in the application never uses. */
function captured(run: () => void): { line: string; passed: unknown } {
  const original = console.error;
  let line = "";
  let passed: unknown;
  console.error = (message: unknown, error: unknown) => { line = String(message); passed = error; };
  try { run(); } finally { console.error = original; }
  return { line, passed };
}

test("a failure names where it happened and what the error was", () => {
  const cause = new DOMException("The quota has been exceeded.", "QuotaExceededError");
  const { line, passed } = captured(() => reportFailure("saving a recorded clip", cause));
  assert.match(line, /saving a recorded clip failed/);
  assert.match(line, /QuotaExceededError: The quota has been exceeded\./);
  // The error itself is passed through so the console keeps its stack expandable.
  assert.equal(passed, cause);
});

test("an error with no message is still identified by its name", () => {
  assert.equal(describeCause(new DOMException("", "AbortError")), "AbortError");
  assert.equal(describeCause(new Error("   ")), "Error");
});

test("a thrown non-error is named by its type and never stringified", () => {
  // A rejected IndexedDB request or application code can throw an object, and
  // that object could be a chunk carrying audio. Its contents must not be logged.
  const chunk = { audio: new Blob(["synthetic-audio"]), transcript: "spoken words" };
  const described = describeCause(chunk);
  assert.equal(described, "Non-error value of type object");
  assert.doesNotMatch(described, /spoken words/);
  assert.equal(describeCause(null), "Non-error value of type null");
  assert.equal(describeCause(undefined), "Non-error value of type undefined");
});

test("a thrown string is reported, and an empty one is still distinguishable", () => {
  assert.equal(describeCause("database is closing"), "database is closing");
  assert.equal(describeCause("   "), "Empty string thrown");
});
