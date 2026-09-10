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
  assert.match(html, /Record a lecture or meeting for up to two hours/);
  assert.match(html, /Keep this tab open and your device awake/);
  assert.match(html, /value="3000" selected=""/);
  assert.match(html, /value="5000"/);
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

test("the recorder never offers a zero-overlap capture", () => {
  // Measured on 2026-09-08: Chrome 150's MediaRecorder start event lags its
  // start() call by 61-82 ms, so with no overlap the outgoing recorder stops
  // ~52 ms before the incoming one begins and that speech is captured by
  // nothing. Safari 26.4 starts in 0-2 ms and loses nothing, which is exactly
  // why this needs a test: the option looks correct on whichever browser
  // someone happens to develop on. Evidence is in TASKS.md, WEB-003.
  const html = renderToStaticMarkup(<SessionShell status={ready} />);
  const options = [...html.matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1]));
  assert.ok(options.length > 0, "the overlap selector rendered no options");
  assert.ok(!options.includes(0), `zero overlap must not be offered; found ${JSON.stringify(options)}`);
  assert.ok(options.every(value => value >= 1000), `every overlap option must be at least 1000 ms; found ${JSON.stringify(options)}`);
});

test("chunk progress is visible while recording, per chunk and not stitched", () => {
  // Uploads run during capture (ADR-016), so the count of what is transcribed,
  // moving, waiting or stopped has to be readable mid-session rather than at
  // the end. Comments are stripped because React separates adjacent text nodes.
  const html = renderToStaticMarkup(<SessionShell status={ready} />).replace(/<!--.*?-->/g, "");
  assert.match(html, /Chunk processing: 0 transcribed · 0 uploading · 0 waiting · 0 retrying · 0 blocked/);
  assert.doesNotMatch(html, /stitch(ed)? transcript/i);
});
