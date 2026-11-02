'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const Widgets = require('../frontend/public/js/widgets');

const automations = [
    { id: 1, title: 'Porch Light', type: 'Triggers/Button', runnable: true },
    { id: 2, title: 'Nightly', type: 'Triggers/Cron', runnable: false },
];

describe('widgets render module', () => {
    let doc;

    beforeEach(() => {
        doc = new JSDOM('<!DOCTYPE html><body></body>').window.document;
    });

    it('renders a runnable button with an accessible label', () => {
        let ran = null;
        const node = Widgets.renderContent(
            { id: 'b1', type: 'button', x: 0, y: 0, w: 1, h: 1, automationId: '1' },
            { automations, onRun: (item) => { ran = item; } },
            doc
        );
        assert.equal(node.tagName, 'BUTTON');
        assert.equal(node.getAttribute('aria-label'), 'Run Porch Light');
        assert.equal(node.disabled, false);
        node.click();
        assert.equal(ran.id, 1);
    });

    it('disables buttons whose automation is missing or not runnable', () => {
        const missing = Widgets.renderContent(
            { id: 'b9', type: 'button', x: 0, y: 0, w: 1, h: 1, automationId: '999' },
            { automations },
            doc
        );
        assert.equal(missing.disabled, true);
        const cron = Widgets.renderContent(
            { id: 'b2', type: 'button', x: 0, y: 0, w: 1, h: 1, automationId: '2' },
            { automations },
            doc
        );
        assert.equal(cron.disabled, true);
    });

    it('renders markdown without a visible title but with live hooks', () => {
        const node = Widgets.renderContent(
            { id: 'm1', type: 'markdown', x: 0, y: 0, w: 4, h: 2, variable: 'notes' },
            { variables: { notes: '# Hi' }, renderMarkdown: (t) => '<p>' + t + '</p>' },
            doc
        );
        assert.equal(node.getAttribute('data-widget-var'), 'notes');
        assert.equal(node.querySelector('h2'), null);
        const body = node.querySelector('[data-var-content="notes"]');
        assert.ok(body);
        assert.equal(body.innerHTML, '<p># Hi</p>');
        assert.ok(body.className.includes('widget-content-block'));
    });

    it('renders html without a visible title inside a sandboxed iframe', () => {
        const node = Widgets.renderContent(
            { id: 'h1', type: 'html', x: 0, y: 0, w: 4, h: 2, variable: 'cams' },
            { variables: { cams: '<b>x</b>' } },
            doc
        );
        assert.equal(node.querySelector('h2'), null);
        const frame = node.querySelector('iframe[data-var-frame="cams"]');
        assert.ok(frame);
        assert.ok(frame.hasAttribute('sandbox'));
    });

    it('renders clocks with optional date above the time', () => {
        const withDate = Widgets.renderContent(
            { id: 'c2', type: 'clock', x: 0, y: 0, w: 4, h: 2 }, {}, doc
        );
        assert.ok(!withDate.className.includes('widget-clock-compact'));
        assert.ok(withDate.querySelector('[data-clock-time]'));
        assert.ok(withDate.querySelector('[data-clock-date]'));
        const stack = withDate.querySelector('.widget-clock-stack');
        assert.ok(stack);
        assert.equal(stack.children[0].getAttribute('data-clock-date') !== null, true);
        assert.equal(stack.children[1].getAttribute('data-clock-time') !== null, true);

        const noDate = Widgets.renderContent(
            { id: 'c3', type: 'clock', x: 0, y: 0, w: 4, h: 2, showDate: false }, {}, doc
        );
        assert.equal(noDate.querySelector('[data-clock-date]'), null);
        assert.ok(noDate.querySelector('[data-clock-time]'));

        const compact = Widgets.renderContent(
            { id: 'c1', type: 'clock', x: 0, y: 0, w: 2, h: 1 }, {}, doc
        );
        assert.ok(compact.className.includes('widget-clock-compact'));
        assert.ok(compact.querySelector('[data-clock-date]'));
    });

    it('renders an interactive timer with local wheels and controls', () => {
        const node = Widgets.renderContent(
            { id: 't1', type: 'timer', x: 0, y: 0, w: 4, h: 4 }, {}, doc
        );
        assert.equal(node.getAttribute('data-widget-kind'), 'timer');
        assert.ok(node.querySelector('.widget-timer-picker'));
        assert.equal(node.querySelectorAll('.widget-timer-wheel').length, 3);
        assert.ok(node.querySelector('.widget-timer-btn--toggle'));
        assert.ok(node.querySelector('.widget-timer-btn--cancel'));
        assert.ok(node.querySelector('.widget-timer-controls'));
        assert.ok(node.querySelector('.widget-timer-stage'));
        assert.equal(Widgets.formatTimer(65), '01:05');
        assert.equal(Widgets.formatTimer(3661), '1:01:01');
    });

    it('plays a swelling done chime and can stop it', () => {
        const gainRamps = [];
        const oscillators = [];
        function mockGain() {
            const gain = {
                value: 1,
                setValueAtTime(v) { gain.value = v; },
                linearRampToValueAtTime(v, t) { gainRamps.push({ v, t }); },
                exponentialRampToValueAtTime(v, t) { gainRamps.push({ v, t }); },
                cancelScheduledValues() {},
                setTargetAtTime() {},
            };
            return { gain, connect() {}, stop() {} };
        }
        function mockOsc() {
            const osc = {
                type: 'sine',
                frequency: { value: 0 },
                connect() {},
                start() { oscillators.push(osc); },
                stop() {},
            };
            return osc;
        }
        const prevAC = globalThis.AudioContext;
        globalThis.AudioContext = function MockAudioContext() {
            this.currentTime = 10;
            this.state = 'running';
            this.destination = {};
            this.createGain = mockGain;
            this.createOscillator = mockOsc;
            this.resume = async () => {};
        };
        try {
            Widgets.stopTimerDoneSound();
            const stop = Widgets.playTimerDoneSound();
            assert.equal(typeof stop, 'function');
            assert.ok(oscillators.length >= 4);
            assert.ok(gainRamps.some((r) => r.v > 0.1 && r.t > 10));
            Widgets.stopTimerDoneSound();
        } finally {
            if (prevAC) globalThis.AudioContext = prevAC;
            else delete globalThis.AudioContext;
            Widgets.stopTimerDoneSound();
        }
    });

    it('picks timer column count from widget width', () => {
        assert.equal(Widgets.timerColsForWidth(2), 1);
        assert.equal(Widgets.timerColsForWidth(3), 1);
        assert.equal(Widgets.timerColsForWidth(4), 2);
        assert.equal(Widgets.timerColsForWidth(5), 2);
        assert.equal(Widgets.timerColsForWidth(6), 3);
        assert.equal(Widgets.timerColsForWidth(12), 3);
        const narrow = Widgets.renderContent(
            { id: 't2', type: 'timer', x: 0, y: 0, w: 2, h: 4 }, {}, doc
        );
        assert.equal(narrow.getAttribute('data-timer-cols'), '1');
        assert.equal(narrow.getAttribute('data-widget-w'), '2');
        const mid = Widgets.renderContent(
            { id: 't3', type: 'timer', x: 0, y: 0, w: 4, h: 4 }, {}, doc
        );
        assert.equal(mid.getAttribute('data-timer-cols'), '2');
        const wide = Widgets.renderContent(
            { id: 't4', type: 'timer', x: 0, y: 0, w: 6, h: 4 }, {}, doc
        );
        assert.equal(wide.getAttribute('data-timer-cols'), '3');
    });

    it('syncs size attrs from a grid-stack item after resize', () => {
        const item = Widgets.createItem(
            { id: 't5', type: 'timer', x: 0, y: 0, w: 2, h: 2 },
            {},
            doc
        );
        item.setAttribute('gs-w', '6');
        item.setAttribute('gs-h', '4');
        Widgets.syncItemSize(item);
        const root = item.querySelector('[data-widget-kind="timer"]');
        assert.equal(root.getAttribute('data-widget-w'), '6');
        assert.equal(root.getAttribute('data-widget-h'), '4');
        assert.equal(root.getAttribute('data-timer-cols'), '3');
    });

    it('builds full grid items with position attributes', () => {
        const item = Widgets.createItem(
            { id: 'b1', type: 'button', x: 2, y: 3, w: 1, h: 1, automationId: '1' },
            { automations },
            doc
        );
        assert.equal(item.className, 'grid-stack-item');
        assert.equal(item.getAttribute('gs-x'), '2');
        assert.equal(item.getAttribute('gs-y'), '3');
        assert.equal(item.getAttribute('gs-w'), '1');
        assert.equal(item.getAttribute('gs-h'), '1');
        assert.equal(item.getAttribute('gs-id'), 'b1');
        assert.ok(item.querySelector('.grid-stack-item-content button'));
    });

    it('returns null for unknown types', () => {
        assert.equal(
            Widgets.renderContent({ id: 'x', type: 'stats', x: 0, y: 0, w: 1, h: 1 }, {}, doc),
            null
        );
    });

    // --- Weather ------------------------------------------------------------

    const wxNowSec = () => Math.floor(Date.now() / 1000);
    const wxEntry = (over = {}) => Object.assign({
        fetchedAt: Date.now(),
        name: 'Manhattan',
        country: 'US',
        code: 800,
        icon: '01d',
        isDay: true,
        label: 'clear sky',
        temp: 72,
        feels: 74,
        high: 78,
        low: 60,
        sunrise: wxNowSec() - 3600,
        sunset: wxNowSec() + 3600,
    }, over);

    it('picks weather layout variants from the grid box', () => {
        assert.equal(Widgets.wxLayoutFor(1, 1), 'micro');
        assert.equal(Widgets.wxLayoutFor(1, 3), 'micro');
        assert.equal(Widgets.wxLayoutFor(2, 2), 'micro');
        assert.equal(Widgets.wxLayoutFor(2, 1), 'bar');
        assert.equal(Widgets.wxLayoutFor(12, 1), 'bar');
        assert.equal(Widgets.wxLayoutFor(4, 3), 'stack');
        assert.equal(Widgets.wxLayoutFor(2, 3), 'stack');
        assert.equal(Widgets.wxLayoutFor(6, 3), 'wide');
        assert.equal(Widgets.wxLayoutFor(12, 2), 'wide');
    });

    it('maps OWM condition codes to palettes and Material ligatures', () => {
        assert.equal(Widgets.wxConditionFor(800), 'clear');
        assert.equal(Widgets.wxConditionFor(802), 'few-clouds');
        assert.equal(Widgets.wxConditionFor(804), 'clouds');
        assert.equal(Widgets.wxConditionFor(501), 'rain');
        assert.equal(Widgets.wxConditionFor(300), 'rain');
        assert.equal(Widgets.wxConditionFor(211), 'storm');
        assert.equal(Widgets.wxConditionFor(601), 'snow');
        assert.equal(Widgets.wxConditionFor(741), 'mist');
        assert.equal(Widgets.wxConditionFor(-1), 'none');
        assert.equal(Widgets.wxIconFor(800, true), 'clear_day');
        assert.equal(Widgets.wxIconFor(800, false), 'clear_night');
        assert.equal(Widgets.wxIconFor(802, false), 'partly_cloudy_night');
        assert.equal(Widgets.wxIconFor(804, true), 'cloud');
        assert.equal(Widgets.wxIconFor(500, true), 'rainy');
        assert.equal(Widgets.wxIconFor(211, true), 'thunderstorm');
        assert.equal(Widgets.wxIconFor(601, true), 'cloudy_snowing');
        assert.equal(Widgets.wxIconFor(741, true), 'foggy');
    });

    it('buckets time of day from sunrise/sunset, falling back to Eastern hour', () => {
        const entry = { sunrise: wxNowSec() - 3600, sunset: wxNowSec() + 3600 };
        assert.equal(Widgets.wxTimeOfDay(entry, Date.now()), 'day');
        // Inside the ±45 min dawn/dusk windows.
        const dawn = { sunrise: wxNowSec() - 600, sunset: wxNowSec() + 6000 };
        assert.equal(Widgets.wxTimeOfDay(dawn, Date.now()), 'dawn');
        const dusk = { sunrise: wxNowSec() - 9000, sunset: wxNowSec() + 600 };
        assert.equal(Widgets.wxTimeOfDay(dusk, Date.now()), 'dusk');
        const night = { sunrise: wxNowSec() + 3600, sunset: wxNowSec() + 10000 };
        assert.equal(Widgets.wxTimeOfDay(night, Date.now()), 'night');
        // No sun times: hour-of-day in America/New_York (fixed UTC instants).
        const noSun = {};
        assert.equal(Widgets.wxTimeOfDay(noSun, Date.parse('2024-06-15T10:00:00Z')), 'dawn'); // 06:00 EDT
        assert.equal(Widgets.wxTimeOfDay(noSun, Date.parse('2024-06-15T16:00:00Z')), 'day');  // 12:00 EDT
        assert.equal(Widgets.wxTimeOfDay(noSun, Date.parse('2024-06-15T23:30:00Z')), 'dusk'); // 19:30 EDT
        assert.equal(Widgets.wxTimeOfDay(noSun, Date.parse('2024-01-15T04:00:00Z')), 'night'); // 23:00 EST
    });

    it('renders a populated weather card from the snapshot map', () => {
        const card = Widgets.renderContent(
            { id: 'wx1', type: 'weather', x: 0, y: 0, w: 4, h: 3, location: 'Manhattan, US' },
            { weatherMap: { 'Manhattan, US|f': wxEntry() } },
            doc
        );
        assert.equal(card.getAttribute('data-widget-kind'), 'weather');
        assert.equal(card.getAttribute('data-wx-layout'), 'stack');
        assert.equal(card.getAttribute('data-weather-key'), 'Manhattan, US|f');
        assert.equal(card.getAttribute('data-wx-unit'), 'f');
        assert.ok(card.className.includes('widget-weather--gradient'));
        assert.equal(card.getAttribute('data-wx-state'), 'ok');
        assert.equal(card.getAttribute('data-wx-condition'), 'clear');
        assert.equal(card.getAttribute('data-wx-tod'), 'day');
        assert.equal(card.querySelector('[data-wx-temp]').textContent, '72');
        assert.equal(card.querySelector('[data-wx-icon]').textContent, 'clear_day');
        assert.match(card.querySelector('[data-wx-name]').textContent, /Manhattan/);
        assert.match(card.querySelector('[data-wx-label]').textContent, /Clear sky/);
        assert.match(card.querySelector('[data-wx-high]').textContent, /High 78°F/);
        assert.match(card.querySelector('[data-wx-low]').textContent, /Low 60°F/);
        assert.match(card.querySelector('[data-wx-feels]').textContent, /Feels 74°F/);
        assert.ok(!card.hasAttribute('data-wx-tall'), 'h=3 is not tall');
        assert.equal(card.querySelector('[data-wx-wind]'), null, 'no wind detail');
        assert.equal(card.querySelector('[data-wx-humidity]'), null, 'no humidity detail');
        assert.ok(
            !card.querySelector('[data-wx-name]').className.includes('shell-skeleton'),
            'populated name carries no skeleton shimmer'
        );
        assert.ok(!card.querySelector('[data-wx-temp]').className.includes('shell-skeleton'));
    });

    it('honors metric + gradient-off weather widgets and shows error labels', () => {
        const metric = Widgets.renderContent(
            { id: 'wx2', type: 'weather', x: 0, y: 0, w: 12, h: 3, location: 'Oslo', unit: 'c', gradient: false },
            { weatherMap: { 'Oslo|c': wxEntry({ temp: 22 }) } },
            doc
        );
        assert.equal(metric.getAttribute('data-wx-layout'), 'wide');
        assert.equal(metric.getAttribute('data-wx-unit'), 'c');
        assert.ok(!metric.className.includes('widget-weather--gradient'));
        assert.equal(metric.querySelector('[data-wx-unit-char]').textContent, '°C');
        assert.match(metric.querySelector('[data-wx-high]').textContent, /High 78°C/);

        const missing = Widgets.renderContent(
            { id: 'wx3', type: 'weather', x: 0, y: 0, w: 2, h: 1, location: 'Nowhere' },
            {},
            doc
        );
        assert.equal(missing.getAttribute('data-wx-layout'), 'bar');
        assert.equal(missing.getAttribute('data-wx-state'), 'loading');
        assert.match(missing.querySelector('[data-wx-label]').textContent, /Loading weather/);
        assert.ok(missing.querySelector('[data-wx-temp]').className.includes('shell-skeleton'));

        const failed = Widgets.renderContent(
            { id: 'wx4', type: 'weather', x: 0, y: 0, w: 2, h: 1, location: 'Nowhere' },
            { weatherMap: { 'Nowhere|f': { error: 'no_key' } } },
            doc
        );
        assert.equal(failed.getAttribute('data-wx-state'), 'error');
        assert.match(failed.querySelector('[data-wx-label]').textContent, /Preferences/);
        assert.ok(!failed.className.includes('shell-skeleton'));
        assert.ok(!failed.querySelector('[data-wx-temp]').className.includes('shell-skeleton'));
        assert.ok(!failed.querySelector('[data-wx-name]').className.includes('shell-skeleton'));
    });

    it('refreshes weather cards in place from a newer snapshot map', () => {
        const host = doc.createElement('div');
        const card = Widgets.renderContent(
            { id: 'wx5', type: 'weather', x: 0, y: 0, w: 4, h: 2, location: 'Oslo' },
            {},
            doc
        );
        host.appendChild(card);
        doc.body.appendChild(host);
        assert.equal(card.getAttribute('data-wx-state'), 'loading');
        Widgets.refreshWeatherCards(host, { 'Oslo|f': wxEntry({ code: 500, label: 'light rain' }) });
        assert.equal(card.getAttribute('data-wx-state'), 'ok');
        assert.equal(card.getAttribute('data-wx-condition'), 'rain');
        assert.equal(card.querySelector('[data-wx-temp]').textContent, '72');
        // Missing key -> back to a labeled failure without a rebuild.
        Widgets.refreshWeatherCards(host, { 'Oslo|f': { error: 'fetch_failed' } });
        assert.equal(card.getAttribute('data-wx-state'), 'error');
        assert.match(card.querySelector('[data-wx-label]').textContent, /unavailable/);
    });

    it('re-applies weather layout when a grid item is resized', () => {
        const item = Widgets.createItem(
            { id: 'wx6', type: 'weather', x: 0, y: 0, w: 2, h: 2, location: 'Oslo' },
            {},
            doc
        );
        const root = item.querySelector('[data-widget-kind="weather"]');
        assert.equal(root.getAttribute('data-wx-layout'), 'micro');
        item.setAttribute('gs-w', '8');
        item.setAttribute('gs-h', '2');
        Widgets.syncItemSize(item);
        assert.equal(root.getAttribute('data-wx-layout'), 'wide');
    });

    it('spells out Feels like on cards taller than 3 rows and follows resizes', () => {
        const item = Widgets.createItem(
            { id: 'wx7', type: 'weather', x: 0, y: 0, w: 2, h: 4, location: 'Oslo' },
            { weatherMap: { 'Oslo|f': wxEntry() } },
            doc
        );
        const root = item.querySelector('[data-widget-kind="weather"]');
        assert.equal(root.getAttribute('data-wx-layout'), 'stack');
        assert.equal(root.getAttribute('data-wx-tall'), '');
        const feels = root.querySelector('[data-wx-feels]');
        assert.match(feels.textContent, /Feels like 74°F/);
        assert.ok(feels.className.includes('widget-weather-detail--feels'));
        // Shrinking below the tall threshold repaints the wording in place.
        item.setAttribute('gs-h', '3');
        Widgets.syncItemSize(item);
        assert.ok(!root.hasAttribute('data-wx-tall'));
        assert.equal(feels.textContent, 'Feels 74°F');
    });

    it('looks up automations by stringified id', () => {
        assert.equal(Widgets.automationFor({ automationId: 1 }, automations).title, 'Porch Light');
        assert.equal(Widgets.automationFor({ automationId: 'nope' }, automations), null);
        assert.equal(Widgets.automationFor(null, automations), null);
    });
});
