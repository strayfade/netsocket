'use strict';

const deviceAuth = require('../utils/deviceAuth')
const { performWebRequest } = require('../utils/httpRequest')
const vars = require('../utils/vars')

/**
 * Device status snapshot for glanceable dashboards (Even G2 STATUS tab).
 *
 * The glasses send `{ lat, lon }` (phone fix, rounded to ~1km before it
 * leaves the device) and the server replies with a small snapshot:
 *
 *   { fetchedAt, weather, nextEvent, home }
 *
 * - `weather` comes from Open-Meteo (free, keyless) fetched SERVER-SIDE so
 *   the glasses never need extra network whitelist entries. Cached per
 *   rounded grid cell for WEATHER_TTL_MS.
 * - `nextEvent` / `home` come from state variables that user automations
 *   maintain (Calendar / Hue nodes -> Set Variable), so any source can feed
 *   the dashboard without new endpoints:
 *     g2.nextEvent = JSON { title: string, startTs: number (unix ms) }
 *     g2.home      = JSON { on: number, total: number }
 *
 * Coordinates are transient: used for the upstream fetch and the cache key
 * only, never persisted. Every field degrades to null (never throws), and
 * like getRecentAlerts this is a silent no-op for non-device / unapproved
 * sockets (no auth oracle).
 */

/** Mirror of the socket reply helper in server/index.js (encrypted for approved devices). */
const defaultReplyToSocket = (socket, payload) => {
    const session = deviceAuth.getSession(socket)
    if (session?.approved && session?.sessionKey) {
        deviceAuth.sendEncrypted(socket, payload)
    } else {
        deviceAuth.sendJson(socket, payload)
    }
}

const approvedDeviceId = (socket, deps = {}) => {
    const auth = deps.deviceAuth || deviceAuth
    const session = auth.getSession(socket)
    if (!session?.authenticated || !session.approved || !session.deviceId) return null
    return session.deviceId
}

/** WMO weather-code -> ASCII-only label (glasses pixel font is ASCII-only). */
const weatherLabelFor = (code) => {
    const c = Number(code)
    if (!Number.isFinite(c)) return 'Unknown'
    if (c === 0) return 'Clear'
    if (c === 1) return 'Mostly clear'
    if (c === 2) return 'Partly cloudy'
    if (c === 3) return 'Overcast'
    if (c === 45 || c === 48) return 'Fog'
    if (c >= 51 && c <= 57) return 'Drizzle'
    if (c >= 61 && c <= 67) return 'Rain'
    if (c >= 71 && c <= 77) return 'Snow'
    if (c >= 80 && c <= 82) return 'Showers'
    if (c === 85 || c === 86) return 'Snow showers'
    if (c >= 95 && c <= 99) return 'Storm'
    return 'Unknown'
}

const WEATHER_TTL_MS = 10 * 60 * 1000
/** Failures cache briefly: backs off without hammering, but recovers fast. */
const WEATHER_NEG_TTL_MS = 60 * 1000
const weatherCache = new Map()

const cacheKeyFor = (lat, lon, unit) => `${lat.toFixed(2)},${lon.toFixed(2)},${unit}`

/** Drop expired entries so the map can't grow without bound. */
const pruneWeatherCache = (now) => {
    for (const [key, entry] of weatherCache) {
        const ttl = entry.weather ? WEATHER_TTL_MS : WEATHER_NEG_TTL_MS
        if (now - entry.at >= ttl) weatherCache.delete(key)
    }
}

const validCoord = (v, min, max) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

const toF = (celsius) => Math.round((celsius * 9) / 5 + 32)

const defaultFetchWeather = async (url) => {
    const res = await performWebRequest('GET', url, { timeoutMs: 8000 })
    if (!res?.ok) return null
    try {
        return JSON.parse(res.body)
    } catch {
        return null
    }
}

const pickNumber = (obj, keys) => {
    for (const k of keys) {
        let v = obj?.[k]
        // Open-Meteo daily series arrive as arrays; take the first entry.
        if (Array.isArray(v)) v = v[0]
        if (typeof v === 'number' && Number.isFinite(v)) return v
    }
    return null
}

/**
 * Fetch current weather for a rounded lat/lon. Returns a weather object or
 * null. Never throws; results are cached per grid cell for WEATHER_TTL_MS.
 */
