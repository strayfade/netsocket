// Phone location for Status weather. One-shot, city-level accuracy: weather
// only needs ~10km, so Low is cheapest and kindest to battery. Coordinates
// are rounded to 2 decimals (~1km) before they leave the device and the
// server keeps them transient (cache key + upstream fetch only, never
// persisted). Returns null when the bridge is absent (browser mirror),
// permission is denied, or no fix arrives in time — the caller falls back
// to the manual mirror-settings override, then to a placeholder.

import { AppLocationAccuracy } from '@evenrealities/even_hub_sdk'

export interface PhoneFix {
  lat: number
  lon: number
}

type BridgeLike = {
  getAppLocation?: (options?: Record<string, unknown>) => Promise<{
    latitude: number
    longitude: number
  } | null>
}

const FIX_TIMEOUT_MS = 6000
/** Reuse a fix for this long before asking the phone again. */
export const FIX_REUSE_MS = 10 * 60 * 1000

let cached: { fix: PhoneFix; at: number } | null = null

const validFix = (lat: unknown, lon: unknown): lat is number =>
  typeof lat === 'number' &&
  Number.isFinite(lat) &&
  typeof lon === 'number' &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180

export function clearFixCache(): void {
  cached = null
}

export async function getPhoneFix(bridge: BridgeLike | null): Promise<PhoneFix | null> {
  if (cached && Date.now() - cached.at < FIX_REUSE_MS) return cached.fix
  if (!bridge || typeof bridge.getAppLocation !== 'function') return null
  try {
    const loc = await Promise.race([
      bridge.getAppLocation({ accuracy: AppLocationAccuracy.Low, timeoutMs: FIX_TIMEOUT_MS }),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), FIX_TIMEOUT_MS + 500)),
    ])
    if (!loc || !validFix(loc.latitude, loc.longitude)) return null
    const fix: PhoneFix = {
      lat: Math.round(loc.latitude * 100) / 100,
      lon: Math.round(loc.longitude * 100) / 100,
    }
    cached = { fix, at: Date.now() }
    return fix
  } catch {
    return null
  }
}
