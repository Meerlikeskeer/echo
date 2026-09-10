import assert from "node:assert/strict";
import { test } from "node:test";
import { describeGaps, isRevisionInput, transcriptRevision, type RevisionInput } from "../src/lib/recording/artifacts";
import { recordingHeadroom } from "../src/lib/recording/storage-estimate";
import { validateStoredGuide } from "../src/lib/recording/artifact-store";
import { TRANSCRIPTION_TIMEOUT_MS, CHUNK_NOTES_TIMEOUT_MS, ARTIFACT_TIMEOUT_MS, RECORDING_REQUEST_TIMEOUT_MS, ARTIFACT_REQUEST_TIMEOUT_MS } from "../src/lib/recording/request-policy";
import { createOpenAiCompatibleNotesProvider, createOpenAiCompatibleTranscriptionProvider } from "../src/lib/providers/openai-compatible";
import { createFixtureNotesProvider } from "../src/lib/providers/fixture";
import { stitchSession } from "../src/lib/recording/stitching";
import { checksum, type PlayableChunk } from "../src/lib/recording/session";
import { readFileSync } from "node:fs";

const input: RevisionInput = { sessionId: "lecture", status: "partial", text: "A B C D", segments: [
  { text: "A", startMs: 0, endMs: 10000 }, { text: "B", startMs: 12000, endMs: 20000 },
  { text: "C", startMs: 20000, endMs: 300000 }, { text: "D", startMs: 600000, endMs: 610000 },
], gaps: [{ reason: "missing-chunk", sequence: 1 }] };

async function chunk(sequence: number, bytes = 255000, startMs = sequence * 10000, endMs = startMs + 10000): Promise<PlayableChunk> {
  const audio = new Blob([new Uint8Array(bytes)], { type: "audio/webm" });
  return { audio, metadata: { id: `chunk-${sequence}`, sessionId: "lecture", sequence, startMs, endMs, overlapMs: 0, mimeType: audio.type, size: audio.size, checksum: await checksum(audio) } };
}

test("gaps never use segment indexes or silence as chunk timing", () => {
  assert.ok(isRevisionInput(input));
  assert.deepEqual(describeGaps(input), ["chunk 2 (time unknown): audio chunk unavailable in this browser"]);
  const timed = { ...input, gaps: [{ reason: "missing-transcript", sequence: 1, startMs: 300000, endMs: 600000 }] };
  assert.deepEqual(describeGaps(timed), ["chunk 2 (chunk bounds 5:00 to 10:00): transcript unavailable; audio may still be saved"]);
  assert.match(describeGaps({ ...input, gaps: [{ reason: "invalid-input", sequence: null }] })[0], /invalid session data/);
});

test("gap timing and generator text change artifact revision; invalid gap bounds are refused", async () => {
  const timed = { ...input, gaps: [{ ...input.gaps[0], startMs: 300000, endMs: 600000 }] };
  assert.notEqual(await transcriptRevision(input), await transcriptRevision(timed));
  assert.notEqual(await transcriptRevision(input), await transcriptRevision({ ...input, text: "changed" }));
  for (const gap of [{ ...timed.gaps[0], endMs: -1 }, { ...timed.gaps[0], startMs: undefined }, { reason: "missing-chunk", sequence: -1 }]) {
    assert.equal(isRevisionInput({ ...input, gaps: [gap] }), false);
  }
});

test("stitcher carries actual saved or manifest chunk bounds for first middle and last gaps", async () => {
  const chunks = await Promise.all([chunk(0, 8), chunk(1, 8), chunk(2, 8)]);
  const completion = { sessionId: "lecture", chunks: chunks.map(c => c.metadata) };
  for (const missing of [0, 1, 2]) {
    const result = stitchSession({ sessionId: "lecture", completion, chunks: chunks.filter(c => c.metadata.sequence !== missing) });
    assert.deepEqual(result.gaps.find(g => g.reason === "missing-chunk"), { reason: "missing-chunk", sequence: missing, startMs: missing * 10000, endMs: (missing + 1) * 10000 });
    const pending = result.gaps.find(g => g.reason === "missing-transcript")!;
    assert.equal(pending.startMs, pending.sequence! * 10000);
  }
});

