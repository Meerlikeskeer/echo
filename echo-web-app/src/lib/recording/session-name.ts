const counterKey = "echo-session-number-v1";
export function reserveSessionNumber(storage: Pick<Storage, "getItem" | "setItem">): number {
  const previous = Number(storage.getItem(counterKey) ?? "0");
  if (!Number.isSafeInteger(previous) || previous < 0 || previous >= 0xffffffff) throw new Error("Session numbering could not be read.");
  const next = previous + 1;
  storage.setItem(counterKey, String(next));
  return next;
}
export function sessionName(id: string, legacyNumber?: number): string {
  const match = /^session-(\d{13}|undated)-(\d+)-[a-zA-Z0-9-]+$/.exec(id);
  const number = match ? Number(match[2]) : legacyNumber;
  const suffix = number && Number.isSafeInteger(number) ? `Session ${number}` : "Legacy session";
  const timestamp = match && match[1] !== "undated" ? Number(match[1]) : null;
  if (timestamp === null || timestamp < 1_577_836_800_000 || timestamp > 4_102_444_800_000) return `Date unavailable · ${suffix}`;
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${suffix}`;
}
