// Tab content renderers. All type goes through the image path (the
// firmware text containers have one fixed font), drawn here into the
// fullscreen canvas below the tab bar header. All text uses the pixel-native size
// (92/3 px → 23px line boxes) with integer baselines on a 26px rhythm.

import type { G2Config } from '../config'
import { FRAME_H, FRAME_W } from '../image/tiles'
import { type AppState } from '../state/store'
import { TABBAR_H, WHITE, drawCenteredWaitingDots } from './chrome'
import { paintMaterialIcon, statusWeatherLigature } from './icons'
import {
  BODY_FONT,
  DETAIL_FONT,
  LINE_STEP,
  ellipsis,
  formatClock,
  paginate,
  pixelText,
  pixelTextCenter,
  pixelTextRight,
  wrapText,
} from './text'

const CONTENT_W = FRAME_W - 18
// Header occupies TABBAR_H px at the top — content starts below it,
// preserving the same 261px content height the footer layout had.
const LIST_TOP = 10 + TABBAR_H
// 23px line boxes (18px ascent + 5px descent) on a 26px rhythm. Row pitch
// 48 fits two 23px boxes exactly (46px) plus a 2px inter-row gap; the focus
// rect covers the 46px so both lines stay inside the highlight.
const ROW_H = 48
const ROW_TEXT_H = 46
const VISIBLE_ROWS = 5
const DETAIL_PER_PAGE = 8
// First detail baseline: line-box top sits 2px below the content top
// (which starts below the header).
const DETAIL_TOP = 20 + TABBAR_H

/** Single centered line in the content area below the header. Baseline sits
 * +6.5px below center so the 23px line box (18px ascent + 5px descent) is
 * visually centered. */
function drawCenteredMessage(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.fillStyle = WHITE
  ctx.font = BODY_FONT
  ctx.textAlign = 'center'
  const centerY = TABBAR_H + (FRAME_H - TABBAR_H) / 2
  pixelTextCenter(ctx, text, FRAME_W / 2, Math.round(centerY + 6.5))
}

