import { checksum, isAudioChunk, validateChunkOrder, type PlayableChunk } from "./session";
import type { RecordingResult } from "./pipeline";
import { isCompletion, sameMetadata, type Completion } from "./session-completion";
import { validateQuickNote } from "./quick-note";

/**
 * WEB-016 raised this from 64 MiB, which held about forty minutes at the
 * bitrate browsers pick unprompted — less than one lecture. At the 32 kbps the
 * recorder now requests, 256 MiB is roughly eighteen hours of audio, so the
 * binding limit becomes the browser's own storage quota rather than this
 * number. Nothing here deletes audio to stay under it: the budget refuses new
 * clips, it never reclaims old ones (REQ retention rules).
 */
export const AUDIO_BUDGET = 256 * 1024 * 1024;
// Enough headroom to finish the chunk in progress and start several more, at
// Safari's measured 204 kbps rather than at the rate Echo asks for.
export const CAPACITY_RESERVE = 8 * 1024 * 1024;
/**
 * Mirrors the transcription adapter's `maxClipBytes`. The server stays
 * authoritative — this copy exists so an oversized chunk is named as oversized
 * in the browser rather than spending eight upload attempts to be told so, once
 * per chunk, for a whole lecture.
 */
export const MAX_UPLOAD_BYTES = 4_000_000;
import { normalizeMime } from "./media-type";
export { normalizeMime } from "./media-type";
export const chunkKey = (chunk: PlayableChunk) => `${chunk.metadata.sessionId}/${chunk.metadata.id}`;
export interface QueueEntry extends PlayableChunk {
  /**
   * `uploading` means *in flight, outcome unknown* (ADR-016). It is written
   * before the request leaves, because a page that dies mid-upload is otherwise
   * indistinguishable from one that never sent — and the two need different
   * handling. Recovery returns it to `pending`; whether that retry costs a
   * provider call is then the server's decision, not this browser's.
   */
  state: "pending" | "uploading" | "processed" | "blocked";
  attempts: number;
  nextAttemptAt: number;
  error?: string;
  result?: RecordingResult;
  /** Browser wall-clock time when the processing response arrived. */
  resultReceivedAt?: number;
}
export interface QueueStore {
  offer(chunk: PlayableChunk): Promise<void>;
  list(): Promise<QueueEntry[]>;
  update(entry: QueueEntry): Promise<void>;
}

/**
 * A drain that never returned — the tab was closed, the process was killed —
 * leaves `uploading` behind with no one to finish it. On load it returns to
 * `pending` so it is retried; its attempt count and backoff are kept, because
 * the attempt really was made. A `processed` entry is never reset: its result is
 * the answer, and re-sending it would be work with nothing to gain.
 */
export function recoverEntry(entry: QueueEntry): QueueEntry {
  return entry.state === "uploading" ? { ...entry, state: "pending" } : entry;
}
export function recoverEntries(entries: readonly QueueEntry[]): QueueEntry[] {
  return entries.map(recoverEntry);
}

/** Processing updates never replace or remove raw audio, whatever the caller
 *  hands back — the stored Blob is the only copy that exists. */
export function processingUpdate(previous: QueueEntry, entry: QueueEntry): QueueEntry {
  return { ...previous, state: entry.state, attempts: entry.attempts, nextAttemptAt: entry.nextAttemptAt, error: entry.error, result: entry.result, resultReceivedAt: entry.resultReceivedAt };
}

export interface QueueProgress {
  readonly total: number;
  readonly transcribed: number;
  readonly uploading: number;
  readonly waiting: number;
  readonly retrying: number;
  readonly blocked: number;
}
/** Drives the during-capture progress line. `retrying` is separated from
 *  `waiting` because "not sent yet" and "sent and refused" read the same in a
 *  single pending count, and only one of them is a problem. */
export function summarizeQueue(entries: readonly QueueEntry[]): QueueProgress {
  const count = (predicate: (entry: QueueEntry) => boolean) => entries.filter(predicate).length;
  return {
    total: entries.length,
    transcribed: count((entry) => entry.state === "processed"),
    uploading: count((entry) => entry.state === "uploading"),
    waiting: count((entry) => entry.state === "pending" && entry.attempts === 0),
    retrying: count((entry) => entry.state === "pending" && entry.attempts > 0),
    blocked: count((entry) => entry.state === "blocked"),
  };
}
/** The one local-storage failure the user can fix themselves: another tab holds
 *  the previous database version open, so the v1 → v2 upgrade cannot run. Its
 *  message must survive storageFailure(), because generic advice would send the
 *  owner to download clips when closing a tab is what actually recovers.
 *
 *  WEB-015. It carries the remedy and nothing else. It used to end "Recording
 *  stopped; previously saved clips are retained", and storageFailure() returned
 *  it verbatim before the situation was ever consulted — so the situation fix
 *  below skipped the error that reaches the owner most often. A blocked upgrade
 *  is thrown from the database open, which the load-time poll performs before
 *  anything has been recorded, and the sentence asserted a recording had stopped
 *  when none had started. The consequence belongs to the caller, which knows it. */
