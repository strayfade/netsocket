const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises
var compression = require('compression')

const { log, logColors, setOnPushLog, getLines } = require('./log')
console.log(`               __                  __        __
   ____  ___  / /__________  _____/ /_____  / /_
  / __ \\/ _ \\/ __/ ___/ __ \\/ ___/ //_/ _ \\/ __/
 / / / /  __/ /_(__  ) /_/ / /__/ ,< /  __/ /_
/_/ /_/\\___/\\__/____/\\____/\\___/_/|_|\\___/\\__/
                                                `)
const { config } = require('./config')

const app = express();
const {
    authSkipped,
    MIN_PASSWORD_LENGTH,
    getSessionCookieOpts,
    parseRememberMe,
    clearCookieOpts,
    secureCookies,
    validateToken,
    getTokenFromCookieHeader,
    hasUserSession,
    createToken,
    revokeToken,
    canAccessPrivateApi,
    canAccessWithSessionOrIntegrationSecret,
    integrationSecretMatches,
    providedSecretMatches,
    isProtectedPagePath,
    requireUserSession,
    loginRateLimit,
    recordFailedLoginAttempt,
    securityHeaders,
} = require('./utils/sessionAuth')
if (secureCookies) {
    app.set('trust proxy', 1)
}
app.use(securityHeaders)
app.use(express.json({ limit: '32mb' }));
app.use(compression())

const { getNodes, setNodes, populateNodes } = require('./manager/saveState')
const settingsManager = require('./manager/settingsManager.js')
const cronTriggerManager = require('./utils/cronTriggerManager')
const { reloadVars, getVarsSnapshot, replaceVarsAndPersist } = require('./utils/vars.js')
const { reloadMcpAgentMemory } = require('./utils/mcpAgentMemory.js')
const nodePreferencesRegistry = require('./manager/nodePreferencesRegistry')
require('./utils/mcpAgentSettings')
const { SCOPES, buildOAuthClient, getStoredTokens, mergeTokenSets, persistOAuthSession, CONNECTED_EMAIL_KEY } = require('./utils/googleAuth')
const { startGoogleTriggerPoller } = require('./utils/googleTriggerPoller')

// Create an HTTP server
const server = http.createServer(app);

// MARK: Websocket server
const wss = new WebSocket.Server({ server });
let connectedClients = [];

// Store connected clients
const { setWsServerConnectedClients, registerConversation, registerDevice, unregisterSocket, normalizeId } = require('./utils/alert.js')
const deviceRegistry = require('./manager/deviceRegistry')
const deviceAuth = require('./utils/deviceAuth')
const { executeGraph } = require('./manager/execute')
const { setLinkActivityBroadcaster } = require('./manager/linkDebug')
var cookieParser = require('cookie-parser')
app.use(cookieParser())

const EDITOR_ONLY_PURPOSES = new Set([
    'getNodes', 'setNodes', 'execute', 'populateLog',
    'getPreferences', 'saveSetting',
    'getSubgraphs', 'saveSubgraph', 'deleteSubgraph',
])

const broadcastToEditorClients = (payload) => {
    const encoded = typeof payload === 'string' ? payload : JSON.stringify(payload)
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.netsocketRole === 'editor') {
            client.send(encoded)
        }
    })
}

setLinkActivityBroadcaster(broadcastToEditorClients)

const broadcastDevicesChanged = () => {
    broadcastToEditorClients({
        broadcastPurpose: 'devicesChanged',
        broadcastData: {
            devices: deviceRegistry.listDevices(),
        },
    })
}

const admitDeviceSocket = (socket) => {
    if (!connectedClients.includes(socket)) {
        connectedClients.push(socket)
        setWsServerConnectedClients(connectedClients)
    }
    socket.netsocketRole = 'device'
}

const replyToSocket = (socket, payload) => {
    const session = deviceAuth.getSession(socket)
    if (session?.approved && session?.sessionKey) {
        deviceAuth.sendEncrypted(socket, payload)
    } else {
        deviceAuth.sendJson(socket, payload)
    }
}

