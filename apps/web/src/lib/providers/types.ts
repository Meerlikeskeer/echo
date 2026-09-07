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
}
