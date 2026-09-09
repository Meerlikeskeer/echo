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
      ? <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
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

    {empty
      ? <p className="mt-2 text-sm text-slate-500">There is no transcript text to summarize yet.</p>
      : <p className="mt-2 text-xs text-slate-500">
          Generated on request, from the transcript above. {transcript.status === "final"
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
      <h4 className="text-sm font-semibold text-slate-900">Title</h4>
      <p className="mt-1 text-sm leading-6 text-slate-700">{record.artifacts.title}</p>
      <h4 className="mt-4 text-sm font-semibold text-slate-900">Summary</h4>
      <p className="mt-1 text-sm leading-6 text-slate-700">{record.artifacts.summary}</p>
      <Items heading="Key points" items={record.artifacts.keyPoints} empty="No key points were identified." />
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
