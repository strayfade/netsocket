'use strict'

const { getNodeMetadataList, getNodeMetadata } = require('../manager/nodeImporter')
const { executeStandaloneNode } = require('../manager/executeStandalone')
const { buildExampleUsage, buildMcpCallingGuide } = require('../manager/nodeSchema')

const MCP_AGENT_NODE_TYPE = 'Language Processing/MCP Agent'

const SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'the', 'of', 'to', 'on', 'off', 'in', 'at', 'for', 'and', 'or',
    'my', 'me', 'please', 'can', 'you', 'i', 'is', 'are', 'be', 'do', 'with', 'from',
])

const toSummary = (node) => {
    const summary = {
        nodeType: node.title,
        category: node.category,
        name: node.name,
        description: node.description,
    }
    if (node.mcpPreferred != null) {
        summary.mcpPreferred = node.mcpPreferred
    }
    return summary
}

const isMcpPreferred = (node) => node?.mcpPreferred != null && node.mcpPreferred !== false

const tokenizeQuery = (query) => {
    const tokens = String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token))

    return [...new Set(tokens)]
}

const scoreNodeMatch = (node, query) => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return 0

    const title = node.title.toLowerCase()
    const name = node.name.toLowerCase()
    const category = node.category.toLowerCase()
    const description = String(node.description || '').toLowerCase()
    const full = `${category}/${name}`

    if (title === q || name === q || full === q) return 1000
    if (title.endsWith(`/${q}`)) return 900
    if (name.startsWith(q) || q.startsWith(name)) return 800
    if (q.length >= 4 && name.includes(q)) return 600
    if (q.length >= 4 && title.includes(q)) return 400
    if (q.length >= 4 && description.includes(q)) return 350
    if (q.length >= 4 && category.includes(q)) return 200

    const tokens = tokenizeQuery(q)
    if (tokens.length === 0) return 0

    const leafName = title.split('/').pop() || name
    let score = 0
    for (const token of tokens) {
        if (title.includes(token)) score += 12
        if (name.includes(token)) score += 14
        if (description.includes(token)) score += 10
        if (category.includes(token)) score += 4
        if (leafName.includes(token)) score += 18
    }

    if (tokens.length >= 2) {
        const joined = tokens.join(' ')
        if (leafName.includes(joined) || name.includes(joined) || description.includes(joined)) {
            score += 30
        }
    }

    if (tokens.includes('all') && leafName.includes('all')) {
        score += 20
    }

    if ((tokens.includes('turn') || tokens.includes('set')) && /set|state|on/.test(leafName)) {
        score += 15
    }

    if (tokens.includes('get') && leafName.startsWith('get ')) {
        score += 10
    }

    return score
}

const compareSearchResults = (a, b) => {
    const scoreDiff = b.score - a.score
    if (scoreDiff === 0) {
        const preferredDiff = Number(isMcpPreferred(b.node)) - Number(isMcpPreferred(a.node))
        if (preferredDiff !== 0) return preferredDiff
    }
    return scoreDiff
}

const searchNodeSummaries = (query, limit = 12) => {
    const q = String(query || '').trim()
    if (!q) return []

    return getNodeMetadataList()
        .map((node) => ({ node, score: scoreNodeMatch(node, q) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => compareSearchResults(a, b) || a.node.title.localeCompare(b.node.title))
        .slice(0, limit)
        .map((entry) => toSummary(entry.node))
}

const normalizeListOptions = (filter) => {
    if (filter == null || filter === '') return {}
    if (typeof filter === 'string') return { category: filter }
    if (typeof filter === 'object') return filter
    return {}
}

const listNodeSummaries = (filter) => {
    const { category: categoryFilter, query } = normalizeListOptions(filter)

    if (query) {
        return searchNodeSummaries(query)
    }

    let nodes = getNodeMetadataList()

    if (categoryFilter) {
        const normalized = String(categoryFilter).trim().toLowerCase()
        const byCategory = nodes.filter((node) => node.category.toLowerCase() === normalized)
        if (byCategory.length > 0) {
            nodes = byCategory
        } else {
            return searchNodeSummaries(categoryFilter)
        }
    }

    return nodes.map(toSummary)
}

const getNodeInfo = (nodeType) => {
    const normalized = String(nodeType || '').trim()
    let schema = getNodeMetadata(normalized)

    if (!schema && normalized && !normalized.includes('/')) {
        const matches = searchNodeSummaries(normalized, 1)
        if (matches.length === 1) {
            schema = getNodeMetadata(matches[0].nodeType)
        }
    }

    if (!schema) return null
    return {
        ...schema,
        example: buildExampleUsage(schema),
        callingGuide: buildMcpCallingGuide(schema),
        chainingHint: 'Pass values from execute_node.outputs or execute_node.outputSlots into the next execute_node.inputs object. Use callingGuide.executeNode.outputs[].mcpKey to know which output keys to read.',
    }
}

const executeMcpNode = async (nodeType, options = {}) => {
    if (nodeType === MCP_AGENT_NODE_TYPE) {
        return {
            success: false,
            nodeType,
            error: 'Recursive MCP Agent execution is not allowed',
            code: 'RECURSION_BLOCKED',
        }
    }

    const inputs = options.inputs && typeof options.inputs === 'object' ? options.inputs : {}
    const properties = options.properties && typeof options.properties === 'object'
        ? options.properties
        : {}

    try {
        return await executeStandaloneNode(nodeType, { inputs, properties })
    } catch (error) {
        return {
            success: false,
            nodeType,
            error: error?.message || String(error),
            code: error?.code || 'EXECUTION_FAILED',
        }
    }
}

module.exports = {
    MCP_AGENT_NODE_TYPE,
    tokenizeQuery,
    scoreNodeMatch,
    compareSearchResults,
    isMcpPreferred,
    listNodeSummaries,
    searchNodeSummaries,
    getNodeInfo,
    executeMcpNode,
}
