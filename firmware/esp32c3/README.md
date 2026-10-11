# ESP32-C3 reference firmware (netsocket smart home)

Bespoke WiFi devices that speak netsocket's MQTT contract. They advertise
themselves with retained Home Assistant discovery payloads, report retained
state, accept commands, and use a Last-Will availability topic. Pairing is
"power on, enter credentials in a captive portal, approve in the netsocket
Smart Home inbox".

Two reference builds share one codebase:

| Env | Device | Entity | Capabilities |
|-----|--------|--------|--------------|
| `switch` | relay + physical toggle | `relay0` | `switch_state`, `switch_set` |
| `button` | momentary button | `btn0` | `button_press` |

## Wire contract

Topics (device id is `c3-<12 hex of efuse MAC>`, lowercase):

```
netsocket/dev/<id>/availability          retained, LWT "offline" / "online"
netsocket/dev/<id>/<entity>/state        retained, e.g. "ON"/"OFF"
netsocket/dev/<id>/<entity>/set          commands in (QoS 1)
netsocket/dev/<id>/<entity>/event        transient events (buttons), not retained
homeassistant/<component>/<id>/<entity>/config   retained discovery
```

The discovery payload shapes are produced by `discoverySwitch()` /
`discoveryButton()` in `src/common/netsocket_device.cpp`. They are asserted
against the server parser in `tests/smarthomeFirmwareContract.test.js` — if you
change a key there, change `server/utils/mqttDiscovery.js` and the test too.

## Wiring

- **Switch:** relay/ MOSFET gate → GPIO4; physical toggle → GPIO5 to GND
  (uses `INPUT_PULLUP`), active low.
- **Button:** momentary → GPIO5 to GND (`INPUT_PULLUP`), active low.

Pick pins that are safe at boot on your board (avoid strapping pins). Power
from an AC source for wall switches.

## Build and flash

```sh
pio run -e switch            # compile
pio run -e switch -t upload  # flash (adjust board/port as needed)
pio device monitor -b 115200
```

Dependencies are pinned in `platformio.ini`: PubSubClient, ArduinoJson 7,
WiFiManager, ArduinoOTA.

## Pairing flow

1. Flash and power on. The device starts a captive portal AP named
   `NETSOCKET-XXXX` (XXXX = first four hex of its id).
2. Join it from a phone. Enter WiFi credentials **and** the broker host/port
   (plus optional username/password, room, and a friendly name). These are
   stored in NVS.
3. The device connects and publishes retained discovery. It appears in
   netsocket → Settings → **Smart Home** → *Pending approval*.
4. Approve it, set the room/name, and it becomes usable by Device Event /
   Device Command / Device Query / List Devices nodes. Graphs reference the
   stable `unique_id` (e.g. `c3-a4cf12ab34-relay0`), so renames never break
   automations.

Re-provisioning: hold a factory reset (or clear NVS) to reopen the portal.

## Notes and known gaps

- **Not compile-verified in this repo** (no Arduino toolchain here). Review
  against your board before flashing.
- TLS (8883) and per-device broker credentials are Phase 6; the portal
  currently takes host/port/user/pass over the LAN broker (anonymous by
  default in `mosquitto/mosquitto.conf`).
- The switch accepts `ON` / `OFF` / `TOGGLE`. Unknown payloads are ignored.
- OTA is included as a library but not yet wired into `setup()`.