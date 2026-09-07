import type { ProviderPort } from "./types";

export type ProviderErrorCode =
  | "unconfigured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_response"
  | "invalid_input"
  | "rejected_by_provider"
  | "clip_too_large"
  | "no_speech";

const RETRYABLE: ReadonlySet<ProviderErrorCode> = new Set<ProviderErrorCode>(["rate_limited", "timeout", "unavailable"]);

// Fixed, vendor-agnostic text. A provider response body, API key, audio payload
// or transcript must never reach an error message, so the constructor accepts
// no free-form string at all — leaking one is a type error, not a review catch.
// Shown to the owner, so they are written in plain language and say what to do.
// `invalid_input` means Echo rejected the clip itself; `rejected_by_provider`
// means the clip left Echo and the service refused it. Keeping those apart is
// the difference between a one-minute fix and an afternoon of guessing.
const MESSAGES: Readonly<Record<ProviderErrorCode, string>> = {
  unconfigured: "Echo is missing settings it needs for this step.",
  unauthorized: "The API key was rejected. Check the key in apps/web/.env.local.",
  rate_limited: "The service is busy and asked Echo to slow down. Try again in a moment.",
  timeout: "The service took too long to answer.",
  unavailable: "Echo could not reach the service.",
  invalid_response: "The service sent back something Echo could not read.",
  invalid_input: "Echo cannot use this recording format.",
  rejected_by_provider: "The service rejected this recording.",
  clip_too_large: "This recording is too large to send.",
  no_speech: "Echo did not hear any speech in this recording.",
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
  // The clip was fine by Echo's rules but the service refused it anyway.
  if (status === 400 || status === 415 || status === 422) return "rejected_by_provider";
  return "unavailable";
}
