'use strict';

const {
    generateX25519KeyPair,
    verifyEd25519,
    deriveSharedSecret,
    deriveSessionKey,
    randomChallengeB64,
    encryptPayload,
    decryptPayload,
    buildChallengeMessage,
} = require('./deviceCrypto')
const deviceRegistry = require('../manager/deviceRegistry')
const { getClientSocketAddress } = require('./sessionAuth')

const normalizeClientAddress = (addr) => {
    if (!addr || typeof addr !== 'string') return ''
    let normalized = addr.split('%')[0]
    const ipv4Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (ipv4Mapped) return ipv4Mapped[1]
    if (normalized.startsWith('[') && normalized.endsWith(']')) {
        normalized = normalized.slice(1, -1)
    }
    return normalized.toLowerCase()
}

/** WeakMap<WebSocket, DeviceSession> */
const sessionsBySocket = new WeakMap()

/** deviceId -> Set<WebSocket> for pending/approved device sockets awaiting status updates */
const deviceIdSockets = new Map()

const DEVICE_PURPOSES = new Set([
    'command',
    'ping',
    'encrypted',
    'getOtpAccounts',
    'importOtpFromQr',
])

const HANDSHAKE_PURPOSES = new Set([
    'deviceHello',
    'deviceAuth',
])

const getRemoteIp = (request) => {
    const raw = request?.socket?.remoteAddress
        || request?.connection?.remoteAddress
        || getClientSocketAddress(request)
        || ''
    return normalizeClientAddress(raw) || raw || ''
}

const trackSocketForDevice = (deviceId, socket) => {
    const id = deviceRegistry.normalizeDeviceId(deviceId)
    if (!id || !socket) return
    let set = deviceIdSockets.get(id)
    if (!set) {
        set = new Set()
        deviceIdSockets.set(id, set)
    }
    set.add(socket)
}

const untrackSocket = (socket) => {
    const session = sessionsBySocket.get(socket)
    if (session?.deviceId) {
        const set = deviceIdSockets.get(session.deviceId)
        if (set) {
            set.delete(socket)
            if (set.size === 0) deviceIdSockets.delete(session.deviceId)
        }
    }
    sessionsBySocket.delete(socket)
}

const getSession = (socket) => sessionsBySocket.get(socket) || null

const sendJson = (socket, payload) => {
    if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify(payload))
    }
}

const sendEncrypted = (socket, innerMessage) => {
    const session = getSession(socket)
    if (!session?.sessionKey || !session.approved) {
        sendJson(socket, innerMessage)
        return
    }
    const sealed = encryptPayload(session.sessionKey, innerMessage)
    sendJson(socket, {
        broadcastPurpose: 'encrypted',
        broadcastData: {
            nonce: sealed.nonce,
            ciphertext: sealed.ciphertext,
        },
    })
}

/**
 * Handle deviceHello — create/update registry entry and issue a signed challenge.
 */
const handleDeviceHello = (socket, message, request) => {
    const data = message?.broadcastData || {}
    const deviceId = deviceRegistry.normalizeDeviceId(data.deviceId ?? data.device_id)
    const identityPublicKey = typeof data.identityPublicKey === 'string'
        ? data.identityPublicKey.trim()
        : ''
    const ecdhPublicKey = typeof data.ecdhPublicKey === 'string'
        ? data.ecdhPublicKey.trim()
        : ''
    const name = typeof data.name === 'string' ? data.name : ''
    const platform = typeof data.platform === 'string' ? data.platform : ''

    if (!deviceId || !identityPublicKey || !ecdhPublicKey) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'invalid_hello', message: 'deviceId, identityPublicKey, and ecdhPublicKey are required' },
        })
        return { ok: false, error: 'invalid_hello' }
    }

    const ipAddress = getRemoteIp(request)
    const { device, isNew, statusChanged } = deviceRegistry.upsertFromHello({
        deviceId,
        identityPublicKey,
        name,
        platform,
        ipAddress,
    })

    if (device.status === deviceRegistry.STATUS.DENIED) {
        sendJson(socket, {
            broadcastPurpose: 'deviceStatus',
            broadcastData: {
                status: 'denied',
                deviceId,
                message: 'This device has been denied access.',
            },
        })
        try {
            socket.close(4403, 'device denied')
        } catch { /* ignore */ }
        return { ok: false, error: 'denied', device, isNew, statusChanged }
    }

    const serverEcdh = generateX25519KeyPair()
    const challenge = randomChallengeB64()
    const serverIdentityPublicKey = deviceRegistry.getServerIdentityPublicKey()
    const challengeMessage = buildChallengeMessage({
        challenge,
        deviceId,
        deviceIdentityPublicKey: identityPublicKey,
        deviceEcdhPublicKey: ecdhPublicKey,
        serverIdentityPublicKey,
        serverEcdhPublicKey: serverEcdh.publicKeyB64,
    })
    const serverSignature = deviceRegistry.signWithServerIdentity(challengeMessage)

    sessionsBySocket.set(socket, {
        deviceId,
        identityPublicKey,
        deviceEcdhPublicKey: ecdhPublicKey,
        serverEcdhPrivateKeyB64: serverEcdh.privateKeyB64,
        serverEcdhPublicKeyB64: serverEcdh.publicKeyB64,
        challenge,
        challengeMessage,
        sessionKey: null,
        authenticated: false,
        approved: false,
        role: 'device',
        platform,
        name,
    })
    trackSocketForDevice(deviceId, socket)

    sendJson(socket, {
        broadcastPurpose: 'deviceChallenge',
        broadcastData: {
            challenge,
            deviceId,
            status: device.status,
            serverIdentityPublicKey,
            serverEcdhPublicKey: serverEcdh.publicKeyB64,
            serverSignature,
            protocol: 'netsocket-device-v1',
        },
    })

    return { ok: true, device, isNew, statusChanged }
}

