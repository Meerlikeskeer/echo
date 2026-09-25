import { AUDIO_BUDGET, sameChunk, type QueueStore } from "./queue";
import { checksum, isAudioChunk, validateChunkOrder, type AudioChunk, type PlayableChunk } from "./session";
import type { Completion } from "./session-completion";

const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_CHUNKS = 130;
const MAX_DURATION_MS = 2 * 60 * 60 * 1000;
const fields = ["sessionId", "id", "sequence", "startMs", "endMs", "overlapMs", "mimeType", "size", "checksum"];
export interface DeviceRecording {
  readonly sessionId: string;
  readonly complete: boolean;
  readonly chunks: readonly PlayableChunk[];
  readonly bytes: number;
  readonly durationMs: number;
}
export type ImportProgress = (done: number, total: number) => void;

function invalid(detail: string): never { throw new Error(`Cannot import this device recording: ${detail}`); }
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: object, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function checkWav(header: ArrayBuffer, metadata: AudioChunk): void {
  if (header.byteLength !== 44) invalid("a WAV header is truncated.");
  const bytes = new Uint8Array(header), view = new DataView(header);
  const text = (at: number, length: number) => new TextDecoder().decode(bytes.subarray(at, at + length));
  if (text(0, 4) !== "RIFF" || text(8, 8) !== "WAVEfmt " || text(36, 4) !== "data" ||
      view.getUint32(4, true) !== metadata.size - 8 || view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== 16000 || view.getUint32(28, true) !== 32000 ||
      view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 ||
      view.getUint32(40, true) !== metadata.size - 44 ||
      metadata.size !== 44 + (metadata.endMs - metadata.startMs) * 32) {
    invalid("audio format, duration or size does not match the device manifest.");
  }
}

/** No persistence or network effects. Validate every chunk before importing any.
 * Blob slices keep the full two-hour archive off the JS heap; SHA reads one WAV.
 * Hashes detect corruption, not authenticity of an untrusted sender. */
export async function readDeviceRecording(archive: Blob, progress?: ImportProgress, signal?: AbortSignal): Promise<DeviceRecording> {
  signal?.throwIfAborted();
  if (archive.size < 12 || archive.size > AUDIO_BUDGET + MAX_MANIFEST_BYTES + 12) invalid("file size is outside the supported bounds.");
  const prefix = await archive.slice(0, 12).arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(prefix, 0, 8)) !== "ECHO0001") invalid("choose a .echo session exported by the device.");
  const length = new DataView(prefix).getUint32(8, true);
  if (!length || length > MAX_MANIFEST_BYTES || 12 + length > archive.size) invalid("the manifest is missing or truncated.");
  let raw: unknown;
  try { raw = JSON.parse(await archive.slice(12, 12 + length).text()); }
  catch { invalid("the manifest is not valid JSON."); }
  if (!object(raw) || !exactKeys(raw, ["version", "sessionId", "complete", "chunks"]) || raw.version !== 1 ||
      typeof raw.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(raw.sessionId) ||
      typeof raw.complete !== "boolean" || !Array.isArray(raw.chunks) || raw.chunks.length > MAX_CHUNKS) invalid("unsupported manifest.");
  if (!raw.chunks.length) invalid("no completed audio chunks were recovered. Keep the SD card's unfinished file.");
  const metadata: AudioChunk[] = [];
  for (const item of raw.chunks) {
    if (!isAudioChunk(item) || !exactKeys(item, fields) || item.sessionId !== raw.sessionId ||
        item.mimeType !== "audio/wav" || item.size <= 44 || item.size > 1_920_044 ||
        item.endMs > MAX_DURATION_MS || item.endMs - item.startMs > 60_000 ||
        item.overlapMs !== (item.sequence === 0 ? 0 : 2000)) invalid("invalid audio identity, timing or format.");
    metadata.push(item);
  }
  try { validateChunkOrder(metadata); } catch { invalid("chunks are missing, duplicated or out of order."); }
  if (metadata.some((item, index) => index > 0 && item.endMs <= metadata[index - 1].endMs)) invalid("a chunk adds no new audio.");
  let offset = 12 + length;
  const chunks: PlayableChunk[] = [];
  for (const item of metadata) {
    signal?.throwIfAborted();
    if (offset + item.size > archive.size) invalid("audio is truncated. Download the session again.");
    const audio = archive.slice(offset, offset + item.size, "audio/wav");
    checkWav(await audio.slice(0, 44).arrayBuffer(), item);
    if (await checksum(audio) !== item.checksum) invalid(`chunk ${item.sequence + 1} failed its integrity check. Keep the SD original and download again.`);
    chunks.push({ metadata: { ...item }, audio });
    offset += item.size;
    progress?.(chunks.length, metadata.length);
  }
  if (offset !== archive.size) invalid("unexpected trailing audio or bytes.");
  signal?.throwIfAborted();
  return { sessionId: raw.sessionId, complete: raw.complete, chunks, bytes: chunks.reduce((sum, chunk) => sum + chunk.audio.size, 0), durationMs: metadata.at(-1)!.endMs };
}

/** Repeated imports offer the same identities. Existing queue results survive.
 * A failed save leaves a recoverable prefix and never creates completion evidence.
 * Call only with the output of readDeviceRecording. */
export async function saveDeviceRecording(
  recording: DeviceRecording,
  store: QueueStore & { saveCompletion(completion: Completion): Promise<void> },
  progress?: ImportProgress,
): Promise<void> {
  const existing = await store.list();
  let addedBytes = 0;
  for (const chunk of recording.chunks) {
    const previous = existing.find(entry => entry.metadata.sessionId === chunk.metadata.sessionId &&
      (entry.metadata.id === chunk.metadata.id || entry.metadata.sequence === chunk.metadata.sequence));
    if (previous && !sameChunk(previous, chunk)) invalid("this session conflicts with an earlier import. Existing audio was kept.");
    if (!previous) addedBytes += chunk.audio.size;
  }
  if (existing.reduce((sum, chunk) => sum + chunk.audio.size, 0) + addedBytes > AUDIO_BUDGET) {
    throw new Error("This recording exceeds the free space in Echo's 256 MiB browser audio budget. Keep the .echo download and SD original; no audio was removed.");
  }
  for (let index = 0; index < recording.chunks.length; index++) {
    await store.offer(recording.chunks[index]);
    progress?.(index + 1, recording.chunks.length);
  }
  if (recording.complete) await store.saveCompletion({ sessionId: recording.sessionId, chunks: recording.chunks.map(chunk => chunk.metadata) });
}
