"use client";

import { useEffect, useRef, useState } from "react";
import { captureSession, PREFERRED_MIME_TYPES } from "../../../lib/recording/capture";
import { checksum, validateChunkOrder } from "../../../lib/recording/session";

const CHUNK_MS = 6000;
const RUN_MS = 14000;
const TOLERANCE_MS = 250;
type Observation = {
  requestedMime: string; actualMime: string; sameStream: boolean;
  startCall?: number; startEvent?: number; stopCall?: number; stopEvent?: number;
  recordingAfterStart?: boolean; concurrentWith: number[]; error: boolean;
};
type Check = { name: string; pass: boolean; detail: string };
type Report = { overlapMs: number; checks: Check[]; evidence: unknown };
const ms = (value: number) => Math.round(value * 100) / 100;

/** Native subclass observes only: no injected clock/runtime, altered events or synthetic blobs. */
async function runCase(context: AudioContext, overlapMs: number, signal: AbortSignal): Promise<Report> {
  const NativeRecorder = window.MediaRecorder;
  const destination = context.createMediaStreamDestination();
  const oscillator = context.createOscillator();
  oscillator.connect(destination);
  oscillator.frequency.setValueAtTime(220, context.currentTime);
  oscillator.frequency.linearRampToValueAtTime(1320, context.currentTime + RUN_MS / 1000);
  const origin = performance.now();
  const now = () => performance.now() - origin;
  const observations: Observation[] = [];
  const recorders: MediaRecorder[] = [];
  let hidden = document.hidden;
  const visibility = () => { hidden ||= document.hidden; };
  document.addEventListener("visibilitychange", visibility);
  class ObservedRecorder extends NativeRecorder {
    observation: Observation;
    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      super(stream, options);
      this.observation = { requestedMime: options?.mimeType ?? "", actualMime: this.mimeType,
        sameStream: stream === destination.stream, concurrentWith: [], error: false };
      observations.push(this.observation);
      recorders.push(this);
      this.addEventListener("start", () => { this.observation.startEvent = now(); });
      this.addEventListener("stop", () => { this.observation.stopEvent = now(); });
      this.addEventListener("error", () => { this.observation.error = true; });
    }
    override start(timeslice?: number) {
      super.start(timeslice);
      this.observation.startCall = now();
      this.observation.recordingAfterStart = this.state === "recording";
      this.observation.actualMime = this.mimeType;
      this.observation.concurrentWith = recorders.flatMap((recorder, index) =>
        recorder !== this && recorder.state === "recording" ? [index] : []);
    }
    override stop() {
      super.stop();
      this.observation.stopCall = now();
    }
  }
  let capture: ReturnType<typeof captureSession> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Named so a thrown browser error reports which step died. Without it the
  // caller can only say "something failed", which is worthless in the one tool
  // whose entire job is diagnosis.
  let stage = "setup";
  const stop = () => { void capture?.stop().catch(() => {}); };
  try {
    stage = "install MediaRecorder observer";
    window.MediaRecorder = ObservedRecorder;
    stage = "start oscillator";
    oscillator.start();
    stage = "captureSession(): codec negotiation and first recorder";
    capture = captureSession(destination.stream, { chunkMs: CHUNK_MS, overlapMs });
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    timer = setTimeout(stop, RUN_MS);
    stage = "await capture.finished";
    const result = await capture.finished;
    stage = "decode chunks and recompute checksums";
    const chunks = await Promise.all(result.chunks.map(async ({ audio, metadata }) => {
      let decoded: { pass: boolean; durationMs?: number; samples?: number; sampleRate?: number; channels?: number } = { pass: false };
      try {
        const buffer = await context.decodeAudioData(await audio.arrayBuffer());
        decoded = { pass: buffer.length > 0 && buffer.duration > 0, durationMs: ms(buffer.duration * 1000),
          samples: buffer.length, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels };
      } catch { /* A single undecodable container is a hard failure. */ }
      const freshChecksum = await checksum(audio);
      return { ...metadata, durationMs: metadata.endMs - metadata.startMs, blobMime: audio.type,
        decoded, freshChecksum, checksumMatches: metadata.checksum === freshChecksum };
    }));
    stage = "measure recorder windows";
    const windows = observations.slice(1).map((current, index) => {
      const previous = observations[index];
      const stateOverlap = previous.stopCall !== undefined && current.startCall !== undefined
        ? previous.stopCall - current.startCall : null;
      // Start/stop events are asynchronous: show their separate window, never mistake it for state timing.
      const eventOverlap = previous.stopEvent !== undefined && current.startEvent !== undefined
        ? previous.stopEvent - current.startEvent : null;
      return { from: index, to: index + 1, stateOverlapMs: stateOverlap === null ? null : ms(stateOverlap),
        eventOverlapMs: eventOverlap === null ? null : ms(eventOverlap),
        driftMs: stateOverlap === null ? null : ms(stateOverlap - overlapMs),
        simultaneousRecordingStates: current.concurrentWith.includes(index) };
    });
    let ordered = chunks.length >= 3;
    try { validateChunkOrder(result.chunks.map(({ metadata }) => metadata)); } catch { ordered = false; }
    const checks: Check[] = [
      { name: "Capture completed in foreground", pass: result.session.captureStatus === "stopped" && !hidden && !signal.aborted,
        detail: `status=${result.session.captureStatus}; hidden=${hidden}; aborted=${signal.aborted}` },
      { name: "Preferred codec negotiation", pass: observations.length >= 3 && observations.every(o => PREFERRED_MIME_TYPES.includes(o.requestedMime) && o.actualMime.length > 0),
        detail: "Requested constructor MIME must be a preferred entry; actual recorder/blob MIME is reported separately (browsers may normalize it)." },
      { name: "Native recorder concurrency", pass: windows.length >= 2 && observations.every(o => o.sameStream && o.recordingAfterStart && !o.error && o.startEvent !== undefined && o.stopEvent !== undefined) && windows.every(w => w.simultaneousRecordingStates && w.stateOverlapMs !== null && w.stateOverlapMs >= 0 && (overlapMs === 0 || (w.eventOverlapMs !== null && w.eventOverlapMs > 0))),
        detail: "Same real stream; both native states recording at relay start. Zero overlap checks immediate handoff; positive overlap also requires intersecting start/stop event windows." },
      { name: "Every container independently decodes", pass: chunks.length >= 3 && chunks.every(c => c.decoded.pass), detail: `${chunks.filter(c => c.decoded.pass).length}/${chunks.length} decoded via separate decodeAudioData calls` },
      { name: "Sequence and contiguous monotonic boundaries", pass: ordered && chunks.length === observations.length,
        detail: "validateChunkOrder on real metadata, sequence 0..n-1, no uncovered gaps, overlap accounted for; at least three chunks." },
      { name: "Every SHA-256 checksum matches", pass: chunks.length >= 3 && chunks.every(c => c.checksumMatches), detail: "Fresh checksum(blob) compared with capture metadata for every chunk." },
      { name: "Measured overlap tolerance", pass: windows.length >= 2 && windows.every(w => w.driftMs !== null && Math.abs(w.driftMs) <= TOLERANCE_MS),
        detail: `Native state interval tolerance ±${TOLERANCE_MS} ms, including zero-overlap handoff; signed drift shown below.` },
      // Measured on Chrome 150: start events lag their start() call by 50-120 ms.
      // State timing hides this — it showed +1 ms of overlap while the audio was
      // already gone — so only the event windows can prove continuity.
      { name: "No unrecorded gap between chunks", pass: windows.length >= 2 && windows.every(w => w.eventOverlapMs !== null && w.eventOverlapMs > 0),
        detail: "MediaRecorder does not begin capturing when start() returns; its start event lags. Where the previous recorder's stop event precedes the next one's start event, nothing captured the audio in between and it is permanently lost. A negative eventOverlapMs below is measured audio loss at that boundary." },
      { name: "Decoded audio accounts for the session", pass: chunks.length >= 3 && result.session.endedAt !== null
          && chunks.reduce((total, c) => total + (c.decoded.durationMs ?? 0), 0) - (windows.length * overlapMs) >= (result.session.endedAt - result.session.startedAt) - TOLERANCE_MS,
        detail: `Sum of decoded chunk durations, minus the deliberately duplicated overlap, against the session length. A shortfall beyond ±${TOLERANCE_MS} ms is audio that was recorded by nothing.` },
    ];
    return { overlapMs, checks, evidence: { sessionDurationMs: result.session.endedAt === null ? null : result.session.endedAt - result.session.startedAt,
      chunkMs: CHUNK_MS, toleranceMs: TOLERANCE_MS, observations, windows, chunks } };
  } catch (error) {
    // Re-thrown with the stage attached. The observations collected before the
    // failure are the useful part, so they travel with it.
    const described = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const failure = new Error(`stage "${stage}" threw ${described}`);
    failure.stack = error instanceof Error && error.stack ? error.stack : failure.stack;
    (failure as Error & { observations?: Observation[] }).observations = observations;
    throw failure;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    stop();
    window.MediaRecorder = NativeRecorder;
    oscillator.stop();
    oscillator.disconnect();
    destination.stream.getTracks().forEach(track => track.stop());
    document.removeEventListener("visibilitychange", visibility);
  }
}

