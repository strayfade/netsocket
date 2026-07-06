'use strict'

const { generateText, stepCountIs } = require('ai')
const { log, logColors } = require('../log')
const { getOllamaProvider, sanitizeAiOutput } = require('./languageModel')
const { resolveMcpAgentModel, MCP_AGENT_DEFAULT_MODEL } = require('./mcpAgentSettings')
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
    'Call execute_node now only if that node is still required for what the user asked.',
    'If you already executed a node that fulfilled the request, summarize the results instead of executing unrelated nodes.',
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
    'mcpPreferred is task-specific: a node preferred for setting state is not the right choice for list or read requests.',
    'For list, show, or fetch requests: execute the read node once, then present the data. Do not look up or run control nodes unless the user asked to change something.',
    'Never guess or invent device names, IDs, states, or readings — always use execute_node to fetch real data from Netsocket.',
    'Only claim you performed an action after execute_node succeeds. Summarize results briefly unless the user asks for more.',
    'For pure conversation with no action requested, reply directly without using tools.',
].join(' ')

const NO_TOOLS_EXECUTED_MESSAGE = [
    'You must use MCP tools to fetch real data — do not guess or answer from memory.',
    'Call list_nodes, then execute_node on the appropriate read/list node.',
    'Do not reply with invented names or values.',
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

function getToolCallOutput(step, call) {
    const resultsById = new Map(
        (step.toolResults || []).map((result) => [result.toolCallId, result])
    )
    const matched = resultsById.get(call.toolCallId)
    return matched?.output ?? matched?.result ?? null
}

function collectSuccessfulExecutes(steps = []) {
    const successful = []
    for (const step of steps) {
        for (const call of step.toolCalls || []) {
            if (call.toolName !== 'execute_node') continue
            const output = getToolCallOutput(step, call)
            if (output?.success) {
                successful.push({
                    nodeType: call.input?.nodeType,
                    output,
                })
            }
        }
    }
    return successful
}

function getLastSuccessfulExecute(steps = []) {
    const successful = collectSuccessfulExecutes(steps)
    return successful.length > 0 ? successful[successful.length - 1] : null
}

function parseJsonArray(value) {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

function extractLightsFromExecuteOutput(output) {
    if (!output || typeof output !== 'object') return null
    const fromOutputs = output.outputs?.Lights
    if (fromOutputs != null) return parseJsonArray(fromOutputs)
    const slot = (output.outputSlots || []).find((entry) => entry.name === 'Lights')
    if (slot?.value != null) return parseJsonArray(slot.value)
    return null
}

function extractRequestedFields(command) {
    const text = String(command || '').toLowerCase()
    const wantsIds = /\bids?\b/.test(text)
    const wantsNames = /\bnames?\b/.test(text)
    const fieldOnly = (wantsIds || wantsNames) && !/\b(?:and|with)\b/.test(text)
    const valuesOnly = /\b(?:just|only)\b/.test(text) || fieldOnly
    return { wantsIds, wantsNames, valuesOnly }
}

function formatReadonlyLightsResponse(command, lights) {
    if (!Array.isArray(lights) || lights.length === 0) return ''

    const { wantsIds, wantsNames, valuesOnly } = extractRequestedFields(command)

    if (wantsIds && !wantsNames) {
        const ids = lights.map((light) => light.id).filter((id) => id != null)
        return valuesOnly ? ids.join(', ') : `Light IDs: ${ids.join(', ')}`
    }

    if (wantsNames && !wantsIds) {
        const names = lights.map((light) => light.name).filter(Boolean)
        return valuesOnly ? names.join(', ') : `Light names: ${names.join(', ')}`
    }

    if (wantsIds && wantsNames) {
        const pairs = lights.map((light) => `${light.id}: ${light.name}`)
        return valuesOnly ? pairs.join(', ') : pairs.join('; ')
    }

    return lights.map((light) => `${light.name} (${light.id})`).join(', ')
}

function synthesizeReadonlyResponse(command, steps = []) {
    const last = getLastSuccessfulExecute(steps)
    if (!last) return ''

    const lights = extractLightsFromExecuteOutput(last.output)
    if (lights) {
        return formatReadonlyLightsResponse(command, lights)
    }

    const outputs = last.output?.outputs
    if (outputs && typeof outputs === 'object') {
        const firstKey = Object.keys(outputs)[0]
        const value = firstKey ? outputs[firstKey] : null
        if (value != null && typeof value !== 'object') {
            return String(value)
        }
    }

    return ''
}

function hasRedundantExecute(steps = []) {
    const counts = new Map()
    for (const step of steps) {
        for (const call of step.toolCalls || []) {
            if (call.toolName !== 'execute_node' || !call.input?.nodeType) continue
            const nodeType = call.input.nodeType
            counts.set(nodeType, (counts.get(nodeType) || 0) + 1)
            if (counts.get(nodeType) >= 2) return true
        }
    }
    return false
}

function buildStopWhen(hints, remainingSteps) {
    const conditions = [stepCountIs(remainingSteps)]

    if (hints.intent === 'readonly') {
        conditions.push(({ steps }) => collectSuccessfulExecutes(steps).length > 0)
    }

    return conditions
}

function requiresToolExecution(mode, hints = {}) {
    if (mode === 'chat') {
        return false
    }
    if (hints.intent === 'readonly' || hints.intent === 'otp' || hints.intent === 'quick_web_search') {
        return true
    }
    return mode === 'tools'
}

function hasFulfilledToolExecution(steps, hints = {}) {
    const successful = collectSuccessfulExecutes(steps)
    if (successful.length === 0) {
        return false
    }
    if (hints.intent === 'otp') {
        return successful.some((entry) => entry.nodeType === OTP_NODE)
    }
    if (hints.intent === 'quick_web_search') {
        return successful.some((entry) => entry.nodeType === QUICK_WEB_SEARCH_NODE)
    }
    return true
}

function pickReadonlyTargetNode(hints) {
    const matches = hints.matches || []
    if (matches.length === 0) {
        return null
    }
    const preferred = matches.filter((match) => match.mcpPreferred != null && match.mcpPreferred !== false)
    return preferred[0] || matches[0]
}

function canDirectExecute(nodeType) {
    const { getNodeInfo } = require('../mcp/handlers')
    const info = getNodeInfo(nodeType)
    if (!info) {
        return false
    }
    const guideRequired = info.callingGuide?.executeNode?.inputs?.required || []
    if (guideRequired.length > 0) {
        return false
    }
    const dataInputs = (info.inputs || []).filter((input) => !input.isEvent && !input.mcpOmit)
    return dataInputs.length === 0
}

function createSyntheticExecuteStep(nodeType, output) {
    return {
        text: '',
        toolCalls: [{
            toolCallId: 'direct-execute',
            toolName: 'execute_node',
            input: { nodeType, inputs: {} },
        }],
        toolResults: [{
            toolCallId: 'direct-execute',
            output,
        }],
    }
}

async function tryDirectReadonlyExecute(hints, silent) {
    if (hints.intent !== 'readonly') {
        return null
    }
    const target = pickReadonlyTargetNode(hints)
    if (!target?.nodeType || !canDirectExecute(target.nodeType)) {
        return null
    }

    const { executeMcpNode } = require('../mcp/handlers')
    if (!silent) {
        agentLog(`Direct readonly execute: ${target.nodeType}`, logColors.Info)
    }
    const output = await executeMcpNode(target.nodeType, { inputs: {}, properties: {} })
    if (!output?.success) {
        return null
    }
    return createSyntheticExecuteStep(target.nodeType, output)
}

function needsExecutionFollowUp(mode, steps, hints = {}) {
    if (!requiresToolExecution(mode, hints)) {
        return false
    }
    if (hasFulfilledToolExecution(steps, hints)) {
        return false
    }
    if (hasPendingExecute(steps)) {
        return true
    }
    return true
}

function buildPrepareStep(mode, hints, allSteps) {
    return ({ steps }) => {
        const combinedSteps = [...allSteps, ...(steps || [])]
        const executedNodes = collectExecutedNodeTypes(combinedSteps)
        const successfulExecutes = collectSuccessfulExecutes(combinedSteps)
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

        if (hints.intent === 'readonly' && successfulExecutes.length > 0) {
            return { toolChoice: 'none' }
        }

        if (hasRedundantExecute(combinedSteps)) {
            return { toolChoice: 'none' }
        }

        if (getInfoCount > executeCount) {
            if (hints.intent === 'readonly' && executeCount > 0) {
                return { toolChoice: 'none' }
            }
            return { activeTools: ['execute_node'], toolChoice: 'required' }
        }

        if (mode === 'tools' && executeCount === 0) {
            return { activeTools: ['list_nodes', 'get_node_info', 'execute_node'], toolChoice: 'required' }
        }

        return { activeTools: ['list_nodes', 'get_node_info', 'execute_node'] }
    }
}

function extractThinking(text) {
    if (typeof text !== 'string' || !text) {
        return ''
    }
    const tagged = text.match(/<think>([\s\S]*?)<\/redacted_thinking>/i)
    if (tagged) {
        return tagged[1].trim()
    }
    const thinkOpen = '<' + 'think>'
    const thinkClose = '<' + '/think>'
    const openIdx = text.indexOf(thinkOpen)
    const closeIdx = text.indexOf(thinkClose)
    if (openIdx !== -1 && closeIdx > openIdx) {
        return text.slice(openIdx + thinkOpen.length, closeIdx).trim()
    }
    return ''
}

function summarizeSteps(steps = []) {
    return steps.map((step, index) => {
        const rawText = step.text || ''
        const toolResultsById = new Map(
            (step.toolResults || []).map((result) => [result.toolCallId, result])
        )

        return {
            step: index + 1,
            thinking: extractThinking(rawText),
            text: stripThinkingTags(rawText),
            toolCalls: (step.toolCalls || []).map((call) => {
                const matched = toolResultsById.get(call.toolCallId)
                return {
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    input: call.input,
                    output: matched?.output ?? matched?.result ?? null,
                }
            }),
        }
    })
}

function buildContinuationMessage(steps = [], hints = {}) {
    const pendingNodeTypes = getPendingNodeTypes(steps)

    if (hasFulfilledToolExecution(steps, hints)) {
        return [
            'You already fetched the requested data.',
            'Summarize the execute_node results for the user now.',
            'Do not execute unrelated control nodes.',
        ].join(' ')
    }

    if (countToolCalls(steps, 'execute_node') === 0 && countToolCalls(steps, 'list_nodes') === 0) {
        const target = pickReadonlyTargetNode(hints)
        const parts = [NO_TOOLS_EXECUTED_MESSAGE]
        if (target?.nodeType) {
            parts.push(`Run execute_node on "${target.nodeType}" to fetch real data.`)
        }
        return parts.join(' ')
    }

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

    const modelName = resolveMcpAgentModel(options.model)
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

        const directStep = await tryDirectReadonlyExecute(hints, silent)
        if (directStep) {
            allSteps = [directStep]
            const directResponse = synthesizeReadonlyResponse(command, allSteps)
            if (directResponse) {
                if (!silent) {
                    agentLog('Readonly request fulfilled via direct execute', logColors.Success)
                }
                await appendSessionTurn(sessionKey, command, directResponse)
                return {
                    response: directResponse,
                    error: '',
                    steps: summarizeSteps(allSteps),
                    mode,
                    command,
                }
            }
        }

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
                stopWhen: buildStopWhen(hints, remainingSteps),
            })

            text = result.text || text
            allSteps.push(...result.steps)
            conversation = [
                ...conversation,
                ...result.response.messages,
            ]

            const successfulExecutes = collectSuccessfulExecutes(allSteps)
            const responseSoFar = sanitizeAiOutput(stripThinkingTags(text || ''))

            if (
                hints.intent === 'readonly'
                && successfulExecutes.length > 0
                && !responseSoFar
                && allSteps.length < maxSteps
            ) {
                const synthesisResult = await generateText({
                    model: provider(modelName),
                    system: systemPrompt,
                    messages: [
                        ...conversation,
                        {
                            role: 'user',
                            content: [
                                'You already ran execute_node and have the results in the conversation above.',
                                'Reply to the user now. Do not use tools.',
                                'If outputs contain JSON strings, parse them first.',
                                'Match the level of detail the user asked for (e.g. IDs only vs full list).',
                            ].join(' '),
                        },
                    ],
                })
                text = synthesisResult.text || text
                allSteps.push(...synthesisResult.steps)
                conversation = [
                    ...conversation,
                    ...synthesisResult.response.messages,
                ]
            }

            if (!needsExecutionFollowUp(mode, allSteps, hints)) {
                break
            }

            if (allSteps.length >= maxSteps) {
                break
            }

            if (hasPendingExecute(allSteps)) {
                agentLog('get_node_info without execute_node; continuing', logColors.Warning)
            }

            conversation.push({ role: 'user', content: buildContinuationMessage(allSteps, hints) })
        }

        if (requiresToolExecution(mode, hints) && !hasFulfilledToolExecution(allSteps, hints)) {
            const fallbackStep = await tryDirectReadonlyExecute(hints, silent)
            if (fallbackStep) {
                allSteps.push(fallbackStep)
            }
        }

        const stepSummary = summarizeSteps(allSteps)
        const toolCallCount = stepSummary.reduce((sum, step) => sum + step.toolCalls.length, 0)
        const toolNames = collectToolNames(allSteps)
        let response = sanitizeAiOutput(stripThinkingTags(text || ''))

        if (requiresToolExecution(mode, hints) && !hasFulfilledToolExecution(allSteps, hints)) {
            response = ''
        } else if (hints.intent === 'readonly' && hasFulfilledToolExecution(allSteps, hints)) {
            const synthesized = synthesizeReadonlyResponse(command, allSteps)
            if (synthesized) {
                response = synthesized
            }
        } else if (!response && hints.intent === 'readonly') {
            response = synthesizeReadonlyResponse(command, allSteps)
        }

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
                error: requiresToolExecution(mode, hints)
                    ? 'Model answered without running Netsocket nodes. Try a tool-capable model such as llama3.2 or qwen3.'
                    : 'Model did not produce a response. Try a tool-capable model such as llama3.2 or qwen3.',
                steps: stepSummary,
                mode,
                command,
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
                mode,
                command,
            }
        }

        return {
            response: finalResponse,
            error: '',
            steps: stepSummary,
            mode,
            command,
        }
    } catch (e) {
        agentLog(`Agent failed: ${e.message}`, logColors.Error)
        return { response: '', error: e.message, steps: [], command }
    }
}

module.exports = {
    ASSISTANT_PERSONA,
    MCP_AGENT_DEFAULT_MODEL,
    resolveMcpAgentModel,
    DEFAULT_MAX_STEPS,
    DEFAULT_SYSTEM_PROMPT,
    ACTION_VERB_PATTERN,
    PENDING_EXECUTE_FOLLOW_UP_MESSAGE,
    NO_TOOLS_EXECUTED_MESSAGE,
    classifyInteractionMode,
    requiresToolExecution,
    hasFulfilledToolExecution,
    needsExecutionFollowUp,
    pickReadonlyTargetNode,
    canDirectExecute,
    tryDirectReadonlyExecute,
    hasPendingExecute,
    getPendingNodeTypes,
    collectToolNames,
    collectExecutedNodeTypes,
    countToolCalls,
    collectSuccessfulExecutes,
    getLastSuccessfulExecute,
    synthesizeReadonlyResponse,
    formatReadonlyLightsResponse,
    extractRequestedFields,
    hasRedundantExecute,
    buildStopWhen,
    buildPrepareStep,
    buildContinuationMessage,
    extractThinking,
    runMcpAgent,
    summarizeSteps,
}
