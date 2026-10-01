import { ProviderError } from "../providers/errors";
import { validateQuickNote, type QuickNote } from "./quick-note";
import type { AudioClip, GeneratedNotes, NotesProvider, ProviderDisclosure, Transcript, TranscriptionProvider } from "../providers/types";

export interface RecordingProviders {
  readonly transcription: TranscriptionProvider;
  readonly notes: NotesProvider;
}

export interface RecordingResult {
  readonly quickNote?: QuickNote;
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
  options?: { readonly sessionOffsetMs?: number; readonly signal?: AbortSignal; readonly quickNote?: boolean },
): Promise<RecordingResult> {
  validateClip(clip, providers.transcription);

  const transcript = await providers.transcription.transcribe(clip, {
    sessionOffsetMs: options?.sessionOffsetMs ?? 0,
    signal: options?.signal,
  });
  if (!transcript.text.trim()) throw new ProviderError("transcription", "no_speech");

  if (options?.quickNote) {
    const quickNote = validateQuickNote(await providers.notes.classifyQuickNote(transcript, { signal: options.signal }));
    if (!quickNote) throw new ProviderError("notes", "invalid_response");
    return { transcript, quickNote, notes: {
      title: "Quick Note", summary: quickNote.items.map(item => item.text).join(" "),
      keyPoints: quickNote.items.filter(item => item.kind === "note" || item.kind === "idea").map(item => item.text),
      actionItems: quickNote.items.filter(item => item.kind === "task" || item.kind === "reminder").map(item => item.text),
    }, disclosures: [providers.transcription.disclosure, providers.notes.disclosure] };
  }
  const notes = await providers.notes.generateNotes(transcript, { signal: options?.signal });
  return { transcript, notes, disclosures: [providers.transcription.disclosure, providers.notes.disclosure] };
}
