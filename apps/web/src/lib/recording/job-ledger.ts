/**
 * ADR-016. `POST /api/recordings` holds no state between requests, so a response
 * lost in transit — a timeout, a suspended tab, a connection dropped after the
 * provider already answered — looks exactly like a request that never arrived.
 * The client must retry, and the provider then transcribes the same audio twice.
 * The wasted call is the small cost; the real one is that two transcriptions of
 * one chunk can differ, so "what is this chunk's transcript" stops having a
 * single answer and WEB-006 has to stitch parts that are not stable.
 *
 * This ledger closes the common window: a retry seconds later, on the instance
 * that just answered. It is **not** exactly-once and nothing here may claim it
 * is. A cold start, a redeploy, a second instance answering the retry, or a TTL
 * expiry each lose it, and the retry then costs a provider call exactly as it
 * does today. A ledger that outlives the process needs the database decision,
 * which ARCHITECTURE.md still lists as Open.
 *
 * A ledger entry is a result, not a durable copy of anything. It never
 * authorizes deleting raw audio (RET-002) and no response, replayed or fresh,
 * becomes evidence of a verified remote copy.
 */

/**
 * Chunk identity, and deliberately nothing else. The Route Handler builds this
 * only from metadata it has already validated against the uploaded bytes, so an
 * unauthenticated or lying caller cannot name a key it does not own the audio
 * for.
 */
export interface JobKey {
  readonly sessionId: string;
  readonly id: string;
  readonly checksum: string;
}

/**
 * `claim` ran the work. `join` attached to a job already running for the same
 * key. `replay` returned a stored result without calling any provider. Only
 * `claim` costs a provider call.
 */
export type JobOutcome = "claim" | "join" | "replay";

export interface JobRun<T> {
  readonly result: T;
  readonly outcome: JobOutcome;
}

export interface JobLedger<T> {
  run(key: JobKey, work: () => Promise<T>): Promise<JobRun<T>>;
}

export const jobKey = (key: JobKey): string => `${key.sessionId}/${key.id}/${key.checksum}`;

/** Long enough to cover a suspended tab reconnecting; short enough that a
 *  transcript is not held in memory beyond the retry window it exists for. */
export const RESULT_TTL_MS = 10 * 60_000;
/** Roughly two hours of 30-second chunks. The cap is what makes a Map safe to
 *  keep in a request-handling process at all. */
export const MAX_ENTRIES = 256;

interface LedgerEntry<T> {
  readonly pending: Promise<T>;
  /** Absent while the job is in flight. Wrapped so a legitimately `undefined`
   *  result is still distinguishable from "not finished yet". */
  settled?: { readonly value: T };
  /** `Infinity` while in flight, so expiry can never drop a join target. */
  expiresAt: number;
}

/**
 * The only adapter: memory in the process that is already handling the request.
 * No dependency and no platform service, so it behaves identically on Vercel and
 * in the self-hosted container (ADR-010). Nothing here is logged or written to
 * disk — the process already holds this text to answer the request, and this
 * widens that window from one request to a few minutes, no further.
 */
export class InProcessJobLedger<T> implements JobLedger<T> {
  private readonly entries = new Map<string, LedgerEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly clock: () => number;

  constructor(options: { readonly now?: () => number; readonly ttlMs?: number; readonly maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? RESULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? MAX_ENTRIES;
    this.clock = options.now ?? Date.now;
  }

  /** Entries currently held, including any past their TTL that no later call has
   *  yet swept. Exposed so a test can assert the bound rather than infer it. */
  get size(): number {
    return this.entries.size;
  }

  async run(key: JobKey, work: () => Promise<T>): Promise<JobRun<T>> {
    const id = jobKey(key);
    this.expire();
    const existing = this.entries.get(id);
    if (existing) {
      // Replay costs nothing. Join awaits the job already running rather than
      // starting a second one, and inherits its failure too — which is correct,
      // because a failure leaves both callers free to retry.
      if (existing.settled) return { result: existing.settled.value, outcome: "replay" };
      return { result: await existing.pending, outcome: "join" };
    }

    // Started before it is recorded, so work that throws synchronously never
    // leaves a job in the ledger that nothing will ever settle.
    const pending = work();
    if (!this.reserve(id, pending)) {
      // Every slot holds a job that is still in flight, so nothing can be
      // evicted without destroying a join target. The work still runs; it is
      // simply not recorded, which is the pre-ADR-016 behaviour and honest.
      return { result: await pending, outcome: "claim" };
    }
    try {
      const value = await pending;
      const entry = this.entries.get(id);
      if (entry?.pending === pending) {
        entry.settled = { value };
        entry.expiresAt = this.clock() + this.ttlMs;
      }
      return { result: value, outcome: "claim" };
    } catch (error) {
      // A failure is never cached. The next attempt must be free to retry, and
      // a cached rejection would turn one bad minute into a dead chunk.
      if (this.entries.get(id)?.pending === pending) this.entries.delete(id);
      throw error;
    }
  }

  private expire(): void {
    const now = this.clock();
    for (const [id, entry] of this.entries) {
      if (entry.settled && now >= entry.expiresAt) this.entries.delete(id);
    }
  }

  private reserve(id: string, pending: Promise<T>): boolean {
    if (this.entries.size >= this.maxEntries) {
      // Only a settled entry is ever evicted, and the one closest to expiry
      // first. An in-flight job is not evictable at any pressure.
      let oldest: string | undefined;
      let oldestAt = Infinity;
      for (const [candidate, entry] of this.entries) {
        if (entry.settled && entry.expiresAt < oldestAt) {
          oldest = candidate;
          oldestAt = entry.expiresAt;
        }
      }
      if (oldest === undefined) return false;
      this.entries.delete(oldest);
    }
    this.entries.set(id, { pending, expiresAt: Infinity });
    return true;
  }
}
