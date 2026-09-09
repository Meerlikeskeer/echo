import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARTIFACT_LIMITS, acceptArtifacts, transcriptForArtifacts, transcriptRevision, validateArtifacts,
  type ArtifactRecord, type SessionArtifacts,
} from "../src/lib/recording/artifacts";
import type { StitchedTranscript } from "../src/lib/recording/stitching";

const good: SessionArtifacts = {
  title: "Weekly planning",
  summary: "The team agreed the release date and split the remaining work.",
  keyPoints: ["The release slips by one week.", "Two tasks are unowned."],
  actionItems: ["Assign the two unowned tasks."],
  researchTopics: ["Release checklist practices"],
};
const raw = () => JSON.parse(JSON.stringify(good)) as Record<string, unknown>;

function stitched(overrides: Partial<StitchedTranscript> = {}): StitchedTranscript {
  return {
    sessionId: "session-a", text: "One. Two.", status: "partial", sources: [],
    segments: [
      { text: "One.", startMs: 0, endMs: 1000, sourceIndexes: [0] },
      { text: "Two.", startMs: 1000, endMs: 2000, sourceIndexes: [1] },
    ],
    gaps: [],
    ...overrides,
  };
}
const record = (over: Partial<ArtifactRecord> = {}): ArtifactRecord =>
  ({ sessionId: "session-a", transcriptRevision: "rev-1", generation: 1, artifacts: good, ...over });

test("a well-formed artifact set validates and is returned trimmed", () => {
  const value = raw();
  value.title = "  Weekly planning  ";
  const outcome = validateArtifacts(value);
  assert.ok(outcome.ok);
  assert.equal(outcome.artifacts.title, "Weekly planning");
  assert.deepEqual(outcome.artifacts.researchTopics, ["Release checklist practices"]);
});

test("every required field is required, and a missing one names itself", () => {
  for (const field of ["title", "summary", "keyPoints", "actionItems", "researchTopics"] as const) {
    const value = raw();
    delete value[field];
    const outcome = validateArtifacts(value);
    assert.ok(!outcome.ok, `${field} must be required`);
    assert.ok(outcome.problems.some((problem) => problem.field === field && problem.reason === "missing"));
  }
});

// REQ-005 names research topics alongside the rest. Before WEB-007 the notes
// port returned four fields, so a provider that still answers with the old
// shape must be rejected rather than silently producing an empty section.
test("the old four-field notes shape is rejected, not silently accepted", () => {
  const value = raw();
  delete value.researchTopics;
  const outcome = validateArtifacts(value);
  assert.ok(!outcome.ok);
  assert.ok(outcome.problems.some((problem) => problem.field === "researchTopics"));
});

test("a non-object, an array and null are all rejected without inspecting fields", () => {
  for (const value of [null, undefined, 42, "text", [], [good]]) {
    const outcome = validateArtifacts(value);
    assert.ok(!outcome.ok);
    assert.deepEqual(outcome.problems, [{ field: "$", reason: "wrong-type" }]);
  }
});

// ARCHITECTURE.md forbids a vendor response shape reaching a domain type, and a
// tolerated extra key is exactly how one arrives.
test("an unknown field is rejected, because that is how a vendor shape leaks in", () => {
  const value = raw();
  value.choices = [{ message: "…" }];
  const outcome = validateArtifacts(value);
  assert.ok(!outcome.ok);
  assert.ok(outcome.problems.some((problem) => problem.reason === "unknown-field"));
});

test("wrong types are rejected for scalars, for lists and for items inside a list", () => {
  const scalar = raw(); scalar.title = 12;
  assert.ok(!validateArtifacts(scalar).ok);
  const list = raw(); list.keyPoints = "not a list";
  assert.ok(!validateArtifacts(list).ok);
  const item = raw(); item.actionItems = ["fine", { text: "not a string" }];
  const outcome = validateArtifacts(item);
  assert.ok(!outcome.ok);
  assert.ok(outcome.problems.some((problem) => problem.field === "actionItems" && problem.reason === "wrong-type"));
});

