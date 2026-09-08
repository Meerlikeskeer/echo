import { checksum, isAudioChunk, validateChunkOrder, type PlayableChunk } from "./session";
import type { RecordingResult } from "./pipeline";

export const AUDIO_BUDGET = 64 * 1024 * 1024;
// Safari's measured 204 kbps, plus overlap/headroom: over two minutes.
export const CAPACITY_RESERVE = 4 * 1024 * 1024;
export const normalizeMime = (type: string) => type.toLowerCase().split(";").map((part) => part.trim()).join(";");
export const chunkKey = (chunk: PlayableChunk) => `${chunk.metadata.sessionId}/${chunk.metadata.id}`;
export interface QueueEntry extends PlayableChunk {
  state: "pending" | "processed" | "blocked";
  attempts: number;
  nextAttemptAt: number;
  error?: string;
  result?: RecordingResult;
}
export interface QueueStore {
  offer(chunk: PlayableChunk): Promise<void>;
  list(): Promise<QueueEntry[]>;
  update(entry: QueueEntry): Promise<void>;
}
export function storageFailure(error: unknown): string {
  return error instanceof Error && error.name === "QuotaExceededError"
    ? "Storage is full. Recording stopped. Previously saved clips are retained; download unsaved clips before leaving."
    : "Local saving failed. Recording stopped. Keep this page open and download unsaved clips before leaving.";
}
export async function verifyChunk(chunk: PlayableChunk): Promise<void> {
  if (!isAudioChunk(chunk.metadata) || !(chunk.audio instanceof Blob) || chunk.audio.size !== chunk.metadata.size ||
      normalizeMime(chunk.audio.type) !== normalizeMime(chunk.metadata.mimeType) || await checksum(chunk.audio) !== chunk.metadata.checksum) {
    throw new Error("Invalid local audio or checksum");
  }
}
export function sameChunk(a: PlayableChunk, b: PlayableChunk): boolean {
  const x = a.metadata, y = b.metadata;
  return x.sessionId === y.sessionId && x.id === y.id && x.sequence === y.sequence && x.startMs === y.startMs &&
    x.endMs === y.endMs && x.overlapMs === y.overlapMs && x.size === y.size && x.checksum === y.checksum && normalizeMime(x.mimeType) === normalizeMime(y.mimeType);
}
export function orderEntries(entries: QueueEntry[]): QueueEntry[] {
  return entries.sort((a, b) => a.metadata.sessionId.localeCompare(b.metadata.sessionId) || a.metadata.sequence - b.metadata.sequence);
}
export function incompleteSessions(entries: readonly PlayableChunk[]): string[] {
  return [...new Set(entries.map((c) => c.metadata.sessionId))].filter((id) => {
    try { validateChunkOrder(entries.filter((c) => c.metadata.sessionId === id).map((c) => c.metadata).sort((a, b) => a.sequence - b.sequence)); return false; }
    catch { return true; }
  });
}

