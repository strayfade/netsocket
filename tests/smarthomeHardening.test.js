'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mqttClient = require('../server/utils/mqttClient');
const discovery = require('../server/utils/mqttDiscovery');

const makeFakeClient = (connected = true) => {
    const handlers = {};
    return {
        handlers,
        connected,
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

const settingsWith = (overrides) => ({
    getSetting: (key) => (key in overrides ? overrides[key] : ''),
});

describe('mqttClient TLS options', () => {
    afterEach(() => { mqttClient.resetForTests(); });

    it('builds plain options by default', () => {
        const built = mqttClient.buildMqttOptions({
            url: 'mqtt://broker:1883', username: 'u', password: 'p', tls: false,
        }, () => '');
        assert.equal(built.url, 'mqtt://broker:1883');
        assert.equal(built.options.username, 'u');
        assert.equal(built.options.password, 'p');
        assert.equal(built.options.clean, false);
        assert.equal(built.options.clientId, 'netsocket-server');
        assert.equal(built.options.rejectUnauthorized, undefined);
    });

    it('allows a custom client id', () => {
        const built = mqttClient.buildMqttOptions({
            url: 'mqtt://broker:1883', clientId: 'custom-id', tls: false,
        }, () => '');
        assert.equal(built.options.clientId, 'custom-id');
    });

    it('upgrades to mqtts and loads the CA when TLS is on', () => {
        const built = mqttClient.buildMqttOptions({
            url: 'mqtt://broker:8883', tls: true, rejectUnauthorized: true, caFile: '/certs/ca.crt',
        }, (file) => `PEM:${file}`);
        assert.equal(built.url, 'mqtts://broker:8883');
        assert.equal(built.options.ca, 'PEM:/certs/ca.crt');
        assert.equal(built.options.rejectUnauthorized, true);
    });

    it('leaves an already-secure URL untouched', () => {
        const built = mqttClient.buildMqttOptions({ url: 'mqtts://b:8883', tls: true, rejectUnauthorized: false }, () => '');
        assert.equal(built.url, 'mqtts://b:8883');
        assert.equal(built.options.rejectUnauthorized, false);
    });

    it('fails closed when the CA file cannot be read', () => {
        const built = mqttClient.buildMqttOptions(
            { url: 'mqtt://b:8883', tls: true, caFile: '/missing.crt' },
            () => { throw new Error('ENOENT'); }
        );
        assert.match(built.error, /CA file could not be read/);
    });

    it('reads tls settings from the settings store', () => {
        const cfg = mqttClient.getMqttConfig(settingsWith({
            'smarthome.mqtt.url': 'mqtt://x:1883',
            'smarthome.mqtt.tls': 'true',
            'smarthome.mqtt.caFile': '/ca.pem',
            'smarthome.mqtt.rejectUnauthorized': 'false',
        }));
        assert.equal(cfg.tls, true);
        assert.equal(cfg.caFile, '/ca.pem');
        assert.equal(cfg.rejectUnauthorized, false);
    });
});describe('mqttClient offline command queue', () => {
    afterEach(() => { mqttClient.resetForTests(); });

    it('queues while disconnected and flushes on reconnect', async () => {
        const fake = makeFakeClient(false);
        const store = {
            getEntity: () => ({ uniqueId: 'e1', commandTopic: 'netsocket/dev/d1/relay0/set' }),
            listDevices: () => [],
        };
        mqttClient.initSmartHomeMqtt({
            settings: settingsWith({ 'smarthome.mqtt.url': 'mqtt://x:1883' }),
            mqttLib: { connect: () => fake },
            store,
        });

        const queued = await mqttClient.publishCommand('e1', 'ON', { store, client: fake });
        assert.equal(queued.ok, false);
        assert.equal(queued.queued, true);
        assert.equal(mqttClient.getStatus().queued, 1);
        assert.equal(fake.published.length, 0);

        fake.connected = true;
        fake.handlers.connect();
        assert.equal(fake.published.length, 1);
        assert.equal(fake.published[0].topic, 'netsocket/dev/d1/relay0/set');
        assert.equal(fake.published[0].message, 'ON');
        assert.equal(mqttClient.getStatus().queued, 0);
    });

    it('bounds the queue and drops the oldest entries', async () => {
        const fake = makeFakeClient(false);
        const store = {
            getEntity: () => ({ uniqueId: 'e1', commandTopic: 'netsocket/dev/d1/relay0/set' }),
            listDevices: () => [],
        };
        mqttClient.initSmartHomeMqtt({
            settings: settingsWith({ 'smarthome.mqtt.url': 'mqtt://x:1883' }),
            mqttLib: { connect: () => fake },
            store,
        });
        for (let i = 0; i < 105; i++) {
            await mqttClient.publishCommand('e1', String(i), { store, client: fake });
        }
        assert.equal(mqttClient.getStatus().queued, 100);
        fake.connected = true;
        fake.handlers.connect();
        assert.equal(fake.published.length, 100);
        assert.equal(fake.published[0].message, '5');
    });
});

describe('Zigbee value_template state extraction', () => {
    afterEach(() => { mqttClient.resetForTests(); });

    it('parses single-key value templates', () => {
        assert.equal(discovery.parseValueTemplate('{{ value_json.state }}'), 'state');
        assert.equal(discovery.parseValueTemplate('{{value_json.brightness}}'), 'brightness');
        assert.equal(discovery.parseValueTemplate('static text'), null);
        assert.equal(discovery.parseValueTemplate(''), null);
    });

    it('stores the state path from discovery', () => {
        const result = discovery.parseDiscoveryPayload('switch', 'n', 'o', {
            device: { identifiers: ['zigbee2mqtt_0xabc'] },
            unique_id: 'zb-cover-state',
            state_topic: 'zigbee2mqtt/Blind',
            command_topic: 'zigbee2mqtt/Blind/set',
            value_template: '{{ value_json.state }}',
        });
        assert.equal(result.entity.statePath, 'state');
    });

    it('extracts the templated field on ingest', () => {
        const seen = {};
        const fakeStore = {
            listDevices: () => [{
                deviceId: 'zb-1',
                entities: [{
                    uniqueId: 'zb-blind-state',
                    stateTopic: 'zigbee2mqtt/Blind',
                    availabilityTopic: null,
                    statePath: 'state',
                }],
            }],
            updateState: (id, value) => { seen[id] = value; },
            updateAvailability: () => {},
        };
        mqttClient.rebuildTopicIndex(fakeStore);
        mqttClient.handleMessage(
            'zigbee2mqtt/Blind',
            Buffer.from(JSON.stringify({ state: 'ON', brightness: 120 })),
            { store: fakeStore, discovery, discoveryPrefix: 'homeassistant' }
        );
        assert.equal(seen['zb-blind-state'], 'ON');

        // Falls back to raw text when the payload is not the expected JSON.
        mqttClient.handleMessage(
            'zigbee2mqtt/Blind',
            Buffer.from('OFF'),
            { store: fakeStore, discovery, discoveryPrefix: 'homeassistant' }
        );
        assert.equal(seen['zb-blind-state'], 'OFF');
    });
});