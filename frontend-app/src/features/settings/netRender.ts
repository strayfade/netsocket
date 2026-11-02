// Typed access to the editor island's canvas controls. The LiteGraph bootstrap on
// /automate publishes these window globals; the Rendering settings section is only
// shown while they exist (see hasEditorRenderControls).

type NetsocketRenderWindow = Window & {
  LGraphCanvas?: {
    RENDER_QUALITY_PRESETS?: Record<string, { label?: string }>
    BACKGROUND_OPACITY_MIN?: number
    BACKGROUND_OPACITY_MAX?: number
    BACKGROUND_OPACITY_DEFAULT?: number
    clampBackgroundOpacity?: (n: number) => number
    NODE_BG_OPACITY_MIN?: number
    NODE_BG_OPACITY_MAX?: number
    NODE_BG_OPACITY_DEFAULT?: number
    clampNodeBackgroundOpacity?: (n: number) => number
    isValidColorHex?: (s: string) => boolean
  }
  getNetsocketRenderQuality?: () => string
  applyNetsocketRenderQuality?: (quality: string) => string
  getNetsocketShowFps?: () => boolean
  setNetsocketShowFps?: (enabled: boolean) => void
  getNetsocketShowSelectionKeybinds?: () => boolean
  setNetsocketShowSelectionKeybinds?: (enabled: boolean) => void
  getNetsocketRenderResolution?: () => number
  setNetsocketRenderResolution?: (percent: number) => number
  getNetsocketGridOpacity?: () => number
  setNetsocketGridOpacity?: (percent: number) => number
  getNetsocketCanvasBg?: () => string
  setNetsocketCanvasBg?: (color: string) => string | null
  getNetsocketNodeBgOpacity?: () => number
  setNetsocketNodeBgOpacity?: (percent: number) => number
  getNetsocketNodeBgColor?: () => string
  setNetsocketNodeBgColor?: (color: string) => string | null
  getNetsocketGridSnap?: () => boolean
  setNetsocketGridSnap?: (enabled: boolean) => boolean
}

const w = () => window as NetsocketRenderWindow

export function hasEditorRenderControls(): boolean {
  return typeof w().getNetsocketRenderQuality === 'function' && typeof w().setNetsocketShowFps === 'function'
}

export type QualityPreset = { key: string; label: string }

export function getQualityPresets(): QualityPreset[] {
  const presets = w().LGraphCanvas?.RENDER_QUALITY_PRESETS || {}
  const out: QualityPreset[] = []
  for (const key of ['low', 'medium', 'high']) {
    const preset = presets[key]
    if (preset) out.push({ key, label: preset.label || key })
  }
  return out
}

export function getRenderQuality(): string {
  return typeof w().getNetsocketRenderQuality === 'function' ? w().getNetsocketRenderQuality!() : 'medium'
}

export function applyRenderQuality(key: string): string {
  return typeof w().applyNetsocketRenderQuality === 'function' ? w().applyNetsocketRenderQuality!(key) : key
}

export function getShowFps(): boolean {
  return typeof w().getNetsocketShowFps === 'function' ? !!w().getNetsocketShowFps!() : false
}

export function setShowFps(enabled: boolean) {
  if (typeof w().setNetsocketShowFps === 'function') w().setNetsocketShowFps!(enabled)
}

export function getShowSelectionKeybinds(): boolean {
  return typeof w().getNetsocketShowSelectionKeybinds === 'function'
    ? !!w().getNetsocketShowSelectionKeybinds!()
    : false
}

export function setShowSelectionKeybinds(enabled: boolean) {
  if (typeof w().setNetsocketShowSelectionKeybinds === 'function') w().setNetsocketShowSelectionKeybinds!(enabled)
}

export function getRenderResolution(): number {
  return typeof w().getNetsocketRenderResolution === 'function' ? Number(w().getNetsocketRenderResolution!()) || 100 : 100
}

export function setRenderResolution(percent: number): number {
  return typeof w().setNetsocketRenderResolution === 'function'
    ? Number(w().setNetsocketRenderResolution!(percent)) || percent
    : percent
}

export type BackgroundBounds = { min: number; max: number; fallback: number }

export function getGridOpacityBounds(): BackgroundBounds {
  const c = w().LGraphCanvas
  return {
    min: c?.BACKGROUND_OPACITY_MIN != null ? Number(c.BACKGROUND_OPACITY_MIN) : 0,
    max: c?.BACKGROUND_OPACITY_MAX != null ? Number(c.BACKGROUND_OPACITY_MAX) : 100,
    fallback: c?.BACKGROUND_OPACITY_DEFAULT != null ? Number(c.BACKGROUND_OPACITY_DEFAULT) : 25,
  }
}

function clampLocal(value: number, bounds: BackgroundBounds): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return bounds.fallback
  return Math.max(bounds.min, Math.min(bounds.max, n))
}

export function clampGridOpacity(value: number): number {
  const c = w().LGraphCanvas
  if (typeof c?.clampBackgroundOpacity === 'function') return Number(c.clampBackgroundOpacity(value))
  return clampLocal(value, getGridOpacityBounds())
}

export function getGridOpacity(): number {
  const bounds = getGridOpacityBounds()
  if (typeof w().getNetsocketGridOpacity === 'function') return clampLocal(w().getNetsocketGridOpacity!(), bounds)
  try {
    const raw = window.localStorage.getItem('netsocket:gridOpacity')
    if (raw != null && raw !== '') return clampLocal(Number(raw), bounds)
  } catch {
    /* private mode */
  }
  return bounds.fallback
}

export function setGridOpacity(percent: number): number {
  const applied = clampGridOpacity(percent)
  if (typeof w().setNetsocketGridOpacity === 'function') {
    return Number(w().setNetsocketGridOpacity!(applied)) || applied
  }
  try {
    window.localStorage.setItem('netsocket:gridOpacity', String(applied))
  } catch {
    /* private mode */
  }
  return applied
}

