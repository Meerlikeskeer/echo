"use client";
import { useWorkspaceIdentity } from "./workspace-identity";
import { reserveBrowserSessionNumber } from "../lib/recording/session-name";
import { useEffect, useState } from "react";
import { readPreference, savePreference, type LibraryPreference } from "../lib/recording/library";

export function useLibrary(ids: readonly string[]) {
  const {namespace,storage} = useWorkspaceIdentity();
  const [preferences, setPreferences] = useState<Record<string, LibraryPreference>>({});
  const [error, setError] = useState("");
  const key = JSON.stringify(ids);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next: Record<string, LibraryPreference> = {};
        for (const id of JSON.parse(key) as string[]) {
          let preference = readPreference(storage, id);
          if (!/^session-(\d{13}|undated)-\d+-/.test(id) && !preference.legacyNumber) {
            const number = await reserveBrowserSessionNumber(namespace, storage);
            // Another tab may have assigned this recording while we waited.
            preference = readPreference(storage, id);
            if (!preference.legacyNumber) preference = savePreference(storage, id, { legacyNumber: number });
          }
          next[id] = preference;
        }
        if (!cancelled) { setPreferences(next); setError(""); }
      } catch { if (!cancelled) setError("Recording names could not be loaded. Audio is unaffected. Check browser storage access."); }
    }
    void load();
    window.addEventListener("storage", load);
    return () => { cancelled = true; window.removeEventListener("storage", load); };
  }, [key, namespace, storage]);
  function save(id: string, patch: LibraryPreference): boolean {
    try {
      const value = savePreference(storage, id, patch);
      setPreferences(previous => ({ ...previous, [id]: value })); setError(""); return true;
    } catch { setError("That change could not be saved. Your audio is unaffected; check browser storage and try again."); return false; }
  }
  return { preferences, error, save };
}
