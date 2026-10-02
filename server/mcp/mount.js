const { log, logColors } = require('../log')
const { authSkipped, bearerTokenMatches, hasUserSession } = require('../utils/sessionAuth')
const { getMcpApiToken } = require('./token')
const { listNodeSummaries, getNodeInfo, executeMcpNode } = require('./handlers')
const { listNodesForMcp } = require('../utils/netsocketMcpTools')
const { createGraphContext } = require('./graphHandlers')
const { createSystemHandlers } = require('./systemHandlers')

const canAccessMcp = (req, res = null) => {
    if (authSkipped()) return true
    if (bearerTokenMatches(req, getMcpApiToken())) return true
    return hasUserSession(req, res)
}

const mcpCors = (req, res, next) => {
    const allowed = process.env.MCP_ALLOWED_ORIGINS
    const origin = req.headers.origin
    if (allowed === '*') {
        res.setHeader('Access-Control-Allow-Origin', '*')
    } else if (origin && allowed) {
        const allowedOrigins = allowed.split(',').map((value) => value.trim()).filter(Boolean)
        if (allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Vary', 'Origin')
        }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-protocol-version, mcp-session-id')
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204)
    }
    next()
}

const requireMcpAuth = (req, res, next) => {
    if (canAccessMcp(req, res)) return next()
    return res.status(401).json({
        error: 'unauthorized',
        hint: 'Provide Authorization: Bearer <token>. Get the token from Dashboard → Preferences → MCP API Token.',
    })
}

let mcpReadyPromise = null
let graphHooks = {}

const getGraphContext = () => {
    const saveState = require('../manager/saveState')
    const { getNodeMetadata } = require('../manager/nodeImporter')
    const { executeGraph } = require('../manager/execute')
    const cronTriggerManager = require('../utils/cronTriggerManager')

    const graphCtx = createGraphContext({
        getRoot: () => saveState.getNodes(),
        persistInner: (inner) => {
            const current = saveState.getNodes()
            saveState.setNodes({ nodes: inner, currentValues: current.currentValues })
            cronTriggerManager.syncFromGraphIfNeeded()
            if (typeof graphHooks.onGraphChanged === 'function') {
                try { graphHooks.onGraphChanged() } catch (_) { /* ignore broadcast errors */ }
            }
        },
        getSchema: (nodeType) => getNodeMetadata(nodeType),
        runNode: (node, customInputs) => executeGraph(node, customInputs, {}),
    })
    const systemCtx = createSystemHandlers({
        getRoot: () => saveState.getNodes(),
    })
    return { graphCtx, systemCtx }
}

const ensureMcpReady = () => {
    if (!mcpReadyPromise) {
        mcpReadyPromise = (async () => {
            const { NodeStreamableHTTPServerTransport } = await import('@modelcontextprotocol/node')
            const { createNetsocketMcpServer } = await import('./server.mjs')
            const { graphCtx, systemCtx } = getGraphContext()

            const server = createNetsocketMcpServer({
                listNodesForMcp,
                getNodeInfo,
                executeNode: executeMcpNode,
                getGraph: (args) => graphCtx.getGraph(args),
                addNode: (args) => graphCtx.addNode(args),
                updateNode: (args) => graphCtx.updateNode(args),
                removeNode: (args) => graphCtx.removeNode(args),
                connectNodes: (args) => graphCtx.connectNodes(args),
                disconnectLink: (args) => graphCtx.disconnectLink(args),
                alignNodes: (args) => graphCtx.alignNodes(args),
                addGroup: (args) => graphCtx.addGroup(args),
                updateGroup: (args) => graphCtx.updateGroup(args),
                removeGroup: (args) => graphCtx.removeGroup(args),
                applyGraphEdits: (args) => graphCtx.applyEdits(args),
                graphUndo: (args) => graphCtx.graphUndo(args),
                graphRedo: (args) => graphCtx.graphRedo(args),
                executeGraphNode: (args) => graphCtx.executeGraphNode(args),
                getLogs: (args) => systemCtx.getLogs(args),
                listSettings: () => systemCtx.listSettings(),
                getSetting: (args) => systemCtx.getSetting(args),
                setSetting: (args) => systemCtx.setSetting(args),
                getCanvas: (args) => systemCtx.getCanvas(args),
            })

            const transport = new NodeStreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
            })

            await server.connect(transport)
            return transport
        })().catch((error) => {
            mcpReadyPromise = null
            throw error
        })
    }
    return mcpReadyPromise
}

const GRAPH_TOOL_NAMES = [
    'get_graph',
    'add_node',
    'update_node',
    'remove_node',
    'connect_nodes',
    'disconnect_link',
    'align_nodes',
    'add_group',
    'update_group',
    'remove_group',
    'apply_graph_edits',
    'graph_undo',
    'graph_redo',
    'execute_graph_node',
    'get_logs',
    'list_settings',
    'get_setting',
    'set_setting',
    'get_canvas',
]

const mountMcpRoutes = (app, hooks = {}) => {
    graphHooks = hooks && typeof hooks === 'object' ? hooks : {}
    app.get('/v1/mcp/info', requireMcpAuth, (req, res) => {
        const port = process.env.PORT || 4675
        const host = process.env.HOSTNAME || '127.0.0.1'
        res.status(200).json({
            name: 'netsocket',
            transport: 'streamable-http',
            mcpEndpoint: '/mcp',
            auth: {
                required: !authSkipped(),
                methods: authSkipped() ? [] : ['bearer', 'session'],
                header: 'Authorization: Bearer <token>',
                preference: 'mcp.apiToken',
                openWhenAuthSkipped: authSkipped(),
                cursorExample: {
                    url: `http://${host}:${port}/mcp`,
                    headers: {
                        Authorization: 'Bearer ${env:NETSOCKET_MCP_TOKEN}',
                    },
                },
            },
            ready: true,
            tools: ['list_nodes', 'get_node_info', 'execute_node', ...GRAPH_TOOL_NAMES],
        })
    })

    app.all('/mcp', mcpCors, requireMcpAuth, async (req, res) => {
        try {
            const transport = await ensureMcpReady()
            await transport.handleRequest(req, res, req.body)
        } catch (error) {
            log(`MCP request failed: ${error?.message || error}`, logColors.Error)
            if (!res.headersSent) {
                res.status(500).json({ error: 'mcp_error', message: error?.message || String(error) })
            }
        }
    })
}

module.exports = {
    mountMcpRoutes,
    canAccessMcp,
    listNodeSummaries,
    getNodeInfo,
}
