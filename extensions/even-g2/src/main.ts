// netsocket G2 companion: recent Alerts + Aria chat via native Even Hub
// text + list containers (no canvas, no image tiles).
//
// Layout: a one-line header strip (tabs + clock) plus one capturing body
// container per screen. Layout changes rebuild the page; content changes
// within a layout upgrade the text in place (flicker-free).
//
// Input map (taps carry no coordinates on the G2):
// - tap a list row = open alert / ask prompt
// - tap body text = back (status/empty screens: refresh instead)
// - swipe = firmware-native scroll (lists and overflowing text scroll)
// - double-tap / long-press = next tab (loops around)
// - tap-then-long-press = contextual menu (refresh, tab jumps)
// - double-tap at tab level also reaches the system exit dialog via menu;
//   shutDownPageContainer(1) stays available for the QA root-page rule.

import { OsEventTypeList, waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import './style.css'
import { applyUrlConfig, encodeSideloadUrl, loadConfig, saveConfig, type G2Config } from './config'
import { getOrCreateDeviceId, NetsocketLink, type LinkStatus } from './net/netsocket'
import { fetchProviders, sendPromptStream, type AriaProvider } from './net/aria'
import { loadFonts } from './ui/font'
import {
  MENU_ALERTS,
  MENU_ARIA,
  MENU_REFRESH,
  MENU_STATUS,
  ariaConfigured,
  ariaVisible,
  buildBodyUpgrade,
  buildCreate,
  buildHeaderUpgrade,
  buildRebuild,
  screenFor,
  type Screen,
} from './glasses/pages'
import { TABS, initialState, markAllSeen, unreadCount, type AlertItem, type AppState, type TabId } from './state/store'

const READY_MARKER = '[netsocket-g2] ready'

let cfg: G2Config = saveAndReturn(applyUrlConfig(loadConfig()))
function saveAndReturn(c: G2Config): G2Config {
  saveConfig(c)
  return c
}

const state: AppState = initialState()
const link = new NetsocketLink()

type Bridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>
let bridge: Bridge | null = null

// --- Render pipeline ---
//
// All bridge mutations go through one serialized chain (the firmware
// accepts no concurrent sends). Renders only record intent: a layout
// change enqueues a rebuild, a content change enqueues a text upgrade.
// `last*` is updated synchronously so rapid renders coalesce.

let chain: Promise<unknown> = Promise.resolve()
let lastLayout = ''
let lastHeader = ''
let lastBody = ''
let lastItems = ''
// Firmware-highlighted row of the current list (row 0 on a fresh list).
// Updated by indexed taps; a rebuild re-highlights row 0.
let listSel = 0

function enqueue(fn: () => Promise<unknown>): void {
  chain = chain.then(fn).catch((err) => console.error('bridge:', err))
}

function detailKey(): string {
  if (state.alertDetail !== null) return `alert${state.alertDetail}`
  if (ariaVisible(state)) return 'aria'
  return 'tab'
}

function render(): void {
  const now = Date.now()
  const screen = screenFor(state, cfg, now)
  renderMirror(screen)
  const b = bridge
  if (!b) return
  const key = `${screen.kind}|${state.tab}|${detailKey()}`
  if (key !== lastLayout) {
    lastLayout = key
    lastHeader = screen.header
    if (screen.kind === 'text') {
      lastBody = screen.body
      lastItems = ''
    } else {
      lastItems = screen.items.join('\n')
      lastBody = ''
      listSel = 0
    }
    enqueue(() =>
      b.rebuildPageContainer(buildRebuild(screen)).then((ok) => {
        if (!ok) console.error('rebuildPageContainer failed')
      }),
    )
    return
  }
  if (screen.header !== lastHeader) {
    lastHeader = screen.header
    const content = screen.header
    enqueue(() => b.textContainerUpgrade(buildHeaderUpgrade(content)))
  }
  if (screen.kind === 'text') {
    if (screen.body !== lastBody) {
      lastBody = screen.body
      const content = screen.body
      enqueue(() => b.textContainerUpgrade(buildBodyUpgrade(content)))
    }
  } else {
    const joined = screen.items.join('\n')
    if (joined !== lastItems) {
      // Lists have no in-place update — a changed list rebuilds the page.
      lastItems = joined
      lastHeader = screen.header
      listSel = 0
      enqueue(() =>
        b.rebuildPageContainer(buildRebuild(screen)).then((ok) => {
          if (!ok) console.error('rebuildPageContainer failed')
        }),
      )
    }
  }
}

// --- netsocket link ---

function applyLinkStatus(s: LinkStatus): void {
  state.conn = s.state
  state.connDetail = s.detail
  render()
}

function setAlerts(list: AlertItem[]): void {
  state.alerts = list.slice(0, 50)
  if (state.alertDetail !== null && state.alertDetail >= state.alerts.length) {
    state.alertDetail = null
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
  if (!prompt || !ariaConfigured(cfg)) return
  ariaAbort?.abort()
  ariaAbort = new AbortController()
  const ticket = ariaAbort
  state.ariaPrompt = prompt
  state.ariaAsking = true
  state.ariaStreaming = true
  state.ariaError = ''
  state.ariaText = ''
  render()
  try {
    await sendPromptStream(
      cfg,
      prompt,
      (fullText) => {
        // Deltas arrive faster than BLE drains — throttle upgrades to
        // ~4/sec. Overflow scrolls natively; the user follows the tail.
        state.ariaText = fullText
        const now = Date.now()
        if (now - lastStreamRender > 250) {
          lastStreamRender = now
          render()
        }
      },
      ticket.signal,
    )
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

function setTab(tab: TabId): void {
  ariaAbort?.abort()
  state.ariaStreaming = false
  state.tab = tab
  state.alertDetail = null
  listSel = 0
  if (tab === 'alerts') markAllSeen(state)
  render()
}

function nextTab(): void {
  const i = TABS.indexOf(state.tab)
  setTab(TABS[(i + 1) % TABS.length])
}

function inDetail(): boolean {
  return state.alertDetail !== null || ariaVisible(state)
}

function closeDetail(): void {
  ariaAbort?.abort()
  state.ariaStreaming = false
  state.alertDetail = null
  state.ariaPrompt = ''
  state.ariaAsking = false
  state.ariaError = ''
  state.ariaText = ''
  render()
}

function handleTap(listIndex: number | null): void {
  // Main action per screen. During a live stream taps are ignored so the
  // reply isn't dismissed mid-sentence; back out with tab-cycle instead.
  if (state.ariaAsking || state.ariaStreaming) return
  if (listIndex !== null) {
    if (state.tab === 'alerts' && state.alertDetail === null && state.alerts.length > 0) {
      if (listIndex >= 0 && listIndex < state.alerts.length) {
        state.alertDetail = listIndex
        markAllSeen(state)
        render()
      }
      return
    }
    if (state.tab === 'aria' && !ariaVisible(state)) {
      void askAria(listIndex)
      return
    }
    return
  }
  if (inDetail()) {
    closeDetail()
    return
  }
  // Tab-level text screens: tap refreshes.
  void refreshAlerts()
}

// --- Bridge boot ---

async function initBridge(): Promise<void> {
  const b = await waitForEvenAppBridge()
  bridge = b
  const screen = screenFor(state, cfg, Date.now())
  const created = await b.createStartUpPageContainer(buildCreate(screen))
  if (created !== 0) {
    console.error('createStartUpPageContainer failed:', created)
    return
  }
  lastLayout = `${screen.kind}|${state.tab}|${detailKey()}`
  lastHeader = screen.header
  if (screen.kind === 'text') lastBody = screen.body
  else lastItems = screen.items.join('\n')
  renderMirror(screen)

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
    const menuId = event.menuItemClickEvent?.itemID
    if (menuId !== undefined) {
      if (menuId === MENU_REFRESH) void refreshAlerts()
      else if (menuId === MENU_STATUS) setTab('status')
      else if (menuId === MENU_ALERTS) setTab('alerts')
      else if (menuId === MENU_ARIA) setTab('aria')
      return
    }

    const sysType = eventTypeOf(event.sysEvent)
    const textType = eventTypeOf(event.textEvent)
    const listType = eventTypeOf(event.listEvent)
    const isDouble =
      sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
      listType === OsEventTypeList.DOUBLE_CLICK_EVENT
    const isLong =
      sysType === OsEventTypeList.LONG_PRESS_EVENT ||
      textType === OsEventTypeList.LONG_PRESS_EVENT ||
      listType === OsEventTypeList.LONG_PRESS_EVENT

    if (isDouble || isLong) {
      nextTab()
      return
    }
    // Swipes scroll natively in firmware (lists and overflowing text) —
    // nothing to route here.
    const tapped =
      sysType === OsEventTypeList.CLICK_EVENT ||
      textType === OsEventTypeList.CLICK_EVENT ||
      listType === OsEventTypeList.CLICK_EVENT
    if (tapped) {
      // A tap on the firmware-highlighted row. Indexed taps name the row;
      // a bare tap confirms the current highlight, which the firmware
      // selects implicitly (row 0 on a fresh list) — track it locally.
      const rawIdx = event.listEvent?.currentSelectItemIndex
      if (typeof rawIdx === 'number') listSel = rawIdx
      handleTap(event.listEvent ? listSel : null)
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

/** Mirror the exact strings pushed to the glasses containers. */
function renderMirror(screen: Screen): void {
  const header = document.querySelector('#mirror-header')
  const body = document.querySelector('#mirror-body')
  if (header) header.textContent = screen.header
  if (body) {
    body.textContent = screen.kind === 'text' ? screen.body : screen.items.map((item, i) => `${i + 1}. ${item}`).join('\n')
  }
  updateMirrorStatus()
}

function buildBrowserMirror(): void {
  const el = document.querySelector<HTMLDivElement>('#browser-mirror')
  if (!el) return
  el.innerHTML =
    `<h1>netsocket G2</h1>` +
    `<p class="sub">Native UI preview — these strings are what the glasses render</p>` +
    `<div class="preview"><div class="preview-header" id="mirror-header"></div>` +
    `<div class="preview-body" id="mirror-body"></div></div>` +
    `<p class="status" id="mirror-status"></p>`

  const settings = document.createElement('div')
  settings.className = 'settings'
  settings.innerHTML =
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
      host: get('set-host')?.value ?? '',
      port: get('set-port')?.value ?? '',
      useHttps: get('set-https')?.checked ?? true,
      deviceName: get('set-device')?.value ?? 'G2 glasses',
      ariaEndpoint: get('set-aria-url')?.value ?? '',
      ariaKey: get('set-aria-key')?.value ?? '',
      providerId: providerSelect?.value ?? '',
      model: modelSelect && modelSelect.style.display !== 'none' ? modelSelect.value : (get('set-model-custom')?.value ?? ''),
      preset: preset?.value === 'ping' ? 'ping' : 'short',
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
  renderMirror(screenFor(state, cfg, Date.now()))
}

function updateMirrorStatus(): void {
  const el = document.querySelector('#mirror-status')
  if (!el) return
  const unread = unreadCount(state)
  el.textContent =
    `${state.tab.toUpperCase()} · net:${state.conn} · alerts:${state.alerts.length}${unread > 0 ? ` (${unread} new)` : ''} · ${state.connDetail}`
}

// --- Boot ---

function main(): void {
  state.deviceId = getOrCreateDeviceId()
  state.deviceName = cfg.deviceName
  buildBrowserMirror()
  renderMirror(screenFor(state, cfg, Date.now()))
  // Geist arrives async; the mirror picks it up once loaded.
  void loadFonts()
  // Header clock: re-render on minute rollover only. Unchanged content
  // is skipped by the last* diff, so idle ticks cost no BLE.
  let lastClockMinute = new Date().getMinutes()
  window.setInterval(() => {
    const m = new Date().getMinutes()
    if (m !== lastClockMinute) {
      lastClockMinute = m
      render()
    }
  }, 5000)
  link.setHandlers(applyLinkStatus, onOverlay)
  link.start(cfg)
  // Bridge first, then containers + events. initBridge never rejects
  // into boot: mirror + link work standalone for settings.
  initBridge()
    .then(() => {
      console.log(`${READY_MARKER} tab=${state.tab}`)
      return refreshAlerts()
    })
    .catch((err) => console.error('netsocket-g2 boot failed:', err))
}

main()
