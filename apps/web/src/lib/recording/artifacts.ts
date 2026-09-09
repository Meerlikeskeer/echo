/**
 * WEB-007. One validated set of session artifacts, bound to the exact transcript
 * revision it was generated from.
 *
 * REQ-005 asks for title, summary, notes, action items and research topics, and
 * `ARCHITECTURE.md` § *Provider boundaries* already states the LLM contract as
 * "Transcript + schema → validated artifacts". So this extends the existing
 * `notes` port; no new port and no stack decision.
 *
 * **Research topics are suggestions and nothing else.** REQ-005 separates
 * suggested research from opt-in external research, which is WEB-013. Nothing
 * here performs a lookup, and a topic must never be rendered as a finding.
 */

import type { SessionArtifacts, Transcript } from "../providers/types";

export type { SessionArtifacts };

/** Artifacts plus the provenance that makes them safe to store and replace. */
export interface ArtifactRecord {
  readonly sessionId: string;
  /** The revision of the transcript these were generated from. */
  readonly transcriptRevision: string;
  /** Assigned by Echo when a generation starts, monotonic within a session. */
  readonly generation: number;
  readonly artifacts: SessionArtifacts;
}

export const ARTIFACT_LIMITS = {
  title: 200,
  summary: 4_000,
  item: 500,
  items: 50,
} as const;

const LIST_FIELDS = ["keyPoints", "actionItems", "researchTopics"] as const;
const FIELDS = ["title", "summary", ...LIST_FIELDS] as const;
export type ArtifactField = (typeof FIELDS)[number];

/**
 * Why a field was rejected. A reason is a code, never the offending value: a
 * provider response is untrusted text, and `ProviderError` already refuses
 * free-form messages for exactly this reason. Nothing here may carry transcript
 * or model text into a log, an error or the page.
 */
export type ArtifactProblem =
  | { readonly field: ArtifactField | "$"; readonly reason: "missing" | "wrong-type" | "empty" | "too-long" | "too-many" | "duplicate" }
  | { readonly field: "$"; readonly reason: "unknown-field" };

export type ArtifactValidation =
  | { readonly ok: true; readonly artifacts: SessionArtifacts }
  | { readonly ok: false; readonly problems: readonly ArtifactProblem[] };

// Fold case and whitespace only, to catch a provider repeating one point twice
// with different spacing. Deliberately weaker than semantic comparison: two
// genuinely different action items must survive.
const fold = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Rejects anything that is not exactly the agreed schema, **including unknown
 * fields.** Strictness there is not pedantry: `ARCHITECTURE.md` requires that no
 * vendor response shape reach a domain type, and a silently tolerated extra key
 * is precisely how one gets in.
 */
export function validateArtifacts(value: unknown): ArtifactValidation {
  const problems: ArtifactProblem[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, problems: [{ field: "$", reason: "wrong-type" }] };
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!(FIELDS as readonly string[]).includes(key)) problems.push({ field: "$", reason: "unknown-field" });
  }

  const text = (field: "title" | "summary", limit: number): string => {
    const candidate = raw[field];
    if (candidate === undefined || candidate === null) { problems.push({ field, reason: "missing" }); return ""; }
    if (typeof candidate !== "string") { problems.push({ field, reason: "wrong-type" }); return ""; }
    const trimmed = candidate.trim();
    if (!trimmed) { problems.push({ field, reason: "empty" }); return ""; }
    if (trimmed.length > limit) { problems.push({ field, reason: "too-long" }); return ""; }
    return trimmed;
  };

  const list = (field: (typeof LIST_FIELDS)[number]): string[] => {
    const candidate = raw[field];
    if (candidate === undefined || candidate === null) { problems.push({ field, reason: "missing" }); return []; }
    if (!Array.isArray(candidate)) { problems.push({ field, reason: "wrong-type" }); return []; }
    if (candidate.length > ARTIFACT_LIMITS.items) { problems.push({ field, reason: "too-many" }); return []; }
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const item of candidate) {
      if (typeof item !== "string") { problems.push({ field, reason: "wrong-type" }); continue; }
      const trimmed = item.trim();
      if (!trimmed) { problems.push({ field, reason: "empty" }); continue; }
      if (trimmed.length > ARTIFACT_LIMITS.item) { problems.push({ field, reason: "too-long" }); continue; }
      // A repeated point is a malformed answer, not a stylistic choice: it
      // would render twice and inflate a count the owner reads as coverage.
      if (seen.has(fold(trimmed))) { problems.push({ field, reason: "duplicate" }); continue; }
      seen.add(fold(trimmed));
      kept.push(trimmed);
    }
    return kept;
  };

  const artifacts: SessionArtifacts = {
    title: text("title", ARTIFACT_LIMITS.title),
    summary: text("summary", ARTIFACT_LIMITS.summary),
    keyPoints: list("keyPoints"),
    actionItems: list("actionItems"),
    researchTopics: list("researchTopics"),
  };
  return problems.length ? { ok: false, problems } : { ok: true, artifacts };
}

