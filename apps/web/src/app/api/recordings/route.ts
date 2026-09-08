import { requireOwnerAccess } from "../../../lib/owner-access";
import { providerSetup } from "../../../lib/providers/registry";
import { processRecording } from "../../../lib/recording/pipeline";
import { describeFailure, type RecordingErrorBody } from "../../../lib/recording/http";
import { ProviderError } from "../../../lib/providers/errors";
import type { AudioClip } from "../../../lib/providers/types";
import { checksum, isAudioChunk, type AudioChunk } from "../../../lib/recording/session";

import { normalizeMime } from "../../../lib/recording/media-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });

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
    const result = await processRecording(clip, providerSetup, { sessionOffsetMs: chunk?.startMs ?? 0 });
    return json(200, { ...result, ...(chunk ? { chunk } : {}) });
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
