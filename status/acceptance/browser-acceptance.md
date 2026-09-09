# Browser acceptance — the one session that closes WEB-003, WEB-004 and WEB-005

**Who runs this:** the owner, at a keyboard, in a real browser. No agent can. Every automated suite in this repository runs in Node against fixtures; nothing here has ever executed in a browser engine.

**Why one script for three tasks:** WEB-003, WEB-004 and WEB-005 are each *implemented and test-verified* but none is Done, and all three are blocked on the same evidence — a real Chrome and a real Safari, driving real IndexedDB, a real `MediaRecorder` and a real microphone, in one sitting. Running them separately would mean setting the same session up three times.

**Time:** about 20 minutes for Chrome, 10 more for Safari.

**Recording the result is part of the task.** An unrecorded pass is worth nothing to the next session. Fill in the results table at the bottom, including anything that failed. A failure here is a *good* outcome — it is the first browser evidence this code has ever had, and finding a defect is the reason to run it.

---

## Setup

From the repository root:

```sh
npm ci
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local` and set `ECHO_OWNER_USERNAME` (any name without a colon) and `ECHO_OWNER_PASSWORD` (random, at least 32 characters).

**Part A needs no provider keys.** Parts B and C call the real transcription and notes providers, so set the `TRANSCRIPTION_*` and `LLM_*` groups too if you want those parts. `npm run doctor` checks them without touching provider code.

```sh
npm run dev
```

Open **`http://127.0.0.1:3000`** and enter the owner credentials at the Basic authentication prompt.

**Use `127.0.0.1` or `localhost`, not a LAN address.** `crypto.subtle` exists only in a secure context. Echo checksums every chunk with it, and on a plain-HTTP non-loopback origin it refuses to open the microphone at all, naming the address (ENG-008). That refusal is correct behaviour, not a bug to work around.

**Synthetic data only.** Do not record anything real. Part A generates its own audio from an oscillator and never opens the microphone; Parts B and C send audio to a third-party provider.

---

## Part A — native storage, at `/diagnostics/queue`

This page is development-only and owner-gated; it returns 404 in production, and a production HTTP test asserts that. It runs the **production** IndexedDB adapter against native IndexedDB — the same code path the recorder uses, not a stand-in.

Open **`http://127.0.0.1:3000/diagnostics/queue`**.

### A1 — Run native storage tests

Press **Run native storage tests**. Require **all five** of these lines, each beginning `PASS`:

1. `PASS native IndexedDB Blob commit, reopen, ordering, concurrent duplicate and MIME normalization`
2. `PASS native unique sequence conflict retains existing rows`
3. `PASS quota budget abort mid-session preserves prior commit (not OS disk exhaustion)`
4. `PASS native write request success followed by abort rolls back atomically`
5. `PASS native recover() returns a stale uploading row to pending, leaves processed alone and keeps the raw Blob`

Line 5 is the one that matters most for WEB-005: `IndexedDBQueue.recover()` and `.update()` execute in **no** automated test — only the pure functions they delegate to. This is the first time that code runs anywhere.

Any line starting `FAIL` is a real defect. Copy it verbatim.

### A2 — Reload recovery

A1 leaves behind a deliberate fixture, described by its own last line:

`PASS pending reload fixture committed with one chunk left uploading; reload page, then select Recover pending clips`

**Reload the page** (⌘R), then press **Recover pending clips**. Require:

`PASS recovered 3 pending chunks, including one left mid-upload, and verified Blob checksums after page reload`

Three chunks, checksums verified, and the mid-upload one recovered. Fewer than three, or a checksum complaint, is a failure.

### A3 — Real capture persistence

Press **Test capture persistence**. This drives `captureSession` with an oscillator through a `MediaStreamDestination` — real capture machinery, no microphone. Require a line of the form:

`PASS real capture persisted N chunk(s) before stop; M verified Blobs recovered`

**N must be at least 1.** That is the whole point: it proves a chunk was durably committed *before* the session stopped, rather than everything being materialised at stop. `M` should equal the total chunk count.

