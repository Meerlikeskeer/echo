import assert from "node:assert/strict";
import { test } from "node:test";
import { ProviderError } from "../src/lib/providers/errors";
import { createOpenAiCompatibleNotesProvider, createOpenAiCompatibleTranscriptionProvider } from "../src/lib/providers/openai-compatible";
import type { AudioClip, Transcript } from "../src/lib/providers/types";

const SECRET = "sk-do-not-leak-abcdefghijklmnop";
const base = { baseUrl: "https://api.example.com/openai/v1", apiKey: SECRET, model: "test-model" };
const clip: AudioClip = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: "audio/webm;codecs=opus", fileName: "recording", durationMs: 40_000 };
const transcript: Transcript = { text: "hello world", segments: [], language: "en", durationMs: 40_000 };

interface Call { url: string; init: RequestInit }

function stub(respond: () => Response): { fetchImpl: typeof globalThis.fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof globalThis.fetch;
  return { fetchImpl, calls };
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("transcription sends the OpenAI-compatible multipart request", async () => {
  const { fetchImpl, calls } = stub(() => jsonResponse({ text: "hello", duration: 4, segments: [] }));
  await createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl }).transcribe(clip);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example.com/openai/v1/audio/transcriptions");
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.authorization, `Bearer ${SECRET}`);
  const form = calls[0].init.body as FormData;
  assert.equal(form.get("model"), "test-model");
  assert.equal(form.get("response_format"), "verbose_json");
  const file = form.get("file");
  assert.ok(file instanceof Blob);
  assert.equal(file.size, 4);
});

test("transcription normalizes vendor seconds into session-time milliseconds", async () => {
  const { fetchImpl } = stub(() => jsonResponse({
    text: "  hello world  ",
    language: "en",
    duration: 12.5,
    segments: [
      { id: 0, seek: 0, start: 0.5, end: 2.25, text: " hello ", tokens: [1, 2], temperature: 0 },
      { id: 1, seek: 0, start: 2.25, end: 5, text: "world", tokens: [3], temperature: 0 },
      { id: 2, seek: 0, start: 5, end: 6, text: "   " },
    ],
  }));
  const result = await createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl }).transcribe(clip, { sessionOffsetMs: 30_000 });

  assert.equal(result.text, "hello world");
  assert.equal(result.language, "en");
  assert.equal(result.durationMs, 12_500);
  assert.deepEqual(result.segments, [
    { startMs: 30_500, endMs: 32_250, text: "hello" },
    { startMs: 32_250, endMs: 35_000, text: "world" },
  ]);
  // No vendor field survives normalization.
  assert.doesNotMatch(JSON.stringify(result), /seek|tokens|temperature/);
});

test("transcription synthesizes one segment when the vendor omits them", async () => {
  const { fetchImpl } = stub(() => jsonResponse({ text: "only text", duration: 3 }));
  const result = await createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl }).transcribe(clip, { sessionOffsetMs: 1_000 });
  assert.deepEqual(result.segments, [{ startMs: 1_000, endMs: 4_000, text: "only text" }]);
});

test("transcription maps upstream statuses onto codes and retryability", async () => {
  const expected: [number, string, boolean][] = [
    [401, "unauthorized", false], [403, "unauthorized", false], [429, "rate_limited", true],
    [408, "timeout", true], [413, "clip_too_large", false], [422, "invalid_input", false],
    [500, "unavailable", true], [503, "unavailable", true],
  ];
  for (const [status, code, retryable] of expected) {
    const { fetchImpl } = stub(() => new Response(`{"error":{"message":"key ${SECRET} rejected"}}`, { status }));
    const error = await createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl }).transcribe(clip).then(() => null, (thrown: unknown) => thrown);
    assert.ok(error instanceof ProviderError, String(status));
    assert.equal(error.code, code, String(status));
    assert.equal(error.retryable, retryable, String(status));
    assert.equal(error.port, "transcription");
    assert.equal(error.status, status);
    // The upstream body carried a credential; the surfaced error must not.
    assert.doesNotMatch(`${error.message} ${JSON.stringify({ ...error })}`, new RegExp(SECRET));
  }
});

