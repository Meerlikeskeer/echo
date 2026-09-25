import { readProviderConfig, type Environment, type PortSettings } from "./config";
import { createFixtureNotesProvider, createFixtureTranscriptionProvider } from "./fixture";
import { createOpenAiCompatibleNotesProvider, createOpenAiCompatibleTranscriptionProvider } from "./openai-compatible";
import type { NotesProvider, TranscriptionProvider } from "./types";

export type ProviderSetup =
  | { readonly ok: true; readonly transcription: TranscriptionProvider; readonly notes: NotesProvider }
  | { readonly ok: false; readonly problems: readonly string[] };

function openAiSettings(settings: PortSettings) {
  // readProviderConfig guarantees these for the openai-compatible adapter.
  return { baseUrl: settings.baseUrl ?? "", apiKey: settings.apiKey ?? "", model: settings.model };
}

/** Pure so it can be tested; `registry.ts` evaluates it once at server startup. */
export function buildProviders(env: Environment): ProviderSetup {
  const result = readProviderConfig(env);
  if (!result.ok) return { ok: false, problems: result.problems };
  const { transcription, notes } = result.config;
  return {
    ok: true,
    transcription: transcription.adapter === "fixture"
      ? createFixtureTranscriptionProvider({ model: transcription.model })
      : createOpenAiCompatibleTranscriptionProvider(openAiSettings(transcription)),
    notes: notes.adapter === "fixture"
      ? createFixtureNotesProvider({ model: notes.model })
      : createOpenAiCompatibleNotesProvider(openAiSettings(notes)),
  };
}
