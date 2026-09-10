import { requireOwnerAccess } from "../../../lib/owner-access";
import { providerSetup } from "../../../lib/providers/registry";
import { processRecording, type RecordingResult } from "../../../lib/recording/pipeline";
import { describeFailure, type RecordingErrorBody } from "../../../lib/recording/http";
import { ProviderError } from "../../../lib/providers/errors";
import type { AudioClip } from "../../../lib/providers/types";
import { checksum, isAudioChunk, type AudioChunk } from "../../../lib/recording/session";
import { InProcessJobLedger, type JobLedger } from "../../../lib/recording/job-ledger";

import { normalizeMime } from "../../../lib/recording/media-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** WEB-017. A five-minute chunk is a longer transcription call than the
 *  one-minute clip this route was written for. Stated here rather than left to
 *  a platform default that a dashboard setting can quietly lower. */
export const maxDuration = 300;

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...extra },
  });

/** The response body a chunk upload produced, stored whole so a retry of the
 *  same chunk identity gets back the same answer rather than a second opinion. */
type ChunkResponse = RecordingResult & { readonly chunk: AudioChunk };

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
  try {
    const form = await request.formData();
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
    if (!chunk) return json(200, await processRecording(clip, providers, { sessionOffsetMs: 0 }));
    const identity = chunk;
    // Built only from metadata already checked byte-for-byte against the upload
    // above, and only after the owner gate — an unauthenticated caller can
    // neither read this nor put anything in it.
    const { result, outcome } = await ledger.run({ sessionId: identity.sessionId, id: identity.id, checksum: identity.checksum, ...(identity.quickNote ? { mode: "quick-note" as const } : {}) }, async () => ({
      ...await processRecording(clip, providers, { sessionOffsetMs: identity.startMs, quickNote: !!identity.quickNote }),
      chunk: identity,
    }));
    // A join and a replay both mean the same thing to the caller: this answer
    // cost no provider call. An answer that is silently identical is one nobody
    // can verify, so it is stated in the body and in a header.
    const replayed = outcome !== "claim";
    return json(200, { ...result, replayed }, { "x-echo-replayed": String(replayed) });
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