test("storage headroom follows actual encoded bytes and subtracts reserve and unfinished audio", async () => {
  const highRate = await chunk(0, 1530000, 0, 60000); // 204 kbit/s
  const available = 60 * 1024 * 1024;
  const minutes = recordingHeadroom([highRate], "lecture", available, 60000, 60000, 5000, 8 * 1024 * 1024)!;
  assert.ok(minutes > 25 && minutes < 35, `conservative actual estimate: ${minutes}`);
  assert.ok(recordingHeadroom([highRate], "lecture", available, 120000, 60000, 5000, 8 * 1024 * 1024)! < minutes);
  assert.equal(recordingHeadroom([highRate], "new-session", available, 0, 60000, 5000, 0), null);
  assert.equal(recordingHeadroom([], "lecture", available, 0, 60000, 5000, 0), null);
  assert.equal(recordingHeadroom([highRate], "lecture", 1000, 60000, 60000, 5000, 0), 0);
  assert.ok(recordingHeadroom([highRate], "lecture", available, 60000, 60000, 5000, 0)! < recordingHeadroom([highRate], "lecture", available, 60000, 60000, 0, 0)!);
});

test("provider signals and route/client deadlines allow the whole sequential pipeline", async () => {
  const deadlines: number[] = [];
  const original = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => { deadlines.push(ms); return new AbortController().signal; };
  try {
    const artifacts = await createFixtureNotesProvider().generateArtifacts({ text: "lecture", segments: [], durationMs: 1000, language: null });
    const settings = { baseUrl: "https://example.test", apiKey: "synthetic", model: "fixture", fetchImpl: (async (url: string | URL | Request) => new Response(JSON.stringify(String(url).includes("transcriptions") ? { text: "lecture", segments: [], duration: 1 } : { choices: [{ message: { content: JSON.stringify(artifacts) } }] }))) as typeof fetch };
    const transcript = await createOpenAiCompatibleTranscriptionProvider(settings).transcribe({ bytes: new Uint8Array([1]), mimeType: "audio/webm", durationMs: 1000, fileName: "lecture.webm" });
    await createOpenAiCompatibleNotesProvider(settings).generateNotes(transcript);
    await createOpenAiCompatibleNotesProvider(settings).generateArtifacts(transcript);
    assert.deepEqual(deadlines, [TRANSCRIPTION_TIMEOUT_MS, CHUNK_NOTES_TIMEOUT_MS, ARTIFACT_TIMEOUT_MS]);
    const routeMs = 300000;
    assert.ok(TRANSCRIPTION_TIMEOUT_MS + CHUNK_NOTES_TIMEOUT_MS < routeMs);
    assert.ok(ARTIFACT_TIMEOUT_MS < routeMs);
    assert.ok(RECORDING_REQUEST_TIMEOUT_MS > routeMs && ARTIFACT_REQUEST_TIMEOUT_MS > routeMs);
    for (const path of ["../src/app/api/recordings/route.ts", "../src/app/api/sessions/artifacts/route.ts"]) assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /export const maxDuration = 300;/);
  } finally { AbortSignal.timeout = original; }
});

test("saved guides reject corrupted records and preserve generation and transcript identity", async () => {
  const artifacts = await createFixtureNotesProvider().generateArtifacts({ text: "lecture", segments: [], durationMs: 1000, language: null });
  const record = { sessionId: "lecture", transcriptRevision: "a".repeat(64), generation: 4, artifacts };
  assert.deepEqual(validateStoredGuide(JSON.parse(JSON.stringify(record))), record);
  assert.equal(validateStoredGuide({ ...record, generation: -1 }), null);
  assert.equal(validateStoredGuide({ ...record, artifacts: {} }), null);
});
