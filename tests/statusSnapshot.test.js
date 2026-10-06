'use strict';

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const {
    handleDeviceStatusSnapshot,
    fetchWeather,
    weatherLabelFor,
    readNextEvent,
    readHome,
    resetStatusApiForTests,
    WEATHER_TTL_MS,
    WEATHER_NEG_TTL_MS,
} = require('../server/manager/statusApi')
const deviceAuth = require('../server/utils/deviceAuth')

const approvedDeps = (deviceId, sent, extra = {}) => ({
    deviceAuth: {
        getSession: () => ({ authenticated: true, approved: true, deviceId }),
    },
    reply: (socket, payload) => {
        sent.push(payload)
    },
    ...extra,
})

const weatherJson = {
    current: { temperature_2m: 20, weather_code: 2, precipitation_probability: 10 },
    daily: { temperature_2m_max: [24], temperature_2m_min: [15], precipitation_probability_max: [20] },
}

const memVars = (entries = {}) => ({
    getVar: (name) => (typeof entries[name] === 'string' ? entries[name] : ''),
})

describe('weatherLabelFor', () => {
    it('maps common WMO codes to ASCII labels', () => {
        assert.equal(weatherLabelFor(0), 'Clear')
        assert.equal(weatherLabelFor(3), 'Overcast')
        assert.equal(weatherLabelFor(61), 'Rain')
        assert.equal(weatherLabelFor(71), 'Snow')
        assert.equal(weatherLabelFor(95), 'Storm')
        assert.equal(weatherLabelFor(999), 'Unknown')
        assert.equal(weatherLabelFor('nope'), 'Unknown')
    })
})

describe('fetchWeather', () => {
    beforeEach(() => {
        resetStatusApiForTests()
    })

    it('fetches and converts Open-Meteo JSON to a weather object', async () => {
        let url = ''
        const weather = await fetchWeather(47.606, -122.332, 'f', {
            fetchWeather: async (u) => {
                url = u
                return weatherJson
            },
        })
        assert.ok(url.includes('api.open-meteo.com'))
        assert.equal(weather.temp, 68)
        assert.equal(weather.high, 75)
        assert.equal(weather.low, 59)
        assert.equal(weather.precipPct, 10)
        assert.equal(weather.code, 2)
        assert.equal(weather.label, 'Partly cloudy')
        assert.equal(weather.unit, 'f')
    })

    it('rounds coordinates and rejects invalid ones without fetching', async () => {
        let calls = 0
        const deps = { fetchWeather: async () => { calls += 1; return weatherJson } }
        assert.equal(await fetchWeather('oops', 0, 'f', deps), null)
        assert.equal(await fetchWeather(100, 0, 'f', deps), null)
        assert.equal(await fetchWeather(0, 200, 'f', deps), null)
        assert.equal(calls, 0)
    })

    it('caches per grid cell and degrades to null on fetch failure', async () => {
        let calls = 0
        const deps = { fetchWeather: async () => { calls += 1; return weatherJson } }
        const first = await fetchWeather(47.6, -122.33, 'f', deps)
        const second = await fetchWeather(47.601, -122.331, 'f', deps)
        assert.equal(calls, 1)
        assert.deepEqual(second, first)
        resetStatusApiForTests()
        const failed = await fetchWeather(47.6, -122.33, 'f', {
            fetchWeather: async () => { throw new Error('down') },
        })
        assert.equal(failed, null)
    })

    it('expires successes after TTL but retries failures quickly', async () => {
        const realNow = Date.now
        let now = 1_000_000
        Date.now = () => now
        try {
            resetStatusApiForTests()
            let calls = 0
            const okDeps = { fetchWeather: async () => { calls += 1; return weatherJson } }
            await fetchWeather(47.6, -122.33, 'f', okDeps)
            await fetchWeather(47.6, -122.33, 'f', okDeps)
            assert.equal(calls, 1)
            now += WEATHER_TTL_MS + 1
            await fetchWeather(47.6, -122.33, 'f', okDeps)
            assert.equal(calls, 2)

            resetStatusApiForTests()
            calls = 0
            const failDeps = { fetchWeather: async () => { calls += 1; throw new Error('down') } }
            assert.equal(await fetchWeather(10, 10, 'f', failDeps), null)
            assert.equal(await fetchWeather(10, 10, 'f', failDeps), null)
            assert.equal(calls, 1)
            now += WEATHER_NEG_TTL_MS + 1
            assert.equal(await fetchWeather(10, 10, 'f', failDeps), null)
            assert.equal(calls, 2)
        } finally {
            Date.now = realNow
        }
    })
})

