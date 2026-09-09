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
export interface CaptureOptions { readonly chunkMs: number; readonly overlapMs: number; readonly quickNote?: boolean }

export function validateCaptureOptions(options: CaptureOptions): void {
  if (!Number.isSafeInteger(options.chunkMs) || options.chunkMs < 1000 || options.chunkMs > 60000 ||
      !Number.isSafeInteger(options.overlapMs) || options.overlapMs < 0 || options.overlapMs >= options.chunkMs / 2) {
    throw new Error("Invalid chunk duration or overlap");
  }
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
    c.endMs - c.startMs <= 120000 && integer(c.overlapMs) && c.overlapMs <= c.endMs - c.startMs &&
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
