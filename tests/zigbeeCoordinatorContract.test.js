'use strict';

// Contract test: the Home Assistant discovery payloads and topic shapes built
// by the ESP32-C6 Zigbee coordinator firmware
// (extensions/zigbeeCoordinator/src/mqtt_bridge.c) must parse and route through
// the server exactly like the reference C3 firmware does. If this fails, the
// coordinator firmware and the server have drifted apart.
//
// The firmware identifies a Zigbee device by its IEEE address, so the node id is
// stable across rejoins even though the Zigbee short address is not.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const discovery = require('../server/utils/mqttDiscovery');
const { resolveCommandMessage } = require('../server/utils/smarthomeCommands');

const IEEE = '00124b002243a1b7';
const NODE = `zb-${IEEE}`;
const OBJECT = '1-onoff';

const deviceBlock = (name) => ({
    identifiers: [NODE],
    name,
    manufacturer: 'Sonoff',
    model: 'ZBMicro',
    sw_version: '1.0.0',
});

// Mirrors the switch discovery payload in publish_discovery().
const switchDiscovery = () => ({
    device: deviceBlock('Kitchen outlet'),
    unique_id: `${NODE}-${OBJECT}`,
    object_id: `${NODE}_1_onoff`,
    name: 'Outlet',
    state_topic: `netsocket/dev/${NODE}/${OBJECT}/state`,
    command_topic: `netsocket/dev/${NODE}/${OBJECT}/set`,
    availability_topic: `netsocket/dev/${NODE}/availability`,
    payload_on: 'ON',
    payload_off: 'OFF',
    state_on: 'ON',
    state_off: 'OFF',
});

// Mirrors add_sensor_discovery() for the Electrical Measurement cluster.
const powerDiscovery = () => ({
    device: deviceBlock('Kitchen outlet'),
    unique_id: `${NODE}-1-power`,
    object_id: `${NODE}_1_power`,
    name: 'power',
    state_topic: `netsocket/dev/${NODE}/1-power/state`,
    unit_of_measurement: 'W',
    device_class: 'power',
    state_class: 'measurement',
});

describe('zigbee coordinator discovery contract', () => {
    it('parses the switch topic and payload the coordinator publishes', () => {
        const topic = discovery.parseDiscoveryTopic(
            `homeassistant/switch/${NODE}/${OBJECT}/config`, 'homeassistant'
        );
        assert.deepEqual(topic, { component: 'switch', nodeId: NODE, objectId: OBJECT });

        const result = discovery.parseDiscoveryPayload('switch', NODE, OBJECT, switchDiscovery());
        assert.equal(result.error, undefined);
        assert.equal(result.device.deviceId, NODE);
        assert.equal(result.device.name, 'Kitchen outlet');
        assert.equal(result.device.manufacturer, 'Sonoff');
        assert.equal(result.entity.uniqueId, `${NODE}-${OBJECT}`);
        assert.equal(result.entity.stateTopic, `netsocket/dev/${NODE}/${OBJECT}/state`);
        assert.equal(result.entity.commandTopic, `netsocket/dev/${NODE}/${OBJECT}/set`);
        assert.equal(result.entity.availabilityTopic, `netsocket/dev/${NODE}/availability`);
        assert.deepEqual(result.entity.capabilities, ['switch_state', 'switch_set']);
    });

    it('parses the power sensor entity as a reading', () => {
        const result = discovery.parseDiscoveryPayload('sensor', NODE, '1-power', powerDiscovery());
        assert.equal(result.error, undefined);
        assert.equal(result.entity.uniqueId, `${NODE}-1-power`);
        assert.equal(result.entity.deviceClass, 'power');
        assert.deepEqual(result.entity.capabilities, ['power_reading']);
    });

    it('ignores topics that are not discovery configs', () => {
        assert.equal(discovery.parseDiscoveryTopic(`netsocket/dev/${NODE}/${OBJECT}/state`, 'homeassistant'), null);
        assert.equal(discovery.parseDiscoveryTopic('homeassistant/switch/only/two', 'homeassistant'), null);
    });
});

describe('zigbee coordinator to server round trip', () => {
    let store;
    let mqttClient;

    beforeEach(() => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-zbcoord-'));
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

    it('routes discovery -> approve -> state -> command for a Zigbee outlet', async () => {
        const deps = { store, discovery, discoveryPrefix: 'homeassistant' };

        // 1. Coordinator publishes retained discovery after the interview.
        const routed = mqttClient.handleMessage(
            `homeassistant/switch/${NODE}/${OBJECT}/config`,
            Buffer.from(JSON.stringify(switchDiscovery())),
            deps
        );
        assert.equal(routed.kind, 'discovery');
        const pending = store.getDevice(NODE);
        assert.equal(pending.status, 'pending');
        assert.equal(pending.friendlyName, 'Kitchen outlet');

        // 2. Availability plus the state read back after the interview.
        mqttClient.handleMessage(`netsocket/dev/${NODE}/availability`, Buffer.from('online'), deps);
        mqttClient.handleMessage(`netsocket/dev/${NODE}/${OBJECT}/state`, Buffer.from('ON'), deps);
        assert.equal(store.getDevice(NODE).availability, 'online');
        assert.equal(store.getEntity(`${NODE}-${OBJECT}`).lastState, 'ON');

        // 3. Operator approves and names the device in the Smart Home inbox.
        store.setStatus(NODE, 'approved');
        store.rename(NODE, { room: 'Kitchen' });

        // 4. A graph command resolves to the exact payload the firmware expects.
        const entity = store.getEntity(`${NODE}-${OBJECT}`);
        const resolved = resolveCommandMessage(entity, 'Off', '');
        assert.equal(resolved.ok, true);
        assert.equal(resolved.message, 'OFF');

        const published = [];
        const result = await mqttClient.publishCommand(`${NODE}-${OBJECT}`, resolved.message, {
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
        assert.deepEqual(published[0], {
            topic: `netsocket/dev/${NODE}/${OBJECT}/set`,
            message: 'OFF',
        });
    });

    it('routes the power sensor entity and keeps it queryable', () => {
        const deps = { store, discovery, discoveryPrefix: 'homeassistant' };
        mqttClient.handleMessage(
            `homeassistant/sensor/${NODE}/1-power/config`,
            Buffer.from(JSON.stringify(powerDiscovery())),
            deps
        );
        store.setStatus(NODE, 'approved');
        mqttClient.handleMessage(`netsocket/dev/${NODE}/1-power/state`, Buffer.from('12.480'), deps);
        assert.equal(store.getEntity(`${NODE}-1-power`).lastState, '12.480');
    });
});