/**
 * Everything a revision is computed from, and nothing else.
 *
 * Deliberately narrower than `StitchedTranscript`: the guard below cannot check
 * `sources` or a segment's `sourceIndexes`, so a guard returning
 * `value is StitchedTranscript` would assert fields it never looked at. A
 * `StitchedTranscript` is assignable to this, so WEB-006's output still flows
 * straight in.
 */
export interface RevisionInput {
  readonly sessionId: string;
  readonly text: string;
  readonly status: "partial" | "final";
  readonly segments: readonly { readonly text: string; readonly startMs: number; readonly endMs: number }[];
  readonly gaps: readonly { readonly reason: string; readonly sequence: number | null }[];
}

/** Bounds on a request body, so a malformed or hostile one is refused before a
 *  credential is used. The transcript cap matches the notes port's own. */
export const STITCHED_LIMITS = { text: 24_000, segments: 2_000, gaps: 500, segmentText: 8_000 } as const;

const GAP_REASONS: readonly string[] = ["capture-unconfirmed", "missing-chunk", "missing-transcript", "invalid-input"];

/**
 * WEB-007. The artifact endpoint's input check. It validates a WEB-006 type but
 * lives here because it is this boundary's guard, and `stitching.ts` is the
 * module WEB-006 froze acceptance against.
 *
 * The endpoint recomputes the revision from exactly this value rather than
 * trusting a revision the caller supplies. That is not about an untrusted user —
 * Echo has one owner — but about a mislabelled revision silently defeating the
 * equality rule: artifacts bound to a revision their transcript never had would
 * pass `acceptArtifacts` against the wrong transcript.
 */
export function isRevisionInput(value: unknown): value is RevisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(row.sessionId)) return false;
  if (row.status !== "partial" && row.status !== "final") return false;
  if (typeof row.text !== "string" || row.text.length > STITCHED_LIMITS.text) return false;
  if (!Array.isArray(row.segments) || row.segments.length > STITCHED_LIMITS.segments) return false;
  if (!Array.isArray(row.gaps) || row.gaps.length > STITCHED_LIMITS.gaps) return false;
  for (const segment of row.segments) {
    if (!segment || typeof segment !== "object") return false;
    const item = segment as Record<string, unknown>;
    if (typeof item.text !== "string" || item.text.length > STITCHED_LIMITS.segmentText) return false;
    if (!Number.isFinite(item.startMs) || !Number.isFinite(item.endMs)) return false;
    if ((item.endMs as number) < (item.startMs as number)) return false;
  }
  for (const gap of row.gaps) {
    if (!gap || typeof gap !== "object") return false;
    const item = gap as Record<string, unknown>;
    if (typeof item.reason !== "string" || !GAP_REASONS.includes(item.reason)) return false;
    if (!(item.sequence === null || Number.isSafeInteger(item.sequence))) return false;
  }
  return true;
}

/**
 * The exact transcript a generator is given. Built from the stitched segments
 * rather than the joined text so the generator sees the same timings the page
 * shows, and so the revision below covers them.
 */
export function transcriptForArtifacts(stitched: RevisionInput): Transcript {
  const segments = stitched.segments.map((segment) => ({ text: segment.text, startMs: segment.startMs, endMs: segment.endMs }));
  const durationMs = segments.length ? Math.max(...segments.map((segment) => segment.endMs)) : 0;
  return { text: stitched.text, segments, language: null, durationMs };
}

