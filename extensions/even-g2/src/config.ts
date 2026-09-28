// Settings for the netsocket G2 companion.
// Entered on the browser mirror page (phone or laptop), persisted to
// localStorage, and carried to the glasses inside the sideload URL
// (?cfg=<base64url JSON>) because the glasses WebView has no keyboard
// and shares no storage with the phone browser.

export interface G2Config {
  /** netsocket host, e.g. "192.168.1.50" or "netsocket.example.com" */
  host: string
  /** optional port, blank = default for scheme */
  port: string
  useHttps: boolean
  deviceName: string
  /** Aria base URL, e.g. "http://192.168.1.101:3000" (no trailing slash) */
  ariaEndpoint: string
  /** Aria API key (Settings > API Keys), sent as Bearer */
  ariaKey: string
  providerId: string
  model: string
  preset: 'ping' | 'short'
  /** Canned prompts — the glasses have no keyboard, so these are the inputs */
  prompts: string[]
  /**
   * Black-point 0-100 (%). Frame pixels at/below it map to black, the
   * rest spread across the display's 16 green levels before tiles are
   * pushed — our own mapping beats the firmware's grey conversion.
   * Raise it when dim fringe pixels blow out to bright green.
   */
  threshold: number
}

export const DEFAULT_PROMPTS = [
  'In one sentence: anything need my attention?',
  'Summarize recent alerts.',
  'What automations ran recently?',
  'Quick status check.',
]

export function defaultConfig(): G2Config {
  return {
    host: '',
    port: '',
    useHttps: true,
    deviceName: 'G2 glasses',
    ariaEndpoint: '',
    ariaKey: '',
    providerId: '',
    model: '',
    preset: 'short',
    prompts: [...DEFAULT_PROMPTS],
    threshold: 50,
  }
}

const STORAGE_KEY = 'netsocket-g2-config'

export function loadConfig(): G2Config {
  const base = defaultConfig()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return sanitizeConfig({ ...base, ...JSON.parse(raw) })
  } catch {
    // corrupted storage — fall through to defaults
  }
  return base
}

/** Apply ?cfg= (sideload link from the mirror page) over stored config. */
export function applyUrlConfig(cfg: G2Config): G2Config {
  try {
    const param = new URLSearchParams(window.location.search).get('cfg')
    if (!param) return cfg
    const json = decodeURIComponent(escape(atob(param.replace(/-/g, '+').replace(/_/g, '/'))))
    return sanitizeConfig({ ...cfg, ...JSON.parse(json) })
  } catch {
    return cfg
  }
}

export function saveConfig(cfg: G2Config): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeConfig(cfg)))
  } catch {
    // storage full/blocked — settings just won't persist
  }
}

/** Encode config into a sideload URL (?cfg=) the Even app can open. */
export function encodeSideloadUrl(cfg: G2Config): string {
  const json = JSON.stringify(sanitizeConfig(cfg))
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const url = new URL(window.location.href)
  url.search = `?cfg=${b64}`
  return url.toString()
}

function sanitizeConfig(raw: Partial<G2Config>): G2Config {
  const base = defaultConfig()
  const str = (v: unknown, fallback: string): string =>
    typeof v === 'string' ? v.trim().slice(0, 500) : fallback
  const prompts = Array.isArray(raw.prompts) && raw.prompts.length > 0
    ? raw.prompts.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim().slice(0, 300)).slice(0, 6)
    : [...DEFAULT_PROMPTS]
  return {
    host: str(raw.host, base.host).replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    port: str(raw.port, '').replace(/[^0-9]/g, '').slice(0, 5),
    useHttps: typeof raw.useHttps === 'boolean' ? raw.useHttps : base.useHttps,
    deviceName: str(raw.deviceName, base.deviceName).slice(0, 60) || base.deviceName,
    ariaEndpoint: str(raw.ariaEndpoint, '').replace(/\/+$/, ''),
    ariaKey: typeof raw.ariaKey === 'string' ? raw.ariaKey.trim().slice(0, 500) : '',
    providerId: str(raw.providerId, ''),
    model: str(raw.model, ''),
    preset: raw.preset === 'ping' ? 'ping' : 'short',
    prompts,
    threshold:
      typeof raw.threshold === 'number' && Number.isFinite(raw.threshold)
        ? Math.max(0, Math.min(100, Math.round(raw.threshold)))
        : base.threshold,
  }
}
