"use client";

/**
 * WEB-007. Requests session artifacts and decides whether the answer still
 * applies when it arrives.
 *
 * Generation is **on demand**, never automatic. A transcript changes on every
 * chunk during capture, and regenerating on each change would spend a provider
 * call per chunk to produce a summary the owner never asked for.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acceptArtifacts, readArtifactResponse, transcriptRevision,
  type ArtifactRecord, type RevisionInput,
} from "../lib/recording/artifacts";

import { useWorkspaceIdentity } from "./workspace-identity";
import { ArtifactStore } from "../lib/recording/artifact-store";
import { ARTIFACT_REQUEST_TIMEOUT_MS } from "../lib/recording/request-policy";

export type ArtifactStatus = "idle" | "working";

export function useSessionArtifacts(transcript: RevisionInput) {
  const {userId,namespace,storage} = useWorkspaceIdentity();
  const store = useRef(new ArtifactStore(namespace + "echo-session-guides-v1"));
  const inFlight = useRef<AbortController | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const mounted = useRef(false);
  const [record, setRecord] = useState<ArtifactRecord | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [status, setStatus] = useState<ArtifactStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Both of these are read inside an async callback that closed over an older
  // render. A ref beside the state is the value that is actually current there,
  // and the revision comparison is worthless if it reads a stale one.
  const latest = useRef(transcript);
  const held = useRef<ArtifactRecord | null>(null);
  const attempts = useRef(0);

  useEffect(() => { latest.current = transcript; }, [transcript]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inFlight.current?.abort(); };
  }, []);

  // The revision of the transcript as it stands. Recomputed whenever it changes,
  // which is what makes `stale` below true the moment a new chunk lands.
  useEffect(() => {
    let current = true;
    void transcriptRevision(transcript).then(
      (value) => { if (current && mounted.current) setRevision(value); },
      () => { if (current && mounted.current) setRevision(null); },
    );
    return () => { current = false; };
  }, [transcript]);

  useEffect(() => {
    if (!revision) return;
    let current = true;
    const startedAtAttempt = attempts.current;
    void store.current.load(transcript.sessionId, revision).then(saved => {
      if (!current || !saved || inFlight.current || attempts.current !== startedAtAttempt) return;
      attempts.current = Math.max(attempts.current, saved.generation);
      held.current = saved;
      setRecord(saved);
    }).catch(() => {
      if (current) setStorageError("Saved notes could not be recovered. Audio is separate; you can generate notes again.");
    });
    return () => { current = false; };
  }, [revision, transcript.sessionId]);

  const generateUnlocked = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const generation = ++attempts.current;
    setStatus("working");
    setError(null);
    try {
      const source = latest.current;
      const response = await fetch("/api/sessions/artifacts", {
        method: "POST",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(ARTIFACT_REQUEST_TIMEOUT_MS)]),
        headers: { "content-type": "application/json", ...(userId === "owner" ? {} : { "x-echo-user": userId }) },
        body: JSON.stringify({
          sessionId: source.sessionId, text: source.text, status: source.status,
          segments: source.segments.map((segment) => ({ text: segment.text, startMs: segment.startMs, endMs: segment.endMs })),
          gaps: source.gaps.map((gap) => ({ reason: gap.reason, sequence: gap.sequence, startMs: gap.startMs, endMs: gap.endMs })),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body
          && typeof (body as { error?: { message?: unknown } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : "Notes could not be generated.";
        throw new Error(message);
      }
      const answer = readArtifactResponse(body);
      if (!answer.ok) throw new Error("Notes came back in a form Echo could not read.");
      // Recomputed from the transcript as it is **now**, not from the copy the
      // request was built with. Between those two moments a chunk may have
      // landed, and that is precisely the case this rule exists for.
      const currentRevision = await transcriptRevision(latest.current);
      const decision = acceptArtifacts(held.current, {
        sessionId: latest.current.sessionId,
        transcriptRevision: answer.revision,
        generation,
        artifacts: answer.artifacts,
      }, currentRevision);
      if (!mounted.current) return;
      if (decision.accepted) {
        held.current = decision.record;
        setRecord(decision.record);
        try {
          await store.current.save(decision.record);
          if (mounted.current) setStorageError(null);
        } catch {
          if (mounted.current) setStorageError("These notes could not be saved. Download them before leaving this page.");
        }
        return;
      }
      // A rejection is not an error. Nothing failed: the answer described a
      // transcript that is no longer the current one, or a newer attempt had
      // already landed. Saying "failed" would send the owner looking for a fault.
      if (decision.reason === "stale-transcript") {
        setError("The transcript changed while these notes were being written, so they were discarded. Generate again.");
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Notes could not be generated.");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (mounted.current) setStatus("idle");
    }
  }, [userId]);

  const generate = useCallback(async () => {
    if (!navigator.locks) { setError("Use a browser with Web Locks to safely generate saved notes."); return; }
    await navigator.locks.request(`echo-session-notes/${namespace}${latest.current.sessionId}`, { ifAvailable: true }, async lock => {
      if (!lock) { setError("This session is being changed in another tab. Try again when it finishes."); return; }
      if (storage.getItem(`echo-deleted-session-v1/${latest.current.sessionId}`)) { setError("This recording was deleted in another tab. Reopen your library."); return; }
      await generateUnlocked();
    });
  }, [generateUnlocked,namespace,storage]);

  return {
    record,
    storageError,
    revision,
    status,
    error,
    /** True when artifacts exist but describe an earlier transcript. They are
     *  still shown: outdated notes with a label beat no notes and no reason. */
    stale: record !== null && revision !== null && record.transcriptRevision !== revision,
    generate,
  };
}
