import type { AdapterId, ProviderPort } from "./types";

export interface PortSettings {
  readonly port: ProviderPort;
  readonly adapter: AdapterId;
  /** Null for adapters that make no request. */
  readonly baseUrl: string | null;
  readonly apiKey: string | null;
  readonly model: string;
}

export interface ProviderConfig {
  readonly transcription: PortSettings;
  readonly notes: PortSettings;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: ProviderConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

export type Environment = Readonly<Record<string, string | undefined>>;

const ADAPTERS: readonly AdapterId[] = ["openai-compatible", "fixture"];

const VARIABLES = {
  transcription: { adapter: "TRANSCRIPTION_PROVIDER", baseUrl: "TRANSCRIPTION_BASE_URL", apiKey: "TRANSCRIPTION_API_KEY", model: "TRANSCRIPTION_MODEL" },
  notes: { adapter: "LLM_PROVIDER", baseUrl: "LLM_BASE_URL", apiKey: "LLM_API_KEY", model: "LLM_MODEL" },
} as const satisfies Record<ProviderPort, Record<string, string>>;

const read = (env: Environment, name: string) => env[name]?.trim() ?? "";

// Problems name environment variables and never quote their values, so this
// output is safe to log at startup and to show the authenticated owner.
export function readPort(env: Environment, port: ProviderPort, problems: string[]): PortSettings | null {
  const names = VARIABLES[port];
  const adapter = read(env, names.adapter);
  if (!adapter) {
    problems.push(`${names.adapter} is not set. Expected one of: ${ADAPTERS.join(", ")}.`);
    return null;
  }
  if (!ADAPTERS.includes(adapter as AdapterId)) {
    problems.push(`${names.adapter} is not a known adapter. Expected one of: ${ADAPTERS.join(", ")}.`);
    return null;
  }
  const model = read(env, names.model);
  if (!model) problems.push(`${names.model} is not set.`);

  if (adapter === "fixture") {
    // Deterministic canned output; it makes no request and needs no credential.
    return model ? { port, adapter, baseUrl: null, apiKey: null, model } : null;
  }

  const baseUrl = read(env, names.baseUrl);
  const apiKey = read(env, names.apiKey);
  if (!baseUrl) problems.push(`${names.baseUrl} is not set. It is required by the ${adapter} adapter.`);
  else if (!isHttpUrl(baseUrl)) problems.push(`${names.baseUrl} is not a valid http(s) URL.`);
  if (!apiKey) problems.push(`${names.apiKey} is not set. It is required by the ${adapter} adapter.`);
  if (!model || !baseUrl || !isHttpUrl(baseUrl) || !apiKey) return null;
  return { port, adapter: adapter as AdapterId, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates provider configuration up front so a missing key fails closed at
 * startup, the way the WEB-001 access gate does, rather than at first recording.
 */
export function readProviderConfig(env: Environment): ConfigResult {
  const problems: string[] = [];
  const transcription = readPort(env, "transcription", problems);
  const notes = readPort(env, "notes", problems);
  if (!transcription || !notes || problems.length > 0) return { ok: false, problems };
  return { ok: true, config: { transcription, notes } };
}
