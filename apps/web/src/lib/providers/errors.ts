import type { ProviderPort } from "./types";

export type ProviderErrorCode =
  | "unconfigured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "invalid_input"
  | "clip_too_large"
  | "no_speech";

const RETRYABLE: ReadonlySet<ProviderErrorCode> = new Set<ProviderErrorCode>(["rate_limited", "timeout", "unavailable"]);

// Fixed, vendor-agnostic text. A provider response body, API key, audio payload
// or transcript must never reach an error message, so the constructor accepts
// no free-form string at all — leaking one is a type error, not a review catch.
const MESSAGES: Readonly<Record<ProviderErrorCode, string>> = {
  unconfigured: "This provider is not configured.",
  unauthorized: "The provider rejected Echo's credentials.",
  rate_limited: "The provider is rate limiting requests.",
  timeout: "The provider did not respond in time.",
  unavailable: "The provider is unavailable.",
  invalid_response: "The provider returned a response Echo could not use.",
  invalid_input: "The recording was not in a form the provider accepts.",
  clip_too_large: "The recording is too large to process.",
  no_speech: "No speech was detected in the recording.",
};

export class ProviderError extends Error {
  readonly port: ProviderPort;
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  /** Upstream HTTP status when there was one. A status is not sensitive. */
  readonly status: number | null;

  constructor(port: ProviderPort, code: ProviderErrorCode, status: number | null = null) {
    super(MESSAGES[code]);
    this.name = "ProviderError";
    this.port = port;
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.status = status;
  }
}

export function isProviderError(value: unknown): value is ProviderError {
  return value instanceof ProviderError;
}

/** Maps an upstream HTTP status onto a code. Used by every HTTP adapter. */
export function codeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status === 413) return "clip_too_large";
  if (status === 400 || status === 415 || status === 422) return "invalid_input";
  return "unavailable";
}
