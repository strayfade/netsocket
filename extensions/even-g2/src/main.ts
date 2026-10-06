// netsocket G2 companion: recent Alerts + Aria chat on a 576x288
// canvas with a tab-bar header (logo far-left, one pill per tab).
//
// Input map (no touch positions on the G2 — taps carry no coordinates):
// - swipe up/down at tab level = switch tab (focus moves WITH the tab)
// - tap = next item (lists) / next page (detail) / refresh (status)
// - long-press = open detail / ask prompt / retry / reconnect
// - double-tap = back, or the system exit dialog at tab level

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
  CreateStartUpPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import './style.css'
import { applyUrlConfig, encodeSideloadUrl, loadConfig, saveConfig, type G2Config } from './config'
import { getOrCreateDeviceId, NetsocketLink, type LinkStatus } from './net/netsocket'
import { getPhoneFix } from './net/location'
import { fetchProviders, sendPromptStream, type AriaProvider } from './net/aria'
import { TILES, TILE_W, TILE_H, quantizeFrame, sliceTiles, canvasToPngBytes, bytesEqual, FRAME_W, FRAME_H } from './image/tiles'
import { drawFrameBase, connIconFrame, drawTabBar } from './ui/chrome'
import { loadFonts } from './ui/font'
import { drawAlerts, drawAria, drawStatus, paginateReply } from './ui/views'
import { TABS, initialState, markAllSeen, unreadCount, type AlertItem, type AppState } from './state/store'

const READY_MARKER = '[netsocket-g2] ready'

let cfg: G2Config = saveAndReturn(applyUrlConfig(loadConfig()))
function saveAndReturn(c: G2Config): G2Config {
  saveConfig(c)
  return c
}

const state: AppState = initialState()
const frameCanvas = document.createElement('canvas')
frameCanvas.width = FRAME_W
frameCanvas.height = FRAME_H
const link = new NetsocketLink()

function renderCanvas(): void {
  const ctx = frameCanvas.getContext('2d')
  if (!ctx) return
  // Pixel font: no smoothing on blits, alphabetic baselines everywhere so
  // the 23px line boxes (18px ascent + 5px descent) stay on integer pixels.
  ctx.imageSmoothingEnabled = false
  ctx.textBaseline = 'alphabetic'
  drawFrameBase(ctx)
  if (state.tab === 'status') drawStatus(ctx, state, cfg)
  else if (state.tab === 'alerts') drawAlerts(ctx, state, cfg)
  else drawAria(ctx, state, cfg)
  drawTabBar(ctx, state)
  quantizeFrame(frameCanvas, cfg.threshold)
  updateMirrorStatus()
}

// --- Glasses tile push (one frame at a time, dirty tiles skipped) ---
//
// The firmware lights each tile as its `updateImageRawData` lands — there
// is no present/flush/vsync API, so a 4-tile frame is never atomic on the
// glass. Two rules keep the tear window as small as the protocol allows
// (docs: "No concurrent image sends", paced at 100ms, one frame >> 100ms
// over BLE):
// 1. Sends are strictly sequential (`await` each call, never parallel).
// 2. Only one frame is ever in flight. A `render()` that lands mid-push
//    sets `pushNeeded` and the in-flight frame aborts its remaining tiles
//    so the loop can re-slice the *latest* canvas — tiles from two
//    generations never interleave on the link.

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>
let bridge: Bridge | null = null
const lastTileBytes: (Uint8Array | null)[] = TILES.map(() => null)
let pushInFlight = false
let pushNeeded = false

async function pushCurrentFrame(): Promise<void> {
  const b = bridge
  if (!b) return
  const tileCanvases = sliceTiles(frameCanvas)
  const allBytes = await Promise.all(tileCanvases.map((c) => canvasToPngBytes(c)))
  for (let i = 0; i < allBytes.length; i++) {
    // A newer render() queued while we were encoding/sending — stop
    // lighting stale tiles; the loop below re-slices the latest frame.
    if (pushNeeded) break
    const bytes = allBytes[i]
    const prev = lastTileBytes[i]
    if (prev && bytesEqual(prev, bytes)) continue
    try {
      const result = await b.updateImageRawData(
        new ImageRawDataUpdate({
          containerID: TILES[i].id,
          containerName: TILES[i].name,
          imageData: bytes,
        }),
      )
      if (result !== 'success') {
        console.error(`updateImageRawData ${TILES[i].name}:`, result)
      } else {
        lastTileBytes[i] = bytes
      }
    } catch (err) {
      console.error('pushTile:', err)
    }
  }
}

