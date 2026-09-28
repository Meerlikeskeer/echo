import test from "node:test";
import assert from "node:assert/strict";
import { libraryRecording, readPreference, savePreference } from "../src/lib/recording/library";
import type { QueueEntry } from "../src/lib/recording/queue";

function clip(endMs = 60_000): QueueEntry {
  return { audio: new Blob(["test"]), metadata: { sessionId: "session-a", id: "chunk-a", sequence: 0, startMs: 0, endMs, overlapMs: 0, mimeType: "audio/webm", size: 4, checksum: "a".repeat(64) }, state: "processed", attempts: 1, nextAttemptAt: 0,
    result: { transcript: { text: "An idea for tomorrow. More detail.", segments: [], durationMs: endMs, language: "en" }, notes: { title: "Idea", summary: "Summary", keyPoints: [], actionItems: [] }, disclosures: [] } };
}
function storage() {
  const rows = new Map<string,string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key,value); } };
}
test("automatic quick-note boundary uses complete timeline, not clip count or processing success", () => {
  for (const [duration, expected] of [[60_000,"quick-note"], [60_001,"session"]] as const) {
    const row = clip(duration);
    assert.equal(libraryRecording("session-a",[row],[row],[{sessionId:"session-a",chunks:[row.metadata]}]).kind,expected);
    assert.equal(libraryRecording("session-a",[row],[row],[]).kind,"session");
  }
});
test("overlapping chunks use the end of the timeline rather than double-counting audio", () => {
  const a = clip(40_000), b = { ...clip(), metadata: { ...clip().metadata, id:"chunk-b", sequence:1, startMs:35_000, overlapMs:5_000 } };
  const item = libraryRecording("session-a",[b,a],[b,a],[{sessionId:"session-a",chunks:[a.metadata,b.metadata]}]);
  assert.equal(item.duration,60_000); assert.equal(item.kind,"quick-note"); assert.equal(item.complete,true);
});
test("missing or mismatched audio and duplicate completion evidence never imply complete capture", () => {
  const row = clip();
  const manifest = {sessionId:"session-a",chunks:[row.metadata]};
  assert.equal(libraryRecording("session-a",[],[],[manifest]).complete,false);
  assert.equal(libraryRecording("session-a",[row],[row],[manifest,manifest]).kind,"session");
  assert.equal(libraryRecording("session-a",[row],[row],[{...manifest,chunks:[{...row.metadata,checksum:"b".repeat(64)}]}]).complete,false);
});
test("renames survive reload and overrides do not rewrite capture metadata", () => {
  const disk=storage(), row=clip();
  savePreference(disk,"session-a",{title:"  Biology review  "});
  savePreference(disk,"session-a",{kind:"session"});
  const preference=readPreference(disk,"session-a");
  assert.deepEqual(preference,{title:"Biology review",kind:"session"});
  const item=libraryRecording("session-a",[row],[row],[{sessionId:"session-a",chunks:[row.metadata]}],preference);
  assert.equal(item.title,"Biology review"); assert.equal(item.kind,"session"); assert.equal(item.automatic,"quick-note");
  savePreference(disk,"session-a",{kind:undefined});
  assert.deepEqual(readPreference(disk,"session-a"),{title:"Biology review"});
  assert.equal(row.metadata.quickNote,undefined);
});
test("recording preferences isolate sessions and preserve the other edited field", () => {
  const disk=storage();
  savePreference(disk,"a",{title:"First"}); savePreference(disk,"b",{title:"Second"});
  savePreference(disk,"a",{kind:"quick-note"}); savePreference(disk,"a",{title:"Renamed"});
  assert.deepEqual(readPreference(disk,"a"),{title:"Renamed",kind:"quick-note"});
  assert.deepEqual(readPreference(disk,"b"),{title:"Second"});
});
test("invalid preferences and blocked storage surface errors instead of claiming a saved rename", () => {
  const disk=storage();
  assert.throws(()=>savePreference(disk,"a",{title:" "}));
  assert.throws(()=>savePreference(disk,"a",{title:"x".repeat(101)}));
  assert.throws(()=>savePreference({getItem:()=>null,setItem:()=>{throw Error("quota");}},"a",{title:"Name"}),/quota/);
  disk.setItem("echo-library-v1/a",'{"kind":"invented"}');
  assert.throws(()=>readPreference(disk,"a"));
});
test("library keeps pending, blocked and unsaved audio distinct", () => {
  const row=clip(); row.state="blocked";
  const item=libraryRecording("session-a",[row],[row],[]);
  assert.equal(item.pending,1); assert.equal(item.blocked,true); assert.equal(item.unsaved,false);
  assert.equal(libraryRecording("session-a",[row],[],[]).unsaved,true);
  assert.equal(item.title,"An idea for tomorrow");
});

test("malformed completion recovery cannot crash history or confirm capture", () => {
  const row=clip();
  const broken=[null,{sessionId:"session-a",chunks:null}] as unknown as import("../src/lib/recording/session-completion").Completion[];
  assert.equal(libraryRecording("session-a",[row],[row],broken).complete,false);
  row.result!.transcript.text="...";
  assert.match(libraryRecording("session-a",[row],[row],broken).title,/Untitled Echo/);
});
