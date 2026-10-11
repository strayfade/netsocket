'use strict';

const fs = require('fs')
const path = require('path')
const { config } = require('../config')

const SMARTHOME_PATH = config.storage.smarthome

const STATUS = Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    DENIED: 'denied',
})

/** @type {{ version: number, devices: Record<string, object> }} */
let store = { version: 1, devices: {} }

const normalizeId = (value) => {
    if (value == null) return null
    const trimmed = String(value).trim()
    return trimmed || null
}

const loadJsonFile = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) return fallback
        const raw = fs.readFileSync(filePath, 'utf8')
        if (!raw.trim()) return fallback
        return JSON.parse(raw)
    } catch {
        return fallback
    }
}

const writeJsonAtomic = (filePath, data) => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    const tmp = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, filePath)
}

const persist = () => {
    writeJsonAtomic(SMARTHOME_PATH, store)
}

const load = () => {
    const raw = loadJsonFile(SMARTHOME_PATH, { version: 1, devices: {} })
    store = {
        version: 1,
        devices: raw && typeof raw.devices === 'object' && raw.devices ? raw.devices : {},
    }
}

const resetForTests = () => {
    store = { version: 1, devices: {} }
}

const publicEntityView = (entity) => {
    if (!entity) return null
    return {
        uniqueId: entity.uniqueId,
        component: entity.component,
        objectId: entity.objectId || '',
        name: entity.name == null ? null : entity.name,
        stateTopic: entity.stateTopic || '',
        commandTopic: entity.commandTopic || null,
        availabilityTopic: entity.availabilityTopic || null,
        deviceClass: entity.deviceClass || null,
        capabilities: Array.isArray(entity.capabilities) ? [...entity.capabilities] : [],
        lastState: entity.lastState !== undefined ? entity.lastState : null,
        lastStateAt: entity.lastStateAt || null,
    }
}

const publicDeviceView = (device) => {
    if (!device) return null
    const entities = Object.values(device.entities || {}).map(publicEntityView)
    return {
        deviceId: device.deviceId,
        friendlyName: device.friendlyName || '',
        room: device.room || '',
        manufacturer: device.manufacturer || '',
        model: device.model || '',
        source: device.source || 'bespoke',
        status: device.status,
        availability: device.availability || 'unknown',
        createdAt: device.createdAt || null,
        updatedAt: device.updatedAt || null,
        lastSeenAt: device.lastSeenAt || null,
        approvedAt: device.approvedAt || null,
        entities,
    }
}

const findEntityOwner = (uniqueId) => {
    const key = normalizeId(uniqueId)
    if (!key) return null
    for (const device of Object.values(store.devices)) {
        if (device.entities && device.entities[key]) return device
    }
    return null
}

const upsertFromDiscovery = ({ device, entity, source }) => {
    const deviceId = normalizeId(device && device.deviceId)
    const uniqueId = normalizeId(entity && entity.uniqueId)
    if (!deviceId || !uniqueId) return null
    const now = Date.now()
    let stored = store.devices[deviceId]
    if (!stored) {
        stored = {
            deviceId,
            friendlyName: (device.name || '').trim(),
            room: '',
            manufacturer: device.manufacturer || '',
            model: device.model || '',
            source: source || 'bespoke',
            status: STATUS.PENDING,
            availability: 'unknown',
            entities: {},
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
            approvedAt: null,
        }
        store.devices[deviceId] = stored
    } else {
        stored.manufacturer = device.manufacturer || stored.manufacturer || ''
        stored.model = device.model || stored.model || ''
        if (source) stored.source = source
        stored.updatedAt = now
        stored.lastSeenAt = now
    }
    const isNewEntity = !stored.entities[uniqueId]
    stored.entities[uniqueId] = {
        uniqueId,
        component: entity.component || '',
        nodeId: entity.nodeId || '',
        objectId: entity.objectId || '',
        name: entity.name === undefined ? null : entity.name,
        stateTopic: entity.stateTopic || '',
        commandTopic: entity.commandTopic || null,
        availabilityTopic: entity.availabilityTopic || null,
        deviceClass: entity.deviceClass || null,
        capabilities: Array.isArray(entity.capabilities) ? [...entity.capabilities] : [],
        lastState: stored.entities[uniqueId] ? stored.entities[uniqueId].lastState ?? null : null,
        lastStateAt: stored.entities[uniqueId] ? stored.entities[uniqueId].lastStateAt || null : null,
    }
    persist()
    return { deviceId, uniqueId, status: stored.status, created: isNewEntity }
}

const setStatus = (deviceId, status) => {
    const key = normalizeId(deviceId)
    if (!key || !store.devices[key]) return null
    if (!Object.values(STATUS).includes(status)) return null
    const stored = store.devices[key]
    stored.status = status
    stored.updatedAt = Date.now()
    if (status === STATUS.APPROVED) stored.approvedAt = Date.now()
    persist()
    return publicDeviceView(stored)
}

const rename = (deviceId, { friendlyName, room }) => {
    const key = normalizeId(deviceId)
    if (!key || !store.devices[key]) return null
    const stored = store.devices[key]
    if (friendlyName !== undefined) stored.friendlyName = String(friendlyName).trim()
    if (room !== undefined) stored.room = String(room).trim()
    stored.updatedAt = Date.now()
    persist()
    return publicDeviceView(stored)
}

const updateState = (uniqueId, state) => {
    const owner = findEntityOwner(uniqueId)
    if (!owner) return null
    const key = normalizeId(uniqueId)
    const entity = owner.entities[key]
    entity.lastState = state === undefined ? null : state
    entity.lastStateAt = Date.now()
    owner.lastSeenAt = Date.now()
    owner.updatedAt = Date.now()
    persist()
    return publicEntityView(entity)
}

const updateAvailability = (deviceId, availability) => {
    const key = normalizeId(deviceId)
    if (!key || !store.devices[key]) return null
    const normalized = normalizeId(availability)
    if (!['online', 'offline', 'unknown'].includes(normalized)) return null
    const stored = store.devices[key]
    stored.availability = normalized
    stored.lastSeenAt = Date.now()
    stored.updatedAt = Date.now()
    persist()
    return publicDeviceView(stored)
}

const getDevice = (deviceId) => {
    const key = normalizeId(deviceId)
    if (!key || !store.devices[key]) return null
    return publicDeviceView(store.devices[key])
}

const getEntity = (uniqueId) => {
    const owner = findEntityOwner(uniqueId)
    if (!owner) return null
    return publicEntityView(owner.entities[normalizeId(uniqueId)])
}

const listDevices = ({ status, room, capability } = {}) => {
    let all = Object.values(store.devices).map(publicDeviceView)
    if (status) all = all.filter((device) => device.status === status)
    if (room) all = all.filter((device) => device.room === room)
    if (capability) {
        all = all.filter((device) => device.entities.some(
            (entity) => entity.capabilities.includes(capability)
        ))
    }
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

load()

module.exports = {
    STATUS,
    upsertFromDiscovery,
    setStatus,
    rename,
    updateState,
    updateAvailability,
    getDevice,
    getEntity,
    listDevices,
    resetForTests,
    load,
}
