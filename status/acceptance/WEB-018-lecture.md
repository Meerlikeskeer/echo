# WEB-018 — Chrome on MacBook lecture acceptance

This is the physical acceptance test still required before trusting Echo as the only recording. Synthetic tests and a native IndexedDB recovery trial are separate evidence. Run on the reviewed commit in Chrome on the owner's MacBook, with an independent phone/recorder capturing the same audio. Never use an important one-off lecture as the only copy during acceptance.

## Record the setup

- Echo commit and origin; Chrome/macOS versions; power source and free storage.
- Backup device and its playback check. Confirm it records independently of Chrome.
- Start time, expected lecture duration (at least 60–90 minutes), chosen overlap.
- Capture only material the owner intends to record. Use synthetic spoken material for automation.

## Live trial

1. Start backup first. Speak a clear start marker into both recordings, then start Echo. Keep Chrome visible and the Mac awake. Verify the first clip becomes saved and can be played; record its actual size and duration.
2. Continue through the full lecture. At several boundaries, speak distinctive numbered markers. Check that saved clip count and transcription advance. Watch the measured storage estimate; it should not use the requested bitrate as proof.
3. After at least ten minutes, interrupt the Mac's network for two minutes, while both recordings continue. Record offline status, pending clip identities and count. Restore network. Require later clips to process and pending clips to recover without duplicated local IDs or changed checksums. Provider calls may repeat after a server restart; no exactly-once claim is made.
4. Switch from Chrome to another app for 30 seconds, return, and speak a return marker. Record any missing audio, unexpected stop or wake-lock failure. Repeat once with a longer switch only while backup is definitely working. A gap or capture failure must not be labelled a complete lecture.
5. Stop Echo deliberately, then the backup. Wait for all saved clips to process. Require Final only if completion evidence and every transcript are present. Listen to the beginning/end of each chunk and compare boundary markers with backup; check first, middle and final lecture content in the transcript.
6. Generate the guide. Check that late-lecture content is included; terminology, course identification and uncertainty must match what was spoken. Download the guide. Reload Chrome: the final transcript and guide must recover with the same revision. Regenerate once after reload to exercise generation ordering.

## Destructive-interruption trial — separate short synthetic session

With the backup still running, record long enough to save at least two clips, then reload during an unfinished clip. Saved clips must recover and remain playable. The session must remain Partial because capture completion was never saved. Echo does not resume the interrupted session or recover unfinished audio. Do not count this deliberate reload as a failure if that limitation is clearly reported.

## Record results

For each step record pass/fail, elapsed time, device/browser versions, expected and observed markers, clip sizes, gaps, screenshots of user-facing errors, and whether backup recovered any missing content. Do not commit real lecture content or credentials. If any recording is lost or a partial transcript is shown as final, keep the PR draft and report the exact trigger.

## Automated/native evidence

The development-only, owner-gated `/diagnostics/lecture` uses a separate synthetic IndexedDB database with 90 artificial minute containers. Seed, reload, recover with one injected request failure, reload and verify the saved guide. This proves storage transactions, identities, completion and guide recovery in a browser. It does not record a real microphone, generate lecture audio, interrupt Wi-Fi or certify app-switch capture continuity.

## Current result

Physical full-lecture/backup acceptance: **not run**. Chrome/MacBook is the owner's intended platform; backup availability and the actual lecture remain pending.
