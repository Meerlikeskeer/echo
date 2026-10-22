# Project context

Echo begins as a private-first web AI note taker. Browser/phone microphone recording replaces dedicated hardware during this phase. The first useful milestone is recording 30–60 seconds, stopping, and receiving a transcript and notes.

The owner expects campus/building Wi-Fi, intermittent Wi-Fi elsewhere, and optional phone data. Capture must not require a network connection. Queue data locally and resume uploads when connectivity returns; disclose browser storage and background-execution limitations and avoid promising uninterrupted capture while a mobile browser is suspended.

Long recordings are sessions composed of ordered audio chunks, with configurable overlap to preserve speech at boundaries. Upload and transcribe incrementally, stitch results, and produce title, summary, notes, action items, and research suggestions. Quick Notes classify short recordings as task, reminder, note, or idea; target 5–10 seconds after stopping under measured online conditions. Offline work remains visibly pending.

Users supply provider credentials. Keep transcription, LLM, storage, research, and reminder integrations interchangeable. Prefer private/self-hosted operation; explicitly disclose each external processor. Retention is configurable from 7–30 days and must preserve audio until transcription and verified-copy safeguards are satisfied.

## Owner direction — 2026-10-22

Physical-device development is paused. Prioritize the laptop/browser version: Google and email/password accounts, protected per-user provider keys without owner-key fallback, opt-in live notes, confirmed sidebar deletion, PDF notes export, and custom/content-based groups. Account setup must not expose a previous user’s browser library. Provider limits and hosting costs remain finite.

## Current development stage

Shared documentation, the bounded builder/checker controller, the web shell and the first recording slice are established. WEB-001 adds the Next.js/TypeScript/Tailwind shell, fail-closed single-owner access, and local/PR verification tooling; ENG-001 adds the controller described in `AGENT_WORKFLOW.md`, whose automated feature loop remains deliberately disabled. WEB-002 adds the vertical slice: record one 30–60 second clip in the browser, post it to a Route Handler, and get back a transcript and generated notes through swappable provider ports (ADR-009).

Nothing is persisted — a recording exists only for the lifetime of the request that carries it — and there are still no sessions, chunking, offline queue, history, diarization, or hardware in that original web milestone. See `TASKS.md` for handoff evidence and `README.md` for exact setup commands. WEB-003 is the next product milestone.

## Product and UI direction

Echo should feel **simple, quiet, focused, recording-first, trustworthy, fast, and uncluttered.** Information density increases only when the user opens a session or asks for detail; the default view stays calm.

Avoid analytics cards, dashboard statistics, oversized navigation, decorative gradients, excessive panels, and generic AI-SaaS design patterns. The primary actions stay obvious — recording should be one of the clearest actions in the product.

Echo builds its own visual identity from `shadcn/ui` primitives rather than adopting default shadcn example layouts. See the `Technology Stack` section of `ARCHITECTURE.md` for the approved UI stack.

A future desktop layout may conceptually resemble:

```text
┌─────────────────────────────────────────────┐
│ Echo                                   ⚙︎   │
├────────────┬────────────────────────────────┤
│            │                                │
│ Sessions   │   Your Sessions                │
│            │                                │
│ Today      │   Physics 7A Lecture           │
│ Yesterday  │   Project Meeting              │
│ Earlier    │                                │
│            │                                │
│            │              ● Record          │
│            │                                │
└────────────┴────────────────────────────────┘
```

An opened session may eventually expose areas such as `Overview`, `Notes`, `Transcript`, `Tasks`, and `Research`. This is directional guidance, not a commitment to build those screens in any particular task.

## Hardware bring-up and deferred product vision

The owner opened a limited XIAO ESP32S3 Sense diagnostics phase on 2026-09-25 (WEB-019, ADR-021). Its console lives in `echo-device`. On 2026-09-25 the owner expanded scope to a
general-purpose recording MVP (WEB-020, ADR-023): meetings, conversations,
lectures and other sessions recorded to microSD, then explicitly imported into
Echo for transcript and notes processing. The native Mac receiver remains future work.

A future device may record and process independently, then sync notes and pending reminders when the phone is available. BLE is for control; Wi-Fi is for audio/data transfer. Explore up-to-30-ft room capture, contact-phone recording experiments, custom speaker audio, LED and haptic feedback, and eventual speech output. These are investigation targets, not proven capabilities or web acceptance criteria. Hardware feasibility, battery, acoustic performance, consent UX, and platform constraints need later validation.

## Authority and open scope

These repository documents supersede prior chat context. Historical conversations are provenance, not a second task tracker. Research scope, provider selections, chunk/overlap duration, storage thresholds, notification grace periods, and mobile-browser support must be decided explicitly during their tasks; no vendor or performance guarantee is implied.
