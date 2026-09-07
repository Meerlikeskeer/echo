"use client";

import { useEffect, useState } from "react";
import type { ProviderStatus } from "../lib/providers/status";
import type { RecordingResult } from "../lib/recording/pipeline";
import { DisclosureNotice, RecordingOutcome } from "./recording-result";

const TARGET_MIN_MS = 30_000;
const MAX_MS = 60_000;
const MIN_USABLE_MS = 1_000;

// First supported entry wins. Opus in WebM/Ogg keeps a 60 second clip far below
// the 4 MB server limit, so this slice needs no object storage.
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/mpeg"];

type Phase = "idle" | "starting" | "recording" | "processing" | "done";

interface Failure {
  readonly title: string;
  readonly detail: string;
  readonly retryable: boolean;
}

function pickMimeType(): string {
  for (const type of PREFERRED_MIME_TYPES) if (MediaRecorder.isTypeSupported(type)) return type;
  return "";
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
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<RecordingResult | null>(null);

  // Releasing the microphone is tied to the recorder's lifetime, so it happens
  // when the recording ends and again if this component ever unmounts.
  useEffect(() => () => recorder?.stream.getTracks().forEach((track) => track.stop()), [recorder]);

  useEffect(() => {
    if (phase !== "recording") return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "recording" && elapsedMs >= MAX_MS && recorder?.state === "recording") recorder.stop();
  }, [phase, elapsedMs, recorder]);

  async function upload(clip: Blob, durationMs: number) {
    const body = new FormData();
    body.append("audio", clip, "recording");
    body.append("durationMs", String(durationMs));
    // Same-origin request: the browser reuses the owner credentials it already
    // holds for this page. No credential is ever read by client code.
    const response = await fetch("/api/recordings", { method: "POST", body, cache: "no-store" });
    if (response.ok) {
      setResult((await response.json()) as RecordingResult);
      setPhase("done");
      return;
    }
    if (response.status === 401) {
      setFailure({ title: "Private access required", detail: "Reload the page and sign in again.", retryable: false });
      setPhase("idle");
      return;
    }
    const payload = await response.json().catch(() => null);
    const error = payload && typeof payload === "object" && "error" in payload ? (payload as { error: { message?: unknown; retryable?: unknown; port?: unknown } }).error : null;
    setFailure({
      title: error?.port === "notes" ? "Notes could not be generated" : error?.port === "transcription" ? "The recording could not be transcribed" : "Echo could not process the recording",
      detail: typeof error?.message === "string" ? error.message : "The server rejected the recording.",
      retryable: error?.retryable === true,
    });
    setPhase("idle");
  }

  async function start() {
    setFailure(null);
    setResult(null);
    setElapsedMs(0);
    setPhase("starting");

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setFailure({ title: "Recording is not supported here", detail: "This browser does not provide microphone recording. Try a current version of Chrome, Edge, Firefox or Safari.", retryable: false });
      setPhase("idle");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      setFailure(describePermissionFailure(error));
      setPhase("idle");
      return;
    }

    let active: MediaRecorder;
    try {
      const mimeType = pickMimeType();
      active = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording could not start", detail: "This browser could not open an audio recorder. Try a different browser or device.", retryable: false });
      setPhase("idle");
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();
    let broken = false;

    active.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    active.onerror = () => {
      broken = true;
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording failed", detail: "The browser stopped the recording before it finished. Nothing was sent anywhere.", retryable: true });
      setPhase("idle");
    };
    active.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (broken) return;
      const durationMs = Date.now() - startedAt;
      const clip = new Blob(chunks, { type: active.mimeType || "audio/webm" });
      if (clip.size === 0 || durationMs < MIN_USABLE_MS) {
        setFailure({ title: "Nothing was recorded", detail: "The recording was empty. Check that the right microphone is selected and record for at least a few seconds.", retryable: true });
        setPhase("idle");
        return;
      }
      setPhase("processing");
      upload(clip, durationMs).catch(() => {
        setFailure({ title: "Echo could not reach the server", detail: "Check your connection and try again. The recording was not saved.", retryable: true });
        setPhase("idle");
      });
    };

    try {
      active.start(1_000);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording could not start", detail: "The browser refused to begin capturing audio. Try again.", retryable: false });
      setPhase("idle");
      return;
    }
    setRecorder(active);
    setPhase("recording");
  }

  function stop() {
    if (recorder?.state === "recording") recorder.stop();
  }

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
              "Record 30–60 seconds. Recording stops automatically at one minute."
            )}
          </p>
        </div>
      </section>

      {failure ? (
        <div role="alert" className="mt-6 rounded-xl border border-rose-300 bg-rose-50 p-4">
          <p className="font-medium text-rose-900">{failure.title}</p>
          <p className="mt-1 text-sm leading-6 text-rose-900">{failure.detail}</p>
          {failure.retryable ? <p className="mt-1 text-sm text-rose-800">This is usually temporary — you can try again.</p> : null}
        </div>
      ) : null}

      {result ? <RecordingOutcome result={result} /> : <div className="mt-6"><DisclosureNotice disclosures={status.disclosures} /></div>}
    </div>
  );
}
