'use strict';

// Contract test: the JSON the ESP32-C3 reference firmware publishes
// (see firmware/esp32c3/src/common/netsocket_device.cpp — discoverySwitch
// and discoveryButton) must parse and route through the server. If this
// fails, firmware and server have drifted apart.
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const discovery = require('../server/utils/mqttDiscovery');
const { resolveCommandMessage } = require('../server/utils/smarthomeCommands');

const CHIP = 'c3-a4cf12ab34';

// Mirrors discoverySwitch() output.
const switchDiscovery = () => ({
    device: {
        identifiers: [CHIP],
        name: 'Kitchen Switch',
        manufacturer: 'netsocket-diy',
        model: 'C3-switch-v1',
        sw_version: '1.0.0',
    },
    unique_id: `${CHIP}-relay0`,
    object_id: `${CHIP}_relay0`,
    name: null,
    state_topic: `netsocket/dev/${CHIP}/relay0/state`,
    command_topic: `netsocket/dev/${CHIP}/relay0/set`,
    availability_topic: `netsocket/dev/${CHIP}/availability`,
    payload_on: 'ON',
    payload_off: 'OFF',
    state_on: 'ON',
    state_off: 'OFF',
});

// Mirrors discoveryButton() output.
const buttonDiscovery = () => ({
    device: {
        identifiers: [CHIP],
        name: 'Hall Button',
        manufacturer: 'netsocket-diy',
        model: 'C3-button-v1',
        sw_version: '1.0.0',
    },
    unique_id: `${CHIP}-btn0`,
    automation_type: 'trigger',
    type: 'button_short_press',
    subtype: 'button_1',
    topic: `netsocket/dev/${CHIP}/btn0/event`,
    payload: 'press',
});

describe('firmware discovery contract', () => {
    it('parses the switch discovery topic and payload', () => {
        const parsed = discovery.parseDiscoveryTopic(
            `homeassistant/switch/${CHIP}/relay0/config`, 'homeassistant'
        );
        assert.deepEqual(parsed, { component: 'switch', nodeId: CHIP, objectId: 'relay0' });

        const result = discovery.parseDiscoveryPayload('switch', CHIP, 'relay0', switchDiscovery());
        assert.equal(result.error, undefined);
        assert.equal(result.device.deviceId, CHIP);
        assert.equal(result.device.manufacturer, 'netsocket-diy');
        assert.equal(result.entity.uniqueId, `${CHIP}-relay0`);
        assert.equal(result.entity.commandTopic, `netsocket/dev/${CHIP}/relay0/set`);
        assert.deepEqual(result.entity.capabilities, ['switch_state', 'switch_set']);
    });

    it('parses the button discovery payload as a trigger', () => {
        const result = discovery.parseDiscoveryPayload('device_automation', CHIP, 'btn0', buttonDiscovery());
        assert.equal(result.error, undefined);
        assert.equal(result.entity.uniqueId, `${CHIP}-btn0`);
        assert.equal(result.entity.stateTopic, `netsocket/dev/${CHIP}/btn0/event`);
        assert.deepEqual(result.entity.capabilities, ['button_press']);
    });
});describe('firmware-to-server round trip', () => {
    let store;
    let mqttClient;

    beforeEach(() => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-fw-'));
        process.env.DATA_DIR = tmpDir;
        for (const mod of [
            '../server/config',
            '../server/manager/smarthomeStore',
            '../server/utils/mqttClient',
        ]) {
            delete require.cache[require.resolve(mod)];
        }
        store = require('../server/manager/smarthomeStore');
        store.resetForTests();
        mqttClient = require('../server/utils/mqttClient');
    });

    it('routes firmware publish → discovery → approve → state → command', async () => {
        const deps = { store, discovery, discoveryPrefix: 'homeassistant' };

        // 1. Device publishes retained discovery.
        const routed = mqttClient.handleMessage(
            `homeassistant/switch/${CHIP}/relay0/config`,
            Buffer.from(JSON.stringify(switchDiscovery())),
            deps
        );
        assert.equal(routed.kind, 'discovery');
        const pending = store.getDevice(CHIP);
        assert.equal(pending.status, 'pending');
        assert.equal(pending.friendlyName, 'Kitchen Switch');

        // 2. Availability + initial state.
        mqttClient.handleMessage(`netsocket/dev/${CHIP}/availability`, Buffer.from('online'), deps);
        mqttClient.handleMessage(`netsocket/dev/${CHIP}/relay0/state`, Buffer.from('ON'), deps);
        assert.equal(store.getDevice(CHIP).availability, 'online');
        assert.equal(store.getEntity(`${CHIP}-relay0`).lastState, 'ON');

        // 3. Operator approves and names it.
        store.setStatus(CHIP, 'approved');
        store.rename(CHIP, { room: 'Kitchen' });

        // 4. A graph command resolves and publishes to the firmware topic.
        const entity = store.getEntity(`${CHIP}-relay0`);
        const resolved = resolveCommandMessage(entity, 'Off', '');
        assert.equal(resolved.ok, true);
        assert.equal(resolved.message, 'OFF');

        const published = [];
        const result = await mqttClient.publishCommand(`${CHIP}-relay0`, resolved.message, {
            store,
            client: {
                connected: true,
                publish(topic, message, opts, cb) {
                    published.push({ topic, message });
                    if (cb) cb(null);
                },
            },
        });
        assert.equal(result.ok, true);
        assert.deepEqual(published[0], { topic: `netsocket/dev/${CHIP}/relay0/set`, message: 'OFF' });
    });

    it('surfaces a button as a trigger entity', () => {
        const deps = { store, discovery, discoveryPrefix: 'homeassistant' };
        mqttClient.handleMessage(
            `homeassistant/device_automation/${CHIP}/btn0/config`,
            Buffer.from(JSON.stringify(buttonDiscovery())),
            deps
        );
        const entity = store.getEntity(`${CHIP}-btn0`);
        assert.deepEqual(entity.capabilities, ['button_press']);
        assert.equal(entity.commandTopic, null);
    });
});