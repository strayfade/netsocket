// Native glasses UI for the netsocket G2 companion.
//
// The glasses composite a fixed 576x288 canvas from text and list
// containers placed by absolute pixel coordinates (no CSS, no DOM).
// Every screen here is a one-line header strip plus one body container
// (text or native list), with the shared contextual menu re-attached on
// every rebuild — omitting menuObject would clear it.
//
// Firmware limits enforced in this module (oversize pages are rejected):
// - text content: 1000 chars on create/rebuild, 2000 on upgrade.
//   Bodies are capped at 950 so the same string is valid on both paths.
// - list: 20 items max, 64 chars per item. Longer feeds are sliced.
// - menu: 10 items max, 32 UTF-8 bytes per label, IDs start at 1.
// - exactly one container per page carries isEventCapture: 1 (the body).

import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  MenuContainerProperty,
  MenuItemProperty,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
} from '@evenrealities/even_hub_sdk'
import type { G2Config } from '../config'
import { TAB_LABELS, TABS, unreadCount, type AlertItem, type AppState, type TabId } from '../state/store'

export const HEADER_ID = 1
export const HEADER_NAME = 'header'
export const BODY_ID = 2
export const BODY_TEXT_NAME = 'body'
export const BODY_LIST_NAME = 'list'

const HEADER_H = 30
const BODY_Y = 32
const BODY_H = 288 - BODY_Y

/** Bodies stay valid for both create (1000) and upgrade (2000) paths. */
const MAX_BODY_CHARS = 950
const MAX_LIST_ITEMS = 20
const MAX_ITEM_CHARS = 64

export const MENU_REFRESH = 1
export const MENU_STATUS = 2
export const MENU_ALERTS = 3
export const MENU_ARIA = 4

export type Screen = { kind: 'text'; header: string; body: string } | { kind: 'list'; header: string; items: string[] }

/** True when the ARIA tab is showing a prompt, stream, reply, or error. */
export function ariaVisible(state: AppState): boolean {
  return state.ariaAsking || state.ariaStreaming || state.ariaText !== '' || state.ariaError !== ''
}

// --- Firmware-safe text ---

// The glasses ship one LVGL font; glyphs outside it are silently dropped,
// so chrome and row labels stick to ASCII. Body text keeps its unicode
// (dropped glyphs there are cosmetic) but gets normalized line endings.
function cleanBody(s: string): string {
  return s.replace(/\r/g, '').replace(/…/g, '...').replace(/[—–]/g, '-')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 15)).trimEnd()}\n[truncated]`
}

/** Multi-line body text, capped so create and upgrade both accept it. */
export function bodyText(s: string): string {
  return truncate(cleanBody(s), MAX_BODY_CHARS)
}

/** Single-line list row label, capped at the firmware's 64 chars. */
export function rowText(s: string): string {
  const flat = cleanBody(s).replace(/\s+/g, ' ').trim()
  if (flat.length <= MAX_ITEM_CHARS) return flat
  return `${flat.slice(0, MAX_ITEM_CHARS - 3).trimEnd()}...`
}

/** 12-hour clock without seconds, e.g. "3:41 PM". */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours() % 12 || 12
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${mm} ${d.getHours() >= 12 ? 'PM' : 'AM'}`
}

/** 24-hour HH:MM for alert rows. */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// --- Screen content (pure: also rendered into the browser mirror) ---

export function headerText(tab: TabId, nowMs: number): string {
  const tabs = TABS.map((t) => `${t === tab ? '>' : ' '}${TAB_LABELS[t]}`).join('  ')
  return `${tabs}   ${formatClock(nowMs)}`
}

export function statusBody(state: AppState, cfg: G2Config): string {
  const net = (() => {
    switch (state.conn) {
      case 'approved':
        return 'NET LINKED'
      case 'pending':
        return 'NET WAITING FOR APPROVAL'
      case 'connecting':
        return 'NET CONNECTING'
      case 'denied':
        return 'NET DENIED'
      case 'error':
        return 'NET ERROR'
      default:
        return 'NET NOT CONFIGURED'
    }
  })()
  const lines = [net]
  if ((state.conn === 'error' || state.conn === 'idle') && state.connDetail) {
    lines.push(rowText(state.connDetail))
  }
  const ariaSet = Boolean(cfg.ariaEndpoint && cfg.ariaKey && cfg.providerId && cfg.model)
  lines.push(`ARIA ${ariaSet ? 'READY' : 'NOT SET'}`)
  lines.push(`DEVICE ${state.deviceId.slice(0, 8) || '...'}`)
  const unread = unreadCount(state)
  lines.push(`ALERTS ${state.alerts.length}${unread > 0 ? ` (${unread} NEW)` : ''}`)
  return bodyText(lines.join('\n'))
}

export function alertRow(item: AlertItem): string {
  return rowText(`${formatTime(item.ts)} ${item.text}`)
}

export function alertDetailBody(item: AlertItem): string {
  return bodyText(`${formatTime(item.ts)}\n\n${item.text}`)
}

