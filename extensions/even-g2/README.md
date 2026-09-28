# Even G2 Example

Example app for the **Even Realities G2** using the Even Hub **SDK** + **simulator**.
Stack: Vite + TypeScript + `@evenrealities/even_hub_sdk`.

What it does (fullscreen image-rendered UI — custom typography path):

- Renders a canvas-drawn fullscreen frame (small letterspaced eyebrow, big bold counter, small hint) covering the whole 576×288 display
- Fullscreen = 2×2 grid of 288×144 image tiles (one image container tops out at 288×144); only dirty tiles are re-pushed via `updateImageRawData`
- Tap increments the counter and re-renders (sends are serialized, one in flight at a time)
- Swipe up/down adjusts brightness (frame foreground steps through greys)
- Double-tap shows the system exit dialog (`shutDownPageContainer(1)` — required on root pages for QA)
- A fullscreen invisible text layer sits behind the tiles and captures input (image containers can't); there is no status text strip — the canvas is the whole screen
- Logs `[even-g2-example] ready` for headless simulator automation

Verified against simulator 0.9.5: 5 containers accepted (1 text + 4 image), all 4 tiles pushed at boot, click re-renders, zero console errors.

## Prerequisites

- Node.js 18+ (`node --version`)
- Global tools (simulator + CLI):

```powershell
npm install -g @evenrealities/evenhub-simulator @evenrealities/evenhub-cli
evenhub-simulator --version
```

SDK versions pinned at scaffold time: SDK `0.0.16`, simulator `0.9.5`, CLI `0.1.14`.
Docs: https://hub.evenrealities.com/docs

## Run

```powershell
cd even-g2-example
npm install

# Terminal 1 — dev server
npm run dev

# Terminal 2 — simulator (point at dev URL)
npm run sim
# or: evenhub-simulator http://localhost:5173
# debug stream: npm run sim:debug
```

Expected on the green canvas — the frame fills the whole 576×288 screen:

```text
G 2   E X A M P L E              (small, letterspaced, top)
              0                  (big, bold, center)
TAP +1 · SWIPE BRT 4 · 2xTAP EXIT (small, bottom)
```

- Click canvas → counter increments (dirty tiles re-render)
- Swipe up/down → foreground brightness steps through greys
- Double-click → system exit-confirmation dialog
- Edit `src/image/frame.ts` → Vite hot-reloads into the simulator
- The browser page shows the live canvas — the exact bitmap pushed to the glasses

## Custom typography — how it works

Text containers use the firmware's single fixed font (no size/bold API), so styled type goes through the image path in `src/image/frame.ts`:

1. Draw text to a 576×288 `<canvas>` with normal CSS fonts (`800 150px system-ui`, letterspacing, grey hierarchy). 1× backing store on purpose — a fullscreen PNG is already ~8× the bytes of a 200×100 frame.
2. Slice into 4 quadrant tiles (288×144 each = the per-container max) and `canvas.toBlob('image/png')` → `Uint8Array` per tile
3. Push each tile with `bridge.updateImageRawData({ containerID, containerName, imageData })`, skipping tiles byte-identical to the last push
4. The SDK decodes + converts to 4-bit greyscale internally (PNG bytes are also simulator-safe)

Rules: one `updateImageRawData` in flight at a time (serialize sends); keep tiles ≤288×144 (`imageSizeInvalid` otherwise); watch for `imageToGray4Failed`/`sendFailed` results. Each tap pushes up to 4 tiles over BLE, so this path suits mostly-static screens, not animation.

> Simulator is layout/logic only, not a hardware emulator (font, timing, BLE quirks differ). Always validate on real glasses before shipping.

## Headless automation (simulator 0.7+)

```powershell
# Terminal 1
npm run dev

# Terminal 2 — control plane on :9898
npm run sim:auto

# Terminal 3 — smoke test (needs `pip install pillow`)
npm run sim:test
```

Useful endpoints: `GET /api/ping`, `GET /api/screenshot/glasses` (RGBA — test `alpha > 0`), `GET /api/console?since_id=N`, `POST /api/input {action: up|down|click|double_click|long_press|long_press_release|context_menu}`.

## On real glasses (QR sideload)

Phone + laptop on same LAN, Developer Mode enabled (sign in at hub.evenrealities.com, restart phone app).

```powershell
ipconfig | findstr /i "IPv4"
npx evenhub qr --url "http://<YOUR-LAN-IP>:5173"
```

Tap **Scan QR** in the Even Realities app → glasses render within a second. Hot-reload still works.

## Project layout

```text
even-g2-example/
├── src/main.ts            ← bridge + page + event handlers
├── src/image/frame.ts     ← canvas typography (drawFrame + PNG bytes)
├── src/style.css          ← browser mirror (shows the live canvas)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── app.json               ← Even Hub manifest (edit package_id/name for your app)
├── public/icon.png        ← 24×24 greyscale icon
└── scripts/test_simulator.py ← headless QA smoke test
```

`app.json` notes: `package_id` must be globally unique (reverse-DNS). `edition: "202601"`. `min_sdk_version` matches installed SDK (`npm list @evenrealities/even_hub_sdk`). For network access add `{"name":"network",...,"whitelist":[...]}`; for mic add `g2-microphone`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank canvas | Ensure `await waitForEvenAppBridge()` runs before any SDK call |
| Click does nothing | Exactly one container needs `isEventCapture: 1` (here: the invisible `eventLayer`); resolve `CLICK_EVENT` as the `undefined`-eventType default *inside* each envelope check (`sysEvent`/`textEvent` separately) |
| Text disappears on update | `containerID`/`containerName` in `TextContainerUpgrade` must match `createStartUpPageContainer` |
| `imageSizeInvalid` | Keep image tiles ≤288×144 (this app uses 4× 288×144 quadrants = fullscreen, the hardware max) |
| `imageToGray4Failed` | SDK-side PNG→greyscale conversion failed; simplify the frame (fewer gradients) |
| `Cannot find module ...even_hub_sdk` | `npm install` |
| QR scans, nothing loads | Same LAN, firewall allows Node, use LAN IP not localhost |

## Next steps

- Multi-page lists/detail → Display & UI System docs
- R1 ring / IMU / swipes → Device APIs docs
- Mic / storage → Device APIs; external fetch → Networking docs
- Ship → `evenhub pack app.json dist -o myapp.ehpk`, then Packaging & QA docs
