# Device acceptance — the first round test of Echo on real hardware

**Who runs this:** the owner, with the XIAO ESP32S3 Sense in hand. The earlier agent session could not open the USB serial port: `esptool` returned `Operation not permitted`. The owner requested to upload and test this firmware. Everything below the *Flash* step needs a microphone, a microSD card and a room with sound in it, none of which a test fixture has.

**What has been verified without hardware:** the firmware compiles for `seeed_xiao_esp32s3` (RAM 21.9%, flash 44.6%), and three Node/host suites pass — WAV framing and journal validation, the recording page's logic against a simulated device, and the older diagnostics console smoke test. **None of that proves the microphone records, the card holds, or the audio is audible.** That is what this script is for.

**Time:** about 20 minutes for Part A, 15 more for Part B, and Part C runs as long as you let it.

**Recording the result is part of the task.** Fill in the table at the bottom, including what failed. A failure here is a *good* outcome: it is the first physical evidence this firmware has ever had.

---

## Setup

The board must be plugged in over USB and a FAT32 microSD card must be inserted **before** power-up. Confirm the port exists:

```sh
ls /dev/cu.usbmodem*
```

If nothing is listed, try the other USB-C cable first — charge-only cables are the usual cause, and they present no serial port at all.

## Flash

From the repository root, on the `feat/WEB-020-device-mvp` branch:

```sh
cd echo-device
~/.platformio/penv/bin/pio run -t upload
```

`pio` is not on `PATH`; the full path above is the installed PlatformIO 6.2.0. Expect a rebuild of about a minute, then `Writing at 0x...` and `Hash of data verified`.

**If upload fails to connect:** hold the board's **BOOT** button, tap **RESET**, release BOOT, and run the command again. This forces the ROM download mode.

Then open the serial monitor to read the Wi-Fi credentials, which are printed **only** over USB and never to the web logs:

```sh
~/.platformio/penv/bin/pio device monitor -b 115200
```

Press RESET. You should see the network name, the password, and `Open http://192.168.4.1`.

---

## Part A — one short recording, end to end

Join the board's Wi-Fi from the Mac, then open `http://192.168.4.1`.

1. **The page loads and says it is ready.** The badge should read *Ready when you are* and the storage line should show the card's free space in GB. If it says *microSD needed*, stop — open `/diagnostics` and mount the card there.
2. **Press Start recording.** The badge turns to *Recording to microSD*, the timer counts, and the level meter moves when you speak. **Speak continuously for about 90 seconds**, saying something you will recognise later — the time, a count, a sentence. Ninety seconds is deliberate: it crosses the one-minute chunk boundary, so it exercises the overlap and the journal, which a 20-second clip would not.
3. **Close the browser tab while it is still recording, wait ten seconds, and reopen it.** The page should come back showing the recording still running with the timer advanced. This is the independence claim — the board records whether or not anything is watching.
4. **Press Stop & save.** The badge goes to *Saving & verifying* and the button disables. This step re-reads every chunk off the card and checks its SHA-256, so it takes a few seconds.
5. **The session appears in the library** as *Saved & verified*, with a duration near 1:30 and **2 saved audio chunks**. If it says *Partial*, record that and go to *If something failed* below.
6. **Expand "WAV files" and download chunk 1.** Play it in QuickTime or Finder. **You must actually hear your own voice.** This is the check nothing else substitutes for — a file of the right size, right header and right hash can still be silence if the microphone never opened.
7. **Download the Echo recording** (the `.echo` file). Keep it; Part B needs it.

## Part B — the import path into Echo

This proves the device's export and the web app's importer agree, which has only ever been checked by reading both sides.

1. Rejoin your normal Wi-Fi.
2. Start the Echo web app **from this branch**, or use a deployment that includes WEB-020, and sign in as the owner. Firmware upload does not deploy the web importer.
3. In the **Bring in a device recording** panel, choose the `.echo` file from Part A.
4. It first *checks* the file — every chunk's SHA-256 is verified before anything is imported. You should see the duration, clip count, size and **Stopped cleanly**. Press **Import and transcribe**.
5. The session should import with both clips, then transcribe. Choose **Generate notes** to produce session notes. **Check the transcript actually says what you said.**
6. **Import the same file a second time.** It must not duplicate the session, and it must keep the results already generated.

## Part C — the long session

Only worth running once Part A passes. This is the one the product exists for.

1. Start a recording and leave it running for **at least 30 minutes** — a real meeting or conversation is ideal.
2. Part-way through, **press the board's BOOT button once** to confirm it stops a recording with no browser involved. (Press it again another time to confirm it *starts* one the same way.)
3. Confirm the chunk count matches roughly one per minute, and that the session is *Saved & verified*.
4. **Check `stackFree` in `http://192.168.4.1/api/recording`** after a long run. It reports the capture task's minimum free stack in bytes, measured rather than assumed. The task is given 16 KiB; `hashFile` alone puts 2 KiB on it above the SD and mbedtls call depth. **If `stackFree` is under about 2048, raise the stack in `recorder.h` before trusting a two-hour session.** This number is the reason the field exists — nobody has ever measured it on this hardware.

---

## Part D — interruption and safeguards

Use synthetic speech for these tests, never an important recording.

1. Record for over 70 seconds, then press RESET before stopping. Reconnect. The
   session must be **Partial**, keep at least its first committed chunk, and retain
   its unfinished WAV on the card. Import the exported prefix; it must remain partial.
2. While recording, try a camera start or card mount in Diagnostics: it must refuse
   without interrupting capture.
3. Save a long recording and keep watching the page: **Saving & verifying** should
   remain reachable. Export may temporarily occupy the single HTTP server; wait
   for the download to finish before using controls.
4. With power off, remove the card and restart: recording must refuse. Reinsert
   with power off, boot or remount in Diagnostics, and check readiness returns.

## If something failed

**Keep the microSD card exactly as it is.** The firmware never deletes audio, and an unfinished tail is deliberately left on the card rather than advertised as committed — it is often recoverable with a card reader even when the session shows as *Partial*.

The page's error line is written to be specific; copy it verbatim into the table. `Microphone stalled` and `Microphone data was lost` point at the I2S path; `microSD write failed` and `Card space reserve reached` point at the card; `PSRAM unavailable` would mean the build lost `-DBOARD_HAS_PSRAM`, which the board definition supplies.

For a crash or reboot mid-recording, the serial monitor is the evidence — `monitor_filters = esp32_exception_decoder` is already configured, so a backtrace decodes to source lines. Paste it in whole.

---

## Results

Fill this in as you go. `not run` is a valid and useful entry.

| Step | Result | Notes |
| --- | --- | --- |
| Flash and serial credentials | | |
| A1 page loads, card mounted | | |
| A2 90-second recording, meter moves | | |
| A3 survives the tab closing | | |
| A4–A5 saved & verified, 2 chunks | | |
| A6 **voice audible in the WAV** | | |
| B3–B4 file checks, "Stopped cleanly" | | |
| B5 import, transcript correct | | |
| B6 re-import keeps results | | |
| C1 30-minute session | | |
| C2 BOOT button stops and starts | | |
| C4 `stackFree` after a long run | | bytes |

**Firmware version tested:** 0.2.0 · **Commit:** _(fill in)_ · **Date:** _(fill in)_
