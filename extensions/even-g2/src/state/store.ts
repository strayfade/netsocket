// Single mutable UI store. The canvas renderers read this; main.ts
// mutates it on input events and network callbacks, then re-renders.

export type TabId = 'status' | 'alerts' | 'aria'
export const TABS: TabId[] = ['status', 'alerts', 'aria']
export const TAB_LABELS: Record<TabId, string> = {
  status: 'STATUS',
  alerts: 'ALERTS',
  aria: 'ARIA',
}

export type ConnState = 'idle' | 'connecting' | 'pending' | 'approved' | 'denied' | 'error'

export interface AlertItem {
  text: string
  conversationId: string | null
  deviceId: string | null
  ts: number
}

export interface AppState {
  tab: TabId
  conn: ConnState
  connDetail: string
  deviceId: string
  deviceName: string
  alerts: AlertItem[]
  alertsFocus: number
  alertsSeen: number
  alertDetail: number | null
  detailPage: number
  ariaFocus: number
  ariaAsking: boolean
  ariaStreaming: boolean
  ariaError: string
  ariaPages: string[][]
  ariaPage: number
  lastRefresh: number
}

export function initialState(): AppState {
  return {
    tab: 'status',
    conn: 'idle',
    connDetail: 'not configured',
    deviceId: '',
    deviceName: '',
    alerts: [],
    alertsFocus: 0,
    alertsSeen: 0,
    alertDetail: null,
    detailPage: 0,
    ariaFocus: 0,
    ariaAsking: false,
    ariaStreaming: false,
    ariaError: '',
    ariaPages: [],
    ariaPage: 0,
    lastRefresh: 0,
  }
}

/** Count of alerts newer than the last-seen watermark (tab bar dot). */
export function unreadCount(state: AppState): number {
  return state.alerts.filter((a) => a.ts > state.alertsSeen).length
}

export function markAllSeen(state: AppState): void {
  const newest = state.alerts.reduce((max, a) => Math.max(max, a.ts), state.alertsSeen)
  state.alertsSeen = newest
}
