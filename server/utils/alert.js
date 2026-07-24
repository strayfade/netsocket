let wsServerClients = []
const conversationSockets = new Map()
const deviceSockets = new Map()

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

const alert = async (text, conversationId = null, deviceId = null) => {
    const normalizedConversationId = normalizeId(conversationId)
    const normalizedDeviceId = normalizeId(deviceId)
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
}

module.exports = {
    alert,
    setWsServerConnectedClients,
    registerConversation,
    registerDevice,
    unregisterSocket,
    normalizeId,
    resetAlertStateForTests,
}
