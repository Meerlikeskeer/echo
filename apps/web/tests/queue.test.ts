import assert from "node:assert/strict";
import { test } from "node:test";
import { AUDIO_BUDGET, CAPACITY_RESERVE, EXHAUSTED, MAX_ATTEMPTS, preserveAudio, processingUpdate, recoverEntries, sendChunk, drainQueue, incompleteSessions, normalizeMime, orderEntries, resolveFailure, retryDelay, sameChunk, StorageBlockedError, storageFailure, summarizeQueue, UploadFailure, verifyChunk, type QueueEntry, type QueueStore } from "../src/lib/recording/queue";
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
  // ADR-016 changed what is on disk at this instant: the request was in flight,
  // so the row says `uploading` — outcome unknown — and recovery on the next
  // load is what returns it to `pending`. Before ADR-016 no such state existed
  // and the row was left `pending` here.
  assert.equal(rows[0].state, "uploading"); assert.equal(rows[0].metadata.id, "chunk-0");
  assert.equal(recoverEntries(rows)[0].state, "pending");
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

// WEB-015. One sentence used to serve all three situations and was false in two
// of them: it asserted recording had stopped when it may never have started, and
// told the owner to rescue unsaved clips when there were none. That advice sent a
// session to clear site data, which destroys saved audio.
test("a storage failure only claims recording stopped when recording actually stopped", () => {
  const unknown = new Error("secret");
  // capture.ts stops the recorder when the persist callback throws, so this one
  // is true and must not change.
  assert.match(storageFailure(unknown, "capture"), /Recording stopped/);
  for (const situation of ["starting", "maintenance"] as const) {
    assert.doesNotMatch(storageFailure(unknown, situation), /Recording stopped/);
    assert.doesNotMatch(storageFailure(unknown, situation), /download unsaved clips/);
    assert.match(storageFailure(unknown, situation), /retained|nothing has been deleted/);
  }
  assert.match(storageFailure(unknown, "starting"), /did not start/);
});
test("an unrecognised storage failure points at the console instead of ending the trail", () => {
  for (const situation of ["starting", "maintenance"] as const) {
    assert.match(storageFailure(new Error("secret"), situation), /browser console/);
  }
});
test("a storage failure never leaks the error's own text onto the page", () => {
  // The message can carry a key name or a path, and this string is rendered.
  for (const situation of ["capture", "starting", "maintenance"] as const) {
    assert.doesNotMatch(storageFailure(new Error("secret"), situation), /secret/);
    assert.doesNotMatch(storageFailure(new DOMException("secret", "QuotaExceededError"), situation), /secret/);
  }
});
test("the blocked-upgrade remedy survives every situation, because closing a tab is the fix", () => {
  const blocked = new StorageBlockedError();
  for (const situation of ["capture", "starting", "maintenance"] as const) {
    assert.match(storageFailure(blocked, situation), /Close other Echo tabs/);
  }
});
// WEB-015. The banner used to be cleared only by a successful prepare(), which
// runs only when Record is pressed, so a chunk that failed once and saved on
// retry left "Recording stopped" up beside a queue showing nothing unsaved.
test("a storage warning is withdrawn once nothing is left unsaved", () => {
  assert.equal(resolveFailure("Local saving failed. Recording stopped.", 0), null);
  assert.equal(resolveFailure(null, 0), null);
});
test("a storage warning is held while a clip is still unsaved", () => {
  const warning = "Local saving failed. Recording stopped.";
  assert.equal(resolveFailure(warning, 1), warning);
  assert.equal(resolveFailure(warning, 3), warning);
});

test("queue refresh preserves playback Blob identity while updating processing state", async () => {
  const row = await entry();
  const fresh = structuredClone(row); fresh.state = "processed";
  const refreshed = preserveAudio([row], [fresh]);
  assert.equal(refreshed[0].audio, row.audio);
  assert.equal(refreshed[0].state, "processed");
});
test("HTTP retry classification honors permanent provider failure even with 502", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { retryable: false } }), { status: 502 });
    await assert.rejects(sendChunk(await entry()), (error: unknown) => error instanceof UploadFailure && !error.retryable);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(sendChunk(await entry()), (error: unknown) => error instanceof UploadFailure && error.retryable);
  } finally { globalThis.fetch = original; }
});

