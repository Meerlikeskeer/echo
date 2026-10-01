import { requireOwnerAccess } from "../../../lib/owner-access";
import { providerSetup } from "../../../lib/providers/registry";
import { processRecording, validateClip, type RecordingResult } from "../../../lib/recording/pipeline";
import { describeFailure, type RecordingErrorBody } from "../../../lib/recording/http";
import { ProviderError } from "../../../lib/providers/errors";
import type { AudioClip } from "../../../lib/providers/types";
import { checksum, isAudioChunk, type AudioChunk } from "../../../lib/recording/session";
import { InProcessJobLedger, type JobLedger } from "../../../lib/recording/job-ledger";

import { normalizeMime } from "../../../lib/recording/media-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Allows both sequential provider calls and response validation; request-policy.ts
 * keeps provider deadlines below this route limit and the browser above it. */
export const maxDuration = 300;

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...extra },
  });

/** The response body a chunk upload produced, stored whole so a retry of the
 *  same chunk identity gets back the same answer rather than a second opinion. */
type TranscriptionResult = Pick<RecordingResult, "transcript" | "disclosures">;
type ChunkResponse = (RecordingResult | TranscriptionResult) & { readonly chunk: AudioChunk };

// Module scope on purpose: this is the state that survives between requests in
// one process, and there is deliberately no other. ADR-016 is explicit that a
// cold start, a redeploy or a second instance loses it and the retry then costs
// a provider call, exactly as it did before.
const ledger: JobLedger<ChunkResponse> = new InProcessJobLedger<ChunkResponse>();

const fail = (status: number, body: RecordingErrorBody) => json(status, { error: body });

export async function POST(request: Request): Promise<Response> {
  // Proxy already gates every route; this endpoint checks again at its own
  // boundary so the guard does not depend on middleware remaining in place.
  try {
    await requireOwnerAccess();
  } catch {
    return fail(401, { code: "unauthorized_owner", port: null, message: "Private access required.", retryable: false });
  }

  if (!providerSetup.ok) {
    return json(503, {
      error: { code: "provider_unconfigured", port: null, message: "Recording providers are not configured.", retryable: false } satisfies RecordingErrorBody,
      // Variable names only, never values, and only after owner authorization.
      problems: providerSetup.problems,
    });
  }
  // Bound here because the check above narrows this module binding, and that
  // narrowing does not survive into the ledger's closure.
  const providers = providerSetup;

  let clip: AudioClip;
  let chunk: AudioChunk | undefined;
  let transcriptionOnly = false;
  try {
    const form = await request.formData();
    const mode = form.get("mode");
    if (mode !== null && mode !== "transcription-only") throw new Error("Invalid mode");
    transcriptionOnly = mode === "transcription-only";
    const audio = form.get("audio");
    if (typeof audio === "string" || audio === null) {
      return fail(400, { code: "bad_request", port: null, message: "The request did not include an audio recording.", retryable: false });
    }
    const declared = Number(form.get("durationMs"));
    const metadata = form.get("chunk");
    if (metadata !== null) {
      if (typeof metadata !== "string") throw new Error("Invalid metadata");
      const parsed: unknown = JSON.parse(metadata);
      if (!isAudioChunk(parsed) || parsed.size !== audio.size || normalizeMime(parsed.mimeType) !== normalizeMime(audio.type) ||
          parsed.endMs - parsed.startMs !== declared || parsed.checksum !== await checksum(audio)) throw new Error("Invalid metadata");
      chunk = parsed;
    }
    clip = {
      bytes: new Uint8Array(await audio.arrayBuffer()),
      mimeType: audio.type || "application/octet-stream",
      fileName: "recording",
      durationMs: Number.isFinite(declared) && declared > 0 ? Math.round(declared) : null,
    };
  } catch {
    return fail(400, { code: "bad_request", port: null, message: "The recording upload could not be read.", retryable: false });
  }

  try {
    // A request carrying no chunk metadata is the WEB-002 single-clip path. It
    // has no identity to key on, so it is not ledgered and is left exactly as it
    // was.
    const process = async (offset: number, quickNote = false) => {
      if (!transcriptionOnly) return processRecording(clip, providers, { sessionOffsetMs: offset, quickNote });
      validateClip(clip, providers.transcription);
      const transcript = await providers.transcription.transcribe(clip, { sessionOffsetMs: offset });
      if (!transcript.text.trim()) throw new ProviderError("transcription", "no_speech");
      return { transcript, disclosures: [providers.transcription.disclosure] };
    };
    if (!chunk) return json(200, { ...await process(0), ...(transcriptionOnly ? { processingMode: "transcription-only" } : {}) });
    const identity = chunk;
    // Built only from metadata already checked byte-for-byte against the upload
    // above, and only after the owner gate — an unauthenticated caller can
    // neither read this nor put anything in it.
    const { result, outcome } = await ledger.run({ sessionId: identity.sessionId, id: identity.id, checksum: identity.checksum, ...(transcriptionOnly ? { mode: "transcription-only" as const } : identity.quickNote ? { mode: "quick-note" as const } : {}) }, async () => ({
      ...await process(identity.startMs, !!identity.quickNote),
      chunk: identity,
    }));
    // A join and a replay both mean the same thing to the caller: this answer
    // cost no provider call. An answer that is silently identical is one nobody
    // can verify, so it is stated in the body and in a header.
    const replayed = outcome !== "claim";
    return json(200, { ...result, replayed, ...(transcriptionOnly ? { processingMode: "transcription-only" } : {}) }, { "x-echo-replayed": String(replayed) });
  } catch (error) {
    const { status, body } = describeFailure(error);
    // Safe fields only — never a response body, credential, audio or transcript.
    // Without this line a failure is only visible as a status code in the
    // browser, which is not enough to tell a rejected clip from a rejected key.
    const upstream = error instanceof ProviderError && error.status ? ` upstream=${error.status}` : "";
    console.warn(`[echo] recording failed: port=${body.port ?? "-"} code=${body.code} status=${status}${upstream}`);
    return fail(status, body);
  }
}
