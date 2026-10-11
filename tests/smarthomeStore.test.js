'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('smarthomeStore', () => {
    let store;

    beforeEach(() => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netsocket-smarthome-'));
        process.env.DATA_DIR = tmpDir;
        delete require.cache[require.resolve('../server/config')];
        delete require.cache[require.resolve('../server/manager/smarthomeStore')];
        store = require('../server/manager/smarthomeStore');
        store.resetForTests();
    });

    const disc = (overrides) => ({
        device: { deviceId: 'netsocket-c3-a4cf12ab', name: 'Kitchen Switch', ...overrides?.device },
        entity: {
            uniqueId: 'c3-a4cf12ab-relay0',
            component: 'switch',
            nodeId: 'kitchen-sw',
            objectId: 'relay0',
            name: null,
            stateTopic: 'netsocket/dev/c3-a4cf12ab/relay0/state',
            commandTopic: 'netsocket/dev/c3-a4cf12ab/relay0/set',
            availabilityTopic: 'netsocket/dev/c3-a4cf12ab/availability',
            deviceClass: null,
            capabilities: ['switch_state', 'switch_set'],
            ...overrides?.entity,
        },
        source: 'bespoke',
    });

    it('upserts discovery as pending and approves it', () => {
        const outcome = store.upsertFromDiscovery(disc());
        assert.equal(outcome.status, 'pending');
        assert.equal(outcome.created, true);
        const approved = store.setStatus('netsocket-c3-a4cf12ab', 'approved');
        assert.equal(approved.status, 'approved');
        const entity = store.getEntity('c3-a4cf12ab-relay0');
        assert.equal(entity.commandTopic, 'netsocket/dev/c3-a4cf12ab/relay0/set');
    });

    it('keeps entity identity stable across rename and rediscovery', () => {
        store.upsertFromDiscovery(disc());
        store.rename('netsocket-c3-a4cf12ab', { friendlyName: 'Kitchen', room: 'Kitchen' });
        const again = store.upsertFromDiscovery(disc());
        assert.equal(again.created, false);
        const device = store.getDevice('netsocket-c3-a4cf12ab');
        assert.equal(device.friendlyName, 'Kitchen');
        assert.equal(device.room, 'Kitchen');
        assert.equal(device.entities.length, 1);
    });

    it('tracks state and availability updates', () => {
        store.upsertFromDiscovery(disc());
        store.setStatus('netsocket-c3-a4cf12ab', 'approved');
        const entity = store.updateState('c3-a4cf12ab-relay0', 'ON');
        assert.equal(entity.lastState, 'ON');
        const device = store.updateAvailability('netsocket-c3-a4cf12ab', 'online');
        assert.equal(device.availability, 'online');
        assert.equal(store.updateAvailability('netsocket-c3-a4cf12ab', 'bogus'), null);
        assert.equal(store.updateState('missing-id', 'ON'), null);
    });

    it('filters listings by status, room, and capability', () => {
        store.upsertFromDiscovery(disc());
        store.rename('netsocket-c3-a4cf12ab', { room: 'Kitchen' });
        store.setStatus('netsocket-c3-a4cf12ab', 'approved');
        assert.equal(store.listDevices({ status: 'pending' }).length, 0);
        assert.equal(store.listDevices({ room: 'Kitchen' }).length, 1);
        assert.equal(store.listDevices({ capability: 'switch_set' }).length, 1);
        assert.equal(store.listDevices({ capability: 'cover_set' }).length, 0);
        assert.equal(store.setStatus('netsocket-c3-a4cf12ab', 'bogus'), null);
        assert.equal(store.upsertFromDiscovery({ device: {}, entity: {} }), null);
    });
});
