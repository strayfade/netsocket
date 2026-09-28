'use strict';

const deviceAuth = require('../utils/deviceAuth')
const alerts = require('../utils/alert')

/** Mirror of the socket reply helper in server/index.js (encrypted for approved devices). */
const defaultReplyToSocket = (socket, payload) => {
    const session = deviceAuth.getSession(socket)
    if (session?.approved && session?.sessionKey) {
        deviceAuth.sendEncrypted(socket, payload)
    } else {
        deviceAuth.sendJson(socket, payload)
    }
}

const approvedDeviceId = (socket, deps = {}) => {
    const auth = deps.deviceAuth || deviceAuth
    const session = auth.getSession(socket)
    if (!session?.authenticated || !session.approved || !session.deviceId) return null
    return session.deviceId
}

/**
 * WS `getRecentAlerts` for device-role sockets. Replies `{ alerts }`
 * (newest-first, broadcast + device-targeted, no conversation replies).
 * Silent no-op for anyone else (no auth oracle).
 */
const handleDeviceRecentAlerts = (socket, message, deps = {}) => {
    if (socket?.netsocketRole !== 'device') return false
    const deviceId = approvedDeviceId(socket, deps)
    if (!deviceId) return false
    const store = deps.alerts || alerts
    const reply = deps.reply || defaultReplyToSocket
    const rawLimit = message?.broadcastData?.limit
    const limit = typeof rawLimit === 'number' && Number.isInteger(rawLimit)
        ? rawLimit
        : store.MAX_ALERT_HISTORY
    reply(socket, {
        broadcastPurpose: 'getRecentAlerts',
        requestId: message?.requestId,
        broadcastData: { alerts: store.getRecentAlerts(deviceId, limit) },
    })
    return true
}

module.exports = {
    handleDeviceRecentAlerts,
}
