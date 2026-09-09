import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { InProcessJobLedger, jobKey, MAX_ENTRIES, RESULT_TTL_MS, type JobKey } from "../src/lib/recording/job-ledger";

const key: JobKey = { sessionId: "session", id: "chunk-0", checksum: "a".repeat(64) };

/** Counts provider work. The point of every test here is what this reaches. */
function counting(value = "transcript") {
  let calls = 0;
  return { calls: () => calls, work: async () => { calls++; return `${value}-${calls}`; } };
}

test("a lost response does not buy a second provider call for the same chunk", async () => {
  const ledger = new InProcessJobLedger<string>();
  const provider = counting();
  const first = await ledger.run(key, provider.work);
  // The client never saw this response — the tab suspended, the socket dropped
  // — so it retries the identical chunk, which is what durability requires.
  const second = await ledger.run(key, provider.work);
  assert.equal(provider.calls(), 1);
  assert.equal(first.outcome, "claim");
  assert.equal(second.outcome, "replay");
  assert.equal(second.result, first.result);
});

test("two overlapping requests for one chunk start one job", async () => {
  const ledger = new InProcessJobLedger<string>();
  let calls = 0;
  let release: (value: string) => void = () => {};
  const work = async () => { calls++; return new Promise<string>((resolve) => { release = resolve; }); };
  const both = Promise.all([ledger.run(key, work), ledger.run(key, work)]);
  await Promise.resolve();
  release("transcript");
  const [first, second] = await both;
  assert.equal(calls, 1);
  assert.deepEqual([first.outcome, second.outcome], ["claim", "join"]);
  assert.equal(second.result, first.result);
});

test("identity is the whole key: same chunk id with different bytes is never replayed", async () => {
  const ledger = new InProcessJobLedger<string>();
  const provider = counting();
  const first = await ledger.run(key, provider.work);
  // The route rejects a checksum that does not match the uploaded bytes before
  // it ever gets here; this asserts the ledger cannot be tricked into answering
  // across that boundary either.
  const other = await ledger.run({ ...key, checksum: "b".repeat(64) }, provider.work);
  assert.equal(provider.calls(), 2);
  assert.equal(other.outcome, "claim");
  assert.notEqual(other.result, first.result);
  assert.notEqual(jobKey(key), jobKey({ ...key, checksum: "b".repeat(64) }));
  for (const changed of [{ sessionId: "other" }, { id: "chunk-1" }]) {
    assert.equal((await ledger.run({ ...key, ...changed }, provider.work)).outcome, "claim");
  }
  assert.equal(provider.calls(), 4);
});

test("a failed job is never cached, so the next attempt is free to retry", async () => {
  const ledger = new InProcessJobLedger<string>();
  let calls = 0;
  await assert.rejects(ledger.run(key, async () => { calls++; throw new Error("provider refused"); }));
  const retry = await ledger.run(key, async () => { calls++; return "transcript"; });
  assert.equal(calls, 2);
  assert.equal(retry.outcome, "claim");
  assert.equal(retry.result, "transcript");
  // A joiner inherits the failure rather than a stale success.
  let fail: (error: Error) => void = () => {};
  const shared = { sessionId: "session", id: "chunk-9", checksum: "c".repeat(64) };
  // Handlers are attached before the rejection lands, or Node reports an
  // unhandled rejection for the joiner and fails the run for the wrong reason.
  const settled = Promise.allSettled([
    ledger.run(shared, () => new Promise<string>((_, reject) => { fail = reject; })),
    ledger.run(shared, async () => "must not start a second job"),
  ]);
  await Promise.resolve();
  fail(new Error("provider refused"));
  assert.deepEqual((await settled).map((outcome) => outcome.status), ["rejected", "rejected"]);
  assert.equal((await ledger.run(shared, async () => "retried")).result, "retried");
});

test("results expire, and expiry costs a provider call rather than a wrong answer", async () => {
  let clock = 1000;
  const ledger = new InProcessJobLedger<string>({ now: () => clock, ttlMs: RESULT_TTL_MS });
  const provider = counting();
  await ledger.run(key, provider.work);
  clock += RESULT_TTL_MS - 1;
  assert.equal((await ledger.run(key, provider.work)).outcome, "replay");
  clock += 1;
  // This is the case ADR-016 refuses to hide: the window closed, so the retry
  // is transcribed again. Not exactly-once, by construction.
  assert.equal((await ledger.run(key, provider.work)).outcome, "claim");
  assert.equal(provider.calls(), 2);
  assert.equal(ledger.size, 1);
});

test("the ledger is bounded, and pressure never drops a job that is still running", async () => {
  const ledger = new InProcessJobLedger<string>({ maxEntries: 3 });
  for (const id of ["a", "b", "c", "d", "e"]) await ledger.run({ ...key, id }, async () => id);
  assert.ok(ledger.size <= 3, `bounded at 3, held ${ledger.size}`);
  assert.equal((await ledger.run({ ...key, id: "e" }, async () => "again")).outcome, "replay");

  const held = new InProcessJobLedger<string>({ maxEntries: 1 });
  let release: (value: string) => void = () => {};
  const inFlight = held.run(key, () => new Promise<string>((resolve) => { release = resolve; }));
  await Promise.resolve();
  // Every slot is in flight, so the newcomer runs unrecorded rather than
  // evicting the job someone is currently waiting to join.
  assert.equal((await held.run({ ...key, id: "other" }, async () => "unrecorded")).outcome, "claim");
  release("transcript");
  assert.equal((await inFlight).result, "transcript");
  assert.equal((await held.run(key, async () => "must not run")).outcome, "replay");
});

test("the ledger writes nothing anywhere: no log line, no file", async () => {
  const ledger = new InProcessJobLedger<string>();
  const restore = { ...console };
  const noise: string[] = [];
  for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
    console[method] = (...args: unknown[]) => { noise.push(`${method} ${args.join(" ")}`); };
  }
  try {
    // A transcript held in process memory for a few minutes is the whole privacy
    // cost of this ledger. A log line would make it permanent, and put it
    // somewhere the owner did not choose.
    await ledger.run(key, async () => "transcript");
    await ledger.run(key, async () => "must not run");
    await assert.rejects(ledger.run({ ...key, id: "chunk-1" }, async () => { throw new Error("provider refused"); }));
  } finally {
    Object.assign(console, restore);
  }
  assert.deepEqual(noise, []);
  const source = await readFile(new URL("../src/lib/recording/job-ledger.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.|writeFileSync|createWriteStream|localStorage|from "node:fs/);
});

test("the default bound is a bound, and the key is chunk identity in one order", () => {
  assert.ok(MAX_ENTRIES > 0 && Number.isSafeInteger(MAX_ENTRIES));
  assert.ok(RESULT_TTL_MS > 0);
  assert.equal(jobKey(key), `session/chunk-0/${"a".repeat(64)}`);
});
