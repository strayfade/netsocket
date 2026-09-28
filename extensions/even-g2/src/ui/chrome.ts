// Shared frame chrome: content backdrop, tab bar footer with the app
// icon far-left, text-width tab cells, and a 12-hour clock far-right.
// Swipe moves focus WITH the tab — selected and active are always the
// same thing.

import { FRAME_W, FRAME_H } from '../image/tiles'
import { TABS, TAB_LABELS, unreadCount, type AppState } from '../state/store'
import { TAB_FONT_ACTIVE, TAB_FONT_IDLE, formatClock } from './text'

export const WHITE = '#ffffff'

export const TABBAR_Y = 261
const BAR_H = FRAME_H - TABBAR_Y

const ICON_X = 3
const ICON_SIZE = 21
const TABS_X = ICON_X + ICON_SIZE + 3
const TAB_GAP = 4
const TAB_PAD = 6
const CLOCK_X = FRAME_W - 6

let iconImg: HTMLImageElement | null = null

export function loadTabIcon(): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      iconImg = img
      resolve()
    }
    img.onerror = () => {
      console.warn('[netsocket-g2] tab icon failed to load:', img.src)
      resolve()
    }
    img.src = `${import.meta.env.BASE_URL}favicon.png`
  })
}

export function drawFrameBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, FRAME_W, FRAME_H)
  // 1px white border around the screen edge
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 1
  // Stroke inset by 0.5 to align crisp 1px lines
  ctx.strokeRect(0.5, 0.5, FRAME_W - 1, FRAME_H - 1)
}

export function drawTabBar(ctx: CanvasRenderingContext2D, state: AppState): void {
  if (iconImg) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(iconImg, ICON_X, TABBAR_Y + (BAR_H - ICON_SIZE) / 2, ICON_SIZE, ICON_SIZE)
    ctx.imageSmoothingEnabled = true
  }

  // Buttons hug their labels: text width + the bar's vertical padding.
  ctx.font = TAB_FONT_ACTIVE
  const widths = TABS.map((tab) => Math.ceil(ctx.measureText(TAB_LABELS[tab]).width) + TAB_PAD * 2)

  const unread = unreadCount(state)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let x = TABS_X
  TABS.forEach((tab, i) => {
    const w = widths[i]
    const active = state.tab === tab
  // Hide any top line above the footer bar
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, TABBAR_Y, FRAME_W, 1)
  ctx.fillStyle = WHITE
    ctx.font = active ? TAB_FONT_ACTIVE : TAB_FONT_IDLE
    ctx.fillText(TAB_LABELS[tab], x + w / 2, TABBAR_Y + BAR_H / 2 + 1)
    if (active) {
      ctx.fillRect(x + TAB_PAD + 3, TABBAR_Y + BAR_H - 3, w - (TAB_PAD * 2 + 6), 3)
    }
    if (tab === 'alerts' && unread > 0) {
      ctx.fillRect(x + w - 9, TABBAR_Y + BAR_H / 2 - 3, 6, 6)
    }
    x += w + TAB_GAP
  })

  ctx.fillStyle = WHITE
  ctx.font = TAB_FONT_IDLE
  ctx.textAlign = 'right'
  ctx.fillText(formatClock(Date.now()), CLOCK_X, TABBAR_Y + BAR_H / 2 + 1)
  ctx.textBaseline = 'alphabetic'
}