const handleTrustedMessage = async (socket, message) => {
    const role = socket.netsocketRole
    const purpose = message.broadcastPurpose
    const isDevice = role === 'device'
    const isEditorOrLegacy = role === 'editor' || role === 'legacy'

    if (isDevice && EDITOR_ONLY_PURPOSES.has(purpose)) {
        return
    }
    if (isDevice && !deviceAuth.isDevicePurposeAllowed(purpose) && purpose !== 'encrypted') {
        return
    }

    switch (purpose) {
        case 'command': {
            const payload = message.broadcastData
            let commandText = ''
            let conversationId = null
            let deviceId = null

            if (typeof payload === 'string') {
                commandText = payload
            } else if (payload && typeof payload === 'object') {
                commandText = String(payload.command ?? payload.text ?? '')
                conversationId = payload.conversationId ?? null
                deviceId = normalizeId(payload.deviceId ?? payload.device_id ?? null)
            }

            const deviceSession = deviceAuth.getSession(socket)
            if (deviceSession?.deviceId) {
                deviceId = deviceSession.deviceId
            }

            if (conversationId) {
                registerConversation(conversationId, socket)
            }
            if (deviceId) {
                registerDevice(deviceId, socket)
            }

            if (commandText === '/noti') {
                replyToSocket(socket, {
                    broadcastPurpose: 'overlay',
                    broadcastData: {
                        text: 'this is a test notification!',
                        conversationId: conversationId,
                        deviceId: deviceId,
                    },
                })
            } else {
                await onNewCommand(commandText, conversationId, deviceId)
            }

            replyToSocket(socket, {
                broadcastPurpose: 'ack',
                conversationId: conversationId,
            })
            break
        }
        case 'ping': {
            const pingData = message.broadcastData
            let deviceId = null
            if (pingData && typeof pingData === 'object') {
                deviceId = normalizeId(pingData.deviceId ?? pingData.device_id ?? null)
            }
            const deviceSession = deviceAuth.getSession(socket)
            if (deviceSession?.deviceId) {
                deviceId = deviceSession.deviceId
                deviceRegistry.touchLastSeen(deviceId)
            }
            if (deviceId) {
                registerDevice(deviceId, socket)
            }
            replyToSocket(socket, {
                broadcastPurpose: 'pong',
            })
            break
        }
        case 'getNodes':
            if (!isEditorOrLegacy) break
            socket.send(JSON.stringify({
                broadcastPurpose: 'setNodes',
                broadcastData: getNodes().nodes,
            }))
            break
        case 'setNodes':
            if (!isEditorOrLegacy) break
            if (message.broadcastData == null) break
            setNodes({
                nodes: message.broadcastData,
                currentValues: getNodes().currentValues,
            })
            cronTriggerManager.syncFromGraphIfNeeded()
            break
        case 'execute':
            if (!isEditorOrLegacy) break
            setNodes({
                nodes: message.broadcastData.graphNodes,
                currentValues: getNodes().currentValues,
            })
            cronTriggerManager.syncFromGraphIfNeeded()
            await executeGraph(message.broadcastData.node)
            socket.send(JSON.stringify({
                broadcastPurpose: 'setNodes',
                broadcastData: getNodes().nodes,
            }))
            break
        case 'populateLog':
            if (!isEditorOrLegacy) break
            socket.send(JSON.stringify({
                broadcastPurpose: 'populateLog',
                broadcastData: getLines(50),
            }))
            break
        case 'getPreferences': {
            if (!isEditorOrLegacy) break
            const defs = nodePreferencesRegistry.getPrefs()
            const withValues = defs.map((p) => {
                let stored = settingsManager.getStoredValue(p.id)
                if (p.id === 'google.oauth.connect') {
                    const email = settingsManager.getStoredValue(CONNECTED_EMAIL_KEY)
                    stored = email !== undefined ? email : stored
                }
                const fallback = p.defaultVal != null && p.defaultVal !== '' ? String(p.defaultVal) : ''
                return {
                    category: p.category,
                    id: p.id,
                    displayName: p.displayName,
                    type: p.type,
                    defaultVal: p.defaultVal,
                    description: p.description || '',
                    value: stored !== undefined ? stored : fallback,
                }
            })
            socket.send(JSON.stringify({
                broadcastPurpose: 'getPreferences',
                requestId: message.requestId,
                broadcastData: withValues,
            }))
            break
        }
        case 'saveSetting': {
            if (!isEditorOrLegacy) break
            const { name, value } = message.broadcastData || {}
            if (typeof name === 'string' && name.length && name !== 'google.oauth.connect') {
                settingsManager.setSetting(name, value ?? '')
                await settingsManager.saveSettings()
                try {
                    await require('./utils/hueApi').setupHueApi()
                } catch (e) {
                    log(`Hue reconnect after save: ${e}`, logColors.Warning)
                }
                try {
                    require('./utils/languageModel').reinitOllama()
                } catch (e) {
                    log(`Ollama reinit after save: ${e}`, logColors.Warning)
                }
            }
            socket.send(JSON.stringify({
                broadcastPurpose: 'saveSetting',
                requestId: message.requestId,
                broadcastData: { ok: true },
            }))
            break
        }
        case 'getOtpAccounts': {
            const {
                otpController,
                secondsRemainingInPeriod,
                TOTP_PERIOD_SECONDS,
            } = require('./utils/authenticator')
            const accounts = await otpController.listAccounts()
            const withCodes = await Promise.all(accounts.map(async (entry) => {
                const code = await otpController.getCode(entry.key)
                return {
                    key: entry.key,
                    issuer: entry.issuer,
                    account: entry.account,
                    secret: entry.secret,
                    code: code === -1 ? null : String(code),
                    periodSeconds: TOTP_PERIOD_SECONDS,
                    secondsRemaining: secondsRemainingInPeriod(),
                }
            }))
            replyToSocket(socket, {
                broadcastPurpose: 'getOtpAccounts',
                requestId: message.requestId,
                broadcastData: { accounts: withCodes },
            })
            break
        }
        case 'importOtpFromQr': {
            const { importOtpFromQrPayloads } = require('./utils/authenticator')
            const data = message.broadcastData || {}
            const payloads = data.payloads ?? data.payload ?? data.uri ?? data.uris
            try {
                const result = await importOtpFromQrPayloads(payloads)
                replyToSocket(socket, {
                    broadcastPurpose: 'importOtpFromQr',
                    requestId: message.requestId,
                    broadcastData: { ok: true, ...result },
                })
            } catch (err) {
                replyToSocket(socket, {
                    broadcastPurpose: 'importOtpFromQr',
                    requestId: message.requestId,
                    broadcastData: {
                        ok: false,
                        error: err && err.message ? err.message : String(err),
                    },
                })
            }
            break
        }
        case 'reorderOtpAccounts': {
            const { reorderOtpAccounts } = require('./utils/authenticator')
            const data = message.broadcastData || {}
            const keys = data.keys ?? data.order ?? []
            try {
                if (!Array.isArray(keys)) {
                    throw new Error('keys must be an array of account keys')
                }
                const result = reorderOtpAccounts(keys)
                await settingsManager.saveSettings()
                replyToSocket(socket, {
                    broadcastPurpose: 'reorderOtpAccounts',
                    requestId: message.requestId,
                    broadcastData: { ok: true, ...result },
                })
            } catch (err) {
                replyToSocket(socket, {
                    broadcastPurpose: 'reorderOtpAccounts',
                    requestId: message.requestId,
                    broadcastData: {
                        ok: false,
                        error: err && err.message ? err.message : String(err),
                    },
                })
            }
            break
        }
        case 'getSubgraphs': {
            if (!isEditorOrLegacy) break
            const subgraphStore = require('./manager/subgraphStore')
            socket.send(JSON.stringify({
                broadcastPurpose: 'getSubgraphs',
                requestId: message.requestId,
                broadcastData: subgraphStore.listDefinitions(),
            }))
            break
        }
        case 'saveSubgraph': {
            if (!isEditorOrLegacy) break
            const subgraphStore = require('./manager/subgraphStore')
            try {
                const saved = await subgraphStore.saveDefinition(message.broadcastData || {})
                const payload = JSON.stringify({
                    broadcastPurpose: 'subgraphsChanged',
                    broadcastData: subgraphStore.listDefinitions(),
                })
                connectedClients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && (client.netsocketRole === 'editor' || client.netsocketRole === 'legacy')) {
                        client.send(payload)
                    }
                })
                socket.send(JSON.stringify({
                    broadcastPurpose: 'saveSubgraph',
                    requestId: message.requestId,
                    broadcastData: saved,
                }))
            } catch (e) {
                log(`saveSubgraph: ${e}`, logColors.Error)
                socket.send(JSON.stringify({
                    broadcastPurpose: 'saveSubgraph',
                    requestId: message.requestId,
                    broadcastData: { error: String(e?.message || e) },
                }))
            }
            break
        }
        case 'deleteSubgraph': {
            if (!isEditorOrLegacy) break
            const subgraphStore = require('./manager/subgraphStore')
            const id = message.broadcastData?.id
            try {
                const ok = await subgraphStore.deleteDefinition(id)
                const payload = JSON.stringify({
                    broadcastPurpose: 'subgraphsChanged',
                    broadcastData: subgraphStore.listDefinitions(),
                })
                connectedClients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN && (client.netsocketRole === 'editor' || client.netsocketRole === 'legacy')) {
                        client.send(payload)
                    }
                })
                socket.send(JSON.stringify({
                    broadcastPurpose: 'deleteSubgraph',
                    requestId: message.requestId,
                    broadcastData: { ok },
                }))
            } catch (e) {
                log(`deleteSubgraph: ${e}`, logColors.Error)
                socket.send(JSON.stringify({
                    broadcastPurpose: 'deleteSubgraph',
                    requestId: message.requestId,
                    broadcastData: { error: String(e?.message || e) },
                }))
            }
            break
        }
        default:
            break
    }
}

