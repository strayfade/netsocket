'use strict';

// Weather backend for the Weather widget (dashboard + panel kiosks).
//
// OpenWeatherMap "Current Weather data" (free tier) is fetched SERVER-SIDE:
// the API key never reaches browsers/kiosks, and one fetch per hour serves
// every dashboard, panel, and editor preview bound to the same location.
// Snapshots ride on the payloads clients already poll (dashboard summary +
// panel config), so there is no new route and no new gateway rule.
//
// Entry states per `${location}|${unit}` key:
//   - success  -> normalized weather object
//   - failure  -> { error: 'not_found' | 'fetch_failed' } (negative-cached)
//   - no key   -> { error: 'no_key' } (never cached; local check)

const settingsManager = require('./settingsManager')
const { performWebRequest } = require('../utils/httpRequest')

require('./nodePreferencesRegistry').addPref(
    'Weather',
    'weather.openweathermap_api_key',
    'OpenWeatherMap API Key',
    'text',
    '',
    '<p>API key for the dashboard and panel <b>Weather</b> widget. Free "Current Weather data" keys from <a href="https://openweathermap.org/" target="_blank" rel="noopener">openweathermap.org</a>. Stored with the other integration secrets; never logged.</p>'
)

const WEATHER_TTL_MS = 60 * 60 * 1000
/** Failures back off for a while but recover without a restart. */
const WEATHER_NEG_TTL_MS = 5 * 60 * 1000

const weatherCache = new Map()
/** In-flight fetches keyed by cache key, so concurrent polls share one call. */
const inFlight = new Map()

const getApiKey = (deps = {}) => {
    const get = deps.getSetting || settingsManager.getSetting
    return String(get('weather.openweathermap_api_key') || '').trim()
}

const validUnit = (unit) => (unit === 'c' ? 'c' : 'f')

/** Cache-key form of a widget location: trimmed, single-spaced, lowercased. */
const normalizeLocationKey = (value) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().toLowerCase() : ''

/** Map key a client uses to find its widget's snapshot. */
const entryKeyFor = (location, unit) =>
    `${location != null ? String(location) : ''}|${validUnit(unit)}`

/** Cache value: { at, entry, ok } — `ok` false for error entries (short TTL). */
const pruneWeatherCache = (now) => {
    for (const [key, record] of weatherCache) {
        const ttl = record.ok ? WEATHER_TTL_MS : WEATHER_NEG_TTL_MS
        if (now - record.at >= ttl) weatherCache.delete(key)
    }
}

const numOr = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const capText = (v, max) => {
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    return trimmed ? trimmed.slice(0, max) : null
}

const roundedOr = (v) => {
    const n = numOr(v)
    return n == null ? null : Math.round(n)
}

// OWM wind speed units depend on `units=`: imperial -> mph, metric -> m/s.
// Normalize metric to km/h so the client never does unit math.
const windSpeedIn = (speedValue, unit) => {
    const n = numOr(speedValue)
    if (n == null) return null
    return Math.round(unit === 'c' ? n * 3.6 : n)
}

/** OWM current-weather JSON -> compact client payload; null when unusable. */
const normalizeOwmJson = (json, fetchedAt, unit) => {
    const main = json && typeof json.main === 'object' ? json.main : null
    if (!main) return null
    const temp = roundedOr(main.temp)
    if (temp == null) return null
    const cond = Array.isArray(json.weather) ? json.weather[0] : null
    const sys = json.sys && typeof json.sys === 'object' ? json.sys : {}
    const icon = capText(cond && cond.icon, 8) || ''
    const high = roundedOr(main.temp_max)
    const low = roundedOr(main.temp_min)
    return {
        fetchedAt,
        name: capText(json.name, 64) || 'Weather',
        country: capText(sys.country, 8) || '',
        code: numOr(cond && cond.id) ?? -1,
        icon,
        isDay: icon ? icon.endsWith('d') : null,
        label: capText(cond && cond.description, 48) || 'Unknown',
        temp,
        feels: roundedOr(main.feels_like),
        high: high == null ? temp : high,
        low: low == null ? temp : low,
        humidity: numOr(main.humidity) != null
            ? Math.max(0, Math.min(100, Math.round(main.humidity)))
            : null,
        windSpeed: windSpeedIn(json.wind && json.wind.speed, unit),
        windDeg: numOr(json.wind && json.wind.deg),
        sunrise: numOr(sys.sunrise),
        sunset: numOr(sys.sunset),
    }
}