describe('readNextEvent / readHome', () => {
    it('parses valid JSON vars and rejects the rest', () => {
        assert.deepEqual(
            readNextEvent(memVars({ 'g2.nextEvent': JSON.stringify({ title: 'Dentist', startTs: 1728000000000 }) })),
            { title: 'Dentist', startTs: 1728000000000 },
        )
        assert.equal(readNextEvent(memVars({})), null)
        assert.equal(readNextEvent(memVars({ 'g2.nextEvent': 'not json' })), null)
        assert.equal(readNextEvent(memVars({ 'g2.nextEvent': JSON.stringify({ title: 'x' }) })), null)
        assert.deepEqual(
            readHome(memVars({ 'g2.home': JSON.stringify({ on: 2, total: 5 }) })),
            { on: 2, total: 5 },
        )
        assert.equal(readHome(memVars({})), null)
        assert.equal(readHome(memVars({ 'g2.home': JSON.stringify({ on: 'many' }) })), null)
    })
})

describe('handleDeviceStatusSnapshot', () => {
    beforeEach(() => {
        resetStatusApiForTests()
    })

    it('replies with a full snapshot for approved devices', async () => {
        const sent = []
        const socket = { netsocketRole: 'device' }
        const ok = await handleDeviceStatusSnapshot(
            socket,
            {
                requestId: 's1',
                broadcastData: { lat: 47.6, lon: -122.33, unit: 'f' },
            },
            approvedDeps('g2-1', sent, {
                vars: memVars({
                    'g2.nextEvent': JSON.stringify({ title: 'Dentist', startTs: 1728000000000 }),
                    'g2.home': JSON.stringify({ on: 1, total: 4 }),
                }),
                fetchWeather: async () => weatherJson,
            }),
        )
        assert.equal(ok, true)
        assert.equal(sent.length, 1)
        assert.equal(sent[0].broadcastPurpose, 'getStatusSnapshot')
        assert.equal(sent[0].requestId, 's1')
        const snap = sent[0].broadcastData.snapshot
        assert.ok(typeof snap.fetchedAt === 'number')
        assert.equal(snap.weather.temp, 68)
        assert.deepEqual(snap.nextEvent, { title: 'Dentist', startTs: 1728000000000 })
        assert.deepEqual(snap.home, { on: 1, total: 4 })
    })

    it('degrades missing pieces to null without failing', async () => {
        const sent = []
        const ok = await handleDeviceStatusSnapshot(
            { netsocketRole: 'device' },
            { requestId: 's2', broadcastData: {} },
            approvedDeps('g2-1', sent, {
                vars: memVars(),
                fetchWeather: async () => { throw new Error('down') },
            }),
        )
        assert.equal(ok, true)
        const snap = sent[0].broadcastData.snapshot
        assert.equal(snap.weather, null)
        assert.equal(snap.nextEvent, null)
        assert.equal(snap.home, null)
    })

    it('silently ignores non-device roles and unapproved sessions', async () => {
        const sent = []
        assert.equal(
            await handleDeviceStatusSnapshot({ netsocketRole: 'editor' }, {}, approvedDeps('g2-1', sent)),
            false,
        )
        assert.equal(
            await handleDeviceStatusSnapshot(
                { netsocketRole: 'device' },
                {},
                {
                    deviceAuth: { getSession: () => ({ authenticated: true, approved: false }) },
                    reply: (socket, payload) => sent.push(payload),
                },
            ),
            false,
        )
        assert.equal(sent.length, 0)
    })

    it('allows the getStatusSnapshot device purpose', () => {
        assert.equal(deviceAuth.isDevicePurposeAllowed('getStatusSnapshot'), true)
    })
})