wss.on('connection', (socket, request) => {
    const sessionToken = getTokenFromCookieHeader(request.headers.cookie)
    const commandPaletteSecret = settingsManager.getSetting('triggersCommandPalette.secret')
    const hasSession = validateToken(sessionToken)
    const hasLegacySecret = integrationSecretMatches({ headers: request.headers }, commandPaletteSecret)

    if (hasSession) {
        socket.netsocketRole = 'editor'
        connectedClients.push(socket)
        setWsServerConnectedClients(connectedClients)
    } else if (hasLegacySecret) {
        socket.netsocketRole = 'legacy'
        connectedClients.push(socket)
        setWsServerConnectedClients(connectedClients)
    } else {
        // Unauthenticated sockets may only perform the device pairing handshake.
        socket.netsocketRole = 'unauthenticated'
    }

    socket.on('close', () => {
        connectedClients = connectedClients.filter((s) => s !== socket)
        setWsServerConnectedClients(connectedClients)
        unregisterSocket(socket)
        deviceAuth.untrackSocket(socket)
    })

    socket.on('message', async (rawMessage) => {
        try {
            let message = JSON.parse(rawMessage)
            const purpose = message.broadcastPurpose

            if (deviceAuth.isHandshakePurpose(purpose)) {
                if (purpose === 'deviceHello') {
                    const result = deviceAuth.handleDeviceHello(socket, message, request)
                    if (result?.statusChanged || result?.isNew) {
                        broadcastDevicesChanged()
                    }
                    return
                }
                if (purpose === 'deviceAuth') {
                    const result = deviceAuth.handleDeviceAuth(socket, message)
                    if (result?.ok && result.approved) {
                        admitDeviceSocket(socket)
                        const session = deviceAuth.getSession(socket)
                        if (session?.deviceId) {
                            registerDevice(session.deviceId, socket)
                        }
                    }
                    return
                }
            }

            if (purpose === 'encrypted') {
                const session = deviceAuth.getSession(socket)
                if (!session?.authenticated || !session?.sessionKey) {
                    return
                }
                if (!session.approved) {
                    deviceAuth.sendJson(socket, {
                        broadcastPurpose: 'deviceStatus',
                        broadcastData: {
                            status: 'pending',
                            deviceId: session.deviceId,
                            message: 'Waiting for approval in the netsocket dashboard.',
                        },
                    })
                    return
                }
                if (!connectedClients.includes(socket)) {
                    admitDeviceSocket(socket)
                }
                try {
                    message = deviceAuth.decryptIncoming(socket, message)
                } catch (err) {
                    log(`Device decrypt failed: ${err}`, logColors.Warning)
                    return
                }
            }

            const session = deviceAuth.getSession(socket)
            if (session?.authenticated && !session.approved) {
                // Authenticated but pending — only handshake/status, no commands.
                if (purpose === 'ping') {
                    deviceAuth.sendJson(socket, { broadcastPurpose: 'pong' })
                }
                return
            }

            if (!connectedClients.includes(socket)) {
                return
            }

            await handleTrustedMessage(socket, message)
        } catch (e) {
            log(`Error: ${e}`, logColors.Error)
        }
    })
});
wss.on('listening', () => {
    log(`Websocket server running on ws://localhost:${PORT}`);
})
setOnPushLog(((line) => {
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && (client.netsocketRole === 'editor' || client.netsocketRole === 'legacy')) {
            client.send(JSON.stringify({
                broadcastPurpose: "newLogLine",
                broadcastData: line
            }));
        }
    });
}))

