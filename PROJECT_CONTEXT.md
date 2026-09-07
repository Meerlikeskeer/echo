# Project context

Echo begins as a private-first web AI note taker. Browser/phone microphone recording replaces dedicated hardware during this phase. The first useful milestone is recording 30–60 seconds, stopping, and receiving a transcript and notes.

The owner expects campus/building Wi-Fi, intermittent Wi-Fi elsewhere, and optional phone data. Capture must not require a network connection. Queue data locally and resume uploads when connectivity returns; disclose browser storage and background-execution limitations and avoid promising uninterrupted capture while a mobile browser is suspended.

Long recordings are sessions composed of ordered audio chunks, with configurable overlap to preserve speech at boundaries. Upload and transcribe incrementally, stitch results, and produce title, summary, notes, action items, and research suggestions. Quick Notes classify short recordings as task, reminder, note, or idea; target 5–10 seconds after stopping under measured online conditions. Offline work remains visibly pending.

Users supply provider credentials. Keep transcription, LLM, storage, research, and reminder integrations interchangeable. Prefer private/self-hosted operation; explicitly disclose each external processor. Retention is configurable from 7–30 days and must preserve audio until transcription and verified-copy safeguards are satisfied.

## This pass

WEB-001 adds the Next.js/TypeScript/Tailwind shell, fail-closed single-owner access, and local/PR verification tooling. It passed independent local review and verification and awaits owner review; no recording, processing, persistence, or hardware is implemented. See `TASKS.md` for handoff evidence and `README.md` for exact setup commands.

## Deferred hardware vision

A future device may record and process independently, then sync notes and pending reminders when the phone is available. BLE is for control; Wi-Fi is for audio/data transfer. Explore up-to-30-ft room capture, contact-phone recording experiments, custom speaker audio, LED and haptic feedback, and eventual speech output. These are investigation targets, not proven capabilities or web acceptance criteria. Hardware feasibility, battery, acoustic performance, consent UX, and platform constraints need later validation.

## Authority and open scope

These repository documents supersede prior chat context. Historical conversations are provenance, not a second task tracker. Research scope, provider selections, chunk/overlap duration, storage thresholds, notification grace periods, and mobile-browser support must be decided explicitly during their tasks; no vendor or performance guarantee is implied.
