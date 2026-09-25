import type { PlayableChunk } from "./session";

/** Estimate wall-clock recording capacity from actual encoded bytes. Using
 * start-to-next-start includes overlap; the peak recent rate avoids optimistic
 * averages after a codec/rate change. Unfinished audio and quota reserve are
 * subtracted because neither is reflected in persisted usage yet. */
export function recordingHeadroom(entries: readonly PlayableChunk[], sessionId: string | undefined,
  available: number, elapsedMs: number, chunkMs: number, overlapMs: number, reserve: number): number | null {
  const rows = entries.filter(entry => entry.metadata.sessionId === sessionId)
    .slice().sort((a, b) => a.metadata.sequence - b.metadata.sequence);
  if (!rows.length || !Number.isFinite(available)) return null;
  const rates = rows.slice(-5).map(entry => {
    const duration = entry.metadata.endMs - entry.metadata.startMs;
    return entry.audio.size / Math.max(1, duration - Math.min(overlapMs, duration / 2));
  });
  const rate = Math.max(...rates);
  if (!(rate > 0)) return null;
  const lastEnd = rows.at(-1)!.metadata.endMs;
  const unfinished = Math.max(0, elapsedMs - lastEnd + overlapMs) * rate;
  const free = Math.max(0, available - reserve - unfinished - chunkMs * rate);
  return Math.floor(free / rate / 60_000);
}
