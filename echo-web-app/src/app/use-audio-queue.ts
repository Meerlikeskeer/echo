"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { capacity, preserveAudio, chunkKey, drainQueue, durableWarning, IndexedDBQueue, resolveFailure, sendChunk, storageFailure, transientWarning, type QueueEntry, type StorageWarning } from "../lib/recording/queue";
import { reportFailure } from "../lib/recording/log";
import { persistSessionCompletion, type Completion } from "../lib/recording/session-completion";
import type { PlayableChunk, Session } from "../lib/recording/session";

import { saveDeviceRecording, type DeviceRecording, type ImportProgress } from "../lib/recording/device-import";

export function useAudioQueue(canProcess = true) {
  const store = useRef(new IndexedDBQueue());
  const processingAllowed = useRef(canProcess);
  useEffect(() => { processingAllowed.current = canProcess; }, [canProcess]);
  const mounted = useRef(false);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [unsaved, setUnsaved] = useState<PlayableChunk[]>([]);
  // WEB-015. resolveFailure needs the unsaved count at the moment a storage
  // operation succeeds, inside an async callback that closed over an older
  // render's `unsaved`. A ref written beside the state is the value that is
  // actually current there.
  const unsavedNow = useRef<PlayableChunk[]>([]);
  const trackUnsaved = useCallback((next: (previous: PlayableChunk[]) => PlayableChunk[]) => {
    unsavedNow.current = next(unsavedNow.current);
    setUnsaved(unsavedNow.current);
  }, []);
  // WEB-015. The warning is held with the one thing a message cannot carry:
  // whether a later storage success withdraws it. The hook still returns a
  // plain string, so nothing that renders it needs to know.
  const [warning, setWarning] = useState<StorageWarning | null>(null);
  const error = warning?.message ?? null;
  /** Withdraw a storage warning the moment a storage operation proves the
   *  condition is over. Called on every success path, never on a failure. */
  const settled = useCallback(() => {
    if (mounted.current) setWarning((current) => resolveFailure(current, unsavedNow.current.length));
  }, []);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [space, setSpace] = useState<Awaited<ReturnType<typeof capacity>> | null>(null);
  const [online, setOnline] = useState(true);
  const [locksAvailable, setLocksAvailable] = useState(true);
  const refresh = useCallback(async () => {
    const rows = await store.current.list();
    // Completion evidence is a second, newer read, and WEB-004's promise — saved
    // clips stay listable and downloadable — must not depend on it. Without it
    // every session simply stays partial, which is the conservative reading;
    // failing here instead would leave `ready` false, so Record stays disabled
    // and already-saved audio never renders. Same philosophy as listCompletions
    // retaining malformed evidence for the stitcher to flag.
    const manifests = await store.current.listCompletions().catch((): Completion[] => []);
    const info = await capacity(rows);
    if (mounted.current) { setEntries((previous) => preserveAudio(previous, rows)); setSpace(info); setCompletions(manifests); setReady(true); }
    return info;
  }, []);
  // ADR-016: draining no longer waits for capture to stop. The Web Lock still
  // admits one drainer per origin and the drain is still sequential, so at most
  // one upload is ever in flight — but a chunk now leaves as soon as it is safe
  // to send rather than at session end. Fail closed without Web Locks is kept:
  // two tabs draining the same rows unsupervised is worse than not draining.
  const sync = useCallback(async (force = false) => {
    if (!processingAllowed.current || !mounted.current || !navigator.onLine) return;
    if (!navigator.locks) { setLocksAvailable(false); return; }
    try {
      await navigator.locks.request("echo-audio-queue-drain", { ifAvailable: true }, async (lock) => {
        if (!lock || !mounted.current) return;
        setWorking(true);
        try {
          await drainQueue(store.current, sendChunk, { online: () => navigator.onLine, now: () => Date.now(), force, active: () => mounted.current });
          await refresh();
          settled();
        } finally { if (mounted.current) setWorking(false); }
      });
    } catch (cause) {
      reportFailure("draining the upload queue", cause);
      if (mounted.current) setWarning(transientWarning(storageFailure(cause, "maintenance")));
    }
  }, [refresh, settled]);
  useEffect(() => {
    mounted.current = true;
    const poll = async (stale = false) => {
      setOnline(navigator.onLine);
      // Only on load. A page that died mid-upload left `uploading` rows nothing
      // will ever finish; running this on the interval would instead reset the
      // upload this page has in flight right now.
      try {
        if (stale) await store.current.recover();
        await refresh();
        // WEB-015. Before sync(), not after. sync() handles its own failures and
        // returns normally, so clearing afterwards would withdraw a warning it
        // had just raised. Reading the store is its own proof that the store is
        // reachable; sync() withdraws its own on its own success path.
        settled();
        await sync();
      } catch (cause) {
        reportFailure(stale ? "recovering local storage on load" : "reading local storage", cause);
        if (mounted.current) setWarning(transientWarning(storageFailure(cause, "maintenance")));
      }
    };
    void poll(true);
    const reconnect = () => { setOnline(navigator.onLine); void sync(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("online", reconnect); window.removeEventListener("offline", reconnect); };
  }, [refresh, settled, sync]);
  const persist = useCallback(async (chunk: PlayableChunk) => {
    try {
      await store.current.offer(chunk);
      if (mounted.current) trackUnsaved((previous) => previous.filter((item) => chunkKey(item) !== chunkKey(chunk)));
      await refresh();
      // WEB-015. The clip is saved. If nothing else is waiting, the warning a
      // previous attempt raised no longer describes anything true.
      settled();
      // Deliberately not awaited. Persistence keeps absolute priority: capture
      // hands the next container to this same function, and if that call waited
      // on an upload the microphone would be waiting on the network.
      void sync();
    } catch (cause) {
      reportFailure("saving a recorded clip", cause);
      if (mounted.current) {
        trackUnsaved((previous) => previous.some((item) => chunkKey(item) === chunkKey(chunk)) ? previous : [...previous, chunk]);
        setWarning(transientWarning(storageFailure(cause, "capture")));
      }
      throw cause;
    }
  }, [refresh, settled, sync, trackUnsaved]);
  const prepare = useCallback(async () => {
    await navigator.storage?.persist().catch(() => false);
    const info = await refresh();
    if (info.nearFull) throw new DOMException("Insufficient recording reserve", "QuotaExceededError");
    // Clears a durable warning too, and deliberately. A new recording is
    // starting, so a previous session's unsaved completion record is no longer
    // what this page is doing — and prepare() has just proved storage works.
    setWarning(null);
  }, [refresh]);
  const complete = useCallback(async (captured: { session: Session; chunks: readonly PlayableChunk[] }) => {
    try {
      await persistSessionCompletion(captured, manifest => store.current.saveCompletion(manifest));
      await refresh();
    } catch (cause) {
      reportFailure("saving the capture-completion record", cause);
      // Durable. The session is permanently partial without this record — a
      // successful store read five seconds later does not change that, so the
      // five-second poll must not withdraw it.
      if (mounted.current) setWarning(durableWarning("Capture completion could not be saved. The session remains partial; saved audio is retained."));
      throw cause;
    }
  }, [refresh]);
  const importDevice = useCallback(async (recording: DeviceRecording, progress: ImportProgress) => {
    if (!navigator.locks) throw new Error("Use a browser with Web Locks to safely import device recordings.");
    await navigator.locks.request("echo-device-import", async () => {
      await navigator.storage?.persist().catch(() => false);
      try {
        await saveDeviceRecording(recording, store.current, progress);
        settled();
      } finally {
        await refresh();
        void sync();
      }
    });
  }, [refresh, settled, sync]);
  const finished = useCallback(() => { void sync(); }, [sync]);
  return { entries, completions, complete, importDevice, unsaved, error, ready, working, space, online, locksAvailable, persist, prepare, finished, sync };
}
