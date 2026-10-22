import { validateArtifacts, type ArtifactRecord } from "./artifacts";

/** Separate browser-local store: adding guide persistence never upgrades or
 * blocks the audio queue. Keys include the revision so a late answer cannot
 * overwrite a guide for a different transcript. No audio is stored or deleted. */
export class ArtifactStore {
  constructor(readonly name = "echo-session-guides-v1") {}
  private async access<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore("guides", { keyPath: ["sessionId", "transcriptRevision"] });
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error("Close other Echo tabs to open saved guides.")); };
      request.onsuccess = () => {
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      let result: T;
      try { tx = db.transaction("guides", mode, { durability: "strict" }); }
      catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Guide storage transaction failed")); };
      try { run(tx.objectStore("guides"), value => { result = value; }); }
      catch (error) { tx.abort(); reject(error); }
    });
  }
  async load(sessionId: string, revision: string): Promise<ArtifactRecord | null> {
    const value = await this.access<unknown>("readonly", (store, done) => {
      const request = store.get([sessionId, revision]);
      request.onsuccess = () => done(request.result);
    });
    if (value === undefined) return null;
    const record = validateStoredGuide(value);
    if (!record || record.sessionId !== sessionId || record.transcriptRevision !== revision) throw new Error("Saved guide could not be validated. Generate it again.");
    return record;
  }
  async deleteSession(sessionId: string): Promise<void> {
    await this.access<void>("readwrite", (store, done) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { done(); return; }
        if (cursor.value.sessionId === sessionId) cursor.delete();
        cursor.continue();
      };
    });
  }
  async save(record: ArtifactRecord): Promise<void> {
    const checked = validateStoredGuide(record);
    if (!checked) throw new Error("Invalid guide cannot be saved");
    await this.access<void>("readwrite", (store, done) => { store.put(checked); done(); });
  }
}

export function validateStoredGuide(value: unknown): ArtifactRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ArtifactRecord>;
  if (typeof row.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(row.sessionId) ||
      typeof row.transcriptRevision !== "string" || !/^[a-f0-9]{64}$/.test(row.transcriptRevision) ||
      !Number.isSafeInteger(row.generation) || row.generation! < 0) return null;
  const checked = validateArtifacts(row.artifacts);
  return checked.ok ? { sessionId: row.sessionId, transcriptRevision: row.transcriptRevision, generation: row.generation!, artifacts: checked.artifacts } : null;
}
