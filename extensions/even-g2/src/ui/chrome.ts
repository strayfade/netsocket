// Shared frame chrome: content backdrop, tab bar header with text-width
// tab cells flush-left, a 12-hour clock, and the netsocket link state
// far-right (linked mark / square-X disconnected / three-dot waiting).
// Swipe moves focus WITH the tab — selected and active are always the
// same thing.

import { FRAME_W, FRAME_H } from '../image/tiles'
import { TABS, TAB_LABELS, unreadCount, type AppState, type ConnState } from '../state/store'
import { TAB_FONT_ACTIVE, TAB_FONT_IDLE, formatClock, pixelTextCenter, pixelTextRight } from './text'

export const WHITE = '#ffffff'

export const TABBAR_Y = 0
export const TABBAR_H = 27
const BAR_H = TABBAR_H

// Tabs start flush at the left edge (x=0).
const TAB_GAP = 4
const TAB_PAD = 6

// 5x5 netsocket mark, rows top→bottom, '#' = white pixel. Rendered with
// integer-scaled fills (never drawImage) so every pixel stays on-grid
// through the quantize step. Scale is an integer multiple of the 5px art.
const NET_ICON_SCALE = 3
const NET_ICON_PX = 5 * NET_ICON_SCALE // 15
// Far right with the same 3px margin as the left app icon; the clock ends
// one gap to its left.
const NET_ICON_X = FRAME_W - 3 - NET_ICON_PX - 3
const NET_ICON_Y = TABBAR_Y + Math.floor((BAR_H - NET_ICON_PX) / 2) - 1
const CLOCK_X = NET_ICON_X - TAB_GAP
const NET_ICON: string[] = ['#####', '...##', '..#.#', '#...#', '##..#']

function drawNetIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE
  for (let r = 0; r < NET_ICON.length; r++) {
    const row = NET_ICON[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') {
        ctx.fillRect(
          NET_ICON_X + c * NET_ICON_SCALE,
          NET_ICON_Y + r * NET_ICON_SCALE,
          NET_ICON_SCALE,
          NET_ICON_SCALE,
        )
      }
    }
  }
}

// 5x5 square-X mark for the disconnected states (idle/denied/error):
// outer square with an X in the 3x3 interior. Same grid/scale as the
// linked mark so it swaps 1:1 in the header slot.
const DISCONNECTED_ICON: string[] = ['#####', '##.##', '#.#.#', '##.##', '#####']

function drawDisconnectedIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = WHITE
  for (let r = 0; r < DISCONNECTED_ICON.length; r++) {
    const row = DISCONNECTED_ICON[r]
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '#') {
        ctx.fillRect(
          NET_ICON_X + c * NET_ICON_SCALE,
          NET_ICON_Y + r * NET_ICON_SCALE,
          NET_ICON_SCALE,
          NET_ICON_SCALE,
        )
      }
    }
  }
}

// Three-dot "waiting" mark for pending/connecting. Frame cycles 1→2→3
// visible dots (~2fps via Date.now), so it animates even in 1-bit.
const DOT_PX = NET_ICON_SCALE // 3px dots on the same pixel grid
const DOT_GAP = NET_ICON_SCALE // 3px gaps: 3 dots span the 15px slot

function drawWaitingIcon(ctx: CanvasRenderingContext2D, now: number): void {
  const visible = (Math.floor(now / 500) % 3) + 1
  const y = NET_ICON_Y + Math.floor((NET_ICON_PX - DOT_PX) / 2)
  ctx.fillStyle = WHITE
  for (let i = 0; i < visible; i++) {
    ctx.fillRect(NET_ICON_X + i * (DOT_PX + DOT_GAP), y, DOT_PX, DOT_PX)
  }
}

export function connIconFrame(conn: ConnState, now: number): number {
  if (conn === 'pending' || conn === 'connecting') return Math.floor(now / 500) % 3
  return 0
}

// Centered three-dot loader for full-page states (e.g. Aria asking).
// Same 3px dots / 3px gaps as the header waiting mark, cycling 1→2→3
// (~2fps via Date.now). Dots grow left-to-right inside a fixed 15px slot
// centered in the content area below the header, so frames never jump.
export function drawCenteredWaitingDots(ctx: CanvasRenderingContext2D, now: number): void {
  const visible = (Math.floor(now / 500) % 3) + 1
  const totalW = 3 * DOT_PX + 2 * DOT_GAP
  const startX = Math.round(FRAME_W / 2 - totalW / 2)
  const contentTop = TABBAR_Y + BAR_H
  const centerY = contentTop + (FRAME_H - contentTop) / 2
  const y = Math.round(centerY - DOT_PX / 2)
  ctx.fillStyle = WHITE
  for (let i = 0; i < visible; i++) {
    ctx.fillRect(startX + i * (DOT_PX + DOT_GAP), y, DOT_PX, DOT_PX)
  }
}

function drawConnIcon(ctx: CanvasRenderingContext2D, conn: ConnState, now: number): void {
  if (conn === 'approved') {
    drawNetIcon(ctx)
  } else if (conn === 'pending' || conn === 'connecting') {
    drawWaitingIcon(ctx, now)
  } else {
    drawDisconnectedIcon(ctx)
  }
}

export function drawFrameBase(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, FRAME_W, FRAME_H)
}

export function drawTabBar(ctx: CanvasRenderingContext2D, state: AppState): void {
  // Buttons hug their labels: text width + the bar's vertical padding.
  ctx.font = TAB_FONT_ACTIVE
  const widths = TABS.map((tab) => Math.ceil(ctx.measureText(TAB_LABELS[tab]).width) + TAB_PAD * 2)

  // 23px line box (18px ascent + 5px descent) in the 27px bar: 2px pad top
  // and bottom keeps every glyph pixel on integers with an alphabetic
  // baseline (middle + fractional offsets would smear the pixel grid).
  const BASELINE_Y = TABBAR_Y + 20 // 20: box 2..25 inside bar 0..27
  const unread = unreadCount(state)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  drawConnIcon(ctx, state.conn, Date.now())
  let x = 6
  TABS.forEach((tab, i) => {
    const w = widths[i]
    const active = state.tab === tab
  // Hide any bottom line below the header bar
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, TABBAR_Y + BAR_H - 1, FRAME_W, 1)
  if (active) {
    ctx.fillStyle = WHITE
    ctx.beginPath()
    const rr = (
      ctx as unknown as {
        roundRect?: (x: number, y: number, w: number, h: number, r: number) => void
      }
    ).roundRect
    if (typeof rr === 'function') rr.call(ctx, x, TABBAR_Y, w, BAR_H - 1, 4)
    else ctx.rect(x, TABBAR_Y, w, BAR_H - 1)
    ctx.fill()
  }
  ctx.fillStyle = active ? '#000000' : WHITE
    ctx.font = active ? TAB_FONT_ACTIVE : TAB_FONT_IDLE
    pixelTextCenter(ctx, TAB_LABELS[tab], x + w / 2, BASELINE_Y)
    if (tab === 'alerts' && unread > 0) {
      ctx.fillStyle = active ? '#000000' : WHITE
      ctx.fillRect(Math.round(x + w - 9), Math.round(TABBAR_Y + BAR_H / 2 - 3), 6, 6)
    }
    x += w + TAB_GAP
  })

  ctx.fillStyle = WHITE
  ctx.font = TAB_FONT_IDLE
  ctx.textAlign = 'right'
  pixelTextRight(ctx, formatClock(Date.now()), CLOCK_X, BASELINE_Y)
  ctx.textBaseline = 'alphabetic'
}
