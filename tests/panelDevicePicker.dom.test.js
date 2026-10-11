'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { attach, MAX_DEVICES } = require('../frontend/public/js/panelDevicePicker');

const html = `
<label for="edit-panel-device-search">Devices <span id="edit-panel-device-count"></span></label>
<div id="edit-panel-devices">
  <input id="edit-panel-device-search" role="combobox" aria-expanded="false" aria-controls="edit-panel-device-results">
  <div id="edit-panel-device-results" role="listbox" hidden></div>
  <p id="edit-panel-device-empty">No devices assigned.</p>
  <ul id="edit-panel-device-assigned"></ul>
  <p id="edit-panel-device-note" hidden></p>
</div>
`;

function devices() {
    const list = [];
    for (let i = 1; i <= 12; i += 1) {
        list.push({
            deviceId: `dev-${i}`,
            name: `Tablet ${i}`,
            platform: i % 2 === 0 ? 'android' : 'overlay',
            status: 'approved',
        });
    }
    list.push({
        deviceId: 'kitchen-display',
        name: 'Kitchen display',
        platform: 'android',
        status: 'approved',
    });
    list.push({
        deviceId: 'pending-phone',
        name: 'Pending phone',
        platform: 'android',
        status: 'pending',
    });
    return list;
}

function panels() {
    return [
        { id: 'kitchen', name: 'Kitchen', room: 'Downstairs', deviceIds: ['kitchen-display'] },
        { id: 'hall', name: 'Hall', room: '', deviceIds: ['dev-2'] },
        { id: 'office', name: 'Office', room: '', deviceIds: ['dev-1'] },
    ];
}

function setup() {
    const dom = new JSDOM(`<body>${html}</body>`, { url: 'http://127.0.0.1/' });
    const document = dom.window.document;
    let panelId = 'hall';
    const picker = attach(document.getElementById('edit-panel-devices'), {
        getDevices: devices,
        getPanels: () => panels(),
        getPanelId: () => panelId,
    });
    return { document, picker, setPanelId: (id) => { panelId = id; } };
}

function titles(document) {
    return [...document.querySelectorAll('.panel-device-row-title')].map((el) => el.textContent);
}

function optionTitles(document) {
    return [...document.querySelectorAll('.panel-device-option-title')].map((el) => el.textContent);
}

describe('panel device picker', () => {
    let document;
    let picker;

    beforeEach(() => {
        ({ document, picker } = setup());
    });

    it('shows only assigned devices until the search is opened', () => {
        picker.setSelected(['dev-1', 'missing-id']);
        assert.deepEqual(titles(document), ['Tablet 1', 'Unapproved device']);
        assert.equal(document.getElementById('edit-panel-device-results').hidden, true);
        assert.equal(document.getElementById('edit-panel-device-count').textContent, '2 assigned');
        assert.equal(document.getElementById('edit-panel-device-empty').hidden, true);
        assert.match(document.querySelector('.panel-device-row-meta').textContent, /Also on Office/);
    });

    it('filters the add list by another panel name and adds the match', () => {
        picker.setSelected(['dev-1']);
        const input = document.getElementById('edit-panel-device-search');
        input.focus();
        input.value = 'downstairs';
        input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));

        assert.deepEqual(optionTitles(document), ['Kitchen display']);
        assert.match(document.querySelector('.panel-device-option-meta').textContent, /On Kitchen \(Downstairs\)/);

        document.querySelector('.panel-device-option').dispatchEvent(
            new document.defaultView.MouseEvent('mousedown', { bubbles: true })
        );
        assert.deepEqual(picker.getDeviceIds(), ['dev-1', 'kitchen-display']);
        assert.equal(input.value, '');
        assert.equal(optionTitles(document).includes('Kitchen display'), false);
    });

    it('does not offer pending devices or devices already assigned', () => {
        picker.setSelected([]);
        const input = document.getElementById('edit-panel-device-search');
        input.focus();
        input.value = 'pending';
        input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
        assert.equal(document.querySelector('.panel-device-result-empty').textContent, 'No devices match that search.');
    });

    it('adds the highlighted device with Enter and removes it from the assigned list', () => {
        picker.setSelected([]);
        const input = document.getElementById('edit-panel-device-search');
        input.focus();
        assert.equal(document.getElementById('edit-panel-device-results').hidden, false);
        assert.equal(document.querySelectorAll('.panel-device-option').length > 1, true);
        input.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        assert.equal(picker.getDeviceIds().length, 1);
        document.querySelector('.panel-device-remove').click();
        assert.deepEqual(picker.getDeviceIds(), []);
        assert.equal(document.getElementById('edit-panel-device-empty').hidden, false);
    });

    it('stops adding at the panel device cap', () => {
        const ids = [];
        for (let i = 0; i < MAX_DEVICES; i += 1) ids.push(`extra-${i}`);
        picker.setSelected(ids);
        assert.equal(picker.getDeviceIds().length, MAX_DEVICES);
        const input = document.getElementById('edit-panel-device-search');
        input.focus();
        input.value = 'Kitchen';
        input.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
        input.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        assert.equal(picker.getDeviceIds().includes('kitchen-display'), false);
        assert.match(document.getElementById('edit-panel-device-note').textContent, /20 devices/);
    });
});
