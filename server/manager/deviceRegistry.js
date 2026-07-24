'use strict';

const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const {
    generateEd25519KeyPair,
    signEd25519,
} = require('../utils/deviceCrypto')

const DEVICES_PATH = config.storage.devices
const SERVER_IDENTITY_PATH = config.storage.serverIdentity

const STATUS = Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    DENIED: 'denied',
})

/** @type {{ version: number, devices: Record<string, object> }} */
let store = { version: 1, devices: {} }

/** @type {{ publicKeyB64: string, privateKeyB64: string } | null} */
let serverIdentity = null

const normalizeDeviceId = (value) => {
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

const ensureServerIdentity = () => {
    if (serverIdentity?.publicKeyB64 && serverIdentity?.privateKeyB64) {
        return serverIdentity
    }
    const existing = loadJsonFile(SERVER_IDENTITY_PATH, null)
    if (existing?.publicKeyB64 && existing?.privateKeyB64) {
        serverIdentity = {
            publicKeyB64: existing.publicKeyB64,
            privateKeyB64: existing.privateKeyB64,
        }
        return serverIdentity
    }
    const generated = generateEd25519KeyPair()
    serverIdentity = {
        publicKeyB64: generated.publicKeyB64,
        privateKeyB64: generated.privateKeyB64,
    }
    writeJsonAtomic(SERVER_IDENTITY_PATH, {
        version: 1,
        publicKeyB64: serverIdentity.publicKeyB64,
        privateKeyB64: serverIdentity.privateKeyB64,
        createdAt: Date.now(),
    })
    return serverIdentity
}

const persist = () => {
    writeJsonAtomic(DEVICES_PATH, store)
}

const load = () => {
    const raw = loadJsonFile(DEVICES_PATH, { version: 1, devices: {} })
    store = {
        version: 1,
        devices: raw && typeof raw.devices === 'object' && raw.devices ? raw.devices : {},
    }
    ensureServerIdentity()
}

const getServerIdentityPublicKey = () => ensureServerIdentity().publicKeyB64

const signWithServerIdentity = (message) => {
    const identity = ensureServerIdentity()
    return signEd25519(identity.privateKeyB64, message)
}

const publicDeviceView = (device) => {
    if (!device) return null
    return {
        deviceId: device.deviceId,
        name: device.name || '',
        platform: device.platform || '',
        status: device.status,
        ipAddress: device.ipAddress || '',
        identityPublicKey: device.identityPublicKey || '',
        createdAt: device.createdAt || null,
        updatedAt: device.updatedAt || null,
        lastSeenAt: device.lastSeenAt || null,
        approvedAt: device.approvedAt || null,
        deniedAt: device.deniedAt || null,
    }
}

const listDevices = ({ status } = {}) => {
    const all = Object.values(store.devices).map(publicDeviceView)
    if (!status) {
        return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    }
    return all
        .filter((d) => d.status === status)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

const getDevice = (deviceId) => {
    const id = normalizeDeviceId(deviceId)
    if (!id) return null
    return store.devices[id] || null
}

const getDevicePublic = (deviceId) => publicDeviceView(getDevice(deviceId))

/**
 * Upsert a device hello. New devices start pending.
 * Re-hellos from denied devices stay denied until an admin clears them.
 * Public key changes on an approved device force re-approval (pending).
 */
const upsertFromHello = ({
    deviceId,
    identityPublicKey,
    name,
    platform,
    ipAddress,
}) => {
    const id = normalizeDeviceId(deviceId)
    if (!id) throw new Error('device_id_required')
    if (typeof identityPublicKey !== 'string' || !identityPublicKey.trim()) {
        throw new Error('identity_public_key_required')
    }
    const now = Date.now()
    const existing = store.devices[id]
    const pub = identityPublicKey.trim()

    if (!existing) {
        const created = {
            deviceId: id,
            identityPublicKey: pub,
            name: typeof name === 'string' ? name.trim().slice(0, 120) : '',
            platform: typeof platform === 'string' ? platform.trim().slice(0, 64) : '',
            ipAddress: typeof ipAddress === 'string' ? ipAddress : '',
            status: STATUS.PENDING,
            createdAt: now,
            updatedAt: now,
            lastSeenAt: now,
            approvedAt: null,
            deniedAt: null,
        }
        store.devices[id] = created
        persist()
        return { device: created, isNew: true, statusChanged: true }
    }

    const keyChanged = existing.identityPublicKey !== pub
    let status = existing.status
    let statusChanged = false
    if (keyChanged) {
        status = STATUS.PENDING
        statusChanged = existing.status !== STATUS.PENDING
    }

    const next = {
        ...existing,
        identityPublicKey: pub,
        name: typeof name === 'string' && name.trim()
            ? name.trim().slice(0, 120)
            : existing.name,
        platform: typeof platform === 'string' && platform.trim()
            ? platform.trim().slice(0, 64)
            : existing.platform,
        ipAddress: typeof ipAddress === 'string' && ipAddress
            ? ipAddress
            : existing.ipAddress,
        status,
        updatedAt: now,
        lastSeenAt: now,
        approvedAt: status === STATUS.APPROVED ? existing.approvedAt : null,
        deniedAt: status === STATUS.DENIED ? existing.deniedAt : null,
    }
    store.devices[id] = next
    persist()
    return { device: next, isNew: false, statusChanged: statusChanged || keyChanged }
}

const touchLastSeen = (deviceId, ipAddress) => {
    const device = getDevice(deviceId)
    if (!device) return null
    device.lastSeenAt = Date.now()
    device.updatedAt = device.lastSeenAt
    if (typeof ipAddress === 'string' && ipAddress) {
        device.ipAddress = ipAddress
    }
    persist()
    return device
}

const setStatus = (deviceId, status) => {
    const device = getDevice(deviceId)
    if (!device) return null
    if (![STATUS.PENDING, STATUS.APPROVED, STATUS.DENIED].includes(status)) {
        throw new Error('invalid_status')
    }
    const now = Date.now()
    device.status = status
    device.updatedAt = now
    if (status === STATUS.APPROVED) {
        device.approvedAt = now
        device.deniedAt = null
    } else if (status === STATUS.DENIED) {
        device.deniedAt = now
        device.approvedAt = null
    } else {
        device.approvedAt = null
        device.deniedAt = null
    }
    persist()
    return publicDeviceView(device)
}

const renameDevice = (deviceId, name) => {
    const device = getDevice(deviceId)
    if (!device) return null
    device.name = typeof name === 'string' ? name.trim().slice(0, 120) : ''
    device.updatedAt = Date.now()
    persist()
    return publicDeviceView(device)
}

const removeDevice = (deviceId) => {
    const id = normalizeDeviceId(deviceId)
    if (!id || !store.devices[id]) return false
    delete store.devices[id]
    persist()
    return true
}

const resetForTests = () => {
    store = { version: 1, devices: {} }
    serverIdentity = null
}

const isApproved = (deviceId) => getDevice(deviceId)?.status === STATUS.APPROVED
const isDenied = (deviceId) => getDevice(deviceId)?.status === STATUS.DENIED
const isPending = (deviceId) => getDevice(deviceId)?.status === STATUS.PENDING

load()

module.exports = {
    STATUS,
    DEVICES_PATH,
    SERVER_IDENTITY_PATH,
    load,
    listDevices,
    getDevice,
    getDevicePublic,
    upsertFromHello,
    touchLastSeen,
    setStatus,
    renameDevice,
    removeDevice,
    getServerIdentityPublicKey,
    signWithServerIdentity,
    publicDeviceView,
    normalizeDeviceId,
    resetForTests,
    ensureServerIdentity,
}