/** 1px selection border at integer pixels (no background fill, text stays white). */
function drawSelectBorder(ctx: CanvasRenderingContext2D, y: number, radius: number): void {
  const x = 6
  const w = FRAME_W - 12
  const h = ROW_TEXT_H
  const r = Math.max(0, Math.min(Math.floor(radius), Math.floor(h / 2)))
  if (r <= 0) {
    ctx.fillStyle = WHITE
    ctx.fillRect(x, y, w, 1)
    ctx.fillRect(x, y + h - 1, w, 1)
    ctx.fillRect(x, y, 1, h)
    ctx.fillRect(FRAME_W - 7, y, 1, h)
    return
  }
  // Rounded: 1px stroke inset by 0.5 keeps straight runs pixel-crisp;
  // corner arcs antialias and the 80% black point crushes their fringe.
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 1
  ctx.beginPath()
  const rr = (
    ctx as unknown as {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void
    }
  ).roundRect
  if (typeof rr === 'function') rr.call(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  else ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.stroke()
}

export function drawStatus(ctx: CanvasRenderingContext2D, state: AppState, cfg: G2Config): void {
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = WHITE
  ctx.textAlign = 'left'
  const r = Math.max(0, Math.min(Math.floor(cfg.selectionRadius), 23))
  // Hero (left) + strip (right). Bottom edges land at y=280, 8px above the frame.
  strokeCard(ctx, HERO_X, HERO_Y, HERO_W, HERO_H, r)
  drawHeroClock(ctx)
  ctx.fillRect(HERO_X + 14, HERO_Y + 53, HERO_W - 28, 1)
  if (state.status) {
    drawHeroWeather(ctx, state)
  } else if (state.statusBusy) {
    drawCenteredWaitingDots(ctx, Date.now())
  } else {
    drawHeroPlaceholder(ctx, state)
  }
  drawStrip(ctx, state, cfg, r)
}

// --- STATUS: hero + strip -------------------------------------------
// Hero (left, 344x245): clock/date up top, weather filling the rest — the
// glanceable core. Strip (right, 4x 212x55): alerts, link, Aria, home. All
// containers are 1px bordered rounded rects (radius follows the
// selection-radius setting, default 4px); glyphs are Material Icons.

const HERO_X = 6
const HERO_Y = TABBAR_H + 8
const HERO_W = 344
const HERO_H = 245
const HERO_TX = HERO_X + 14
const HERO_TW = HERO_W - 28
const STRIP_X = 358
const STRIP_W = 212
const MINI_H = 55
const MINI_GAP = 8
// Weather block geometry (baselines, relative to HERO_Y).
const WX_TEMP_Y = 90
const WX_DETAIL_Y = 116

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDateShort(ts: number): string {
  const d = new Date(ts)
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`
}

/** 1px rounded-rect border at integer pixels (mirrors drawSelectBorder). */
function strokeCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(Math.floor(radius), Math.floor(h / 2)))
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 1
  ctx.beginPath()
  const rr = (
    ctx as unknown as {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void
    }
  ).roundRect
  if (r > 0 && typeof rr === 'function') rr.call(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r)
  else ctx.rect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.stroke()
}

/** Clock + date always render — they come from the device clock, no link needed. */
function drawHeroClock(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE
  paintMaterialIcon(ctx, 'schedule', HERO_TX, HERO_Y + 27, 22)
  ctx.font = BODY_FONT
  ctx.textAlign = 'left'
  pixelText(ctx, formatClock(Date.now()), HERO_TX + 28, HERO_Y + 34)
  pixelTextRight(ctx, formatDateShort(Date.now()), HERO_TX + HERO_TW, HERO_Y + 34)
}

/** 5x5 hollow ring used as a superscript degree mark. The pixel font is
 * ASCII-only, so no "°" (U+00B0) — it would fall back to another font and
 * throw the pen off the pixel grid. 1px bars via fillRect stay on-grid
 * through the quantize step. yTop is the ring's top pixel. */
function drawDegreeMark(ctx: CanvasRenderingContext2D, x: number, yTop: number): void {
  const px = Math.round(x)
  const py = Math.round(yTop)
  ctx.fillRect(px + 1, py, 3, 1)
  ctx.fillRect(px + 1, py + 4, 3, 1)
  ctx.fillRect(px, py + 1, 1, 3)
  ctx.fillRect(px + 4, py + 1, 1, 3)
}

/** Advance width of the degree mark including its side gaps. */
const DEGREE_ADVANCE = 9

function drawHeroWeather(ctx: CanvasRenderingContext2D, state: AppState): void {
  const w = state.status?.weather
  ctx.fillStyle = WHITE
  ctx.font = BODY_FONT
  ctx.textAlign = 'left'
  if (!w) {
    pixelText(ctx, ellipsis(ctx, 'Weather - set location', HERO_TW), HERO_TX, HERO_Y + WX_TEMP_Y)
    pixelText(ctx, 'Tap refreshes', HERO_TX, HERO_Y + WX_DETAIL_Y)
    return
  }
  paintMaterialIcon(ctx, statusWeatherLigature(w.code), HERO_TX, HERO_Y + WX_TEMP_Y - 7, 26)
  // Temperature + hand-drawn degree mark + label, e.g. "60° Clear", with the
  // low/high pair right-aligned on the same line as "45°/70°". Each mark is
  // painted between text runs: measure the number, stamp the ring as
  // superscript, then draw what follows it.
  const baseY = HERO_Y + WX_TEMP_Y
  const tempStr = `${w.temp}`
  const tempW = ctx.measureText(tempStr).width
  const lowStr = `${w.low}`
  const highStr = `${w.high}`
  const slashStr = '/ '
  const slashW = ctx.measureText(slashStr).width
  const rangeW =
    ctx.measureText(lowStr).width + DEGREE_ADVANCE + slashW + ctx.measureText(highStr).width + DEGREE_ADVANCE
  const GAP = 12
  const label = ellipsis(
    ctx,
    ` ${w.label}`,
    HERO_TW - 32 - Math.ceil(tempW) - DEGREE_ADVANCE - GAP - Math.ceil(rangeW),
  )
  const tx = HERO_TX + 32
  pixelText(ctx, tempStr, tx, baseY)
  drawDegreeMark(ctx, tx + tempW + 2, baseY - 16)
  pixelText(ctx, label, tx + tempW + 2 + DEGREE_ADVANCE, baseY)
  let rx = HERO_TX + HERO_TW - rangeW
  pixelText(ctx, lowStr, rx, baseY)
  rx += ctx.measureText(lowStr).width + 2
  drawDegreeMark(ctx, rx, baseY - 16)
  rx += DEGREE_ADVANCE
  pixelText(ctx, slashStr, rx, baseY)
  rx += slashW
  pixelText(ctx, highStr, rx, baseY)
  rx += ctx.measureText(highStr).width + 2
  drawDegreeMark(ctx, rx, baseY - 16)
  pixelText(
    ctx,
    ellipsis(ctx, `${w.precipPct}% Rain`, HERO_TW - 32),
    HERO_TX + 32,
    HERO_Y + WX_DETAIL_Y,
  )
}

function drawHeroPlaceholder(ctx: CanvasRenderingContext2D, state: AppState): void {
  ctx.fillStyle = WHITE
  ctx.font = BODY_FONT
  ctx.textAlign = 'left'
  const detail = state.connDetail || 'no link'
  pixelText(ctx, ellipsis(ctx, detail, HERO_TW), HERO_TX, HERO_Y + WX_TEMP_Y)
  const hint =
    state.conn === 'approved'
      ? 'Tap to load status'
      : state.conn === 'pending'
        ? 'Approve in dashboard, then tap'
        : state.conn === 'idle'
          ? 'Set host in mirror page'
          : 'Check settings, then tap'
  pixelText(ctx, ellipsis(ctx, hint, HERO_TW), HERO_TX, HERO_Y + WX_DETAIL_Y)
}

function stripValueFor(card: 'alerts' | 'link' | 'aria' | 'home', state: AppState, cfg: G2Config): string {
  if (card === 'alerts') {
    const unread = state.alerts.filter((a) => a.ts > state.alertsSeen).length
    if (state.alerts.length === 0) return 'Empty'
    return unread > 0 ? `${unread} new` : 'Clear'
  }
  if (card === 'link') {
    if (state.conn === 'approved') return 'Linked'
    if (state.conn === 'pending') return 'Approve...'
    if (state.conn === 'connecting') return '...'
    if (state.conn === 'denied') return 'Denied'
    if (state.conn === 'error') return 'Error'
    return 'No host'
  }
  if (card === 'aria') {
    if (!cfg.ariaEndpoint || !cfg.ariaKey) return 'Off'
    if (!cfg.providerId || !cfg.model) return 'No model'
    return 'Ready'
  }
  const home = state.status?.home
  if (!home) return 'No data'
  if (home.on <= 0) return 'All off'
  return `${home.on} of ${home.total} on`
}

function drawStrip(ctx: CanvasRenderingContext2D, state: AppState, cfg: G2Config, r: number): void {
  // fiber_manual_record's ink is a small dot next to its siblings, so it
  // runs a larger box to hold visual weight in the card.
  const cards = [
    { label: 'ALERTS', icon: 'fiber_manual_record', size: 30, ix: STRIP_X + 5, value: stripValueFor('alerts', state, cfg) },
    { label: 'LINK', icon: 'link', size: 22, ix: STRIP_X + 8, value: stripValueFor('link', state, cfg) },
    { label: 'ARIA', icon: 'wifi', size: 22, ix: STRIP_X + 8, value: stripValueFor('aria', state, cfg) },
    { label: 'HOME', icon: 'lightbulb', size: 22, ix: STRIP_X + 8, value: stripValueFor('home', state, cfg) },
  ] as const
  ctx.fillStyle = WHITE
  ctx.font = BODY_FONT
  ctx.textAlign = 'left'
  cards.forEach((card, i) => {
    const y = HERO_Y + i * (MINI_H + MINI_GAP)
    const h = i === cards.length - 1 ? HERO_Y + HERO_H - y : MINI_H
    strokeCard(ctx, STRIP_X, y, STRIP_W, h, r)
    paintMaterialIcon(ctx, card.icon, card.ix, y + Math.round(h / 2), card.size)
    const tx = STRIP_X + 39
    const tw = STRIP_W - 39 - 10
    pixelText(ctx, ellipsis(ctx, card.label, tw), tx, y + 24)
    pixelText(ctx, ellipsis(ctx, card.value, tw), tx, y + 48)
  })
}

export function drawAlerts(ctx: CanvasRenderingContext2D, state: AppState, cfg: G2Config): void {
  ctx.textBaseline = 'alphabetic'
  if (state.alertDetail !== null) {
    drawAlertDetail(ctx, state)
    return
  }
  if (state.alerts.length === 0) {
    drawCenteredMessage(ctx, 'No alerts yet!')
    return
  }
  // Keep focus pinned to the last page of rows.
  const start = Math.max(0, Math.min(state.alertsFocus - VISIBLE_ROWS + 1, state.alerts.length - VISIBLE_ROWS))
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    const idx = start + r
    if (idx >= state.alerts.length) break
    const item = state.alerts[idx]
    const y = LIST_TOP + r * ROW_H
    // Same row as the Aria prompts: border at y-4, single white line at
    // x=19/baseline y+25 with the 12-hour clock inline.
    if (idx === state.alertsFocus) drawSelectBorder(ctx, y - 4, cfg.selectionRadius)
    ctx.font = BODY_FONT
    ctx.fillStyle = WHITE
    ctx.textAlign = 'left'
    const single = item.text.split(/\s+/).filter(Boolean).join(' ')
    pixelText(ctx, ellipsis(ctx, `${formatClock(item.ts)} - ${single}`, CONTENT_W - 9), 19, y + 25)
  }
}

function drawAlertDetail(ctx: CanvasRenderingContext2D, state: AppState): void {
  const item = state.alerts[state.alertDetail ?? -1]
  if (!item) {
    return
  }
  const pages = paginate(item.text, DETAIL_FONT, CONTENT_W, DETAIL_PER_PAGE)
  const page = Math.max(0, Math.min(state.detailPage, pages.length - 1))
  ctx.font = DETAIL_FONT
  ctx.fillStyle = WHITE
  ctx.textAlign = 'left'
  pages[page].forEach((line, i) => {
    pixelText(ctx, line, 9, DETAIL_TOP + i * LINE_STEP)
  })
}

export function drawAria(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  cfg: G2Config,
): void {
  ctx.textBaseline = 'alphabetic'
  const configured = Boolean(cfg.ariaEndpoint && cfg.ariaKey && cfg.providerId && cfg.model)
  if (!configured) {
    drawCenteredMessage(ctx, 'Aria unavailable!')
    return
  }
  if (state.ariaPages.length > 0 || state.ariaAsking || state.ariaError) {
    drawAriaResponse(ctx, state)
    return
  }
  const prompts = cfg.prompts
  const start = Math.max(0, Math.min(state.ariaFocus - VISIBLE_ROWS + 1, prompts.length - VISIBLE_ROWS))
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    const idx = start + r
    if (idx >= prompts.length) break
    const y = LIST_TOP + r * ROW_H
    // Border selection: text always renders white-on-black (never inverted),
    // so glyph pixels never pass through the inverted quantize path.
    if (idx === state.ariaFocus) drawSelectBorder(ctx, y - 4, cfg.selectionRadius)
    ctx.font = BODY_FONT
    ctx.fillStyle = WHITE
    ctx.textAlign = 'left'
    // ">" not "▸" (U+25B8): not in the pixel font (ASCII + NBSP only) —
    // the fallback glyph's fractional advance threw every prompt off-grid.
    // Single 23px box in the 46px row, nudged 4px above center: top y+7.
    pixelText(ctx, ellipsis(ctx, prompts[idx], CONTENT_W - 9), 19, y + 25)
  }
}

function drawAriaResponse(ctx: CanvasRenderingContext2D, state: AppState): void {
  if (state.ariaAsking) {
    drawCenteredWaitingDots(ctx, Date.now())
    return
  }
  if (state.ariaError) {
    ctx.fillStyle = WHITE
    ctx.font = BODY_FONT
    ctx.textAlign = 'left'
    const lines = wrapText(ctx, state.ariaError, CONTENT_W)
    lines.slice(0, 6).forEach((line, i) => {
      pixelText(ctx, line, 9, DETAIL_TOP + i * LINE_STEP)
    })
    return
  }
  const pages = state.ariaPages
  const page = Math.max(0, Math.min(state.ariaPage, pages.length - 1))
  ctx.fillStyle = WHITE
  ctx.textAlign = 'left'
  const lines = pages[page] ?? []
  lines.forEach((line, i) => {
    pixelText(ctx, line, 9, DETAIL_TOP + i * LINE_STEP)
  })
}

/** Paginate a reply/detail body for storage in state (detail paging). */
export function paginateReply(text: string): string[][] {
  return paginate(text, DETAIL_FONT, CONTENT_W, DETAIL_PER_PAGE)
}
