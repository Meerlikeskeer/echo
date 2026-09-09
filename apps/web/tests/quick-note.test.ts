import assert from "node:assert/strict";
import { test } from "node:test";
import { validateQuickNote, isQuickNoteCapture } from "../src/lib/recording/quick-note";
import { createFixtureNotesProvider, createFixtureTranscriptionProvider } from "../src/lib/providers/fixture";
import { createOpenAiCompatibleNotesProvider } from "../src/lib/providers/openai-compatible";
import { processRecording } from "../src/lib/recording/pipeline";
import { ProviderError } from "../src/lib/providers/errors";
import { isAudioChunk } from "../src/lib/recording/session";
import { jobKey } from "../src/lib/recording/job-ledger";

const transcript = { text: "Remind me to call next Friday. An idea: try a walking meeting.", segments: [], durationMs: 6000, language: "en" };
const classified = { items: [
  { kind: "reminder", text: "Call", dateText: "next Friday" },
  { kind: "idea", text: "Try a walking meeting", dateText: null },
  { kind: "task", text: "Review notes", dateText: null },
  { kind: "note", text: "The meeting moved", dateText: null },
] };

test("Quick Note accepts all four kinds and preserves unresolved date language", () => {
  assert.deepEqual(validateQuickNote(classified), classified);
});

test("Quick Note refuses unknown fields, types, empty, oversized and duplicate suggestions", () => {
  for (const value of [null, [], {}, { ...classified, scheduled: true }, { items: [] },
    { items: [{ kind: "calendar", text: "Call", dateText: null }] },
    { items: [{ kind: "task", text: "", dateText: null }] },
    { items: [{ kind: "task", text: "x".repeat(501), dateText: null }] },
    { items: [{ kind: "task", text: "Call" }] },
    { items: [{ kind: "task", text: "Call", dateText: 123 }] },
    { items: [{ kind: "task", text: "Call", dateText: "" }] },
    { items: [{ kind: "task", text: "Call", dateText: "x".repeat(201) }] },
    { items: [{ ...classified.items[0], dueAt: "2026-01-01" }] },
    { items: [classified.items[0], { ...classified.items[0], text: " CALL " }] },
    { items: Array.from({ length: 21 }, (_, i) => ({ kind: "task", text: String(i), dateText: null })) },
  ]) assert.equal(validateQuickNote(value), null);
});

test("Quick Note pipeline classifies instead of paying for a second notes call", async () => {
  const notes = createFixtureNotesProvider();
  notes.generateNotes = async () => { throw new Error("ordinary notes must not run"); };
  const result = await processRecording({ bytes: new Uint8Array([1]), mimeType: "audio/webm", fileName: "test", durationMs: 6000 },
    { transcription: createFixtureTranscriptionProvider(), notes }, { quickNote: true });
  assert.equal(result.quickNote?.items[0].kind, "task");
  assert.deepEqual(result.notes.actionItems, ["Review the generated notes."]);
  assert.equal(result.disclosures.length, 2);
});

test("Quick Note provider requests structured classification and preserves date phrases from the response", async () => {
  let request: Record<string, unknown> | undefined;
  const provider = createOpenAiCompatibleNotesProvider({ baseUrl: "https://example.invalid/v1", apiKey: "synthetic-key", model: "synthetic", fetchImpl: async (_input, init) => {
    request = JSON.parse(init!.body as string);
    return Response.json({ choices: [{ message: { content: JSON.stringify(classified) } }] });
  } });
  assert.deepEqual(await provider.classifyQuickNote(transcript), classified);
  assert.deepEqual(request!.response_format, { type: "json_object" });
  const messages = request!.messages as { content: string }[];
  assert.match(messages[0].content, /Never resolve relative or ambiguous dates/);
  assert.match(messages[1].content, /next Friday/);
});

test("Quick Note malformed provider response becomes a safe error", async () => {
  for (const content of ['{"items":[]}', 'private response text', JSON.stringify({ ...classified, scheduled: true })]) {
    const provider = createOpenAiCompatibleNotesProvider({ baseUrl: "https://example.invalid/v1", apiKey: "synthetic-key", model: "synthetic", fetchImpl: async () => Response.json({ choices: [{ message: { content } }] }) });
    await assert.rejects(provider.classifyQuickNote(transcript), error => error instanceof ProviderError && error.code === "invalid_response" && !error.message.includes(content));
  }
});

test("Quick Note metadata is bounded and cannot turn a later chunk into a short capture", () => {
  const metadata = { sessionId: "test", id: "test", sequence: 0, startMs: 0, endMs: 6000, overlapMs: 0, mimeType: "audio/webm", size: 1, checksum: "a".repeat(64), quickNote: { stoppedAt: 1000, onlineAtStop: false } };
  assert.ok(isAudioChunk(metadata));
  assert.equal(isAudioChunk({ ...metadata, sequence: 1 }), false);
  assert.equal(isAudioChunk({ ...metadata, endMs: 60001 }), false);
  for (const bad of [{ stoppedAt: -1, onlineAtStop: true }, { stoppedAt: 1 }, { stoppedAt: 1, onlineAtStop: "yes" }, { stoppedAt: 1, onlineAtStop: true, extra: true }]) assert.equal(isQuickNoteCapture(bad), false);
});

test("ledger cannot replay ordinary notes as Quick Note classification", () => {
  const identity = { sessionId: "s", id: "c", checksum: "a".repeat(64) };
  assert.notEqual(jobKey(identity), jobKey({ ...identity, mode: "quick-note" }));
});
