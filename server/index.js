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
const nodePreferencesRegistry = require('./manager/nodePreferencesRegistry')
const { SCOPES, buildOAuthClient, getStoredTokens, mergeTokenSets, persistOAuthSession, CONNECTED_EMAIL_KEY } = require('./utils/googleAuth')
const { startGoogleTriggerPoller } = require('./utils/googleTriggerPoller')

// Create an HTTP server
const server = http.createServer(app);

// MARK: Websocket server
const wss = new WebSocket.Server({ server });
let connectedClients = [];

// Store connected clients
const { setWsServerConnectedClients, registerConversation, unregisterSocket } = require('./utils/alert.js')
const { executeGraph } = require('./manager/execute')
var cookieParser = require('cookie-parser')
app.use(cookieParser())
let lastWsAuthDeniedLog = 0
wss.on('connection', (socket, request) => {
    const sessionToken = getTokenFromCookieHeader(request.headers.cookie)

    const commandPaletteSecret = settingsManager.getSetting('triggersCommandPalette.secret')
    if (validateToken(sessionToken) || integrationSecretMatches({ headers: request.headers }, commandPaletteSecret)) {
        connectedClients.push(socket);
        //log('Client connected');
        setWsServerConnectedClients(connectedClients)
        socket.on('close', () => {
            connectedClients = connectedClients.filter((s) => s !== socket);
            setWsServerConnectedClients(connectedClients)
            unregisterSocket(socket)
            //log('Client disconnected');
        });
    }
    else {
        const now = Date.now()
        if (now - lastWsAuthDeniedLog > 5000) {
            lastWsAuthDeniedLog = now
            log('Connection denied (session missing or expired — sign in again)')
        }
        socket.close(4401, 'session required')
    }
    socket.on('message', async (message) => {
        try {
            message = JSON.parse(message)
            if (connectedClients.includes(socket)) {
                switch (message.broadcastPurpose) {
                    case "command": {
                        const payload = message.broadcastData
                        let commandText = ""
                        let conversationId = null

                        if (typeof payload === "string") {
                            commandText = payload
                        } else if (payload && typeof payload === "object") {
                            commandText = String(payload.command ?? payload.text ?? "")
                            conversationId = payload.conversationId ?? null
                        }

                        if (conversationId) {
                            registerConversation(conversationId, socket)
                        }

                        if (commandText === "/noti") {
                            socket.send(JSON.stringify({
                                broadcastPurpose: "overlay",
                                broadcastData: {
                                    text: "this is a test notification!",
                                    conversationId: conversationId,
                                },
                            }))
                        } else {
                            await onNewCommand(commandText, conversationId)
                        }

                        socket.send(JSON.stringify({
                            broadcastPurpose: 'ack',
                            conversationId: conversationId,
                        }));
                        break;
                    }
                    case "ping":
                        socket.send(JSON.stringify({
                            broadcastPurpose: 'pong',
                        }));
                        break;
                    case "getNodes":
                        socket.send(JSON.stringify({
                            broadcastPurpose: 'setNodes',
                            broadcastData: getNodes().nodes
                        }));
                        break;
                    case "setNodes":
                        if (message.broadcastData == null) {
                            break
                        }
                        setNodes({
                            nodes: message.broadcastData,
                            currentValues: getNodes().currentValues
                        })
                        cronTriggerManager.syncFromGraphIfNeeded()
                        break;
                    case "execute":
                        setNodes({
                            nodes: message.broadcastData.graphNodes,
                            currentValues: getNodes().currentValues
                        })
                        cronTriggerManager.syncFromGraphIfNeeded()
                        await executeGraph(message.broadcastData.node)
                        socket.send(JSON.stringify({
                            broadcastPurpose: 'setNodes',
                            broadcastData: getNodes().nodes
                        }));
                        break;
                    case "populateLog":
                        socket.send(JSON.stringify({
                            broadcastPurpose: "populateLog",
                            broadcastData: getLines(50)
                        }))
                        break;
                    case "getPreferences": {
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
                                value: stored !== undefined ? stored : fallback
                            }
                        })
                        socket.send(JSON.stringify({
                            broadcastPurpose: "getPreferences",
                            requestId: message.requestId,
                            broadcastData: withValues
                        }))
                        break
                    }
                    case "saveSetting": {
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
                            broadcastPurpose: "saveSetting",
                            requestId: message.requestId,
                            broadcastData: { ok: true }
                        }))
                        break
                    }
                }
            }
        }
        catch (e) {
            log(`Error: ${e}`, logColors.Error)
        }
    })
});
wss.on('listening', () => {
    log(`Websocket server running on ws://localhost:${PORT}`);
})
setOnPushLog(((line) => {
    connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                broadcastPurpose: "newLogLine",
                broadcastData: line
            }));
        }
    });
}))

// MARK: PostNotification
const { onNewNotification } = require('./utils/waitForOTP')
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
app.post("/v1/postCommand", async (req, res) => {
    const commandSecret = settingsManager.getSetting('triggersCommandPalette.secret')
    if (!canAccessWithSessionOrIntegrationSecret(req, res, commandSecret)) {
        return res.sendStatus(401)
    }
    const command = req.body?.command
    if (typeof command !== 'string' || !command.trim()) {
        return res.sendStatus(400)
    }
    await onNewCommand(command)
    res.sendStatus(200);
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
            vars: getVarsSnapshot()
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
        if (!authSkipped() && !settingsManager.getSetting('triggersCommandPalette.secret')) {
            log('Overlay/automation WebSocket auth: Command Palette secret is not configured.', logColors.Warning)
            log('Dashboard → Preferences → Command Palette → Command Palette Secret Key, then enter the same value in the overlay Authentication secret field.', logColors.Warning)
        }
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