async function schedulePush(): Promise<void> {
  if (!bridge) return
  if (pushInFlight) {
    pushNeeded = true
    return
  }
  pushInFlight = true
  try {
    do {
      pushNeeded = false
      await pushCurrentFrame()
    } while (pushNeeded)
  } finally {
    pushInFlight = false
  }
}

function render(): void {
  renderCanvas()
  void schedulePush().catch((err) => console.error('push:', err))
}

// --- netsocket link ---

function applyLinkStatus(s: LinkStatus): void {
  state.conn = s.state
  state.connDetail = s.detail
  render()
  // Link just came up on the Status tab with nothing (fresh) to show.
  if (s.state === 'approved' && state.tab === 'status' && statusNeedsRefresh()) {
    void refreshStatus()
  }
}

function setAlerts(list: AlertItem[]): void {
  state.alerts = list.slice(0, 50)
  state.alertsFocus = Math.max(0, Math.min(state.alertsFocus, state.alerts.length - 1))
  if (state.alertDetail !== null && state.alertDetail >= state.alerts.length) {
    state.alertDetail = null
    state.detailPage = 0
  }
  state.lastRefresh = Date.now()
}

async function refreshAlerts(): Promise<void> {
  if (link.getStatus().state === 'idle') return
  try {
    const list = await link.requestAlerts(50)
    setAlerts(list)
    if (state.tab === 'alerts' && state.alertDetail === null) markAllSeen(state)
  } catch (err) {
    state.connDetail = err instanceof Error ? err.message : 'refresh failed'
  }
  render()
}

// Re-fetch Status if the snapshot is missing or older than this.
const STATUS_STALE_MS = 5 * 60 * 1000

function statusNeedsRefresh(): boolean {
  return (
    link.getStatus().state === 'approved' &&
    !state.statusBusy &&
    (!state.status || Date.now() - state.statusFetchedAt > STATUS_STALE_MS)
  )
}

async function refreshStatus(): Promise<void> {
  if (link.getStatus().state !== 'approved' || state.statusBusy) return
  state.statusBusy = true
  if (state.tab === 'status') render()
  try {
    // Phone fix first (rounded to ~1km inside getPhoneFix), manual mirror
    // override second (simulator / denied permission), placeholder last.
    const fix = await getPhoneFix(bridge)
    let lat: number | null = fix?.lat ?? null
    let lon: number | null = fix?.lon ?? null
    if ((lat === null || lon === null) && cfg.wxLat && cfg.wxLon) {
      lat = Number(cfg.wxLat)
      lon = Number(cfg.wxLon)
    }
    const snap = await link.requestStatus(lat, lon, cfg.wxUnit)
    if (snap) {
      state.status = snap
      state.statusFetchedAt = Date.now()
    }
  } catch {
    // Keep the old snapshot (footer shows the stale marker); nothing to do.
  } finally {
    state.statusBusy = false
    render()
  }
}

function onOverlay(alert: AlertItem): void {
  setAlerts([alert, ...state.alerts])
  if (state.tab === 'alerts' && state.alertDetail === null) markAllSeen(state)
  render()
}

// --- Aria ---

let ariaAbort: AbortController | null = null
let lastStreamRender = 0

async function askAria(promptIndex: number): Promise<void> {
  const prompt = cfg.prompts[promptIndex]
  if (!prompt) return
  ariaAbort?.abort()
  ariaAbort = new AbortController()
  const ticket = ariaAbort
  state.ariaAsking = true
  state.ariaStreaming = true
  state.ariaError = ''
  state.ariaPages = []
  state.ariaPage = 0
  render()
  try {
    await sendPromptStream(
      cfg,
      prompt,
      (fullText) => {
        // Deltas arrive faster than BLE can push tiles — throttle UI
        // updates to ~4/sec and follow the tail while streaming.
        state.ariaPages = paginateReply(fullText)
        state.ariaPage = state.ariaPages.length - 1
        const now = Date.now()
        if (now - lastStreamRender > 250) {
          lastStreamRender = now
          render()
        }
      },
      ticket.signal,
    )
    state.ariaPage = state.ariaPages.length - 1
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'aria failed'
    if (msg !== 'cancelled') state.ariaError = msg
  } finally {
    if (ariaAbort === ticket) ariaAbort = null
    state.ariaAsking = false
    state.ariaStreaming = false
    render()
  }
}

// --- Input ---

