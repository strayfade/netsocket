// Single mutable UI store. The glasses page builders read this; main.ts
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
  alertsSeen: number
  alertDetail: number | null
  ariaPrompt: string
  ariaAsking: boolean
  ariaStreaming: boolean
  ariaError: string
  ariaText: string
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
    alertsSeen: 0,
    alertDetail: null,
    ariaPrompt: '',
    ariaAsking: false,
    ariaStreaming: false,
    ariaError: '',
    ariaText: '',
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
