"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderStatus } from "../lib/providers/status";
import { DisclosureNotice, RecordingOutcome } from "./recording-result";
import { captureSession } from "../lib/recording/capture";
import type { PlayableChunk } from "../lib/recording/session";
import { describeSecureContextProblem, readEnvironment } from "../lib/recording/secure-context";

import { SessionTranscripts } from "./session-transcript";
import { useAudioQueue } from "./use-audio-queue";
import { chunkKey, incompleteSessions, storageFailure, summarizeQueue } from "../lib/recording/queue";

const TARGET_MIN_MS = 30_000;
const MAX_MS = 60_000;

// First supported entry wins. Opus in WebM/Ogg keeps a 60 second clip far below
// the 4 MB server limit, so this slice needs no object storage.

type Phase = "idle" | "starting" | "recording" | "processing" | "done";

interface Failure {
  readonly title: string;
  readonly detail: string;
  readonly retryable: boolean;
}


function describePermissionFailure(error: unknown): Failure {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { title: "Microphone access was denied", detail: "Echo cannot record without microphone permission. Allow access for this site in your browser settings, then try again.", retryable: true };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "No microphone was found", detail: "Connect a microphone or select a different input device, then try again.", retryable: true };
  }
  if (name === "NotReadableError") {
    return { title: "The microphone is unavailable", detail: "Another application may be using it. Close that application and try again.", retryable: true };
  }
  return { title: "Recording could not start", detail: "This browser refused to start a recording. Try a different browser or device.", retryable: false };
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function Recorder({ status }: { status: ProviderStatus }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recorder, setRecorder] = useState<ReturnType<typeof captureSession> | null>(null);
  const [overlapMs, setOverlapMs] = useState(1000);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const queue = useAudioQueue(status.ready);
  const chunks: PlayableChunk[] = [...queue.entries, ...queue.unsaved];
  const outcomes = queue.entries.filter((entry) => entry.result);
  const gaps = incompleteSessions(queue.entries);
  const progress = summarizeQueue(queue.entries);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  // Releasing the microphone is tied to the recorder's lifetime, so it happens
  // when the recording ends and again if this component ever unmounts.
  useEffect(() => () => { void recorder?.stop(); }, [recorder]);

  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(timer);
  }, [phase]);

  async function start() {
    const attempt = ++generation.current;
    setFailure(null);
    setElapsedMs(0);
    setPhase("starting");

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setFailure({ title: "Recording is not supported here", detail: "This browser does not provide microphone recording. Try a current version of Chrome, Edge, Firefox or Safari.", retryable: false });
      setPhase("idle");
      return;
    }

    // Checked before the microphone is opened, not after. Chunk checksums need
    // crypto.subtle, which browsers withhold outside a secure context — the
    // exact case when Echo is reached over plain HTTP from another device. Left
    // to fail later this costs the user a recording and reports nothing useful.
    const insecure = describeSecureContextProblem(readEnvironment());
    if (insecure) {
      setFailure(insecure);
      setPhase("idle");
      return;
    }

    try { await queue.prepare(); }
    catch (cause) {
      setFailure({ title: "Recording cannot be saved", detail: storageFailure(cause), retryable: true });
      setPhase("idle");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    } catch (error) {
      setFailure(describePermissionFailure(error));
      setPhase("idle");
      return;
    }

    let active: ReturnType<typeof captureSession>;
    try {
      active = captureSession(stream, { chunkMs: 30_000, overlapMs }, undefined, queue.persist);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording could not start", detail: "This browser could not open an audio recorder. Try a different browser or device.", retryable: false });
      setPhase("idle");
      return;
    }

    setRecorder(active);
    setPhase("recording");
    void active.finished.then(async (captured) => {
      let completionFailed = false;
      try { await queue.complete(captured); } catch { completionFailed = true; }
      queue.finished();
      if (attempt !== generation.current) return;
      setPhase("done");
      if (completionFailed) {
        setFailure({ title: "Session remains partial", detail: "Capture completion could not be saved. Saved audio is retained; completion cannot be confirmed.", retryable: false });
      }
      if (captured.session.captureStatus === "failed") {
        setFailure({ title: "Capture incomplete", detail: "Capture or local saving failed. Saved and unsaved clips are shown below. Download unsaved audio before leaving.", retryable: false });
      }
    });
  }

  const stop = useCallback(() => {
    if (!recorder) return;
    setPhase("processing");
    void recorder.stop();
  }, [recorder]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setTimeout(() => { void stop(); }, MAX_MS);
    return () => clearTimeout(timer);
  }, [phase, stop]);

  if (!status.ready) {
    return (
      <section aria-labelledby="unconfigured-title" className="rounded-2xl border border-amber-300 bg-amber-50 p-6 sm:p-8">
        <h2 id="unconfigured-title" className="text-xl font-semibold text-amber-900">Recording is unavailable</h2>
        <p className="mt-3 leading-7 text-amber-900">Echo checks its provider configuration at startup and stays closed until it is complete. Set these in <code className="rounded bg-amber-100 px-1">apps/web/.env.local</code> and restart:</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-900">
          {status.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
        {queue.error ? <p role="alert">{queue.error}</p> : null}
        <SessionTranscripts entries={queue.entries.map(entry => ({ metadata: entry.metadata, transcript: entry.result?.transcript }))} completions={queue.completions} />
        {chunks.length ? <div className="mt-5 space-y-4"><p>Saved audio remains available while processing is unconfigured. No clips are deleted.</p>
          {chunks.map((chunk) => <ChunkPlayer key={chunkKey(chunk)} chunk={chunk} saved={queue.entries.some((entry) => chunkKey(entry) === chunkKey(chunk))} disabled={false} onSave={() => { void queue.persist(chunk).catch(() => {}); }} />)}
        </div> : null}
      </section>
    );
  }

  const busy = phase === "starting" || phase === "processing" || queue.working || !queue.ready;
  return (
    <div>
      <section aria-labelledby="record-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="record-title" className="sr-only">Recorder</h2>
        <div className="flex flex-col items-center gap-5 py-4">
          {phase === "recording" ? (
            <button type="button" onClick={stop} className="flex h-28 w-28 items-center justify-center rounded-full bg-rose-600 text-lg font-semibold text-white shadow-lg transition hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-700">
              Stop
            </button>
          ) : (
            <button type="button" onClick={start} disabled={busy} aria-busy={busy} className="flex h-28 w-28 items-center justify-center rounded-full bg-teal-700 text-lg font-semibold text-white shadow-lg transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none">
              {phase === "processing" ? "Working" : phase === "starting" ? "Starting" : chunks.length ? "Again" : "Record"}
            </button>
          )}

          <p aria-live="polite" className="text-center text-sm text-slate-600">
            {phase === "recording" ? (
              <span className={`font-mono text-lg ${elapsedMs >= TARGET_MIN_MS ? "text-teal-700" : "text-slate-900"}`}>{clock(elapsedMs)}</span>
            ) : phase === "processing" ? (
              "Transcribing and writing notes…"
            ) : phase === "starting" ? (
              "Waiting for microphone permission…"
            ) : (
              "Record 30–60 seconds. Recording stops at one minute; play or transcribe each chunk below."
            )}
          </p>
        </div>
        {/*
          No zero-overlap option, and this is measured rather than cautious.
          MediaRecorder does not begin capturing when start() returns: on Chrome
          150 the start event lagged the call by 61-82 ms, so with no overlap the
          previous recorder had already stopped ~52 ms before the next one began
          and that audio was captured by nothing. Safari 26.4 starts in 0-2 ms
          and loses nothing — which makes it worse, not better, because the
          setting behaves correctly on whichever browser a developer happens to
          use. Overlap is a requirement here, not a preference. Evidence is in
          the WEB-003 browser evidence section of TASKS.md.
        */}
        <label className="text-sm text-slate-600">Chunk overlap
          <select className="ml-3 rounded border p-1" value={overlapMs} disabled={busy || phase === "recording"} onChange={(event) => setOverlapMs(Number(event.target.value))}>
            <option value={1000}>1 second</option><option value={2000}>2 seconds</option>
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Chunks overlap so no speech is lost where one recording hands over to the next. Matching segments with verified overlap are merged in the session transcript. Uncertain repetition remains visible.</p>
      </section>

      <section className="mt-6 space-y-2 text-sm text-slate-600" aria-label="Local queue" aria-live="polite">
        <p>{queue.ready ? `${queue.entries.length} clips saved on this browser` : "Opening local storage…"} · {queue.entries.filter((entry) => entry.state !== "processed").length} pending processing · {queue.unsaved.length} unsaved · {queue.online ? "Online" : "Offline"}</p>
        {/* Chunks upload while recording continues (ADR-016), so this has to be
            readable mid-session: which chunks are done, which are moving, and
            which have stopped. Per-chunk progress feeds the session transcript below. */}
        <p>Chunk processing: {progress.transcribed} transcribed · {progress.uploading} uploading · {progress.waiting} waiting · {progress.retrying} retrying · {progress.blocked} blocked</p>
        <p>All clips are local-only: no verified remote audio copy exists. Processing does not remove audio.</p>
        <p>{queue.space?.persistent ? "Browser persistence granted." : "Browser storage may be evicted."} Keep this tab open while recording. Backgrounding or closing can lose the unfinished chunk and pauses retries.</p>
        {queue.space?.nearFull ? <p role="alert">Storage nearly full. Export clips; new recording is paused. Echo will not delete audio to free space.</p> : null}
        {!queue.locksAvailable ? <p role="alert">This browser cannot safely coordinate retries across tabs. Use a current browser with Web Locks.</p> : null}
        {queue.error ? <p role="alert">{queue.error}</p> : null}
        {gaps.length ? <p role="alert">Missing or inconsistent chunks in {gaps.length} sessions. Available clips remain recoverable; continuity is not verified.</p> : null}
        {queue.entries.some((entry) => entry.error) ? <p role="alert">Some processing attempts failed. Audio is retained; retry after reconnecting or checking server access.</p> : null}
        {progress.blocked ? <p role="alert">{progress.blocked} clips stopped retrying. The audio is retained; retry below once the cause is fixed.</p> : null}
        {/* Enabled during capture: uploads run alongside recording now, and this
            drain never blocks the microphone. */}
        <button type="button" className="rounded border px-3 py-1 disabled:opacity-50" disabled={busy || !queue.online} onClick={() => { void queue.sync(true); }}>Retry pending processing</button>
      </section>

      {chunks.length ? <section className="mt-6 space-y-4" aria-label="Session chunks">
        <p className="text-sm text-slate-600">Saved clips recover on this same origin and browser when the page is available again. Export unsaved clips before leaving. Original audio and per-chunk results are retained.</p>
        {chunks.map((chunk) => <ChunkPlayer key={chunkKey(chunk)} chunk={chunk} saved={queue.entries.some((entry) => chunkKey(entry) === chunkKey(chunk))} disabled={busy || phase === "recording"} onSave={() => { void queue.persist(chunk).then(queue.finished).catch(() => {}); }} />)}
      </section> : null}

      {failure ? (
        <div role="alert" className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <p className="font-medium text-rose-900">{failure.title}</p>
          <p className="mt-1 text-sm leading-6 text-rose-900">{failure.detail}</p>
          {failure.retryable ? <p className="mt-1 text-sm text-rose-800">This is usually temporary — you can try again.</p> : null}
        </div>
      ) : null}

      <SessionTranscripts entries={queue.entries.map(entry => ({ metadata: entry.metadata, transcript: entry.result?.transcript }))} completions={queue.completions} />
      {outcomes.map((entry) => <div key={chunkKey(entry)}><p className="mt-6 text-sm">Session {entry.metadata.sessionId.slice(0, 8)} · chunk {entry.metadata.sequence + 1} · Per-chunk notes and original transcript</p><RecordingOutcome result={entry.result!} /></div>)}
      <div className="mt-6"><DisclosureNotice disclosures={status.disclosures} /></div>
    </div>
  );
}

