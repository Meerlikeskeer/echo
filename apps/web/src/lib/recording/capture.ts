import { checksum, validateCaptureOptions, validateChunkOrder, type CaptureOptions, type PlayableChunk, type Session } from "./session";

export const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

type RecorderLike = Pick<MediaRecorder, "mimeType" | "state" | "ondataavailable" | "onstop" | "onerror" | "start" | "stop">;
export interface CaptureRuntime {
  create(): RecorderLike;
  now(): number;
  schedule(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel(timer: ReturnType<typeof setTimeout>): void;
}

/** Each recorder owns a complete container. Never split MediaRecorder byte fragments. */
export function captureSession(stream: MediaStream, options: CaptureOptions, runtime?: CaptureRuntime, onChunk?: (chunk: PlayableChunk) => Promise<void>) {
  validateCaptureOptions(options);
  const mimeType = runtime ? "" : PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  if (!runtime && !mimeType) throw new Error("No supported recording codec");
  const io: CaptureRuntime = runtime ?? {
    create: () => new MediaRecorder(stream, { mimeType }),
    now: () => performance.now(),
    // setTimeout and clearTimeout are DOM globals that require `this` to be the
    // window. Assigned directly as properties they get called as io.schedule(),
    // making `this` the io object, and every browser throws
    // "TypeError: Illegal invocation" — which broke capture in every real
    // browser while every test here passed, because tests inject a runtime and
    // never construct this object. Keep them wrapped.
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
  };
  const origin = io.now();
  const session: Session = { id: crypto.randomUUID(), startedAt: Date.now(), endedAt: null, captureStatus: "recording" };
  const entries: { recorder: RecorderLike; id: string; startMs: number; endMs: number; stopping: boolean; done: Promise<Blob>; settle: (audio: Blob) => void; timeout?: ReturnType<typeof setTimeout>; ready?: Promise<PlayableChunk> }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;
  let quickNoteStop: { stoppedAt: number; onlineAtStop: boolean } | undefined;
  let failed = false;
  let completion: Promise<{ session: Session; chunks: PlayableChunk[] }> | undefined;
  let finishedResolve!: (result: { session: Session; chunks: PlayableChunk[] }) => void;
  const finished = new Promise<{ session: Session; chunks: PlayableChunk[] }>((resolve) => { finishedResolve = resolve; });
  const elapsed = () => Math.max(0, Math.round(io.now() - origin));
  const schedule = (callback: () => void, delay: number) => {
    const timer = io.schedule(() => { timers.delete(timer); if (!stopped) callback(); }, delay);
    timers.add(timer);
  };
  const stopEntry = (entry: typeof entries[number]) => {
    if (entry.recorder.state === "inactive") return;
    entry.stopping = true;
    entry.endMs = elapsed();
    // The watchdog schedule is inside the guard too. When it threw, the throw
    // escaped stop() and therefore captureSession itself, turning a capture
    // failure the caller was meant to observe as captureStatus "failed" into an
    // uncaught exception. Nothing in here may leave this function.
    try {
      entry.timeout = io.schedule(() => { failed = true; entry.settle(new Blob()); }, 5000);
      entry.recorder.stop();
    } catch { failed = true; entry.settle(new Blob()); }
  };
  function begin() {
    try {
      const recorder = io.create();
      const pieces: Blob[] = [];
      const entry: typeof entries[number] = { recorder, id: crypto.randomUUID(), startMs: entries.length ? elapsed() : 0, endMs: 0, stopping: false, done: Promise.resolve(new Blob()), settle: () => {} };
      entry.done = new Promise<Blob>((resolve) => {
        entry.settle = (audio) => { if (entry.timeout !== undefined) io.cancel(entry.timeout); resolve(audio); };
        recorder.ondataavailable = (event) => { if (event.data.size) pieces.push(event.data); };
        recorder.onstop = () => {
          // An explicit flag, not `endMs === 0`: zero is a legal elapsed time,
          // so a stop requested in the first millisecond used to be misread as
          // a recorder crash and failed the whole session.
          const unexpected = !entry.stopping;
          if (unexpected) { entry.endMs = elapsed(); failed = true; }
          entry.settle(new Blob(pieces, { type: recorder.mimeType }));
          if (unexpected) void stop();
        };
        recorder.onerror = () => { failed = true; entry.settle(new Blob()); void stop(); };
      });
      recorder.start();
      const sequence = entries.length;
      entries.push(entry);
      // A complete container is available at its own stop event, not only at
      // session end. WEB-004 persists here; finished waits for every commit.
      entry.ready = entry.done.then(async (audio) => {
        const chunk: PlayableChunk = { audio, metadata: {
          sessionId: session.id, id: entry.id, sequence, startMs: entry.startMs, endMs: entry.endMs,
          overlapMs: sequence ? Math.max(0, entries[sequence - 1].endMs - entry.startMs) : 0,
          mimeType: audio.type, size: audio.size, checksum: await checksum(audio),
          ...(options.quickNote && quickNoteStop ? { quickNote: quickNoteStop } : {}),
        } };
        try { await onChunk?.(chunk); }
        catch { failed = true; void stop(); }
        return chunk;
      });
      // Stop on checksum failure too; the rejection is handled immediately.
      void entry.ready.catch(() => { failed = true; void stop(); });
      schedule(() => {
        if (options.quickNote) { void stop(); return; }
        // Start the next complete container before stopping the previous one.
        begin();
        if (options.overlapMs === 0) stopEntry(entry);
        else schedule(() => stopEntry(entry), options.overlapMs);
      }, options.chunkMs - options.overlapMs);
    } catch { failed = true; void stop(); }
  }
  function stop() {
    if (completion) return completion;
    if (options.quickNote) quickNoteStop = { stoppedAt: Date.now(), onlineAtStop: globalThis.navigator?.onLine !== false };
    stopped = true;
    timers.forEach(io.cancel);
    entries.forEach(stopEntry);
    stream.getTracks().forEach((track) => track.stop());
    const endedAt = session.startedAt + elapsed();
    completion = (async () => {
      const chunks: PlayableChunk[] = [];
      for (const entry of entries) {
        if (entry.ready) chunks.push(await entry.ready);
      }
      try { validateChunkOrder(chunks.map((chunk) => chunk.metadata)); } catch { failed = true; }
      return { session: { ...session, endedAt, captureStatus: failed || !chunks.length ? "failed" as const : "stopped" as const }, chunks };
    })();
    void completion.then(finishedResolve).catch(() => finishedResolve({ session: { ...session, endedAt, captureStatus: "failed" }, chunks: [] }));
    return completion;
  }
  begin();
  return { session, stop, finished };
}
