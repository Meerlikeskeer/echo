# Echo device 0.2 — XIAO ESP32S3 Sense

Record meetings, conversations, classes and ideas to microSD. Start or stop from
the local page or the board's **BOOT** button. The board keeps recording when the
browser closes or the Mac disconnects. Download the session and import it into
Echo's web app for transcripts, notes and action items.

## Upload from VS Code

1. Open **this `echo-device` folder** in VS Code. It contains `platformio.ini`.
   Install the **PlatformIO IDE** extension if it is not already installed.
2. With power off, insert a FAT32 microSD card and attach the antenna. For the
   first test, leave the battery disconnected and connect a USB data cable.
3. Close any serial monitor. Open **PlatformIO → Project Tasks →
   seeed_xiao_esp32s3 → General → Upload**. Wait for **SUCCESS**.
4. Open **Monitor** (configured at 115200 baud), then press **RESET** once.
5. Read the `Echo-Device-XXXX` network name and password from the USB output.
   On the Mac, open **Control Center → Wi-Fi → Other Networks** and join it.
6. Open **http://192.168.4.1**. The recording page should say **Ready when you are**.
   The device network has no internet; that warning is expected.

If Upload cannot connect: hold **BOOT**, press/release **RESET**, release BOOT,
and retry. The USB port can change. Press RESET after uploading if necessary.
BOOT is the recording button during normal operation; holding it during reset
puts the board in its firmware loader instead.

## First test: record 90 seconds

Press **Start recording**, speak for 90 seconds, then press **Stop & save**.
Wait for saving and verification to finish before disconnecting power. The
session should show two audio chunks. Open **WAV files**, download a chunk and
listen to it. A moving meter or successful build does not establish usable audio.

Then select **Download Echo recording**, keep the `.echo` file, and reconnect
your Mac to its normal Wi-Fi. Open the **WEB-020 version of the Echo web app**, use
**Bring in a device recording**, choose the file, and press **Import and transcribe**.
Keep that page open while processing. When the transcript is ready, choose
**Generate notes** in its session panel. Provider configuration is required for
real transcription; the fixture provider returns synthetic output only.

**The deployed web app does not update when firmware is flashed or this branch
is pushed.** The importer must be run from this branch locally or included in an
owner-approved web deployment. See the root README for web setup. No new device
password, provider key or home Wi-Fi configuration is required in the firmware.

Full physical checklist: [WEB-020 device acceptance](../status/acceptance/WEB-020-device.md).

## Recording and recovery

- 16 kHz, mono, 16-bit PCM WAV; one-minute chunks with 2 seconds of overlap.
- Up to **two hours per session**, about 238 MB including overlap. The web app's
  256 MiB audio budget must have enough free space to import the recording.
- Stop/save reads back every completed chunk before marking capture complete.
  Long recordings take time to verify. Keep power connected until it finishes.
- Card pressure, microphone stalls and detected buffer loss stop capture with a
  visible partial-session error. Nothing is deleted to free space.
- After a reset or power loss, committed chunks remain downloadable as a partial
  session. An unfinished WAV tail stays on the card and may need a card reader
  and audio repair; it is not advertised as a verified completed chunk.
- The library shows up to 80 sessions. Use a card reader for older/additional
  sessions. Session identifiers are stable; no date is invented without a clock.
- `.echo` exports recheck hashes and contain only an intact committed prefix.
  Downloads block other device HTTP controls while transferring. Wait for the
  download to finish before starting another recording; reconnect afterward if
  the page temporarily reports a lost connection.
- Import verifies format, order, lengths and hashes before saving any audio.
  Repeat imports preserve existing identities and results. Interrupted captures
  remain partial. Browser storage may be cleared or evicted: keep your downloaded
  archive and SD originals.

No automatic deletion, card formatting, live cloud upload, on-device AI, native
Mac receiver, home-network connection, OTA update, speaker playback, battery
percentage or guaranteed room-range capture is included. Listen to downloaded
WAV files on the Mac. GPIO21 is SD chip-select and cannot serve as a recording LED.

## Diagnostics and privacy

The original console remains at **http://192.168.4.1/diagnostics**: camera preview,
short microphone test, SD browsing/readback test, Wi-Fi scan, BLE beacon and USB
logs. Recording locks conflicting diagnostics and all SD downloads. Never remove
the expansion board or microSD while powered or while recording/saving.

The per-device Wi-Fi password is saved in NVS and printed only over USB. Anyone
who knows it can operate the local console and download audio. The custom action
header prevents cross-origin browser POSTs; no CORS access is granted. This is a
local prototype, not an internet-facing authenticated server. Do not expose it
through a router. Application logs omit audio and credentials; driver/crash logs
remain on USB. Import sends audio only through Echo's existing server providers,
whose disclosures appear in the web app.

## Build and checks

From `echo-device`:

```sh
pio run
node tests/ui-smoke.cjs
node tests/recording-ui.cjs
c++ -std=c++17 tests/recording-format.cpp -o /tmp/echo-recording-format
/tmp/echo-recording-format
```

Platform is pinned to espressif32 7.1.3. No external web assets or extra libraries
are required. Host and simulated tests do not prove physical microphone, SD,
power-loss or long-session reliability. Those remain owner acceptance.

## Hardware references

- https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/
- https://wiki.seeedstudio.com/xiao_esp32s3_sense_mic/
- https://wiki.seeedstudio.com/xiao_esp32s3_sense_filesystem/

## Wireless handoff probe

The separate **Handoff probe** link opens `/probe`, alongside recording and diagnostics.
It provides an explicitly enabled BLE ping/pong service, temporary shared-network
Wi-Fi connection and a verified 64 KiB synthetic transfer with timing. Use a BLE
GATT client for ping/pong; the device's HTTP page cannot invoke browser Bluetooth.
Use only a trusted personal 2.4 GHz network: its clients can reach the whole device
console and recordings. Network credentials travel over local HTTP and are not
saved to flash or logs. Connect/disconnect and BLE enable/disable require idle
capture; synthetic transfers can run during recording. A channel change can
briefly interrupt the access-point page. No internet, automatic sync or durable
copy claim follows from a PASS.

Follow [the physical probe checklist](../status/acceptance/WEB-021-probe.md).
Upload firmware to see this section; deploying the web app does not update the board.

### Bluetooth coexistence retest (WEB-022)

The original probe could reboot in `coex_core_enable` because firmware disabled
Wi-Fi modem sleep before starting BLE. The repair keeps modem sleep enabled and
checks it before both Bluetooth entry points. Reflash the updated firmware; a web
page reload alone does not install this fix. With USB Monitor open, enable the
probe once, confirm no panic/reboot and stable uptime, then verify ping/pong and
repeat Wi-Fi transfers. Also test the diagnostics beacon after disabling the probe.
Shared-network and recording coexistence remain physical acceptance work.