test("empty and whitespace-only values are rejected wherever they appear", () => {
  const title = raw(); title.title = "   ";
  assert.ok(!validateArtifacts(title).ok);
  const item = raw(); item.keyPoints = ["real", "  "];
  assert.ok(!validateArtifacts(item).ok);
});

test("oversize values are rejected against the published limits", () => {
  const title = raw(); title.title = "a".repeat(ARTIFACT_LIMITS.title + 1);
  assert.ok(!validateArtifacts(title).ok);
  const summary = raw(); summary.summary = "a".repeat(ARTIFACT_LIMITS.summary + 1);
  assert.ok(!validateArtifacts(summary).ok);
  const item = raw(); item.actionItems = ["a".repeat(ARTIFACT_LIMITS.item + 1)];
  assert.ok(!validateArtifacts(item).ok);
  const many = raw(); many.researchTopics = Array.from({ length: ARTIFACT_LIMITS.items + 1 }, (_, i) => `topic ${i}`);
  const outcome = validateArtifacts(many);
  assert.ok(!outcome.ok);
  assert.ok(outcome.problems.some((problem) => problem.reason === "too-many"));
});

// A repeated point renders twice and inflates a count the owner reads as
// coverage, so it is a malformed answer rather than a stylistic choice.
test("a point repeated with different spacing or case is a duplicate", () => {
  const value = raw();
  value.keyPoints = ["The release slips.", "the   RELEASE slips."];
  const outcome = validateArtifacts(value);
  assert.ok(!outcome.ok);
  assert.ok(outcome.problems.some((problem) => problem.field === "keyPoints" && problem.reason === "duplicate"));
});

// A provider response is untrusted text. ProviderError already refuses free-form
// messages so a response body cannot reach the owner; problems must not become
// the hole that reintroduces one.
test("a rejection never carries the offending value", () => {
  const value = raw();
  value.title = "SECRET-TRANSCRIPT-TEXT".repeat(20);
  value.actionItems = ["   "];
  const outcome = validateArtifacts(value);
  assert.ok(!outcome.ok);
  assert.doesNotMatch(JSON.stringify(outcome.problems), /SECRET-TRANSCRIPT-TEXT/);
});

test("a revision is stable for the same transcript and differs for a changed one", async () => {
  const base = await transcriptRevision(stitched());
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(base, await transcriptRevision(stitched()));
  assert.notEqual(base, await transcriptRevision(stitched({ sessionId: "session-b" })));
  assert.notEqual(base, await transcriptRevision(stitched({ text: "One. Two. Three." , segments: [
    { text: "One.", startMs: 0, endMs: 1000, sourceIndexes: [0] },
    { text: "Two.", startMs: 1000, endMs: 2000, sourceIndexes: [1] },
    { text: "Three.", startMs: 2000, endMs: 3000, sourceIndexes: [2] },
  ] })));
});

// The same words in a still-growing transcript are not the same transcript.
test("partial and final transcripts have different revisions even with identical text", async () => {
  assert.notEqual(await transcriptRevision(stitched({ status: "partial" })), await transcriptRevision(stitched({ status: "final" })));
});

// A gap changes what the transcript means without changing a character of it.
test("a gap changes the revision", async () => {
  assert.notEqual(
    await transcriptRevision(stitched()),
    await transcriptRevision(stitched({ gaps: [{ reason: "missing-chunk", sequence: 2 }] })),
  );
});