// MARK: PostNotification
const { onNewNotification } = require('./utils/receiveNotification')
const { onGenericWebhook, onGitHubWebhook } = require('./utils/waitForWebhookEvents')
app.post("/v1/postNotification/:secret", async (req, res) => {
    const expectedSecret = settingsManager.getSetting('triggersNotification.secret')
    if (!expectedSecret || req.params.secret !== expectedSecret) {
        return res.sendStatus(403)
    }
    else {
        const notificationContent = req.body
        onNewNotification(notificationContent)
        log(`Received notification: ${JSON.stringify(notificationContent)}`, logColors.Success)
        res.sendStatus(200);
    }
})

app.post("/v1/triggers/webhook/:secret", async (req, res) => {
    const expectedSecret = settingsManager.getSetting('triggersWebhook.secret')
    if (!expectedSecret || req.params.secret !== expectedSecret) {
        return res.sendStatus(403)
    }

    await onGenericWebhook({
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body
    })

    log(`Webhook received on ${req.path}`, logColors.Success)
    return res.sendStatus(200);
})

app.post("/v1/triggers/github/:secret", async (req, res) => {
    const expectedSecret = settingsManager.getSetting('triggersGitHub.secret')
    if (!expectedSecret || req.params.secret !== expectedSecret) {
        return res.sendStatus(403)
    }

    await onGitHubWebhook({
        eventType: req.headers['x-github-event'],
        deliveryId: req.headers['x-github-delivery'],
        payload: req.body
    })

    return res.sendStatus(200);
})

