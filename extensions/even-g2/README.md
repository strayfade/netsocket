# netsocket G2

Companion app for the **Even Realities G2**: recent **Alerts** from the
netsocket `Notifiers/Alert` node plus **Aria** chat, in a compact tabbed
layout for the 576×288 display. Stack: Vite + TypeScript + Even Hub SDK.

What it does:

- **Tab bar footer** — app icon far-left (uniform 4px padding),
  text-width square cells per tab (`STATUS` / `ALERTS` / `ARIA`), and a
  12-hour clock far-right. No titles, no hint strips, no rounded
  corners. Swipe moves focus *with* the tab; the highlight always
  mirrors the visible content. All type is light-weight Geist.
- **STATUS** — link state, Aria readiness, device ID, alert counts.
- **ALERTS** — recent alerts (broadcast + targeted at this device), live
  over the device WebSocket plus pull-to-refresh. Tap = next, long-press
  = open detail, swipe = page, double-tap = back.
- **ARIA** — canned prompts (the glasses have no keyboard) asked via
  `POST /api/v1/chat` (SSE `stream: true`, `short`/`ping` + `plaintext`,
  tool calls hidden). Replies stream into the view as deltas arrive
  (UI updates throttled to ~4/sec, following the tail); double-tap
  backs out and cancels. Long-press a prompt to ask.
- **Pairing** — same handshake as the Android app: a device ID is
  generated on first boot, `deviceHello`/`deviceAuth` over WebSocket
  (Ed25519 + X25519 via `@noble/curves`, AES-256-GCM session), then
  approve/deny in the netsocket dashboard → Settings → Devices.
  Server identity is pinned on first use (TOFU).
- Rendering reuses the proven fullscreen image path: 2×2 grid of
  288×144 tiles, dirty-tile skip, serialized `updateImageRawData`, one
  fullscreen invisible text layer for input. Double-tap at tab level
  shows the system exit dialog (`shutDownPageContainer(1)`).
- Logs `[netsocket-g2] ready` for headless simulator automation.

Verified against simulator 0.9.5: boot, swipe tab-switch, exit dialog,
zero console errors.

## Prerequisites

- Node.js 18+
- Global tools: `npm install -g @evenrealities/evenhub-simulator @evenrealities/evenhub-cli`
- A running netsocket host reachable from your LAN (for live alerts)
- Optional: an Aria host + API key (Settings → API Keys)

SDK versions pinned at scaffold time: SDK `0.0.16`, simulator `0.9.5`, CLI `0.1.14`.
Docs: https://hub.evenrealities.com/docs

## Run

```powershell
npm install

# Terminal 1 — dev server (note the port; 5173 may be taken)
npm run dev

# Terminal 2 — simulator (point at dev URL)
npm run sim
# or: evenhub-simulator http://localhost:5174
```

## Configure (mirror page)

Open the dev URL in a browser (phone or laptop). Below the live canvas:

1. **Display** — black-point slider. Frame pixels at/below this
   brightness go black, the rest map across the display's 16 green
   levels before tiles are pushed (canvas text is antialiased, so our
   own mapping beats the firmware's grey conversion — edges land on
   intermediate greens instead of melting to white). Drag it and watch
   the glasses update live. Saved with everything else, so it rides
   along in the sideload link.
2. **Connection** — netsocket host/port, https toggle, device name.
   The device ID is shown underneath; approve it in the netsocket
   dashboard → Settings → Devices.
3. **Aria** — endpoint (host root; a trailing `/api/v1` is stripped
   automatically), API key, provider + model (use *Load providers* to
   discover IDs), preset (`short` fits the display, `ping` is terser).
   The Aria host must serve CORS on `/api/v1/*` (added to Aria's
   `next.config.ts` — redeploy Aria after pulling) or the glasses get
   `failed to fetch` on preflight.
4. **Prompts** — one canned question per line; these are the only inputs
   the glasses can send.
5. **Save + reconnect**, then **Copy sideload link** — the link encodes
   everything in `?cfg=`, because the glasses WebView has no keyboard
   and shares no storage with your phone browser.

## On real glasses (QR sideload)

Phone + laptop on same LAN, Developer Mode enabled.

```powershell
ipconfig | findstr /i "IPv4"
npx evenhub qr --url "<paste sideload link with your LAN IP>"
```

Tap **Scan QR** in the Even Realities app → glasses render within a second.

## `app.json` notes

- `package_id` must be globally unique (reverse-DNS). `edition: "202601"`.
- `permissions` includes `network` with an **empty whitelist** (fail-closed).
  Before packing/sideloading against real hosts, add your netsocket and
  Aria hosts — otherwise WebSocket/fetch from the glasses is blocked.
- For mic/voice input later, add the `g2-microphone` permission.

## Headless automation

```powershell
npm run dev
npm run sim:auto   # control plane on :9898
npm run sim:test   # needs `pip install pillow`
```

Endpoints: `GET /api/ping`, `GET /api/screenshot/glasses`,
`GET /api/console?since_id=N`, `POST /api/input`. No Python here?
`node <tmp>/g2smoke.mjs`-style fetch scripts work too (byte-compare PNGs).

## Server side (netsocket core)

The glasses need alert *history*, but `Notifiers/Alert` is push-only, so
this repo's server gained (with `node:test` coverage in
`tests/alertHistory.test.js`):

- `server/utils/alert.js` — in-memory ring buffer (last 50, text capped
  at 2000 chars) + `getRecentAlerts(deviceId, limit)`. Broadcast and
  device-targeted entries are visible; conversation replies are excluded.
- `server/utils/deviceAuth.js` — new `getRecentAlerts` device purpose.
- `server/manager/alertApi.js` + dispatch case in `server/index.js` —
  approved-device-only WS handler replying `{ alerts }` newest-first
  (silent no-op otherwise, no auth oracle).

## Project layout

```text
extensions/even-g2/
├── src/main.ts            ← boot + input map + bridge/tile push + mirror UI
├── src/config.ts          ← settings schema, localStorage, ?cfg= sideload
├── src/state/store.ts     ← tabs, alerts, Aria reply pages, link state
├── src/crypto/device.ts   ← pairing crypto (noble curves + WebCrypto)
├── src/net/netsocket.ts   ← device WS client (hello/challenge/auth/ping)
├── src/net/aria.ts        ← Aria chat + model discovery
├── src/image/tiles.ts     ← 2x2 tile slicing + PNG bytes + dirty compare
├── src/ui/chrome.ts       ← frame base, tab bar, title, hint
├── src/ui/views.ts        ← status / alerts / Aria renderers
├── src/ui/text.ts         ← wrap, ellipsis, paginate, roundRect
├── src/style.css          ← browser mirror + settings form
├── app.json               ← Even Hub manifest (fill network whitelist!)
└── scripts/test_simulator.py ← headless QA smoke test
```

## Input map

| Gesture | Tab level | Detail level |
|---|---|---|
| Swipe up/down | Move selection | Previous/next page |
| Tap | Main action (refresh / open alert / send prompt) | Back (Aria: after a reply arrives) |
| Double-tap / long-press | Next tab (loops around) | Next tab (loops around) |

> Simulator is layout/logic only, not a hardware emulator (font, timing,
> BLE quirks differ). Always validate on real glasses before shipping.
