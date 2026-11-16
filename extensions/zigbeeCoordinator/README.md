# Zigbee coordinator for the Seeed XIAO ESP32-C6

A standalone Zigbee Coordinator (ZC) that runs on the C6's own 802.15.4 radio.
It forms its own Zigbee network, tracks devices as they join, drives them over
ZCL, and bridges them into netsocket over MQTT. Everything is also driveable
from a plain text command protocol on the USB port, so nothing about the radio
is hidden behind the bridge.

This replaces Zigbee2MQTT's job for these devices: netsocket sees the same
discovery dialect it already ingests, and off-the-shelf Zigbee outlets, switches
and sensors land in the same **Settings -> Smart Home** inbox as the bespoke
ESP32-C3 firmware.

```
Zigbee outlet ──802.15.4──▶ ESP32-C6 (coordinator) ──USB CDC──▶ you (line protocol)
                                      │
                                      └──WiFi / MQTT──▶ netsocket (discovery + state + commands)
```

## Why ESP-IDF and not Arduino

- The official PlatformIO `platform = espressif32` ships **ESP-IDF 4.4.6**, which
  predates the ESP32-C6 and has no 802.15.4 support at all.
- The Arduino `Zigbee` library defines `esp_zb_app_signal_handler` itself, so an
  application cannot observe `DEVICE_ANNCE` - the signal that tells a coordinator
  which IEEE address just joined as which short address. That is the core of what
  this firmware does.
- This project therefore uses the community **pioarduino** platform
  (`55.03.312-1`: ESP-IDF 5.5.5) and the official **esp-zigbee-sdk 2.1.0**
  (`espressif/esp-zigbee-lib`, prebuilt per chip). It is still a normal
  `pio run` PlatformIO project.

## Zigbee in one page

- The **coordinator** forms a network: a PAN ID on a channel between 11 and 26.
  Its own short address is always `0x0000`.
- Every device has a permanent **IEEE address** (64-bit MAC) and a temporary
  **short (NWK) address** that the coordinator assigns when it joins, e.g.
  `0x9c3a`. This firmware treats the IEEE address as identity and the short
  address as a routing handle that may change on every rejoin.
- A device exposes **endpoints** (1-240). An endpoint holds **clusters**
  (`0x0006` On/Off, `0x0008` Level, `0x0702` Metering, `0x0B04` Electrical
  measurement, `0x0000` Basic). A cluster holds **attributes** (On/Off state is
  attribute `0x0000` of cluster `0x0006`).
- **Control** = ZCL commands (On/Off/Toggle, MoveToLevel). **Reading** = ZCL
  attribute reads. **Devices pushing updates** = `Configure Reporting`, which
  this firmware sends automatically after a device joins, plus a binding so
  reports come back to our endpoint.

## Hardware

- Seeed **XIAO ESP32-C6** (4 MB flash). Other C6 boards work too: change
  `board` in `platformio.ini` and review the RF-switch block in `src/main.c`.
- Connect the board with **one USB-C cable**. The XIAO has no UART bridge chip,
  so the console and the command protocol both live on the C6's native
  USB-Serial-JTAG port.
- **RF switch:** the board gates its antenna behind GPIO3 (enable) and GPIO14
  (onboard ceramic vs external u.FL). `src/main.c` drives GPIO3 high and GPIO14
  low at boot. If you use the external antenna connector, set
  `XIAO_RF_USE_EXTERNAL_ANTENNA` to 1. Leaving these pins alone is the most
  common reason the radio appears dead on this board.
- Wi-Fi and 802.15.4 share the one radio. Coexistence is enabled in
  `sdkconfig.defaults`; expect occasional latency, not failure.

## Build, flash, monitor

```powershell
# pio is not on PATH on this machine; use the bundled binary
$pio = "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe"

& $pio run                       # compile
& $pio run -t upload             # flash
& $pio device monitor -b 115200  # see boot log + command prompt
```

The first build downloads ESP-IDF 5.5.5, the RISC-V toolchain and the Zigbee
library (~10 minutes); later builds are ~10-20 s.

`tools/zbterm.ps1` is a dependency-free interactive serial terminal if the
PlatformIO monitor is not what you want:

```powershell
powershell -ExecutionPolicy Bypass -File tools/zbterm.ps1 -Port COM7
```

## First run and pairing your outlet

