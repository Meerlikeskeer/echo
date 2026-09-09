"use client";

// useId is a hook, so this file cannot render inside a Server Component.
// It works today only because its one importer declares "use client"; the
// directive states the constraint here instead of inheriting it.
import { useId } from "react";
import { stitchSession, type StitchedTranscript, type TranscriptEntry } from "../lib/recording/stitching";
import type { Completion } from "../lib/recording/session-completion";
import { SessionArtifacts } from "./session-artifacts";

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function SessionTranscript({ transcript }: { transcript: StitchedTranscript }) {
  // The heading names the section, so repeating it in an aria-label would only
  // duplicate it. useId keeps the reference unique when several sessions render
  // together; a session identifier could repeat or be invalid.
  const headingId = useId();
  return <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" aria-labelledby={headingId}>
    <div className="flex items-center justify-between gap-4">
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">Session transcript</h2>
      <span className="text-sm text-slate-600">{transcript.status === "final" ? "Final" : "Partial"}</span>
    </div>
    <p className="mt-2 text-xs text-slate-500">Session {transcript.sessionId.slice(0, 8)} · Times are relative to session start.</p>
    {transcript.gaps.length ? <ul className="mt-4 space-y-1 text-sm text-amber-800">
      {transcript.gaps.map((gap, index) => <li key={index}>{
        gap.reason === "missing-chunk" ? `Missing chunk ${(gap.sequence ?? 0) + 1}.` :
        gap.reason === "missing-transcript" ? `Missing transcript for chunk ${(gap.sequence ?? 0) + 1}. Waiting for processing.` :
        gap.reason === "capture-unconfirmed" ? "Capture completion is unconfirmed. A recording interruption may have left missing audio." :
        "Some saved session data is inconsistent or invalid. Completion cannot be confirmed."
      }</li>)}
    </ul> : null}
    <ol className="mt-4 space-y-4">
      {transcript.segments.map((segment, index) => <li key={index}>
        <p className="leading-7 text-slate-700">{segment.text}</p>
        <p className="text-xs text-slate-500">{clock(segment.startMs)}–{clock(segment.endMs)} · {segment.sourceIndexes.map(i => `Chunk ${transcript.sources[i].sequence + 1}`).join(", ")}</p>
        <details className="mt-1 text-xs text-slate-500"><summary>Original sources</summary>
          <ul className="mt-2 space-y-2">{segment.sourceIndexes.map(i => {
            const source = transcript.sources[i];
            return <li key={i}>Chunk {source.sequence + 1} · {clock(source.startMs)}–{clock(source.endMs)}{source.segmentIndex === null ? " · Coarse chunk bounds; word timing unavailable" : " · Provider segment"}<p>{source.originalText}</p></li>;
          })}</ul>
        </details>
      </li>)}
    </ol>
    {!transcript.segments.length ? <p className="mt-4 text-sm text-slate-500">Waiting for a transcript. Saved audio remains available below.</p> : null}
    {/* The badge above carries the status; this note explains what that word
        means without reading as a second status of its own. */}
    <p className="mt-4 text-xs text-slate-500">Only verified overlapping segments are merged. Uncertain repetition is kept to preserve speech. A session is final only when this browser saved its own record that capture finished and nothing above is missing; anything else stays partial. Neither status claims a verified remote copy of the audio.</p>
    {/* WEB-007. Inside the transcript section on purpose: the artifacts are
        generated from exactly the transcript rendered above, and the revision
        rule means they are only ever valid against it. */}
    <SessionArtifacts transcript={transcript} />
  </section>;
}

/** Recovery and live results use the same grouping boundary. Completion is
 * associated only by session identity, never by array position. */
export function SessionTranscripts({ entries, completions }: { entries: readonly TranscriptEntry[]; completions: readonly Completion[] }) {
  const sessions = new Map<string, TranscriptEntry[]>();
  for (const entry of entries) {
    const id = entry?.metadata?.sessionId;
    if (typeof id !== "string") continue;
    sessions.set(id, [...(sessions.get(id) ?? []), entry]);
  }
  for (const completion of completions) {
    if (completion && typeof completion.sessionId === "string" && !sessions.has(completion.sessionId)) sessions.set(completion.sessionId, []);
  }
  return <>{[...sessions].sort(([a], [b]) => a.localeCompare(b)).map(([sessionId, chunks]) => {
    const manifests = completions.filter(c => c && c.sessionId === sessionId);
    // IndexedDB has one row per session. Duplicate evidence passed from any
    // other caller is ambiguous and must fail closed too.
    const completion = manifests.length > 1 ? { sessionId, chunks: [] } : manifests[0] ?? null;
    return <SessionTranscript key={sessionId} transcript={stitchSession({ sessionId, chunks, completion })} />;
  })}</>;
}
