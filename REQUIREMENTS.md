# Requirements

Statuses here describe required product behavior, not completed implementation. See `TASKS.md` for delivery status.

## Web product

- **REQ-001 Capture:** browser and phone-browser microphone capture, visible recording state, explicit start/stop and useful permission/error handling.
- **REQ-002 Sessions:** long recordings comprise ordered, timed, chunked audio with configurable overlap; preserve identity, codec metadata, completeness, and gaps.
- **REQ-003 Incremental processing:** upload and transcribe while recording continues; retries must not duplicate chunks or jobs.
- **REQ-004 Stitching:** create a coherent transcript with overlap deduplication, source timestamps, partial states, and visible missing segments.
- **REQ-005 Outputs:** generate title, summary, notes, action items, and research topics from the transcript. Separate suggested research from opt-in external research; retain source provenance and do not invent findings.
- **REQ-006 Quick Note:** short capture → transcript → task/reminder/note/idea classification and pending action. Target 5–10 seconds from stop to usable output online; record clip length, device, connection, provider, and measured latency. This is a target, not an offline or universal guarantee.
- **REQ-007 Offline:** capture works without connectivity while the supported browser remains active; persist a queue, show unsynced data, recover on restart, resume on Wi-Fi or permitted cellular data, and expose quota/background limits.
- **REQ-008 History:** display sessions, transcripts, generated artifacts, processing failures/retries, and retention/keep status.
- **REQ-009 Privacy:** private by default, user-supplied API keys, server-only secrets, explicit external processing, owner-scoped data access, and self-hosted deployment support.
- **REQ-010 Modularity:** replaceable transcription, LLM, storage, research, and reminder/calendar providers; vendor SDKs stay behind adapters.
- **REQ-011 Actions:** preview and confirm external reminder/calendar writes, resolve ambiguous dates/timezones with the user, and avoid duplicate exports.

## Raw audio lifecycle

- **RET-001:** configurable normal raw-audio retention of 7–30 days, measured from session end. Default 14 days is a provisional implementation choice (ADR-004).
- **RET-002:** automatic deletion requires successful transcription of every affected chunk and a checksum/integrity-verified independent raw-audio copy on cloud storage or phone. A transcript alone, upload response, or copy that will be deleted in the same operation is insufficient. Recheck copy availability before deletion; failed/unavailable verification blocks it.
- **RET-003:** notify the user before automatic deletion; show affected sessions, reason, deadline, and an explicit Keep action. Lack of a Keep authorization after the communicated deadline permits deletion only if all other guards pass. Notification failure must block automatic deletion until a warning can be delivered. Define the grace period in WEB-010.
- **RET-004:** near-full storage warns the user and offers Keep/export/storage management. Pressure-driven early eviction may occur only for already transcribed audio with an independent verified surviving copy and completed warning window. Never silently evict unsynced or untranscribed audio.
- **RET-005:** persist explicit Keep authorization per session; it overrides age- and pressure-based automatic deletion until revoked. If space cannot be freed safely, display a capacity error and stop/pause capture safely rather than violate safeguards.
- **RET-006:** deletion is per copy, idempotent, and auditable without logging recording contents. Recheck keep status and guards at execution time. Cloud and phone cleanup must not race to remove the final verified copy. Automatic erasure of all raw copies is outside this policy and needs a separate explicit decision.

## Deferred device requirements

Independent capture/processing and later phone sync; BLE control; Wi-Fi transfers; investigation of up-to-30-ft room capture and contact-phone recording; custom speaker audio; LED and haptic feedback; eventual speech output. Hardware and native app implementation are deferred. Acoustic distance and contact recording are experiments, not promised performance.
