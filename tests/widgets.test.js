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

    it('renders compact and full landscape clocks with tick hooks and no title', () => {
        const compact = Widgets.renderContent(
            { id: 'c1', type: 'clock', x: 0, y: 0, w: 2, h: 1 }, {}, doc
        );
        assert.ok(compact.className.includes('widget-clock-compact'));
        assert.equal(compact.querySelector('h2'), null);
        const full = Widgets.renderContent(
            { id: 'c2', type: 'clock', x: 0, y: 0, w: 4, h: 2 }, {}, doc
        );
        assert.ok(!full.className.includes('widget-clock-compact'));
        assert.equal(full.querySelector('h2'), null);
        assert.ok(full.querySelector('[data-clock-time]'));
        assert.ok(full.querySelector('[data-clock-date]'));
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