export function CaptureDiagnostics() {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("Ready");
  const [browser, setBrowser] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function run() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setReports([]);
    setBrowser(`${navigator.userAgent} · ${new Date().toISOString()}`);
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      await context.resume();
      for (const overlap of [0, 1000, 2000]) {
        if (controller.signal.aborted) break;
        setStatus(`Running ${overlap} ms overlap…`);
        let report: Report;
        try {
          report = await runCase(context, overlap, controller.signal);
        } catch (error) {
          const described = error instanceof Error ? error.message : String(error);
          const trace = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 6).join("\n") : "";
          report = { overlapMs: overlap, checks: [{ name: "Native capture and validation", pass: false,
            detail: `Browser API failed, so this setting has no complete evidence and no acceptance assertion may be treated as passed. ${described}` }],
            evidence: { failure: described, trace, observations: (error as Error & { observations?: Observation[] })?.observations ?? null } };
        }
        setReports(previous => [...previous, report]);
      }
      setStatus(controller.signal.aborted ? "Cancelled — incomplete" : "Finished — review every result below");
    } catch {
      setStatus("FAIL — browser capture or audio API failed; acceptance incomplete");
    } finally {
      try { await context?.close(); } finally { active.current = null; }
    }
  }
  return <main className="mx-auto max-w-5xl space-y-6 p-8">
    <h1 className="text-3xl font-semibold">WEB-003 capture diagnostics</h1>
    <p>Development only · synthetic frequency sweep · no microphone permission, upload or saved audio.</p>
    <p>Run all three overlap settings in about 42 seconds. Keep this tab visible. Each run uses 6-second chunks for 14 seconds. This does not test microphone permissions, mobile capture or the recorder UI’s 60-second auto-stop.</p>
    <p>Timing uses performance.now(): startCall is sampled after native start returns in recording state; stopCall after native stop returns. Event timestamps are asynchronous and shown separately. Drift tolerance is ±250 ms, a foreground acceptance threshold, not a sample-accurate audio continuity guarantee.</p>
    <div className="flex gap-4">
      <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={status.startsWith("Running")} onClick={() => void run()}>Run browser acceptance</button>
      <button className="rounded border px-4 py-2" onClick={() => active.current?.abort()}>Cancel</button>
    </div>
    <p role="status">{status}</p><p className="break-words text-sm">{browser}</p>
    {reports.map(report => {
      // A backgrounded tab throttles timers, so the run's timing is unusable —
      // that is not the same as the capture being wrong, and labelling both
      // "FAIL" sends someone hunting a bug that is not there.
      const foreground = report.checks.find(check => check.name === "Capture completed in foreground");
      const verdict = foreground && !foreground.pass ? "INVALID — rerun with the tab visible"
        : report.checks.every(check => check.pass) ? "PASS" : "FAIL";
      return <section key={report.overlapMs} className="space-y-3 rounded border bg-white p-5">
      <h2 className="text-xl font-semibold">{report.overlapMs} ms overlap — {verdict}</h2>
      <ul className="space-y-2">{report.checks.map(check => <li key={check.name}><strong>{check.pass ? "PASS" : "FAIL"}: {check.name}</strong><p>{check.detail}</p></li>)}</ul>
      <details open><summary>Measured evidence (all times in ms unless named otherwise)</summary>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(report.evidence, null, 2)}</pre>
      </details>
    </section>;
    })}
  </main>;
}