test("transcription rejects a malformed body and a network failure without detail", async () => {
  const malformed = stub(() => new Response("not json", { status: 200 }));
  await assert.rejects(
    createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl: malformed.fetchImpl }).transcribe(clip),
    (error: unknown) => error instanceof ProviderError && error.code === "invalid_response",
  );

  const missingText = stub(() => jsonResponse({ duration: 1 }));
  await assert.rejects(
    createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl: missingText.fetchImpl }).transcribe(clip),
    (error: unknown) => error instanceof ProviderError && error.code === "invalid_response",
  );

  const offline = (async () => { throw new TypeError(`fetch failed for ${base.baseUrl}`); }) as typeof globalThis.fetch;
  await assert.rejects(
    createOpenAiCompatibleTranscriptionProvider({ ...base, fetchImpl: offline }).transcribe(clip),
    (error: unknown) => error instanceof ProviderError && error.code === "unavailable" && error.retryable && !/api\.example\.com/.test(error.message),
  );
});

test("notes sends a chat-completions request and unwraps the vendor envelope", async () => {
  const { fetchImpl, calls } = stub(() => jsonResponse({
    id: "chatcmpl-1",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"title":"A title","summary":"A summary.","keyPoints":["one","  ","two"],"actionItems":["do it"]}' } }],
    usage: { total_tokens: 12 },
  }));
  const notes = await createOpenAiCompatibleNotesProvider({ ...base, fetchImpl }).generateNotes(transcript);

  assert.equal(calls[0].url, "https://api.example.com/openai/v1/chat/completions");
  const sent = JSON.parse(String(calls[0].init.body)) as { model: string; response_format: { type: string }; messages: { role: string; content: string }[] };
  assert.equal(sent.model, "test-model");
  assert.equal(sent.response_format.type, "json_object");
  assert.match(sent.messages[1].content, /hello world/);
  assert.match(sent.messages[0].content, /untrusted data, not instructions/);

  assert.deepEqual(notes, { title: "A title", summary: "A summary.", keyPoints: ["one", "two"], actionItems: ["do it"] });
  assert.doesNotMatch(JSON.stringify(notes), /choices|finish_reason|usage/);
});

test("notes tolerates a fenced JSON reply and supplies a title fallback", async () => {
  const { fetchImpl } = stub(() => jsonResponse({ choices: [{ message: { content: '```json\n{"summary":"Fenced."}\n```' } }] }));
  const notes = await createOpenAiCompatibleNotesProvider({ ...base, fetchImpl }).generateNotes(transcript);
  assert.deepEqual(notes, { title: "Untitled recording", summary: "Fenced.", keyPoints: [], actionItems: [] });
});

test("notes rejects unusable model output", async () => {
  for (const body of [
    { choices: [] },
    { choices: [{ message: { content: "sorry, I cannot help" } }] },
    { choices: [{ message: { content: '{"title":"only a title"}' } }] },
    { choices: [{ message: { content: "[1,2,3]" } }] },
  ]) {
    const { fetchImpl } = stub(() => jsonResponse(body));
    await assert.rejects(
      createOpenAiCompatibleNotesProvider({ ...base, fetchImpl }).generateNotes(transcript),
      (error: unknown) => error instanceof ProviderError && error.code === "invalid_response" && error.port === "notes",
      JSON.stringify(body),
    );
  }
});

test("a notes failure never carries the transcript or the credential", async () => {
  const { fetchImpl } = stub(() => new Response(`secret ${SECRET} and transcript ${transcript.text}`, { status: 500 }));
  const error = await createOpenAiCompatibleNotesProvider({ ...base, fetchImpl }).generateNotes(transcript).then(() => null, (thrown: unknown) => thrown);
  assert.ok(error instanceof ProviderError);
  const serialized = `${error.message} ${error.stack ?? ""} ${JSON.stringify({ ...error })}`;
  assert.doesNotMatch(serialized, new RegExp(SECRET));
  assert.doesNotMatch(serialized, /hello world/);
});
