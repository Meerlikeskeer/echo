import { ProviderError, type ProviderErrorCode } from "./errors";
import { ACCEPTED_MIME_TYPES } from "./openai-compatible";
import type {
  AudioClip, GeneratedNotes, NotesCapabilities, NotesProvider, ProviderDisclosure, SessionArtifacts,
  ProviderPort, TranscribeOptions, Transcript, TranscriptionCapabilities, TranscriptionProvider,
} from "./types";

// Deterministic canned output. This adapter performs no I/O, so the test suite
// can exercise the whole slice without real microphone audio or a network — the
// WEB-002 acceptance criteria forbid tests that need either.

export const FIXTURE_TRANSCRIPT_TEXT =
  "This is a fixture recording. Echo captured about forty seconds of audio. " +
  "The next step is to review the generated notes and confirm the action items.";

const FIXTURE_SEGMENTS: readonly { startMs: number; endMs: number; text: string }[] = [
  { startMs: 0, endMs: 4_000, text: "This is a fixture recording." },
  { startMs: 4_000, endMs: 9_500, text: "Echo captured about forty seconds of audio." },
  { startMs: 9_500, endMs: 16_000, text: "The next step is to review the generated notes and confirm the action items." },
];

export interface FixtureOptions {
  /** Forces a failure so provider-failure paths are covered without a network. */
  readonly failWith?: ProviderErrorCode;
  readonly model?: string;
  /** Overrides the canned transcript; used to exercise rendering of hostile text. */
  readonly text?: string;
}

function disclosureFor(port: ProviderPort, model: string, sends: readonly ("audio" | "transcript")[]): ProviderDisclosure {
  return {
    port,
    adapter: "fixture",
    model,
    processor: "local",
    endpointHost: null,
    sends,
    // Nothing leaves the process, so this is the one posture Echo can assert.
    retention: "no-transfer",
  };
}

function failIfRequested(port: ProviderPort, options: FixtureOptions): void {
  if (options.failWith) throw new ProviderError(port, options.failWith);
}

export function createFixtureTranscriptionProvider(options: FixtureOptions = {}): TranscriptionProvider {
  const model = options.model ?? "fixture-transcribe";
  const capabilities: TranscriptionCapabilities = {
    segmentTimestamps: true,
    diarization: false,
    maxClipBytes: 4_000_000,
    acceptedMimeTypes: ACCEPTED_MIME_TYPES,
  };
  return {
    disclosure: disclosureFor("transcription", model, ["audio"]),
    capabilities,
    async transcribe(clip: AudioClip, transcribeOptions?: TranscribeOptions): Promise<Transcript> {
      failIfRequested("transcription", options);
      const offsetMs = Math.max(0, Math.round(transcribeOptions?.sessionOffsetMs ?? 0));
      const text = options.text ?? FIXTURE_TRANSCRIPT_TEXT;
      const segments = options.text
        ? [{ startMs: offsetMs, endMs: offsetMs + 16_000, text: options.text }]
        : FIXTURE_SEGMENTS.map((segment) => ({ ...segment, startMs: segment.startMs + offsetMs, endMs: segment.endMs + offsetMs }));
      return { text, segments, language: "en", durationMs: clip.durationMs ?? 16_000 };
    },
  };
}

export function createFixtureNotesProvider(options: FixtureOptions = {}): NotesProvider {
  const model = options.model ?? "fixture-notes";
  const capabilities: NotesCapabilities = { structuredOutput: true, maxTranscriptChars: 24_000 };
  return {
    disclosure: disclosureFor("notes", model, ["transcript"]),
    capabilities,
    async generateNotes(transcript: Transcript): Promise<GeneratedNotes> {
      failIfRequested("notes", options);
      return {
        title: "Fixture recording",
        summary: `Fixture notes for a transcript of ${transcript.text.length} characters.`,
        keyPoints: ["Fixture key point one.", "Fixture key point two."],
        actionItems: ["Review the generated notes."],
      };
    },
    async classifyQuickNote() {
      failIfRequested("notes", options);
      return { items: [{ kind: "task" as const, text: "Review the generated notes.", dateText: null }] };
    },
    // WEB-007. Deterministic, and deliberately distinguishable from the
    // per-chunk notes above: a test asserting the session answer must not pass
    // when the chunk answer is rendered by mistake.
    async generateArtifacts(transcript: Transcript): Promise<SessionArtifacts> {
      failIfRequested("notes", options);
      return {
        title: "Fixture session",
        summary: `Fixture session artifacts for a transcript of ${transcript.text.length} characters.`,
        keyPoints: ["Fixture session point one.", "Fixture session point two."],
        actionItems: ["Confirm the session action items."],
        // Suggestions only. Nothing was looked up; WEB-013 owns opt-in research.
        researchTopics: ["Fixture research topic."],
      };
    },
  };
}
