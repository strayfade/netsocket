export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function parseJsonSafe(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  })
  if (!res.ok) {
    const body = await parseJsonSafe(res)
    throw new ApiError(res.status, `HTTP ${res.status}`, body)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

export async function getSession(): Promise<boolean> {
  try {
    const res = await fetch('/v1/session', { credentials: 'same-origin' })
    return res.ok
  } catch {
    return false
  }
}

export async function getAuthState(): Promise<{ needsRegistration: boolean }> {
  return apiFetch('/v1/auth-state')
}

export type DashboardSummary = {
  layout?: { widgets?: Widget[]; widgetStyle?: string }
  variables?: Record<string, string>
  automations?: Automation[]
  counts?: Record<string, number>
  now?: number
  droppedWidgets?: Array<{ type?: string; id?: string }>
  [key: string]: unknown
}

export type Automation = {
  id: string | number
  title?: string
  type?: string
  runnable?: boolean
}

export type Widget = {
  id: string
  type: 'button' | 'clock' | 'markdown' | 'html' | 'timer' | string
  x?: number
  y?: number
  w?: number
  h?: number
  automationId?: string | number
  variable?: string
  showName?: boolean
  showDate?: boolean
}

export type Panel = {
  id: string
  name?: string
  room?: string
  showBorders?: boolean
  widgetStyle?: string
  widgets?: Widget[]
  deviceIds?: string[]
  [key: string]: unknown
}

export async function getDashboardSummary() {
  return apiFetch<DashboardSummary>('/v1/dashboard/summary')
}

export async function putDashboardLayout(widgets: Widget[], widgetStyle?: string) {
  return apiFetch('/v1/dashboard/layout', {
    method: 'PUT',
    body: JSON.stringify({ widgets, widgetStyle }),
  })
}

export async function runDashboardAutomation(nodeId: string | number) {
  return apiFetch('/v1/dashboard/run', {
    method: 'POST',
    body: JSON.stringify({ nodeId }),
  })
}

export async function getServerTime() {
  return apiFetch<{ now: number }>('/v1/time')
}

export async function listPanels() {
  return apiFetch<{ panels: Panel[] } | Panel[]>('/v1/panels')
}

export async function createPanel(body: Partial<Panel>) {
  return apiFetch<Panel>('/v1/panels', { method: 'POST', body: JSON.stringify(body) })
}

export async function updatePanel(id: string, body: Partial<Panel>) {
  return apiFetch<Panel>(`/v1/panels/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deletePanel(id: string) {
  return apiFetch(`/v1/panels/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getPanelConfig(id: string) {
  return apiFetch<Panel & { variables?: Record<string, string>; automations?: Automation[] }>(
    `/v1/panels/${encodeURIComponent(id)}/config`,
  )
}

export async function executePanelAutomation(panelId: string, nodeId: string | number) {
  return apiFetch(`/v1/panels/${encodeURIComponent(panelId)}/execute`, {
    method: 'POST',
    body: JSON.stringify({ nodeId }),
  })
}

export async function getPreferences() {
  const json = await apiFetch<{ preferences?: unknown[] } | unknown[]>('/v1/preferences')
  if (Array.isArray(json)) return json
  if (json && Array.isArray((json as { preferences?: unknown[] }).preferences)) {
    return (json as { preferences: unknown[] }).preferences
  }
  return []
}

export async function savePreference(name: string, value: unknown) {
  return apiFetch('/v1/preferences', {
    method: 'POST',
    body: JSON.stringify({ name, value }),
  })
}

export async function exportFullState() {
  return apiFetch<unknown>('/v1/export-full-state')
}

export async function importFullState(payload: unknown) {
  return apiFetch('/v1/import-full-state', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listDevices() {
  return apiFetch<{ devices?: unknown[] } | unknown[]>('/v1/devices')
}

export async function listSmartHomeDevices() {
  return apiFetch<{ devices?: unknown[] } | unknown[]>('/v1/smarthome/devices')
}

export async function listProviders() {
  return apiFetch<{ providers?: unknown[] } | unknown[]>('/v1/providers')
}
