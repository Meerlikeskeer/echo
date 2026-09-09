import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudioChunk } from "../src/lib/recording/session";
import type { Transcript, TranscriptSegment } from "../src/lib/providers/types";
import { stitchSession } from "../src/lib/recording/stitching";

function metadata(sequence: number): AudioChunk {
  return { sessionId: "session", id: `chunk-${sequence}`, sequence, startMs: sequence * 9000,
    endMs: sequence * 9000 + 10000, overlapMs: sequence ? 1000 : 0,
    mimeType: "audio/webm", size: 10, checksum: "a".repeat(64) };
}
function transcript(...segments: TranscriptSegment[]): Transcript {
  return { text: segments.map(s => s.text).join(" "), segments, language: "en", durationMs: 10000 };
}
const seg = (startMs: number, endMs: number, text: string) => ({ startMs, endMs, text });
const row = (sequence: number, ...segments: TranscriptSegment[]) => ({ metadata: metadata(sequence), transcript: transcript(...segments) });
const completion = (count: number) => ({ sessionId: "session", chunks: Array.from({ length: count }, (_, i) => metadata(i)) });

test("WEB-006 orders arrival-independent session timestamps without mutating source inputs", () => {
  const chunks = [row(0, seg(1000, 2000, "First")), row(1, seg(12000, 13000, "Second"))];
  const before = JSON.stringify(chunks);
  const expected = stitchSession({ sessionId: "session", chunks, completion: completion(2) });
  assert.deepEqual(stitchSession({ sessionId: "session", chunks: [...chunks].reverse(), completion: completion(2) }), expected);
  assert.equal(expected.text, "First Second");
  assert.deepEqual(expected.segments.map(s => s.startMs), [1000, 12000]);
  assert.equal(expected.status, "final");
  assert.equal(JSON.stringify(chunks), before);
});

test("WEB-006 verified overlap renders once and retains both original sources", () => {
  const result = stitchSession({ sessionId: "session", completion: completion(2), chunks: [
    row(0, seg(1000, 2000, "Start"), seg(9200, 9800, "Same words.")),
    row(1, seg(9200, 9800, "same words"), seg(12000, 13000, "End")),
  ] });
  assert.equal((result.text.toLowerCase().match(/same words/g) ?? []).length, 1);
  assert.match(result.text, /^Start .* End$/);
  const overlap = result.segments.find(s => /same words/i.test(s.text))!;
  assert.equal(overlap.sourceIndexes.length, 2);
  assert.deepEqual(overlap.sourceIndexes.map(i => result.sources[i].chunkId).sort(), ["chunk-0", "chunk-1"]);
  assert.deepEqual(overlap.sourceIndexes.map(i => result.sources[i].originalText).sort(), ["Same words.", "same words"]);
});

test("WEB-006 repeated speech outside overlap remains repeated", () => {
  const result = stitchSession({ sessionId: "session", completion: completion(2), chunks: [
    row(0, seg(1000, 2000, "Again")), row(1, seg(12000, 13000, "Again")),
  ] });
  assert.equal(result.text, "Again Again");
});

test("WEB-006 repeated speech at distinct times inside overlap remains repeated", () => {
  const result = stitchSession({ sessionId: "session", completion: completion(2), chunks: [
    row(0, seg(9050, 9300, "Yes")), row(1, seg(9600, 9850, "Yes")),
  ] });
  assert.equal(result.text, "Yes Yes");
});

test("WEB-006 broad ambiguous segments preserve repeated text and unmatched words", () => {
  const result = stitchSession({ sessionId: "session", completion: completion(2), chunks: [
    row(0, seg(0, 10000, "Keep saying yes")), row(1, seg(9000, 19000, "yes and continue")),
  ] });
  assert.equal(result.text, "Keep saying yes yes and continue");
});

test("WEB-006 overlap alignment continues across three chunks", () => {
  const result = stitchSession({ sessionId: "session", completion: completion(3), chunks: [
    row(2, seg(18200, 18800, "Beta"), seg(21000, 22000, "Finish")),
    row(0, seg(9200, 9800, "Alpha")),
    row(1, seg(9200, 9800, "Alpha"), seg(18200, 18800, "Beta")),
  ] });
  assert.equal(result.text, "Alpha Beta Finish");
  assert.equal(result.sources.length, 5);
});