### A4 — The v1 → v2 migration, against real pre-existing data (WEB-006)

**This is the check with no automated coverage of any kind.** WEB-006 raises the IndexedDB version from 1 to 2 to add a `sessions` store for capture-completion evidence. An independent review traced the upgrade and found it correct — existing `chunks` rows and the unique `sequence` index are guarded by `objectStoreNames.contains()` and never recreated — but **reading is not running**, and no test or diagnostic harness touches `IndexedDBQueue`, `saveCompletion` or `listCompletions`.

To create genuine v1 data and then migrate it:

1. Check out `main` (which has no `sessions` store) and run `npm run dev`.
2. Record a short clip in the real recorder so audio is committed to IndexedDB at **version 1**. Note how many clips you have.
3. Stop the dev server. Check out the WEB-006 branch. Run `npm run dev` again.
4. Reload `http://127.0.0.1:3000` **in the same browser profile**.

Require:

- Every clip from step 2 is **still listed and still downloadable**. Nothing was dropped by the upgrade.
- The recorder is usable — the Record button is enabled, not stuck disabled.
- No storage error appears.

Those pre-existing clips have no completion manifest and can never acquire one retroactively, so their session transcript must read **`Partial`**. That is correct behaviour, not a defect: a manifest records that capture finished successfully, and there is no evidence of that for a session recorded before the store existed.

### A5 — The blocked-upgrade message

The upgrade is exactly the moment a second open tab becomes likely, and a blocked upgrade is the one case where the user has to do something specific.

Open Echo in **two tabs** on `main` first (so both hold a version 1 connection), then switch to the WEB-006 branch and reload only one of them. If the upgrade is blocked, require a message that **names the actual remedy** — closing other Echo tabs — rather than a generic "Local saving failed". Record the exact wording you see.

---

## Part B — the real recorder (WEB-003 and WEB-005)

Go back to `http://127.0.0.1:3000`. This part uses your actual microphone and calls the real providers.

### B1 — Permission and a short clip

Record a short clip. Confirm:

