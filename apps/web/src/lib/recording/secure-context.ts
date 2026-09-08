/**
 * ENG-008. Why capture cannot start, said precisely.
 *
 * `checksum()` in session.ts calls `crypto.subtle.digest`. Browsers expose
 * `crypto.subtle` only in a secure context: HTTPS, or `localhost`/`127.0.0.1`.
 * Reached over plain HTTP on any other host — the exact shape of testing from a
 * phone, and of the self-hosted LAN deployment ADR-010 requires — it is
 * `undefined`, checksumming throws, and the failure surfaces as the generic
 * "Capture incomplete" message with nothing pointing at the cause.
 *
 * This is deliberately a check the caller runs *before* opening a recorder,
 * rather than an error mapped afterwards. Once capture has started, the
 * microphone is live and any failure costs the user their recording; refusing
 * up front with an accurate reason costs them nothing.
 */

export interface SecureContextProblem {
  /** Short, plain, and safe to show a user. */
  readonly title: string;
  readonly detail: string;
  /** Retrying without changing anything cannot help, so the UI must not invite it. */
  readonly retryable: false;
}

/** Only what this module needs, so the check is testable without a browser. */
export interface SecureContextEnvironment {
  readonly isSecureContext?: boolean;
  readonly hasSubtleCrypto: boolean;
  readonly protocol: string;
  readonly hostname: string;
}

export function readEnvironment(): SecureContextEnvironment {
  return {
    isSecureContext: typeof isSecureContext === "boolean" ? isSecureContext : undefined,
    hasSubtleCrypto: typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined",
    protocol: location.protocol,
    hostname: location.hostname,
  };
}

/**
 * Returns null when capture may proceed. `hasSubtleCrypto` is authoritative:
 * it is the capability actually required, so a browser that disagrees with the
 * spec still gets the right answer.
 */
export function describeSecureContextProblem(environment: SecureContextEnvironment): SecureContextProblem | null {
  if (environment.hasSubtleCrypto) return null;

  const overHttp = environment.protocol === "http:";
  // A hostname or bare IP that is not loopback: the LAN case, and the one worth
  // naming, because the fix is a different address rather than a different browser.
  const remote = environment.hostname !== "localhost" && environment.hostname !== "127.0.0.1" && environment.hostname !== "[::1]" && environment.hostname !== "::1";

  if (overHttp && remote) {
    return {
      title: "This address is not secure enough to record",
      detail:
        `Echo is being served over plain HTTP from ${environment.hostname}. Browsers only allow the cryptography Echo uses to verify recordings over HTTPS, or on localhost. ` +
        "Open Echo over HTTPS — from the repository root, `npm run dev:lan` serves the development server with a certificate — or use it directly on the machine running it.",
      retryable: false,
    };
  }

  return {
    title: "This browser cannot verify recordings",
    detail:
      "Echo checks every recorded chunk with a cryptographic checksum, and this browser does not provide the Web Crypto API Echo needs. Try a current version of Chrome, Edge, Firefox or Safari, served over HTTPS.",
    retryable: false,
  };
}