// Distinctness under adversarial text, which is the property the equality rule
// below actually depends on. This does NOT prove the length prefixing is load
// bearing: a plain delimiter passes these too, because every record contributes
// a fixed number of fields and both counts are encoded. The prefixes are there
// so that stays true when a variable-arity field is added; see the note on
// revisionInput. Asserting more than this would be asserting something untested.
test("transcripts that differ only in where text is split still get different revisions", async () => {
  const pairs: readonly (readonly [StitchedTranscript, StitchedTranscript])[] = [
    [
      stitched({ segments: [{ text: "a:b", startMs: 0, endMs: 1000, sourceIndexes: [0] }] }),
      stitched({ segments: [{ text: "a", startMs: 0, endMs: 1000, sourceIndexes: [0] }, { text: "b", startMs: 0, endMs: 1000, sourceIndexes: [1] }] }),
    ],
    [
      stitched({ segments: [{ text: "3:one", startMs: 0, endMs: 1, sourceIndexes: [0] }] }),
      stitched({ segments: [{ text: "one", startMs: 0, endMs: 1, sourceIndexes: [0] }] }),
    ],
    [
      stitched({ segments: [{ text: "x", startMs: 0, endMs: 11, sourceIndexes: [0] }] }),
      stitched({ segments: [{ text: "x", startMs: 0, endMs: 1, sourceIndexes: [0] }] }),
    ],
    [
      stitched({ gaps: [{ reason: "missing-chunk", sequence: 1 }] }),
      stitched({ gaps: [{ reason: "missing-chunk", sequence: null }] }),
    ],
  ];
  for (const [one, two] of pairs) {
    assert.notEqual(await transcriptRevision(one), await transcriptRevision(two));
  }
});

test("the generator is given the stitched segments and their timings", () => {
  const transcript = transcriptForArtifacts(stitched());
  assert.equal(transcript.text, "One. Two.");
  assert.deepEqual(transcript.segments.map((segment) => segment.text), ["One.", "Two."]);
  assert.equal(transcript.durationMs, 2000);
  assert.equal(transcriptForArtifacts(stitched({ segments: [], text: "" })).durationMs, 0);
});

test("artifacts generated from the current transcript are accepted", () => {
  const decision = acceptArtifacts(null, record(), "rev-1");
  assert.ok(decision.accepted);
  assert.equal(decision.record.generation, 1);
});

// The defect this whole rule exists to prevent: a slow generation returning
// after the transcript has moved on, overwriting artifacts made from newer text.
test("a generation from an older transcript never overwrites the current artifacts", () => {
  const current = record({ transcriptRevision: "rev-2", generation: 2 });
  const late = record({ transcriptRevision: "rev-1", generation: 1 });
  const decision = acceptArtifacts(current, late, "rev-2");
  assert.ok(!decision.accepted);
  assert.equal(decision.reason, "stale-transcript");
});

// Revisions are content hashes and do not order, so a stale set is rejected even
// when it carries the higher generation number. Matching the transcript is the
// only thing that qualifies it.
test("a higher generation does not rescue artifacts from the wrong transcript", () => {
  const decision = acceptArtifacts(record({ transcriptRevision: "rev-2", generation: 2 }), record({ transcriptRevision: "rev-1", generation: 99 }), "rev-2");
  assert.ok(!decision.accepted);
  assert.equal(decision.reason, "stale-transcript");
});

test("a retry overtaken by a newer retry for the same transcript is discarded", () => {
  const current = record({ generation: 5 });
  for (const generation of [5, 4, 0]) {
    const decision = acceptArtifacts(current, record({ generation }), "rev-1");
    assert.ok(!decision.accepted);
    assert.equal(decision.reason, "superseded-generation");
  }
  assert.ok(acceptArtifacts(current, record({ generation: 6 }), "rev-1").accepted);
});

// Artifacts matching the transcript on screen always win, whatever generation
// the stale ones happened to carry.
test("artifacts matching the current transcript replace stale ones of any generation", () => {
  const stale = record({ transcriptRevision: "rev-1", generation: 900 });
  assert.ok(acceptArtifacts(stale, record({ transcriptRevision: "rev-2", generation: 1 }), "rev-2").accepted);
});

test("a generation number that is not a whole non-negative number is refused", () => {
  for (const generation of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
    const decision = acceptArtifacts(null, record({ generation }), "rev-1");
    assert.ok(!decision.accepted, `generation ${generation} must be refused`);
    assert.equal(decision.reason, "invalid-generation");
  }
});
