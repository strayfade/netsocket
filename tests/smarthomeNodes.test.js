'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveCommandMessage } = require('../server/utils/smarthomeCommands');

const switchEntity = (overrides) => ({
    uniqueId: 'c3-a4cf12ab-relay0',
    deviceId: 'netsocket-c3-a4cf12ab',
    component: 'switch',
    stateTopic: 'netsocket/dev/c3-a4cf12ab/relay0/state',
    commandTopic: 'netsocket/dev/c3-a4cf12ab/relay0/set',
    capabilities: ['switch_state', 'switch_set'],
    ...overrides,
});

describe('smarthomeCommands.resolveCommandMessage', () => {
    it('maps switch and cover presets case-insensitively', () => {
        assert.equal(resolveCommandMessage(switchEntity(), 'On').message, 'ON');
        assert.equal(resolveCommandMessage(switchEntity(), 'off').message, 'OFF');
        assert.equal(resolveCommandMessage(switchEntity(), 'TOGGLE').message, 'TOGGLE');
        const cover = switchEntity({ component: 'cover', capabilities: ['cover_set'] });
        assert.equal(resolveCommandMessage(cover, 'Open').message, 'OPEN');
        assert.equal(resolveCommandMessage(cover, 'close').message, 'CLOSE');
        assert.equal(resolveCommandMessage(cover, 'Stop').message, 'STOP');
    });

    it('passes raw payloads through and rejects empty ones', () => {
        const raw = resolveCommandMessage(switchEntity(), 'Raw Payload', '{"x":1}');
        assert.equal(raw.ok, true);
        assert.equal(raw.message, '{"x":1}');
        assert.equal(resolveCommandMessage(switchEntity(), 'Raw Payload', '').ok, false);
        assert.equal(resolveCommandMessage(switchEntity(), '', 'CUSTOM').message, 'CUSTOM');
    });

    it('rejects unsupported components, commands, and missing topics', () => {
        const sensor = switchEntity({ component: 'sensor', commandTopic: 't' });
        assert.match(resolveCommandMessage(sensor, 'On').error, /not supported/);
        assert.match(resolveCommandMessage(switchEntity(), 'Open').error, /not valid/);
        assert.match(
            resolveCommandMessage(switchEntity({ commandTopic: null }), 'On').error,
            /does not accept commands/
        );
        assert.match(resolveCommandMessage(null, 'On').error, /unknown/);
    });
});

describe('smarthomeEvents filtering and dispatch', () => {
    let events;
    let mqttClient;

    beforeEach(() => {
        delete require.cache[require.resolve('../server/utils/smarthomeEvents')];
        delete require.cache[require.resolve('../server/utils/mqttClient')];
        events = require('../server/utils/smarthomeEvents');
        mqttClient = require('../server/utils/mqttClient');
    });
    afterEach(() => { mqttClient.resetForTests(); });

    it('matches nodes on UniqueId, Capability, and Room filters', () => {
        const evt = { uniqueId: 'e1', capabilities: ['switch_state'], room: 'Kitchen' };
        assert.equal(events.nodeMatchesEvent({}, evt), true);
        assert.equal(events.nodeMatchesEvent({ UniqueId: 'e1' }, evt), true);
        assert.equal(events.nodeMatchesEvent({ UniqueId: 'other' }, evt), false);
        assert.equal(events.nodeMatchesEvent({ Capability: 'switch_state' }, evt), true);
        assert.equal(events.nodeMatchesEvent({ Capability: 'cover_set' }, evt), false);
        assert.equal(events.nodeMatchesEvent({ Room: 'Kitchen' }, evt), true);
        assert.equal(events.nodeMatchesEvent({ Room: 'Garage' }, evt), false);
        // Availability events carry no uniqueId: id-filtered nodes skip them.
        assert.equal(events.nodeMatchesEvent({ UniqueId: 'e1' }, { uniqueId: '', capabilities: ['availability'] }), false);
        assert.equal(events.nodeMatchesEvent({}, { uniqueId: '', capabilities: ['availability'] }), true);
    });

    it('dispatches only for approved devices and honours node filters', async () => {
        const triggers = [];
        const entity = { uniqueId: 'e1', capabilities: ['switch_state', 'switch_set'] };
        const fakeStore = {
            getDevice: () => ({ deviceId: 'd1', friendlyName: 'Kitchen Switch', room: 'Kitchen', status: 'approved' }),
            getEntity: () => entity,
        };
        const deps = { storeLib: fakeStore, trigger: async (t, i, o) => { triggers.push({ t, i, o }); } };
        const ok = await events.dispatchDeviceEvent({ kind: 'state', uniqueId: 'e1', deviceId: 'd1', state: 'ON' }, deps);
        assert.equal(ok.dispatched, true);
        assert.equal(triggers[0].i.UniqueId, 'e1');
        assert.equal(triggers[0].i.State, 'ON');
        assert.equal(triggers[0].i['Device Name'], 'Kitchen Switch');
        const filter = triggers[0].o.filter;
        assert.equal(filter({ properties: { UniqueId: 'e1' } }), true);
        assert.equal(filter({ properties: { UniqueId: 'other' } }), false);
        assert.equal(filter({ properties: { Room: 'Garage' } }), false);
    });

    it('refuses pending devices, unknown entities, and missing ids', async () => {
        let triggerCalls = 0;
        const deps = {
            storeLib: { getDevice: () => ({ status: 'pending' }), getEntity: () => null },
            trigger: async () => { triggerCalls += 1; },
        };
        const evt = { kind: 'state', uniqueId: 'e1', deviceId: 'd1', state: 'ON' };
        assert.equal((await events.dispatchDeviceEvent(evt, deps)).dispatched, false);
        assert.equal((await events.dispatchDeviceEvent({ ...evt, deviceId: '' }, deps)).dispatched, false);
        const unknownEntity = {
            storeLib: { getDevice: () => ({ status: 'approved' }), getEntity: () => null },
            trigger: async () => { triggerCalls += 1; },
        };
        assert.equal((await events.dispatchDeviceEvent(evt, unknownEntity)).dispatched, false);
        assert.equal(triggerCalls, 0);
    });
});

