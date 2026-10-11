'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mqttClient = require('../server/utils/mqttClient');
const discovery = require('../server/utils/mqttDiscovery');

const emptySettings = { getSetting: () => '' };

const makeFakeClient = () => {
    const handlers = {};
    return {
        handlers,
        connected: true,
        published: [],
        on(event, fn) { handlers[event] = fn; },
        subscribe(topics, cb) { if (cb) cb(null); },
        publish(topic, message, opts, cb) {
            this.published.push({ topic, message });
            if (cb) cb(null);
        },
        end() {},
    };
};

describe('mqttClient', () => {
    afterEach(() => { mqttClient.resetForTests(); });

    it('fails closed when no broker URL is configured', () => {
        let connectCalled = false;
        const result = mqttClient.initSmartHomeMqtt({
            settings: emptySettings,
            mqttLib: { connect: () => { connectCalled = true; } },
        });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'not-configured');
        assert.equal(connectCalled, false);
    });

    it('connects and subscribes to discovery plus state topics', () => {
        const fake = makeFakeClient();
        const mqttLib = { connect: () => fake };
        const result = mqttClient.initSmartHomeMqtt({
            settings: { getSetting: (key) => (key === 'smarthome.mqtt.url' ? 'mqtt://x:1883' : '') },
            mqttLib,
            store: { listDevices: () => [] },
        });
        assert.equal(result.ok, true);
        fake.handlers.connect();
        assert.equal(mqttClient.getStatus().connected, true);
    });

    it('routes discovery messages into the registry', () => {
        const calls = [];
        const fakeStore = {
            listDevices: () => [],
            upsertFromDiscovery: (args) => { calls.push(args); return { deviceId: 'd1' }; },
        };
        const payload = {
            device: { identifiers: ['d1'], name: 'Test Switch' },
            unique_id: 'e1',
            state_topic: 'netsocket/dev/d1/relay/state',
            command_topic: 'netsocket/dev/d1/relay/set',
        };
        const deps = { store: fakeStore, discovery, discoveryPrefix: 'homeassistant' };
        const routed = mqttClient.handleMessage(
            'homeassistant/switch/n/e/config', Buffer.from(JSON.stringify(payload)), deps
        );
        assert.equal(routed.routed, true);
        assert.equal(routed.kind, 'discovery');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].source, 'bespoke');
    });

    it('rejects malformed discovery without crashing', () => {
        const fakeStore = { listDevices: () => [], upsertFromDiscovery: () => ({}) };
        const deps = { store: fakeStore, discovery, discoveryPrefix: 'homeassistant' };
        const badJson = mqttClient.handleMessage(
            'homeassistant/switch/n/e/config', Buffer.from('not json'), deps
        );
        assert.equal(badJson.kind, 'discovery-invalid');
        const missingId = mqttClient.handleMessage(
            'homeassistant/switch/n/e/config',
            Buffer.from(JSON.stringify({ device: { identifiers: ['d'] } })),
            deps
        );
        assert.equal(missingId.kind, 'discovery-rejected');
        const unknown = mqttClient.handleMessage('some/other/topic', Buffer.from('x'), deps);
        assert.equal(unknown.routed, false);
    });

    it('routes state and availability via the topic index', () => {
        const seen = {};
        const fakeStore = {
            listDevices: () => [{
                deviceId: 'd1',
                entities: [{
                    uniqueId: 'e1',
                    stateTopic: 'netsocket/dev/d1/relay/state',
                    availabilityTopic: 'netsocket/dev/d1/availability',
                }],
            }],
            updateState: (id, state) => { seen.state = [id, state]; },
            updateAvailability: (id, value) => { seen.avail = [id, value]; },
        };
        mqttClient.rebuildTopicIndex(fakeStore);
        const deps = { store: fakeStore, discovery, discoveryPrefix: 'homeassistant' };
        const state = mqttClient.handleMessage('netsocket/dev/d1/relay/state', Buffer.from('ON'), deps);
        assert.equal(state.kind, 'state');
        assert.deepEqual(seen.state, ['e1', 'ON']);
        const avail = mqttClient.handleMessage('netsocket/dev/d1/availability', Buffer.from('online'), deps);
        assert.equal(avail.kind, 'availability');
        assert.deepEqual(seen.avail, ['d1', 'online']);
    });

    it('publishes commands only for known entities with topics', async () => {
        const fake = makeFakeClient();
        const deps = {
            store: {
                getEntity: (id) => (id === 'e1'
                    ? { uniqueId: 'e1', commandTopic: 'netsocket/dev/d1/relay/set' }
                    : null),
            },
            client: fake,
        };
        const ok = await mqttClient.publishCommand('e1', 'ON', deps);
        assert.equal(ok.ok, true);
        assert.equal(fake.published[0].topic, 'netsocket/dev/d1/relay/set');
        assert.equal((await mqttClient.publishCommand('missing', 'ON', deps)).ok, false);
        const noTopic = await mqttClient.publishCommand('e1', 'ON', {
            store: { getEntity: () => ({ uniqueId: 'e1', commandTopic: null }) },
            client: fake,
        });
        assert.equal(noTopic.ok, false);
        const offline = await mqttClient.publishCommand('e1', 'ON', {
            store: deps.store,
            client: { ...fake, connected: false },
        });
        assert.equal(offline.ok, false);
    });
});
