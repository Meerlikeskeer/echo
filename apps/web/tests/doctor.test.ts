import assert from "node:assert/strict";
import { test } from "node:test";
import { doctor } from "../src/lib/providers/doctor";

const fixture = { TRANSCRIPTION_PROVIDER: "fixture", TRANSCRIPTION_MODEL: "test", LLM_PROVIDER: "fixture", LLM_MODEL: "test" };
const remote = { ...fixture, TRANSCRIPTION_PROVIDER: "openai-compatible", TRANSCRIPTION_BASE_URL: "https://example.invalid/v1", TRANSCRIPTION_API_KEY: "synthetic-secret" };
test("doctor fixtures never fetch", async () => {
  assert.ok((await doctor(fixture, async () => { throw new Error("must not fetch"); })).every((r) => r.ok));
});
test("doctor probes once and does not disclose rejected credentials or response body", async () => {
  let calls = 0;
  const results = await doctor(remote, async (url, options) => {
    calls++;
    assert.equal(url, "https://example.invalid/v1/models");
    assert.equal(options?.redirect, "error");
    return new Response("synthetic-secret", { status: 401 });
  });
  assert.equal(calls, 1);
  assert.equal(results[0].ok, false);
  assert.match(results[0].detail, /TRANSCRIPTION_API_KEY/);
  assert.doesNotMatch(JSON.stringify(results), /synthetic-secret/);
  assert.equal(results[1].ok, true);
});
test("doctor isolates malformed configuration and redacts thrown errors", async () => {
  const results = await doctor({ ...remote, LLM_MODEL: "" }, async () => { throw new Error("synthetic-secret"); });
  assert.match(results[0].detail, /TRANSCRIPTION_BASE_URL/);
  assert.match(results[1].detail, /LLM_MODEL/);
  assert.doesNotMatch(JSON.stringify(results), /synthetic-secret/);
});
test("doctor reports HTTP success and non-auth failure without reading bodies", async () => {
  assert.equal((await doctor(remote, async () => new Response(null, { status: 200 })))[0].ok, true);
  assert.match((await doctor(remote, async () => new Response(null, { status: 429 })))[0].detail, /HTTP 429/);
});
