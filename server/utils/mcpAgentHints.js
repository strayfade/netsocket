'use strict'

const { searchNodeSummaries, tokenizeQuery } = require('../mcp/handlers')

const OTP_NODE = 'Authentication/OTP'
const GET_OTP_ACCOUNTS_NODE = 'Authentication/Get OTP Accounts'
const QUICK_WEB_SEARCH_NODE = 'Language Processing/Quick Web Search LLM'

function extractNodeQuery(command) {
    const text = String(command || '').trim()
    if (!text) return ''

    const slashMatch = text.match(/\b([A-Za-z][\w]*\/[A-Za-z][\w]*)\b/)
    if (slashMatch) return slashMatch[1].trim()

    const nodeMatch = text.match(/\b(?:the\s+)?([A-Za-z][\w]*)\s+node\b/i)
    if (nodeMatch) return nodeMatch[1].trim()

    const verbMatch = text.match(/\b(?:use|run|call|execute|invoke|send|trigger)\s+(?:the\s+)?([A-Za-z][\w]*)/i)
    if (verbMatch) return verbMatch[1].trim()

    return ''
}

function extractEmail(command) {
    const match = String(command || '').match(/[\w.+-]+@[\w.-]+\.\w+/)
    return match ? match[0] : null
}

function resolveCommandIntent(command) {
    const text = String(command || '').trim()
    if (!text) return null

    if (/\b(web search|search the web|look up online|google|current price|stock price|right now|today'?s|latest news|weather in)\b/i.test(text)
        || /\bwhat(?:'s| is) the (?:price|value|cost|weather|temperature|score)\b/i.test(text)) {
        return {
            intent: 'quick_web_search',
            matches: [{
                nodeType: QUICK_WEB_SEARCH_NODE,
                category: 'Language Processing',
                name: 'Quick Web Search LLM',
            }],
            skipListNodes: true,
        }
    }

    if (/\b(2fa|two[- ]factor|totp|otp|authenticator)\b/i.test(text)) {
        return {
            intent: 'otp',
            matches: [{ nodeType: OTP_NODE, category: 'Authentication', name: 'OTP' }],
            skipListNodes: true,
            email: extractEmail(text),
            wantsCodeOnly: /\b(just the code|only the code|code only|just the otp)\b/i.test(text),
        }
    }

    return null
}

function buildListNodesQuery(command) {
    return tokenizeQuery(command).join(' ')
}

function resolveCommandNodeHints(command) {
    const intent = resolveCommandIntent(command)
    if (intent) return intent

    const text = String(command || '').trim()
    const slashMatch = text.match(/\b([A-Za-z][\w]*\/[A-Za-z][\w]*)\b/)
    if (slashMatch) {
        const matches = searchNodeSummaries(slashMatch[1])
        if (matches.length >= 1) {
            return { matches, skipListNodes: true }
        }
    }

    const query = extractNodeQuery(text)
    if (!query) {
        const listQuery = buildListNodesQuery(text)
        const preview = listQuery ? searchNodeSummaries(listQuery, 5) : []
        return {
            matches: preview,
            skipListNodes: false,
            listQuery,
        }
    }

    const matches = searchNodeSummaries(query)
    if (matches.length >= 1) {
        return { matches, skipListNodes: true }
    }

    return { matches: [], skipListNodes: false }
}

function buildHintPrompt(hints, mode = 'auto') {
    if (mode === 'chat') {
        return 'This message is conversational. Reply naturally without using tools unless the user clearly asks you to perform an action.'
    }

    if (hints.intent === 'quick_web_search') {
        return [
            'The user wants live web information. Use tools to fulfill this.',
            `Run execute_node on "${QUICK_WEB_SEARCH_NODE}" with Query set to the user question.`,
            'You may skip list_nodes. Reply with the search result.',
        ].join(' ')
    }

    if (hints.intent === 'otp') {
        const parts = [
            'The user wants a one-time password. Use tools to fulfill this.',
            `Target node: "${OTP_NODE}".`,
        ]

        if (hints.email) {
            parts.push(
                `User mentioned "${hints.email}". Account keys use Issuer:Account format, not a raw email.`,
                `If needed, execute_node "${GET_OTP_ACCOUNTS_NODE}" first to list keys and find one matching that email.`,
            )
        } else {
            parts.push(
                `If the account key is unknown, execute_node "${GET_OTP_ACCOUNTS_NODE}" first to list keys.`,
            )
        }

        parts.push(
            `Then execute_node "${OTP_NODE}" with Account set to the matching Issuer:Account key.`,
            'Reply with ONLY the numeric code—no other words.',
        )

        return parts.join(' ')
    }

    if (hints.skipListNodes && hints.matches.length === 1) {
        const target = hints.matches[0].nodeType
        return [
            `Likely target node: "${target}".`,
            `Call get_node_info for "${target}" if you need input details, then execute_node.`,
        ].join(' ')
    }

    if (hints.skipListNodes && hints.matches.length > 1) {
        const types = hints.matches.map((match) => match.nodeType).join(', ')
        const preferred = hints.matches.filter((match) => match.mcpPreferred != null && match.mcpPreferred !== false)
        const parts = [
            `Likely node types: ${types}.`,
        ]
        if (preferred.length === 1) {
            const reason = typeof preferred[0].mcpPreferred === 'string'
                ? preferred[0].mcpPreferred
                : 'marked as preferred for this task'
            parts.push(`Prefer "${preferred[0].nodeType}" (${reason}).`)
        } else if (preferred.length > 1) {
            parts.push(`Preferred options: ${preferred.map((match) => match.nodeType).join(', ')}.`)
        }
        parts.push('Pick the best match, call get_node_info once if needed, then execute_node.')
        return parts.join(' ')
    }

    if (mode === 'tools') {
        return [
            'The user wants you to perform an action. Use tools to find and run the right Netsocket nodes.',
            hints.listQuery
                ? `Start with list_nodes using query: "${hints.listQuery}".`
                : 'Start with list_nodes using keywords from the user request.',
            'Pick the best node by matching name and description. When list_nodes marks a node with mcpPreferred, use that node unless the user needs a different interface.',
            'Call get_node_info once before each new node type, then execute_node. Chain nodes when the task needs multiple steps.',
        ].join(' ')
    }

    return [
        'Use tools only when the user asks you to perform an action or fetch data from Netsocket.',
        'For greetings, thanks, or general chat, reply directly without tools.',
    ].join(' ')
}

module.exports = {
    OTP_NODE,
    GET_OTP_ACCOUNTS_NODE,
    QUICK_WEB_SEARCH_NODE,
    extractNodeQuery,
    extractEmail,
    buildListNodesQuery,
    resolveCommandIntent,
    resolveCommandNodeHints,
    buildHintPrompt,
}
