import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionTranscript, SessionTranscripts } from "../src/app/session-transcript";
import { stitchSession } from "../src/lib/recording/stitching";
import type { AudioChunk } from "../src/lib/recording/session";

const metadata = (sessionId: string, sequence = 0): AudioChunk => ({
  sessionId, id: `${sessionId}-${sequence}`, sequence, startMs: sequence * 9000,
  endMs: sequence * 9000 + 10000, overlapMs: sequence ? 1000 : 0,
  mimeType: "audio/webm", size: 10, checksum: "a".repeat(64),
});
function entry(sessionId: string, text: string) {
  return { metadata: metadata(sessionId), transcript: { text, segments: [{ startMs: 1000, endMs: 2000, text }], language: null, durationMs: 10000 } };
}
const manifest = (sessionId: string) => ({ sessionId, chunks: [metadata(sessionId)] });
const html = (element: React.ReactNode) => renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");

test("WEB-006 session presentation names final state timestamps and source chunk", () => {
  const transcript = stitchSession({ sessionId: "one", chunks: [entry("one", "Synthetic speech")], completion: manifest("one") });
  const rendered = html(<SessionTranscript transcript={transcript} />);
  assert.match(rendered, /Session transcript/);
  assert.match(rendered, /Final/);
  assert.match(rendered, /00:01/);
  assert.match(rendered, /[Cc]hunk 1/);
  assert.match(rendered, /Synthetic speech/);
});

test("WEB-006 partial session presentation identifies missing chunk", () => {
  const transcript = stitchSession({ sessionId: "one", chunks: [entry("one", "Available")], completion: { sessionId: "one", chunks: [metadata("one"), metadata("one", 1)] } });
  const rendered = html(<SessionTranscript transcript={transcript} />);
  assert.match(rendered, /Partial/);
  assert.match(rendered, /[Mm]issing[^<]*[Cc]hunk 2|[Cc]hunk 2[^<]*[Mm]issing/);
  assert.match(rendered, /Available/);
});

test("WEB-006 session presentation escapes transcript and provenance source text", () => {
  const hostile = '<script>alert("synthetic")</script>';
  const transcript = stitchSession({ sessionId: "one", chunks: [entry("one", hostile)], completion: manifest("one") });
  const rendered = html(<SessionTranscript transcript={transcript} />);
  assert.doesNotMatch(rendered, /<script>/);
  assert.match(rendered, /&lt;script&gt;/);
});

test("WEB-006 recovered sessions group separately and require their own manifest", () => {
  const rendered = html(<SessionTranscripts entries={[entry("one", "First session"), entry("two", "Second session")]} completions={[manifest("one")]} />);
  assert.equal((rendered.match(/Session transcript/g) ?? []).length, 2);
  assert.equal((rendered.match(/Final/g) ?? []).length, 1);
  assert.equal((rendered.match(/Partial/g) ?? []).length, 1);
  assert.match(rendered, /First session/);
  assert.match(rendered, /Second session/);
});

test("WEB-006 grouping keeps recovered missing-result sessions partial", () => {
  const rendered = html(<SessionTranscripts entries={[{ metadata: metadata("one") }]} completions={[manifest("one")]} />);
  assert.match(rendered, /Partial/);
  assert.doesNotMatch(rendered, /Final/);
  assert.match(rendered, /[Cc]hunk 1/);
  assert.match(rendered, /[Mm]issing|[Ww]aiting|[Pp]ending/);
});