const fetchWeather = async (rawLat, rawLon, rawUnit, deps = {}) => {
    const lat = Math.round(Number(rawLat) * 100) / 100
    const lon = Math.round(Number(rawLon) * 100) / 100
    if (!validCoord(lat, -90, 90) || !validCoord(lon, -180, 180)) return null
    const unit = rawUnit === 'c' ? 'c' : 'f'
    const key = cacheKeyFor(lat, lon, unit)
    const now = Date.now()
    const cached = weatherCache.get(key)
    if (cached) {
        const ttl = cached.weather ? WEATHER_TTL_MS : WEATHER_NEG_TTL_MS
        if (now - cached.at < ttl) return cached.weather
    }

    let weather = null
    try {
        const url =
            'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${lat}&longitude=${lon}` +
            '&current=temperature_2m,weather_code,precipitation_probability' +
            '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
            '&temperature_unit=celsius&timezone=auto&forecast_days=1'
        const fetchJson = deps.fetchWeather || defaultFetchWeather
        const json = await fetchJson(url)
        const current = json?.current
        const daily = json?.daily
        const tempC = pickNumber(current, ['temperature_2m'])
        if (tempC !== null) {
            const code = pickNumber(current, ['weather_code'])
            const toUnit = unit === 'f' ? toF : (c) => Math.round(c)
            weather = {
                temp: toUnit(tempC),
                unit,
                high: toUnit(pickNumber(daily, ['temperature_2m_max']) ?? tempC),
                low: toUnit(pickNumber(daily, ['temperature_2m_min']) ?? tempC),
                precipPct: pickNumber(current, ['precipitation_probability'])
                    ?? pickNumber(daily, ['precipitation_probability_max'])
                    ?? 0,
                code: code ?? -1,
                label: weatherLabelFor(code),
            }
        }
    } catch {
        weather = null
    }
    weatherCache.set(key, { at: Date.now(), weather })
    pruneWeatherCache(Date.now())
    return weather
}

/** Parse a JSON state variable; null on missing/invalid (never throws). */
const readJsonVar = (store, name) => {
    try {
        const raw = (store || vars).getVar(name)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

const readNextEvent = (store) => {
    const parsed = readJsonVar(store, 'g2.nextEvent')
    const title = typeof parsed?.title === 'string' ? parsed.title.slice(0, 120) : ''
    const startTs = typeof parsed?.startTs === 'number' && Number.isFinite(parsed.startTs)
        ? parsed.startTs
        : null
    if (!title || startTs === null) return null
    return { title, startTs }
}

const readHome = (store) => {
    const parsed = readJsonVar(store, 'g2.home')
    const on = typeof parsed?.on === 'number' && Number.isFinite(parsed.on) ? Math.max(0, Math.round(parsed.on)) : null
    const total = typeof parsed?.total === 'number' && Number.isFinite(parsed.total) ? Math.max(0, Math.round(parsed.total)) : null
    if (on === null || total === null) return null
    return { on, total }
}

/**
 * WS `getStatusSnapshot` for device-role sockets. Replies `{ snapshot }`.
 * Silent no-op for anyone else (no auth oracle). Never rejects.
 */
const handleDeviceStatusSnapshot = async (socket, message, deps = {}) => {
    if (socket?.netsocketRole !== 'device') return false
    const deviceId = approvedDeviceId(socket, deps)
    if (!deviceId) return false
    const reply = deps.reply || defaultReplyToSocket
    const data = message?.broadcastData && typeof message.broadcastData === 'object'
        ? message.broadcastData
        : {}
    const store = deps.vars || vars
    let weather = null
    try {
        weather = await fetchWeather(data.lat, data.lon, data.unit, deps)
    } catch {
        weather = null
    }
    reply(socket, {
        broadcastPurpose: 'getStatusSnapshot',
        requestId: message?.requestId,
        broadcastData: {
            snapshot: {
                fetchedAt: Date.now(),
                weather,
                nextEvent: readNextEvent(store),
                home: readHome(store),
            },
        },
    })
    return true
}

const resetStatusApiForTests = () => {
    weatherCache.clear()
}

module.exports = {
    handleDeviceStatusSnapshot,
    fetchWeather,
    weatherLabelFor,
    readNextEvent,
    readHome,
    resetStatusApiForTests,
    WEATHER_TTL_MS,
    WEATHER_NEG_TTL_MS,
}
