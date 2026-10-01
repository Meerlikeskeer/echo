import { isQuickNoteCapture, type QuickNoteCapture } from "./quick-note";

/** Browser-memory metadata only. No upload success implies a durable copy. */
export interface Session {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly captureStatus: "recording" | "stopped" | "failed";
}

export interface AudioChunk {
  readonly quickNote?: QuickNoteCapture;
  readonly sessionId: string;
  readonly id: string;
  readonly sequence: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly overlapMs: number;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
}

export interface PlayableChunk { readonly metadata: AudioChunk; readonly audio: Blob }
export interface CaptureOptions {
  readonly sessionNumber?: number;
  readonly chunkMs: number;
  readonly overlapMs: number;
  readonly quickNote?: boolean;
  /**
   * WEB-016. Requested Opus bitrate. Left to itself a browser picks its own —
   * Safari 26.4 was measured at 204 kbps — and at that rate a lecture does not
   * fit the local audio budget and a five-minute chunk does not fit an upload.
   * Requested, not guaranteed: `safeChunkMs` below works from what the recorder
   * reports it will actually use.
   */
  readonly audioBitsPerSecond?: number;
}

/** WEB-016. Ten minutes. Long enough for the five-minute chunks a lecture uses,
 *  short enough that losing one chunk loses minutes rather than a lecture. */
export const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
export const MAX_CHUNK_MS = 600_000;

export function validateCaptureOptions(options: CaptureOptions): void {
  if ((options.sessionNumber !== undefined && (!Number.isSafeInteger(options.sessionNumber) || options.sessionNumber < 1 || options.sessionNumber > 0xffffffff)) ||
      !Number.isSafeInteger(options.chunkMs) || options.chunkMs < 1000 || options.chunkMs > MAX_CHUNK_MS ||
      !Number.isSafeInteger(options.overlapMs) || options.overlapMs < 0 || options.overlapMs >= options.chunkMs / 2 ||
      (options.audioBitsPerSecond !== undefined &&
        (!Number.isSafeInteger(options.audioBitsPerSecond) || options.audioBitsPerSecond < 8_000 || options.audioBitsPerSecond > 320_000))) {
    throw new Error("Invalid chunk duration or overlap");
  }
}

/**
 * WEB-016. The chunk length this browser can actually upload.
 *
 * A chunk that exceeds the server's clip limit is refused every time it is
 * sent, so a browser recording at a higher bitrate than requested would lose an
 * entire lecture one permanently-blocked chunk at a time — and would only say
 * so after the first chunk closed, five minutes in. The recorder reads the
 * bitrate the recorder reports before capture starts and shortens the chunk
 * instead, which costs more chunks and loses nothing.
 *
 * `bitsPerSecond` of 0, NaN or undefined means the browser would not say. Use a short initial container when no rate is known; this is an estimate,
 * not proof of the final encoded size. The upload boundary remains authoritative.
 */
export function safeChunkMs(requestedMs: number, bitsPerSecond: number | undefined, maxClipBytes: number): number {
  if (!Number.isFinite(bitsPerSecond) || !bitsPerSecond || bitsPerSecond <= 0) return Math.min(requestedMs, 30_000);
  // A container carries more than the audio it holds. The margin is deliberately
  // generous: being under the limit matters, being close to it does not.
  const usableBytes = maxClipBytes * 0.8;
  const fittingMs = Math.floor((usableBytes * 8_000) / bitsPerSecond);
  if (fittingMs < 1000) throw new Error("Reported audio bitrate cannot fit a safe recording chunk");
  return Math.min(requestedMs, fittingMs);
}

export async function checksum(audio: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await audio.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Strict metadata validation also used at the upload boundary. */
export function isAudioChunk(value: unknown): value is AudioChunk {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(v);
  const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  return id(c.sessionId) && id(c.id) && integer(c.sequence) && integer(c.startMs) && integer(c.endMs) && c.endMs > c.startMs &&
    (c.quickNote === undefined || (isQuickNoteCapture(c.quickNote) && c.sequence === 0 && c.endMs <= 60000)) &&
    c.endMs - c.startMs <= MAX_CHUNK_MS + 60_000 && integer(c.overlapMs) && c.overlapMs <= c.endMs - c.startMs &&
    (c.sequence !== 0 || (c.startMs === 0 && c.overlapMs === 0)) &&
    typeof c.mimeType === "string" && c.mimeType.length <= 100 && integer(c.size) && c.size > 0 &&
    typeof c.checksum === "string" && /^[a-f0-9]{64}$/.test(c.checksum);
}

export function validateChunkOrder(chunks: readonly AudioChunk[]): void {
  for (let index = 0; index < chunks.length; index++) {
    const current = chunks[index];
    const previous = chunks[index - 1];
    if (!isAudioChunk(current) || current.sequence !== index ||
        chunks.slice(0, index).some((chunk) => chunk.id === current.id) ||
        (previous && (current.sessionId !== previous.sessionId || current.startMs < previous.startMs ||
          current.startMs > previous.endMs || current.endMs < previous.endMs || current.overlapMs !== previous.endMs - current.startMs))) {
      throw new Error("Missing, conflicting or invalid chunk metadata");
    }
  }
}
