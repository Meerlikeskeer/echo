"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { capacity, preserveAudio, chunkKey, drainQueue, IndexedDBQueue, sendChunk, storageFailure, type QueueEntry } from "../lib/recording/queue";
import type { PlayableChunk } from "../lib/recording/session";

export function useAudioQueue(capturing: boolean, canProcess = true) {
  const store = useRef(new IndexedDBQueue());
  const captureActive = useRef(capturing);
  const processingAllowed = useRef(canProcess);
  useEffect(() => { processingAllowed.current = canProcess; }, [canProcess]);
  useEffect(() => { captureActive.current = capturing; }, [capturing]);
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
  const sync = useCallback(async (force = false) => {
    if (!processingAllowed.current || captureActive.current || !mounted.current || !navigator.onLine) return;
    if (!navigator.locks) { setLocksAvailable(false); return; }
    try {
      await navigator.locks.request("echo-audio-queue-drain", { ifAvailable: true }, async (lock) => {
        if (!lock || captureActive.current || !mounted.current) return;
        setWorking(true);
        try {
          await drainQueue(store.current, sendChunk, { online: () => navigator.onLine, now: () => Date.now(), force, active: () => mounted.current && !captureActive.current });
          await refresh();
        } finally { if (mounted.current) setWorking(false); }
      });
    } catch (cause) { if (mounted.current) setError(storageFailure(cause)); }
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    const recover = async () => {
      setOnline(navigator.onLine);
      try { await refresh(); await sync(); }
      catch (cause) { if (mounted.current) setError(storageFailure(cause)); }
    };
    void recover();
    const reconnect = () => { setOnline(navigator.onLine); void sync(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", reconnect);
    const timer = setInterval(() => { void recover(); }, 5000);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("online", reconnect); window.removeEventListener("offline", reconnect); };
  }, [refresh, sync]);
  const persist = useCallback(async (chunk: PlayableChunk) => {
    try {
      await store.current.offer(chunk);
      if (mounted.current) setUnsaved((previous) => previous.filter((item) => chunkKey(item) !== chunkKey(chunk)));
      await refresh();
    } catch (cause) {
      if (mounted.current) {
        setUnsaved((previous) => previous.some((item) => chunkKey(item) === chunkKey(chunk)) ? previous : [...previous, chunk]);
        setError(storageFailure(cause));
      }
      throw cause;
    }
  }, [refresh]);
  const prepare = useCallback(async () => {
    captureActive.current = true;
    await navigator.storage?.persist().catch(() => false);
    const info = await refresh();
    if (info.nearFull) { captureActive.current = false; throw new DOMException("Insufficient recording reserve", "QuotaExceededError"); }
    setError(null);
  }, [refresh]);
  const finished = useCallback(() => { captureActive.current = false; void sync(); }, [sync]);
  return { entries, unsaved, error, ready, working, space, online, locksAvailable, persist, prepare, finished, sync };
}
