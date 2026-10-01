"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderStatus } from "../lib/providers/status";
import { DisclosureNotice, RecordingOutcome } from "./recording-result";
import { captureSession, measureBitrate } from "../lib/recording/capture";
import { safeChunkMs, type PlayableChunk } from "../lib/recording/session";
import { describeSecureContextProblem, readEnvironment } from "../lib/recording/secure-context";

import { SessionTranscript } from "./session-transcript";
import { useAudioQueue } from "./use-audio-queue";
import { chunkKey, storageFailure, summarizeQueue } from "../lib/recording/queue";
import { reportFailure } from "../lib/recording/log";
import { QuickNotes } from "./quick-notes";
import { recordingHeadroom } from "../lib/recording/storage-estimate";
import { MAX_UPLOAD_BYTES, CAPACITY_RESERVE } from "../lib/recording/queue";
import { DeviceImport } from "./device-import";
import { useWakeLock } from "./use-wake-lock";

import { Button } from "../components/ui/button";
import { Plus, Search, LockKeyhole, StickyNote, AudioLines, PanelLeft, Mic, Square, NotebookPen, AlignLeft, Headphones, RefreshCw, Pencil } from "lucide-react";
import { libraryRecording, type EchoKind } from "../lib/recording/library";
import { useLibrary } from "./use-library";
import { stitchSession } from "../lib/recording/stitching";
import { SessionArtifacts } from "./session-artifacts";

