'use strict';

// Session-gated REST handlers for the smart-home device registry
// (pairing inbox, naming, removal). Mirrors the /v1/devices pattern:
// unknown ids are 404 (not 401) to avoid an auth oracle, and every
// mutation optionally notifies `deps.onChanged` (wired to the
// smartHomeChanged socket broadcast in server/index.js).

const store = require('./smarthomeStore')
const defaultAuth = require('../utils/sessionAuth')

const checkAccess = (req, res, deps) => {
    const auth = (deps && deps.auth) || defaultAuth
    if (!auth.canAccessPrivateApi(req, res)) {
        res.sendStatus(401)
        return false
    }
    return true
}

const notifyChanged = (deps) => {
    if (deps && typeof deps.onChanged === 'function') {
        try {
            deps.onChanged()
        } catch { /* ignore listener errors */ }
    }
}

const cleanFilter = (value) => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed || undefined
}

const handleListDevices = (req, res, deps) => {
    if (!checkAccess(req, res, deps)) return undefined
    const storeLib = (deps && deps.store) || store
    const query = req.query || {}
    return res.status(200).json({
        devices: storeLib.listDevices({
            status: cleanFilter(query.status),
            room: cleanFilter(query.room),
            capability: cleanFilter(query.capability),
        }),
    })
}

const STATUS_BY_ACTION = {
    pending: 'pending',
    approve: 'approved',
    approved: 'approved',
    deny: 'denied',
    denied: 'denied',
}

const handleSetDeviceStatus = (req, res, deps) => {
    if (!checkAccess(req, res, deps)) return undefined
    const storeLib = (deps && deps.store) || store
    const action = typeof req.params?.action === 'string' ? req.params.action.trim().toLowerCase() : ''
    const status = STATUS_BY_ACTION[action]
    if (!status) return res.status(400).json({ error: 'invalid_action' })
    const updated = storeLib.setStatus(req.params?.deviceId, status)
    if (!updated) return res.sendStatus(404)
    notifyChanged(deps)
    return res.status(200).json({ device: updated })
}

const handleRenameDevice = (req, res, deps) => {
    if (!checkAccess(req, res, deps)) return undefined
    const storeLib = (deps && deps.store) || store
    const body = req.body || {}
    const patch = {}
    if (body.friendlyName !== undefined) {
        if (typeof body.friendlyName !== 'string') return res.status(400).json({ error: 'invalid_name' })
        patch.friendlyName = body.friendlyName
    }
    if (body.room !== undefined) {
        if (typeof body.room !== 'string') return res.status(400).json({ error: 'invalid_room' })
        patch.room = body.room
    }
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'nothing_to_update' })
    const updated = storeLib.rename(req.params?.deviceId, patch)
    if (!updated) return res.sendStatus(404)
    notifyChanged(deps)
    return res.status(200).json({ device: updated })
}

const handleRemoveDevice = (req, res, deps) => {
    if (!checkAccess(req, res, deps)) return undefined
    const storeLib = (deps && deps.store) || store
    const removed = storeLib.removeDevice(req.params?.deviceId)
    if (!removed) return res.sendStatus(404)
    notifyChanged(deps)
    return res.sendStatus(204)
}

module.exports = {
    handleListDevices,
    handleSetDeviceStatus,
    handleRenameDevice,
    handleRemoveDevice,
}