test("one failing chunk no longer blocks the chunks behind it", async () => {
  const rows = await Promise.all([0, 1, 2].map(entry)), sent: number[] = [];
  await drainQueue(memory(rows), async (row) => {
    sent.push(row.metadata.sequence);
    if (row.metadata.sequence === 0) throw new Error("connection interrupted");
    return result;
  }, options);
  // Before ADR-016 the drain broke at the first failure, so one unlucky chunk
  // stalled the whole session until the next drain.
  assert.deepEqual(sent, [0, 1, 2]);
  assert.deepEqual(rows.map((row) => row.state), ["pending", "processed", "processed"]);
});
test("offline and unmount still stop the drain immediately", async () => {
  const offline = await Promise.all([0, 1, 2].map(entry)), tried: number[] = [];
  let reachable = true;
  await drainQueue(memory(offline), async (row) => { tried.push(row.metadata.sequence); reachable = false; throw new Error("connection lost"); }, { ...options, online: () => reachable });
  assert.deepEqual(tried, [0]);
  const unmounted = await Promise.all([0, 1, 2].map(entry)), attempted: number[] = [];
  let mounted = true;
  await drainQueue(memory(unmounted), async (row) => { attempted.push(row.metadata.sequence); mounted = false; throw new Error("page closed"); }, { ...options, active: () => mounted });
  assert.deepEqual(attempted, [0]);
});
test("retry is bounded: an entry blocks with a readable reason and force retries it", async () => {
  const rows = [await entry()], store = memory(rows);
  // A clock that steps past each backoff, so the bound is what stops this and
  // not the schedule.
  let clock = 1000;
  const later = { ...options, now: () => clock };
  let sends = 0;
  for (let pass = 0; pass < MAX_ATTEMPTS; pass++) {
    await drainQueue(store, async () => { sends++; throw new Error("server unavailable"); }, later);
    clock += 120_000;
  }
  assert.equal(sends, MAX_ATTEMPTS);
  assert.equal(rows[0].attempts, MAX_ATTEMPTS);
  assert.equal(rows[0].state, "blocked");
  assert.equal(rows[0].error, EXHAUSTED);
  assert.match(rows[0].error!, /still saved on this browser/);
  await drainQueue(store, async () => { sends++; return result; }, later);
  assert.equal(sends, MAX_ATTEMPTS, "a blocked entry is not retried on its own");
  await drainQueue(store, async () => { sends++; return result; }, { ...later, force: true });
  assert.equal(sends, MAX_ATTEMPTS + 1);
  assert.equal(rows[0].state, "processed");
});
test("a row left uploading is re-attempted by the next drain, not stranded", async () => {
  const rows = [{ ...await entry(), state: "uploading" as const, attempts: 1, nextAttemptAt: 2000 }];
  const store = memory(rows);
  let sends = 0;
  // The drain must not treat "in flight, outcome unknown" as "already handled".
  // A plausible hardening — skip anything marked uploading so it is never sent
  // twice — would strand this chunk forever, and nothing else in this file
  // would notice. Its own backoff still applies.
  await drainQueue(store, async () => { sends++; return result; }, options);
  assert.equal(sends, 0, "backoff still applies to a recovered in-flight row");
  await drainQueue(store, async () => { sends++; return result; }, { ...options, now: () => 2000 });
  assert.equal(sends, 1);
  assert.equal(rows[0].state, "processed");
  assert.equal(rows[0].attempts, 2);
  assert.equal(await rows[0].audio.text(), "synthetic-audio");
});
test("uploading is on disk before the request goes out", async () => {
  const rows = [await entry()], store = memory(rows);
  let observed: QueueEntry["state"] | null = null;
  await drainQueue(store, async () => { observed = rows[0].state; return result; }, options);
  // A page that dies here must be recoverable as "in flight, outcome unknown",
  // which is impossible if the state only ever existed in memory.
  assert.equal(observed, "uploading");
  assert.equal(rows[0].state, "processed");
});
test("recovery returns a stale uploading entry to pending and never touches a processed one", async () => {
  const [stale, done, blocked] = await Promise.all([0, 1, 2].map(entry));
  const recovered = recoverEntries([
    { ...stale, state: "uploading", attempts: 3, nextAttemptAt: 5000, error: "Server unavailable; retry scheduled." },
    { ...done, state: "processed", result },
    { ...blocked, state: "blocked", attempts: MAX_ATTEMPTS, error: EXHAUSTED },
  ]);
  assert.deepEqual(recovered.map((row) => row.state), ["pending", "processed", "blocked"]);
  // The attempt really was made, so its count and backoff survive the reload.
  assert.equal(recovered[0].attempts, 3);
  assert.equal(recovered[0].nextAttemptAt, 5000);
  assert.deepEqual(recovered[1].result, result);
});
test("a processing update can never replace or remove the raw audio", async () => {
  const previous = await entry();
  const hostile = { ...await entry(), audio: new Blob(["replaced"]), state: "processed" as const, result };
  const merged = processingUpdate(previous, hostile);
  assert.equal(merged.audio, previous.audio);
  assert.equal(await merged.audio.text(), "synthetic-audio");
  assert.deepEqual(merged.metadata, previous.metadata);
  assert.equal(merged.state, "processed");
});
test("chunks arriving out of sequence each keep their own identity and result", async () => {
  const [first, second, third] = await Promise.all([0, 1, 2].map(entry));
  const transcript = (id: string): RecordingResult => ({ ...result, transcript: { ...result.transcript, text: id } });
  const send = async (row: { metadata: { id: string } }) => transcript(row.metadata.id);
  // Chunk 2 completed and was persisted before 0 and 1 ever arrived.
  const rows: QueueEntry[] = [third];
  await drainQueue(memory(rows), send, options);
  rows.push(first, second);
  let sends = 0;
  await drainQueue(memory(rows), async (row) => { sends++; return send(row); }, options);
  assert.equal(sends, 2, "the already processed chunk must not be sent again");
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.state, "processed");
    assert.equal(row.result?.transcript.text, row.metadata.id);
  }
  assert.deepEqual(orderEntries(rows).map((row) => row.metadata.sequence), [0, 1, 2]);
});
test("a chunk whose first send fails recovers to exactly one entry and one result", async () => {
  const rows = [await entry()], store = memory(rows);
  let sends = 0;
  await drainQueue(store, async () => { sends++; throw new Error("connection interrupted"); }, options);
  await drainQueue(store, async () => { sends++; return result; }, { ...options, now: () => 2000 });
  assert.equal(sends, 2);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, "processed");
  assert.deepEqual(rows[0].result, result);
  assert.equal(rows[0].error, undefined);
  assert.equal(await rows[0].audio.text(), "synthetic-audio");
});
test("queue progress separates transcribed, uploading, waiting, retrying and blocked", async () => {
  const rows = await Promise.all([0, 1, 2, 3, 4].map(entry));
  const progress = summarizeQueue([
    { ...rows[0], state: "processed", result },
    { ...rows[1], state: "uploading", attempts: 1 },
    { ...rows[2] },
    { ...rows[3], state: "pending", attempts: 2, error: "Server unavailable; retry scheduled." },
    { ...rows[4], state: "blocked", attempts: MAX_ATTEMPTS, error: EXHAUSTED },
  ]);
  assert.deepEqual(progress, { total: 5, transcribed: 1, uploading: 1, waiting: 1, retrying: 1, blocked: 1 });
  assert.deepEqual(summarizeQueue([]), { total: 0, transcribed: 0, uploading: 0, waiting: 0, retrying: 0, blocked: 0 });
});
