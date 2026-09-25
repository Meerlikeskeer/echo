"use client";

import { useEffect, useRef, useState } from "react";
import { readDeviceRecording, type DeviceRecording, type ImportProgress } from "../lib/recording/device-import";

export function DeviceImport({ disabled, processingReady, onImport }: {
  disabled: boolean;
  processingReady: boolean;
  onImport: (recording: DeviceRecording, progress: ImportProgress) => Promise<void>;
}) {
  const [recording, setRecording] = useState<DeviceRecording | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const validation = useRef<AbortController | null>(null);
  useEffect(() => () => validation.current?.abort(), []);
  async function choose(file: File | undefined) {
    if (!file) return;
    validation.current?.abort();
    const controller = new AbortController(); validation.current = controller;
    setRecording(null); setError(""); setBusy(true); setMessage("Checking the recording…");
    try {
      const value = await readDeviceRecording(file, (done, total) => setMessage(`Checking audio ${done} of ${total}…`), controller.signal);
      setRecording(value); setMessage("");
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "The recording could not be checked."); setMessage(""); }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function save() {
    if (!recording) return;
    setBusy(true); setError(""); setMessage("Saving audio in this browser…");
    try {
      await onImport(recording, (done, total) => setMessage(`Saving audio ${done} of ${total}…`));
      setMessage(`Imported ${recording.chunks.length} clips. ${recording.complete ? "Capture completion verified." : "Interrupted recording: the session stays partial."} ${processingReady ? "Transcription will run while this page is open and online. Generate session notes below once the transcript is ready." : "Processing waits until the server's providers are configured."}`);
      setRecording(null);
    } catch (cause) {
      setMessage("");
      setError(`${cause instanceof Error ? cause.message : "Import could not finish."} Any clips already saved remain available. You can retry this same file.`);
    } finally { setBusy(false); }
  }
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="device-import-title">
    <h2 id="device-import-title" className="text-lg font-semibold text-slate-900">Bring in a device recording</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Download a session from your Echo device, reconnect this Mac to your normal Wi-Fi, then choose the <strong>.echo</strong> file here. Meetings, conversations, classes—any session.</p>
    <label className="mt-4 block text-sm font-medium text-slate-700">Device recording
      <input type="file" accept=".echo" disabled={disabled || busy} onChange={event => { void choose(event.target.files?.[0]); event.target.value = ""; }} className="mt-2 block w-full rounded-lg border border-slate-200 p-2 text-sm disabled:opacity-50" />
    </label>
    {recording ? <div className="mt-4 space-y-3 text-sm text-slate-700">
      <p>{Math.ceil(recording.durationMs / 60000)} min · {recording.chunks.length} clips · {(recording.bytes / 1048576).toFixed(1)} MiB · {recording.complete ? "Stopped cleanly" : "Partial / interrupted"}</p>
      <p>Importing saves audio in this browser and queues it for Echo’s configured transcription and notes providers. Provider details are shown on this page. Audio stays on your SD card; nothing is deleted.</p>
      <button type="button" disabled={busy || disabled} onClick={() => { void save(); }} className="rounded-full bg-teal-700 px-5 py-2 font-medium text-white disabled:opacity-50">{busy ? "Importing…" : processingReady ? "Import and transcribe" : "Import for later"}</button>
    </div> : null}
    {message ? <p role="status" className="mt-3 text-sm leading-6 text-slate-600">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm leading-6 text-rose-800">{error}</p> : null}
    <p className="mt-3 text-xs leading-5 text-slate-500">Keep the downloaded file and SD originals. Browser storage has a 256 MiB audio budget and may be cleared or evicted. Reimporting the same recording preserves its existing results.</p>
  </section>;
}