1. Flash and open the monitor. On a factory-new device the firmware forms a
   network, prints `EVT network formed ...`, and automatically opens the network
   for joining for 180 seconds.
2. Factory-reset the outlet (usually hold its button ~5-10 s until the LED
   blinks; it must not still be paired to another hub).
3. The outlet joins. You get:

   ```
   EVT join nwk=0x9c3a ieee=00:12:4b:00:22:43:a1:b7 type=router
   EVT interviewed nwk=0x9c3a ... model=ZBMicro onoff=1 level=0 power=1 energy=1
   ```

4. `dev list` now shows it with a local index (1), and you can drive it:

   ```
   on 1
   OK on=1
   off 1
   OK on=0
   ```

If the join window closed, reopen it: `net permit 180`. `net permit off` closes
it early (recommended once your devices are paired).

## Command protocol

Newline-terminated ASCII, one command per line, 115200 baud. Hex accepts `0x`.
Lines longer than 255 characters are truncated.

Reply shape:

| prefix | meaning |
|---|---|
| `OK ...` | command completed; payload on the same line |
| `ERR ...` | command rejected or the device did not answer |
| `INFO ...` | detail line belonging to the previous command (state, descriptors) |
| `DEV ...` | one line per device from `dev list` |
| `EVT ...` | unsolicited event: join, leave, report, permit, network |

### Selecting a device

Anywhere a device is expected, all of these work:

| form | example |
|---|---|
| local index (from `dev list`, 1-based) | `3` |
| short (NWK) address | `0x9c3a` |
| IEEE address | `ieee:00124b002243a1b7` |
| label set with `dev rename` | `toaster` |

### Command reference

| command | what it does |
|---|---|
| `help [command]` | list commands or explain one |
| `status` | coordinator + network + WiFi + MQTT state in one line |
| `net info` | PAN ID, channel, short address, extended PAN ID, our IEEE |
| `net form [channel]` | form a network (11-26, default from settings) |
| `net permit <seconds>` / `net permit off` | open/close joining |
| `net reset` | erase Zigbee network state and reboot |
| `dev list` | every known device (`DEV` lines) |
| `dev info <sel>` | label, manufacturer, model, endpoints + clusters |
| `dev desc <sel> [ep]` | live ZDO simple descriptor query |
| `dev interview <sel>` | re-run endpoint/cluster discovery + reporting setup |
| `dev remove <sel>` | tell the device to leave and drop it locally |
| `dev rename <sel> <name>` | local label, used by the selector and as the MQTT name |
| `ping <sel>` | link quality from the neighbour table |
| `on <sel> [ep]` / `off` / `toggle` | On/Off cluster, then reads the attribute back |
| `level <sel> <0-254> [ep]` | Level control MoveToLevel |
| `identify <sel> [seconds]` | ask the device to blink |
| `read <sel> <ep> <cluster> <attr>[,<attr>...]` | ZCL read; updates the cached state |
| `write <sel> <ep> <cluster> <attr> <type> <value>` | ZCL write |
| `report <sel> <ep> <cluster> <attr> <min> <max>` | Configure Reporting (seconds) |
| `bind <sel> <ep> <cluster>` | install a binding from the device to us |
| `wifi set <ssid> <pass>` / `wifi status` / `wifi clear` | Wi-Fi for the bridge |
| `mqtt set <host> [port] [user] [pass]` / `mqtt status` | broker settings |
| `bridge on` / `bridge off` | enable/disable MQTT publishing |
| `log <0-4>` | ESP log verbosity |
| `save` | persist settings and the device table |
| `reboot` | restart |
| `factory` | wipe settings + Zigbee network + device table, reboot |

Attribute types for `write`: `bool`, `u8`, `u16`, `u24`, `u32`, `s8`, `s16`,
`s32`, `enum8`, `enum16`, `string`, `octstr`, or a raw numeric ZCL type id.

Examples that do real work:

```
net permit 180                       # pair a new device
read 1 1 0x0006 0x0000               # OK 0x0000=1
read 1 1 0x0b04 0x050b               # active power in W
write 1 1 0x0006 0x0000 bool 1       # switch on via a raw attribute write
report 1 1 0x0006 0x0000 0 300       # ask for state reports every 5 min
dev rename 1 kettle                  # then: on kettle
```