app.get("/v1/google/auth/start", (req, res) => {
    if (!hasUserSession(req, res)) return res.sendStatus(403)
    const oAuth2Client = buildOAuthClient(req)
    if (!oAuth2Client) {
        return res.status(400).send('Google OAuth is not configured. Set client ID and secret in Integrations > Google.')
    }
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES
    })
    return res.redirect(authUrl)
})

app.get("/v1/google/auth/callback", async (req, res) => {
    if (!hasUserSession(req, res)) return res.sendStatus(403)
    const code = req.query?.code
    if (!code) return res.status(400).send('Missing OAuth code')
    const oAuth2Client = buildOAuthClient(req)
    if (!oAuth2Client) {
        return res.status(400).send('Google OAuth is not configured. Set client ID and secret in Integrations > Google.')
    }
    try {
        const result = await oAuth2Client.getToken(code)
        const tokens = mergeTokenSets(getStoredTokens(), result.tokens)
        await persistOAuthSession(oAuth2Client, tokens)
        log('Google account connected successfully', logColors.Success)
        return res.redirect('/dashboard')
    } catch (e) {
        log(`Google OAuth callback error: ${e}`, logColors.Error)
        return res.status(500).send('Google OAuth failed')
    }
})

// MagicMirror
app.get("/v1/mirror", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "../extensions/mirror/index.html"))
})

// Web
const { populateUsers, flushUsersSync } = require('./manager/saveUsers.js')
const {
    populateCredentials,
    hasAccount,
    getHashes,
    setCredentials,
} = require('./manager/saveCredentials.js')
const bcrypt = require('bcrypt')
const BCRYPT_ROUNDS = 12

app.use((req, res, next) => {
    if (isProtectedPagePath(req.originalUrl)) {
        return requireUserSession(req, res, next)
    }
    next()
})
let constructedNodes = ""
app.get('/constructNodes.js', (req, res) => {
    res.status(200).type("application/javascript").send(constructedNodes)
})
app.get("/dashboard", (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).sendFile(path.join(__dirname, "../frontend/editor.html"))
})
app.use('/', express.static(path.join(__dirname, '../frontend/public')));
app.get("/", (req, res) => {
    res.redirect(302, "/login");
});
const { onNewCommand } = require('./utils/waitForCommands.js')
const { runMcpAgent } = require('./utils/mcpAgent.js')

app.post('/v1/mcp-agent', async (req, res) => {
    if (!canAccessPrivateApi(req, res)) {
        return res.sendStatus(401)
    }
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : ''
    if (!command) {
        return res.status(400).json({ error: 'command_required' })
    }
    const memoryKey = typeof req.body?.memoryKey === 'string' && req.body.memoryKey.trim()
        ? req.body.memoryKey.trim()
        : 'dashboard'
    try {
        const result = await runMcpAgent({
            command,
            memoryKey,
            silent: true,
        })
        return res.status(200).json(result)
    } catch (e) {
        log(`mcp-agent: ${e}`, logColors.Error)
        return res.status(500).json({ error: 'agent_failed', message: e?.message || String(e) })
    }
})