/**
 * Handle deviceAuth — verify signature, derive session key, gate on approval.
 */
const handleDeviceAuth = (socket, message) => {
    const session = getSession(socket)
    if (!session || !session.challenge) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'hello_required', message: 'Send deviceHello before deviceAuth' },
        })
        return { ok: false, error: 'hello_required' }
    }

    const data = message?.broadcastData || {}
    const signature = typeof data.signature === 'string' ? data.signature.trim() : ''
    if (!signature) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'signature_required' },
        })
        return { ok: false, error: 'signature_required' }
    }

    const valid = verifyEd25519(session.identityPublicKey, session.challengeMessage, signature)
    if (!valid) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'invalid_signature' },
        })
        try {
            socket.close(4401, 'invalid signature')
        } catch { /* ignore */ }
        return { ok: false, error: 'invalid_signature' }
    }

    const device = deviceRegistry.getDevice(session.deviceId)
    if (!device) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'unknown_device' },
        })
        return { ok: false, error: 'unknown_device' }
    }

    if (device.identityPublicKey !== session.identityPublicKey) {
        sendJson(socket, {
            broadcastPurpose: 'deviceError',
            broadcastData: { error: 'key_mismatch' },
        })
        return { ok: false, error: 'key_mismatch' }
    }

    if (device.status === deviceRegistry.STATUS.DENIED) {
        sendJson(socket, {
            broadcastPurpose: 'deviceStatus',
            broadcastData: { status: 'denied', deviceId: session.deviceId },
        })
        try {
            socket.close(4403, 'device denied')
        } catch { /* ignore */ }
        return { ok: false, error: 'denied' }
    }

    const shared = deriveSharedSecret(session.serverEcdhPrivateKeyB64, session.deviceEcdhPublicKey)
    const sessionKey = deriveSessionKey(shared, session.challenge)
    session.sessionKey = sessionKey
    session.authenticated = true
    session.approved = device.status === deviceRegistry.STATUS.APPROVED
    // Drop private ECDH material once session key is derived
    session.serverEcdhPrivateKeyB64 = null

    deviceRegistry.touchLastSeen(session.deviceId)

    sendJson(socket, {
        broadcastPurpose: 'deviceStatus',
        broadcastData: {
            status: device.status,
            deviceId: session.deviceId,
            encrypted: true,
            message: device.status === deviceRegistry.STATUS.APPROVED
                ? 'Device authenticated.'
                : 'Waiting for approval in the netsocket dashboard.',
        },
    })

    return {
        ok: true,
        device,
        approved: session.approved,
        authenticated: true,
    }
}

const decryptIncoming = (socket, message) => {
    const session = getSession(socket)
    if (!session?.sessionKey) {
        throw new Error('no_session_key')
    }
    const data = message?.broadcastData || {}
    return decryptPayload(session.sessionKey, data.nonce, data.ciphertext)
}

const isDevicePurposeAllowed = (purpose) => DEVICE_PURPOSES.has(purpose)
const isHandshakePurpose = (purpose) => HANDSHAKE_PURPOSES.has(purpose)

const notifyDeviceSockets = (deviceId, statusPayload) => {
    const set = deviceIdSockets.get(deviceId)
    if (!set) return
    for (const socket of set) {
        const session = getSession(socket)
        if (session) {
            session.approved = statusPayload.status === deviceRegistry.STATUS.APPROVED
            // Status updates stay plaintext so pending clients can always read them.
            sendJson(socket, {
                broadcastPurpose: 'deviceStatus',
                broadcastData: statusPayload,
            })
            if (statusPayload.status === deviceRegistry.STATUS.DENIED) {
                try {
                    socket.close(4403, 'device denied')
                } catch { /* ignore */ }
            }
        }
    }
}

const forEachDeviceSocket = (deviceId, fn) => {
    const set = deviceIdSockets.get(deviceId)
    if (!set) return
    for (const socket of set) fn(socket)
}

const resetForTests = () => {
    deviceIdSockets.clear()
}

module.exports = {
    DEVICE_PURPOSES,
    HANDSHAKE_PURPOSES,
    handleDeviceHello,
    handleDeviceAuth,
    decryptIncoming,
    sendEncrypted,
    sendJson,
    getSession,
    untrackSocket,
    trackSocketForDevice,
    isDevicePurposeAllowed,
    isHandshakePurpose,
    notifyDeviceSockets,
    forEachDeviceSocket,
    getRemoteIp,
    resetForTests,
    sessionsBySocket,
}
