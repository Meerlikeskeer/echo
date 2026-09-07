import { ProviderError } from "../providers/errors";
import type { AudioClip, GeneratedNotes, NotesProvider, ProviderDisclosure, Transcript, TranscriptionProvider } from "../providers/types";

export interface RecordingProviders {
  readonly transcription: TranscriptionProvider;
  readonly notes: NotesProvider;
}

export interface RecordingResult {
  readonly transcript: Transcript;
  readonly notes: GeneratedNotes;
  /** Drives the REQ-009 external-processor notice shown with the result. */
  readonly disclosures: readonly ProviderDisclosure[];
}

/** Rejects a clip before any credential is used or any byte leaves the server. */
export function validateClip(clip: AudioClip, provider: TranscriptionProvider): void {
  if (clip.bytes.byteLength === 0) throw new ProviderError("transcription", "invalid_input");
  if (clip.bytes.byteLength > provider.capabilities.maxClipBytes) throw new ProviderError("transcription", "clip_too_large");
  const baseType = clip.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!provider.capabilities.acceptedMimeTypes.includes(baseType)) throw new ProviderError("transcription", "invalid_input");
}

/**
 * The WEB-002 vertical slice: one clip in, transcript and notes out. Each step
 * raises a ProviderError carrying a code and a retryable flag, and never
 * carrying credentials, audio, or transcript text.
 */
export async function processRecording(
  clip: AudioClip,
  providers: RecordingProviders,
  options?: { readonly sessionOffsetMs?: number; readonly signal?: AbortSignal },
): Promise<RecordingResult> {
  validateClip(clip, providers.transcription);

  const transcript = await providers.transcription.transcribe(clip, {
    sessionOffsetMs: options?.sessionOffsetMs ?? 0,
    signal: options?.signal,
  });
  if (!transcript.text.trim()) throw new ProviderError("transcription", "no_speech");

  const notes = await providers.notes.generateNotes(transcript, { signal: options?.signal });
  return { transcript, notes, disclosures: [providers.transcription.disclosure, providers.notes.disclosure] };
}