app.post("/v1/triggers/command-palette", async (req, res) => {
    const expectedSecret = settingsManager.getSetting('triggersCommandPalette.secret')
    const body = req.body || {}
    if (!providedSecretMatches(body.secret, expectedSecret)) {
        return res.sendStatus(403)
    }

    const commandText = typeof body.content === 'string'
        ? body.content
        : typeof body.command === 'string'
            ? body.command
            : ''
    if (!commandText.trim()) {
        return res.sendStatus(400)
    }

    const conversationId = body.conversationId ?? null
    const deviceId = normalizeId(body.deviceId ?? body.device_id ?? null)
    await onNewCommand(commandText, conversationId, deviceId)
    log(`Command received via HTTP: ${commandText}`, logColors.Success)
    return res.sendStatus(200)
})

app.post("/v1/postCommand", async (req, res) => {
    const commandSecret = settingsManager.getSetting('triggersCommandPalette.secret')
    if (!canAccessWithSessionOrIntegrationSecret(req, res, commandSecret)) {
        return res.sendStatus(401)
    }
    const command = req.body?.command
    if (typeof command !== 'string' || !command.trim()) {
        return res.sendStatus(400)
    }
    const deviceId = normalizeId(req.body?.deviceId ?? req.body?.device_id ?? null)
    await onNewCommand(command, null, deviceId)
    res.sendStatus(200);
})

// MARK: Device pairing (session-authenticated only)
app.get('/v1/devices', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const status = typeof req.query?.status === 'string' ? req.query.status.trim() : ''
    const devices = status
        ? deviceRegistry.listDevices({ status })
        : deviceRegistry.listDevices()
    return res.status(200).json({ devices })
})

app.post('/v1/devices/:deviceId/approve', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const updated = deviceRegistry.setStatus(req.params.deviceId, deviceRegistry.STATUS.APPROVED)
    if (!updated) return res.sendStatus(404)
    deviceAuth.notifyDeviceSockets(updated.deviceId, {
        status: 'approved',
        deviceId: updated.deviceId,
        encrypted: true,
        message: 'Device approved.',
    })
    deviceAuth.forEachDeviceSocket(updated.deviceId, (sock) => {
        const session = deviceAuth.getSession(sock)
        if (session?.authenticated && session.sessionKey) {
            admitDeviceSocket(sock)
            registerDevice(updated.deviceId, sock)
        }
    })
    broadcastDevicesChanged()
    log(`Device approved: ${updated.deviceId}`, logColors.Success)
    return res.status(200).json({ device: updated })
})

app.post('/v1/devices/:deviceId/deny', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const updated = deviceRegistry.setStatus(req.params.deviceId, deviceRegistry.STATUS.DENIED)
    if (!updated) return res.sendStatus(404)
    deviceAuth.notifyDeviceSockets(updated.deviceId, {
        status: 'denied',
        deviceId: updated.deviceId,
        message: 'This device has been denied access.',
    })
    broadcastDevicesChanged()
    log(`Device denied: ${updated.deviceId}`, logColors.Warning)
    return res.status(200).json({ device: updated })
})

app.post('/v1/devices/:deviceId/pending', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const updated = deviceRegistry.setStatus(req.params.deviceId, deviceRegistry.STATUS.PENDING)
    if (!updated) return res.sendStatus(404)
    deviceAuth.notifyDeviceSockets(updated.deviceId, {
        status: 'pending',
        deviceId: updated.deviceId,
        message: 'Device moved back to pending.',
    })
    deviceAuth.forEachDeviceSocket(updated.deviceId, (sock) => {
        const session = deviceAuth.getSession(sock)
        if (session) session.approved = false
        connectedClients = connectedClients.filter((s) => s !== sock)
        setWsServerConnectedClients(connectedClients)
        unregisterSocket(sock)
        sock.netsocketRole = 'unauthenticated'
    })
    broadcastDevicesChanged()
    return res.status(200).json({ device: updated })
})

app.patch('/v1/devices/:deviceId', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const name = req.body?.name
    if (typeof name !== 'string') return res.status(400).json({ error: 'name_required' })
    const updated = deviceRegistry.renameDevice(req.params.deviceId, name)
    if (!updated) return res.sendStatus(404)
    broadcastDevicesChanged()
    return res.status(200).json({ device: updated })
})

app.delete('/v1/devices/:deviceId', (req, res) => {
    if (!canAccessPrivateApi(req, res)) return res.sendStatus(401)
    const deviceId = deviceRegistry.normalizeDeviceId(req.params.deviceId)
    if (!deviceId || !deviceRegistry.getDevice(deviceId)) return res.sendStatus(404)
    deviceAuth.notifyDeviceSockets(deviceId, {
        status: 'denied',
        deviceId,
        message: 'This device has been removed.',
    })
    deviceAuth.forEachDeviceSocket(deviceId, (sock) => {
        connectedClients = connectedClients.filter((s) => s !== sock)
        setWsServerConnectedClients(connectedClients)
        unregisterSocket(sock)
        try { sock.close(4403, 'device removed') } catch { /* ignore */ }
    })
    deviceRegistry.removeDevice(deviceId)
    broadcastDevicesChanged()
    log(`Device removed: ${deviceId}`, logColors.Warning)
    return res.sendStatus(204)
})

