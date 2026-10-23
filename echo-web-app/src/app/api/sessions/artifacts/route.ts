/**
 * WEB-007. `POST /api/sessions/artifacts` — the stitched session transcript in,
 * one validated artifact set out.
 *
 * It exists as a server route for the same reason `POST /api/recordings` does:
 * provider credentials are server-side only (REQ-009), so the browser cannot
 * call an LLM itself.
 *
 * **It computes the revision rather than accepting one.** The caller sends the
 * transcript; the revision comes from that transcript, here. Echo has one owner,
 * so this is not about an untrusted caller — it is that a mislabelled revision
 * defeats the whole staleness rule silently. Artifacts bound to a revision their
 * transcript never had would match the wrong transcript in `acceptArtifacts` and
 * overwrite newer ones, which is the exact defect WEB-007 exists to prevent.
 *
 * It is deliberately stateless and assigns no generation. The browser owns the
 * generation counter and applies `acceptArtifacts`, because the browser is where
 * the current transcript lives — there is no server-side session store (ADR-016).
 */

import { requireProcessingAccess } from "../../../../lib/owner-access";
import { providersFor } from "../../../../lib/auth/credentials";
import { describeFailure, type RecordingErrorBody } from "../../../../lib/recording/http";
import { ProviderError } from "../../../../lib/providers/errors";
import { describeGaps, isRevisionInput, transcriptForArtifacts, transcriptRevision } from "../../../../lib/recording/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The artifact provider has a shorter deadline so a readable timeout response
 * can be returned before this route allowance expires. */
export const maxDuration = 300;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });

const fail = (status: number, body: RecordingErrorBody) => json(status, { error: body });

export async function POST(request: Request): Promise<Response> {
  // Proxy gates every route; this endpoint checks again at its own boundary so
  // the guard does not depend on middleware remaining in place.
  let principal;
  try {
    principal = await requireProcessingAccess();
  } catch {
    return fail(401, { code: "unauthorized_owner", port: null, message: "Private access required.", retryable: false });
  }

  const providerSetup = await providersFor(principal);
  if (!providerSetup.ok) {
    return json(503, {
      error: { code: "provider_unconfigured", port: null, message: "Recording providers are not configured.", retryable: false } satisfies RecordingErrorBody,
      // Variable names only, never values, and only after owner authorization.
      problems: providerSetup.problems,
    });
  }
  const providers = providerSetup;

  let stitched: unknown;
  try {
    stitched = await request.json();
  } catch {
    return fail(400, { code: "bad_request", port: null, message: "The request body could not be read.", retryable: false });
  }
  // Bounds and shape are checked before a credential is used or a byte is sent.
  if (!isRevisionInput(stitched)) {
    return fail(400, { code: "bad_request", port: null, message: "The session transcript could not be read.", retryable: false });
  }
  // Nothing to summarize is not a provider failure, and asking anyway would
  // spend a call to be told so.
  if (!stitched.text.trim()) {
    return fail(422, { code: "no_speech", port: "notes", message: "There is no transcript text to summarize yet.", retryable: false });
  }

  try {
    const revision = await transcriptRevision(stitched);
    const artifacts = await providers.notes.generateArtifacts(transcriptForArtifacts(stitched), {
      // The gaps were always in this request; until WEB-017 they were used only
      // to compute the revision and then dropped, so notes for a session with
      // four minutes missing read exactly like notes for a complete one.
      gapMinutes: describeGaps(stitched),
      transcriptStatus: stitched.status,
    });
    return json(200, {
      sessionId: stitched.sessionId,
      transcriptRevision: revision,
      // The transcript's own status travels with the artifacts, so a caller can
      // say "from a partial transcript" without recomputing it.
      transcriptStatus: stitched.status,
      artifacts,
      disclosures: [providers.notes.disclosure],
    });
  } catch (error) {
    const { status, body } = describeFailure(error);
    // Safe fields only — never a response body, credential, audio or transcript.
    const upstream = error instanceof ProviderError && error.status ? ` upstream=${error.status}` : "";
    console.warn(`[echo] artifacts failed: port=${body.port ?? "-"} code=${body.code} status=${status}${upstream}`);
    return fail(status, body);
  }
}
