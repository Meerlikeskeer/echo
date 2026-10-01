# Receive real Echo chunks on your Mac

This first transfer slice polls the device, downloads only committed WAV chunks
while capture continues, verifies SHA-256 and PCM format, and saves a local copy.
It keeps every SD original. Transcription is opt-in (see below); it does not join Wi-Fi
for you. The default mode still supports importing the final `.echo` archive into the web app.

## First physical test

1. Upload this branch's updated `echo-device` firmware. Close Serial Monitor before
   Upload, then reopen it if you want crash/fault diagnostics.
2. Join Echo device Wi-Fi, open `http://192.168.4.1` and start a **three-minute recording** deliberately before launching the receiver.
3. In a Mac Terminal, from the repository root, run:

   ```sh
   ./tools/chunk-receiver/run.command
   ```

   Press Return for the device address. For shared Wi-Fi, enter its station IP.
   Default inbox is **Desktop/Echo-received**. Swift command-line tools are required.
4. Keep recording. You should see
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
Start capture before launching: the default session is the device’s most recently
started session, which may be an older completed recording if capture has not begun.
Alternatively choose an exact saved session with --session.
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

## Opt-in transcription (WEB-026)

After installing repository dependencies with `npm ci`, use Node 22 and Swift
command-line tools. The first argument must be `--transcribe`:

```sh
# Set the web origin (HTTPS, or loopback HTTP for a local web server).
export ECHO_TRANSCRIPTION_ORIGIN=https://YOUR-ECHO-ORIGIN
# Enter access-gate credentials privately; do not put their values in commands.
read -r 'ECHO_OWNER_USERNAME?Echo owner username: '
read -rs 'ECHO_OWNER_PASSWORD?Echo owner password: '; printf '\n'
export ECHO_OWNER_USERNAME ECHO_OWNER_PASSWORD
./tools/chunk-receiver/run.command --transcribe --host 192.168.4.1 --session session-EXACT-ID
unset ECHO_OWNER_USERNAME ECHO_OWNER_PASSWORD
```

These prompt commands are for macOS's default zsh. Provider credentials remain in
the existing web server configuration; this tool never reads environment files.
The web server needs this branch's transcription-only endpoint support (merge alone
does not deploy it). A prior deployed endpoint may still generate notes; use the
updated local server or an owner-deployed version before opting in. Existing
transcription and notes configuration remains required by the server registry,
but this mode calls only transcription. It deliberately uploads audio to the web
server and its configured transcription processor. Provider retention remains
that processor's policy; no remote audio durability is claimed.

Receipt and transcription are independent processes. Only the session selected
by this receiver is processed, including its verified saved chunks on restart.
Audio is flushed, read back and receipted before the worker can upload it. Slow
cellular/internet does not block capture or device downloads. Keep internet via
USB tethering while Wi-Fi connects to Echo; the owner reported placing iPhone USB
above Wi-Fi in macOS service order restored internet. This is owner-reported setup,
not automatic network management or measured sustained throughput.

Each session directory gains private `processing.json` (metadata, attempts and
successful original timed transcripts), `chunk-N.txt`, and ordered `transcript.txt`
plus `transcript.json` (provenance and gap reasons). Text starts PARTIAL until an
explicit clean device completion and all expected valid transcripts exist. Missing
or failed chunks remain marked; uncertain overlap is retained by Echo's existing
conservative stitcher. No notes are requested. Audio, SD originals and `.echo`
exports remain intact. Do not edit the private spool while a receiver is running.

Four attempts per chunk are persisted *before* requests, with bounded backoff.
A process interrupted during a request has an unknown remote outcome; restart
uses successful results and retries unfinished work within the remaining budget.
The server ledger is in-process: lost responses/cold starts can repeat provider
work and cost. This is not exactly-once. Exhausted/refused jobs stay partial across
restart; retain the journal and audio for diagnosis rather than deleting receipts
or claiming completion. A stale worker lock is recovered only if its recorded PID
is no longer running; a live or corrupt lock refuses a second worker.

After device COMPLETE, the launcher may stay running while outstanding requests
finish (each request has a 310-second bound). Transcription failures are recorded
locally without stopping reception. Ctrl+C stops both processes; rerun the same
session to recover. Fatal local journal/conflict/configuration errors stop the
worker safely and let reception finish; inspect private files/configuration and
rerun. No live provider, playback, restart or long-session physical acceptance is
implied by synthetic tests.

Device `COMPLETE` refers to audio receipt/export, not transcription. The launcher
separately prints Transcription FINAL or PARTIAL; partial/exhausted processing
returns a nonzero exit status. Keep both the raw WAVs and processing journal.