- The browser asks for microphone permission, and **Deny** produces a readable Echo message rather than a silent failure or a generic "Capture incomplete".
- Allow, speak for ~20 seconds, stop.
- A transcript and notes come back per chunk.
- **The session transcript appears** with a `Partial`/`Final` badge, source chunk numbers and an `Original sources` disclosure. *(This is WEB-006, landing in PR #24 — check it if that branch is what you are running, and skip it on `main`.)*

### B2 — The 60-second auto-stop

Record and let it run past **60 seconds** without touching anything. Capture must stop on its own. This limit has never been observed in a browser.

### B3 — Draining during capture (WEB-005 A1–A3, the untested wiring)

This is the specific thing WEB-005 could not test: `useAudioQueue` needs a DOM, `navigator.locks` and IndexedDB, and this repository has no browser test runner.

Open DevTools → Network, filter to `recordings`. Start recording and **watch while still recording**. Require:

- `POST /api/recordings` requests appear **during** capture, not only after you press stop. *(A1 and A2.)*
- The recorder UI stays responsive and the level meter keeps moving while a request is in flight. Capture must never wait on the network. *(A3.)*

### B4 — Disconnect, reload, recover

While recording, turn off Wi-Fi (or use DevTools → Network → Offline). Keep recording, then stop.

- Pending audio shows an explicit unsynced/pending status.
- Reload the page. Pending audio **recovers**.
- Reconnect. It processes, **once locally**.
- Raw audio and results are retained — nothing is deleted after HTTP 200, by design (RET-002…RET-006 are not yet satisfiable).
- Playback does **not** reset every five seconds. That was a real defect found and fixed in WEB-004's checker review; this confirms it stayed fixed.

Repeat with **two tabs open** and an interrupted response. Local work must not duplicate. **Remote provider work may repeat** — the job ledger is in-process and best-effort, and a cold start, redeploy, second instance or TTL expiry all lose it (ADR-016). Seeing the same audio transcribed twice here is expected, not a bug.

### B4b — Completion evidence survives a reload (WEB-006)

The frozen tests for WEB-006 would **all still pass if the recorder never wrote completion evidence at all** — they exercise the pure domain module and a server-rendered component, never the storage round trip. This is the only check that observes it.

Record a clip and let it finish completely, so every chunk has a transcript. Require the session transcript to read **`Final`**.

Now **reload the page**. Require:

- The session still reads `Final`. The manifest was read back out of IndexedDB, not held in memory.
- Source chunk numbers and the `Original sources` disclosure are still present.

Then record a clip and **kill the tab mid-recording** (do not press stop). Reopen. Require that session to read **`Partial`**, with a readable reason. A capture that never stopped successfully must never be finalised — that is the distinction ADR-017 exists to make, and it is the one thing no test can prove.

### B5 — Quota exhaustion and a mid-recording write failure

Use a private/incognito window, or DevTools → Application → Storage to constrain the quota, and record until writes fail.

- Capture **stops**.
- Previous commits remain.
- Unsaved audio can still be downloaded.
- No raw copy is deleted automatically.

The diagnostic budget/abort tests in A1 are deterministic coverage of this path, but they inject a budget rather than exhausting real disk.

---

## Part C — Safari

Repeat **Part A** in full and **B1** in Safari. Safari is the reason several limits exist: its measured 204 kbps drove the 64 MiB audio budget, and its IndexedDB and `MediaRecorder` behaviour differ from Chrome's.

WEB-004's handoff notes that Safari displayed `/diagnostics/queue` (HTTP 200) but automation lost the page view (`elementHasNoFrame`, `noWindowsAvailable`), so **no native PASS was ever observed in Safari.** Driving it by hand is exactly what is missing.

---

## Not in scope

**Physical mobile is deferred, not outstanding** (ADR-013, WEB-004 item 4): microphone Allow/Deny on a phone, interruption, backgrounding, lock screen, force-close and reopen, low storage, persistent-storage refusal. Echo binds `127.0.0.1` only, so no phone can reach a development server. This now belongs to its own task against the **deployed HTTPS origin**, which exists and is verified as of 2026-09-08. WEB-004 is not incomplete for lacking it.

Note that `/diagnostics/queue` **404s on the deployed origin**, so Part A cannot run there. Mobile acceptance against the deployed origin is the real recorder only.

---

## Results

Fill this in as you go. Write what you observed, not what was expected. `not run` is a legitimate entry; a guess is not.

| Check | Browser | Result | Notes |
| --- | --- | --- | --- |
| A1 five PASS lines | Chrome | | |
| A2 recover 3 pending after reload | Chrome | | |
| A3 capture persisted ≥1 before stop | Chrome | | |
| A4 v1→v2 migration keeps existing clips | Chrome | | |
| A5 blocked-upgrade message names the remedy | Chrome | | |
| B1 permission, deny message, short clip | Chrome | | |
| B2 60-second auto-stop | Chrome | | |
| B3 POSTs during capture, UI responsive | Chrome | | |
| B4 disconnect / reload / recover / no playback reset | Chrome | | |
| B4b Final survives reload; killed capture stays Partial | Chrome | | |
| B5 quota exhaustion, nothing deleted | Chrome | | |
| A1 five PASS lines | Safari | | |
| A2 recover 3 pending after reload | Safari | | |
| A3 capture persisted ≥1 before stop | Safari | | |
| A4 v1→v2 migration keeps existing clips | Safari | | |
| B4b Final survives reload; killed capture stays Partial | Safari | | |
| B1 permission, deny message, short clip | Safari | | |

**Browser versions:** Chrome ______ · Safari ______ · macOS ______ · Date ______

**When this is filled in:** move the outcome into each task's handoff in `TASKS.md`, update the three `**Status:**` lines, run `npm run status:table`, and record in `STATUS.md` § *Verification floor* that the browser items under *Still not verified* are now verified — or say precisely which ones still are not.
