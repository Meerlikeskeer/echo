// Domain types for Echo's provider ports (ADR-009).
//
// Nothing in this file may mirror a vendor response shape. Adapters translate
// their wire format into these types and never leak `verbose_json`, `choices`,
// or any other vendor structure into domain code or a function signature.

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
export interface SessionArtifacts {
  readonly title: string;
  readonly summary: string;
  readonly keyPoints: readonly string[];
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

export interface NotesProvider {
  readonly disclosure: ProviderDisclosure;
  readonly capabilities: NotesCapabilities;
  generateNotes(transcript: Transcript, options?: { readonly signal?: AbortSignal }): Promise<GeneratedNotes>;
  /**
   * WEB-007. The session-level answer, from the stitched transcript. Separate
   * from `generateNotes` rather than replacing it: per-chunk notes are produced
   * during capture, when no session transcript exists yet.
   */
  generateArtifacts(transcript: Transcript, options?: { readonly signal?: AbortSignal }): Promise<SessionArtifacts>;
}
