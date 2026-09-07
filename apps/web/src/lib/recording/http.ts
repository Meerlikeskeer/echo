import { ProviderError, type ProviderErrorCode } from "../providers/errors";
import type { ProviderPort } from "../providers/types";

export interface RecordingErrorBody {
  readonly code: ProviderErrorCode | "unauthorized_owner" | "provider_unconfigured" | "bad_request";
  readonly port: ProviderPort | null;
  readonly message: string;
  readonly retryable: boolean;
}

const STATUS: Readonly<Record<ProviderErrorCode, number>> = {
  unconfigured: 503,
  // The provider rejected Echo's key. That is a server-side configuration
  // fault, so it must not be reported to the client as a 401 challenge.
  unauthorized: 502,
  rate_limited: 429,
  timeout: 504,
  unavailable: 502,
  invalid_response: 502,
  invalid_input: 400,
  // Echo's own request was refused upstream, so this is not the caller's fault.
  rejected_by_provider: 502,
  clip_too_large: 413,
  no_speech: 422,
};

/** Translates a provider failure into a client-safe status and body. */
export function describeFailure(error: unknown): { status: number; body: RecordingErrorBody } {
  if (error instanceof ProviderError) {
    return {
      status: STATUS[error.code],
      body: { code: error.code, port: error.port, message: error.message, retryable: error.retryable },
    };
  }
  // Unknown failures are never described: the message could contain anything.
  return { status: 500, body: { code: "unavailable", port: null, message: "Echo could not process the recording.", retryable: true } };
}
