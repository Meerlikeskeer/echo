# WEB-025 physical completed-chunk transfer

Not run. Prior owner evidence: one idle and two active-recording synthetic BLE/Wi-Fi
runs passed, with no noticeable playback gaps. This does not certify SD transfer.

- Flash WEB-025 firmware, join device AP and launch tools/chunk-receiver/run.command.
- Record three minutes. Confirm chunk 0 is received and verified before stopping;
  repeat for later full chunks. Monitor recording errors and USB resets/stack headroom.
- Stop cleanly; expect explicit COMPLETE only after device verification. Listen to
  WAVs/recording and import final .echo into Echo web. Check transcript ordering,
  overlap and duration; provider inference remains the existing manual workflow.
- Disconnect Mac Wi-Fi mid-transfer. Completed files must remain. Reconnect and
  rerun with the same --session ID; already verified chunks must not download again.
- Stop the receiver mid-chunk and restart. No incomplete file/receipt may pass as
  committed. Keep device powered; never remove SD originals.
- Power-interrupt device capture separately: recover available committed chunks by
  explicit session ID while idle. No clean completion/archive claim; unfinished
  tail remains on SD and requires the existing recovery workflow.
- Test with BLE enabled/connected, shared Wi-Fi and longer capture once AP baseline
  passes. Check audio gaps/overflow, card busy responses, storage pressure and slow
  or disconnected client behavior. Network stalls must not hold the SD mutex.

Record firmware commit, receiver commit, SD model, power source, network, session ID,
per-chunk arrival times, playback findings, fault outcomes and receipt/archive paths.
Do not paste recording content or credentials into logs/handoffs.
