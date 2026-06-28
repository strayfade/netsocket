'use strict'

const { tool, jsonSchema } = require('ai')
const { log, logColors } = require('../log')
const {
    listNodeSummaries,
    getNodeInfo,
    executeMcpNode,
} = require('../mcp/handlers')

const LOG_PREFIX = '[MCP Agent]'
const MAX_LIST_NODES = 80
const MAX_QUERY_RESULTS = 12

function agentLog(message, colors = logColors.Default) {
    log(`${LOG_PREFIX} ${message}`, colors)
}

function compactNodeList(nodes, options = {}) {
    const limit = options.queried ? MAX_QUERY_RESULTS : MAX_LIST_NODES
    const compact = nodes.slice(0, limit).map((node) => {
        const entry = {
            nodeType: node.nodeType,
            name: node.name,
        }
        if (node.description) {
            entry.description = node.description
        }
        if (node.mcpPreferred != null) {
            entry.mcpPreferred = node.mcpPreferred
        }
        return entry
    })

    const payload = {
        nodes: compact,
        count: nodes.length,
        truncated: nodes.length > limit,
    }

    if (options.queried) {
        payload.queried = true
        payload.hint = 'Results are ranked by relevance to your query. Nodes with mcpPreferred are recommended when multiple nodes can fulfill the task. Use the exact nodeType string when calling get_node_info or execute_node.'
    } else if (nodes.length > limit) {
        payload.hint = `Showing first ${limit} of ${nodes.length}. Pass a query to search by keywords, or category to filter (e.g. "Math", "Smart Home").`
    } else {
        payload.hint = 'Pass a query with keywords from the user request to find relevant nodes (e.g. query: "philips hue get all lights"). Use the exact nodeType string from results.'
    }

    return payload
}

function listNodesForMcp({ category, query } = {}) {
    const nodes = listNodeSummaries({ category, query })
    return compactNodeList(nodes, { queried: Boolean(query) })
}

function createNetsocketMcpTools(options = {}) {
    const silent = options.silent === true

    return {
        execute_node: tool({
            description: 'Run a single node with the provided inputs and optional properties. Call get_node_info first for required inputs, type/structure guidance, and output mcpKey names. Returns output values you can pass to another node.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    nodeType: {
                        type: 'string',
                        description: 'Node type in Category/Name format',
                    },
                    inputs: {
                        type: 'object',
                        description: 'Input values keyed by input port name; match get_node_info callingGuide.executeNode.inputs types and structures',
                        additionalProperties: true,
                    },
                    properties: {
                        type: 'object',
                        description: 'Node property overrides keyed by property name (only for settings not already declared as inputs)',
                        additionalProperties: true,
                    },
                },
                required: ['nodeType'],
                additionalProperties: false,
            }),
            execute: async ({ nodeType, inputs, properties }) => {
                if (!silent) {
                    agentLog(`Tool invoked: execute_node (${nodeType})`)
                }
                return executeMcpNode(nodeType, {
                    inputs: inputs || {},
                    properties: properties || {},
                })
            },
        }),
        get_node_info: tool({
            description: 'Get full metadata for a node type: callingGuide (required inputs, output keys/types/structures), enriched port metadata, properties, defaults, and example usage. Use the exact nodeType from list_nodes results.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    nodeType: {
                        type: 'string',
                        description: 'Node type in Category/Name format, e.g. "Smart Home/Philips Hue/Lights/Get All Lights"',
                    },
                },
                required: ['nodeType'],
                additionalProperties: false,
            }),
            execute: async ({ nodeType }) => {
                if (!silent) {
                    agentLog(`Tool invoked: get_node_info (${nodeType})`)
                }
                const info = getNodeInfo(nodeType)
                if (!info) {
                    return {
                        error: `Unknown node type: ${nodeType}`,
                        hint: 'Call list_nodes with a query to find valid node types. Use the exact nodeType string from the results.',
                    }
                }
                return info
            },
        }),
        list_nodes: tool({
            description: 'Search or list available node types with name and description. Prefer passing a query with keywords from the user request instead of listing everything.',
            inputSchema: jsonSchema({
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Keywords to find relevant nodes, e.g. "philips hue get all lights" or "turn on lights". Returns ranked matches.',
                    },
                    category: {
                        type: 'string',
                        description: 'Optional category filter, e.g. "Math" or "Smart Home". Use query when you know what the user wants.',
                    },
                },
                additionalProperties: false,
            }),
            execute: async ({ category, query } = {}) => {
                if (!silent) {
                    const label = query
                        ? `query: ${query}`
                        : category
                            ? `category: ${category}`
                            : 'all'
                    agentLog(`Tool invoked: list_nodes (${label})`)
                }
                return listNodesForMcp({ category, query })
            },
        }),
    }
}

module.exports = {
    LOG_PREFIX,
    MAX_LIST_NODES,
    MAX_QUERY_RESULTS,
    compactNodeList,
    listNodesForMcp,
    createNetsocketMcpTools,
}
