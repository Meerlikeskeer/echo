# Receive real Echo chunks on your Mac

This first transfer slice polls the device, downloads only committed WAV chunks
while capture continues, verifies SHA-256 and PCM format, and saves a local copy.
It keeps every SD original. It does not yet transcribe automatically or join Wi-Fi
for you; import the final `.echo` archive into the existing web app afterward.

## First physical test

1. Upload this branch's updated `echo-device` firmware. Close Serial Monitor before
   Upload, then reopen it if you want crash/fault diagnostics.
2. Join Echo device Wi-Fi and open its recording page at `http://192.168.4.1`.
3. In a Mac Terminal, from the repository root, run:

   ```sh
   ./tools/chunk-receiver/run.command
   ```

   Press Return for the device address. For shared Wi-Fi, enter its station IP.
   Default inbox is **Desktop/Echo-received**. Swift command-line tools are required.
4. Start a **three-minute recording** deliberately on the device page. The receiver
   can start before capture and waits/retries if there is no active session yet;
   start capture promptly, or start it before launching the tool. You should see
   **Saved and verified chunk 0** after the first minute, while recording is still
   active. Later full chunks contain two seconds of overlap.
5. Stop recording on the device page and leave it powered while verification finishes.
   The receiver prints **COMPLETE** only after it sees the explicit device completion
   marker and verifies every listed chunk. It creates `session-ID/session-ID.echo`.
6. Switch Mac Wi-Fi back to internet access, open Echo web and import that `.echo`
   file using **Bring in a device recording**. Transcription is still the existing
   explicit web workflow. Listen to the saved WAVs/full recording for gaps.

BLE is optional for this transfer run: completed audio travels over Wi-Fi. You
can keep the probe connected for separate coexistence observation, but this tool
itself does not open BLE or change recording state.

## Reconnect and resume

The receiver pins the first selected session; it will not switch to a new recording.
Saved files and receipt metadata survive interruptions. On restart it rehashes
existing chunks, compares immutable metadata and fetches only missing chunks.
Retry is bounded: eight consecutive request/network failures stop the run safely.
Restart once connectivity returns. Within an unfinished chunk, retry starts that
chunk again; full verified chunks are reused. A corrupted/conflicting file stops
rather than overwriting it. Never remove SD originals based on receipt alone.

For a session after device reboot, list saved recordings on the device page while
idle, then specify its exact ID (also the inbox subfolder name):

```sh
./tools/chunk-receiver/run.command --host 192.168.4.1 --session session-EXACT-ID
./tools/chunk-receiver/run.command --host 192.168.4.1 --seconds 7200 --output /private/tmp/echo-inbox
```

Default run bound is 30 minutes; configurable 30–7200 seconds. Ctrl+C ends the
process; the current in-memory partial download is not a receipt and is refetched
on restart. A partial/interrupted device session never gets a complete archive.
The default retries before capture are short; if they expire, rerun after starting.
Only private IPv4 addresses are accepted. No redirects, credentials or public
endpoints. Use the trusted device AP/personal shared network from ADR-025.

The inbox must be private and not edited by another process during receipt.
One receiver takes an exclusive inbox lock. Files use owner-only permissions,
full filesystem flush, rename and directory flush, then checksum readback before
receipt. Disk errors stop safely. Receipt checks do not authorize audio deletion.
Successful transfer still requires physical capture/playback and power-loss testing.

## Synthetic verification

```sh
./tools/chunk-receiver/run.command --self-test
python3 tools/chunk-receiver/tests/integration.py
```

Integration tests compile a TESTING-only local HTTP fixture transport; this option
is absent from the production launcher. They exercise actual networking, checksum
validation, durable files, retries, restart reuse, conflicts and incomplete-session
handling with synthetic WAV bytes. Test output/cache remains under `/private/tmp`
for inspection, avoiding permission-dependent directory cleanup as a test prerequisite.
