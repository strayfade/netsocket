// Tab content renderers. All type goes through the image path (the
// firmware text containers have one fixed font), drawn here into the
// fullscreen canvas above the tab bar. All geometry at 75% scale.

import type { G2Config } from '../config'
import { FRAME_W } from '../image/tiles'
import { unreadCount, type AppState } from '../state/store'
import { WHITE } from './chrome'
import {
  ASKING_FONT,
  BODY_FONT,
  DETAIL_FONT,
  SMALL_FONT,
  STRONG_FONT,
  ellipsis,
  formatTime,
  paginate,
  wrapText,
} from './text'

const CONTENT_W = FRAME_W - 18
const LIST_TOP = 10
const ROW_H = 39
const VISIBLE_ROWS = 6
const DETAIL_PER_PAGE = 8
const DETAIL_TOP = 22

function drawListRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  focused: boolean,
  render: (fg: string, sub: string) => void,
): void {
  if (focused) {
    ctx.fillStyle = WHITE
    ctx.fillRect(6, y, FRAME_W - 12, ROW_H - 3)
    render('#000000', '#000000')
    } else {
    render(WHITE, WHITE)
  }
}

function connLabel(state: AppState): { light: string; text: string } {
  switch (state.conn) {
    case 'approved':
      return { light: WHITE, text: 'NET LINKED' }
    case 'pending':
      return { light: WHITE, text: 'NET WAITING FOR APPROVAL' }
    case 'connecting':
      return { light: WHITE, text: 'NET CONNECTING' }
    case 'denied':
      return { light: WHITE, text: 'NET DENIED' }
    case 'error':
      return { light: WHITE, text: 'NET ERROR' }
    default:
      return { light: WHITE, text: 'NET NOT CONFIGURED' }
  }
}

export function drawStatus(ctx: CanvasRenderingContext2D, state: AppState, cfg: G2Config): void {
  const { light, text } = connLabel(state)
  ctx.fillStyle = light
  ctx.fillRect(9, 20, 9, 9)
  ctx.fillStyle = WHITE
  ctx.font = STRONG_FONT
  ctx.textAlign = 'left'
  ctx.fillText(text, 24, 28)
  if ((state.conn === 'error' || state.conn === 'idle') && state.connDetail) {
    ctx.font = SMALL_FONT
    ctx.fillStyle = WHITE
    ctx.fillText(ellipsis(ctx, state.connDetail, CONTENT_W), 9, 48)
  }

  ctx.font = BODY_FONT
  ctx.fillStyle = WHITE
  const ariaSet = cfg.ariaEndpoint && cfg.ariaKey && cfg.providerId && cfg.model
  ctx.fillText(`ARIA ${ariaSet ? 'READY' : 'NOT SET'}`, 9, 78)
  ctx.fillText(`DEVICE ${state.deviceId.slice(0, 8) || '…'}`, 9, 104)
  const unread = unreadCount(state)
  ctx.fillText(`ALERTS ${state.alerts.length}${unread > 0 ? ` (${unread} NEW)` : ''}`, 9, 129)
}

export function drawAlerts(ctx: CanvasRenderingContext2D, state: AppState): void {
  if (state.alertDetail !== null) {
    drawAlertDetail(ctx, state)
    return
  }
  if (state.alerts.length === 0) {
    ctx.fillStyle = WHITE
    ctx.font = BODY_FONT
    ctx.textAlign = 'left'
    ctx.fillText('No alerts yet.', 9, 45)
    ctx.fillText('New ones arrive live.', 9, 68)
    return
  }
  // Keep focus pinned to the last page of rows.
  const start = Math.max(0, Math.min(state.alertsFocus - VISIBLE_ROWS + 1, state.alerts.length - VISIBLE_ROWS))
  for (let r = 0; r < VISIBLE_ROWS; r++) {
    const idx = start + r
    if (idx >= state.alerts.length) break
    const item = state.alerts[idx]
    const y = LIST_TOP + r * ROW_H
    drawListRow(ctx, y, idx === state.alertsFocus, (fg, sub) => {
      ctx.font = SMALL_FONT
      ctx.fillStyle = sub
      ctx.textAlign = 'left'
      ctx.fillText(formatTime(item.ts), 10, y + 15)
      ctx.font = BODY_FONT
      ctx.fillStyle = fg
      const lines = wrapText(ctx, item.text, CONTENT_W - 58)
      ctx.fillText(ellipsis(ctx, lines[0] ?? '', CONTENT_W - 58), 66, y + 15)
      if (lines[1]) ctx.fillText(ellipsis(ctx, lines[1], CONTENT_W - 58), 66, y + 31)
    })
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
    ctx.fillText(line, 9, DETAIL_TOP + i * 22)
  })
  ctx.font = SMALL_FONT
  ctx.fillStyle = WHITE
  ctx.textAlign = 'right'
  ctx.fillText(`${formatTime(item.ts)} · ${page + 1}/${pages.length}`, FRAME_W - 9, 16)
}

export function drawAria(
  ctx: CanvasRenderingContext2D,
  state: AppState,
  cfg: G2Config,
): void {
  const configured = Boolean(cfg.ariaEndpoint && cfg.ariaKey && cfg.providerId && cfg.model)
  if (!configured) {
    ctx.fillStyle = WHITE
    ctx.font = BODY_FONT
    ctx.textAlign = 'left'
    ctx.fillText('Set endpoint + key', 9, 45)
    ctx.fillText('in settings first.', 9, 68)
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
    drawListRow(ctx, y, idx === state.ariaFocus, (fg) => {
      ctx.font = BODY_FONT
      ctx.fillStyle = fg
      ctx.textAlign = 'left'
      ctx.fillText(ellipsis(ctx, `▸ ${prompts[idx]}`, CONTENT_W), 10, y + 24)
    })
  }
}

function drawAriaResponse(ctx: CanvasRenderingContext2D, state: AppState): void {
  if (state.ariaAsking) {
    ctx.fillStyle = WHITE
    ctx.font = ASKING_FONT
    ctx.textAlign = 'center'
    ctx.fillText('ASKING…', FRAME_W / 2, 90)
    return
  }
  if (state.ariaError) {
    ctx.fillStyle = WHITE
    ctx.font = BODY_FONT
    ctx.textAlign = 'left'
    const lines = wrapText(ctx, state.ariaError, CONTENT_W)
    lines.slice(0, 6).forEach((line, i) => {
      ctx.fillText(line, 9, DETAIL_TOP + i * 22)
    })
    return
  }
  const pages = state.ariaPages
  const page = Math.max(0, Math.min(state.ariaPage, pages.length - 1))
  ctx.fillStyle = WHITE
  ctx.textAlign = 'left'
  const lines = pages[page] ?? []
  lines.forEach((line, i) => {
    ctx.fillText(line, 9, DETAIL_TOP + i * 22)
  })
  ctx.font = SMALL_FONT
  ctx.fillStyle = WHITE
  ctx.textAlign = 'right'
  ctx.fillText(`${page + 1}/${pages.length}`, FRAME_W - 9, 16)
}

/** Paginate a reply/detail body for storage in state (detail paging). */
export function paginateReply(text: string): string[][] {
  return paginate(text, DETAIL_FONT, CONTENT_W, DETAIL_PER_PAGE)
}
