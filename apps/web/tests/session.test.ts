import assert from "node:assert/strict";
import { test } from "node:test";
import { captureSession, PREFERRED_MIME_TYPES, type CaptureRuntime } from "../src/lib/recording/capture";
import { checksum, isAudioChunk, MAX_CHUNK_MS, safeChunkMs, validateCaptureOptions, validateChunkOrder } from "../src/lib/recording/session";

type FakeRecorder = {
  mimeType: string;
  state: RecordingState;
  ondataavailable: ((this: FakeRecorder, event: BlobEvent) => void) | null;
  onstop: ((this: FakeRecorder, event: Event) => void) | null;
  onerror: ((this: FakeRecorder, event: Event) => void) | null;
  start(): void;
  stop(): void;
};

function harness(overlapMs = 1000, stopThrows = false, onChunk?: Parameters<typeof captureSession>[3], quickNote = false) {
  let now = 0;
  let released = 0;
  let counter = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  // The double is typed structurally rather than cast to MediaRecorder: the DOM
  // type declares `state` readonly, so a cast makes the recorder unable to
  // drive its own state, and `onerror` demands an ErrorEvent the test has no
  // reason to construct.
  const recorders: FakeRecorder[] = [];
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
      } satisfies FakeRecorder;
      recorders.push(recorder);
      return recorder as unknown as MediaRecorder;
    },
  };
  const stream = { getTracks: () => [{ stop() { released++; } }] } as unknown as MediaStream;
  const capture = captureSession(stream, { chunkMs: 30000, overlapMs, quickNote }, io, onChunk);
  return { capture, recorders, released: () => released, advance(target: number) {
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    now = target;
  } };
}

test("Quick Note auto-stops one container at 30 seconds and persists stop context", async () => {
  const saved: Parameters<NonNullable<Parameters<typeof captureSession>[3]>>[0][] = [];
  const h = harness(0, false, async chunk => { saved.push(chunk); }, true);
  h.advance(30000);
  const result = await h.capture.finished;
  assert.equal(result.session.captureStatus, "stopped");
  assert.equal(h.recorders.length, 1);
  assert.equal(h.released(), 1);
  assert.equal(result.chunks[0].metadata.endMs, 30000);
  assert.ok(result.chunks[0].metadata.quickNote!.stoppedAt > 0);
  assert.equal(typeof result.chunks[0].metadata.quickNote!.onlineAtStop, "boolean");
  assert.deepEqual(saved[0].metadata, result.chunks[0].metadata);
});

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
// WEB-016. The ceiling moved from one minute to ten, and a lecture depends on
// it: at the old bound the five-minute chunk the recorder now asks for threw
// before the microphone was ever opened.
test("a lecture-length chunk is accepted and anything past the ceiling is not", () => {
  assert.doesNotThrow(() => validateCaptureOptions({ chunkMs: 300_000, overlapMs: 5_000, audioBitsPerSecond: 32_000 }));
  assert.doesNotThrow(() => validateCaptureOptions({ chunkMs: MAX_CHUNK_MS, overlapMs: 10_000 }));
  assert.throws(() => validateCaptureOptions({ chunkMs: MAX_CHUNK_MS + 1, overlapMs: 5_000 }));
  for (const audioBitsPerSecond of [0, 1_000, 400_000, NaN, 32_000.5]) {
    assert.throws(() => validateCaptureOptions({ chunkMs: 300_000, overlapMs: 5_000, audioBitsPerSecond }));
  }
});
// The metadata guard is also the upload boundary's validator, so a five-minute
// chunk has to survive it or every chunk of a lecture is refused as malformed.
test("chunk metadata spanning five minutes is valid, and an implausible span is not", async () => {
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
  const base = {
    sessionId: "s-1", id: "c-1", sequence: 0, startMs: 0, endMs: 300_000, overlapMs: 0,
    mimeType: "audio/webm", size: audio.size, checksum: await checksum(audio),
  };
  assert.equal(isAudioChunk(base), true);
  assert.equal(isAudioChunk({ ...base, endMs: MAX_CHUNK_MS + 60_001 }), false);
});
/**
 * WEB-016. The failure this prevents is silent and total: a browser recording
 * at a higher bitrate than requested builds chunks no upload will ever accept,
 * and only says so five minutes into the lecture, once per chunk, until the end.
 */
