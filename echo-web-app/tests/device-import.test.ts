import assert from "node:assert/strict";
import { test } from "node:test";
import { readDeviceRecording, saveDeviceRecording } from "../src/lib/recording/device-import";
import { AUDIO_BUDGET, type QueueEntry } from "../src/lib/recording/queue";
import { checksum, type AudioChunk, type PlayableChunk } from "../src/lib/recording/session";
import type { Completion } from "../src/lib/recording/session-completion";

function wav(ms: number): Blob {
  const data = new Uint8Array(44 + ms * 32), view = new DataView(data.buffer);
  const str = (offset: number, text: string) => data.set(new TextEncoder().encode(text), offset);
  str(0, "RIFF"); view.setUint32(4, data.length - 8, true); str(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); str(36, "data"); view.setUint32(40, data.length - 44, true);
  return new Blob([data], { type: "audio/wav" });
}
async function fixture(complete = true) {
  const audios = [wav(5000), wav(3000)];
  const chunks: AudioChunk[] = await Promise.all(audios.map(async (audio, sequence) => ({
    sessionId: "device-test-session", id: `chunk-${sequence}`, sequence, startMs: sequence ? 3000 : 0,
    endMs: sequence ? 6000 : 5000, overlapMs: sequence ? 2000 : 0, mimeType: "audio/wav", size: audio.size, checksum: await checksum(audio),
  })));
  return { manifest: { version: 1, sessionId: "device-test-session", complete, chunks }, audios };
}
function pack(manifest: unknown, audios: Blob[]): Blob {
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const prefix = new Uint8Array(12); prefix.set(new TextEncoder().encode("ECHO0001"));
  new DataView(prefix.buffer).setUint32(8, json.length, true);
  return new Blob([prefix, json, ...audios]);
}
function memory() {
  const rows: QueueEntry[] = [], completions: Completion[] = [];
  let offers = 0;
  return { rows, completions, get offers() { return offers; }, failAt: -1,
    async list() { return rows; }, async update() {},
    async offer(chunk: PlayableChunk) {
      if (offers++ === this.failAt) throw new Error("Synthetic storage failure");
      if (!rows.some(row => row.metadata.id === chunk.metadata.id)) rows.push({ ...chunk, state: "pending", attempts: 0, nextAttemptAt: 0 });
    },
    async saveCompletion(value: Completion) { completions.push(value); },
  };
}

test("device archive imports verified ordered audio and clean completion, preserving reimport identities", async () => {
  const { manifest, audios } = await fixture(), progress: number[] = [];
  const recording = await readDeviceRecording(pack(manifest, audios), done => progress.push(done));
  assert.equal(recording.durationMs, 6000); assert.equal(recording.bytes, audios.reduce((sum, audio) => sum + audio.size, 0));
  assert.deepEqual(progress, [1, 2]); assert.equal(recording.chunks[0].audio.type, "audio/wav");
  const store = memory(); await saveDeviceRecording(recording, store);
  store.rows[0].state = "processed";
  await saveDeviceRecording(recording, store);
  assert.equal(store.rows.length, 2); assert.equal(store.rows[0].state, "processed");
  assert.deepEqual(store.completions[0], { sessionId: manifest.sessionId, chunks: manifest.chunks });
});

test("interrupted device capture imports recoverable audio without completion evidence", async () => {
  const { manifest, audios } = await fixture(false), store = memory();
  await saveDeviceRecording(await readDeviceRecording(pack(manifest, audios)), store);
  assert.equal(store.rows.length, 2); assert.equal(store.completions.length, 0);
});

test("corrupted final chunk is refused before any import side effect", async () => {
  const { manifest, audios } = await fixture();
  const bytes = new Uint8Array(await audios[1].arrayBuffer()); bytes[60] = 42;
  await assert.rejects(readDeviceRecording(pack(manifest, [audios[0], new Blob([bytes])])), /integrity check/);
});

