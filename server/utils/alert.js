let wsServerClients = []
const conversationSockets = new Map()
const deviceSockets = new Map()

/** Ring buffer of recent alerts for pull-based clients (e.g. wearables). */
const MAX_ALERT_HISTORY = 50
/** Defensive cap so one alert can't bloat the in-memory history. */
const MAX_ALERT_TEXT_LENGTH = 2000
let alertHistory = []

const normalizeId = (value) => {
    if (value == null) return null
    const trimmed = String(value).trim()
    return trimmed || null
}

const registerConversation = (conversationId, socket) => {
    const id = normalizeId(conversationId)
    if (id) {
        conversationSockets.set(id, socket)
    }
}

const registerDevice = (deviceId, socket) => {
    const id = normalizeId(deviceId)
    if (!id || !socket) return
    let sockets = deviceSockets.get(id)
    if (!sockets) {
        sockets = new Set()
        deviceSockets.set(id, sockets)
    }
    sockets.add(socket)
}

const unregisterSocket = (socket) => {
    for (const [conversationId, client] of conversationSockets.entries()) {
        if (client === socket) {
            conversationSockets.delete(conversationId)
        }
    }
    for (const [deviceId, sockets] of deviceSockets.entries()) {
        if (sockets.delete(socket) && sockets.size === 0) {
            deviceSockets.delete(deviceId)
        }
    }
}

const sendToClient = (client, payload) => {
    if (!client || client.readyState !== 1) return
    const message = typeof payload === 'string' ? JSON.parse(payload) : payload
    try {
        const deviceAuth = require('./deviceAuth')
        const session = deviceAuth.getSession(client)
        if (session?.approved && session?.sessionKey) {
            deviceAuth.sendEncrypted(client, message)
            return
        }
    } catch {
        // Fall through to plaintext for editor/legacy clients.
    }
    client.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
}

const pushHistory = (text, conversationId, deviceId) => {
    alertHistory.push({
        text: String(text ?? '').slice(0, MAX_ALERT_TEXT_LENGTH),
        conversationId: conversationId,
        deviceId: deviceId,
        ts: Date.now(),
    })
    if (alertHistory.length > MAX_ALERT_HISTORY) {
        alertHistory = alertHistory.slice(alertHistory.length - MAX_ALERT_HISTORY)
    }
}

/**
 * Recent alerts visible to a device: broadcast entries (blank device id)
 * plus entries targeted at that device. Conversation-targeted entries are
 * excluded — they belong to another session's reply flow.
 * Returns newest-first.
 */
const getRecentAlerts = (deviceId = null, limit = MAX_ALERT_HISTORY) => {
    const normalizedDeviceId = normalizeId(deviceId)
    const count = Number.isInteger(limit) ? Math.max(1, Math.min(limit, MAX_ALERT_HISTORY)) : MAX_ALERT_HISTORY
    return alertHistory
        .filter((entry) => !entry.conversationId && (!entry.deviceId || entry.deviceId === normalizedDeviceId))
        .slice(-count)
        .reverse()
}

const alert = async (text, conversationId = null, deviceId = null) => {
    const normalizedConversationId = normalizeId(conversationId)
    const normalizedDeviceId = normalizeId(deviceId)
    pushHistory(text, normalizedConversationId, normalizedDeviceId)
    const message = {
        broadcastPurpose: "overlay",
        broadcastData: {
            text: text,
            conversationId: normalizedConversationId,
            deviceId: normalizedDeviceId,
        },
    }
    const payload = JSON.stringify(message)

    if (normalizedConversationId) {
        const client = conversationSockets.get(normalizedConversationId)
        if (client && client.readyState === 1) {
            sendToClient(client, payload)
            conversationSockets.delete(normalizedConversationId)
        }
        return
    }

    if (normalizedDeviceId) {
        const sockets = deviceSockets.get(normalizedDeviceId)
        if (sockets && sockets.size > 0) {
            for (const client of sockets) {
                sendToClient(client, payload)
            }
            return
        }
    }

    wsServerClients.forEach((client) => {
        sendToClient(client, payload)
    })
}

const setWsServerConnectedClients = (newServerClients) => {
    wsServerClients = newServerClients
}

const resetAlertStateForTests = () => {
    wsServerClients = []
    conversationSockets.clear()
    deviceSockets.clear()
    alertHistory = []
}

module.exports = {
    alert,
    getRecentAlerts,
    MAX_ALERT_HISTORY,
    setWsServerConnectedClients,
    registerConversation,
    registerDevice,
    unregisterSocket,
    normalizeId,
    resetAlertStateForTests,
}
