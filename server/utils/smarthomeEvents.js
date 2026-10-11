'use strict';

const { log, logColors } = require('../log')
const { triggerNodesByType } = require('../manager/execute')
const store = require('../manager/smarthomeStore')
const mqttClient = require('./mqttClient')

const EVENT_TITLE = 'Smart Home/Device Event'

const propFilter = (properties, key) => {
    if (!properties || properties[key] == null) return ''
    return String(properties[key]).trim()
}

// Empty node filter means "any". Availability events carry no uniqueId,
// so a node filtering on a specific UniqueId never matches those.
const nodeMatchesEvent = (properties, event) => {
    const idFilter = propFilter(properties, 'UniqueId')
    const capabilityFilter = propFilter(properties, 'Capability')
    const roomFilter = propFilter(properties, 'Room')
    if (idFilter && idFilter !== (event.uniqueId || '')) return false
    if (capabilityFilter && !(event.capabilities || []).includes(capabilityFilter)) return false
    if (roomFilter && roomFilter !== (event.room || '')) return false
    return true
}

const dispatchDeviceEvent = async (event, deps) => {
    const storeLib = (deps && deps.storeLib) || store
    const trigger = (deps && deps.trigger) || triggerNodesByType
    const deviceId = event && event.deviceId ? String(event.deviceId) : ''
    if (!deviceId) return { dispatched: false, reason: 'missing-device' }
    const device = storeLib.getDevice(deviceId)
    if (!device || device.status !== 'approved') return { dispatched: false, reason: 'not-approved' }
    let capabilities = ['availability']
    let room = device.room || ''
    if (event.kind === 'state' && event.uniqueId) {
        const entity = storeLib.getEntity(event.uniqueId)
        if (!entity) return { dispatched: false, reason: 'unknown-entity' }
        capabilities = entity.capabilities || []
    }
    const enriched = {
        kind: event.kind,
        uniqueId: event.uniqueId || '',
        deviceId,
        state: event.state == null ? '' : String(event.state),
        deviceName: device.friendlyName || deviceId,
        capabilities,
        room,
    }
    await trigger(EVENT_TITLE, {
        UniqueId: enriched.uniqueId,
        State: enriched.state,
        'Device Name': enriched.deviceName,
        Capability: capabilities[0] || '',
    }, { filter: (node) => nodeMatchesEvent(node && node.properties, enriched) })
    return { dispatched: true }
}

mqttClient.addStateListener((event) => {
    dispatchDeviceEvent(event).catch((err) => {
        log(`Smart Home event dispatch failed: ${err}`, logColors.Error)
    })
})

module.exports = { EVENT_TITLE, nodeMatchesEvent, dispatchDeviceEvent }