## MQTT bridge into netsocket

The bridge speaks the same dialect as `firmware/esp32c3`, so netsocket's
existing parser and inbox work unchanged.

- Node id: `zb-<16 hex IEEE>` (e.g. `zb-00124b002243a1b7`). IEEE-based on
  purpose: the operator's approval survives NWK address changes.
- Discovery: `homeassistant/<component>/<node>/<object>/config`, retained.
  Objects are `<ep>-onoff`, `<ep>-power`, `<ep>-energy`.
- State: `netsocket/dev/<node>/<object>/state`, retained (`ON`/`OFF`, or a
  number for `power` in W and `energy` in kWh).
- Commands: `netsocket/dev/<node>/<object>/set` accepts `ON`, `OFF`, `TOGGLE`
  (level-capable devices also accept a number on `<ep>-level/set`).
- Availability: `netsocket/dev/<node>/availability`, `online`/`offline`.

Flow: the device joins -> the coordinator interviews it and publishes retained
discovery -> it appears as **Pending approval** in Settings -> Smart Home ->
approve it and set a name/room -> Device Command / Device Event nodes can drive
it.

A device is only exposed when it actually implements the cluster: an outlet with
On/Off gets a `switch`, and only outlets that answer on `0x0B04`/`0x0702` get
power/energy sensors.

### Provisioning the bridge

Once, over the serial port:

```
wifi set "teapot" "your-password"
mqtt set 192.168.1.101 1883
bridge on
```

`mqtt set` takes `-` as a placeholder to clear the user/password fields:
`mqtt set 192.168.1.101 1883 - -`. Settings are stored in NVS and survive
reboots. `status` shows `wifi=connected mqtt=connected` when the bridge is up.

## Channel planning

Zigbee channels 11-26 overlap 2.4 GHz Wi-Fi. The default here is **channel 20**
(away from the usual Wi-Fi 1/6/11). Change it with `net form <channel>` on a
factory-new device, or set it before first boot. Keep at least ~5 channels
between your access point's channel and the Zigbee channel if you see dropped
reports.

## Troubleshooting

| symptom | cause / fix |
|---|---|
| No serial output at all | The console must be USB-Serial-JTAG (it is, in `sdkconfig.defaults`). Check you are on the XIAO's USB-C port, not a header pin. |
| Network forms but nothing joins | Join window closed (`net permit 180`) or the outlet is still paired to another hub (factory reset it). |
| Device answers reads but reports never arrive | Some devices ignore Configure Reporting without a binding; run `bind <sel> <ep> <cluster>`. |
| `on` works, `read` times out | The device is asleep or out of range; `ping <sel>` shows the neighbour entry. |
| Boot loops or NVS errors | `factory` from the console, or erase flash: `pio run -t erase`. |
| `pio` refuses the pioarduino platform | It requires PlatformIO Core >= 6.2.0. A `6.2.0.post1` build is treated as older by PlatformIO's semver check; reinstall with `pip install --force-reinstall --no-deps platformio==6.2.0`. |

## Verification status

`pio run` builds the full firmware cleanly (ESP-IDF 5.5.5, esp-zigbee-lib
2.1.0, ~1.3 MB image, no compiler warnings), and
`tests/zigbeeCoordinatorContract.test.js` round-trips the exact discovery/state
payloads this firmware emits through the real server parser, store and command
resolver.

The radio path itself has **not** been exercised on hardware from this
repository: flashing, pairing a real outlet and observing reports needs the
board on a bench. Everything above the antenna is verified.

## Layout

| file | role |
|---|---|
| `src/main.c` | boot order, RF switch, WiFi start |
| `src/zb_coordinator.c` | stack lifecycle, formation, join/leave signals, interview |
| `src/zb_devices.c` | IEEE/NWK registry, endpoints/clusters, cached state, NVS table |
| `src/zb_zcl.c` | blocking ZCL/ZDO request helpers and response formatting |
| `src/cli.c` | the command protocol |
| `src/wifi_bridge.c` | Wi-Fi station with backoff |
| `src/mqtt_bridge.c` | discovery/state/command bridge |
| `src/config.c` | NVS settings |
| `partitions.csv` | 64 KB NVS (WiFi + Zigbee datasets + our tables), 1.5 MB app |
| `tools/zbterm.ps1` | dependency-free serial terminal |
