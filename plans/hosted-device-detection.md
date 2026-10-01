# Detect Echo from the hosted web app — proposed plan (DOC-007)

Owner request: a quiet device connection indicator on the Vercel web app. This is
a plan, not implemented discovery, transfer, firmware provisioning or a native
Mac application. Browser permissions make silent universal detection unrealistic.

## Product flow

Add one **Connect Echo** action near recording/import, with a small state label:
Not connected → Choose your Echo → Checking connection → Echo connected.
If Bluetooth permission is unavailable, offer **Connect by device address** or
**Open Echo device page / Import recording**. Once explicitly paired, reconnect
only to that known device when the browser permits it. Do not scan the LAN,
request microphone access, change Wi-Fi, start capture, upload audio or erase
sessions merely because a device was detected. Connection and internet/provider
availability are separate statuses; navigator.onLine does not prove either.

## Current implementation facts

The temporary receiver pulls private-address committed-chunk HTTP routes and
verifies a local spool. The firmware has no CORS permission for a hosted origin;
its action-header protection assumes trusted Wi-Fi clients. The existing BLE
probe is diagnostics, not a paired identity/production discovery protocol, and
capture startup stops its advertising. A detector cannot claim reliable discovery
through that probe during capture. The hosted Vercel server cannot reach a user's
192.168.4.1: the connection must originate in the user's browser or a later local
bridge. The native Mac project remains a placeholder.

## Browser feasibility, verified against official documentation

Chrome's Web Bluetooth interface uses an explicit user gesture and device chooser;
it supports a subset of platforms, so capability-test navigator.bluetooth and
provide fallback rather than claiming every browser works. Proposed first target:
Chrome on the owner's Mac; validate actual installed versions before acceptance.
[Chrome Web Bluetooth documentation](https://developer.chrome.com/docs/capabilities/bluetooth)

Chrome's Local Network Access permission gates secure-origin access to local
addresses. Its documented mixed-content exemption can permit HTTP device requests
from HTTPS for private IP literals after permission, but this is browser-dependent
and does not remove CORS or device authorization requirements. Do not repeat the
old blanket claim that hosted HTTPS can never reach HTTP device IPs. Test the real
browser/origin/device combination; denied/unsupported cases stay useful through
file import/device console.
[Chrome Local Network Access documentation](https://developer.chrome.com/blog/local-network-access)

## Staged implementation

1. **Connection UX and capability adapter.** Implement explicit connect,
   unsupported/denied/cancel/disconnect states and remembered selected device.
   Mock tests must prove no audio/provider/deletion requests on detection. Keep
   .echo import and the receiver as current fallbacks. No API-based LAN scan.
2. **Minimal device identity contract.** Through its own WEB task/ADR, define a
   versioned read-only BLE identity/capability service (separate from probe) with
   a stable opaque device ID, recording status and optional validated private IP.
   Decide explicit possession approval/pairing and revocation before exposing
   recording/session content. Advertise during capture only after coexistence and
   throughput acceptance; current diagnostic advertising behavior is insufficient.
3. **Explicit local-network connection.** Request browser permission only after
   Connect. Probe only the selected known private address with bounded timeout,
   schema/identity validation and visible retry. Establish device-side origin
   allowlist plus pairing authorization in a separate ADR before enabling hosted
   CORS. Never wildcard-enable mutable routes; Basic web/provider credentials
   must never be sent to the device. Reject redirects, URL credentials, public
   addresses and mismatched device identity. No Vercel server proxy to private IPs.
4. **Optional transfer as a later task.** Detection alone is not receipt/sync.
   After explicit import/receive action, reuse WEB-025 committed-prefix metadata,
   hashes and WEB-006 completion/stitching rules; durable browser queue first,
   independent transcription after. Retain originals and fail honestly on gaps.
   Choose a local bridge/native service only through its own approved stack task
   if browser limitations warrant it; none is selected by this plan.

## Acceptance and failure matrix

| Case | Expected result |
| --- | --- |
| First visit | No permission prompt, LAN scan, microphone, upload or erasure |
| Connect / chooser cancelled or denied | Clear disconnected state and fallback |
| Unsupported browser/API | Address/device-console/file-import fallback |
| Known selected device / identity matches | Connected badge; no automatic recording/transfer |
| Address points to another service/device | Refuse identity/schema mismatch |
| Echo AP without internet | Device connection may work; processing waits honestly |
| USB tethering supplies internet | Device and provider status independently evaluated |
| Device resets, IP changes, permission revoked | Disconnect; bounded reconnect to selected identity only |
| Capture active / long session | No diagnostic advertising assumptions; test radio/capture continuity |
| Malicious/disallowed origin | CORS/pairing refuses recording/control/deletion access |

Run native acceptance on Chrome/Mac with Echo AP plus USB tethering, and Safari
Mac/iPhone 13 Pro Max fallback behavior; add supported Android browser testing if
used. Verify permission denial/revocation, reload, device reboot, unrelated private
host, loss of internet/Wi-Fi, current firmware capture coexistence and no hidden
external writes. Synthetic mocks do not certify browser permission/hardware paths.

## Decisions still needed before implementation

Device possession/pairing approval and revocation, stable ID persistence, permitted
hosted origins, minimal read-only identity fields, advertising during recording,
foreground reconnect behavior and supported-browser matrix. These are scoped
choices for the implementation ADR, not a silent vendor/authentication/hosting
selection. Production authentication/provider keys and network provisioning stay
outside this plan.
