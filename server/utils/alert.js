let wsServerClients = []
const conversationSockets = new Map()

const registerConversation = (conversationId, socket) => {
    if (conversationId) {
        conversationSockets.set(conversationId, socket)
    }
}

const unregisterSocket = (socket) => {
    for (const [conversationId, client] of conversationSockets.entries()) {
        if (client === socket) {
            conversationSockets.delete(conversationId)
        }
    }
}

const alert = async (text, conversationId = null) => {
    const payload = JSON.stringify({
        broadcastPurpose: "overlay",
        broadcastData: {
            text: text,
            conversationId: conversationId,
        },
    })

    if (conversationId) {
        const client = conversationSockets.get(conversationId)
        if (client && client.readyState === 1) {
            client.send(payload)
            conversationSockets.delete(conversationId)
        }
        return
    }

    wsServerClients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(payload)
        }
    })
}

const setWsServerConnectedClients = (newServerClients) => {
    wsServerClients = newServerClients
}

module.exports = {
    alert,
    setWsServerConnectedClients,
    registerConversation,
    unregisterSocket,
}