/** Real browser API is resolved here, never constructed through an injected fake. */
export class IndexedDBQueue implements QueueStore {
  constructor(readonly name = "echo-audio-queue-v1", readonly budget = AUDIO_BUDGET) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("chunks", { keyPath: ["metadata.sessionId", "metadata.id"] });
        store.createIndex("sequence", ["metadata.sessionId", "metadata.sequence"], { unique: true });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Close other Echo tabs to upgrade local storage"));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, value: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      let result: T, failure: Error | null = null;
      let tx: IDBTransaction;
      try { tx = db.transaction("chunks", mode, { durability: "strict" }); }
      catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error("Local transaction aborted")); };
      const fail = (error: Error) => { failure = error; tx.abort(); };
      try { run(tx.objectStore("chunks"), (value) => { result = value; }, fail); }
      catch (error) { fail(error instanceof Error ? error : new Error("Local transaction failed")); }
    });
  }
  async offer(chunk: PlayableChunk): Promise<void> {
    await verifyChunk(chunk); // Never await crypto inside a live IDB transaction.
    return this.transaction<void>("readwrite", (store, done, fail) => {
      const all = store.getAll();
      all.onsuccess = () => {
        const entries = all.result as QueueEntry[];
        const existing = entries.find((entry) => chunkKey(entry) === chunkKey(chunk));
        if (existing) { if (!sameChunk(existing, chunk)) fail(new Error("Conflicting chunk identity")); else done(); return; }
        if (entries.some((entry) => entry.metadata.sessionId === chunk.metadata.sessionId && entry.metadata.sequence === chunk.metadata.sequence)) { fail(new Error("Conflicting chunk sequence")); return; }
        if (entries.reduce((sum, entry) => sum + entry.audio.size, 0) + chunk.audio.size > this.budget) {
          fail(new DOMException("Audio budget exhausted", "QuotaExceededError")); return;
        }
        store.add({ ...chunk, state: "pending", attempts: 0, nextAttemptAt: 0 } satisfies QueueEntry);
        done();
      };
    });
  }
  async list(): Promise<QueueEntry[]> {
    const entries = await this.transaction<QueueEntry[]>("readonly", (store, done) => {
      const request = store.getAll(); request.onsuccess = () => done(request.result as QueueEntry[]);
    });
    // Corruption is a visible failure, never silently omitted or uploaded.
    await Promise.all(entries.map(verifyChunk));
    return orderEntries(entries);
  }
  async update(entry: QueueEntry): Promise<void> {
    return this.transaction<void>("readwrite", (store, done, fail) => {
      const request = store.get([entry.metadata.sessionId, entry.metadata.id]);
      request.onsuccess = () => {
        const previous = request.result as QueueEntry | undefined;
        if (!previous || !sameChunk(previous, entry)) { fail(new Error("Chunk changed during processing")); return; }
        // Processing updates never replace or remove raw audio.
        store.put({ ...previous, state: entry.state, attempts: entry.attempts, nextAttemptAt: entry.nextAttemptAt, error: entry.error, result: entry.result });
        done();
      };
    });
  }
}

export class UploadFailure extends Error {
  constructor(readonly retryable: boolean) { super(retryable ? "Server unavailable; retry scheduled." : "Processing rejected. Sign in or check provider configuration, then retry."); }
}
export const retryDelay = (attempt: number) => Math.min(60_000, 1000 * 2 ** Math.min(6, Math.max(0, attempt - 1)));
export async function drainQueue(store: QueueStore, send: (chunk: PlayableChunk) => Promise<RecordingResult>, options: { online: () => boolean; now: () => number; force?: boolean; active?: () => boolean }) {
  for (const entry of await store.list()) {
    if (!options.online() || options.active?.() === false) break;
    if (entry.state === "processed" || (!options.force && (entry.state === "blocked" || entry.nextAttemptAt > options.now()))) continue;
    await verifyChunk(entry);
    const attempt = { ...entry, attempts: entry.attempts + 1, nextAttemptAt: options.now() + retryDelay(entry.attempts + 1) };
    await store.update(attempt); // Write failure must prevent the HTTP request.
    let result: RecordingResult;
    try { result = await send(entry); }
    catch (error) {
      await store.update({ ...attempt, state: error instanceof UploadFailure && !error.retryable ? "blocked" : "pending", error: error instanceof UploadFailure ? error.message : "Connection interrupted; retry scheduled." });
      break;
    }
    // A response is a processing result, NEVER evidence for deleting a Blob.
    await store.update({ ...attempt, state: "processed", result, error: undefined, nextAttemptAt: 0 });
  }
}
export async function sendChunk(chunk: PlayableChunk): Promise<RecordingResult> {
  const body = new FormData();
  body.append("audio", chunk.audio, `recording.${chunk.audio.type.includes("ogg") ? "ogg" : chunk.audio.type.includes("mp4") ? "m4a" : "webm"}`);
  body.append("durationMs", String(chunk.metadata.endMs - chunk.metadata.startMs));
  body.append("chunk", JSON.stringify(chunk.metadata));
  const response = await fetch("/api/recordings", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new UploadFailure(response.status === 408 || response.status === 429 || response.status >= 500);
  const result = await response.json() as RecordingResult;
  if (!result?.transcript || !result.notes || !Array.isArray(result.disclosures)) throw new UploadFailure(true);
  return result;
}
export async function capacity(entries: readonly PlayableChunk[]) {
  const bytes = entries.reduce((sum, entry) => sum + entry.audio.size, 0);
  const estimate = await navigator.storage?.estimate().catch(() => undefined);
  const available = Math.min(AUDIO_BUDGET - bytes, estimate?.quota === undefined ? Infinity : Math.max(0, estimate.quota - (estimate.usage ?? 0)));
  const persistent = await navigator.storage?.persisted().catch(() => false) ?? false;
  return { bytes, available, nearFull: available < CAPACITY_RESERVE, persistent };
}
