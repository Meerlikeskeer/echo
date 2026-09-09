import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionArtifacts } from "../src/app/session-artifacts";
import type { RevisionInput } from "../src/lib/recording/artifacts";

const html = (element: React.ReactNode) => renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");

function transcript(overrides: Partial<RevisionInput> = {}): RevisionInput {
  return {
    sessionId: "session-a", text: "One. Two.", status: "partial",
    segments: [{ text: "One.", startMs: 0, endMs: 1000 }, { text: "Two.", startMs: 1000, endMs: 2000 }],
    gaps: [],
    ...overrides,
  };
}

test("WEB-007 offers generation and claims no notes before any have been generated", () => {
  const rendered = html(<SessionArtifacts transcript={transcript()} />);
  assert.match(rendered, /Notes and actions/);
  assert.match(rendered, /Generate notes/);
  // Nothing has been generated, so no section may imply an answer exists.
  assert.doesNotMatch(rendered, /Key points/);
  assert.doesNotMatch(rendered, /Suggested research/);
});

// A transcript with nothing in it must not offer to spend a provider call.
test("WEB-007 disables generation while there is no transcript text", () => {
  const rendered = html(<SessionArtifacts transcript={transcript({ text: "   ", segments: [] })} />);
  assert.match(rendered, /disabled/);
  assert.match(rendered, /no transcript text to summarize/i);
});

// STATUS.md records that a frozen WEB-006 test asserts a partial session never
// renders /Final/, and that the first reworded sentence satisfying the regex was
// factually wrong. This section renders inside that same one, so it must not
// reintroduce the word, and what it says instead has to be true.
test("WEB-007 states a partial transcript's limit without ever printing Final", () => {
  const rendered = html(<SessionArtifacts transcript={transcript({ status: "partial" })} />);
  assert.doesNotMatch(rendered, /Final/);
  assert.match(rendered, /still partial/);
  assert.match(rendered, /only what has been transcribed so far/);
});

test("WEB-007 says so plainly when the transcript it summarized is final", () => {
  const rendered = html(<SessionArtifacts transcript={transcript({ status: "final" })} />);
  assert.match(rendered, /transcript is final/);
});

// REQ-005 separates suggested research from opt-in external research (WEB-013).
// A topic list beside a summary reads as findings unless it is labelled, and
// nothing here has been looked up.
test("WEB-007 never presents research as performed", () => {
  const rendered = html(<SessionArtifacts transcript={transcript()} />);
  assert.doesNotMatch(rendered, /findings|we found|according to|source:/i);
});
