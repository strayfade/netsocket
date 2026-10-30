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
        assert.equal(
            Widgets.renderContent({ id: 'x', type: 'weather', x: 0, y: 0, w: 1, h: 1 }, {}, doc),
            null
        );
    });

    it('looks up automations by stringified id', () => {
        assert.equal(Widgets.automationFor({ automationId: 1 }, automations).title, 'Porch Light');
        assert.equal(Widgets.automationFor({ automationId: 'nope' }, automations), null);
        assert.equal(Widgets.automationFor(null, automations), null);
    });
});