const defaultFetchOwm = async (url) => {
    const res = await performWebRequest('GET', url, { timeoutMs: 8000 })
    if (!res || !res.ok) return { status: res ? res.status : 0, json: null }
    try {
        return { status: res.status, json: JSON.parse(res.body) }
    } catch {
        return { status: res.status, json: null }
    }
}

/**
 * Current weather for one location+unit. Never throws. Results cached for
 * WEATHER_TTL_MS (failures for WEATHER_NEG_TTL_MS). `deps` (`fetchOwm`,
 * `getSetting`, `clock`) exist so tests never touch the network.
 */
const fetchWeatherFor = async (rawLocation, rawUnit, deps = {}) => {
    const location = typeof rawLocation === 'string'
        ? rawLocation.replace(/\s+/g, ' ').trim()
        : ''
    if (!location || location.length > 100) return { error: 'invalid_location' }
    const unit = validUnit(rawUnit)
    const cacheKey = `${normalizeLocationKey(location)}|${unit}`

    const now = (deps.clock || Date).now()
    const cached = weatherCache.get(cacheKey)
    if (cached) {
        const ttl = cached.ok ? WEATHER_TTL_MS : WEATHER_NEG_TTL_MS
        if (now - cached.at < ttl) return cached.entry
    }
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey)

    const apiKey = getApiKey(deps)
    if (!apiKey) return { error: 'no_key' }

    const request = (async () => {
        try {
            const url =
                'https://api.openweathermap.org/data/2.5/weather' +
                `?q=${encodeURIComponent(location)}` +
                `&appid=${encodeURIComponent(apiKey)}` +
                `&units=${unit === 'c' ? 'metric' : 'imperial'}` +
                '&lang=en'
            const fetchOwm = deps.fetchOwm || defaultFetchOwm
            const result = await fetchOwm(url)
            const at0 = (deps.clock || Date).now()
            const weather = result && result.json
                ? normalizeOwmJson(result.json, at0, unit)
                : null
            const entry = weather || (result && result.status === 404
                ? { error: 'not_found' }
                : { error: 'fetch_failed' })
            const at = (deps.clock || Date).now()
            weatherCache.set(cacheKey, { at, entry, ok: !!weather })
            pruneWeatherCache(at)
            return entry
        } catch {
            const entry = { error: 'fetch_failed' }
            weatherCache.set(cacheKey, { at: (deps.clock || Date).now(), entry, ok: false })
            return entry
        } finally {
            inFlight.delete(cacheKey)
        }
    })()
    inFlight.set(cacheKey, request)
    return request
}

/**
 * Snapshot map for a widget list: `{ "<stored location>|<unit>": entry }`.
 * Duplicate location+unit combos collapse to one fetch.
 */
const snapshotForWidgets = async (widgets, deps = {}) => {
    const map = {}
    if (!Array.isArray(widgets)) return map
    for (const widget of widgets) {
        if (!widget || widget.type !== 'weather' || !widget.location) continue
        const unit = validUnit(widget.unit)
        const mapKey = entryKeyFor(widget.location, unit)
        if (Object.prototype.hasOwnProperty.call(map, mapKey)) continue
        map[mapKey] = fetchWeatherFor(widget.location, unit, deps)
    }
    for (const key of Object.keys(map)) {
        map[key] = await map[key]
    }
    return map
}

const resetWeatherServiceForTests = () => {
    weatherCache.clear()
    inFlight.clear()
}

module.exports = {
    WEATHER_TTL_MS,
    WEATHER_NEG_TTL_MS,
    entryKeyFor,
    normalizeLocationKey,
    normalizeOwmJson,
    fetchWeatherFor,
    snapshotForWidgets,
    resetWeatherServiceForTests,
}
