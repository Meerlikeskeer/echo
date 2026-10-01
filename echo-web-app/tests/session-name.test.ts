import test from "node:test";
import assert from "node:assert/strict";
import { reserveSessionNumber, sessionName } from "../src/lib/recording/session-name";
import { libraryRecording } from "../src/lib/recording/library";

test("capture names keep the original date and number through import and prefer manual names", () => {
  const id = "session-1790888400000-12-abcdef01";
  assert.match(sessionName(id), /2026 · .* · Session 12$/);
  assert.equal(libraryRecording(id, [], [], [], { generatedTitle: "Random AI title" }).title, sessionName(id));
  assert.equal(libraryRecording(id, [], [], [], { title: "My meeting" }).title, "My meeting");
  assert.equal(sessionName("session-undated-13-abcdef01"), "Date unavailable · Session 13");
  assert.equal(sessionName("session-old", 8), "Date unavailable · Session 8");
  assert.equal(sessionName("session-1000000000000-12-abcdef01"), "Date unavailable · Session 12");
});
test("session numbers persist, reserve before use and refuse corrupted or failed storage", () => {
  const rows = new Map<string, string>();
  const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
  assert.equal(reserveSessionNumber(storage), 1);
  assert.equal(reserveSessionNumber(storage), 2);
  rows.set("echo-session-number-v1", "broken");
  assert.throws(() => reserveSessionNumber(storage));
  assert.throws(() => reserveSessionNumber({ getItem: () => null, setItem: () => { throw Error("quota"); } }), /quota/);
});
