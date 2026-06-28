const { log, logColors } = require('../log')
const { authSkipped, bearerTokenMatches, hasUserSession } = require('../utils/sessionAuth')
const { getMcpApiToken } = require('./token')
const { listNodeSummaries, getNodeInfo, executeMcpNode } = require('./handlers')
const { listNodesForMcp } = require('../utils/netsocketMcpTools')

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

const ensureMcpReady = () => {
    if (!mcpReadyPromise) {
        mcpReadyPromise = (async () => {
            const { NodeStreamableHTTPServerTransport } = await import('@modelcontextprotocol/node')
            const { createNetsocketMcpServer } = await import('./server.mjs')

            const server = createNetsocketMcpServer({
                listNodesForMcp,
                getNodeInfo,
                executeNode: executeMcpNode,
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

const mountMcpRoutes = (app) => {
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
            tools: ['list_nodes', 'get_node_info', 'execute_node'],
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
