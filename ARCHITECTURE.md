# Architecture

## Planned layout

```text
apps/web/                 Next.js + TypeScript + Tailwind UI and server endpoints
packages/audio/           Capture, chunk metadata, durable queue contracts
packages/transcription/   Transcription provider interface and adapters
packages/ai/              Structured notes and classification providers
packages/storage/         Durable object storage and verification adapters
packages/research/        Opt-in research providers and cited results
packages/reminders/       Confirmed reminder/calendar export adapters
packages/shared/          Domain types, validation, processing states
docs/                    Future detailed designs (not scaffolded yet)
tests/                    Future integration and synthetic fixtures
```

Introduce directories when they contain real implementation. A separate worker service is not required for the first milestone; keep processing boundaries extractable so longer jobs can later move to a durable worker.

## Flow

Browser microphone → local durable queue → authenticated upload → verified storage → incremental transcription → overlap-aware transcript stitching → structured notes → optional research / confirmed reminder export.

Capture and upload are decoupled. Persist chunk data and metadata locally before marking it queued. Upload complete playable chunks, not arbitrary recorder byte fragments assumed to be independently decodable. Browser/codec support and overlap strategy require a prototype. The initial short-clip milestone is a session with one chunk; long-session behavior follows in WEB-003 through WEB-006.

## Domain model

- **Session:** ID, owner, mode (session/quick-note), start/end, processing status, transcript revision, retention policy.
- **AudioChunk:** session ID, unique ID, sequence, recording start/end offsets, overlap duration, codec, size, checksum, local/remote locations, upload/transcription status.
- **TranscriptSegment:** chunk ID, time offsets, text, provider metadata; stitched output retains provenance and gaps.
- **GeneratedArtifacts:** title, summary, notes, action items, research topics, source transcript revision, pending/complete/failed status.
- **PendingAction:** classified task/reminder/note/idea, source reference, proposed time/timezone, confirmation and export status.
- **CopyVerification:** chunk ID, location/device, checksum, verification time, availability and durability evidence.
- **RetentionRecord:** policy days, eligibility time, warning delivery, keep authorization, deletion result.

Separate capture, upload, transcription, generation, and retention states. Stopping capture does not imply successful processing. Persist retry counts and actionable errors without content or keys. Use `(sessionId, chunkId)` for upload deduplication and `(chunkId, provider/config revision)` for transcription jobs. Generation uses a transcript revision to prevent stale output overwriting newer notes.

## Incremental transcription and stitching

Transcribe verified, independently decodable chunks as they arrive. Normalize timestamps into session time, sort by sequence and offset, and deduplicate overlap using timestamps plus text alignment. Preserve source segments for correction; never remove repeated speech outside the overlap just because text matches. Show gaps and partial transcripts; retry missing/failed chunks. Finalization requires all expected chunks accounted for, and invalidates/rebuilds artifacts when the transcript changes.

## Provider boundaries

| Provider | Contract responsibility |
| --- | --- |
| Transcription | Audio + metadata → timed segments, language, status/errors |
| LLM | Transcript + schema → validated artifacts or Quick Note classification |
| Storage | Put/get/delete + integrity and durable-copy verification |
| Research | Explicit query → findings with source URLs and provenance |
| Reminder | Preview proposed action; confirmed export with idempotency key |

Keep credentials in server-side configuration for the single-user prototype; future per-user keys require protected storage and access controls. Browser requests contain audio and settings, never server secrets. Define timeout, cancellation, retryability, rate-limit, and capability behavior at adapter boundaries. No specific model or vendor is selected.

## Offline and security

Use a browser-persistent queue (IndexedDB is the planned candidate). Recover it on restart and retry with bounded backoff on reconnection. Distinguish local-only, uploading, verified, and processed states. Browser quota eviction and suspended tabs remain limitations: warn about quota, show unsynced items, and test supported mobile browsers. Do not claim background execution guarantees.

Authenticate deployed access, scope sessions and storage to their owner, use private objects and short-lived authorized access, and encrypt transport. Do not send audio to research or reminder services implicitly. Rendering transcripts must treat model/transcribed text as untrusted content. External writes require a user-reviewed action.

## Retention

Run deletion as a guarded, auditable job defined by `REQUIREMENTS.md`. Check every guard again immediately before deleting each copy. A verified copy must be independent of the deletion target and remain available after deletion; do not delete the sole remaining verified copy. Storage pressure may trigger early eligible eviction only after warnings and all guards pass. Failed verification or processing blocks deletion. Persist deletion outcomes for retry without retaining sensitive content in logs.