function nextTab(): void {
  ariaAbort?.abort()
  state.ariaStreaming = false
  const i = TABS.indexOf(state.tab)
  state.tab = TABS[(i + 1) % TABS.length]
  state.alertDetail = null
  state.detailPage = 0
  if (state.tab === 'alerts') markAllSeen(state)
  render()
  // Entering Status with a missing/stale snapshot pulls a fresh one.
  if (state.tab === 'status' && statusNeedsRefresh()) {
    void refreshStatus()
  }
}

function inDetail(): boolean {
  return (
    state.alertDetail !== null ||
    state.ariaPages.length > 0 ||
    state.ariaAsking ||
    state.ariaError !== ''
  )
}

function detailPageCount(): number {
  if (state.alertDetail !== null) {
    const item = state.alerts[state.alertDetail]
    return item ? paginateReply(item.text).length : 1
  }
  return Math.max(1, state.ariaPages.length)
}

function bumpDetailPage(dir: 1 | -1): void {
  if (state.ariaStreaming) return
  const count = detailPageCount()
  if (state.alertDetail !== null) {
    state.detailPage = (state.detailPage + dir + count) % count
  } else {
    state.ariaPage = (state.ariaPage + dir + count) % count
  }
  render()
}

function closeDetail(): void {
  ariaAbort?.abort()
  state.ariaStreaming = false
  state.alertDetail = null
  state.detailPage = 0
  state.ariaPages = []
  state.ariaPage = 0
  state.ariaAsking = false
  state.ariaError = ''
  render()
}

function moveFocus(dir: 1 | -1): void {
  if (state.tab === 'alerts' && state.alerts.length > 0) {
    state.alertsFocus = (state.alertsFocus + dir + state.alerts.length) % state.alerts.length
    render()
    return
  }
  if (state.tab === 'aria' && cfg.prompts.length > 0) {
    state.ariaFocus = (state.ariaFocus + dir + cfg.prompts.length) % cfg.prompts.length
    render()
  }
}

function handleTap(): void {
  // Main action per page. During a live stream taps are ignored so the
  // reply isn't dismissed mid-sentence; back out with tab-cycle instead.
  if (state.ariaAsking || state.ariaStreaming) return
  if (inDetail()) {
    closeDetail()
    return
  }
  if (state.tab === 'status') {
    void refreshAlerts()
    void refreshStatus()
    return
  }
  if (state.tab === 'alerts') {
    if (state.alerts.length > 0) {
      state.alertDetail = state.alertsFocus
      state.detailPage = 0
      markAllSeen(state)
      render()
    }
    return
  }
  void askAria(state.ariaFocus)
}

// --- Bridge boot ---

async function initBridge(): Promise<void> {
  const b = await waitForEvenAppBridge()
  bridge = b
  const eventLayer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: FRAME_W,
    height: FRAME_H,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 0,
    containerID: 1,
    containerName: 'eventLayer',
    content: ' ',
    isEventCapture: 1,
  })
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
  const created = await b.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 1 + tiles.length,
      textObject: [eventLayer],
      imageObject: tiles,
    }),
  )
  if (created !== 0) {
    console.error('createStartUpPageContainer failed:', created)
    return
  }
  render()

  // CLICK_EVENT is 0 and protobuf omits zero-value fields, so a tap
  // arrives as an envelope with NO eventType field. Resolve the default
  // INSIDE each envelope check, never as
  // `event.sysEvent?.eventType ?? CLICK_EVENT`.
  function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
    if (!envelope) return null
    return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
  }

  let cleanedUp = false
  const unsubscribe = b.onEvenHubEvent((event) => {
    const sysType = eventTypeOf(event.sysEvent)
    const textType = eventTypeOf(event.textEvent)
    const isDouble =
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT || textType === OsEventTypeList.DOUBLE_CLICK_EVENT
    const isLong =
      sysType === OsEventTypeList.LONG_PRESS_EVENT || textType === OsEventTypeList.LONG_PRESS_EVENT

    if (isDouble || isLong) {
      nextTab()
      return
    }
    if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
      if (inDetail()) bumpDetailPage(-1)
      else moveFocus(-1)
      return
    }
    if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      if (inDetail()) bumpDetailPage(1)
      else moveFocus(1)
      return
    }
    if (sysType === OsEventTypeList.CLICK_EVENT || textType === OsEventTypeList.CLICK_EVENT) {
      handleTap()
      return
    }
    if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      if (!cleanedUp) {
        cleanedUp = true
        unsubscribe()
      }
    }
  })
  window.addEventListener('beforeunload', () => {
    if (!cleanedUp) {
      cleanedUp = true
      unsubscribe()
    }
  })
}