/**
 * Length-prefixed, so the encoding is unambiguous on its own terms.
 *
 * **Being precise about what this buys, because the obvious claim is wrong.** A
 * plain `:` delimiter is *already* collision-free here, and a test asserting
 * otherwise passes either way — every record contributes a fixed number of
 * fields and both counts are encoded, so moving a colon from inside a segment's
 * text to a field boundary changes the field count and therefore the bytes. The
 * naive scheme is safe **because of the surrounding structure**, not on its own.
 *
 * That is exactly why it is not used. The next field added here — anything of
 * variable arity, a speaker label, a per-segment source list — removes the
 * property the delimiter was silently relying on, with no test failing to say
 * so. Length prefixes are unambiguous without depending on anything around
 * them, which is the version that survives the next edit.
 */
function revisionInput(stitched: RevisionInput): string {
  const field = (text: string) => `${text.length}:${text}`;
  const parts = [
    field(stitched.sessionId),
    // Partial and final are different transcripts even when the text matches:
    // one is still growing. Artifacts must not carry across that boundary.
    field(stitched.status),
    field(String(stitched.segments.length)),
  ];
  for (const segment of stitched.segments) {
    parts.push(field(segment.text), field(String(segment.startMs)), field(String(segment.endMs)));
  }
  // A gap changes what the transcript means without necessarily changing a
  // character of its text, so it belongs in the identity too.
  parts.push(field(String(stitched.gaps.length)));
  for (const gap of stitched.gaps) parts.push(field(gap.reason), field(String(gap.sequence)));
  return parts.join("");
}

/**
 * A content hash of everything the generator saw. SHA-256 through the same
 * `crypto.subtle` the chunk checksums already use, so this needs a secure
 * context exactly as WEB-004 does — which ENG-008 guards before capture starts.
 */
export async function transcriptRevision(stitched: RevisionInput): Promise<string> {
  const bytes = new TextEncoder().encode(revisionInput(stitched));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * What the artifact endpoint answered, checked before it is believed.
 *
 * It is Echo's own endpoint, and the shape is still validated: a truncated read,
 * an error page or a proxy's interception all arrive as "a response", and a
 * malformed answer is refused wherever it appears. Extracted from the hook so
 * this is covered by a test rather than only by review — it is where a wrong
 * revision would enter the acceptance rule.
 */
export function readArtifactResponse(body: unknown): { readonly ok: true; readonly revision: string; readonly artifacts: SessionArtifacts } | { readonly ok: false } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const envelope = body as Record<string, unknown>;
  // A revision Echo did not compute is not a revision. Requiring the exact
  // shape it produces stops a truncated or invented value reaching
  // acceptArtifacts, where it would be compared as if it meant something.
  if (typeof envelope.transcriptRevision !== "string" || !/^[a-f0-9]{64}$/.test(envelope.transcriptRevision)) return { ok: false };
  const validated = validateArtifacts(envelope.artifacts);
  if (!validated.ok) return { ok: false };
  return { ok: true, revision: envelope.transcriptRevision, artifacts: validated.artifacts };
}

export type ArtifactDecision =
  | { readonly accepted: true; readonly record: ArtifactRecord }
  | { readonly accepted: false; readonly reason: "stale-transcript" | "superseded-generation" | "invalid-generation" };

/**
 * **The stale-overwrite rule, and why it compares rather than orders.**
 *
 * A revision is a content hash, and hashes do not order — there is no "newer"
 * to pick between two of them. So artifacts are accepted only when their
 * revision *equals* the transcript's revision right now. A generation that
 * started from an older transcript does not match the transcript on screen and
 * is discarded without ever being compared, which makes a stale overwrite
 * impossible by construction instead of by a comparison someone can get wrong.
 *
 * That rule cannot separate two generations racing for the *same* revision — a
 * retry overtaking the attempt it replaced — because their revisions are equal
 * by definition. The monotonic `generation`, assigned by Echo when a generation
 * starts, is the second rule and does only that. It is deliberately not
 * consulted across revisions: artifacts matching the current transcript are
 * always preferred, whatever generation the stale ones carried.
 */
export function acceptArtifacts(
  current: ArtifactRecord | null,
  incoming: ArtifactRecord,
  currentRevision: string,
): ArtifactDecision {
  if (!Number.isSafeInteger(incoming.generation) || incoming.generation < 0) {
    return { accepted: false, reason: "invalid-generation" };
  }
  if (incoming.transcriptRevision !== currentRevision) return { accepted: false, reason: "stale-transcript" };
  if (current && current.transcriptRevision === incoming.transcriptRevision && incoming.generation <= current.generation) {
    return { accepted: false, reason: "superseded-generation" };
  }
  return { accepted: true, record: incoming };
}