// Short complete containers bound the unsaved tail during a browser interruption.
// Bitrate is a request; upload checks and actual saved-byte estimates stay authoritative.
const SESSION_CHUNK_MS = 60_000;
const SESSION_OVERLAP_MS = 5_000;
const AUDIO_BITS_PER_SECOND = 32_000;

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tab, setTab] = useState<"notes" | "transcript" | "audio">("notes");
  const [recorder, setRecorder] = useState<ReturnType<typeof captureSession> | null>(null);
  const [overlapMs, setOverlapMs] = useState(SESSION_OVERLAP_MS);
  // What capture actually settled on, so the page can say it rather than
  // repeating the number that was asked for. See `safeChunkMs`.
  const [chunkMs, setChunkMs] = useState(SESSION_CHUNK_MS);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const queue = useAudioQueue(status.ready);
  const chunks: PlayableChunk[] = [...queue.entries, ...queue.unsaved];
  const ids = [...new Set([...chunks.map(chunk => chunk.metadata.sessionId), ...queue.completions.filter(item => item && typeof item.sessionId === "string").map(item => item.sessionId), ...(recorder ? [recorder.session.id] : [])])].sort();
  const libraryState = useLibrary(ids);
  const library = ids.map(id => libraryRecording(id, chunks, queue.entries, queue.completions, libraryState.preferences[id]));
  // Chunks committed for the recording in progress, so a long session shows
  // progress rather than a clock and nothing else.
  const chunkIndex = recorder ? queue.entries.filter(entry => entry.metadata.sessionId === recorder.session.id).length : 0;
  const headroomMinutes = queue.space
    ? recordingHeadroom(queue.entries, recorder?.session.id, queue.space.available, elapsedMs, chunkMs, overlapMs, CAPACITY_RESERVE)
    : null;
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
      // WEB-015. "starting", because this runs before the microphone is opened:
      // nothing was recording, so nothing stopped, and no clip is unsaved.
      reportFailure("preparing local storage for a recording", cause);
      setFailure({ title: "Recording cannot be saved", detail: storageFailure(cause, "starting"), retryable: true });
      setPhase("idle");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    } catch (error) {
      reportFailure("opening the microphone", error);
      setFailure(describePermissionFailure(error));
      setPhase("idle");
      return;
    }

    // Use the reported rate only to shorten containers. Encoded size remains
    // browser-dependent; an unknown rate gets a conservative 30-second clip.
    const measured = measureBitrate(stream, AUDIO_BITS_PER_SECOND);
    let sessionChunkMs: number;
    try { sessionChunkMs = safeChunkMs(SESSION_CHUNK_MS, measured, MAX_UPLOAD_BYTES); }
    catch {
      stream.getTracks().forEach(track => track.stop());
      setFailure({ title: "Recording bitrate is unsupported", detail: "This browser reported an audio rate too high for a safe clip. Try another browser.", retryable: false });
      setPhase("idle");
      return;
    }
    const sessionOverlapMs = Math.min(overlapMs, Math.floor(sessionChunkMs / 2) - 1);
    setChunkMs(sessionChunkMs);

    let active: ReturnType<typeof captureSession>;
    try {
      active = captureSession(stream,
        { chunkMs: sessionChunkMs, overlapMs: sessionOverlapMs, audioBitsPerSecond: AUDIO_BITS_PER_SECOND },
        undefined, queue.persist);
    } catch (cause) {
      reportFailure("starting the audio recorder", cause);
      stream.getTracks().forEach((track) => track.stop());
      setFailure({ title: "Recording could not start", detail: "This browser could not open an audio recorder. Try a different browser or device.", retryable: false });
      setPhase("idle");
      return;
    }

    setRecorder(active);
    setSelectedId(active.session.id);
    setTab("transcript");
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

  useWakeLock(phase === "recording");

  const capturing = phase === "recording" || phase === "starting" || phase === "processing";
  const busy = phase === "starting" || phase === "processing" || importing || !queue.ready;
  const selected = library.find(item => item.id === selectedId);
  const selectedTranscript = selected ? stitchSession({ sessionId: selected.id,
    chunks: selected.results.map(entry => ({ metadata: entry.metadata, transcript: entry.result?.transcript })),
    completion: queue.completions.filter(item => item?.sessionId === selected.id).length > 1 ? { sessionId: selected.id, chunks: [] } : queue.completions.find(item => item?.sessionId === selected.id) ?? null }) : null;
  function openRecording(id: string | null) { setSelectedId(id); setMobileOpen(false); setTab("notes"); }
  return <div className="echo-workspace">
    <a className="skip-link" href="#echo-main">Skip to recording</a>
    <aside className={`echo-sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Recordings sidebar">
      <div className="sidebar-brand"><span className="wordmark">echo<span>.</span></span><span className="private-label"><LockKeyhole size={12} /> Private space</span></div>
      <Button className="new-echo" disabled={capturing} onClick={() => openRecording(null)}><Plus /> Start new Echo</Button>
      <label className="library-search"><Search size={15} /><input aria-label="Search recordings" placeholder="Find a recording…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="library-heading">YOUR RECORDINGS <span>{library.length}</span></div>
      <nav className="recording-list" aria-label="Your recordings">
        {!queue.ready ? <p className="sidebar-empty">Opening your recordings…</p> : !library.length ? <p className="sidebar-empty">A little space for everything<br />you want to remember.</p> : null}
        {library.filter(item => item.title.toLowerCase().includes(search.toLowerCase())).map(item => <button key={item.id} className={`recording-item ${selectedId === item.id ? "is-selected" : ""}`} aria-current={selectedId === item.id ? "page" : undefined} disabled={capturing && item.id !== selectedId} onClick={() => openRecording(item.id)}>
          {item.kind === "quick-note" ? <StickyNote size={17} /> : <AudioLines size={17} />}
          <span><strong>{item.title}</strong><small>{clock(item.duration)} · {item.id === recorder?.session.id && capturing ? "Recording" : item.unsaved ? "Unsaved audio" : item.blocked ? "Needs retry" : item.pending ? "Transcribing" : !item.complete ? "Partial" : item.kind === "quick-note" ? "Quick Note" : "Session"}</small></span>
        </button>)}
        {library.length > 0 && !library.some(item => item.title.toLowerCase().includes(search.toLowerCase())) ? <p className="sidebar-empty">No recordings match “{search}”.</p> : null}
      </nav>
      <div className="sidebar-footer"><span className={`connection-dot ${queue.online ? "online" : ""}`} />{queue.online ? "Connected" : "Offline · saved audio waits"}<p>Saved in this browser.<br />Keep original audio as your backup.</p></div>
    </aside>
    <main id="echo-main" className="echo-main">
      <header className="workspace-topbar"><Button variant="ghost" size="icon" className="mobile-menu" aria-label="Toggle recordings" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><PanelLeft /></Button><span>{selected ? "Your recordings / Echo" : "Your space to listen"}</span><span className="topbar-note"><span className="connection-dot online" /> Browser-local library</span></header>
      <div className="workspace-content">
        {libraryState.error ? <p role="alert" className="echo-alert">{libraryState.error}</p> : null}
        {!status.ready ? <div className="echo-alert" role="alert"><strong>Recording is unavailable</strong><p>Your saved recordings are still here. An owner needs to finish the server provider setup.</p><details><summary>Setup details</summary><ul>{status.problems.map(problem => <li key={problem}>{problem}</li>)}</ul></details></div> : null}
        {failure ? <div role="alert" className="echo-alert"><strong>{failure.title}</strong><p>{failure.detail}</p>{failure.retryable ? <p>You can try again when ready.</p> : null}</div> : null}
        {queue.error ? <p role="alert" className="echo-alert">{queue.error}</p> : null}
        {queue.space?.nearFull ? <p role="alert" className="echo-alert">Storage is nearly full. Download your audio; Echo never deletes it to make room.</p> : null}
        {!queue.locksAvailable && queue.ready ? <p role="alert" className="echo-alert">Use a current browser with Web Locks to safely save and process recordings.</p> : null}
        {!selected && !capturing ? <>
          <div className="home-heading"><p className="eyebrow">A LITTLE MORE PRESENT</p><h1 className="text-4xl">Listen now.<br /><span>Come back to everything.</span></h1><p>A passing thought. A good conversation. An entire lecture.<br className="desktop-break" /> Make room for the moment. Echo keeps the words.</p></div>
        </> : null}
        {!selected || capturing ? <section className={`capture-card ${phase === "recording" ? "is-recording" : ""}`} aria-label="Recording controls">
          <div className="capture-status"><span className="connection-dot online" />{phase === "recording" ? "Recording your Echo" : phase === "starting" ? "Waiting for your microphone" : phase === "processing" ? "Saving the final audio" : "Ready when you are"}</div>
          <div className="capture-timer" role="timer" aria-label="Recorded duration">{capturing ? clock(elapsedMs) : "00:00"}</div>
          <div className="recording-mark" aria-hidden="true">{[12,20,32,18,44,28,52,34,22,42,16,28,12].map((height,index) => <i key={index} style={{ height, animationDelay: `${index * .09}s` }} />)}</div>
          {phase === "recording" ? <Button className="capture-button stop-button" onClick={stop}><Square fill="currentColor" /> Stop & save</Button> : <Button className="capture-button" disabled={busy || !status.ready} onClick={() => { void start(); }}><Mic />{phase === "starting" ? "Starting…" : phase === "processing" ? "Saving…" : "Start recording"}</Button>}
          <p className="capture-hint">{phase === "recording" ? `${chunkIndex} audio clips saved · Transcribing as you go${headroomMinutes === null ? "" : ` · about ${headroomMinutes} min of storage left`}` : "Records until you press stop. No mode to choose."}</p>
          <p className="capture-footnote">Keep this tab open and your device awake while recording.</p>
        </section> : null}
        {!selected && !capturing ? <>
          <div className="home-bottom"><div><span className="eyebrow">THOUGHTFULLY ORGANIZED</span><h2>Small thoughts.<br /> Long conversations.</h2><p>Finished recordings up to a minute become Quick Notes. Everything longer becomes a Session. You can always change the label.</p></div><div className="import-panel"><DeviceImport disabled={!queue.ready} processingReady={status.ready} onImport={async (recording, progress) => { setImporting(true); try { await queue.importDevice(recording, progress); openRecording(recording.sessionId); } finally { setImporting(false); } }} /></div></div>
        </> : null}
        {selected && selectedTranscript ? <section className="recording-detail" aria-label="Selected recording">
          <div className="detail-heading"><div className="eyebrow">{selected.kind === "quick-note" ? "QUICK NOTE" : "SESSION"} · {clock(selected.duration)}</div>
            <RecordingTitle key={selected.id} title={selected.title} onSave={title => libraryState.save(selected.id, { title })} />
            <div className="detail-meta"><span className={`status-pill ${selected.blocked || !selected.complete ? "partial" : ""}`}>{capturing ? "Recording" : selected.unsaved ? "Audio needs saving" : selected.blocked ? "Processing needs retry" : selected.pending ? "Transcribing…" : selectedTranscript.status === "final" ? "Transcript ready" : "Partial recording"}</span>
              <label>Organize as <select aria-label="Recording category" value={libraryState.preferences[selected.id]?.kind ?? "auto"} onChange={event => libraryState.save(selected.id, { kind: event.target.value === "auto" ? undefined : event.target.value as EchoKind })}><option value="auto">Automatic</option><option value="quick-note">Quick Note</option><option value="session">Session</option></select></label>
            </div><p className="classification-hint">{libraryState.preferences[selected.id]?.kind ? "You chose this category. Select Automatic to use the duration rule." : selected.complete ? "Automatically organized by length: up to 1 minute is a Quick Note; longer is a Session." : "Completion isn’t confirmed yet. Automatic organization keeps this as a Session."}</p>
          </div>
          <div className="detail-tabs" aria-label="Recording views">{(["notes", "transcript", "audio"] as const).map(view => <button key={view} aria-pressed={tab === view} onClick={() => setTab(view)}>{view === "notes" ? <NotebookPen size={16} /> : view === "transcript" ? <AlignLeft size={16} /> : <Headphones size={16} />}{view === "audio" ? "Original audio" : view[0].toUpperCase() + view.slice(1)}</button>)}</div>
          <div className="detail-body">
            <div hidden={tab !== "notes"}><SessionArtifacts key={selected.id} transcript={selectedTranscript} /><QuickNotes entries={selected.results} online={queue.online} />
              {selected.results.some(entry => entry.result) ? <details className="original-results"><summary>Saved clip notes & processing details</summary><p>Original per-clip results, available even offline. Session notes above combine the whole recording.</p>{selected.results.filter(entry => entry.result).map(entry => <div key={chunkKey(entry)}><p>Clip {entry.metadata.sequence + 1}</p><RecordingOutcome result={entry.result!} /></div>)}</details> : null}
            </div>
            {tab === "transcript" ? <SessionTranscript transcript={selectedTranscript} showArtifacts={false} audio={selected.audio} /> : null}
            {tab === "audio" ? <div className="audio-library"><h2>Original audio</h2><p>Saved on this browser, with no verified remote backup. Downloads preserve each original clip, including overlap. Nothing is deleted after transcription.</p><SessionTranscript transcript={selectedTranscript} showArtifacts={false} audio={selected.audio} /><details className="original-results"><summary>Original clips & downloads</summary>{selected.audio.map(chunk => <ChunkPlayer key={chunkKey(chunk)} chunk={chunk} saved={queue.entries.some(entry => chunkKey(entry) === chunkKey(chunk))} disabled={busy} onSave={() => { void queue.persist(chunk).then(queue.finished).catch(() => {}); }} />)}</details></div> : null}
          </div>
          {selected.pending || selected.blocked ? <div className="processing-footer"><p>{selected.pending} clips waiting · {queue.online ? "Processing continues while this page is open." : "Saved audio will process when you reconnect."}</p><Button variant="outline" size="sm" disabled={queue.working || !queue.online} onClick={() => { void queue.sync(true); }}><RefreshCw /> Retry pending processing</Button></div> : null}
          {selected.unsaved ? <div className="echo-alert" role="alert">Some audio could not be saved. Open Original audio and download it before leaving.</div> : null}
        </section> : null}
        <footer className="workspace-footer"><span>Made for being here.</span><details><summary>Storage & privacy</summary><p>Chunk processing: {progress.transcribed} transcribed · {progress.uploading} uploading · {progress.waiting} waiting · {progress.retrying} retrying · {progress.blocked} blocked</p><label>Chunk overlap <select aria-label="Chunk overlap" value={overlapMs} disabled={capturing} onChange={event => setOverlapMs(Number(event.target.value))}><option value={2000}>2 seconds</option><option value={5000}>5 seconds</option><option value={10000}>10 seconds</option></select></label><p>Audio and names stay in this browser. Site data can be cleared or evicted. Closing or backgrounding the page can interrupt recording and pauses processing. Capture stops after four hours or earlier if storage fails. Keep a backup for important moments.</p>{status.ready ? <DisclosureNotice disclosures={status.disclosures} /> : null}</details></footer>
      </div>
    </main>
  </div>;
}

function RecordingTitle({ title, onSave }: { title: string; onSave: (title: string) => boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  return editing ? <form className="rename-form" onSubmit={event => { event.preventDefault(); if (draft.trim() && onSave(draft.trim())) setEditing(false); }}>
    <input autoFocus aria-label="Recording name" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setEditing(false); }} />
    <Button size="sm" type="submit" disabled={!draft.trim()}>Save</Button><Button variant="ghost" size="sm" type="button" onClick={() => setEditing(false)}>Cancel</Button>
  </form> : <div className="title-row"><h1>{title}</h1><Button variant="ghost" size="icon" aria-label="Rename recording" onClick={() => { setDraft(title); setEditing(true); }}><Pencil size={17} /></Button></div>;
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
    <a ref={download} download={`${chunk.metadata.sessionId}-${chunk.metadata.id}.${chunk.audio.type.includes("wav") ? "wav" : chunk.audio.type.includes("mp4") ? "m4a" : chunk.audio.type.includes("ogg") ? "ogg" : "webm"}`} className="underline">Download audio</a>
    {!saved ? <button type="button" disabled={disabled || !chunk.audio.size} onClick={onSave} className="ml-3 rounded border px-3 py-1 disabled:opacity-50">Retry saving</button> : null}
  </div>;
}
