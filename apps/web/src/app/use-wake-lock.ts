"use client";

import { useEffect } from "react";
import { reportFailure } from "../lib/recording/log";

/**
 * WEB-016. Holds the screen awake while a session is recording.
 *
 * A one-minute recording never outlived the screen timeout. A lecture does, and
 * a sleeping screen is not a cosmetic problem here: a backgrounded or suspended
 * page stops uploading, and on some browsers the page is discarded outright,
 * which loses the chunk in progress. The lock is a request, not a guarantee —
 * it is refused in a background tab, released by the browser when the page is
 * hidden, and absent entirely in Firefox and older Safari — so this is one more
 * defence and never the thing correctness rests on.
 *
 * The re-acquire on `visibilitychange` is the part that matters. A browser
 * releases the lock silently when the page hides; without this the lecture
 * continues with no lock at all after the first notification or app switch.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock) return;
    const api = navigator.wakeLock;
    let held: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || held) return;
      try {
        const sentinel = await api.request("screen");
        // The await above yields, so both of these can already be true.
        if (cancelled) { void sentinel.release().catch(() => {}); return; }
        held = sentinel;
        sentinel.addEventListener("release", () => { if (held === sentinel) held = null; });
      } catch (cause) {
        // Never fatal: a refused lock costs a screen timeout, not a recording.
        reportFailure("keeping the screen awake during recording", cause);
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void held?.release().catch(() => {});
      held = null;
    };
  }, [active]);
}
