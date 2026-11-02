'use strict';

const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate config behind a tmp DATA_DIR before the first require (repo pattern),
// then reuse one module instance: every network/pref/clock touchpoint goes
// through injected deps, so the only state is the service's own TTL cache.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-weather-'));
const originalDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = tmpDir;
const weatherService = require('../server/manager/weatherService');
if (originalDataDir === undefined) delete process.env.DATA_DIR;
else process.env.DATA_DIR = originalDataDir;
try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
} catch { /* ignore */ }

const OWM_JSON = {
    coord: { lon: -73.99, lat: 40.75 },
    weather: [{ id: 802, main: 'Clouds', description: 'broken clouds', icon: '04d' }],
    main: { temp: 71.6, feels_like: 73.4, temp_min: 66.1, temp_max: 78.2, humidity: 54.7 },
    wind: { speed: 8.05, deg: 270 },
    clouds: { all: 75 },
    dt: 1730500000,
    sys: { country: 'US', sunrise: 1730461200, sunset: 1730500800 },
    name: 'Manhattan',
};

const okResponse = (json) => ({ status: 200, json });

describe('weatherService', () => {
    let fakeNow;
    let fetchCalls;
    let deps;

    const stubFetch = (impl) => ({
        fetchOwm: async (url) => {
            fetchCalls.push(url);
            return impl(url);
        },
    });

    const baseDeps = (overrides = {}) => Object.assign({
        getSetting: () => 'test-key',
        clock: { now: () => fakeNow },
        fetchOwm: stubFetch(async () => okResponse(OWM_JSON)).fetchOwm,
    }, overrides);

    beforeEach(() => {
        weatherService.resetWeatherServiceForTests();
        fakeNow = 1730500000000;
        fetchCalls = [];
        deps = baseDeps();
    });

    it('registers the OpenWeatherMap preference', () => {
        const registry = require('../server/manager/nodePreferencesRegistry');
        const prefs = registry.getPrefs();
        const entry = prefs.find((p) => p.id === 'weather.openweathermap_api_key');
        assert.ok(entry, 'weather.openweathermap_api_key pref exists');
        assert.equal(entry.category, 'Weather');
    });

    it('normalizes OWM JSON into the compact client payload', async () => {
        const entry = await weatherService.fetchWeatherFor('Manhattan, US', 'f', deps);
        assert.equal(entry.error, undefined);
        assert.equal(entry.name, 'Manhattan');
        assert.equal(entry.country, 'US');
        assert.equal(entry.code, 802);
        assert.equal(entry.icon, '04d');
        assert.equal(entry.isDay, true);
        assert.equal(entry.label, 'broken clouds');
        assert.equal(entry.temp, 72);
        assert.equal(entry.feels, 73);
        assert.equal(entry.high, 78);
        assert.equal(entry.low, 66);
        assert.equal(entry.sunrise, 1730461200);
        assert.equal(entry.sunset, 1730500800);
        assert.equal(entry.fetchedAt, fakeNow);
        // Wind/humidity stay in OWM's JSON but never reach the client.
        assert.equal(entry.windSpeed, undefined);
        assert.equal(entry.windDeg, undefined);
        assert.equal(entry.humidity, undefined);
        // URL shape: encoded q, key, imperial units.
        assert.match(fetchCalls[0], /q=Manhattan%2C%20US/);
        assert.match(fetchCalls[0], /appid=test-key/);
        assert.match(fetchCalls[0], /units=imperial/);
    });

    it('uses metric units for celsius', async () => {
        const metricJson = JSON.parse(JSON.stringify(OWM_JSON));
        metricJson.main.temp = 22.4;
        deps = baseDeps({
            fetchOwm: stubFetch(async () => okResponse(metricJson)).fetchOwm,
        });
        const entry = await weatherService.fetchWeatherFor('Oslo', 'c', deps);
        assert.match(fetchCalls[0], /units=metric/);
        assert.equal(entry.temp, 22);
    });

    it('treats night icons as night and rejects unusable payloads', () => {
        const json = JSON.parse(JSON.stringify(OWM_JSON));
        json.weather[0].icon = '01n';
        const entry = weatherService.normalizeOwmJson(json, 1);
        assert.equal(entry.isDay, false);
        assert.equal(weatherService.normalizeOwmJson({}, 1), null);
        assert.equal(weatherService.normalizeOwmJson({ main: {} }, 1), null);
    });

    it('caches successful snapshots for an hour', async () => {
        const first = await weatherService.fetchWeatherFor('Manhattan, US', 'f', deps);
        fakeNow += 59 * 60 * 1000;
        const second = await weatherService.fetchWeatherFor('manhattan,  us', 'f', deps);
        assert.equal(fetchCalls.length, 1, 'cache hit regardless of case/spacing');
        assert.deepEqual(first, second);
        fakeNow += 2 * 60 * 1000; // past the 1h TTL
        await weatherService.fetchWeatherFor('Manhattan, US', 'f', deps);
        assert.equal(fetchCalls.length, 2);
    });

    it('maps a 404 to not_found and negative-caches it briefly', async () => {
        deps = baseDeps({
            fetchOwm: stubFetch(async () => ({ status: 404, json: null })).fetchOwm,
        });
        const entry = await weatherService.fetchWeatherFor('Nowhereville', 'f', deps);
        assert.deepEqual(entry, { error: 'not_found' });
        fakeNow += 4 * 60 * 1000; // inside the 5-min negative TTL
        await weatherService.fetchWeatherFor('Nowhereville', 'f', deps);
        assert.equal(fetchCalls.length, 1);
        fakeNow += 2 * 60 * 1000; // expired -> retry
        await weatherService.fetchWeatherFor('Nowhereville', 'f', deps);
        assert.equal(fetchCalls.length, 2);
    });

    it('maps thrown fetches and parse failures to fetch_failed', async () => {
        deps = baseDeps({ fetchOwm: () => { throw new Error('network down'); } });
        const thrown = await weatherService.fetchWeatherFor('Oslo', 'f', deps);
        assert.deepEqual(thrown, { error: 'fetch_failed' });
        weatherService.resetWeatherServiceForTests();
        fetchCalls = [];
        deps = baseDeps({ fetchOwm: async () => ({ status: 500, json: null }) });
        const status = await weatherService.fetchWeatherFor('Oslo', 'f', deps);
        assert.deepEqual(status, { error: 'fetch_failed' });
    });

    it('reports no_key without caching, so pasting a key recovers at once', async () => {
        let storedKey = '';
        const keyDeps = baseDeps({ getSetting: () => storedKey });
        const missing = await weatherService.fetchWeatherFor('Oslo', 'f', keyDeps);
        assert.deepEqual(missing, { error: 'no_key' });
        assert.equal(fetchCalls.length, 0, 'no upstream call without a key');
        storedKey = 'pasted-key';
        const withKey = await weatherService.fetchWeatherFor('Oslo', 'f', keyDeps);
        assert.equal(withKey.error, undefined);
        assert.equal(fetchCalls.length, 1);
    });

    it('rejects invalid locations without touching upstream', async () => {
        assert.deepEqual(await weatherService.fetchWeatherFor('', 'f', deps), { error: 'invalid_location' });
        assert.deepEqual(await weatherService.fetchWeatherFor(null, 'f', deps), { error: 'invalid_location' });
        assert.deepEqual(
            await weatherService.fetchWeatherFor('x'.repeat(101), 'f', deps),
            { error: 'invalid_location' }
        );
        assert.equal(fetchCalls.length, 0);
    });

    it('shares one in-flight fetch between concurrent polls', async () => {
        let resolveFetch;
        const gate = new Promise((resolve) => { resolveFetch = resolve; });
        deps = baseDeps({
            fetchOwm: async () => {
                fetchCalls.push('gated');
                await gate;
                return okResponse(OWM_JSON);
            },
        });
        const a = weatherService.fetchWeatherFor('Oslo', 'f', deps);
        const b = weatherService.fetchWeatherFor('Oslo', 'f', deps);
        resolveFetch();
        assert.deepEqual(await a, await b);
        assert.equal(fetchCalls.length, 1);
    });

    it('snapshotForWidgets dedupes by location+unit and keys entries as stored', async () => {
        const widgets = [
            { type: 'weather', location: 'Manhattan, US' },
            { type: 'weather', location: 'Manhattan, US' },          // dup -> one fetch
            { type: 'weather', location: 'Manhattan, US', unit: 'c' }, // unit split -> second fetch
            { type: 'weather', location: 'Oslo' },
            { type: 'clock' },
            { type: 'weather' },                                      // no location -> skipped
        ];
        const snapshot = await weatherService.snapshotForWidgets(widgets, deps);
        assert.deepEqual(Object.keys(snapshot).sort(), [
            'Manhattan, US|c',
            'Manhattan, US|f',
            'Oslo|f',
        ]);
        assert.equal(fetchCalls.length, 3);
        assert.deepEqual(await weatherService.snapshotForWidgets([], deps), {});
        assert.deepEqual(await weatherService.snapshotForWidgets('nope', deps), {});
    });

    it('entryKeyFor matches the client-side map key convention', () => {
        assert.equal(weatherService.entryKeyFor('Manhattan, US', 'f'), 'Manhattan, US|f');
        assert.equal(weatherService.entryKeyFor('Oslo', 'c'), 'Oslo|c');
        assert.equal(weatherService.entryKeyFor('Oslo', undefined), 'Oslo|f');
        assert.equal(weatherService.normalizeLocationKey('  Oslo   NO '), 'oslo no');
    });

    after(() => weatherService.resetWeatherServiceForTests());
});