function ChunkPlayer({ chunk, saved, disabled, onSave }: { chunk: PlayableChunk; saved: boolean; disabled: boolean; onSave: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const download = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(chunk.audio);
    if (audio.current) audio.current.src = objectUrl;
    if (download.current) download.current.href = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [chunk.audio]);
  return <div className="rounded-xl border border-slate-200 p-4">
    <p className="mb-2 text-sm">Session {chunk.metadata.sessionId.slice(0, 8)} · chunk {chunk.metadata.sequence + 1} · {clock(chunk.metadata.startMs)}–{clock(chunk.metadata.endMs)} · overlap {chunk.metadata.overlapMs} ms</p>
    <audio ref={audio} controls className="w-full" />
    <p className="my-2 text-sm">{saved ? "Saved locally" : "Not saved — download before leaving"}</p>
    <a ref={download} download={`${chunk.metadata.sessionId}-${chunk.metadata.id}.${chunk.audio.type.includes("mp4") ? "m4a" : chunk.audio.type.includes("ogg") ? "ogg" : "webm"}`} className="underline">Download audio</a>
    {!saved ? <button type="button" disabled={disabled || !chunk.audio.size} onClick={onSave} className="ml-3 rounded border px-3 py-1 disabled:opacity-50">Retry saving</button> : null}
  </div>;
}
