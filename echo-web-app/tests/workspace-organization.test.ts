import test from "node:test";
import assert from "node:assert/strict";
import { automaticGroup, addGroup } from "../src/lib/recording/groups";
import { libraryRecording, savePreference, readPreference } from "../src/lib/recording/library";
import { withLibraryDeletion } from "../src/lib/recording/delete-session";
import { notesPrintDocument } from "../src/lib/recording/notes-print";
import type { ArtifactRecord } from "../src/lib/recording/artifacts";
test("groups require distinct clues and refuse ambiguous classification", () => {
  assert.equal(automaticGroup("A lecture with homework"), "Class");
  assert.equal(automaticGroup("lecture lecture lecture"), null);
  assert.equal(automaticGroup("lecture homework sprint stakeholder"), null);
  assert.equal(automaticGroup("birthday family"), "People");
  assert.equal(automaticGroup("discuss perspective"), "Discussion");
  assert.equal(automaticGroup("no clues"), null);
});
test("custom groups and explicit ungrouped survive reload; auto can be restored", () => {
  const rows = new Map<string, string>();
  const storage = {getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }};
  assert.ok(addGroup(storage, "Physics 7A").includes("Physics 7A"));
  assert.equal(addGroup(storage, "physics 7a").filter(name => /physics/i.test(name)).length, 1);
  assert.throws(() => addGroup(storage, " "));
  savePreference(storage, "a", {group: "Physics 7A"});
  assert.equal(libraryRecording("a", [], [], [], readPreference(storage,"a")).group, "Physics 7A");
  savePreference(storage,"a",{group:null});
  assert.deepEqual(readPreference(storage,"a"),{group:null});
  savePreference(storage,"a",{group:undefined});
  assert.deepEqual(readPreference(storage,"a"),{});
});
test("deletion cannot run when any capture/import/drain lock is unavailable", async () => {
  for (const blocked of ["echo-capture", "echo-device-import", "echo-audio-queue-drain"]) {
    let ran = false;
    const locks = { request: async (name: string, _options: unknown, callback: (lock: unknown) => unknown) => callback(name === blocked ? null : {}) } as unknown as LockManager;
    await assert.rejects(withLibraryDeletion(locks, async () => { ran = true; }), /Another Echo tab/);
    assert.equal(ran, false);
  }
  const names: string[] = [];
  const locks = { request: async (name: string, _options: unknown, callback: (lock: unknown) => unknown) => { names.push(name); return callback({}); } } as unknown as LockManager;
  assert.equal(await withLibraryDeletion(locks, async () => "deleted"), "deleted");
  assert.deepEqual(names,["echo-capture", "echo-device-import", "echo-audio-queue-drain"]);
});
test("PDF print document includes all guide sections, disclosure and escaped untrusted content", () => {
  const record: ArtifactRecord = {sessionId:"session-a", transcriptRevision:"a".repeat(64), generation:1, artifacts:{title:"<script>alert(1)</script>",course:"Physics",summary:"Résumé α",keyPoints:["A & B"],outline:[{heading:"Lesson",notes:["Detail"]}],terms:[{term:"Force",definition:"Definition"}],openQuestions:["Question"],actionItems:["Action"],researchTopics:["Topic"]}};
  const html = notesPrintDocument(record,"Partial, outdated notes");
  assert.ok(!html.includes("<script>"));
  for (const text of ["&lt;script&gt;", "Résumé α", "A &amp; B", "Lesson", "Detail", "Force", "Definition", "Question", "Action", "Topic", "Partial, outdated notes", "Save as PDF"]) assert.ok(html.includes(text));
});