// --- Browser mirror + settings (debug/config surface, not shown on glass) ---

function field(id: string, label: string, type: string, value: string, placeholder: string): string {
  return `<label>${label}<input id="${id}" type="${type}" value="${value.replace(/"/g, '&quot;')}" placeholder="${placeholder}" /></label>`
}

function buildBrowserMirror(): void {
  const el = document.querySelector<HTMLDivElement>('#browser-mirror')
  if (!el) return
  el.innerHTML =
    `<h1>netsocket G2</h1>` +
    `<p class="sub">Live canvas — this exact bitmap is pushed to the glasses</p>`
  frameCanvas.className = 'frame'
  el.appendChild(frameCanvas)
  const status = document.createElement('p')
  status.className = 'status'
  status.id = 'mirror-status'
  el.appendChild(status)

  const settings = document.createElement('div')
  settings.className = 'settings'
  settings.innerHTML =
    `<h2>Display</h2>` +
    `<label>black point <span id="set-threshold-val">${cfg.threshold}%</span>` +
    `<input id="set-threshold" type="range" min="0" max="100" step="1" value="${cfg.threshold}" /></label>` +
    `<p class="sub">Pixels at/below this brightness go black; the rest spread across the display's 16 green levels. Raise it when dim fringes blow out to bright green.</p>` +
    `<label>selection radius <span id="set-radius-val">${cfg.selectionRadius}px</span></label>` +
    `<div class="btnrow"><button id="set-radius-down" type="button">- 1px</button><button id="set-radius-up" type="button">+ 1px</button></div>` +
    `<p class="sub">Rounded corners on the prompt selection box, in canvas pixels (0 = sharp). Updates the glasses live.</p>` +
    `<h2>Connection</h2>` +
    field('set-host', 'netsocket host', 'text', cfg.host, '192.168.1.50') +
    field('set-port', 'port (blank = default)', 'text', cfg.port, '') +
    `<label class="row"><input id="set-https" type="checkbox" ${cfg.useHttps ? 'checked' : ''} /> use https/wss</label>` +
    field('set-device', 'device name', 'text', cfg.deviceName, 'G2 glasses') +
    `<p class="devid">device id: <code id="mirror-device">${state.deviceId}</code><br/>approve it in netsocket dashboard → Settings → Devices</p>` +
    `<h2>Aria</h2>` +
    field('set-aria-url', 'aria endpoint', 'text', cfg.ariaEndpoint, 'http://192.168.1.101:3000') +
    field('set-aria-key', 'aria api key', 'password', cfg.ariaKey, 'aria_…') +
    `<label>provider<select id="set-provider"></select></label>` +
    `<label>model<select id="set-model"></select></label>` +
    field('set-model-custom', 'model id (manual)', 'text', cfg.model, 'used when the provider list is unreachable') +
    `<label>preset<select id="set-preset"><option value="short">short</option><option value="ping">ping</option></select></label>` +
    `<div class="btnrow"><button id="set-load-models" type="button">Load providers</button></div>` +
    `<p class="sub" id="mirror-models"></p>` +
    `<h2>Weather (Status tab)</h2>` +
    `<p class="sub">Primary source is your phone's location (one-shot, city-level, asked once per refresh). These fields are the fallback for denied permission, the simulator, and this mirror page.</p>` +
    field('set-wx-place', 'place label', 'text', cfg.wxPlace, 'Seattle') +
    field('set-wx-lat', 'latitude override (blank = phone)', 'text', cfg.wxLat, '47.61') +
    field('set-wx-lon', 'longitude override (blank = phone)', 'text', cfg.wxLon, '-122.33') +
    `<label>unit<select id="set-wx-unit"><option value="f">F</option><option value="c">C</option></select></label>` +
    `<h2>Prompts (one per line)</h2>` +
    `<textarea id="set-prompts" rows="4">${cfg.prompts.join('\n').replace(/</g, '&lt;')}</textarea>` +
    `<div class="btnrow"><button id="set-save" type="button">Save + reconnect</button>` +
    `<button id="set-qr" type="button">Copy sideload link</button></div>` +
    `<input id="set-link" type="text" readonly />` +
    `<p class="hint">On the glasses: scan the sideload link with the Even app (<code>npx evenhub qr --url "…"</code>). The glasses read <code>?cfg=</code> on boot — no typing needed.</p>`
  el.appendChild(settings)

  const get = (id: string): HTMLInputElement | null => document.querySelector(`#${id}`)
  const preset = document.querySelector<HTMLSelectElement>('#set-preset')
  if (preset) preset.value = cfg.preset
  const wxUnit = document.querySelector<HTMLSelectElement>('#set-wx-unit')
  if (wxUnit) wxUnit.value = cfg.wxUnit

  // Threshold slider: live-update the glasses as you drag.
  const thresholdInput = document.querySelector<HTMLInputElement>('#set-threshold')
  const thresholdVal = document.querySelector('#set-threshold-val')
  thresholdInput?.addEventListener('input', () => {
    cfg.threshold = Math.max(0, Math.min(100, Number(thresholdInput.value) || 0))
    if (thresholdVal) thresholdVal.textContent = `${cfg.threshold}%`
    saveConfig(cfg)
    render()
  })

  // Radius stepper: live-update the glasses per press.
  const radiusVal = document.querySelector('#set-radius-val')
  const paintRadius = () => {
    if (radiusVal) radiusVal.textContent = `${cfg.selectionRadius}px`
  }
  document.querySelector('#set-radius-down')?.addEventListener('click', () => {
    cfg.selectionRadius = Math.max(0, cfg.selectionRadius - 1)
    saveConfig(cfg)
    paintRadius()
    render()
  })
  document.querySelector('#set-radius-up')?.addEventListener('click', () => {
    cfg.selectionRadius = Math.min(23, cfg.selectionRadius + 1)
    saveConfig(cfg)
    paintRadius()
    render()
  })

  // Provider/model dropdowns fed by Load providers — exact IDs, no typos.
  const providerSelect = document.querySelector<HTMLSelectElement>('#set-provider')
  const modelSelect = document.querySelector<HTMLSelectElement>('#set-model')
  const modelCustom = get('set-model-custom')
  let providerCache: AriaProvider[] = []

  const setOptions = (sel: HTMLSelectElement | null, options: { value: string; label: string }[], current: string) => {
    if (!sel) return
    sel.innerHTML = ''
    const seen = new Set<string>()
    for (const o of options) {
      if (seen.has(o.value)) continue
      seen.add(o.value)
      const el = document.createElement('option')
      el.value = o.value
      el.textContent = o.label
      sel.appendChild(el)
    }
    if (current && !seen.has(current)) {
      const el = document.createElement('option')
      el.value = current
      el.textContent = `${current} (saved)`
      sel.appendChild(el)
    }
    if (current) sel.value = current
  }

  const syncModels = () => {
    const p = providerCache.find((x) => x.id === providerSelect?.value)
    const models = p?.models ?? []
    if (modelSelect) modelSelect.style.display = models.length > 0 ? '' : 'none'
    if (modelCustom) {
      modelCustom.style.display = models.length > 0 ? 'none' : ''
      const label = modelCustom.closest('label')
      if (label) label.style.display = models.length > 0 ? 'none' : ''
    }
    setOptions(
      modelSelect,
      models.map((m) => ({ value: m.id, label: m.id })),
      cfg.model,
    )
    const out = document.querySelector('#mirror-models')
    if (out && p && models.length === 0) {
      out.textContent = p.modelError ? `model list failed: ${p.modelError} — type the id manually` : 'no models listed — type the id manually'
    }
  }

  setOptions(providerSelect, [], cfg.providerId)
  setOptions(modelSelect, [], cfg.model)
  providerSelect?.addEventListener('change', () => {
    cfg.providerId = providerSelect.value
    syncModels()
  })

  document.querySelector('#set-save')?.addEventListener('click', () => {
    cfg = {
      threshold: thresholdInput ? Math.max(0, Math.min(100, Number(thresholdInput.value) || 0)) : cfg.threshold,
      selectionRadius: cfg.selectionRadius,
      host: get('set-host')?.value ?? '',
      port: get('set-port')?.value ?? '',
      useHttps: get('set-https')?.checked ?? true,
      deviceName: get('set-device')?.value ?? 'G2 glasses',
      ariaEndpoint: get('set-aria-url')?.value ?? '',
      ariaKey: get('set-aria-key')?.value ?? '',
      providerId: providerSelect?.value ?? '',
      model: modelSelect && modelSelect.style.display !== 'none' ? modelSelect.value : (get('set-model-custom')?.value ?? ''),
      preset: preset?.value === 'ping' ? 'ping' : 'short',
      wxLat: get('set-wx-lat')?.value ?? '',
      wxLon: get('set-wx-lon')?.value ?? '',
      wxPlace: get('set-wx-place')?.value ?? '',
      wxUnit: wxUnit?.value === 'c' ? 'c' : 'f',
      prompts: (document.querySelector<HTMLTextAreaElement>('#set-prompts')?.value ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    saveConfig(cfg)
    state.deviceName = cfg.deviceName
    link.reconnect(cfg)
    render()
  })
  document.querySelector('#set-qr')?.addEventListener('click', async () => {
    const linkInput = get('set-link')
    if (!linkInput) return
    linkInput.value = encodeSideloadUrl(cfg)
    try {
      await navigator.clipboard.writeText(linkInput.value)
    } catch {
      linkInput.select()
    }
  })
  document.querySelector('#set-load-models')?.addEventListener('click', async () => {
    const out = document.querySelector('#mirror-models')
    const probe: G2Config = {
      ...cfg,
      ariaEndpoint: get('set-aria-url')?.value ?? '',
      ariaKey: get('set-aria-key')?.value ?? '',
    }
    if (out) out.textContent = 'loading…'
    try {
      const providers = await fetchProviders(probe)
      providerCache = providers
      setOptions(
        providerSelect,
        providers.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })),
        cfg.providerId || providers.find((p) => p.isDefault)?.id || providers[0]?.id || '',
      )
      if (providerSelect) cfg.providerId = providerSelect.value
      syncModels()
      if (out && providerCache.find((p) => p.id === providerSelect?.value)?.models?.length) {
        out.textContent = 'providers loaded — pick from the dropdowns, then Save + reconnect'
      }
    } catch (err) {
      if (out) out.textContent = err instanceof Error ? err.message : 'failed'
    }
  })
  updateMirrorStatus()
}

