# Human testing

**Everything only you can do, in one place, with the steps written out.**

No agent can run anything on this page. Each item needs a microphone, a real
browser engine, a phone, an owner-only account, or a judgement about whether
something reads correctly. Every other check in this repository is automated and
runs in `npm run check`.

**How to use this.** Work top to bottom. Each session has a *Results* table —
fill it in as you go, including failures. **A failure here is a good outcome:**
these are code paths that have never executed outside Node, and finding a defect
is the entire reason to run them. Write what you observed, not what was expected.
`not run` is a legitimate entry; a guess is not.

**When you finish a session**, copy the outcome into the relevant
`tasks/<TASK-ID>.md` handoff, update that task's `**Status:**` line, and run
`npm run tasks:build`.

---

## What is waiting for you right now

| Session | Covers | Time | Blocked by |
| --- | --- | --- | --- |
| **A — Browser acceptance** | WEB-003, WEB-004, WEB-005, WEB-006, WEB-007 | ~35 min | Nothing. This is the one to run. |
| **B — Deployed origin** | The live HTTPS deployment | ~10 min | Nothing |
| **C — Mobile capture** | REQ-001 on a phone | ~20 min | Session B passing first |
| **D — Owner-only GitHub settings** | ENG-007, ENG-016 | ~10 min | Nothing |

**Session A is the bottleneck for five tasks.** All five are implemented and
test-verified, and not one of them is Done, because none has ever run in a
browser engine. Everything else on this list is smaller.

---

## Session A — Browser acceptance

The full step-by-step script is [`status/acceptance/browser-acceptance.md`](status/acceptance/browser-acceptance.md).
It is long because it is precise; it covers native IndexedDB storage, the real
recorder, the v1→v2 migration, transcript stitching and session artifacts, in one
sitting in Chrome and then Safari.

**Do not record anything real.** Part A generates its own audio from an
oscillator. Parts B and C send audio to a third-party provider.

Short version of the setup, with the full detail in that document:

```sh
cd ~/Documents/GitHub/echo
npm ci
cp env.example echo-web-app/.env.local
```

Set `ECHO_OWNER_USERNAME` and `ECHO_OWNER_PASSWORD` in `echo-web-app/.env.local`.
Parts B and C also need the `TRANSCRIPTION_*` and `LLM_*` groups; `npm run doctor`
checks them without touching provider code. Then:

```sh
npm run dev
```

Open `http://127.0.0.1:3000`. **Use `127.0.0.1` or `localhost`, never a LAN
address** — `crypto.subtle` exists only in a secure context, and Echo refuses to
open the microphone without it.

Record results in that document's own table.

---

## Session B — The deployed origin

Only you can run this: `npx vercel` needs your account, and an agent sandbox
cannot reach it.

```sh
cd ~/Documents/GitHub/echo
npx vercel                     # deploy; note the URL it prints
npm run test:deployed -- <the URL it printed>
```

**Expect exit 0.** The script checks the gate, refusal of wrong credentials,
every linked compiled asset refused without credentials, `/diagnostics/*` absent,
the Route Handlers' own guards, and that no password or `NEXT_PUBLIC_` value
appears in anything served.

Two things to watch. **Merged is not deployed** — a push deploys nothing
(ADR-014), so check which commit is live before drawing conclusions. And if it
fails with a message naming **Vercel Deployment Protection**, that setting is on;
turning it off is what lets Echo's own gate be the thing under test (ENG-013).

| Check | Result | Notes |
| --- | --- | --- |
| `npx vercel` deployed, URL noted | | |
| `npm run test:deployed` exit 0 | | |
| Commit live matches what you expected | | |

---

## Session C — Mobile capture

Deferred until Session B passes, because Echo binds `127.0.0.1` only (ADR-013),
so no phone can reach a development server. This runs against the deployed HTTPS
origin. `/diagnostics/*` returns 404 there by design, so this is the real
recorder only.

On a phone, over the deployed URL, signed in as the owner:

1. **Permission.** Deny the microphone first. Echo must say something readable,
   not fail silently or show a generic "Capture incomplete". Then allow.
2. **A short clip.** Record about 20 seconds. A transcript and notes come back.
3. **Interruption.** Start recording, then take a call or trigger an alarm.
   Whatever survives must be honest about what was lost — a partial session is a
   correct answer, a session claiming to be final is not.
4. **Background and lock.** Start recording, switch apps, lock the screen. Echo
   does not promise background execution. What matters is that it does not claim
   audio it does not have.
5. **Force-close and reopen.** Saved clips must still be listed and playable.
6. **Low storage.** If you can arrange it, confirm capture stops safely and
   nothing already saved is deleted.

| Check | Device | Result | Notes |
| --- | --- | --- | --- |
| Deny then allow the microphone | | | |
| 20-second clip, transcript returned | | | |
| Interruption leaves an honest partial | | | |
| Background and lock screen | | | |
| Force-close, reopen, clips survive | | | |
| Low storage stops capture safely | | | |

---

## Session D — GitHub settings only an owner can apply

These are account settings, not code. An agent cannot apply them, and `gh` fails
TLS verification through the network proxy here, so they must be done in the web
interface.

1. **Branch protection on `main`** (ENG-007). Require the `verify` check to pass
   before merging. Without this the automated checks are advisory.
2. **Auto-merge on green** (ENG-016). The workflow and the exact settings are
   written out in [`tasks/ENG-016.md`](tasks/ENG-016.md). This is the one that
   stops pull requests from piling up waiting for you to press a button — worth
   doing early, because it is currently the main reason finished work sits
   unmerged.
3. **Vercel Toolbar off for the project.** Leaving it on caused a deployment to
   fail with `Cannot patch preview comments when immutable static file upload is
   enabled`. No repository change fixes that one.

| Setting | Applied | Notes |
| --- | --- | --- |
| `main` requires `verify` to pass | | |
| Auto-merge on green enabled | | |
| Vercel Toolbar disabled | | |

---

## What is *not* on this list, and why

**Anything an agent can run is not here.** Style, types, unit tests, the
production build, the production HTTP suite and the self-host parity suite are
all in `npm run check`, and the bounded controller has its own Python suite. If
you find yourself hand-checking something in that set, it belongs in a test
instead.

**The container image** is verified by the `selfhost-container` CI job. Docker is
unavailable on this machine, so there is nothing for you to run locally.

**Deleting or restoring real recordings** is not testable yet. Retention
(WEB-010) is not implemented, and nothing in Echo deletes raw audio today.