test("chunk length is clamped to what the measured bitrate can upload", () => {
  // A browser that honours 32 kbps: a five-minute chunk is ~1.2 MB, so nothing
  // is taken away.
  assert.equal(safeChunkMs(300_000, 32_000, 4_000_000), 300_000);
  // Safari's measured 204 kbps would make that chunk 7.6 MB. The clamp keeps it
  // under the limit with the container margin applied.
  const clamped = safeChunkMs(300_000, 204_000, 4_000_000);
  assert.ok(clamped < 300_000);
  assert.ok((clamped / 1000) * (204_000 / 8) <= 4_000_000);
  // No evidence is not evidence of a problem: the request stands.
  for (const unknown of [undefined, 0, NaN, -1]) assert.equal(safeChunkMs(300_000, unknown, 4_000_000), 300_000);
  // Never clamped into uselessness, whatever the bitrate claims.
  assert.equal(safeChunkMs(300_000, 320_000_000, 4_000_000), 15_000);
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

test("the default browser runtime keeps setTimeout bound to the global", async () => {
  // Browsers throw "TypeError: Illegal invocation" when setTimeout is called
  // with any `this` other than the window. capture.ts once assigned the global
  // straight onto the runtime object, so io.schedule() called it with `this`
  // set to the runtime and capture failed in every real browser — while every
  // test above passed, because they all inject a runtime and never build the
  // default one. Node does not enforce that rule, so this reproduces it.
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realMediaRecorder = (globalThis as Record<string, unknown>).MediaRecorder;
  const boundOnly = (real: (...args: never[]) => unknown) =>
    function (this: unknown, ...args: never[]) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return real(...args);
    };

  class StubRecorder {
    static isTypeSupported = (type: string) => type === PREFERRED_MIME_TYPES[0];
    mimeType = PREFERRED_MIME_TYPES[0];
    state: "inactive" | "recording" = "inactive";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["complete-container"]) });
      this.onstop?.(new Event("stop"));
    }
  }

  const stream = { getTracks: () => [{ stop() {} }] } as unknown as MediaStream;
  try {
    globalThis.setTimeout = boundOnly(realSetTimeout) as typeof globalThis.setTimeout;
    globalThis.clearTimeout = boundOnly(realClearTimeout) as typeof globalThis.clearTimeout;
    (globalThis as Record<string, unknown>).MediaRecorder = StubRecorder;

    // No runtime argument: this is the only test that exercises the real one.
    const capture = captureSession(stream, { chunkMs: 30000, overlapMs: 1000 });
    // Real elapsed time, because this runtime reads performance.now(). A chunk
    // stopped in the same millisecond has zero duration, which validateChunkOrder
    // rejects for good reason.
    await new Promise((resolve) => realSetTimeout(resolve, 20));
    const result = await capture.stop();
    assert.equal(result.session.captureStatus, "stopped");
    assert.equal(result.chunks.length, 1);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    (globalThis as Record<string, unknown>).MediaRecorder = realMediaRecorder;
  }
});

test("completed chunks reach persistence before session stop and finished awaits commits", async () => {
  const offered: number[] = [];
  let release!: () => void;
  const saved = new Promise<void>((resolve) => { release = resolve; });
  const h = harness(1000, false, async (chunk) => { offered.push(chunk.metadata.sequence); await saved; });
  h.advance(31000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(offered, [0]);
  let finished = false;
  const completion = h.capture.stop().then((value) => { finished = true; return value; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(finished, false);
  release();
  assert.equal((await completion).chunks.length, 2);
});
test("mid-session persistence failure stops capture and retains available chunks", async () => {
  const h = harness(1000, false, async () => { throw new DOMException("full", "QuotaExceededError"); });
  h.advance(31000);
  const result = await h.capture.finished;
  assert.equal(result.session.captureStatus, "failed");
  assert.equal(h.released(), 1);
  assert.equal(result.chunks.length, 2);
  assert.ok(result.chunks[0].audio.size > 0);
});
