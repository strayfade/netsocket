// Typed access to the editor island's canvas controls. The LiteGraph bootstrap on
// /automate publishes these window globals; the Rendering settings section is only
// shown while they exist (see hasEditorRenderControls).

type NetsocketRenderWindow = Window & {
  LGraphCanvas?: {
    RENDER_QUALITY_PRESETS?: Record<string, { label?: string }>
    BACKGROUND_CONTRAST_MIN?: number
    BACKGROUND_CONTRAST_MAX?: number
    BACKGROUND_CONTRAST_DEFAULT?: number
    clampBackgroundContrast?: (n: number) => number
    BACKGROUND_BRIGHTNESS_MIN?: number
    BACKGROUND_BRIGHTNESS_MAX?: number
    BACKGROUND_BRIGHTNESS_DEFAULT?: number
    clampBackgroundBrightness?: (n: number) => number
  }
  getNetsocketRenderQuality?: () => string
  applyNetsocketRenderQuality?: (quality: string) => string
  getNetsocketShowFps?: () => boolean
  setNetsocketShowFps?: (enabled: boolean) => void
  getNetsocketShowSelectionKeybinds?: () => boolean
  setNetsocketShowSelectionKeybinds?: (enabled: boolean) => void
  getNetsocketRenderResolution?: () => number
  setNetsocketRenderResolution?: (percent: number) => number
  getNetsocketGridContrast?: () => number
  setNetsocketGridContrast?: (percent: number) => number
  getNetsocketGridBrightness?: () => number
  setNetsocketGridBrightness?: (percent: number) => number
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

export function getGridContrastBounds(): BackgroundBounds {
  const c = w().LGraphCanvas
  return {
    min: c?.BACKGROUND_CONTRAST_MIN != null ? Number(c.BACKGROUND_CONTRAST_MIN) : 0,
    max: c?.BACKGROUND_CONTRAST_MAX != null ? Number(c.BACKGROUND_CONTRAST_MAX) : 200,
    fallback: c?.BACKGROUND_CONTRAST_DEFAULT != null ? Number(c.BACKGROUND_CONTRAST_DEFAULT) : 100,
  }
}

export function getGridBrightnessBounds(): BackgroundBounds {
  const c = w().LGraphCanvas
  return {
    min: c?.BACKGROUND_BRIGHTNESS_MIN != null ? Number(c.BACKGROUND_BRIGHTNESS_MIN) : 0,
    max: c?.BACKGROUND_BRIGHTNESS_MAX != null ? Number(c.BACKGROUND_BRIGHTNESS_MAX) : 200,
    fallback: c?.BACKGROUND_BRIGHTNESS_DEFAULT != null ? Number(c.BACKGROUND_BRIGHTNESS_DEFAULT) : 100,
  }
}

function clampLocal(value: number, bounds: BackgroundBounds): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return bounds.fallback
  return Math.max(bounds.min, Math.min(bounds.max, n))
}

export function clampGridContrast(value: number): number {
  const c = w().LGraphCanvas
  if (typeof c?.clampBackgroundContrast === 'function') return Number(c.clampBackgroundContrast(value))
  return clampLocal(value, getGridContrastBounds())
}

export function clampGridBrightness(value: number): number {
  const c = w().LGraphCanvas
  if (typeof c?.clampBackgroundBrightness === 'function') return Number(c.clampBackgroundBrightness(value))
  return clampLocal(value, getGridBrightnessBounds())
}

export function getGridContrast(): number {
  const bounds = getGridContrastBounds()
  if (typeof w().getNetsocketGridContrast === 'function') return clampLocal(w().getNetsocketGridContrast!(), bounds)
  try {
    const raw = window.localStorage.getItem('netsocket:gridContrast')
    if (raw != null && raw !== '') return clampLocal(Number(raw), bounds)
  } catch {
    /* private mode */
  }
  return bounds.fallback
}

export function setGridContrast(percent: number): number {
  const applied = clampGridContrast(percent)
  if (typeof w().setNetsocketGridContrast === 'function') {
    return Number(w().setNetsocketGridContrast!(applied)) || applied
  }
  try {
    window.localStorage.setItem('netsocket:gridContrast', String(applied))
  } catch {
    /* private mode */
  }
  return applied
}

export function getGridBrightness(): number {
  const bounds = getGridBrightnessBounds()
  if (typeof w().getNetsocketGridBrightness === 'function') return clampLocal(w().getNetsocketGridBrightness!(), bounds)
  try {
    const raw = window.localStorage.getItem('netsocket:gridBrightness')
    if (raw != null && raw !== '') return clampLocal(Number(raw), bounds)
  } catch {
    /* private mode */
  }
  return bounds.fallback
}

export function setGridBrightness(percent: number): number {
  const applied = clampGridBrightness(percent)
  if (typeof w().setNetsocketGridBrightness === 'function') {
    return Number(w().setNetsocketGridBrightness!(applied)) || applied
  }
  try {
    window.localStorage.setItem('netsocket:gridBrightness', String(applied))
  } catch {
    /* private mode */
  }
  return applied
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
