# Echo automated radio test (Mac)

This temporary test tool runs Bluetooth ping/pong and a verified 64 KiB Wi-Fi
transfer concurrently, 20 times by default. It saves one local JSON report.
It is not Echo's future Mac app or automatic audio handoff.

## Run it

1. Keep the device powered. Join its Wi-Fi (or the same trusted shared network).
2. Open the device `/probe` page and enable BLE. In nRF Connect, **Disconnect**
   the phone from Echo, then close the app. The Mac needs that BLE connection.
3. In Finder open this repository's `tools/radio-test` folder and double-click
   **run.command**. It compiles with Apple's Swift command-line tools; if those
   are missing, install Xcode Command Line Tools with `xcode-select --install`.
4. When asked for the device address, press Return for `192.168.4.1`. For shared
   Wi-Fi enter the **Station address** displayed on the probe page instead.
5. Allow the macOS Bluetooth permission prompt. If previously denied, check
   System Settings → Privacy & Security → Bluetooth for the tool/Terminal.
6. Watch round-by-round results. The final PASS requires all rounds, exact
   transferred bytes, pong replies and matching HTTP/BLE ping counts. The report
   is saved on Desktop with a timestamp. On FAIL, keep the report and USB logs.

You do not need to update device firmware for this tool if the current probe
already supports manual ping/pong and synthetic transfers. Close Serial Monitor
before any future firmware upload, but it may stay open during radio tests.

For a recording test, enable BLE while idle first, deliberately start recording
in the existing device page, then run the tool. Stop/save through the existing
recording controls and listen afterward. The tool reports the recording state
observed at preflight only; it does not certify uninterrupted capture or audio
quality. Successful synthetic transport is not durable receipt or real chunk sync.

## Terminal usage

From the repository root:

```sh
./tools/radio-test/run.command
./tools/radio-test/run.command --host 192.168.4.1 --rounds 20 --report /private/tmp/echo-radio-result.json
./tools/radio-test/run.command --self-test
```

Output paths must be new. Only private IPv4 addresses and 1–100 rounds are
accepted. Scan waits eight seconds and refuses multiple matching probes; rerun
with `--device UUID` using an identifier printed by that refusal. Connection,
HTTP and each round are bounded. Ctrl+C saves a FAIL report and disconnects BLE.
The runner refuses HTTP redirects, malformed/missing results, corrupt/short
payloads and unexpected replies/disconnects. Exit 0 means a complete PASS; 1 means
failed/interrupted run or report-write failure; 2 means invalid arguments.

Keep reports private: they include the local device address, Mac BLE identifier,
timestamps, recording-state flag and transport timings, but no credentials/audio.
No background service, Python packages or production native framework is installed.
Compilation uses a fresh temporary directory; source remains in this repository.
