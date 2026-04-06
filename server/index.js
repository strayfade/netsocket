const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises
var compression = require('compression')

const { log, logColors, setOnPushLog, getLines } = require('./log')
const { config } = require('./config')

const app = express();
app.use(express.json());
app.use(compression())

const { getNodes, setNodes, populateNodes } = require('./manager/saveState')
const settingsManager = require('./manager/settingsManager.js')
const cronTriggerManager = require('./utils/cronTriggerManager')
const nodePreferencesRegistry = require('./manager/nodePreferencesRegistry')

// Create an HTTP server
const server = http.createServer(app);

// MARK: Websocket server
const wss = new WebSocket.Server({ server });
let connectedClients = [];

// Store connected clients
const { setWsServerConnectedClients } = require('./utils/alert.js')
const { executeGraph } = require('./manager/execute')
var cookieParser = require('cookie-parser')
app.use(cookieParser())
wss.on('connection', (socket, request) => {

    const cookiesHeader = request.headers.cookie;
    let cookies = (() => {
        if (!cookiesHeader) {
            return {
                tk: "_blank"
            }
        }
        const cookies2 = Object.fromEntries(
            cookiesHeader.split(';').map(c => {
                const [key, ...v] = c.trim().split('=');
                return [key, v.join('=')];
            })
        );
        return cookies2
    })()

    if (validateToken(cookies.tk) || request.headers?.['x-socket-auth'] == settingsManager.getSetting('triggersCommandPalette.secret')) {
        connectedClients.push(socket);
        log('Client connected');
        setWsServerConnectedClients(connectedClients)
        socket.on('close', () => {
            connectedClients = connectedClients.filter((s) => s !== socket);
            setWsServerConnectedClients(connectedClients)
            log('Client disconnected');
        });
    }
    else {
        log('Connection denied');
        socket.close();
    }
    socket.on('message', async (message) => {
        try {
            message = JSON.parse(message)
            if (connectedClients.includes(socket)) {
                switch (message.broadcastPurpose) {
                    case "command":
                        if (message.broadcastData == "/noti") {
                            socket.send(JSON.stringify({
                                broadcastPurpose: "overlay",
                                broadcastData: "this is a test notification!"
                            }))
                        }
                        else {
                            onNewCommand(message.broadcastData)
                        }
                        socket.send(JSON.stringify({
                            broadcastPurpose: 'ack',
                        }));
                        break;
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
                            const stored = settingsManager.getStoredValue(p.id)
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
                        if (typeof name === 'string' && name.length) {
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

// MagicMirror
app.get("/v1/mirror", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "../extensions/mirror/index.html"))
})

// Web
const { getUsers, setUsers, populateUsers } = require('./manager/saveUsers.js')
const {
    populateCredentials,
    hasAccount,
    getHashes,
    setCredentials,
} = require('./manager/saveCredentials.js')
const bcrypt = require('bcrypt')
const BCRYPT_ROUNDS = 12
const authSkipped = () => process.argv.includes("--skip-auth");
const SESSION_IDLE_MS = 1000 * 60 * 60 * 24 * 7;
const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const sessionCookieOpts = {
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
};

/**
 * Validates token, drops stale sessions, and refreshes last-activity time (sliding expiration).
 */
const sessionIsValidAndTouch = (tk) => {
    if (!tk) return false;
    const now = Date.now();
    let users = getUsers();
    const fresh = users.filter((u) => now - u.ts <= SESSION_IDLE_MS);
    if (fresh.length !== users.length) {
        users = fresh;
        setUsers(users);
    }
    const idx = users.findIndex((u) => {
        return u.tk === decodeURIComponent(tk)
    });
    if (idx === -1) return false;
    users[idx].ts = now;
    setUsers(users);
    return true;
};

const validateToken = (tk) => {
    if (authSkipped()) return true;
    return sessionIsValidAndTouch(tk);
};

/** True when a real session cookie is present and valid (never true when --skip-auth). */
const hasUserSession = (req) => {
    if (authSkipped()) return false;
    return sessionIsValidAndTouch(req.cookies?.tk);
};
const crypto = require('crypto');
function generateRandomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(crypto.randomInt(chars.length));
    }
    return result;
}
const createToken = () => {
    const tk = btoa(generateRandomString(128));
    const users = getUsers();
    users.push({
        ts: Date.now(),
        tk,
    });
    setUsers(users);
    return tk;
};
const blacklistedPaths = ["/createNode.js", "constructNodes.js", "/litegraph-editor.css", "/litegraph.css", "/litegraph.js", "/netsocket-editor.css", "/dashboard"]
app.use((req, res, next) => {
    if (blacklistedPaths.includes(req.originalUrl.toLowerCase()))
        if (validateToken(req.cookies?.tk))
            next()
        else
            res.clearCookie("tk", { path: "/" }).status(403).redirect(`/login?redirect=${encodeURIComponent(`/dashboard`)}`)
    else
        next()
})
let constructedNodes = ""
app.get('/constructNodes.js', (req, res) => {
    res.status(200).type("application/javascript").send(constructedNodes)
})
app.get("/dashboard", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "../frontend/editor.html"))
})
app.use('/', express.static(path.join(__dirname, '../frontend/public')));
app.get("/", (req, res) => {
    res.redirect(302, "/login");
});
const { onNewCommand } = require('./utils/waitForCommands.js')
app.post("/v1/postCommand", async (req, res) => {
    await onNewCommand(req.body.command)
    res.sendStatus(200);
})
app.get("/v1/auth-state", (req, res) => {
    res.status(200).json({ needsRegistration: !hasAccount() });
});

