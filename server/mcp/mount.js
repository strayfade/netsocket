const { log, logColors } = require('../log')
const { authSkipped, isLanClient } = require('../utils/sessionAuth')
const { getNodeMetadataList, getNodeMetadata } = require('../manager/nodeImporter')
const { executeStandaloneNode } = require('../manager/executeStandalone')
const { buildExampleUsage } = require('../manager/nodeSchema')

const canAccessMcp = (req) => authSkipped() || isLanClient(req)

const listNodeSummaries = (categoryFilter) => {
    let nodes = getNodeMetadataList()
    if (categoryFilter) {
        const normalized = String(categoryFilter).trim().toLowerCase()
        nodes = nodes.filter((node) => node.category.toLowerCase() === normalized)
    }
    return nodes.map((node) => ({
        nodeType: node.title,
        category: node.category,
        name: node.name,
        description: node.description,
    }))
}

const getNodeInfo = (nodeType) => {
    const schema = getNodeMetadata(nodeType)
    if (!schema) return null
    return {
        ...schema,
        example: buildExampleUsage(schema),
        chainingHint: 'Pass values from execute_node.outputs or execute_node.outputSlots into the next execute_node.inputs object.',
    }
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
    if (canAccessMcp(req)) return next()
    return res.status(403).json({
        error: 'forbidden',
        hint: 'MCP is only available to clients on the same local network.',
    })
}

let mcpReadyPromise = null

const ensureMcpReady = () => {
    if (!mcpReadyPromise) {
        mcpReadyPromise = (async () => {
            const { NodeStreamableHTTPServerTransport } = await import('@modelcontextprotocol/node')
            const { createNetsocketMcpServer } = await import('./server.mjs')

            const server = createNetsocketMcpServer({
                listNodeSummaries,
                getNodeInfo,
                executeNode: executeStandaloneNode,
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
        res.status(200).json({
            name: 'netsocket',
            transport: 'streamable-http',
            mcpEndpoint: '/mcp',
            auth: {
                lanOnly: true,
                openWhenAuthSkipped: authSkipped(),
            },
            ready: canAccessMcp(req),
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
