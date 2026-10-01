import { isAudioChunk, validateChunkOrder, type AudioChunk, type PlayableChunk, type Session } from "./session";

export interface Completion { readonly sessionId: string; readonly chunks: readonly AudioChunk[] }

export function sameMetadata(a: AudioChunk, b: AudioChunk): boolean {
  return a.sessionId === b.sessionId && a.id === b.id && a.sequence === b.sequence &&
    a.startMs === b.startMs && a.endMs === b.endMs && a.overlapMs === b.overlapMs &&
    a.mimeType === b.mimeType && a.size === b.size && a.checksum === b.checksum &&
    a.quickNote?.stoppedAt === b.quickNote?.stoppedAt && a.quickNote?.onlineAtStop === b.quickNote?.onlineAtStop;
}

export function isCompletion(value: unknown): value is Completion {
  if (!value || typeof value !== "object") return false;
  const c = value as Completion;
  if (typeof c.sessionId !== "string" || !Array.isArray(c.chunks) || !c.chunks.length ||
      !c.chunks.every(chunk => isAudioChunk(chunk) && chunk.sessionId === c.sessionId)) return false;
  try { validateChunkOrder(c.chunks); return true; } catch { return false; }
}

export async function persistSessionCompletion(
  captured: { session: Session; chunks: readonly PlayableChunk[] },
  save: (completion: Completion) => Promise<void>,
): Promise<Completion | null> {
  if (captured.session.captureStatus === "recording" || captured.session.captureStatus === "failed") return null;
  const { session } = captured;
  const completion = { sessionId: session.id, chunks: captured.chunks.map(chunk => ({ ...chunk.metadata })) };
  if (session.captureStatus !== "stopped" || !Number.isFinite(session.startedAt) ||
      session.endedAt === null || !Number.isFinite(session.endedAt) || session.endedAt <= session.startedAt ||
      !isCompletion(completion) || completion.chunks.at(-1)!.endMs > session.endedAt - session.startedAt) {
    throw new Error("Invalid capture completion metadata");
  }
  // Track shutdown can advance the capture clock after the final chunk ends.
  // The manifest establishes the expected chunks; duration alone cannot.
  await save(completion);
  return completion;
}
