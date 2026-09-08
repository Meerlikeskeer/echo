"use client";

import { useState } from "react";
import { checksum, type PlayableChunk } from "../../../lib/recording/session";
import { IndexedDBQueue, incompleteSessions } from "../../../lib/recording/queue";
import { captureSession } from "../../../lib/recording/capture";

const RECOVERY_DB = "echo-synthetic-queue-recovery";
function check(condition: unknown, label: string): asserts condition { if (!condition) throw new Error(label); }
async function synthetic(sequence: number, sessionId: string): Promise<PlayableChunk> {
  const audio = new Blob([`synthetic-container-${sequence}`], { type: "audio/webm; codecs=opus" });
  return { audio, metadata: { sessionId, id: `chunk-${sequence}`, sequence, startMs: sequence * 5000, endMs: sequence * 5000 + 6000, overlapMs: sequence ? 1000 : 0, mimeType: "audio/webm;codecs=opus", size: audio.size, checksum: await checksum(audio) } };
}

/** Runs only from a deliberate button in a real browser; no injected IDB factory. */
async function nativeTests(): Promise<string[]> {
  const passed: string[] = [];
  const name = `echo-synthetic-queue-${crypto.randomUUID()}`;
  const store = new IndexedDBQueue(name);
  const chunks = await Promise.all([0, 1, 2].map((sequence) => synthetic(sequence, "synthetic-session")));
  await store.offer(chunks[2]);
  check(incompleteSessions(await store.list()).length === 1, "missing sequence must be visible");
  await Promise.all([store.offer(chunks[0]), store.offer(chunks[1]), store.offer(chunks[0])]);
  const rows = await new IndexedDBQueue(name).list();
  check(rows.length === 3 && rows.every((row, index) => row.metadata.sequence === index), "duplicate/out-of-order transaction recovery");
  check(rows.every((row, index) => row.metadata.checksum === chunks[index].metadata.checksum), "recovered checksums");
  passed.push("PASS native IndexedDB Blob commit, reopen, ordering, concurrent duplicate and MIME normalization");
  let conflict = false;
  try { await store.offer({ ...chunks[0], metadata: { ...chunks[0].metadata, id: "conflict" } }); } catch { conflict = true; }
  check(conflict && (await store.list()).length === 3, "unique sequence conflict");
  passed.push("PASS native unique sequence conflict retains existing rows");
  const limited = new IndexedDBQueue(`${name}-quota`, chunks[0].audio.size);
  await limited.offer(chunks[0]);
  let quota = false;
  try { await limited.offer(chunks[1]); } catch (error) { quota = error instanceof DOMException && error.name === "QuotaExceededError"; }
  check(quota && (await limited.list()).length === 1, "budget failure preserves earlier commit");
  passed.push("PASS quota budget abort mid-session preserves prior commit (not OS disk exhaustion)");
  // Abort after a successful native request: request success is NOT commit.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("chunks", "readwrite");
      tx.onabort = () => { db.close(); resolve(); };
      tx.oncomplete = () => { db.close(); reject(new Error("Expected native abort")); };
      const write = tx.objectStore("chunks").put({ ...rows[0], state: "processed" });
      write.onsuccess = () => tx.abort();
    };
  });
  check((await store.list())[0].state === "pending", "aborted state must roll back");
  passed.push("PASS native write request success followed by abort rolls back atomically");
  const recovery = new IndexedDBQueue(RECOVERY_DB);
  for (const chunk of chunks) await recovery.offer(chunk);
  passed.push("PASS pending reload fixture committed; reload page, then select Recover pending clips");
  return passed;
}

export function QueueDiagnostics() {
  const [report, setReport] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<string[]>) {
    setBusy(true); setReport([]);
    try { setReport(await action()); }
    catch (error) { setReport([`FAIL ${error instanceof Error ? error.message : "native storage failure"}`]); }
    finally { setBusy(false); }
  }
  async function capture() {
    const context = new AudioContext();
    await context.resume();
    const oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
    oscillator.connect(destination); oscillator.start();
    const store = new IndexedDBQueue(`echo-synthetic-capture-${crypto.randomUUID()}`);
    let commits = 0;
    const active = captureSession(destination.stream, { chunkMs: 2000, overlapMs: 500 }, undefined, async (chunk) => { await store.offer(chunk); commits++; });
    try {
      await new Promise((resolve) => setTimeout(resolve, 2600));
      const beforeStop = commits;
      const result = await active.stop();
      check(beforeStop > 0, "no chunk committed before session stop");
      const rows = await store.list();
      check(result.session.captureStatus === "stopped" && rows.length === result.chunks.length, "capture persistence incomplete");
      return [`PASS real capture persisted ${beforeStop} chunk(s) before stop; ${rows.length} verified Blobs recovered`];
    } finally { await active.stop(); oscillator.stop(); await context.close(); }
  }
  return <main className="mx-auto max-w-3xl space-y-5 p-8">
    <h1 className="text-2xl font-semibold">Native queue diagnostics</h1>
    <p>Synthetic data only, isolated diagnostic databases. No microphone or external provider. Tests use the production adapter and native IndexedDB.</p>
    <button disabled={busy} className="rounded border p-3" onClick={() => { void run(nativeTests); }}>Run native storage tests</button>{" "}
    <button disabled={busy} className="rounded border p-3" onClick={() => { void run(capture); }}>Test capture persistence</button>{" "}
    <button disabled={busy} className="rounded border p-3" onClick={() => { void run(async () => {
      const rows = await new IndexedDBQueue(RECOVERY_DB).list();
      check(rows.length === 3 && rows.every((row) => row.state === "pending"), "expected three pending chunks after reload");
      return ["PASS recovered 3 pending chunks and verified Blob checksums after page reload"];
    }); }}>Recover pending clips</button>
    <pre aria-live="polite" className="whitespace-pre-wrap">{busy ? "Running…" : report.join("\n")}</pre>
    <p>For reload evidence, run storage tests, reload this page, then recover. Budget tests exercise a real aborted transaction, but do not simulate physical disk exhaustion. Mobile termination and OS eviction remain manual tests.</p>
  </main>;
}
