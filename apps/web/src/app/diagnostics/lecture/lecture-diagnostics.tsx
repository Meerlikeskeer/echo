"use client";

import { useState } from "react";
import { IndexedDBQueue, drainQueue, UploadFailure } from "../../../lib/recording/queue";
import { ArtifactStore } from "../../../lib/recording/artifact-store";
import { checksum, type PlayableChunk } from "../../../lib/recording/session";
import { stitchSession } from "../../../lib/recording/stitching";
import { SessionArtifacts } from "../../session-artifacts";
import { transcriptRevision, type RevisionInput } from "../../../lib/recording/artifacts";
import { createFixtureNotesProvider, createFixtureTranscriptionProvider } from "../../../lib/providers/fixture";
import { processRecording } from "../../../lib/recording/pipeline";

const queueName = "echo-web018-synthetic-lecture";
const guidesName = "echo-web018-synthetic-guides";
const sessionId = "synthetic-90-minute-lecture";
function check(value: unknown, label: string): asserts value { if (!value) throw new Error(label); }
const providers = { transcription: createFixtureTranscriptionProvider(), notes: createFixtureNotesProvider() };
async function result(chunk: PlayableChunk) {
  return processRecording({ bytes: new Uint8Array(await chunk.audio.arrayBuffer()), mimeType: chunk.audio.type, fileName: "synthetic.webm", durationMs: chunk.metadata.endMs - chunk.metadata.startMs }, providers, { sessionOffsetMs: chunk.metadata.startMs });
}

export function LectureDiagnostics() {
  const [guideTranscript, setGuideTranscript] = useState<RevisionInput | null>(null);
  const [report, setReport] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<string[]>) {
    setBusy(true); setReport([]);
    try { setReport(await action()); }
    catch (error) { setReport([`FAIL: ${error instanceof Error ? error.message : "native storage failure"}`]); }
    finally { setBusy(false); }
  }
  async function seed() {
    const store = new IndexedDBQueue(queueName);
    const chunks: PlayableChunk[] = [];
    for (let sequence = 0; sequence < 90; sequence++) {
      const audio = new Blob([new Uint8Array(240000)], { type: "audio/webm" });
      const startMs = sequence * 60000;
      chunks.push({ audio, metadata: { sessionId, id: `minute-${sequence}`, sequence, startMs, endMs: startMs + 65000, overlapMs: sequence ? 5000 : 0, mimeType: audio.type, size: audio.size, checksum: await checksum(audio) } });
      await store.offer(chunks.at(-1)!);
    }
    await store.saveCompletion({ sessionId, chunks: chunks.map(chunk => chunk.metadata) });
    const rows = await store.list();
    for (const row of rows) await store.update({ ...row, state: "pending", attempts: 0, nextAttemptAt: 0, error: undefined, result: undefined });
    await store.update({ ...rows[0], state: "uploading", attempts: 1, result: undefined });
    return ["PASS: 90 synthetic minute containers (21.6 MB), identities and completion committed in native IndexedDB.", "Reload this page, switch away and back, then recover. These are byte fixtures, not playable lecture audio."];
  }
  async function recover() {
    const store = new IndexedDBQueue(queueName);
    await store.recover();
    const before = await store.list();
    check(before.length === 90, "seed the trial before recovering");
    const calls: number[] = [];
    await drainQueue(store, async chunk => {
      calls.push(chunk.metadata.sequence);
      if (chunk.metadata.sequence === 10) throw new UploadFailure(true);
      return result(chunk);
    }, { online: () => true, active: () => true, now: () => Date.now(), force: true });
    const interrupted = await store.list();
    check(interrupted[10].state === "pending", "interrupted request remains retryable");
    check(interrupted[89].state === "processed", "later chunks process despite interrupted request");
    await drainQueue(store, result, { online: () => true, active: () => true, now: () => Date.now(), force: true });
    const after = await store.list();
    check(after.every((row, index) => row.metadata.checksum === before[index].metadata.checksum && row.metadata.id === before[index].metadata.id), "retry preserves identity and audio");
    const completions = await store.listCompletions();
    const transcript = stitchSession({ sessionId, chunks: after.map(row => ({ metadata: row.metadata, transcript: row.result?.transcript })), completion: completions[0] });
    check(transcript.status === "final", "recovered clean stop finalizes only after all transcripts arrive");
    const partial = stitchSession({ sessionId, chunks: after, completion: null });
    check(partial.status === "partial", "saved prefix without completion never finalizes");
    const revision = await transcriptRevision(transcript);
    const artifacts = await providers.notes.generateArtifacts({ text: transcript.text, segments: transcript.segments, language: null, durationMs: 5405000 });
    await new ArtifactStore(guidesName).save({ sessionId, transcriptRevision: revision, generation: 4, artifacts });
    const loaded = await new ArtifactStore(guidesName).load(sessionId, revision);
    check(loaded?.generation === 4, "guide survives store reopen with revision and generation");
    check(await new ArtifactStore(guidesName).load(sessionId, "f".repeat(64)) === null, "different transcript cannot load stale guide");
    return ["PASS: native audio/completion recovery, interrupted-request retry, later chunks unblocked, IDs and checksums unchanged.", "PASS: recovered stopped lecture final; incomplete prefix partial.", "PASS: guide saved and reopened; different revision refused.", "Network interruption above is injected, not Wi-Fi or a live provider. Reload again and select Verify saved guide."];
  }
  async function guide() {
    const store = new IndexedDBQueue(queueName);
    const rows = await store.list();
    const completion = (await store.listCompletions())[0];
    const transcript = stitchSession({ sessionId, chunks: rows.map(row => ({ metadata: row.metadata, transcript: row.result?.transcript })), completion });
    const record = await new ArtifactStore(guidesName).load(sessionId, await transcriptRevision(transcript));
    check(transcript.status === "final" && record?.generation === 4, "guide and final transcript recover across actual reload");
    setGuideTranscript(transcript);
    return ["PASS: guide and final transcript recovered after reload. Generate notes below to exercise the actual page hook and endpoint, then reload and verify again."];
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Lecture recovery diagnostics</h1>
    <p>Synthetic 90-minute timeline, real browser storage. No microphone, external service or user recording is used. This does not certify audio fidelity or 90-minute wall-clock capture.</p>
    <button disabled={busy} onClick={() => { void run(seed); }} className="rounded border p-3">Seed synthetic lecture</button>{" "}
    <button disabled={busy} onClick={() => { void run(recover); }} className="rounded border p-3">Recover and test interruption</button>{" "}
    <button disabled={busy} onClick={() => { void run(guide); }} className="rounded border p-3">Verify saved guide</button>
    {guideTranscript ? <SessionArtifacts transcript={guideTranscript} /> : null}
    <div aria-live="polite">{busy ? "Running…" : report.map((line, index) => <p key={index}>{line}</p>)}</div>
  </main>;
}
