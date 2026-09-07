import assert from "node:assert/strict";
import { test } from "node:test";
import { captureSession, type CaptureRuntime } from "../src/lib/recording/capture";
import { checksum, isAudioChunk, validateCaptureOptions, validateChunkOrder } from "../src/lib/recording/session";

function harness(overlapMs = 1000, stopThrows = false) {
  let now = 0;
  let released = 0;
  let counter = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const recorders: MediaRecorder[] = [];
  const io: CaptureRuntime = {
    now: () => now,
    schedule(callback, delay) { const id = ++counter; timers.set(id, { at: now + delay, callback }); return id as unknown as ReturnType<typeof setTimeout>; },
    cancel(timer) { timers.delete(timer as unknown as number); },
    create() {
      const index = recorders.length;
      const recorder = {
        mimeType: "audio/webm;codecs=opus", state: "inactive", ondataavailable: null, onstop: null, onerror: null,
        start() { this.state = "recording"; },
        stop() {
          if (stopThrows) throw new Error("synthetic failure");
          this.state = "inactive";
          this.ondataavailable?.call(this, { data: new Blob([`complete-container-${index}`]) } as BlobEvent);
          this.onstop?.call(this, new Event("stop"));
        },
      } as MediaRecorder;
      recorders.push(recorder);
      return recorder;
    },
  };
  const stream = { getTracks: () => [{ stop() { released++; } }] } as unknown as MediaStream;
  const capture = captureSession(stream, { chunkMs: 30000, overlapMs }, io);
  return { capture, recorders, released: () => released, advance(target: number) {
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = target;
  } };
}

test("overlap capture owns separate containers and ordered checksummed session metadata", async () => {
  const h = harness(); h.advance(45000);
  const result = await h.capture.stop();
  assert.equal(result.session.captureStatus, "stopped");
  assert.equal(h.released(), 1);
  assert.deepEqual(result.chunks.map((c) => [c.metadata.sequence, c.metadata.startMs, c.metadata.endMs, c.metadata.overlapMs]), [[0, 0, 30000, 0], [1, 29000, 45000, 1000]]);
  assert.equal(await result.chunks[1].audio.text(), "complete-container-1");
  assert.equal(result.chunks[1].metadata.checksum, await checksum(result.chunks[1].audio));
  assert.equal(result.chunks[1].metadata.mimeType, "audio/webm;codecs=opus");
  validateChunkOrder(result.chunks.map((c) => c.metadata));
});
test("stop during overlap retains a fully overlapped final chunk", async () => {
  const h = harness(); h.advance(29500);
  const result = await h.capture.stop();
  assert.equal(result.session.captureStatus, "stopped");
  assert.equal(result.chunks[1].metadata.overlapMs, 500);
});
test("zero overlap starts a new recorder at the previous boundary", async () => {
  const h = harness(0); h.advance(45000);
  const result = await h.capture.stop();
  assert.equal(result.chunks[1].metadata.startMs, 30000);
  assert.equal(result.chunks[1].metadata.overlapMs, 0);
});
test("repeated stop returns the same result and cancels future capture", async () => {
  const h = harness(); h.advance(5000);
  const first = h.capture.stop();
  assert.equal(first, h.capture.stop());
  h.advance(120000);
  assert.equal((await first).chunks.length, 1);
  assert.equal(h.recorders.length, 1);
});
test("thrown recorder stop settles as failed instead of hanging", async () => {
  const h = harness(1000, true); h.advance(5000);
  assert.equal((await h.capture.stop()).session.captureStatus, "failed");
});
test("recorder error ends capture and notifies the consumer", async () => {
  const h = harness(); h.advance(5000);
  h.recorders[0].onerror?.call(h.recorders[0], new Event("error"));
  assert.equal((await h.capture.finished).session.captureStatus, "failed");
  assert.equal(h.released(), 1);
});
test("invalid options fail before opening a recorder", () => {
  for (const overlapMs of [-1, 15000, NaN, 1.5]) assert.throws(() => validateCaptureOptions({ chunkMs: 30000, overlapMs }));
});
test("unexpected recorder stop reports incomplete capture immediately", async () => {
  const h = harness(); h.advance(5000);
  h.recorders[0].stop();
  assert.equal((await h.capture.finished).session.captureStatus, "failed");
});
test("metadata validation detects missing sequence, gap, altered overlap and invalid checksum", async () => {
  const h = harness(); h.advance(45000);
  const chunks = (await h.capture.stop()).chunks.map((c) => c.metadata);
  for (const change of [{ sequence: 2 }, { startMs: 31000 }, { overlapMs: 0 }, { checksum: "bad" }, { id: chunks[0].id }]) {
    assert.throws(() => validateChunkOrder([chunks[0], { ...chunks[1], ...change }]));
  }
  assert.equal(isAudioChunk({ ...chunks[0], startMs: NaN }), false);
  assert.notEqual(await checksum(new Blob(["a"])), await checksum(new Blob(["b"])));
});
