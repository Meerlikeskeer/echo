# Roadmap

The foundation, agent workflow and web shell are complete and integrated into `main`. Deliver a working increment before expanding scope; hardware is deferred.

## Task progression

```text
DOC-001 ✅   Project/repository foundation
ENG-001 ✅   Bounded builder/checker workflow
WEB-001 ✅   Next.js web shell and development tooling
ENG-002 ⬚    Self-host parity verification (independent of the WEB sequence)
WEB-002 ✅   Short recording vertical slice — awaiting owner review on
             feat/WEB-002-recording-slice, not yet merged
WEB-003 ←    NEXT — session and playable chunk model
```

Do not begin WEB-003 or later product work until WEB-002 is reviewed and merged. See `TASKS.md` for per-task status, acceptance criteria and handoff evidence.

## Milestones

| Milestone | Tasks | Exit condition |
| --- | --- | --- |
| 1. First useful recording | WEB-001 ✅, WEB-002 ← next | Record 30–60 seconds, stop, view transcript and generated notes |
| 2. Reliable long sessions | WEB-003–006 | Durable chunk capture, incremental uploads/transcription, stitched transcript with gap handling |
| 3. Useful daily workflow | WEB-007–009 | Structured outputs, measured Quick Notes, session history |
| 4. Data lifecycle and deployment | WEB-010–012 | Guarded retention, secure settings and documented private deployment |
| 5. Optional integrations | WEB-013–014 | Opt-in cited research and confirmed reminder/calendar exports |

Integrate privacy/access controls from WEB-001; WEB-011 hardens them rather than deferring them. Test loss/recovery paths during each milestone. Choose providers and supported browsers through documented decisions; no hardware purchases or native-app scaffold belong in this roadmap.

Deployment targets Vercel (ADR-008): feature branch → GitHub → preview deployment → verification → merge → production. Milestone 4 covers making that deployment real and documented.
