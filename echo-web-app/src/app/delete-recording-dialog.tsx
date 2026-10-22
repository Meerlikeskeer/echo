"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";
export function DeleteRecordingDialog({ recording, onCancel, onConfirm }: { recording: { id: string; title: string }; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-heading" aria-describedby="delete-consequences" onCancel={event => { event.preventDefault(); if (!working) onCancel(); }}>
    <h2 id="delete-heading">Delete “{recording.title}”?</h2>
    <p id="delete-consequences">This permanently deletes this recording’s notes, transcript and original audio from this browser. This may be your only copy. No backup has been verified. Device and other copies are unaffected.</p>
    <p className="text-xs">Session {recording.id}</p>
    {error ? <p role="alert">{error} Some local data may already have been removed. You can retry.</p> : null}
    <div className="dialog-actions"><Button autoFocus variant="outline" disabled={working} onClick={onCancel}>Cancel</Button><Button disabled={working} onClick={async () => { setWorking(true); setError(""); try { await onConfirm(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion could not finish."); setWorking(false); } }}>{working ? "Deleting…" : "Delete recording"}</Button></div>
  </dialog>;
}
