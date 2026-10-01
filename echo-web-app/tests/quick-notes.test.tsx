import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QuickNotes } from "../src/app/quick-notes";
import type { QueueEntry } from "../src/lib/recording/queue";

const entry: QueueEntry = { audio: new Blob(["synthetic"]), metadata: { sessionId: "session", id: "chunk", sequence: 0, startMs: 0, endMs: 6000, overlapMs: 0, mimeType: "audio/webm", size: 9, checksum: "a".repeat(64), quickNote: { stoppedAt: 1000, onlineAtStop: false } }, state: "pending", attempts: 0, nextAttemptAt: 0 };
const render = (row: QueueEntry, online = true) => renderToStaticMarkup(<QuickNotes entries={[row]} online={online} />).replace(/<!--.*?-->/g, "");

test("Quick Notes show saved offline state without pretending to have a classification", () => {
  const html = render(entry, false);
  assert.match(html, /Pending offline/);
  assert.match(html, /audio is saved/);
  assert.doesNotMatch(html, /Stop-to-result:/);
});

test("Quick Notes preserve date uncertainty, escape output and disclose fixture latency", () => {
  const html = render({ ...entry, state: "processed", attempts: 2, resultReceivedAt: 9000, result: {
    transcript: { text: "Synthetic transcript", segments: [], language: "en", durationMs: 6000 },
    notes: { title: "Quick Note", summary: "Synthetic", keyPoints: [], actionItems: [] },
    disclosures: [{ port: "notes", adapter: "fixture", model: "fixture-notes", processor: "local", endpointHost: null, sends: ["transcript"], retention: "no-transfer" }],
    quickNote: { items: [{ kind: "reminder", text: "<script>unsafe</script>", dateText: "next Friday" }, { kind: "reminder", text: "Call", dateText: null }] },
  } });
  assert.match(html, /Date needs review/);
  assert.match(html, /next Friday/);
  assert.match(html, /No date or time identified/);
  assert.match(html, /Pending review/);
  assert.match(html, /Nothing is scheduled/);
  assert.match(html, /Stop-to-result: 8.0 s/);
  assert.match(html, /2 upload attempts/);
  assert.match(html, /not a live-service speed measurement/);
  assert.match(html, /Original transcript/);
  assert.doesNotMatch(html, /<script>/);
});

test("Quick Notes hide ordinary sessions and show blocked classification honestly", () => {
  assert.equal(render({ ...entry, metadata: { ...entry.metadata, quickNote: undefined } }), "");
  assert.match(render({ ...entry, state: "blocked" }), /Classification paused/);
});
