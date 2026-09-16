'use strict';

const sessionAuth = require('../utils/sessionAuth')
const deviceAuth = require('../utils/deviceAuth')
const panelStore = require('./panelStore')
const { summarizeAutomations, RUNNABLE_TRIGGER_TYPES, getGraphNodes } = require('./dashboardSummary')

const getDefaultGraphRoot = () => require('./saveState').getNodes()
const runDefaultExecute = (node) => require('./execute').executeGraph(node)

const STORE_ERRORS = new Set([
    'name_required',
    'invalid_room',
    'invalid_widgets',
    'invalid_widget',
    'invalid_type',
    'invalid_layout',
    'variable_required',
    'automation_required',
    'too_many_widgets',
    'invalid_automation_ids',
    'invalid_device_ids',
    'invalid_show_borders',
    'invalid_id',
    'id_taken',
])

const storeErrorStatus = (code) => (STORE_ERRORS.has(code) ? 400 : 500)

/**
 * Panels are session-gated: every endpoint requires a dashboard login
 * session. Unknown panel ids resolve to not_found (no auth oracle).
 * Returns { panel } or { error }.
 */
const resolveAccess = (req, panelId, deps = {}) => {
    const store = deps.store || panelStore
    const auth = deps.auth || sessionAuth
    const panel = store.getPanel(panelId)
    if (!panel) return { error: 'not_found' }
    if (!auth.canAccessPrivateApi(req, null)) return { error: 'unauthorized' }
    return { panel }
}

const requireAdmin = (req, res, deps = {}) => {
    const auth = deps.auth || sessionAuth
    if (!auth.canAccessPrivateApi(req, res)) {
        res.sendStatus(401)
        return false
    }
    return true
}

const handleListPanels = (req, res, deps = {}) => {
    const store = deps.store || panelStore
    if (!requireAdmin(req, res, deps)) return
    return res.status(200).json({ panels: store.listPanels() })
}

const handleCreatePanel = (req, res, deps = {}) => {
    const store = deps.store || panelStore
    if (!requireAdmin(req, res, deps)) return
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    try {
        const { panel } = store.createPanel({
            id: body.id,
            name: body.name,
            room: body.room,
            widgets: body.widgets,
            automationIds: body.automationIds,
            deviceIds: body.deviceIds,
            showBorders: body.showBorders,
        })
        return res.status(201).json({ panel })
    } catch (e) {
        return res.status(storeErrorStatus(e.message)).json({ error: e.message || 'create_failed' })
    }
}

const handleUpdatePanel = (req, res, deps = {}) => {
    const store = deps.store || panelStore
    if (!requireAdmin(req, res, deps)) return
    try {
        const panel = store.updatePanel(req.params?.panelId, req.body && typeof req.body === 'object' ? req.body : {})
        if (!panel) return res.status(404).json({ error: 'not_found' })
        return res.status(200).json({ panel })
    } catch (e) {
        return res.status(storeErrorStatus(e.message)).json({ error: e.message || 'update_failed' })
    }
}

const handleDeletePanel = (req, res, deps = {}) => {
    const store = deps.store || panelStore
    if (!requireAdmin(req, res, deps)) return
    if (!store.deletePanel(req.params?.panelId)) return res.status(404).json({ error: 'not_found' })
    return res.sendStatus(204)
}

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
 * WS `getPanelGrants` for device-role sockets. Replies `{ panels }` granted
 * to the approved device. Silent no-op for anyone else (no auth oracle).
 */
const handleDevicePanelGrants = (socket, message, deps = {}) => {
    if (socket?.netsocketRole !== 'device') return false
    const deviceId = approvedDeviceId(socket, deps)
    if (!deviceId) return false
    const store = deps.store || panelStore
    const reply = deps.reply || defaultReplyToSocket
    reply(socket, {
        broadcastPurpose: 'getPanelGrants',
        requestId: message?.requestId,
        broadcastData: { panels: store.panelsForDevice(deviceId) },
    })
    return true
}

const resolvePanelAutomations = (panel, graphRoot) => {
    const nodes = getGraphNodes(graphRoot)
    return summarizeAutomations(nodes.filter((n) => n && RUNNABLE_TRIGGER_TYPES.has(n.type)))
}

/** Values for variables bound to the panel's content widgets (nothing else leaks). */
const resolvePanelVariables = (panel, varList) => {
    const store = panelStore
    const names = store.boundVariableNames(panel)
    const values = {}
    for (const name of names) {
        const entry = (varList || []).find((v) => v && v.name === name)
        values[name] = entry ? entry.value : ''
    }
    return values
}

const handleGetPanelConfig = (req, res, deps = {}) => {
    const store = deps.store || panelStore
    const access = resolveAccess(req, req.params?.panelId, deps)
    if (access.error === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (access.error === 'unauthorized') return res.sendStatus(401)
    store.touchLastSeen(access.panel.id)
    const graphRoot = deps.graphRoot !== undefined ? deps.graphRoot : getDefaultGraphRoot()
    const varList = deps.varList !== undefined ? deps.varList : require('../utils/vars').getVarsSnapshot()
    return res.status(200).json({
        panel: store.publicPanelView(access.panel),
        automations: resolvePanelAutomations(access.panel, graphRoot),
        variables: resolvePanelVariables(access.panel, varList),
    })
}

const handlePanelExecute = async (req, res, deps = {}) => {
    const store = deps.store || panelStore
    const access = resolveAccess(req, req.params?.panelId, deps)
    if (access.error === 'not_found') return res.status(404).json({ error: 'not_found' })
    if (access.error === 'unauthorized') return res.sendStatus(401)
    const nodeId = req.body?.nodeId ?? req.body?.id
    if (nodeId == null || (typeof nodeId !== 'string' && typeof nodeId !== 'number')) {
        return res.status(400).json({ error: 'nodeId_required' })
    }
    const graphRoot = deps.graphRoot !== undefined ? deps.graphRoot : getDefaultGraphRoot()
    const nodes = getGraphNodes(graphRoot)
    const target = nodes.find((n) => n && String(n.id) === String(nodeId))
    if (!target) return res.status(404).json({ error: 'unknown_node' })
    if (!RUNNABLE_TRIGGER_TYPES.has(target.type)) {
        return res.status(400).json({ error: 'not_runnable' })
    }
    store.touchLastSeen(access.panel.id)
    try {
        const run = deps.executeGraph || runDefaultExecute
        const ok = await run(target)
        return res.status(200).json({ ok: ok !== false })
    } catch (e) {
        return res.sendStatus(500)
    }
}

module.exports = {
    resolveAccess,
    handleListPanels,
    handleCreatePanel,
    handleUpdatePanel,
    handleDeletePanel,
    handleGetPanelConfig,
    handlePanelExecute,
    handleDevicePanelGrants,
}