export class StorageBlockedError extends Error {
  constructor(message = "Close other Echo tabs to upgrade local storage, then reload this page.") {
    super(message);
    this.name = "StorageBlockedError";
  }
}
/**
 * WEB-015. Where the failure happened, which the caller knows and the error does
 * not. One sentence used to serve all three, and it was false in two of them.
 *
 * - `capture` — a recorded clip could not be saved while recording. `capture.ts`
 *   calls stop() when the persist callback throws, so "recording stopped" is
 *   true here and only here.
 * - `starting` — prepare() refused before the microphone was ever opened.
 *   Nothing was recording and nothing is unsaved.
 * - `maintenance` — the load-time recovery, the five-second poll or the drain.
 *   These run with no capture in progress, so telling the owner that recording
 *   stopped and that unsaved clips need rescuing describes neither the cause nor
 *   any true consequence. That sentence is what sent a session to clear site
 *   data, destroying saved audio, which the retention rules forbid as a remedy.
 */
export type StorageSituation = "capture" | "starting" | "maintenance";
/** What the situation means for the owner, stated once. A remedy that is the
 *  same everywhere — closing a tab — still has a different consequence in each
 *  situation, and only the caller knows which. */
const CONSEQUENCE: Record<StorageSituation, string> = {
  capture: "Recording stopped; previously saved clips are retained.",
  starting: "Recording did not start; previously saved clips are retained.",
  maintenance: "Nothing was recording, and nothing has been deleted; saved clips are retained.",
};
/** The error is never interpolated into the returned sentence. A storage error
 *  can carry a key name or a path, and this string is rendered on the page;
 *  `reportFailure` in ./log.ts is where the real cause goes. The one exception
 *  is StorageBlockedError, whose message Echo writes itself and which carries
 *  the only remedy the owner can act on. */
export function storageFailure(error: unknown, situation: StorageSituation = "capture"): string {
  if (error instanceof Error && error.name === "StorageBlockedError") {
    return `${error.message} ${CONSEQUENCE[situation]}`;
  }
  const full = error instanceof Error && error.name === "QuotaExceededError";
  if (situation === "starting") {
    return full
      ? "Storage is full, so recording did not start. Previously saved clips are retained; download and remove clips to free space."
      : "Local saving is not working, so recording did not start. Previously saved clips are retained. The exact error is in this page's browser console.";
  }
  if (situation === "maintenance") {
    return full
      ? "Storage is full. Previously saved clips are retained and nothing has been deleted; download and remove clips to free space."
      : "Local storage could not be read just now. Saved clips are retained and nothing has been deleted. The exact error is in this page's browser console.";
  }
  return full
    ? "Storage is full. Recording stopped. Previously saved clips are retained; download unsaved clips before leaving."
    : "Local saving failed. Recording stopped. Keep this page open and download unsaved clips before leaving.";
}
/**
 * WEB-015. A storage warning must not outlive the failure it describes. The only
 * thing that used to clear one was a successful prepare(), which runs only when
 * the owner presses Record — so a chunk that failed once and saved on retry left
 * "Local saving failed. Recording stopped." on screen indefinitely, beside a
 * queue showing zero unsaved clips.
 *
 * A storage operation that succeeds while nothing is waiting unsaved is the
 * evidence that the condition is over, and it is the only evidence available: no
 * error carries a signal that it has been resolved. Holding the warning while a
 * clip is still unsaved is deliberate — that clip is the reason the warning was
 * worth showing. A genuinely persistent fault cannot be cleared this way,
 * because the operation that would clear it fails too.
 *
 * **`withdrawable` is what stops this from erasing true warnings.** The rule
 * above holds for a *storage* warning, whose whole claim is that storage is not
 * working. It does not hold for a warning about a durable fact — a session whose
 * capture-completion record was never saved stays partial forever, and reading
 * the store successfully five seconds later says nothing about it. Withdrawing
 * that one on a successful poll is the same defect as never withdrawing the
 * first, pointed the other way: the owner sees a true warning for five seconds.
 */
