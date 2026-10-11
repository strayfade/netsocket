'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const discovery = require('../server/utils/mqttDiscovery');

describe('mqttDiscovery.parseDiscoveryTopic', () => {
    it('parses the full five-segment discovery topic', () => {
        assert.deepEqual(
            discovery.parseDiscoveryTopic('homeassistant/switch/kitchen-sw/relay0/config'),
            { component: 'switch', nodeId: 'kitchen-sw', objectId: 'relay0' }
        );
    });

    it('falls back to objectId as nodeId for short topics', () => {
        assert.deepEqual(
            discovery.parseDiscoveryTopic('homeassistant/sensor/temp01/config'),
            { component: 'sensor', nodeId: 'temp01', objectId: 'temp01' }
        );
    });

    it('rejects non-config topics, wrong prefixes, and unknown components', () => {
        assert.equal(discovery.parseDiscoveryTopic('homeassistant/switch/a/b/state'), null);
        assert.equal(discovery.parseDiscoveryTopic('other/switch/a/b/config'), null);
        assert.equal(discovery.parseDiscoveryTopic('homeassistant/toaster/a/b/config'), null);
        assert.equal(discovery.parseDiscoveryTopic(''), null);
        assert.equal(discovery.parseDiscoveryTopic(null), null);
    });

    it('honours a custom discovery prefix', () => {
        assert.deepEqual(
            discovery.parseDiscoveryTopic('custom/light/room/lamp/config', 'custom'),
            { component: 'light', nodeId: 'room', objectId: 'lamp' }
        );
        assert.equal(
            discovery.parseDiscoveryTopic('homeassistant/light/room/lamp/config', 'custom'),
            null
        );
    });
});

describe('mqttDiscovery.parseDiscoveryPayload', () => {
    const switchPayload = () => ({
        device: { identifiers: ['netsocket-c3-a4cf12ab'], name: 'Kitchen Switch' },
        unique_id: 'c3-a4cf12ab-relay0',
        name: null,
        state_topic: 'netsocket/dev/c3-a4cf12ab/relay0/state',
        command_topic: 'netsocket/dev/c3-a4cf12ab/relay0/set',
        availability_topic: 'netsocket/dev/c3-a4cf12ab/availability',
    });

    it('normalizes a switch discovery payload with capabilities', () => {
        const result = discovery.parseDiscoveryPayload('switch', 'kitchen-sw', 'relay0', switchPayload());
        assert.equal(result.error, undefined);
        assert.equal(result.device.deviceId, 'netsocket-c3-a4cf12ab');
        assert.equal(result.entity.uniqueId, 'c3-a4cf12ab-relay0');
        assert.deepEqual(result.entity.capabilities, ['switch_state', 'switch_set']);
    });

    it('derives cover and button capabilities', () => {
        const cover = discovery.parseDiscoveryPayload('cover', 'blind', 'cover', {
            device: { identifiers: ['zb-abc'] },
            unique_id: 'zb-abc-cover',
            position_topic: 'zigbee2mqtt/Blind',
            set_position_topic: 'zigbee2mqtt/Blind/set',
        });
        assert.deepEqual(cover.entity.capabilities, ['cover_state', 'cover_position', 'cover_set']);
        const button = discovery.parseDiscoveryPayload('device_automation', 'btn', 'btn', {
            device: { identifiers: ['c3-99'] },
            unique_id: 'c3-99-btn0',
            automation_type: 'trigger',
            topic: 'netsocket/dev/c3-99/btn0/event',
        });
        assert.deepEqual(button.entity.capabilities, ['button_press']);
    });

    it('rejects payloads missing identity, topics, or object shape', () => {
        assert.match(discovery.parseDiscoveryPayload('switch', 'n', 'o', null).error, /object/);
        assert.match(discovery.parseDiscoveryPayload('switch', 'n', 'o', []).error, /object/);
        assert.match(discovery.parseDiscoveryPayload('switch', 'n', 'o', {}).error, /unique_id/);
        assert.match(
            discovery.parseDiscoveryPayload('switch', 'n', 'o', { unique_id: 'x' }).error,
            /identifiers/
        );
        assert.match(
            discovery.parseDiscoveryPayload(
                'switch', 'n', 'o',
                { unique_id: 'x', device: { identifiers: ['d'] } }
            ).error,
            /state_topic/
        );
    });
});
