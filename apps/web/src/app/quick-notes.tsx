import type { QueueEntry } from "../lib/recording/queue";
import { chunkKey } from "../lib/recording/queue";
import { validateQuickNote } from "../lib/recording/quick-note";

export function QuickNotes({ entries, online }: { entries: readonly QueueEntry[]; online: boolean }) {
  const notes = entries.filter(entry => entry.metadata.quickNote);
  if (!notes.length) return null;
  return <section aria-label="Quick Notes" className="mt-6 space-y-4">
    <h2 className="text-xl font-semibold">Quick Notes · pending review</h2>
    <p className="text-sm text-slate-600">Suggestions only. Nothing is scheduled or sent to a calendar. Original audio and results stay in this browser.</p>
    {notes.map(entry => {
      const note = validateQuickNote(entry.result?.quickNote);
      const capture = entry.metadata.quickNote!;
      const elapsed = entry.resultReceivedAt === undefined ? null : entry.resultReceivedAt - capture.stoppedAt;
      return <article key={chunkKey(entry)} className="rounded-xl border border-slate-200 bg-white p-4" aria-label={`Quick Note ${entry.metadata.sessionId.slice(0, 8)}`}>
        <p className="text-xs text-slate-500">Quick Note {entry.metadata.sessionId.slice(0, 8)}</p>
        {note ? <ul className="mt-3 space-y-3">{note.items.map((item, index) => <li key={index}>
          <p><span className="font-medium capitalize">{item.kind}</span> · Pending review</p>
          <p className="mt-1">{item.text}</p>
          {item.dateText ? <p className="mt-1 text-sm text-amber-800">Date needs review: “{item.dateText}”. Confirm the exact date, time and timezone; relative or ambiguous dates have not been resolved.</p>
            : item.kind === "reminder" ? <p className="mt-1 text-sm text-amber-800">No date or time identified. Add one before scheduling.</p> : null}
        </li>)}</ul> : <p role="status" className="mt-3 text-sm">{entry.state === "blocked" ? "Classification paused. Audio is saved; use Retry pending processing after fixing the connection or provider issue." : !online ? "Pending offline — audio is saved. Classification resumes when this page is online." : entry.state === "uploading" ? "Transcribing and classifying…" : "Pending classification — audio is saved and waiting to process."}</p>}
        {note ? <p className="mt-3 text-xs text-slate-600">{elapsed !== null && elapsed >= 0 ? `Stop-to-result: ${(elapsed / 1000).toFixed(1)} s.` : "Stop-to-result timing unavailable."} Clip: {((entry.metadata.endMs - entry.metadata.startMs) / 1000).toFixed(1)} s. Browser reported {capture.onlineAtStop ? "online" : "offline"} at stop; {entry.attempts} upload attempt{entry.attempts === 1 ? "" : "s"}. {entry.result?.disclosures.some(item => item.adapter === "fixture") ? "Fixture providers: this is not a live-service speed measurement." : "Provider and connection speed affect this measurement."}</p> : null}
        {entry.result ? <details className="mt-3 text-sm"><summary className="cursor-pointer">Original transcript</summary><p className="mt-2 whitespace-pre-wrap">{entry.result.transcript.text}</p></details> : null}
      </article>;
    })}
    <p className="text-xs text-slate-500">Online target: 5–10 seconds after stop for a short clip. Timing uses this browser’s clock and includes final audio saving, queue waiting, upload, transcription and classification, including offline waits and retries. A reload does not reset it; changes to the system clock can affect it. Device, browser, connection and provider affect speed. This is an observation, not a guaranteed service time.</p>
  </section>;
}
