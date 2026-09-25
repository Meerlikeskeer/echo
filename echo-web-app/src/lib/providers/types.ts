// Domain types for Echo's provider ports (ADR-009).
//
// Nothing in this file may mirror a vendor response shape. Adapters translate
// their wire format into these types and never leak `verbose_json`, `choices`,
// or any other vendor structure into domain code or a function signature.

import type { QuickNote } from "../recording/quick-note";

export type ProviderPort = "transcription" | "notes";
export type AdapterId = "openai-compatible" | "fixture";

/** Where the work physically happens. Derived from the configured endpoint. */
export type ProcessorLocation = "local" | "external";

/** ADR-009: a provider reports retention as unknown until an operator confirms it. */
export type RetentionPosture = "no-transfer" | "vendor-default" | "unknown";

/**
 * Machine-readable disclosure. REQ-009's external-processor notice is rendered
 * from this data, not from prose that can drift out of date.
 * `endpointHost` is a host only — never a full URL, path, or credential.
 */
export interface ProviderDisclosure {
  readonly port: ProviderPort;
  readonly adapter: AdapterId;
  readonly model: string;
  readonly processor: ProcessorLocation;
  readonly endpointHost: string | null;
  readonly sends: readonly ("audio" | "transcript")[];
  readonly retention: RetentionPosture;
}

export interface TranscriptionCapabilities {
  readonly segmentTimestamps: boolean;
  /** Always false. Diarization is a separate session-scoped port (ADR-009). */
  readonly diarization: false;
  readonly maxClipBytes: number;
  readonly acceptedMimeTypes: readonly string[];
}

export interface NotesCapabilities {
  readonly structuredOutput: boolean;
  readonly maxTranscriptChars: number;
}

/** Timestamps are session time in milliseconds, normalized by the adapter. */
export interface TranscriptSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

export interface Transcript {
  readonly text: string;
  readonly segments: readonly TranscriptSegment[];
  readonly language: string | null;
  readonly durationMs: number | null;
}

export interface AudioClip {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly fileName: string;
  readonly durationMs: number | null;
}

export interface GeneratedNotes {
  readonly title: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
  readonly actionItems: readonly string[];
}

/**
 * WEB-007 / REQ-005. The whole-session answer, as opposed to `GeneratedNotes`,
 * which WEB-002 produces for one chunk. It lives here rather than beside the
 * validator because it is the shape of the port's output, and `ARCHITECTURE.md`
 * § *Provider boundaries* already defines the LLM contract as "Transcript +
 * schema → validated artifacts".
 *
 * `researchTopics` are **suggestions only**. REQ-005 separates suggested
 * research from opt-in external research (WEB-013): nothing has been looked up,
 * and a topic must never be rendered as a finding.
 */
/** One section of the note guide: a heading and the notes underneath it. */
export interface ArtifactSection {
  readonly heading: string;
  readonly notes: readonly string[];
}

/** A term as the speaker used it, defined the way they defined it. */
export interface ArtifactTerm {
  readonly term: string;
  readonly definition: string;
}

export interface SessionArtifacts {
  readonly title: string;
  /**
   * WEB-017. The course, subject or meeting this recording belongs to, when the
   * recording itself says so — a lecturer naming the module, a topic returned
   * to throughout, a syllabus reference. Null when it does not, which is the
   * honest answer and the one that keeps a guess out of the file name.
   */
  readonly course: string | null;
  readonly summary: string;
  /** The claims the session was actually about, not everything said. */
  readonly keyPoints: readonly string[];
  /** WEB-017. The note guide proper: the session's argument, in order. */
  readonly outline: readonly ArtifactSection[];
  /** WEB-017. Terminology, defined as used here rather than in general. */
  readonly terms: readonly ArtifactTerm[];
  /** WEB-017. Raised and left unresolved — by the speaker, or by a gap in the
   *  audio. Distinct from researchTopics, which are subjects to read up on. */
  readonly openQuestions: readonly string[];
  readonly actionItems: readonly string[];
  readonly researchTopics: readonly string[];
}

export interface TranscribeOptions {
  /**
   * Offset of this clip within its session. Adapters add it to every provider
   * timestamp so segments are always session time. WEB-002 records one clip and
   * passes 0; WEB-003 chunking will pass real offsets.
   */
  readonly sessionOffsetMs?: number;
  readonly signal?: AbortSignal;
}

export interface TranscriptionProvider {
  readonly disclosure: ProviderDisclosure;
  readonly capabilities: TranscriptionCapabilities;
  transcribe(clip: AudioClip, options?: TranscribeOptions): Promise<Transcript>;
}

/**
 * WEB-017. What the generator is told about the transcript besides its text.
 *
 * `gapMinutes` names the stretches the audio does not cover. The endpoint has
 * always known them — they are part of the stitched transcript and part of its
 * revision — and threw them away before generating, so notes for a session
 * missing four minutes read exactly like notes for a complete one. Being told
 * lets the generator say where the record is thin instead of writing over it.
 */
export interface ArtifactOptions {
  readonly signal?: AbortSignal;
  readonly gapMinutes?: readonly string[];
  /** Reported to the generator as the transcript's own status, so a partial
   *  session is summarised as one rather than as a finished lecture. */
  readonly transcriptStatus?: "partial" | "final";
}

export interface NotesProvider {
  classifyQuickNote(transcript: Transcript, options?: { readonly signal?: AbortSignal }): Promise<QuickNote>;
  readonly disclosure: ProviderDisclosure;
  readonly capabilities: NotesCapabilities;
  generateNotes(transcript: Transcript, options?: { readonly signal?: AbortSignal }): Promise<GeneratedNotes>;
  /**
   * WEB-007. The session-level answer, from the stitched transcript. Separate
   * from `generateNotes` rather than replacing it: per-chunk notes are produced
   * during capture, when no session transcript exists yet.
   */
  generateArtifacts(transcript: Transcript, options?: ArtifactOptions): Promise<SessionArtifacts>;
}