export function promptRow(prompt: string): string {
  return rowText(`> ${prompt}`)
}

export function askingBody(prompt: string): string {
  return bodyText(`ASKING...\n\n${prompt}`)
}

export function ariaConfigured(cfg: G2Config): boolean {
  return Boolean(cfg.ariaEndpoint && cfg.ariaKey && cfg.providerId && cfg.model)
}

// --- Screen assembly ---

export function screenFor(state: AppState, cfg: G2Config, nowMs: number): Screen {
  const header = headerText(state.tab, nowMs)
  if (state.tab === 'alerts') {
    if (state.alertDetail !== null) {
      const item = state.alerts[state.alertDetail]
      return { kind: 'text', header, body: item ? alertDetailBody(item) : bodyText('Alert is gone.') }
    }
    if (state.alerts.length === 0) {
      return { kind: 'text', header, body: bodyText('No alerts yet.\nNew ones arrive live.') }
    }
    return { kind: 'list', header, items: state.alerts.slice(0, MAX_LIST_ITEMS).map(alertRow) }
  }
  if (state.tab === 'aria') {
    if (!ariaConfigured(cfg)) {
      return { kind: 'text', header, body: bodyText('Set endpoint + key\nin settings first.') }
    }
    if (ariaVisible(state)) {
      if (state.ariaAsking && state.ariaText === '') {
        return { kind: 'text', header, body: askingBody(state.ariaPrompt) }
      }
      if (state.ariaError !== '') {
        return { kind: 'text', header, body: bodyText(`ERROR\n\n${state.ariaError}`) }
      }
      return { kind: 'text', header, body: bodyText(state.ariaText) }
    }
    if (cfg.prompts.length === 0) {
      return { kind: 'text', header, body: bodyText('No prompts configured.') }
    }
    return { kind: 'list', header, items: cfg.prompts.slice(0, MAX_LIST_ITEMS).map(promptRow) }
  }
  return { kind: 'text', header, body: statusBody(state, cfg) }
}

// --- Container construction ---

function headerContainer(header: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: HEADER_H,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 4,
    containerID: HEADER_ID,
    containerName: HEADER_NAME,
    content: header,
    isEventCapture: 0,
  })
}

function bodyTextContainer(body: string): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: BODY_Y,
    width: 576,
    height: BODY_H,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 4,
    containerID: BODY_ID,
    containerName: BODY_TEXT_NAME,
    content: body,
    isEventCapture: 1,
  })
}

function bodyListContainer(items: string[]): ListContainerProperty {
  return new ListContainerProperty({
    xPosition: 0,
    yPosition: BODY_Y,
    width: 576,
    height: BODY_H,
    borderWidth: 0,
    borderColor: 0,
    paddingLength: 4,
    containerID: BODY_ID,
    containerName: BODY_LIST_NAME,
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 576,
      isItemSelectBorderEn: 1,
      itemName: items,
    }),
    isEventCapture: 1,
  })
}

export function buildMenu(): MenuContainerProperty {
  return new MenuContainerProperty({
    menuItems: [
      new MenuItemProperty({ itemName: 'Refresh alerts', itemID: MENU_REFRESH }),
      new MenuItemProperty({ itemName: 'Go STATUS', itemID: MENU_STATUS }),
      new MenuItemProperty({ itemName: 'Go ALERTS', itemID: MENU_ALERTS }),
      new MenuItemProperty({ itemName: 'Go ARIA', itemID: MENU_ARIA }),
    ],
  })
}

export function buildCreate(screen: Screen): CreateStartUpPageContainer {
  const textObject = [headerContainer(screen.header)]
  const listObject: ListContainerProperty[] = []
  if (screen.kind === 'text') textObject.push(bodyTextContainer(screen.body))
  else listObject.push(bodyListContainer(screen.items))
  return new CreateStartUpPageContainer({
    containerTotalNum: 1 + (screen.kind === 'text' ? 1 : 0) + listObject.length,
    textObject,
    ...(listObject.length > 0 ? { listObject } : {}),
    menuObject: buildMenu(),
  })
}

export function buildRebuild(screen: Screen): RebuildPageContainer {
  const textObject = [headerContainer(screen.header)]
  const listObject: ListContainerProperty[] = []
  if (screen.kind === 'text') textObject.push(bodyTextContainer(screen.body))
  else listObject.push(bodyListContainer(screen.items))
  return new RebuildPageContainer({
    containerTotalNum: 1 + (screen.kind === 'text' ? 1 : 0) + listObject.length,
    textObject,
    ...(listObject.length > 0 ? { listObject } : {}),
    menuObject: buildMenu(),
  })
}

export function buildHeaderUpgrade(header: string): TextContainerUpgrade {
  return new TextContainerUpgrade({ containerID: HEADER_ID, containerName: HEADER_NAME, content: header })
}

export function buildBodyUpgrade(body: string): TextContainerUpgrade {
  return new TextContainerUpgrade({ containerID: BODY_ID, containerName: BODY_TEXT_NAME, content: body })
}