export type StorageWarning = { readonly message: string; readonly withdrawable: boolean };
/** A warning a successful storage operation can withdraw. */
export function transientWarning(message: string): StorageWarning {
  return { message, withdrawable: true };
}
/** A warning describing a fact no later success changes. Only a new recording
 *  clears it, which prepare() does by starting a different session. */
export function durableWarning(message: string): StorageWarning {
  return { message, withdrawable: false };
}
export function resolveFailure(current: StorageWarning | null, unsavedCount: number): StorageWarning | null {
  if (!current || !current.withdrawable) return current;
  return unsavedCount === 0 ? null : current;
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
    x.endMs === y.endMs && x.overlapMs === y.overlapMs && x.size === y.size && x.checksum === y.checksum && normalizeMime(x.mimeType) === normalizeMime(y.mimeType) &&
    x.quickNote?.stoppedAt === y.quickNote?.stoppedAt && x.quickNote?.onlineAtStop === y.quickNote?.onlineAtStop;
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
      let blocked = false;
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("chunks")) {
          const store = db.createObjectStore("chunks", { keyPath: ["metadata.sessionId", "metadata.id"] });
          store.createIndex("sequence", ["metadata.sessionId", "metadata.sequence"], { unique: true });
        }
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "sessionId" });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new StorageBlockedError()); };
      request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
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
        store.put(processingUpdate(previous, entry));
        done();
      };
    });
  }
  /** The manifest and the saved metadata are checked in the same transaction.
   * Request success is not commit success: only oncomplete publishes evidence. */
  async saveCompletion(completion: Completion): Promise<void> {
    if (!isCompletion(completion)) throw new Error("Invalid capture completion metadata");
    const manifest: Completion = { sessionId: completion.sessionId, chunks: completion.chunks.map(chunk => ({ ...chunk })) };
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction, request: IDBRequest<unknown[]>;
      let failure: Error | null = null;
      // objectStore() throws NotFoundError on an unexpected schema, so it sits
      // inside the same guard as transaction(): every error path closes the
      // connection rather than leaking it behind a rejected promise.
      try {
        tx = db.transaction(["chunks", "sessions"], "readwrite", { durability: "strict" });
        request = tx.objectStore("chunks").getAll();
      } catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error("Completion transaction aborted")); };
      const fail = () => { failure = new Error("Capture completion conflicts with saved chunks"); tx.abort(); };
      request.onsuccess = () => {
        const saved = (request.result as QueueEntry[]).filter(entry => entry?.metadata?.sessionId === manifest.sessionId);
        if (saved.length !== manifest.chunks.length || !manifest.chunks.every(expected =>
          saved.some(entry => isAudioChunk(entry.metadata) && sameMetadata(expected, entry.metadata)))) { fail(); return; }
        const sessions = tx.objectStore("sessions");
        const previous = sessions.get(manifest.sessionId);
        previous.onsuccess = () => {
          if (previous.result !== undefined && (!isCompletion(previous.result) ||
              previous.result.chunks.length !== manifest.chunks.length ||
              !manifest.chunks.every((chunk, index) => sameMetadata(chunk, previous.result.chunks[index])))) { fail(); return; }
          sessions.put(manifest);
        };
      };
    });
  }
  async listCompletions(): Promise<Completion[]> {
    const db = await this.open();
    return new Promise<Completion[]>((resolve, reject) => {
      let tx: IDBTransaction, request: IDBRequest<unknown[]>;
      let completions: Completion[] = [];
      try {
        tx = db.transaction("sessions", "readonly");
        request = tx.objectStore("sessions").getAll();
      } catch (error) { db.close(); reject(error); return; }
      // Retain malformed evidence for the stitcher to flag as invalid instead
      // of promoting it to final or crashing the presentation boundary.
      request.onsuccess = () => { completions = request.result as Completion[]; };
      tx.oncomplete = () => { db.close(); resolve(completions); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Completion recovery failed")); };
    });
  }
  /**
   * Called once when the page loads, before the first drain. Another tab could
   * be uploading one of these right now, and this would reset it — but that
   * costs at most a repeated send, which is what the server's job ledger exists
   * to absorb, whereas leaving a dead `uploading` row costs the chunk entirely.
   */
  async recover(): Promise<void> {
    for (const entry of await this.list()) {
      const recovered = recoverEntry(entry);
      if (recovered !== entry) await this.update(recovered);
    }
  }
}

export class UploadFailure extends Error {
  constructor(readonly retryable: boolean, message?: string) {
    super(message ?? (retryable ? "Server unavailable; retry scheduled." : "Processing rejected. Sign in or check provider configuration, then retry."));
  }
}
/** WEB-016. Too large to ever be accepted, so it is refused here rather than
 *  eight times over the network. The audio is kept and stays downloadable —
 *  this is a processing refusal, never a reason to drop a recording. */
