import test from "node:test";
import assert from "node:assert/strict";
import { liveNotesDue, LIVE_NOTES_INTERVAL_MS } from "../src/lib/recording/live-notes";
const input = {enabled:true,online:true,visible:true,working:false,failed:false,revision:"revision-b",savedRevision:"revision-a",lastRevision:null,hasText:true,now:120_000,lastAttemptAt:null};
test("live notes require explicit consent, visible online tab, text and no in-flight/failing request",()=>{
  assert.equal(liveNotesDue(input),true);
  for (const patch of [{enabled:false},{online:false},{visible:false},{working:true},{failed:true},{hasText:false},{revision:null}]) assert.equal(liveNotesDue({...input,...patch}),false);
});
test("live notes never repay for unchanged or saved revisions and enforce minute interval",()=>{
  assert.equal(liveNotesDue({...input,lastRevision:input.revision}),false);
  assert.equal(liveNotesDue({...input,savedRevision:input.revision}),false);
  assert.equal(liveNotesDue({...input,lastAttemptAt:input.now-LIVE_NOTES_INTERVAL_MS+1}),false);
  assert.equal(liveNotesDue({...input,lastAttemptAt:input.now-LIVE_NOTES_INTERVAL_MS}),true);
  assert.equal(liveNotesDue({...input,lastAttemptAt:input.now+1}),false);
});
