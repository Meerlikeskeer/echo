# Echo device console — XIAO ESP32S3 Sense

Embedded firmware in the Echo repository, separate from the Next.js application.
Open this `echo-device` folder in VS Code for PlatformIO development.
Do not use the earlier standalone installer: the repository is now the source of truth.

## First upload
1. Open this PlatformIO project in VS Code.
2. Keep the battery disconnected; use USB data/power. Attach the antenna with power off.
3. Choose PlatformIO: Upload (the right-arrow toolbar button).
4. Choose PlatformIO: Serial Monitor, 115200 baud, then tap the board's RESET button.
5. Read the `Echo-Device-XXXX` Wi-Fi name and generated password from USB output.
6. Join that Wi-Fi on the Mac and open http://192.168.4.1 in your browser.
   This network has no internet; your Mac may warn you. Return to normal Wi-Fi for internet.
7. Test health/logs, camera preview/snapshot, the microphone recording/playback,
   microSD browse/download/write-read, Wi-Fi scanning, and BLE beacon separately.

The password is generated per device and saved in NVS. It is printed only over USB.
No account, cloud service, external scripts, Wi-Fi home password, or API key is required.
All clients who know the Wi-Fi password can operate the console. It is a bench tool,
not an internet-facing server. A custom request header prevents browser cross-origin
POST actions; no CORS access is granted. Do not expose this console through a router.

## Included
- Uptime, reset reason, heap, minimum heap, PSRAM, flash, connected clients.
- Last 80 application events in RAM, log export, USB output, restart control.
- Opt-in JPEG preview (up to 2 FPS) and snapshot. Not a high-frame-rate MJPEG stream.
- Opt-in 2-second 16-bit mono 16 kHz WAV test; camera stops during this test.
- FAT32 microSD mount, directory browsing (80 entries max), downloads up to 8 MB.
- SD test creates a unique tiny file and checks its contents by reading it back.
  It leaves the file for inspection, never overwrites or deletes existing files.
- Asynchronous Wi-Fi network scan; opt-in nonconnectable BLE advertising beacon.
  BLE scan, pairing, arbitrary radio protocols and audio over Bluetooth are not implemented.

No card formatting, automatic audio storage, Echo uploading/transcription, Mac app,
battery percentage, arbitrary pin toggles, firmware updates over Wi-Fi or deletion controls.
GPIO21 is shared by the LED and SD chip-select, so no manual LED toggle is exposed.
Driver/boot/crash logs are available through USB, not mirrored to the RAM application log.

## Hardware validation still required
Successful compilation does not verify camera, microphone, card, radio, or power stability.
Run through each control on the physical board. Also test a missing card/camera, restart,
reconnection, and repeated previews. The microphone API returning samples does not prove
that a physical microphone is present: listen to the WAV. The card readback is a bench test,
not a guarantee of safe audio retention or durability across power loss.

The HTTP server processes one request at a time; downloads and microphone tests pause
other requests briefly. BLE initialization retains RAM after stopping its beacon; restart
if you need to reclaim it. Leave the serial monitor closed during firmware uploading.
If uploading cannot connect, hold BOOT, press/release RESET, release BOOT, then retry;
the USB port can change. Never unplug the expansion board while powered.

## Build
`pio run` — platform is pinned to the installed espressif32 7.1.3.
`node tests/ui-smoke.cjs` — browser-logic smoke test with a simulated device.
No third-party web assets or additional library downloads are needed beyond PlatformIO's framework.

## Official hardware references
- https://wiki.seeedstudio.com/xiao_esp32s3_getting_started/
- https://wiki.seeedstudio.com/xiao_esp32s3_camera_usage/
- https://wiki.seeedstudio.com/xiao_esp32s3_sense_mic/
- https://wiki.seeedstudio.com/xiao_esp32s3_sense_filesystem/