app.post("/login", async (req, res) => {
    const { username, password, passwordConfirm } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") {
        return res.sendStatus(400);
    }
    const u = username.trim();
    if (!u || !password.length) {
        return res.sendStatus(400);
    }
    if (authSkipped()) {
        const tk = createToken();
        return res.cookie("tk", tk, sessionCookieOpts).sendStatus(200);
    }
    try {
        const cmp = async (str1, str2) => {
            let eq = str1 === str2
            await new Promise((resolve) => setTimeout(resolve, 10))
            return eq;
        }
        if (!hasAccount()) {
            if (!(await cmp(password, passwordConfirm))) {
                return res.status(400).json({ error: "password_mismatch" });
            }
            const usernameHash = await bcrypt.hash(u, BCRYPT_ROUNDS);
            const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
            await setCredentials(usernameHash, passwordHash);
            const tk = createToken();
            return res.cookie("tk", tk, sessionCookieOpts).sendStatus(200);
        }
        const creds = getHashes();
        const userOk = await bcrypt.compare(u, creds.usernameHash);
        const passOk = await bcrypt.compare(password, creds.passwordHash);
        if (!userOk || !passOk) {
            return res.sendStatus(401);
        }
        const tk = createToken();
        return res.cookie("tk", tk, sessionCookieOpts).sendStatus(200);
    } catch (e) {
        log(`Login error: ${e}`, logColors.Error);
        return res.sendStatus(500);
    }
})
app.get("/login", (req, res) => {
    if (hasUserSession(req)) {
        return res.redirect(302, "/dashboard");
    }
    res.status(200).sendFile(path.join(__dirname, "../frontend/index.html"));
});
app.get("/documentation", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "../frontend/index.html"))
})
app.get("/v1/session", (req, res) => {
    if (hasUserSession(req)) res.sendStatus(200);
    else res.sendStatus(401);
});

app.get('/logout', (req, res) => {
    res.clearCookie("tk", { path: "/" }).redirect("/login");
});
app.get('/:page', (req, res) => {
    res.sendStatus(404)
})

const PORT = process.env.PORT || 4675;
const HOSTNAME = process.env.HOSTNAME || undefined;
const { reloadVars } = require('./utils/vars.js')
server.listen(PORT, HOSTNAME, async () => {
    await populateNodes()
    await populateUsers()
    await populateCredentials()
    await reloadVars()
    await settingsManager.reloadSettings()
    constructedNodes = await require('./manager/nodeImporter').setupNodes()
    cronTriggerManager.syncFromGraphIfNeeded()
    log(`Imported ${require('./manager/nodeImporter').getNumNodesImported()} nodes`)
    log(`Server running on http://127.0.0.1:${PORT}`);
    log(`Dashboard URL: http://127.0.0.1:${PORT}/dashboard`)
});