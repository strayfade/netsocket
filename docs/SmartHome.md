# Smart Home (MQTT)

Netsocket treats MQTT + the Home Assistant discovery dialect as the single
device language. Bespoke ESP32-C3 devices and off-the-shelf Zigbee gear
(via Zigbee2MQTT) both speak it, so everything lands in one registry, one
pairing inbox, and one set of generic nodes. There is no Matter on the
device path and no per-vendor protocol.

## Topology

```
ESP32-C3 devices ─┐
                  ├─ MQTT ─► Mosquitto ─► netsocket (mqtt.js client)
Zigbee2MQTT ──────┘                        │  discovery parser → registry
                                           │  state/LWT cache
                                           └► 4 generic nodes + inbox UI
```

- `mosquitto` runs as a compose sidecar (`mosquitto/mosquitto.conf`).
- `zigbee2mqtt` is an optional compose profile (`docker compose --profile zigbee up -d`)
  for off-the-shelf Zigbee; it re-publishes devices as HA discovery.
- Netsocket connects with one `mqtt.js` client and subscribes to
  `<discoveryPrefix>/#` plus the configured state topics
  (`smarthome.mqtt.baseTopics`, default `netsocket/dev/#,zigbee2mqtt/#`).

## Configuration

Preferences → **Smart Home**:

| Key | Purpose |
|-----|---------|
| `smarthome.mqtt.url` | Broker URL (e.g. `mqtt://mosquitto:1883` in Docker, `mqtt://127.0.0.1:1883` for local dev). Empty disables the integration. |
| `smarthome.mqtt.username` / `.password` | Optional broker credentials. |
| `smarthome.mqtt.discoveryPrefix` | Discovery root (default `homeassistant`). |
| `smarthome.mqtt.baseTopics` | Comma-separated state topic filters. |

The client fails closed: a missing URL logs a warning and connects nothing.

## Device topics (bespoke devices)

```
netsocket/dev/<id>/availability          retained, LWT "offline" / "online"
netsocket/dev/<id>/<entity>/state        retained state
netsocket/dev/<id>/<entity>/set          commands in (QoS 1)
netsocket/dev/<id>/<entity>/event        transient events (buttons)
homeassistant/<component>/<id>/<entity>/config   retained discovery
```

`<id>` is the device identity (`device.identifiers[0]` in discovery) and is
stable across renames — graphs reference `unique_id`, never the friendly name.

## Registry and pairing

Discovery payloads are validated (must carry `unique_id`,
`device.identifiers[0]`, and a state topic) and ingested into
`DATA_DIR/smarthome.json` as **pending**. The dashboard
Settings → **Smart Home** tab shows a pairing inbox grouped by status; approve
and optionally set a friendly name and room. Approve/deny/revoke/rename/remove
are session-gated (`/v1/smarthome/*`); unknown ids return 404. Changes broadcast
over the editor socket as `smartHomeChanged`, and brand-new discoveries push live.

The same inbox serves Zigbee2MQTT devices, because they emit the same dialect.

## Nodes

Four generic nodes cover every device type (no per-device node code):

- **Smart Home/Device Event** — trigger on state or availability. Filter by
  `UniqueId`, `Capability`, or `Room` property (empty = any). Availability
  events carry no `uniqueId`, so id-filtered nodes ignore them.
- **Smart Home/Device Command** — preset commands validated per component
  (switch/light: On/Off/Toggle; cover: Open/Close/Stop) plus a Raw Payload mode.
- **Smart Home/Device Query** — cached state, availability, and device record.
- **Smart Home/List Devices** — registry snapshot filtered by status/room/capability.

Only **approved** devices dispatch events or accept commands.

## Bespoke firmware

See `firmware/esp32c3/README.md`. The discovery payload shapes the firmware
emits are asserted against the server parser in
`tests/smarthomeFirmwareContract.test.js`, so firmware/server drift fails CI.

## Known limitations (v1)

- Zigbee2MQTT entities often report JSON state (e.g. `{"state":"ON","brightness":120}`);
  netsocket stores the raw payload. Parse it with the JSON nodes when you need a
  field, or map only `state` for now.
- TLS (8883) and per-device broker ACLs are not wired yet; the default broker
  allows anonymous LAN access for bring-up.
- No offline command queue — commands fail cleanly when the broker is down.
- The firmware sketches are reference code and have not been compiled in this repo.