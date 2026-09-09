import type { ProviderDisclosure } from "../lib/providers/types";
import type { RecordingResult } from "../lib/recording/pipeline";

// Transcript and model output are untrusted text. Every value below is rendered
// as a React text node, which escapes it; nothing here may use
// dangerouslySetInnerHTML, and no value is ever placed in an href or a style.

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const RETENTION_TEXT: Readonly<Record<ProviderDisclosure["retention"], string>> = {
  "no-transfer": "nothing is transmitted",
  "vendor-default": "vendor default retention",
  unknown: "retention not confirmed",
};

export function DisclosureNotice({ disclosures }: { disclosures: readonly ProviderDisclosure[] }) {
  // Array.isArray widens a readonly array to any[], so the checked value is
  // annotated back to its declared type before anything reads a field.
  const valid: readonly ProviderDisclosure[] = Array.isArray(disclosures) ? disclosures.filter((entry) => entry &&
    (entry.port === "transcription" || entry.port === "notes") &&
    (entry.processor === "external" || entry.processor === "local") &&
    typeof entry.model === "string" && (entry.endpointHost === null || typeof entry.endpointHost === "string") &&
    (entry.retention === "no-transfer" || entry.retention === "vendor-default" || entry.retention === "unknown")) : [];
  if (!Array.isArray(disclosures) || valid.length !== disclosures.length) {
    return <p role="alert" className="mt-4 text-sm text-amber-800">Saved processor disclosure is invalid. External processing details cannot be confirmed.</p>;
  }
  const external = valid.filter((entry) => entry.processor === "external");
  return (
    <section aria-labelledby="disclosure-title" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <h2 id="disclosure-title" className="font-medium text-slate-900">
        {external.length === 0 ? "No external processing" : "External processing"}
      </h2>
      <ul className="mt-2 space-y-1">
        {valid.map((entry) => (
          <li key={entry.port}>
            {entry.port === "transcription" ? "Audio" : "Transcript"} → {entry.endpointHost ?? "this server"}
            {" · "}{entry.model}{" · "}{RETENTION_TEXT[entry.retention]}
          </li>
        ))}
      </ul>
    </section>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-7 text-slate-700">
        {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

export function RecordingOutcome({ result }: { result: RecordingResult }) {
  const transcript = result?.transcript, notes = result?.notes;
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
  if (!transcript || typeof transcript.text !== "string" || !Array.isArray(transcript.segments) ||
      !transcript.segments.every(segment => segment && typeof segment.text === "string" &&
        Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.startMs >= 0 && segment.endMs >= segment.startMs) ||
      !notes || typeof notes.title !== "string" || typeof notes.summary !== "string" ||
      !strings(notes.keyPoints) || !strings(notes.actionItems)) {
    return <div className="mt-6"><p role="alert">Some saved per-chunk result data is invalid. Audio is retained; available session text is shown above.</p><DisclosureNotice disclosures={result?.disclosures} /></div>;
  }
  return (
    <div className="mt-10 space-y-8">
      <section aria-labelledby="notes-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="notes-title" className="text-2xl font-semibold tracking-tight text-slate-950">{notes.title}</h2>
        <p className="mt-3 leading-7 text-slate-700">{notes.summary}</p>
        <List title="Key points" items={notes.keyPoints} />
        <List title="Action items" items={notes.actionItems} />
      </section>

      <section aria-labelledby="transcript-title" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="transcript-title" className="text-lg font-semibold text-slate-900">Transcript</h2>
        {transcript.segments.length > 0 ? (
          <ol className="mt-4 space-y-2">
            {transcript.segments.map((segment, index) => (
              <li key={`${segment.startMs}-${index}`} className="flex gap-4 leading-7">
                <span className="shrink-0 pt-0.5 font-mono text-sm text-slate-400">{clock(segment.startMs)}</span>
                <span className="text-slate-700">{segment.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 leading-7 text-slate-700">{transcript.text}</p>
        )}
      </section>

      <DisclosureNotice disclosures={result.disclosures} />
    </div>
  );
}
