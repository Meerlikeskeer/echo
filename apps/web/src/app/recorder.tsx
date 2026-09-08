"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderStatus } from "../lib/providers/status";
import type { RecordingResult } from "../lib/recording/pipeline";
import { DisclosureNotice, RecordingOutcome } from "./recording-result";
import { captureSession } from "../lib/recording/capture";
import type { AudioChunk, PlayableChunk } from "../lib/recording/session";
import { describeSecureContextProblem, readEnvironment } from "../lib/recording/secure-context";

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
  const [chunks, setChunks] = useState<PlayableChunk[]>([]);
  const [overlapMs, setOverlapMs] = useState(1000);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<RecordingResult | null>(null);
  const [outcomes, setOutcomes] = useState<Record<number, RecordingResult>>({});
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

  const upload = useCallback(async (clip: Blob, durationMs: number, metadata: AudioChunk) => {
    setFailure(null);
    setResult(null);
    setPhase("processing");
    const body = new FormData();
    // The extension matters: transcription services classify audio by filename.
    body.append("audio", clip, `recording.${clip.type.includes("ogg") ? "ogg" : clip.type.includes("mp4") ? "m4a" : "webm"}`);
    body.append("durationMs", String(durationMs));
    body.append("chunk", JSON.stringify(metadata));
    // Same-origin request: the browser reuses the owner credentials it already
    // holds for this page. No credential is ever read by client code.
    const response = await fetch("/api/recordings", { method: "POST", body, cache: "no-store" });
    if (response.ok) {
      const outcome = (await response.json()) as RecordingResult;
      setResult(outcome);
      setOutcomes((previous) => ({ ...previous, [metadata.sequence]: outcome }));
      setPhase("done");
      return true;
    }
    if (response.status === 401) {
      setFailure({ title: "Private access required", detail: "Reload the page and sign in again.", retryable: false });
      setPhase("idle");
      return false;
    }
    const payload = await response.json().catch(() => null);
    const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error: { message?: unknown; retryable?: unknown; port?: unknown } }).error : null;
    setFailure({
      title: error?.port === "notes" ? "Notes could not be generated" : error?.port === "transcription" ? "The recording could not be transcribed" : "Echo could not process the recording",
      detail: typeof error?.message === "string" ? error.message : "The server rejected the recording.",
      retryable: error?.retryable === true,
    });
    setPhase("idle");
    return false;
  }, []);

  async function start() {
    const attempt = ++generation.current;
    setFailure(null);
    setResult(null);
    setChunks([]);
    setOutcomes({});
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
      active = captureSession(stream, { chunkMs: 30_000, overlapMs });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording could not start", detail: "This browser could not open an audio recorder. Try a different browser or device.", retryable: false });
      setPhase("idle");
      return;
    }

    setRecorder(active);
    setPhase("recording");
    void active.finished.then(async (captured) => {
      if (attempt !== generation.current) return;
      setChunks(captured.chunks);
      setPhase("done");
      if (captured.session.captureStatus === "failed") {
        setFailure({ title: "Capture incomplete", detail: "Some chunk boundaries or audio could not be captured. Available clips remain below; nothing was uploaded.", retryable: false });
      } else {
        // Processing starts only after capture ends. Incremental upload and
        // stitching remain separate tasks; each chunk keeps its own result.
        for (const chunk of captured.chunks) {
          if (attempt !== generation.current) break;
          try { if (!await upload(chunk.audio, chunk.metadata.endMs - chunk.metadata.startMs, chunk.metadata)) break; } catch {
          setFailure({ title: "Echo could not reach the server", detail: "The clip remains available below. Try again.", retryable: true });
          setPhase("done");
          break;
          }
        }
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
      </section>
    );
  }

  const busy = phase === "starting" || phase === "processing";
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
              {phase === "processing" ? "Working" : phase === "starting" ? "Starting" : result ? "Again" : "Record"}
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
        <label className="text-sm text-slate-600">Chunk overlap
          <select className="ml-3 rounded border p-1" value={overlapMs} disabled={busy || phase === "recording"} onChange={(event) => setOverlapMs(Number(event.target.value))}>
            <option value={0}>None</option><option value={1000}>1 second</option><option value={2000}>2 seconds</option>
          </select>
        </label>
      </section>

      {chunks.length ? <section className="mt-6 space-y-4" aria-label="Session chunks">
        <p className="text-sm text-slate-600">Clips remain in this page only. Reloading or recording again loses them. Overlapping speech is not stitched yet; each result belongs to the selected chunk.</p>
        {chunks.map((chunk) => <ChunkPlayer key={chunk.metadata.id} chunk={chunk} disabled={busy} onTranscribe={() => {
          void upload(chunk.audio, chunk.metadata.endMs - chunk.metadata.startMs, chunk.metadata).catch(() => {
            setFailure({ title: "Echo could not reach the server", detail: "The clip is still available below. Try again.", retryable: true });
            setPhase("done");
          });
        }} />)}
      </section> : null}

      {failure ? (
        <div role="alert" className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <p className="font-medium text-rose-900">{failure.title}</p>
          <p className="mt-1 text-sm leading-6 text-rose-900">{failure.detail}</p>
          {failure.retryable ? <p className="mt-1 text-sm text-rose-800">This is usually temporary — you can try again.</p> : null}
        </div>
      ) : null}

      {Object.entries(outcomes).map(([sequence, outcome]) => <div key={sequence}><p className="mt-6 text-sm">Result for chunk {Number(sequence) + 1}</p><RecordingOutcome result={outcome} /></div>)}
      {!Object.keys(outcomes).length ? <div className="mt-6"><DisclosureNotice disclosures={status.disclosures} /></div> : null}
    </div>
  );
}

function ChunkPlayer({ chunk, disabled, onTranscribe }: { chunk: PlayableChunk; disabled: boolean; onTranscribe: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(chunk.audio);
    if (audio.current) audio.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [chunk.audio]);
  return <div className="rounded-xl border border-slate-200 p-4">
    <p className="mb-2 text-sm">Chunk {chunk.metadata.sequence + 1} · {clock(chunk.metadata.startMs)}–{clock(chunk.metadata.endMs)} · overlap {chunk.metadata.overlapMs} ms</p>
    <audio ref={audio} controls className="w-full" />
    <button type="button" disabled={disabled || !chunk.audio.size} onClick={onTranscribe} className="mt-2 rounded border px-3 py-1 disabled:opacity-50">Transcribe this chunk</button>
  </div>;
}
