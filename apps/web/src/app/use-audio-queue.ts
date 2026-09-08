"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { capacity, preserveAudio, chunkKey, drainQueue, IndexedDBQueue, sendChunk, storageFailure, type QueueEntry } from "../lib/recording/queue";
import type { PlayableChunk } from "../lib/recording/session";

export function useAudioQueue(canProcess = true) {
  const store = useRef(new IndexedDBQueue());
  const processingAllowed = useRef(canProcess);
  useEffect(() => { processingAllowed.current = canProcess; }, [canProcess]);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [unsaved, setUnsaved] = useState<PlayableChunk[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [space, setSpace] = useState<Awaited<ReturnType<typeof capacity>> | null>(null);
  const [online, setOnline] = useState(true);
  const [locksAvailable, setLocksAvailable] = useState(true);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const rows = await store.current.list();
    const info = await capacity(rows);
    if (mounted.current) { setEntries((previous) => preserveAudio(previous, rows)); setSpace(info); setReady(true); }
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
        } finally { if (mounted.current) setWorking(false); }
      });
    } catch (cause) { if (mounted.current) setError(storageFailure(cause)); }
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    const poll = async (stale = false) => {
      setOnline(navigator.onLine);
      // Only on load. A page that died mid-upload left `uploading` rows nothing
      // will ever finish; running this on the interval would instead reset the
      // upload this page has in flight right now.
      try { if (stale) await store.current.recover(); await refresh(); await sync(); }
      catch (cause) { if (mounted.current) setError(storageFailure(cause)); }
    };
    void poll(true);
    const reconnect = () => { setOnline(navigator.onLine); void sync(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    const timer = setInterval(() => { void poll(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("online", reconnect); window.removeEventListener("offline", reconnect); };
  }, [refresh, sync]);
  const persist = useCallback(async (chunk: PlayableChunk) => {
    try {
      await store.current.offer(chunk);
      if (mounted.current) setUnsaved((previous) => previous.filter((item) => chunkKey(item) !== chunkKey(chunk)));
      await refresh();
      // Deliberately not awaited. Persistence keeps absolute priority: capture
      // hands the next container to this same function, and if that call waited
      // on an upload the microphone would be waiting on the network.
      void sync();
    } catch (cause) {
      if (mounted.current) {
        setUnsaved((previous) => previous.some((item) => chunkKey(item) === chunkKey(chunk)) ? previous : [...previous, chunk]);
        setError(storageFailure(cause));
      }
      throw cause;
    }
  }, [refresh, sync]);
  const prepare = useCallback(async () => {
    await navigator.storage?.persist().catch(() => false);
    const info = await refresh();
    if (info.nearFull) throw new DOMException("Insufficient recording reserve", "QuotaExceededError");
    setError(null);
  }, [refresh]);
  const finished = useCallback(() => { void sync(); }, [sync]);
  return { entries, unsaved, error, ready, working, space, online, locksAvailable, persist, prepare, finished, sync };
}
