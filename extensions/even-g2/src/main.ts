import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import './style.css'
import {
  drawFrame,
  sliceTiles,
  canvasToPngBytes,
  bytesEqual,
  TILES,
  TILE_W,
  TILE_H,
} from './image/frame'

const READY_MARKER = '[even-g2-example] ready'

let count = 0
let brightness = 4 // 0-4; drives the frame's foreground level

const frameCanvas = document.createElement('canvas')

function buildBrowserMirror() {
  const el = document.querySelector<HTMLDivElement>('#browser-mirror')
  if (!el) return
  el.innerHTML =
    `<h1>Even G2 Example</h1>` +
    `<p class="sub">Live canvas — this exact bitmap is pushed to the glasses</p>`
  frameCanvas.className = 'frame'
  el.appendChild(frameCanvas)
  const status = document.createElement('p')
  status.className = 'status'
  status.id = 'mirror-status'
  el.appendChild(status)
  const hint = document.createElement('p')
  hint.className = 'hint'
  hint.innerHTML = `Simulator view: <code>evenhub-simulator http://localhost:5173</code>`
  el.appendChild(hint)
  updateMirrorStatus()
}

function updateMirrorStatus() {
  document.querySelector('#mirror-status')?.replaceChildren(
    document.createTextNode(`Taps:${count} · BRT ${brightness}`),
  )
}

async function main() {
  buildBrowserMirror()
  drawFrame(frameCanvas, { count, brightness })

  // Always await the bridge first. In the simulator this resolves
  // immediately; on hardware it waits for the WebView bridge.
  // Calls made before this silently no-op.
  const bridge = await waitForEvenAppBridge()

  // Image containers can't capture input, so a fullscreen invisible text
  // layer sits behind and catches taps/scrolls. Declaration order stacks:
  // eventLayer (back) -> tiles (front).
  const eventLayer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 0,
    containerID: 1,
    containerName: 'eventLayer',
    content: ' ',
    isEventCapture: 1,
  })

  // Fullscreen = 2x2 tiles (one image container tops out at 288x144).
  const tiles = TILES.map(
    (t) =>
      new ImageContainerProperty({
        xPosition: t.x,
        yPosition: t.y,
        width: TILE_W,
        height: TILE_H,
        containerID: t.id,
        containerName: t.name,
      }),
  )

  const created = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1 + tiles.length,
      textObject: [eventLayer],
      imageObject: tiles,
    }),
  )

  if (created !== 0) {
    // 1 = invalid params, 2 = oversize, 3 = out of memory
    console.error('createStartUpPageContainer failed:', created)
    return
  }

  // updateImageRawData must be serial — one in flight at a time.
  // Chain sends; a failure must not break the chain for the next tap.
  let rendering: Promise<unknown> = Promise.resolve()
  const lastTileBytes: (Uint8Array | null)[] = TILES.map(() => null)

  function pushTile(index: number, bytes: Uint8Array): void {
    rendering = rendering
      .then(async () => {
        const result = await bridge.updateImageRawData(
          new ImageRawDataUpdate({
            containerID: TILES[index].id,
            containerName: TILES[index].name,
            imageData: bytes,
          }),
        )
        if (result !== 'success') {
          console.error(`updateImageRawData ${TILES[index].name}:`, result)
        }
      })
      .catch((err) => console.error('pushTile:', err))
  }

  async function refreshGlasses(): Promise<void> {
    drawFrame(frameCanvas, { count, brightness })
    updateMirrorStatus()
    const tileCanvases = sliceTiles(frameCanvas)
    const allBytes = await Promise.all(tileCanvases.map((c) => canvasToPngBytes(c)))
    let pushed = 0
    allBytes.forEach((bytes, i) => {
      const prev = lastTileBytes[i]
      if (prev && bytesEqual(prev, bytes)) return // unchanged tile — skip
      lastTileBytes[i] = bytes
      pushTile(i, bytes)
      pushed += 1
    })
    await rendering
    console.log(`frame pushed ${pushed}/${TILES.length} tiles`)
  }

  try {
    await refreshGlasses()
  } catch (err) {
    console.error('initial frame failed:', err)
  }
  console.log(`${READY_MARKER} count=${count}`)

  // CLICK_EVENT is 0, and protobuf omits zero-value fields on the wire, so
  // a tap arrives as an envelope with NO eventType field. Resolve the
  // default INSIDE the envelope check — never as
  // `event.sysEvent?.eventType ?? CLICK_EVENT`, which reads CLICK on events
  // that carry no sysEvent at all. Taps/double-taps arrive on sysEvent,
  // scroll gestures on textEvent. Check DOUBLE_CLICK first, CLICK last.
  function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
    if (!envelope) return null
    return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
  }

  let cleanedUp = false
  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true
    unsubscribe()
  }

  const unsubscribe = bridge.onEvenHubEvent((event) => {
    const sysType = eventTypeOf(event.sysEvent)
    const textType = eventTypeOf(event.textEvent)

    if (
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      textType === OsEventTypeList.DOUBLE_CLICK_EVENT
    ) {
      // Mode 1 shows the system exit-confirmation dialog.
      // Required on the root page; silent exit (mode 0) is rejected in QA.
      void bridge.shutDownPageContainer(1)
      return
    }

    if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
      brightness = Math.min(4, brightness + 1)
      void refreshGlasses()
      return
    }

    if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      brightness = Math.max(0, brightness - 1)
      void refreshGlasses()
      return
    }

    if (
      sysType === OsEventTypeList.CLICK_EVENT ||
      textType === OsEventTypeList.CLICK_EVENT
    ) {
      count += 1
      void refreshGlasses()
      return
    }

    if (
      sysType === OsEventTypeList.SYSTEM_EXIT_EVENT ||
      sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT
    ) {
      cleanup()
    }
  })

  window.addEventListener('beforeunload', cleanup)
}

main().catch((err) => console.error('even-g2-example boot failed:', err))