export const OVERSIZED = "This clip is larger than the server accepts, so it was not sent. The audio is saved here and can be downloaded. Shorter chunks will avoid this.";
export const retryDelay = (attempt: number) => Math.min(60_000, 1000 * 2 ** Math.min(6, Math.max(0, attempt - 1)));
/** Retrying forever against a server that is never going to accept this chunk
 *  burns the provider allowance and hides the failure behind an activity
 *  indicator. At the bound the entry stops on its own and says why. */
export const MAX_ATTEMPTS = 8;
export const EXHAUSTED = `Upload failed ${MAX_ATTEMPTS} times and is paused. The audio is still saved on this browser — use "Retry pending processing" to try again.`;
export async function drainQueue(store: QueueStore, send: (chunk: PlayableChunk) => Promise<RecordingResult>, options: { online: () => boolean; now: () => number; force?: boolean; active?: () => boolean }) {
  for (const entry of await store.list()) {
    if (!options.online() || options.active?.() === false) break;
    if (entry.state === "processed" || (!options.force && (entry.state === "blocked" || entry.nextAttemptAt > options.now()))) continue;
    await verifyChunk(entry);
    const attempt = { ...entry, state: "uploading" as const, attempts: entry.attempts + 1, nextAttemptAt: options.now() + retryDelay(entry.attempts + 1) };
    await store.update(attempt); // Write failure must prevent the HTTP request.
    let result: RecordingResult;
    try { result = await send(entry); }
    catch (error) {
      const permanent = error instanceof UploadFailure && !error.retryable;
      const exhausted = attempt.attempts >= MAX_ATTEMPTS;
      await store.update({ ...attempt, state: permanent || exhausted ? "blocked" : "pending",
        error: permanent || !exhausted ? (error instanceof UploadFailure ? error.message : "Connection interrupted; retry scheduled.") : EXHAUSTED });
      // ADR-016: one unlucky chunk used to stall every chunk behind it for the
      // rest of the session. It now waits out its own backoff while the others
      // go. Offline and unmounted still break above, because there continuing
      // is pointless rather than merely slow.
      continue;
    }
    // A response is a processing result, NEVER evidence for deleting a Blob.
    await store.update({ ...attempt, state: "processed", result, resultReceivedAt: options.now(), error: undefined, nextAttemptAt: 0 });
  }
}
export async function sendChunk(chunk: PlayableChunk): Promise<RecordingResult> {
  if (chunk.audio.size > MAX_UPLOAD_BYTES) throw new UploadFailure(false, OVERSIZED);
  const body = new FormData();
  body.append("audio", chunk.audio, `recording.${chunk.audio.type.includes("ogg") ? "ogg" : chunk.audio.type.includes("mp4") ? "m4a" : "webm"}`);
  body.append("durationMs", String(chunk.metadata.endMs - chunk.metadata.startMs));
  body.append("chunk", JSON.stringify(chunk.metadata));
  const response = await fetch("/api/recordings", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    const retryable = error && typeof error === "object" && "retryable" in error && typeof error.retryable === "boolean"
      ? error.retryable : response.status === 408 || response.status === 429 || response.status >= 500;
    throw new UploadFailure(retryable);
  }
  const result = await response.json() as RecordingResult;
  if (!result?.transcript || !result.notes || !Array.isArray(result.disclosures)) throw new UploadFailure(true);
  if (chunk.metadata.quickNote && !validateQuickNote(result.quickNote)) throw new UploadFailure(false);
  return result;
}
export async function capacity(entries: readonly PlayableChunk[]) {
  const bytes = entries.reduce((sum, entry) => sum + entry.audio.size, 0);
  const estimate = await navigator.storage?.estimate().catch(() => undefined);
  const available = Math.min(AUDIO_BUDGET - bytes, estimate?.quota === undefined ? Infinity : Math.max(0, estimate.quota - (estimate.usage ?? 0)));
  const persistent = await navigator.storage?.persisted().catch(() => false) ?? false;
  return { bytes, available, nearFull: available < CAPACITY_RESERVE, persistent };
}

/** IDB deserializes a new Blob on every read. Keep playback URLs stable. */
export function preserveAudio(previous: readonly QueueEntry[], next: QueueEntry[]): QueueEntry[] {
  const existing = new Map(previous.map((entry) => [chunkKey(entry), entry]));
  return next.map((entry) => {
    const old = existing.get(chunkKey(entry));
    return old && sameChunk(old, entry) ? { ...entry, audio: old.audio } : entry;
  });
}
