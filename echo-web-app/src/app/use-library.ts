"use client";
import { reserveSessionNumber } from "../lib/recording/session-name";
import { useEffect, useState } from "react";
import { readPreference, savePreference, type LibraryPreference } from "../lib/recording/library";

export function useLibrary(ids: readonly string[]) {
  const [preferences, setPreferences] = useState<Record<string, LibraryPreference>>({});
  const [error, setError] = useState("");
  const key = JSON.stringify(ids);
  useEffect(() => {
    let cancelled = false;
    function load() {
      try {
        const next = Object.fromEntries((JSON.parse(key) as string[]).map(id => {
          let preference = readPreference(localStorage, id);
          if (!/^session-(\d{13}|undated)-\d+-/.test(id) && !preference.legacyNumber) {
            preference = savePreference(localStorage, id, { legacyNumber: reserveSessionNumber(localStorage) });
          }
          return [id, preference];
        }));
        if (!cancelled) { setPreferences(next); setError(""); }
      } catch { if (!cancelled) setError("Recording names could not be loaded. Audio is unaffected. Check browser storage access."); }
    }
    void Promise.resolve().then(load);
    window.addEventListener("storage", load);
    return () => { cancelled = true; window.removeEventListener("storage", load); };
  }, [key]);
  function save(id: string, patch: LibraryPreference): boolean {
    try {
      const value = savePreference(localStorage, id, patch);
      setPreferences(previous => ({ ...previous, [id]: value })); setError(""); return true;
    } catch { setError("That change could not be saved. Your audio is unaffected; check browser storage and try again."); return false; }
  }
  return { preferences, error, save };
}
