'use strict'

const { generateText, stepCountIs } = require('ai')
const { log, logColors } = require('../log')
const { DEFAULT_MODEL, getOllamaProvider, sanitizeAiOutput } = require('./languageModel')
const { createNetsocketMcpTools, LOG_PREFIX } = require('./netsocketMcpTools')
const { stripThinkingTags } = require('./deepResearch')
const {
    resolveSessionKey,
    getSessionMessages,
    appendSessionTurn,
} = require('./mcpAgentMemory')
const {
    OTP_NODE,
    GET_OTP_ACCOUNTS_NODE,
    QUICK_WEB_SEARCH_NODE,
    resolveCommandNodeHints,
    buildHintPrompt,
} = require('./mcpAgentHints')

const DEFAULT_MAX_STEPS = 15

const GREETING_PATTERN = /^(?:hi|hello|hey|howdy|yo|good\s+(?:morning|afternoon|evening|night)|what'?s?\s*up|sup)[!.?\s]*$/i
const THANKS_PATTERN = /^(?:thanks?|thank\s+you|thx|ty|ok(?:ay)?|cool|great|nice|awesome|perfect|got\s+it)[!.?\s]*$/i
const IDENTITY_PATTERN = /^(?:who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|help(?:\s+me)?|what\s+do\s+you\s+do)[?!\s]*$/i
const CHITCHAT_PATTERN = /^(?:how\s+are\s+you|how\s+r\s+u)[?!\s]*$/i

const ACTION_VERB_PATTERN = /\b(give|get|send|run|use|execute|call|fetch|compute|calculate|add|multiply|perform|trigger|otp|2fa|totp|code for|alert|notify|turn|switch|toggle|enable|disable|start|stop|open|close|set|dim|brighten|activate|deactivate|lock|unlock|arm|disarm|play|pause|resume|publish|delete|remove|create|update|move|search|look up|find|list|show|what(?:'s| is) the)\b/i

const PENDING_EXECUTE_FOLLOW_UP_MESSAGE = [
    'You looked up a node with get_node_info but have not run execute_node yet.',
    'Call execute_node now for that node. Pass outputs from prior execute_node calls as inputs where needed.',
].join(' ')

const ASSISTANT_PERSONA = [
    'You are Netsocket Assistant, a friendly and capable assistant integrated into the Netsocket automation platform.',
    'Be as concise as possible. Usually respond with one sentence or less unless the user asks for more detail.',
    'When the response is information the user will copy or use directly (e.g. a 2FA code, URL, phone number, or OTP), reply with ONLY that value—no greeting, explanation, or surrounding text.',
    'Remember prior conversation in this session.',
    'You can chat naturally for greetings, thanks, questions about yourself, and clarifying what the user wants.',
].join(' ')

const DEFAULT_SYSTEM_PROMPT = [
    ASSISTANT_PERSONA,
    'When the user asks you to DO something — control devices, fetch data, run calculations, send alerts, get OTP codes, search the web, etc. — use the MCP tools to find and execute Netsocket nodes.',
    'Tools: list_nodes (search nodes by query), get_node_info (inspect a node type), execute_node (run a node).',
    'Node types use full paths, e.g. "Smart Home/Philips Hue/Lights/Get All Lights".',
    'Action workflow: list_nodes with relevant keywords if needed, get_node_info once before each new node type, execute_node with correct inputs, chain nodes by passing prior outputs into the next inputs.',
    'When multiple nodes can fulfill a task, prefer nodes marked mcpPreferred in list_nodes or get_node_info results.',
    'Only claim you performed an action after execute_node succeeds. Summarize results briefly unless the user asks for more.',
    'For pure conversation with no action requested, reply directly without using tools.',
].join(' ')

function agentLog(message, colors = logColors.Default) {
    log(`${LOG_PREFIX} ${message}`, colors)
}

function collectToolNames(steps = []) {
    return steps.flatMap((step) => (step.toolCalls || []).map((call) => call.toolName))
}

function collectExecutedNodeTypes(steps = []) {
    return steps
        .flatMap((step) => step.toolCalls || [])
        .filter((call) => call.toolName === 'execute_node')
        .map((call) => call.input?.nodeType)
        .filter(Boolean)
}

function classifyInteractionMode(command, hints) {
    if (hints.intent) {
        return 'tools'
    }

    const text = String(command || '').trim()
    if (!text) {
        return 'chat'
    }

    if (
        GREETING_PATTERN.test(text)
        || THANKS_PATTERN.test(text)
        || IDENTITY_PATTERN.test(text)
        || CHITCHAT_PATTERN.test(text)
    ) {
        return 'chat'
    }

    if (ACTION_VERB_PATTERN.test(text)) {
        return 'tools'
    }

    if (text.length < 100) {
        return 'auto'
    }

    return 'auto'
}

function getPendingNodeTypes(steps = []) {
    const pending = []
    for (const step of steps) {
        for (const call of step.toolCalls || []) {
            if (call.toolName === 'get_node_info' && call.input?.nodeType) {
                pending.push(call.input.nodeType)
            } else if (call.toolName === 'execute_node' && call.input?.nodeType) {
                const index = pending.lastIndexOf(call.input.nodeType)
                if (index !== -1) {
                    pending.splice(index, 1)
                }
            }
        }
    }
    return pending
}

function hasPendingExecute(steps = []) {
    return getPendingNodeTypes(steps).length > 0
}

function countToolCalls(steps = [], toolName) {
    return steps
        .flatMap((step) => step.toolCalls || [])
        .filter((call) => call.toolName === toolName)
        .length
}

function needsExecutionFollowUp(mode, steps, hints = {}) {
    if (mode === 'chat') {
        return false
    }

    if (hasPendingExecute(steps)) {
        return true
    }

    const executedNodes = collectExecutedNodeTypes(steps)

    if (hints.intent === 'otp') {
        return !executedNodes.includes(OTP_NODE)
    }

    if (hints.intent === 'quick_web_search') {
        return !executedNodes.includes(QUICK_WEB_SEARCH_NODE)
    }

    return false
}

function buildPrepareStep(mode, hints, allSteps) {
    return ({ steps }) => {
        const combinedSteps = [...allSteps, ...(steps || [])]
        const executedNodes = collectExecutedNodeTypes(combinedSteps)
        const getInfoCount = countToolCalls(combinedSteps, 'get_node_info')
        const executeCount = countToolCalls(combinedSteps, 'execute_node')

        if (mode === 'chat') {
            return { toolChoice: 'none' }
        }

        if (hints.intent === 'otp') {
            if (executedNodes.includes(OTP_NODE)) {
                return { toolChoice: 'none' }
            }
            if (executedNodes.includes(GET_OTP_ACCOUNTS_NODE)) {
                return { activeTools: ['execute_node'], toolChoice: 'required' }
            }
            return { activeTools: ['get_node_info', 'execute_node'], toolChoice: 'required' }
        }

        if (hints.intent === 'quick_web_search') {
            if (executedNodes.includes(QUICK_WEB_SEARCH_NODE)) {
                return { toolChoice: 'none' }
            }
            return { activeTools: ['get_node_info', 'execute_node'], toolChoice: 'required' }
        }

        if (getInfoCount > executeCount) {
            return { activeTools: ['execute_node'], toolChoice: 'required' }
        }

        if (mode === 'tools' && executeCount === 0) {
            return { activeTools: ['list_nodes', 'get_node_info', 'execute_node'], toolChoice: 'required' }
        }

        return { activeTools: ['list_nodes', 'get_node_info', 'execute_node'] }
    }
}

function summarizeSteps(steps = []) {
    return steps.map((step, index) => ({
        step: index + 1,
        toolCalls: (step.toolCalls || []).map((call) => ({
            toolName: call.toolName,
            input: call.input,
        })),
        text: step.text || '',
    }))
}

function buildContinuationMessage(steps = []) {
    const pendingNodeTypes = getPendingNodeTypes(steps)
    if (pendingNodeTypes.length > 0) {
        return [
            PENDING_EXECUTE_FOLLOW_UP_MESSAGE,
            `Pending execute_node for: ${pendingNodeTypes.join(', ')}.`,
        ].join(' ')
    }
    return PENDING_EXECUTE_FOLLOW_UP_MESSAGE
}

async function runMcpAgent(options = {}) {
    const command = String(options.command || '').trim()
    if (!command) {
        return { response: '', error: 'Command is empty', steps: [] }
    }

    const modelName = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL
    const maxSteps = Math.max(1, Math.min(50, Number(options.maxSteps) || DEFAULT_MAX_STEPS))
    const customSystemPrompt = String(options.systemPrompt || '').trim()
    const silent = options.silent === true
    const sessionKey = resolveSessionKey(options)

    const hints = resolveCommandNodeHints(command)
    const mode = classifyInteractionMode(command, hints)
    const hintPrompt = buildHintPrompt(hints, mode)
    const systemPrompt = customSystemPrompt
        ? `${ASSISTANT_PERSONA}\n\n${customSystemPrompt}\n\n${hintPrompt}`
        : `${DEFAULT_SYSTEM_PROMPT}\n\n${hintPrompt}`

    const provider = getOllamaProvider()
    if (!provider) {
        return { response: '', error: 'Ollama is not configured', steps: [] }
    }

    try {
        const history = await getSessionMessages(sessionKey)

        if (!silent) {
            agentLog(
                `Starting agent (${mode}, session "${sessionKey}", model "${modelName}", max ${maxSteps} steps, ${history.length} prior message(s))`
            )
        }

        let conversation = [
            ...history.map((message) => ({ role: message.role, content: message.content })),
            { role: 'user', content: command },
        ]
        let allSteps = []
        let text = ''

        while (allSteps.length < maxSteps) {
            const remainingSteps = maxSteps - allSteps.length
            const tools = mode === 'chat'
                ? undefined
                : createNetsocketMcpTools({ silent })

            const result = await generateText({
                model: provider(modelName),
                system: systemPrompt,
                messages: conversation,
                ...(tools ? { tools } : {}),
                prepareStep: buildPrepareStep(mode, hints, allSteps),
                stopWhen: stepCountIs(remainingSteps),
            })

            text = result.text || text
            allSteps.push(...result.steps)
            conversation = [
                ...conversation,
                ...result.response.messages,
            ]

            if (!needsExecutionFollowUp(mode, allSteps, hints)) {
                break
            }

            if (allSteps.length >= maxSteps) {
                break
            }

            if (hasPendingExecute(allSteps)) {
                agentLog('get_node_info without execute_node; continuing', logColors.Warning)
            }

            conversation.push({ role: 'user', content: buildContinuationMessage(allSteps) })
        }

        const stepSummary = summarizeSteps(allSteps)
        const toolCallCount = stepSummary.reduce((sum, step) => sum + step.toolCalls.length, 0)
        const toolNames = collectToolNames(allSteps)
        const response = sanitizeAiOutput(stripThinkingTags(text || ''))
        const incomplete = needsExecutionFollowUp(mode, allSteps, hints)
        const finalResponse = response || (incomplete ? 'I started working on that but did not finish.' : '')

        if (!silent) {
            agentLog(
                `Agent finished (${toolCallCount} tool call(s), ${allSteps.length} step(s): ${toolNames.join(', ') || 'none'})`,
                logColors.Success
            )
        }

        if (!finalResponse && toolCallCount === 0) {
            return {
                response: '',
                error: 'Model did not produce a response. Try a tool-capable model such as llama3.2 or qwen3.',
                steps: stepSummary,
            }
        }

        if (finalResponse) {
            await appendSessionTurn(sessionKey, command, finalResponse)
        }

        if (incomplete) {
            return {
                response: finalResponse,
                error: hasPendingExecute(allSteps)
                    ? 'Looked up a node but did not execute it. Try again or use a more capable model.'
                    : 'Did not complete the requested action. Try a clearer command or a more capable model.',
                steps: stepSummary,
            }
        }

        return { response: finalResponse, error: '', steps: stepSummary }
    } catch (e) {
        agentLog(`Agent failed: ${e.message}`, logColors.Error)
        return { response: '', error: e.message, steps: [] }
    }
}

module.exports = {
    ASSISTANT_PERSONA,
    DEFAULT_MODEL,
    DEFAULT_MAX_STEPS,
    DEFAULT_SYSTEM_PROMPT,
    ACTION_VERB_PATTERN,
    PENDING_EXECUTE_FOLLOW_UP_MESSAGE,
    classifyInteractionMode,
    needsExecutionFollowUp,
    hasPendingExecute,
    getPendingNodeTypes,
    collectToolNames,
    collectExecutedNodeTypes,
    countToolCalls,
    buildPrepareStep,
    buildContinuationMessage,
    runMcpAgent,
    summarizeSteps,
}
