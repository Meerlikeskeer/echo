import { automaticGroup, groupName } from "./groups";
import { sessionName } from "./session-name";
import type { QueueEntry } from "./queue";
import type { PlayableChunk } from "./session";
import { isCompletion, sameMetadata, type Completion } from "./session-completion";

export type EchoKind = "quick-note" | "session";
export interface LibraryPreference { legacyNumber?: number; title?: string; generatedTitle?: string; kind?: EchoKind; group?: string | null }
export const QUICK_ECHO_MS = 60_000;
const prefix = "echo-library-v1/";

export function validatePreference(value: unknown): LibraryPreference {
  if (!value || typeof value !== "object") throw new Error("Saved recording preferences could not be read.");
  const row = value as LibraryPreference;
  if ((row.legacyNumber !== undefined && (!Number.isSafeInteger(row.legacyNumber) || row.legacyNumber < 1)) ||
    (row.title !== undefined && (typeof row.title !== "string" || !row.title.trim() || row.title.length > 100)) ||
    (row.generatedTitle !== undefined && (typeof row.generatedTitle !== "string" || !row.generatedTitle.trim() || row.generatedTitle.length > 100)) ||
    (row.kind !== undefined && row.kind !== "quick-note" && row.kind !== "session")) throw new Error("Saved recording preferences could not be read.");
  if (row.group !== undefined && row.group !== null) groupName(row.group);
  return { ...(row.group !== undefined ? { group: row.group === null ? null : groupName(row.group) } : {}), ...(row.legacyNumber ? { legacyNumber: row.legacyNumber } : {}), ...(row.title ? { title: row.title.trim() } : {}), ...(row.generatedTitle ? { generatedTitle: row.generatedTitle.trim() } : {}), ...(row.kind ? { kind: row.kind } : {}) };
}
export function readPreference(storage: Pick<Storage, "getItem">, id: string): LibraryPreference {
  const value = storage.getItem(prefix + id);
  return value === null ? {} : validatePreference(JSON.parse(value));
}
// One key per recording; read/merge before writing so editing one field preserves
// another tab's other field. No audio/queue metadata is ever rewritten.
export function savePreference(storage: Pick<Storage, "getItem" | "setItem">, id: string, patch: LibraryPreference): LibraryPreference {
  const value = validatePreference({ ...readPreference(storage, id), ...patch });
  storage.setItem(prefix + id, JSON.stringify(value));
  return value;
}
export function libraryRecording(id: string, chunks: readonly PlayableChunk[], entries: readonly QueueEntry[], completions: readonly Completion[], preference: LibraryPreference = {}) {
  const audio = chunks.filter(chunk => chunk.metadata.sessionId === id).sort((a,b) => a.metadata.sequence - b.metadata.sequence);
  const results = entries.filter(entry => entry.metadata.sessionId === id).sort((a,b) => a.metadata.sequence - b.metadata.sequence);
  const manifests = completions.filter(item => item?.sessionId === id);
  const manifest = manifests.length === 1 && isCompletion(manifests[0]) ? manifests[0] : null;
  const complete = !!manifest && manifest.chunks.length === audio.length && manifest.chunks.every((chunk, index) => sameMetadata(chunk, audio[index].metadata));
  const duration = Math.max(0, ...audio.map(chunk => chunk.metadata.endMs), ...(manifest?.chunks.map(chunk => chunk.endMs) ?? []));
  const automatic: EchoKind = complete && duration > 0 && duration <= QUICK_ECHO_MS ? "quick-note" : "session";
  const title = preference.title || sessionName(id, preference.legacyNumber);
  const inferredGroup = automaticGroup(results.map(entry => entry.result?.transcript.text ?? "").join(" "));
  return { id, audio, results, duration, complete, automatic, group: preference.group !== undefined ? preference.group : inferredGroup, groupAutomatic: preference.group === undefined, kind: preference.kind ?? automatic, title,
    pending: results.filter(entry => entry.state !== "processed").length,
    blocked: results.some(entry => entry.state === "blocked"),
    unsaved: audio.some(chunk => !results.some(entry => entry.metadata.id === chunk.metadata.id)),
  };
}

export function removePreference(storage: Pick<Storage, "removeItem">, id: string): void { storage.removeItem(prefix + id); }
