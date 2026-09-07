import assert from "node:assert/strict";
import { test } from "node:test";
import { readProviderConfig } from "../src/lib/providers/config";
import { buildProviders } from "../src/lib/providers/factory";

const SECRET = "sk-do-not-leak-abcdefghijklmnop";
const complete = {
  TRANSCRIPTION_PROVIDER: "openai-compatible",
  TRANSCRIPTION_BASE_URL: "https://api.example.com/openai/v1",
  TRANSCRIPTION_API_KEY: SECRET,
  TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
  LLM_PROVIDER: "openai-compatible",
  LLM_BASE_URL: "https://api.example.com/openai/v1",
  LLM_API_KEY: SECRET,
  LLM_MODEL: "openai/gpt-oss-120b",
};

test("complete configuration is accepted and the base URL is normalized", () => {
  const result = readProviderConfig({ ...complete, TRANSCRIPTION_BASE_URL: "https://api.example.com/openai/v1///" });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.config.transcription.baseUrl, "https://api.example.com/openai/v1");
  assert.equal(result.ok && result.config.notes.model, "openai/gpt-oss-120b");
});

test("missing or invalid configuration fails closed and names the variable", () => {
  const cases: [Record<string, string>, string][] = [
    [{ TRANSCRIPTION_API_KEY: "" }, "TRANSCRIPTION_API_KEY"],
    [{ TRANSCRIPTION_BASE_URL: "" }, "TRANSCRIPTION_BASE_URL"],
    [{ TRANSCRIPTION_BASE_URL: "ftp://api.example.com" }, "TRANSCRIPTION_BASE_URL"],
    [{ TRANSCRIPTION_MODEL: "  " }, "TRANSCRIPTION_MODEL"],
    [{ TRANSCRIPTION_PROVIDER: "" }, "TRANSCRIPTION_PROVIDER"],
    [{ TRANSCRIPTION_PROVIDER: "assemblyai" }, "TRANSCRIPTION_PROVIDER"],
    [{ LLM_API_KEY: "" }, "LLM_API_KEY"],
    [{ LLM_PROVIDER: "" }, "LLM_PROVIDER"],
  ];
  for (const [override, expected] of cases) {
    const result = readProviderConfig({ ...complete, ...override });
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.ok(!result.ok && result.problems.some((problem) => problem.includes(expected)), JSON.stringify(override));
  }
  assert.equal(readProviderConfig({}).ok, false);
});

test("configuration problems never quote a configured value", () => {
  const result = readProviderConfig({ ...complete, TRANSCRIPTION_MODEL: "" });
  assert.equal(result.ok, false);
  const text = !result.ok ? result.problems.join("\n") : "";
  assert.doesNotMatch(text, new RegExp(SECRET));
  assert.doesNotMatch(text, /api\.example\.com/);
});

test("the fixture adapter needs no credential and reports no transfer", () => {
  const setup = buildProviders({ TRANSCRIPTION_PROVIDER: "fixture", TRANSCRIPTION_MODEL: "fixture-transcribe", LLM_PROVIDER: "fixture", LLM_MODEL: "fixture-notes" });
  assert.equal(setup.ok, true);
  if (!setup.ok) return;
  assert.equal(setup.transcription.disclosure.processor, "local");
  assert.equal(setup.transcription.disclosure.retention, "no-transfer");
  assert.equal(setup.transcription.disclosure.endpointHost, null);
  assert.equal(setup.notes.disclosure.adapter, "fixture");
});

test("built providers disclose the endpoint host and classify local endpoints", () => {
  const hosted = buildProviders(complete);
  assert.equal(hosted.ok && hosted.transcription.disclosure.processor, "external");
  assert.equal(hosted.ok && hosted.transcription.disclosure.endpointHost, "api.example.com");
  assert.equal(hosted.ok && hosted.transcription.disclosure.retention, "unknown");
  assert.equal(hosted.ok && hosted.transcription.capabilities.diarization, false);

  const selfHosted = buildProviders({ ...complete, TRANSCRIPTION_BASE_URL: "http://localhost:8000/v1", LLM_BASE_URL: "http://localhost:11434/v1" });
  assert.equal(selfHosted.ok && selfHosted.transcription.disclosure.processor, "local");
  assert.equal(selfHosted.ok && selfHosted.notes.disclosure.processor, "local");
});

test("a built provider never exposes a configured credential", () => {
  const setup = buildProviders(complete);
  assert.equal(setup.ok, true);
  if (!setup.ok) return;
  assert.doesNotMatch(JSON.stringify([setup.transcription.disclosure, setup.transcription.capabilities, setup.notes.disclosure]), new RegExp(SECRET));
});
