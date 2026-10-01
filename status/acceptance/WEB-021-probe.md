# WEB-021 — Physical wireless probe acceptance

All results below: **not run**. Compilation and simulated UI results are separate.

1. Upload this branch's `echo-device` firmware through PlatformIO. Join its device Wi-Fi and open `http://192.168.4.1/probe` using the new Handoff probe link. Confirm recording and diagnostics navigation still work.
2. With capture stopped, enable BLE. In a BLE GATT client discover **Echo-Handoff-Probe** by service `b2d10000-739e-4a72-8e21-ec4010210001`; connect, write UTF-8 `ping` to `b2d10001-739e-4a72-8e21-ec4010210001`, and read `pong`. Confirm live connected/ping evidence. Disconnect/reconnect and repeat. Invalid writes must not increment the ping count. Disable the probe and confirm discovery stops.
3. Enable BLE again. Run ten synthetic transfers; record each PASS/FAIL, elapsed time and KiB/s with BLE disconnected, then connected and actively pinging. The test transfers 64 KiB, verifies every byte and does not write SD.
4. While idle, connect to a **trusted personal 2.4 GHz network**. All its clients can reach the device console and recordings. Do not use campus credentials. Record the station address before switching Mac Wi-Fi; open `http://ADDRESS/probe` on that same network. Confirm BLE remains usable and rerun ten transfers. This tests local connectivity only. A channel change can briefly disconnect the access-point page.
5. Start a 90-second recording from `/` while BLE is enabled. Return to `/probe`, ping from the GATT client and run transfers during recording. Confirm radio reconfiguration actions refuse with an active-recording error. Stop/save, export and listen to the whole recording; note gaps, resets, free heap and recorder stack headroom from diagnostics/API. Synthetic transfer success alone does not prove audio health.
6. Try a wrong Wi-Fi password while idle: expect a visible timeout after 20 seconds and working access-point recovery. Interrupt a transfer by disconnecting Mac Wi-Fi: expect FAIL, never PASS. Reconnect and retry. Disconnect shared Wi-Fi explicitly; reconnect to device AP. Disable BLE. Reboot and confirm shared Wi-Fi and BLE are off and no probe results imply persistence.

Record board/firmware commit, power source, Mac/phone OS, BLE client, network type, distance, each measured outcome, recording playback and any USB reset/crash evidence. Do not include credentials or recording content. Raw audio stays on SD. Next decision: select connection/receiver design from evidence; actual completed-chunk sync and durable receipt need a separate implementation task.

## Owner observations and WEB-022 retest

Owner reports AP synthetic transfers passing repeatedly. Enabling BLE caused an
abort in `coex_core_enable` during `BLEDevice::init`, followed by Crash/panic reboot.
WEB-022 corrects disabled Wi-Fi modem sleep, matching Espressif issue #9595.
After reflashing, monitor USB while enabling BLE: confirm no abort, no uptime reset,
working ping/pong, disconnect/reconnect, repeated transfers, and a 90-second capture
with clean playback. Disable probe and exercise the diagnostics beacon as well.
These retest results are **not run**; the fix's build evidence does not prove them.

WEB-022 physical retest: owner observed configuration refusal rather than reboot. WEB-023 fixes the unchanged-setting interpretation and checks actual driver state. After reflashing WEB-023, repeat the same BLE/transfer checks; success remains not run.

## Automated run (WEB-024)

After manual ping/pong works, disconnect the phone BLE client and follow `tools/radio-test/README.md`. Run once idle and once during deliberately started capture; retain both JSON reports and check saved audio playback. A tool PASS tests synthetic transport and reported counter evidence only. Automated physical runs: **not run**.