test("device archive rejects bad signature, excessive header, truncated audio and trailing bytes", async () => {
  const { manifest, audios } = await fixture(), valid = pack(manifest, audios);
  await assert.rejects(readDeviceRecording(new Blob(["not a device archive"])), /choose a .echo/);
  const header = new Uint8Array(12); header.set(new TextEncoder().encode("ECHO0001")); new DataView(header.buffer).setUint32(8, 200000, true);
  await assert.rejects(readDeviceRecording(new Blob([header])), /manifest/);
  await assert.rejects(readDeviceRecording(valid.slice(0, valid.size - 1)), /truncated/);
  await assert.rejects(readDeviceRecording(new Blob([valid, "extra"])), /trailing/);
});

test("device manifest refuses missing, duplicated, reordered, conflicting, oversized and foreign chunks", async () => {
  const { manifest, audios } = await fixture();
  const changes = [
    { ...manifest, complete: "true" }, { ...manifest, version: 2 }, { ...manifest, unexpected: true },
    { ...manifest, chunks: [] }, { ...manifest, chunks: [manifest.chunks[1]] },
    { ...manifest, chunks: [...manifest.chunks].reverse() },
    { ...manifest, chunks: [manifest.chunks[0], manifest.chunks[0]] },
    ...[{ sessionId: "other" }, { id: manifest.chunks[0].id }, { startMs: 4000 }, { overlapMs: 0 },
      { mimeType: "audio/webm" }, { endMs: 7200001 }, { size: 4_000_000 }, { quickNote: { stoppedAt: 1, onlineAtStop: false } },
    ].map(patch => ({ ...manifest, chunks: [manifest.chunks[0], { ...manifest.chunks[1], ...patch }] })),
  ];
  for (const changed of changes) await assert.rejects(readDeviceRecording(pack(changed, audios)), /Cannot import/);
});

test("WAV sample rate and duration must match metadata even when checksum matches", async () => {
  const { manifest, audios } = await fixture();
  const bytes = new Uint8Array(await audios[0].arrayBuffer()); new DataView(bytes.buffer).setUint32(24, 48000, true);
  const malformed = new Blob([bytes]);
  manifest.chunks[0] = { ...manifest.chunks[0], checksum: await checksum(malformed) };
  await assert.rejects(readDeviceRecording(pack(manifest, [malformed, audios[1]])), /audio format/);
  const valid = await fixture(); valid.manifest.chunks[0] = { ...valid.manifest.chunks[0], endMs: valid.manifest.chunks[0].endMs + 1 };
  valid.manifest.chunks[1] = { ...valid.manifest.chunks[1], startMs: valid.manifest.chunks[1].startMs + 1 };
  await assert.rejects(readDeviceRecording(pack(valid.manifest, valid.audios)), /audio format/);
});

test("failed persistence keeps the prefix, never marks complete, and reimport can finish", async () => {
  const { manifest, audios } = await fixture(), recording = await readDeviceRecording(pack(manifest, audios)), store = memory();
  store.failAt = 1;
  await assert.rejects(saveDeviceRecording(recording, store), /storage failure/);
  assert.equal(store.rows.length, 1); assert.equal(store.completions.length, 0);
  store.failAt = -1; await saveDeviceRecording(recording, store);
  assert.equal(store.rows.length, 2); assert.equal(store.completions.length, 1);
});

test("identity conflicts and full budget are refused before saving any new audio", async () => {
  const { manifest, audios } = await fixture(), recording = await readDeviceRecording(pack(manifest, audios));
  const conflict = memory(); await conflict.offer(recording.chunks[1]);
  conflict.rows[0] = { ...conflict.rows[0], metadata: { ...conflict.rows[0].metadata, checksum: "0".repeat(64) } };
  await assert.rejects(saveDeviceRecording(recording, conflict), /conflicts/); assert.equal(conflict.offers, 1);
  const full = memory();
  full.rows.push({ ...recording.chunks[0], metadata: { ...recording.chunks[0].metadata, sessionId: "other" }, audio: { size: AUDIO_BUDGET } as Blob, state: "pending", attempts: 0, nextAttemptAt: 0 });
  await assert.rejects(saveDeviceRecording(recording, full), /256 MiB/); assert.equal(full.offers, 0);
});

test("device validation can be cancelled without saving or processing audio", async () => {
  const { manifest, audios } = await fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(readDeviceRecording(pack(manifest, audios), undefined, controller.signal), { name: "AbortError" });
});
