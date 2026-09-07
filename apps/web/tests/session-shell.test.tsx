import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionShell } from "../src/app/session-shell";
import { RecordingOutcome } from "../src/app/recording-result";
import type { ProviderStatus } from "../src/lib/providers/status";
import type { RecordingResult } from "../src/lib/recording/pipeline";

const ready: ProviderStatus = {
  ready: true,
  disclosures: [
    { port: "transcription", adapter: "openai-compatible", model: "whisper-large-v3-turbo", processor: "external", endpointHost: "api.example.com", sends: ["audio"], retention: "unknown" },
    { port: "notes", adapter: "openai-compatible", model: "test-notes", processor: "external", endpointHost: "api.example.com", sends: ["transcript"], retention: "unknown" },
  ],
};

test("the recording action is the clearest action on the ready screen", () => {
  const html = renderToStaticMarkup(<SessionShell status={ready} />);
  assert.match(html, /<h1[^>]*>Record a note<\/h1>/);
  assert.match(html, /aria-labelledby="record-title"/);
  assert.match(html, /<button[^>]*>Record<\/button>/);
  assert.match(html, /Record 30–60 seconds/);
});

test("disclosure of an external processor is rendered from provider data", () => {
  const html = renderToStaticMarkup(<SessionShell status={ready} />);
  assert.match(html, /External processing/);
  assert.match(html, /Audio/);
  assert.match(html, /api\.example\.com/);
  assert.match(html, /whisper-large-v3-turbo/);
  assert.match(html, /retention not confirmed/);
});

test("a fully local configuration is disclosed as no external processing", () => {
  const local: ProviderStatus = {
    ready: true,
    disclosures: [
      { port: "transcription", adapter: "fixture", model: "fixture-transcribe", processor: "local", endpointHost: null, sends: ["audio"], retention: "no-transfer" },
      { port: "notes", adapter: "fixture", model: "fixture-notes", processor: "local", endpointHost: null, sends: ["transcript"], retention: "no-transfer" },
    ],
  };
  const html = renderToStaticMarkup(<SessionShell status={local} />);
  assert.match(html, /No external processing/);
  assert.match(html, /nothing is transmitted/);
});

test("unconfigured providers disable recording and name the missing variables", () => {
  const html = renderToStaticMarkup(<SessionShell status={{ ready: false, problems: ["TRANSCRIPTION_API_KEY is not set."] }} />);
  assert.match(html, /Recording is unavailable/);
  assert.match(html, /TRANSCRIPTION_API_KEY is not set\./);
  assert.doesNotMatch(html, /<button/);
});

test("transcript and model text are escaped when rendered", () => {
  const hostile = '<script>alert("x")</script>';
  const result: RecordingResult = {
    transcript: { text: hostile, segments: [{ startMs: 65_000, endMs: 70_000, text: hostile }], language: "en", durationMs: 70_000 },
    notes: { title: hostile, summary: hostile, keyPoints: [hostile], actionItems: [hostile] },
    disclosures: ready.ready ? ready.disclosures : [],
  };
  const html = renderToStaticMarkup(<RecordingOutcome result={result} />);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  // Segment timestamps render as session-time clock values.
  assert.match(html, /01:05/);
});