describe('smart-home mqtt nodes', () => {
    let store;
    let deviceCommand;
    let deviceQuery;
    let listDevices;
    let deviceEvent;

    beforeEach(() => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-smnodes-'));
        process.env.DATA_DIR = tmpDir;
        for (const mod of [
            '../server/config',
            '../server/manager/smarthomeStore',
            '../server/utils/mqttClient',
            '../server/utils/smarthomeEvents',
            '../server/utils/smarthomeCommands',
            '../server/nodes/smartHome/mqtt/deviceCommand',
            '../server/nodes/smartHome/mqtt/deviceQuery',
            '../server/nodes/smartHome/mqtt/listDevices',
            '../server/nodes/smartHome/mqtt/deviceEvent',
        ]) {
            delete require.cache[require.resolve(mod)];
        }
        store = require('../server/manager/smarthomeStore');
        store.resetForTests();
        deviceCommand = require('../server/nodes/smartHome/mqtt/deviceCommand');
        deviceQuery = require('../server/nodes/smartHome/mqtt/deviceQuery');
        listDevices = require('../server/nodes/smartHome/mqtt/listDevices');
        deviceEvent = require('../server/nodes/smartHome/mqtt/deviceEvent');
        store.upsertFromDiscovery({
            device: { deviceId: 'd1', name: 'Kitchen Switch' },
            entity: {
                uniqueId: 'e1', component: 'switch', nodeId: 'n', objectId: 'o',
                name: null, stateTopic: 's', commandTopic: 'c',
                availabilityTopic: null, deviceClass: null,
                capabilities: ['switch_state', 'switch_set'],
            },
            source: 'bespoke',
        });
        store.setStatus('d1', 'approved');
        store.rename('d1', { friendlyName: 'Kitchen Switch', room: 'Kitchen' });
        store.updateState('e1', 'ON');
    });

    const runNode = async (mod, params) => {
        const outputs = [];
        const groups = [];
        const behaviors = {
            populateNextNodeLinks: async (values) => { outputs.push(values); },
            getOutputNodeGroups: () => [groups],
            triggerNodeGroup: async (nodes) => { groups.push(nodes); },
        };
        const ok = await mod.NodeFunction({}, params, behaviors);
        return { ok, outputs, groups };
    };

    it('registers the four node titles exactly once', () => {
        for (const mod of [deviceCommand, deviceQuery, listDevices, deviceEvent]) {
            assert.ok(mod.NodeDefinition && mod.NodeFunction);
        }
        assert.equal(deviceCommand.NodeDefinition.prototype.title, 'Smart Home/Device Command');
        assert.equal(deviceQuery.NodeDefinition.prototype.title, 'Smart Home/Device Query');
        assert.equal(listDevices.NodeDefinition.prototype.title, 'Smart Home/List Devices');
        assert.equal(deviceEvent.NodeDefinition.prototype.title, 'Smart Home/Device Event');
    });

    it('fires Device Event outputs in declared order', async () => {
        const { ok, outputs, groups } = await runNode(deviceEvent, {
            UniqueId: 'e1', State: 'ON', 'Device Name': 'Kitchen Switch', Capability: 'switch_state',
        });
        assert.equal(ok, true);
        assert.deepEqual(outputs[0], [null, 'e1', 'ON', 'Kitchen Switch', 'switch_state']);
        assert.equal(groups.length, 1);
    });

    it('fails Device Command for unknown entities and invalid commands', async () => {
        const unknown = await runNode(deviceCommand, { UniqueId: 'nope', Command: 'On', Payload: '' });
        assert.equal(unknown.ok, false);
        assert.equal(unknown.outputs[0][1].ok, false);
        const invalid = await runNode(deviceCommand, { UniqueId: 'e1', Command: 'Open', Payload: '' });
        assert.equal(invalid.ok, false);
        assert.match(invalid.outputs[0][1].error, /not valid/);
    });

    it('reports broker-offline cleanly for valid commands', async () => {
        const { ok, outputs } = await runNode(deviceCommand, { UniqueId: 'e1', Command: 'On', Payload: '' });
        assert.equal(ok, false);
        assert.equal(outputs[0][1].ok, false);
        assert.match(outputs[0][1].error, /not connected/);
    });

    it('queries cached state and lists registry devices', async () => {
        const query = await runNode(deviceQuery, { UniqueId: 'e1' });
        assert.equal(query.ok, true);
        assert.equal(query.outputs[0][0], 'ON');
        assert.equal(query.outputs[0][2].friendlyName, 'Kitchen Switch');
        const missing = await runNode(deviceQuery, { UniqueId: 'nope' });
        assert.equal(missing.ok, false);
        const listed = await runNode(listDevices, { Status: 'approved', Room: '', Capability: '' });
        assert.equal(listed.ok, true);
        const devices = JSON.parse(listed.outputs[0][0]);
        assert.equal(devices.length, 1);
        assert.equal(devices[0].entities[0].uniqueId, 'e1');
        const filtered = await runNode(listDevices, { Status: 'approved', Room: '', Capability: 'cover_set' });
        assert.deepEqual(JSON.parse(filtered.outputs[0][0]), []);
    });
});