for (const missing of [0, 1, 2]) {
  test(`WEB-006 flags missing expected chunk ${missing} without hiding available text`, () => {
    const chunks = [0, 1, 2].filter(i => i !== missing).map(i => row(i, seg(i * 9000 + 1000, i * 9000 + 2000, `Speech${i}`)));
    const result = stitchSession({ sessionId: "session", chunks, completion: completion(3) });
    assert.equal(result.status, "partial");
    assert.ok(result.gaps.some(g => g.reason === "missing-chunk" && g.sequence === missing));
    for (const c of chunks) assert.ok(result.text.includes(c.transcript.text));
  });
}

test("WEB-006 retry fills a missing transcript and only then finalizes", () => {
  const first = row(0, seg(1000, 2000, "First"));
  const pending = stitchSession({ sessionId: "session", completion: completion(2), chunks: [first, { metadata: metadata(1) }] });
  assert.equal(pending.status, "partial");
  assert.ok(pending.gaps.some(g => g.reason === "missing-transcript" && g.sequence === 1));
  assert.equal(pending.text, "First");
  const done = stitchSession({ sessionId: "session", completion: completion(2), chunks: [first, row(1, seg(12000, 13000, "Recovered"))] });
  assert.equal(done.status, "final");
  assert.deepEqual(done.gaps, []);
});

test("WEB-006 contiguous recovered prefix without capture evidence remains partial", () => {
  const result = stitchSession({ sessionId: "session", chunks: [row(0, seg(1000, 2000, "Saved"))], completion: null });
  assert.equal(result.status, "partial");
  assert.ok(result.gaps.some(g => g.reason === "capture-unconfirmed"));
});

test("WEB-006 text-only and unmatched full transcript content survive", () => {
  for (const segments of [[], [seg(1000, 2000, "Known")]]) {
    const result = stitchSession({ sessionId: "session", completion: completion(1), chunks: [{ metadata: metadata(0), transcript: { text: "Known and otherwise omitted", segments, language: null, durationMs: 10000 } }] });
    assert.ok(result.text.includes("otherwise omitted"));
    assert.ok(result.sources.some(s => s.originalText.includes("otherwise omitted") && s.segmentIndex === null));
  }
});

test("WEB-006 invalid metadata identities and timing fail closed", () => {
  const good = row(0, seg(1000, 2000, "Keep"));
  const badRows = [
    { ...row(1, seg(12000, 13000, "Bad")), metadata: { ...metadata(1), sessionId: "foreign" } },
    { ...row(1, seg(12000, 13000, "Bad")), metadata: { ...metadata(1), overlapMs: 500 } },
    { ...row(1, seg(12000, 13000, "Bad")), metadata: { ...metadata(1), id: "chunk-0" } },
    row(1, seg(Number.NaN, 13000, "Bad")), row(1, seg(14000, 13000, "Bad")),
  ];
  for (const bad of badRows) {
    const result = stitchSession({ sessionId: "session", chunks: [good, bad], completion: completion(2) });
    assert.equal(result.status, "partial");
    assert.ok(result.gaps.some(g => g.reason === "invalid-input"));
    assert.ok(result.text.includes("Keep"));
  }
});

test("WEB-006 conflicting duplicate sequence and completion manifest never finalize", () => {
  const good = row(0, seg(1000, 2000, "Keep"));
  for (const input of [
    { chunks: [good, { ...good, metadata: { ...metadata(0), id: "other" } }], completion: completion(1) },
    { chunks: [good], completion: { ...completion(1), sessionId: "foreign" } },
    { chunks: [good], completion: { sessionId: "session", chunks: [{ ...metadata(0), checksum: "b".repeat(64) }] } },
  ]) {
    const result = stitchSession({ sessionId: "session", ...input });
    assert.equal(result.status, "partial");
    assert.ok(result.gaps.some(g => g.reason === "invalid-input"));
  }
});