// Canvas background fill color (the flat rect under the grid image).
export const DEFAULT_CANVAS_BG_COLOR = '#000000'

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function isValidColorHex(value: string): boolean {
  const c = w().LGraphCanvas
  if (typeof c?.isValidColorHex === 'function') return !!c.isValidColorHex(value)
  return HEX_COLOR_RE.test(String(value ?? '').trim())
}

export function getCanvasBgColor(): string {
  if (typeof w().getNetsocketCanvasBg === 'function') {
    const live = String(w().getNetsocketCanvasBg!() ?? '')
    if (isValidColorHex(live)) return live
  }
  try {
    const raw = window.localStorage.getItem('netsocket:canvasBg')
    if (raw != null && isValidColorHex(raw)) return raw
  } catch {
    /* private mode */
  }
  return DEFAULT_CANVAS_BG_COLOR
}

export function setCanvasBgColor(color: string): string | null {
  if (typeof w().setNetsocketCanvasBg === 'function') {
    const applied = w().setNetsocketCanvasBg!(color)
    return applied == null ? null : String(applied)
  }
  if (!isValidColorHex(color)) return null
  try {
    window.localStorage.setItem('netsocket:canvasBg', color.trim())
  } catch {
    /* private mode */
  }
  return color.trim()
}

// Node body fill: opacity scales the theme's own translucent fills, and an
// empty color means the theme default (translucent black), same as the editor.
export function getNodeBgOpacityBounds(): BackgroundBounds {
  const c = w().LGraphCanvas
  return {
    min: c?.NODE_BG_OPACITY_MIN != null ? Number(c.NODE_BG_OPACITY_MIN) : 0,
    max: c?.NODE_BG_OPACITY_MAX != null ? Number(c.NODE_BG_OPACITY_MAX) : 100,
    fallback: c?.NODE_BG_OPACITY_DEFAULT != null ? Number(c.NODE_BG_OPACITY_DEFAULT) : 100,
  }
}

export function clampNodeBgOpacity(value: number): number {
  const c = w().LGraphCanvas
  if (typeof c?.clampNodeBackgroundOpacity === 'function') return Number(c.clampNodeBackgroundOpacity(value))
  return clampLocal(value, getNodeBgOpacityBounds())
}

export function getNodeBgOpacity(): number {
  const bounds = getNodeBgOpacityBounds()
  if (typeof w().getNetsocketNodeBgOpacity === 'function') return clampLocal(w().getNetsocketNodeBgOpacity!(), bounds)
  try {
    const raw = window.localStorage.getItem('netsocket:nodeBgOpacity')
    if (raw != null && raw !== '') return clampLocal(Number(raw), bounds)
  } catch {
    /* private mode */
  }
  return bounds.fallback
}

export function setNodeBgOpacity(percent: number): number {
  const applied = clampNodeBgOpacity(percent)
  if (typeof w().setNetsocketNodeBgOpacity === 'function') {
    return Number(w().setNetsocketNodeBgOpacity!(applied)) || applied
  }
  try {
    window.localStorage.setItem('netsocket:nodeBgOpacity', String(applied))
  } catch {
    /* private mode */
  }
  return applied
}

export function getNodeBgColor(): string {
  if (typeof w().getNetsocketNodeBgColor === 'function') return String(w().getNetsocketNodeBgColor!() ?? '')
  try {
    const raw = window.localStorage.getItem('netsocket:nodeBgColor')
    if (raw != null && isValidColorHex(raw)) return raw
  } catch {
    /* private mode */
  }
  return ''
}

// Returns the state now in effect ('' = theme default). Invalid colors are
// rejected before the bridge call, so the editor never sees them.
export function setNodeBgColor(color: string): string {
  const c = String(color ?? '').trim()
  if (c === '') {
    if (typeof w().setNetsocketNodeBgColor === 'function') w().setNetsocketNodeBgColor!('')
    else {
      try {
        window.localStorage.removeItem('netsocket:nodeBgColor')
      } catch {
        /* private mode */
      }
    }
    return ''
  }
  if (!isValidColorHex(c)) return getNodeBgColor()
  if (typeof w().setNetsocketNodeBgColor === 'function') {
    w().setNetsocketNodeBgColor!(c)
    return c
  }
  try {
    window.localStorage.setItem('netsocket:nodeBgColor', c)
  } catch {
    /* private mode */
  }
  return c
}

// Grid snap (moving nodes/groups snaps to the drawn background grid; hold Ctrl
// while dragging to move freely). Enabled unless explicitly stored false, so a
// missing editor island still reports the same default the editor applies.
export function getGridSnap(): boolean {
  if (typeof w().getNetsocketGridSnap === 'function') return !!w().getNetsocketGridSnap!()
  try {
    const raw = window.localStorage.getItem('netsocket:gridSnap')
    if (raw != null) return raw !== 'false'
  } catch {
    /* private mode */
  }
  return true
}

export function setGridSnap(enabled: boolean): boolean {
  const applied = !!enabled
  if (typeof w().setNetsocketGridSnap === 'function') return !!w().setNetsocketGridSnap!(applied)
  try {
    window.localStorage.setItem('netsocket:gridSnap', applied ? 'true' : 'false')
  } catch {
    /* private mode */
  }
  return applied
}

// Live registry pushes from the editor WebSocket (see editorBootstrap.js relaying
// devicesChanged / smartHomeChanged). While the settings dialog is open we take them.
declare global {
  interface Window {
    __netsocketOnDevicesChanged?: (devices: unknown[]) => void
    __netsocketOnSmartHomeChanged?: (devices: unknown[]) => void
  }
}
