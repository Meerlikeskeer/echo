/**
 * WEB-015. Every local-storage failure in the recorder was caught, mapped to a
 * user-facing sentence and then discarded, so the underlying error existed
 * nowhere at all. Diagnosing a stuck warning meant reading IndexedDB by hand
 * from a browser console, because nothing in the recorder, the queue hook or the
 * queue module ever wrote a line. These two functions are the whole fix.
 *
 * The console is the destination on purpose. The audience is the owner with the
 * page open, and Echo has no server-side log a browser failure could reach —
 * ADR-016 is explicit that no durable server-side store exists. Sending failures
 * anywhere else would be a new external processor and a new disclosure.
 *
 * What is reported is deliberately narrow: where the failure happened, and the
 * error's own name and message. Never a Blob, a chunk, a transcript or a
 * metadata record. `AGENTS.md` forbids recording content reaching a log, and a
 * queue entry carries both the audio and the transcript.
 */

/** The error's name and message, and nothing that could carry audio or text.
 *  A thrown non-Error is named by its type rather than stringified, because an
 *  object thrown from application code could be a chunk. */
export function describeCause(error: unknown): string {
  if (error instanceof Error) {
    const detail = error.message.trim();
    return detail ? `${error.name}: ${detail}` : error.name;
  }
  if (typeof error === "string") {
    const detail = error.trim();
    return detail ? detail : "Empty string thrown";
  }
  return `Non-error value of type ${error === null ? "null" : typeof error}`;
}

/**
 * `scope` names the operation that failed in the owner's terms rather than the
 * function's — "saving a recorded clip", not "persist". The raw error is passed
 * as a second argument so the console keeps it expandable with its stack, while
 * the first argument stays one readable line.
 */
export function reportFailure(scope: string, error: unknown): void {
  console.error(`Echo: ${scope} failed — ${describeCause(error)}`, error);
}
