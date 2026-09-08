import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_BUDGET, CAPACITY_RESERVE, drainQueue, incompleteSessions, normalizeMime, orderEntries, retryDelay, sameChunk, storageFailure, UploadFailure, verifyChunk, type QueueEntry, type QueueStore } from "../src/lib/recording/queue";
import { checksum } from "../src/lib/recording/session";
import type { RecordingResult } from "../src/lib/recording/pipeline";

const result: RecordingResult = { transcript: { text: "Synthetic", segments: [], language: "en", durationMs: 6000 }, notes: { title: "Synthetic", summary: "Synthetic", keyPoints: [], actionItems: [] }, disclosures: [] };
async function entry(sequence = 0): Promise<QueueEntry> {
  const audio = new Blob(["synthetic-audio"], { type: "audio/webm; codecs=opus" });
  return { audio, metadata: { id: `chunk-${sequence}`, sessionId: "session", sequence, startMs: sequence * 5000, endMs: sequence * 5000 + 6000, overlapMs: sequence ? 1000 : 0, mimeType: "audio/webm;codecs=opus", size: audio.size, checksum: await checksum(audio) }, state: "pending", attempts: 0, nextAttemptAt: 0 };
}
function memory(rows: QueueEntry[]): QueueStore {
  return { async offer() { throw new Error("not used"); }, async list() { return orderEntries(structuredClone(rows)); }, async update(row) { rows[rows.findIndex((item) => item.metadata.id === row.metadata.id)] = structuredClone(row); } };
}
const options = { online: () => true, now: () => 1000 };

test("queue verifies bytes and normalizes Safari MIME spacing", async () => {
  await verifyChunk(await entry());
  assert.equal(normalizeMime("Audio/WebM; codecs=opus"), "audio/webm;codecs=opus");
});
test("queue rejects corrupted bytes, size and MIME before upload", async () => {
  const row = await entry();
  for (const changed of [{ ...row, audio: new Blob(["changed"]) }, { ...row, metadata: { ...row.metadata, size: 1 } }, { ...row, metadata: { ...row.metadata, mimeType: "audio/mp4" } }]) await assert.rejects(verifyChunk(changed));
});
test("duplicate identity compares all metadata, allowing only MIME whitespace normalization", async () => {
  const row = await entry();
  assert.ok(sameChunk(row, { ...row, metadata: { ...row.metadata, mimeType: row.audio.type } }));
  for (const patch of [{ sequence: 1 }, { endMs: 7000 }, { checksum: "0".repeat(64) }, { id: "other" }]) assert.equal(sameChunk(row, { ...row, metadata: { ...row.metadata, ...patch } }), false);
});
test("out-of-order recovery sorts sequence and surfaces missing chunks", async () => {
  const rows = await Promise.all([2, 0, 1].map(entry));
  assert.deepEqual(orderEntries(rows).map((row) => row.metadata.sequence), [0, 1, 2]);
  assert.deepEqual(incompleteSessions(rows), []);
  assert.deepEqual(incompleteSessions(rows.slice(1)), ["session"]);
});
test("disconnect leaves pending data untouched; reconnect processes in order", async () => {
  const rows = await Promise.all([1, 0].map(entry)), store = memory(rows), sent: number[] = [];
  const send = async (row: QueueEntry | Parameters<QueueStore["offer"]>[0]) => { sent.push(row.metadata.sequence); return result; };
  await drainQueue(store, send, { ...options, online: () => false });
  assert.deepEqual(sent, []);
  await drainQueue(store, send, options);
  assert.deepEqual(sent, [0, 1]);
  assert.ok(rows.every((row) => row.state === "processed" && row.audio.size > 0));
});
test("reloaded processed result skips HTTP and preserves the sole audio copy", async () => {
  const rows = [await entry()];
  await drainQueue(memory(rows), async () => result, options);
  await drainQueue(memory(rows), async () => { throw new Error("must not send twice"); }, { ...options, force: true });
  assert.deepEqual(rows[0].result, result);
  assert.equal(await rows[0].audio.text(), "synthetic-audio");
});
test("write failing before request stops upload", async () => {
  const store = memory([await entry()]);
  store.update = async () => { throw new DOMException("full", "QuotaExceededError"); };
  let requests = 0;
  await assert.rejects(drainQueue(store, async () => { requests++; return result; }, options));
  assert.equal(requests, 0);
});
test("network failure persists attempts and backoff across reload", async () => {
  const rows = [await entry()];
  await drainQueue(memory(rows), async () => { throw new Error("private error must not persist"); }, options);
  assert.equal(rows[0].attempts, 1); assert.equal(rows[0].nextAttemptAt, 2000);
  assert.equal(rows[0].state, "pending"); assert.doesNotMatch(rows[0].error!, /private/);
  let sends = 0;
  await drainQueue(memory(rows), async () => { sends++; return result; }, options);
  assert.equal(sends, 0);
  await drainQueue(memory(rows), async () => { sends++; return result; }, { ...options, now: () => 2000 });
  assert.equal(sends, 1); assert.equal(rows[0].attempts, 2);
});
test("nonretryable failures wait for deliberate retry", async () => {
  const rows = [await entry()];
  await drainQueue(memory(rows), async () => { throw new UploadFailure(false); }, options);
  assert.equal(rows[0].state, "blocked");
  let sends = 0;
  await drainQueue(memory(rows), async () => { sends++; return result; }, { ...options, now: () => 999999 });
  assert.equal(sends, 0);
  await drainQueue(memory(rows), async () => { sends++; return result; }, { ...options, force: true });
  assert.equal(sends, 1);
});
test("failure saving successful response leaves raw audio and pending identity recoverable", async () => {
  const rows = [await entry()], store = memory(rows), original = store.update;
  store.update = async (row) => { if (row.state === "processed") throw new Error("disk write failed"); await original(row); };
  await assert.rejects(drainQueue(store, async () => result, options));
  assert.equal(rows[0].state, "pending"); assert.equal(rows[0].metadata.id, "chunk-0");
  assert.equal(await rows[0].audio.text(), "synthetic-audio");
});
test("background/capture suspension stops draining between requests", async () => {
  const rows = await Promise.all([0, 1].map(entry)); let active = true;
  await drainQueue(memory(rows), async () => { active = false; return result; }, { ...options, active: () => active });
  assert.equal(rows[0].state, "processed"); assert.equal(rows[1].state, "pending");
});
test("retry delay is bounded and quota reserve covers Safari bitrate with headroom", () => {
  assert.equal(retryDelay(1), 1000); assert.equal(retryDelay(100), 60000);
  assert.ok(CAPACITY_RESERVE > 204000 / 8 * 120 * 1.2);
  assert.ok(AUDIO_BUDGET > CAPACITY_RESERVE);
  assert.match(storageFailure(new DOMException("full", "QuotaExceededError")), /Storage is full/);
  assert.match(storageFailure(new Error("secret")), /Local saving failed/);
});