app.get("/v1/auth-state", (req, res) => {
    res.status(200).json({ needsRegistration: !hasAccount() });
});

app.post("/login", loginRateLimit, async (req, res) => {
    const { username, password, passwordConfirm, rememberMe } = req.body || {};
    const persistSession = parseRememberMe(rememberMe);
    if (typeof username !== "string" || typeof password !== "string") {
        return res.sendStatus(400);
    }
    const u = username.trim();
    if (!u || !password.length) {
        return res.sendStatus(400);
    }
    const issueSession = (tk) => res.cookie("tk", tk, getSessionCookieOpts(persistSession)).sendStatus(200);
    if (authSkipped()) {
        const tk = createToken({ rememberMe: persistSession });
        return issueSession(tk);
    }
    try {
        if (!hasAccount()) {
            if (typeof passwordConfirm !== 'string' || password !== passwordConfirm) {
                return res.status(400).json({ error: "password_mismatch" });
            }
            if (password.length < MIN_PASSWORD_LENGTH) {
                return res.status(400).json({ error: "password_too_short" });
            }
            const usernameHash = await bcrypt.hash(u, BCRYPT_ROUNDS);
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await setCredentials(usernameHash, passwordHash);
            const tk = createToken({ rememberMe: persistSession });
            return issueSession(tk);
        }
        const creds = getHashes();
        const userOk = await bcrypt.compare(u, creds.usernameHash);
        const passOk = await bcrypt.compare(password, creds.passwordHash);
        if (!userOk || !passOk) {
            recordFailedLoginAttempt(req);
            return res.sendStatus(401);
        }
        const tk = createToken({ rememberMe: persistSession });
        return issueSession(tk);
    } catch (e) {
        log(`Login error: ${e}`, logColors.Error);
        return res.sendStatus(500);
    }
})
app.get("/login", (req, res) => {
    if (hasUserSession(req, res)) {
        return res.redirect(302, "/dashboard");
    }
    res.status(200).sendFile(path.join(__dirname, "../frontend/index.html"));
});
app.get("/documentation", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "../frontend/index.html"))
})
app.get("/v1/session", (req, res) => {
    if (authSkipped() || hasUserSession(req, res)) res.sendStatus(200);
    else res.sendStatus(401);
});

const FULL_EXPORT_SCHEMA = 'netsocketFullExport'
const FULL_EXPORT_VERSION = 1

const broadcastGraphToClients = () => {
    const payload = JSON.stringify({
        broadcastPurpose: 'setNodes',
        broadcastData: getNodes().nodes
    })
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload)
        }
    })
}

app.get('/v1/export-full-state', async (req, res) => {
    if (!canAccessPrivateApi(req, res)) {
        return res.sendStatus(401)
    }
    try {
        const graph = getNodes()
        const body = {
            [FULL_EXPORT_SCHEMA]: true,
            version: FULL_EXPORT_VERSION,
            exportedAt: new Date().toISOString(),
            graph: JSON.parse(JSON.stringify(graph)),
            settings: settingsManager.getAllSettings(),
            vars: getVarsSnapshot(),
            subgraphs: require('./manager/subgraphStore').listDefinitions(),
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `netsocket-backup-${stamp}.json`
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        return res.status(200).send(JSON.stringify(body, null, 2))
    } catch (e) {
        log(`export-full-state: ${e}`, logColors.Error)
        return res.sendStatus(500)
    }
})

app.post('/v1/import-full-state', async (req, res) => {
    if (!canAccessPrivateApi(req, res)) {
        return res.sendStatus(401)
    }
    const payload = req.body
    if (!payload || payload[FULL_EXPORT_SCHEMA] !== true || payload.version !== FULL_EXPORT_VERSION) {
        return res.status(400).json({ error: 'invalid_backup' })
    }
    const graph = payload.graph
    if (!graph || typeof graph !== 'object' || graph.nodes == null) {
        return res.status(400).json({ error: 'invalid_graph' })
    }
    if (!Array.isArray(payload.settings)) {
        return res.status(400).json({ error: 'invalid_settings' })
    }
    try {
        const nextGraph = JSON.parse(JSON.stringify(graph))
        if (!Array.isArray(nextGraph.currentValues)) {
            nextGraph.currentValues = []
        }
        setNodes(nextGraph, { fromImport: true })
        await settingsManager.replaceAllSettings(payload.settings)
        await replaceVarsAndPersist(payload.vars != null ? payload.vars : [])
        if (Array.isArray(payload.subgraphs)) {
            const subgraphStore = require('./manager/subgraphStore')
            for (const existing of subgraphStore.listDefinitions()) {
                await subgraphStore.deleteDefinition(existing.id)
            }
            for (const def of payload.subgraphs) {
                await subgraphStore.saveDefinition(def)
            }
            const subgraphPayload = JSON.stringify({
                broadcastPurpose: "subgraphsChanged",
                broadcastData: subgraphStore.listDefinitions(),
            })
            connectedClients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(subgraphPayload)
                }
            })
        }
        cronTriggerManager.syncFromGraphIfNeeded()
        try {
            await require('./utils/hueApi').setupHueApi()
        } catch (e) {
            log(`Hue reconnect after import: ${e}`, logColors.Warning)
        }
        try {
            require('./utils/languageModel').reinitOllama()
        } catch (e) {
            log(`Ollama reinit after import: ${e}`, logColors.Warning)
        }
        broadcastGraphToClients()
        return res.status(200).json({ ok: true })
    } catch (e) {
        log(`import-full-state: ${e}`, logColors.Error)
        return res.status(500).json({ error: 'import_failed' })
    }
})