function updateMirrorStatus(): void {
  const el = document.querySelector('#mirror-status')
  if (!el) return
  const unread = unreadCount(state)
  const wx = state.status?.weather
    ? ` · wx:${state.status.weather.temp}${state.status.weather.unit.toUpperCase()} ${state.status.weather.label}`
    : state.statusBusy
      ? ' · wx:updating'
      : ' · wx:-'
  el.textContent =
    `${state.tab.toUpperCase()} · net:${state.conn} · alerts:${state.alerts.length}${unread > 0 ? ` (${unread} new)` : ''}${wx} · ${state.connDetail}`
}

// --- Boot ---

function main(): void {
  state.deviceId = getOrCreateDeviceId()
  state.deviceName = cfg.deviceName
  buildBrowserMirror()
  renderCanvas()
  // sfPixel arrives async; re-render so the frame picks it up.
  void loadFonts().then(() => render())
  // Header clock: re-render on minute rollover only. Unchanged tiles are
  // skipped by the dirty check, so idle ticks cost no BLE. While the link
  // is waiting (pending/connecting) the header shows a three-dot
  // animation, and while Aria is asking the Aria tab shows the same dots
  // centered — so tick fast enough to advance their ~2fps frames.
  let lastClockMinute = new Date().getMinutes()
  let lastWaitingFrame = connIconFrame(state.conn, Date.now())
  let lastDotFrame = Math.floor(Date.now() / 500) % 3
  window.setInterval(() => {
    const now = Date.now()
    const m = new Date(now).getMinutes()
    let dirty = false
    if (m !== lastClockMinute) {
      lastClockMinute = m
      dirty = true
    }
    const frame = connIconFrame(state.conn, now)
    if (state.conn === 'pending' || state.conn === 'connecting') {
      if (frame !== lastWaitingFrame) dirty = true
    }
    lastWaitingFrame = frame
    const dotFrame = Math.floor(now / 500) % 3
    if (state.ariaAsking && state.tab === 'aria') {
      if (dotFrame !== lastDotFrame) dirty = true
    }
    lastDotFrame = dotFrame
    if (dirty) render()
  }, 250)
  link.setHandlers(applyLinkStatus, onOverlay)
  link.start(cfg)
  // Bridge first, then containers + events. initBridge never rejects
  // into boot: mirror + link work standalone for settings.
  initBridge()
    .then(() => {
      console.log(`${READY_MARKER} tab=${state.tab}`)
      return refreshAlerts()
    })
    .then(() => refreshStatus())
    .catch((err) => console.error('netsocket-g2 boot failed:', err))
}

main()
