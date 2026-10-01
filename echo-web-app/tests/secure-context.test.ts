import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSecureContextProblem, type SecureContextEnvironment } from "../src/lib/recording/secure-context";

const environment = (overrides: Partial<SecureContextEnvironment>): SecureContextEnvironment => ({
  isSecureContext: true, hasSubtleCrypto: true, protocol: "https:", hostname: "localhost", ...overrides,
});

test("capture proceeds wherever Web Crypto is actually available", () => {
  // The capability is what matters, not the protocol. Plain HTTP on loopback is
  // a secure context and must not be refused — it is how `npm run dev` runs.
  assert.equal(describeSecureContextProblem(environment({})), null);
  assert.equal(describeSecureContextProblem(environment({ protocol: "http:", hostname: "localhost" })), null);
  assert.equal(describeSecureContextProblem(environment({ protocol: "http:", hostname: "127.0.0.1" })), null);
  assert.equal(describeSecureContextProblem(environment({ protocol: "https:", hostname: "echo.example" })), null);
});

test("plain HTTP from a non-loopback origin names the address and the fix", () => {
  // Without this the failure surfaced only as the generic "Capture incomplete".
  const problem = describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "http:", hostname: "192.168.1.50" }));
  assert.ok(problem, "a non-loopback HTTP origin must be refused before the microphone opens");
  assert.match(problem.detail, /192\.168\.1\.50/);
  assert.match(problem.detail, /HTTPS/);
  // ENG-009 withdrew `dev:lan`. The remedy is loopback or a properly served
  // origin — never a command that binds Echo to the network. See ADR-013.
  assert.match(problem.detail, /127\.0\.0\.1/);
  assert.equal(problem.retryable, false, "retrying the same address cannot succeed, so the UI must not invite it");
});

test("a browser without Web Crypto on a secure origin is reported as a browser problem", () => {
  const problem = describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "https:", hostname: "echo.example" }));
  assert.ok(problem);
  assert.match(problem.title, /browser/i);
  assert.doesNotMatch(problem.detail, /dev:lan|0\.0\.0\.0/, "advising a local dev script is wrong for a deployed origin, and ADR-013 removed the LAN one entirely");
});

test("loopback without Web Crypto is not blamed on the address", () => {
  // Loopback already is a secure context, so a missing crypto.subtle there is
  // the browser's doing. Telling someone to switch to HTTPS would be a dead end.
  for (const hostname of ["localhost", "127.0.0.1", "::1", "[::1]"]) {
    const problem = describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "http:", hostname }));
    assert.ok(problem);
    assert.match(problem.title, /browser/i, `${hostname} should be reported as a browser limitation`);
  }
});

test("no refusal message advertises binding Echo to the network", () => {
  // ADR-013: `dev:lan` was withdrawn and nothing may reintroduce it through a
  // user-facing string. This fails if the removed script is ever suggested again.
  const refusals = [
    describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "http:", hostname: "192.168.1.50" })),
    describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "https:", hostname: "echo.example" })),
    describeSecureContextProblem(environment({ hasSubtleCrypto: false, protocol: "http:", hostname: "localhost" })),
  ];
  for (const problem of refusals) {
    assert.ok(problem);
    assert.doesNotMatch(`${problem.title} ${problem.detail}`, /dev:lan|0\.0\.0\.0|--experimental-https/);
  }
});
