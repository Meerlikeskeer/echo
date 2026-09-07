import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderError } from "../src/lib/providers/errors";
import { createFixtureNotesProvider, createFixtureTranscriptionProvider, FIXTURE_TRANSCRIPT_TEXT } from "../src/lib/providers/fixture";
import { processRecording, validateClip } from "../src/lib/recording/pipeline";
import { describeFailure } from "../src/lib/recording/http";
import type { AudioClip } from "../src/lib/providers/types";

// Synthetic audio only: the WEB-002 acceptance criteria forbid tests that
// depend on a real microphone.
const clip = (overrides: Partial<AudioClip> = {}): AudioClip => ({
  bytes: new Uint8Array(2_048),
  mimeType: "audio/webm;codecs=opus",
  fileName: "recording",
  durationMs: 41_000,
  ...overrides,
});

const providers = () => ({ transcription: createFixtureTranscriptionProvider(), notes: createFixtureNotesProvider() });

test("the slice produces a transcript, notes and disclosures from one clip", async () => {
  const result = await processRecording(clip(), providers());
  assert.equal(result.transcript.text, FIXTURE_TRANSCRIPT_TEXT);
  assert.equal(result.transcript.durationMs, 41_000);
  assert.equal(result.transcript.segments.length, 3);
  assert.equal(result.notes.title, "Fixture recording");
  assert.ok(result.notes.summary.length > 0);
  assert.deepEqual(result.disclosures.map((entry) => entry.port), ["transcription", "notes"]);
});

test("fixture output is deterministic across runs", async () => {
  const [first, second] = [await processRecording(clip(), providers()), await processRecording(clip(), providers())];
  assert.deepEqual(first, second);
});

test("segments are normalized into session time", async () => {
  const result = await processRecording(clip(), providers(), { sessionOffsetMs: 60_000 });
  assert.equal(result.transcript.segments[0].startMs, 60_000);
  assert.equal(result.transcript.segments[2].endMs, 76_000);
});

test("a clip is validated before any provider call", () => {
  const provider = createFixtureTranscriptionProvider({ failWith: "unauthorized" });
  const reject = (audio: AudioClip, code: string) => {
    assert.throws(() => validateClip(audio, provider), (error: unknown) => error instanceof ProviderError && error.code === code && error.port === "transcription");
  };
  reject(clip({ bytes: new Uint8Array(0) }), "invalid_input");
  reject(clip({ mimeType: "video/mp4" }), "invalid_input");
  reject(clip({ mimeType: "" }), "invalid_input");
  reject(clip({ bytes: new Uint8Array(provider.capabilities.maxClipBytes + 1) }), "clip_too_large");
  // A supported type with parameters and odd casing is accepted.
  validateClip(clip({ mimeType: "AUDIO/WEBM; codecs=opus" }), provider);
});

test("an empty transcript is reported as no speech rather than empty notes", async () => {
  await assert.rejects(
    processRecording(clip(), { transcription: createFixtureTranscriptionProvider({ text: "   " }), notes: createFixtureNotesProvider() }),
    (error: unknown) => error instanceof ProviderError && error.code === "no_speech" && !error.retryable,
  );
});

test("a transcription provider failure surfaces with its port and retryability", async () => {
  await assert.rejects(
    processRecording(clip(), { transcription: createFixtureTranscriptionProvider({ failWith: "rate_limited" }), notes: createFixtureNotesProvider() }),
    (error: unknown) => error instanceof ProviderError && error.port === "transcription" && error.code === "rate_limited" && error.retryable,
  );
});

test("an LLM provider failure surfaces after a successful transcription", async () => {
  await assert.rejects(
    processRecording(clip(), { transcription: createFixtureTranscriptionProvider(), notes: createFixtureNotesProvider({ failWith: "unauthorized" }) }),
    (error: unknown) => error instanceof ProviderError && error.port === "notes" && error.code === "unauthorized" && !error.retryable,
  );
});

test("provider failures map onto client-safe statuses", () => {
  const statuses: [string, number][] = [
    ["unconfigured", 503], ["unauthorized", 502], ["rate_limited", 429], ["timeout", 504],
    ["unavailable", 502], ["invalid_response", 502], ["invalid_input", 400], ["clip_too_large", 413], ["no_speech", 422],
  ];
  for (const [code, status] of statuses) {
    const described = describeFailure(new ProviderError("transcription", code as "unavailable"));
    assert.equal(described.status, status, code);
    assert.equal(described.body.code, code);
    assert.equal(described.body.port, "transcription");
  }
});

test("an unexpected failure is never described to the client", () => {
  const described = describeFailure(new Error("Bearer sk-do-not-leak at https://api.example.com/openai/v1"));
  assert.equal(described.status, 500);
  assert.doesNotMatch(JSON.stringify(described.body), /sk-do-not-leak|api\.example\.com/);
  assert.equal(described.body.port, null);
});