app.get('/logout', (req, res) => {
    revokeToken(req.cookies?.tk);
    res.clearCookie('tk', clearCookieOpts).redirect('/login');
});

const { ensureMcpApiToken, regenerateMcpApiToken } = require('./mcp/token')

app.post('/v1/mcp/regenerate-token', async (req, res) => {
    if (!canAccessPrivateApi(req, res)) {
        return res.sendStatus(401)
    }
    try {
        const token = await regenerateMcpApiToken()
        return res.status(200).json({ token })
    } catch (e) {
        log(`MCP token regenerate error: ${e}`, logColors.Error)
        return res.status(500).json({ error: 'regenerate_failed' })
    }
})

require('./mcp/mount').mountMcpRoutes(app)

app.get('/:page', (req, res) => {
    res.sendStatus(404)
})

const PORT = process.env.PORT || 4675;
const HOSTNAME = process.env.HOSTNAME || undefined;
const { killProcessOnPort } = require('./utils/killProcessOnPort');
(async () => {
    try {
        await populateUsers()
        await populateNodes()
        await populateCredentials()
        await reloadVars()
        await reloadMcpAgentMemory()
        await settingsManager.reloadSettings()
        if (!authSkipped()) {
            const existingMcpToken = settingsManager.getSetting('mcp.apiToken')
            const mcpToken = await ensureMcpApiToken()
            if (!existingMcpToken && mcpToken) {
                log('MCP API token was auto-generated.', logColors.Warning)
                log('Dashboard → Preferences → MCP API Token, or set NETSOCKET_MCP_TOKEN for Cursor.', logColors.Warning)
            }
        }
        constructedNodes = await require('./manager/nodeImporter').setupNodes()
        await require('./manager/subgraphStore').loadSubgraphs()
        cronTriggerManager.syncFromGraphIfNeeded()
    } catch (e) {
        log(`Startup init error: ${e}`, logColors.Error)
    }
    try {
        const killedPids = killProcessOnPort(PORT)
        if (killedPids.length) {
            log(`Freed port ${PORT} by stopping process(es): ${killedPids.join(', ')}`, logColors.Warning)
        }
    } catch (e) {
        log(`Could not free port ${PORT}: ${e}`, logColors.Warning)
    }
    server.listen(PORT, HOSTNAME, () => {
        startGoogleTriggerPoller()
        log(`Imported ${require('./manager/nodeImporter').getNumNodesImported()} nodes`)
        log(`Server running on http://127.0.0.1:${PORT}`)
        log(`Dashboard URL: http://127.0.0.1:${PORT}/dashboard`)
        log(`MCP endpoint: http://127.0.0.1:${PORT}/mcp`)
    })
})()

let shuttingDown = false
const shutdown = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    log(`Received ${signal}, flushing session store…`)
    try {
        flushUsersSync()
    } catch (e) {
        log(`Session flush error: ${e}`, logColors.Error)
    }
    process.exit(0)
}
process.on('SIGINT', () => { shutdown('SIGINT') })
process.on('SIGTERM', () => { shutdown('SIGTERM') })