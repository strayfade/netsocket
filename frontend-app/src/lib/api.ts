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

export type Preference = {
  category: string
  id: string
  displayName: string
  type: string // text | number | boolean | select | readonly
  defaultVal?: string
  description?: string
  value: string
  options?: { value: string; label: string }[]
}

function asArrayByKey(json: unknown, key: string): unknown[] {
  if (Array.isArray(json)) return json
  if (json && Array.isArray((json as Record<string, unknown>)[key])) {
    return (json as Record<string, unknown[]>)[key]
  }
  return []
}

export async function getPreferences(): Promise<Preference[]> {
  const json = await apiFetch<{ preferences?: unknown[] } | unknown[]>('/v1/preferences')
  return asArrayByKey(json, 'preferences') as Preference[]
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

// MARK: Settings - companion devices

export type PairedDevice = {
  deviceId: string
  name?: string
  platform?: string
  status: string // pending | approved | denied
  ipAddress?: string
  lastSeenAt?: string | number
}

export async function listDevices(): Promise<PairedDevice[]> {
  return asArrayByKey(await apiFetch('/v1/devices'), 'devices') as PairedDevice[]
}

export async function setDeviceStatus(deviceId: string, action: 'approve' | 'deny' | 'pending') {
  return apiFetch(`/v1/devices/${encodeURIComponent(deviceId)}/${action}`, { method: 'POST' })
}

export async function removeDevice(deviceId: string) {
  return apiFetch(`/v1/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

// MARK: Settings - smart-home device registry

export type SmartHomeEntity = {
  uniqueId: string
  component?: string
  objectId?: string
  capabilities?: string[]
  lastState?: string
}

export type SmartHomeDevice = {
  deviceId: string
  friendlyName?: string
  room?: string
  source?: string
  manufacturer?: string
  model?: string
  availability?: string
  status: string // pending | approved | denied
  lastSeenAt?: string | number
  entities?: SmartHomeEntity[]
}

export async function listSmartHomeDevices(): Promise<SmartHomeDevice[]> {
  return asArrayByKey(await apiFetch('/v1/smarthome/devices'), 'devices') as SmartHomeDevice[]
}

export async function setSmartHomeDeviceStatus(
  deviceId: string,
  action: 'approve' | 'deny' | 'pending',
) {
  return apiFetch(`/v1/smarthome/devices/${encodeURIComponent(deviceId)}/${action}`, {
    method: 'POST',
  })
}

export async function removeSmartHomeDevice(deviceId: string) {
  return apiFetch(`/v1/smarthome/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

export async function renameSmartHomeDevice(deviceId: string, friendlyName: string, room: string) {
  return apiFetch(`/v1/smarthome/devices/${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ friendlyName, room }),
  })
}

// MARK: Settings - AI providers

export type ProviderRow = {
  id: string
  name: string
  kind: string // ollama | openai-compatible
  baseUrl: string
  defaultModel?: string
  isDefault?: boolean
  hasApiKey?: boolean
}

export type ProviderPayload = {
  name: string
  kind: string
  baseUrl: string
  apiKey?: string
  defaultModel?: string
  isDefault?: boolean
}

export async function listProviders(): Promise<ProviderRow[]> {
  return asArrayByKey(await apiFetch('/v1/providers'), 'providers') as ProviderRow[]
}

export async function createProvider(body: ProviderPayload) {
  return apiFetch('/v1/providers', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateProvider(id: string, body: Partial<ProviderPayload>) {
  return apiFetch(`/v1/providers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteProvider(id: string) {
  return apiFetch(`/v1/providers/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listProviderModels(id: string): Promise<string[]> {
  const json = await apiFetch<unknown>(`/v1/providers/${encodeURIComponent(id)}/models`)
  return asArrayByKey(json, 'models').map((m) =>
    typeof m === 'string' ? m : String((m as { id?: string })?.id ?? ''),
  )
}

// MARK: Settings - Aria gateway

export type AriaSettings = {
  configured?: boolean
  endpoint?: string
  preset?: string
  hasApiKey?: boolean
}

export async function getAriaSettings(): Promise<AriaSettings> {
  return apiFetch<AriaSettings>('/v1/aria-settings')
}

export async function saveAriaSettings(body: {
  endpoint?: string
  preset?: string
  apiKey?: string
}) {
  return apiFetch('/v1/aria-settings', { method: 'POST', body: JSON.stringify(body) })
}

export async function testAriaSettings(): Promise<{ ok?: boolean; providers?: number; error?: string }> {
  return apiFetch('/v1/aria-settings/test', { method: 'POST' })
}
