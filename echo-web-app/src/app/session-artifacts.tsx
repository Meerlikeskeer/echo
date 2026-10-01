"use client";

/**
 * WEB-007. Renders one session's artifacts.
 *
 * Every string here is model output and is rendered as an escaped React text
 * node, never as markup — `ARCHITECTURE.md` requires model and transcribed text
 * be treated as untrusted content.
 */

import { useId } from "react";
import type { RevisionInput } from "../lib/recording/artifacts";
import { useSessionArtifacts } from "./use-session-artifacts";

function Items({ heading, items, empty }: { heading: string; items: readonly string[]; empty: string }) {
  return <div className="mt-4">
    <h4 className="text-sm font-semibold text-slate-900">{heading}</h4>
    {items.length
      ? <ul className="mt-2 list-disc space-y-3 pl-5 text-base leading-7 text-slate-700">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
      : <p className="mt-1 text-sm text-slate-500">{empty}</p>}
  </div>;
}

export function SessionArtifacts({ transcript }: { transcript: RevisionInput }) {
  const headingId = useId();
  const artifacts = useSessionArtifacts(transcript);
  const empty = !transcript.text.trim();
  const record = artifacts.record;

  return <section className="mt-6 border-t border-slate-200 pt-6" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 id={headingId} className="text-base font-semibold text-slate-900">Notes and actions</h3>
      <button
        type="button"
        onClick={() => { void artifacts.generate(); }}
        disabled={artifacts.status === "working" || empty}
        className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {artifacts.status === "working" ? "Writing…" : record ? "Generate again" : "Generate notes"}
      </button>
    </div>

    {artifacts.storageError ? <p role="alert" className="mt-3 text-sm text-amber-800">{artifacts.storageError}</p> : null}
    {record ? <button type="button" className="mt-3 text-sm underline" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `echo-${record.sessionId}-notes.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Download notes</button> : null}
    {empty
      ? <p className="mt-2 text-sm text-slate-500">There is no transcript text to summarize yet.</p>
      : <p className="mt-2 text-xs text-slate-500">
          Generated on request from this recording’s transcript. {transcript.status === "final"
            ? "That transcript is final."
            : "That transcript is still partial, so these notes describe only what has been transcribed so far."}
        </p>}

    {artifacts.error ? <p role="alert" className="mt-3 text-sm text-amber-800">{artifacts.error}</p> : null}

    {/* Outdated notes with a label beat no notes and no reason, so a stale set
        stays on screen and says so rather than disappearing. */}
    {artifacts.stale ? <p role="status" className="mt-3 text-sm text-amber-800">
      The transcript has changed since these notes were written. Generate again to update them.
    </p> : null}

    {record ? <div className="mt-4">
      <h4 className="text-2xl font-semibold tracking-tight text-slate-900">{record.artifacts.title}</h4>
      {/* WEB-017. Shown only when the recording identified itself. An absent
          course is not rendered as "Unknown": a label with nothing behind it
          invites the reader to supply a guess Echo refused to make. */}
      {record.artifacts.course
        ? <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{record.artifacts.course}</p>
        : null}
      <h4 className="mt-5 text-sm font-semibold text-slate-900">Overview</h4>
      <p className="mt-1 text-sm leading-6 text-slate-700">{record.artifacts.summary}</p>
      <Items heading="Key points" items={record.artifacts.keyPoints} empty="No key points were identified." />

      {/* WEB-017. The note guide itself, and the reason the rest of this panel
          exists — so it is rendered as sections rather than folded into one
          more bullet list. */}
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-900">Notes</h4>
        {record.artifacts.outline.length
          ? <div className="mt-3 space-y-7">
              {record.artifacts.outline.map((section, index) => <div key={index}>
                <h5 className="text-lg font-medium text-slate-900">{section.heading}</h5>
                <ul className="mt-2 list-disc space-y-3 pl-5 text-base leading-7 text-slate-700">
                  {section.notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
                </ul>
              </div>)}
            </div>
          : <p className="mt-1 text-sm text-slate-500">No sections were written for this session.</p>}
      </div>

      <div className="mt-5">
        <h4 className="text-sm font-semibold text-slate-900">Terms</h4>
        {record.artifacts.terms.length
          ? <dl className="mt-1 space-y-1 text-sm leading-6 text-slate-700">
              {record.artifacts.terms.map((entry, index) => <div key={index}>
                <dt className="inline font-medium text-slate-900">{entry.term}</dt>
                <dd className="inline"> — {entry.definition}</dd>
              </div>)}
            </dl>
          : <p className="mt-1 text-sm text-slate-500">No terminology was singled out.</p>}
      </div>

      <Items heading="Open questions" items={record.artifacts.openQuestions} empty="Nothing was left explicitly open." />
      <Items heading="Action items" items={record.artifacts.actionItems} empty="No action items were identified." />
      <Items heading="Suggested research" items={record.artifacts.researchTopics} empty="No research topics were suggested." />
      {/* REQ-005 separates suggested research from opt-in external research.
          Nothing here was looked up, and saying so is the whole point: a topic
          list beside a summary reads like findings unless it is labelled. */}
      <p className="mt-2 text-xs text-slate-500">
        Suggested research lists topics worth looking into. Echo has not searched for any of them and states no findings.
      </p>
    </div> : null}
  </section>;
}
