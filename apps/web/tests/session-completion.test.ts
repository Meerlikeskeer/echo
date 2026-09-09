import assert from "node:assert/strict";
import { test } from "node:test";
import { persistSessionCompletion } from "../src/lib/recording/session-completion";
import type { Session, PlayableChunk } from "../src/lib/recording/session";

const session: Session = { id: "session", startedAt: 1000, endedAt: 11000, captureStatus: "stopped" };
const chunk: PlayableChunk = { audio: new Blob(["synthetic"]), metadata: {
  sessionId: "session", id: "chunk", sequence: 0, startMs: 0, endMs: 10000,
  overlapMs: 0, mimeType: "audio/webm", size: 9, checksum: "a".repeat(64),
} };

test("WEB-006 completion is returned only after persistence resolves", async () => {
  let release!: () => void;
  let resolved = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = persistSessionCompletion({ session, chunks: [chunk] }, async manifest => {
    assert.deepEqual(manifest, { sessionId: "session", chunks: [chunk.metadata] });
    await gate;
  }).then(value => { resolved = true; return value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  release();
  assert.deepEqual(await pending, { sessionId: "session", chunks: [chunk.metadata] });
});

test("WEB-006 failed or active capture never saves completion evidence", async () => {
  for (const captureStatus of ["failed", "recording"] as const) {
    let saves = 0;
    const result = await persistSessionCompletion({ session: { ...session, captureStatus }, chunks: [chunk] }, async () => { saves++; });
    assert.equal(result, null);
    assert.equal(saves, 0);
  }
});

test("WEB-006 completion save failure propagates instead of publishing success", async () => {
  await assert.rejects(persistSessionCompletion({ session, chunks: [chunk] }, async () => {
    throw new Error("synthetic storage failure");
  }), /synthetic storage failure/);
});

test("WEB-006 invalid successful capture cannot create a completion manifest", async () => {
  for (const chunks of [[], [{ ...chunk, metadata: { ...chunk.metadata, sequence: 1 } }], [{ ...chunk, metadata: { ...chunk.metadata, sessionId: "foreign" } }]]) {
    let saves = 0;
    await assert.rejects(persistSessionCompletion({ session, chunks }, async () => { saves++; }));
    assert.equal(saves, 0);
  }
});
