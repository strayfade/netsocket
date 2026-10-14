'use strict'

// Client for the Aria external API (aria/docs/external-api.md).
// Aria is an agent gateway: one chat turn runs full tool-calling loops on the
// Aria host, so this client sends non-streaming requests and reads back the
// aggregated result. Also covers the read/write endpoints for saved chats,
// automations, models and MCP-server status.

const { log, logColors } = require('../log')
const { performWebRequest } = require('./httpRequest')
const settingsManager = require('../manager/settingsManager')

// Response-length presets from aria/src/lib/response-presets.ts. Each pairs a
// system-prompt instruction (what shapes the reply style) with a maxTokens
// output cap (what bounds cost). The cap limits final-text tokens only.
const ARIA_PRESETS = ['ping', 'short', 'compact', 'balanced', 'detailed', 'extended']
const ARIA_RESPONSE_FORMATS = ['markdown', 'plaintext']
const DEFAULT_PRESET = 'balanced'
const DEFAULT_RESPONSE_FORMAT = 'markdown'
const MAX_TOKENS_HARD_CAP = 8000

const ARIA_ACTIONS = [
    'Chat',
    'List Models',
    'List Chats',
    'Get Chat',
    'List Automations',
    'Create Automation',
    'Get Automation',
    'Update Automation',
    'Delete Automation',
    'Run Automation',
    'Automation Runs',
    'List MCP Servers',
]

const CHAT_TIMEOUT_MS = 120000
const DEFAULT_TIMEOUT_MS = 30000

const SETTING_ENDPOINT = 'aria.endpoint'
const SETTING_API_KEY = 'aria.apiKey'
const SETTING_PROVIDER_ID = 'aria.providerId'
const SETTING_MODEL = 'aria.model'
const SETTING_PRESET = 'aria.preset'

// Accept the host root with or without a trailing /api/v1, mirroring the
// Even G2 companion (extensions/even-g2/src/net/aria.ts): users paste the
// docs' base URL verbatim.
const normalizeAriaEndpoint = (raw) => {
    const s = String(raw || '').trim().replace(/\/+$/, '')
    if (!s) return ''
    return s.replace(/\/api\/v1$/i, '')
}

const isValidPreset = (preset) => ARIA_PRESETS.includes(String(preset || '').trim())
const isValidResponseFormat = (format) => ARIA_RESPONSE_FORMATS.includes(String(format || '').trim())

const getAriaSettings = (store) => {
    const s = store || settingsManager
    const storedPreset = String(s.getSetting(SETTING_PRESET) || '').trim()
    return {
        endpoint: normalizeAriaEndpoint(s.getSetting(SETTING_ENDPOINT)),
        apiKey: String(s.getSetting(SETTING_API_KEY) || ''),
        providerId: String(s.getSetting(SETTING_PROVIDER_ID) || '').trim(),
        model: String(s.getSetting(SETTING_MODEL) || '').trim(),
        preset: isValidPreset(storedPreset) ? storedPreset : DEFAULT_PRESET,
    }
}

// Connection resolved for one node execution: explicit per-call values win,
// stored settings fill the gaps. Never throws; reports { ok, error } so the
// node can route to its Error output instead of crashing the execution loop.
const resolveAriaConnection = (override) => {
    const stored = getAriaSettings()
    const endpoint = normalizeAriaEndpoint((override && override.endpoint) || stored.endpoint)
    const apiKey = String((override && override.apiKey) || stored.apiKey || '')
    if (!endpoint) return { ok: false, error: 'Aria endpoint is not configured (AI Providers settings)' }
    if (!apiKey) return { ok: false, error: 'Aria API key is not configured (AI Providers settings)' }
    return { ok: true, endpoint, apiKey }
}

const parseAriaBody = (body) => {
    if (body == null || body === '') return null
    if (typeof body === 'object') return body
    try {
        return JSON.parse(String(body))
    } catch {
        return { raw: String(body) }
    }
}

const describeAriaError = (status, parsed) => {
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string' && parsed.error.trim()) {
        return `Aria ${status}: ${parsed.error.trim().slice(0, 280)}`
    }
    if (status === 401) return 'Aria 401: invalid or revoked API key'
    if (status === 429) return 'Aria 429: rate limit exceeded (60 req/min per key)'
    return `Aria ${status}`
}

// Low-level call. requestFn defaults to performWebRequest (axios); tests inject
// a fake with the same (method, url, options) signature.
const ariaRequest = async (conn, method, path, body, options = {}) => {
    const requestFn = options.requestFn || performWebRequest
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS
    const url = `${conn.endpoint}/api/v1${path}`
    let res
    try {
        res = await requestFn(method, url, {
            headers: {
                Authorization: `Bearer ${conn.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            timeoutMs,
        })
    } catch (e) {
        throw new Error(`Aria request failed: ${e && e.message ? e.message : String(e)}`.slice(0, 280))
    }
    const parsed = parseAriaBody(res.body)
    if (!res.ok) {
        throw new Error(describeAriaError(res.status, parsed))
    }
    return parsed
}

const normalizeChatBody = (inputs) => {
    const providerId = String(inputs.providerId || '').trim()
    const model = String(inputs.model || '').trim()
    if (!providerId) throw new Error('Aria Provider is required (or set a default in AI Providers settings)')
    if (!model) throw new Error('Aria Model is required (or set a default in AI Providers settings)')
    const preset = String(inputs.preset || DEFAULT_PRESET).trim()
    if (!isValidPreset(preset)) throw new Error(`Unknown preset "${preset}". Valid presets: ${ARIA_PRESETS.join(', ')}.`)
    const responseFormat = String(inputs.responseFormat || DEFAULT_RESPONSE_FORMAT).trim()
    if (!isValidResponseFormat(responseFormat)) throw new Error(`Unknown response_format "${responseFormat}". Use markdown or plaintext.`)
    const body = {
        providerId,
        model,
        preset,
        response_format: responseFormat,
        include_tool_calls: inputs.includeToolCalls !== false,
        include_tool_results: inputs.includeToolResults !== false,
        stream: false,
    }
    const history = parseMessagesHistory(inputs.messages)
    if (history) {
        body.messages = history
    } else {
        const message = String(inputs.message || '')
        if (!message.trim()) throw new Error('Message is required for the Chat action (or provide Messages history)')
        if (message.length > 50000) throw new Error('Message exceeds the 50,000 character limit')
        body.message = message
    }
    const maxTokens = Number(inputs.maxTokens)
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
        if (!Number.isInteger(maxTokens) || maxTokens > MAX_TOKENS_HARD_CAP) {
            throw new Error(`Max Tokens must be a positive integer up to ${MAX_TOKENS_HARD_CAP}`)
        }
        body.maxTokens = maxTokens
    }
    const maxIterations = Number(inputs.maxIterations)
    if (Number.isFinite(maxIterations) && maxIterations > 0) {
        body.maxIterations = Math.trunc(maxIterations)
    }
    const toolTimeoutMs = Number(inputs.toolTimeoutMs)
    if (Number.isFinite(toolTimeoutMs) && toolTimeoutMs > 0) {
        body.toolTimeoutMs = Math.trunc(toolTimeoutMs)
    }
    return body
}

const parseMessagesHistory = (raw) => {
    const s = String(raw || '').trim()
    if (!s) return null
    let parsed
    try {
        parsed = JSON.parse(s)
    } catch {
        throw new Error('Messages must be a JSON array of { role, content } entries')
    }
    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Messages must be a non-empty JSON array')
    const roles = ['user', 'assistant', 'system']
    const cleaned = parsed.map((m) => {
        if (!m || typeof m !== 'object' || !roles.includes(m.role) || typeof m.content !== 'string') {
            throw new Error('Messages entries must look like { "role": "user|assistant|system", "content": "..." }')
        }
        return { role: m.role, content: m.content }
    })
    if (cleaned.length > 200) throw new Error('Messages history is limited to 200 entries')
    return cleaned
}

// Runs one named API action. Returns the parsed JSON payload; throws on
// validation or transport errors. inputs carries the node-resolved values;
// conn is a resolved { endpoint, apiKey } pair.
const runAriaAction = async (action, inputs = {}, conn, options = {}) => {
    const name = String(action || 'Chat').trim() || 'Chat'
    if (!ARIA_ACTIONS.includes(name)) throw new Error(`Unknown Action "${name}". Use one of: ${ARIA_ACTIONS.join(', ')}.`)
    switch (name) {
        case 'Chat': {
            return ariaRequest(conn, 'POST', '/chat', normalizeChatBody(inputs), { ...options, timeoutMs: CHAT_TIMEOUT_MS })
        }
        case 'List Models': {
            return ariaRequest(conn, 'GET', '/models', undefined, options)
        }
        case 'List Chats': {
            return ariaRequest(conn, 'GET', '/chats', undefined, options)
        }
        case 'Get Chat': {
            const id = String(inputs.chatId || '').trim()
            if (!id) throw new Error('Chat ID is required for the Get Chat action')
            return ariaRequest(conn, 'GET', `/chats/${encodeURIComponent(id)}`, undefined, options)
        }
        case 'List Automations': {
            return ariaRequest(conn, 'GET', '/automations', undefined, options)
        }
        case 'Create Automation': {
            return ariaRequest(conn, 'POST', '/automations', normalizeAutomationBody(inputs, false), options)
        }
        case 'Get Automation': {
            const id = requireAutomationId(inputs)
            return ariaRequest(conn, 'GET', `/automations/${encodeURIComponent(id)}`, undefined, options)
        }
        case 'Update Automation': {
            const id = requireAutomationId(inputs)
            return ariaRequest(conn, 'PATCH', `/automations/${encodeURIComponent(id)}`, normalizeAutomationBody(inputs, true), options)
        }
        case 'Delete Automation': {
            const id = requireAutomationId(inputs)
            return ariaRequest(conn, 'DELETE', `/automations/${encodeURIComponent(id)}`, undefined, options)
        }
        case 'Run Automation': {
            const id = requireAutomationId(inputs)
            return ariaRequest(conn, 'POST', `/automations/${encodeURIComponent(id)}/run`, {}, options)
        }
        case 'Automation Runs': {
            const id = requireAutomationId(inputs)
            return ariaRequest(conn, 'GET', `/automations/${encodeURIComponent(id)}/runs`, undefined, options)
        }
        case 'List MCP Servers': {
            return ariaRequest(conn, 'GET', '/mcp-servers', undefined, options)
        }
        default:
            throw new Error(`Unknown Action "${name}"`)
    }
}

const requireAutomationId = (inputs) => {
    const id = String(inputs.automationId || '').trim()
    if (!id) throw new Error('Automation ID is required for this action')
    return id
}

// partial=true (PATCH) sends only the fields the caller filled in;
// otherwise (POST) every required field must be present.
const normalizeAutomationBody = (inputs, partial) => {
    const body = {}
    const name = String(inputs.name || '').trim()
    const prompt = String(inputs.message || '').trim()
    const providerId = String(inputs.providerId || '').trim()
    const model = String(inputs.model || '').trim()
    const scheduleType = String(inputs.scheduleType || 'interval').trim()
    if (!['interval', 'cron'].includes(scheduleType)) {
        throw new Error('Schedule Type must be interval or cron')
    }
    const intervalMinutes = Number(inputs.intervalMinutes)
    const cronExpression = String(inputs.cronExpression || '').trim()
    const enabled = inputs.enabled !== undefined ? inputs.enabled : true
    const retentionRuns = Number(inputs.retentionRuns)

    if (!partial) {
        if (!name) throw new Error('Name is required to create an automation')
        if (!prompt) throw new Error('Message (automation prompt) is required to create an automation')
        if (!providerId) throw new Error('Aria Provider is required to create an automation')
        if (!model) throw new Error('Aria Model is required to create an automation')
        body.name = name
        body.prompt = prompt
        body.providerId = providerId
        body.model = model
        body.scheduleType = scheduleType
    } else {
        if (name) body.name = name
        if (prompt) body.prompt = prompt
        if (providerId) body.providerId = providerId
        if (model) body.model = model
        if (inputs.scheduleType) body.scheduleType = scheduleType
        if (!Object.keys(body).length && inputs.enabled === undefined
            && !Number.isFinite(intervalMinutes) && !cronExpression && !Number.isFinite(retentionRuns)) {
            throw new Error('Update Automation needs at least one field to change')
        }
    }
    if (body.scheduleType === 'interval' || (!partial && scheduleType === 'interval')) {
        if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) body.intervalMinutes = intervalMinutes
        else if (!partial) throw new Error('Interval Minutes is required for interval schedules')
    }
    if (body.scheduleType === 'cron' || (!partial && scheduleType === 'cron')) {
        if (cronExpression) body.cronExpression = cronExpression
        else if (!partial) throw new Error('Cron Expression is required for cron schedules (5 fields: minute hour day month weekday)')
    }
    if (inputs.enabled !== undefined) body.enabled = enabled !== false
    if (Number.isFinite(retentionRuns) && retentionRuns > 0) body.retentionRuns = Math.trunc(retentionRuns)
    return body
}

// MARK: settings API (AI Providers tab: Aria connection card)

const getPublicAriaSettings = (store) => {
    const s = store || settingsManager
    const stored = getAriaSettings(s)
    return {
        configured: !!(stored.endpoint && s.getSetting(SETTING_API_KEY)),
        endpoint: stored.endpoint,
        providerId: stored.providerId,
        model: stored.model,
        preset: stored.preset,
        hasApiKey: !!s.getSetting(SETTING_API_KEY),
    }
}

const handleGetAriaSettings = (req, res, deps = {}) => {
    const canAccess = deps.canAccess || require('./sessionAuth').canAccessPrivateApi
    if (!canAccess(req, res)) return res.sendStatus(401)
    return res.status(200).json(getPublicAriaSettings(deps.settings))
}

const handleSaveAriaSettings = async (req, res, deps = {}) => {
    const canAccess = deps.canAccess || require('./sessionAuth').canAccessPrivateApi
    if (!canAccess(req, res)) return res.sendStatus(401)
    const store = deps.settings || settingsManager
    const body = (req && req.body) || {}
    if (body.endpoint !== undefined) {
        store.setSetting(SETTING_ENDPOINT, String(body.endpoint || '').trim().slice(0, 500))
    }
    // undefined = leave unchanged; null = clear; non-empty string = set.
    // The UI only sends the key when the field is filled, so a stored key is
    // never wiped by saving the rest of the form.
    if (body.apiKey !== undefined && body.apiKey !== null) {
        const key = String(body.apiKey)
        if (key.trim()) store.setSetting(SETTING_API_KEY, key.trim().slice(0, 500))
    } else if (body.apiKey === null) {
        store.setSetting(SETTING_API_KEY, '')
    }
    if (body.providerId !== undefined) {
        store.setSetting(SETTING_PROVIDER_ID, String(body.providerId || '').trim().slice(0, 200))
    }
    if (body.model !== undefined) {
        store.setSetting(SETTING_MODEL, String(body.model || '').trim().slice(0, 200))
    }
    if (body.preset !== undefined) {
        const preset = String(body.preset || '').trim()
        if (preset && !isValidPreset(preset)) {
            return res.status(400).json({ error: `unknown_preset: ${ARIA_PRESETS.join(',')}` })
        }
        store.setSetting(SETTING_PRESET, preset || DEFAULT_PRESET)
    }
    try {
        if (store.saveSettings) await store.saveSettings()
        else await settingsManager.saveSettings()
    } catch (e) {
        log(`Aria settings save failed: ${e && e.message ? e.message : e}`, logColors.Error)
        return res.status(500).json({ error: 'save_failed' })
    }
    return res.status(200).json({ ok: true, settings: getPublicAriaSettings(store) })
}

// Proves the stored endpoint + key work by listing Aria providers through them.
const handleTestAriaSettings = async (req, res, deps = {}) => {
    const canAccess = deps.canAccess || require('./sessionAuth').canAccessPrivateApi
    if (!canAccess(req, res)) return res.sendStatus(401)
    const conn = resolveAriaConnection()
    if (!conn.ok) return res.status(400).json({ ok: false, error: conn.error })
    try {
        const requestFn = deps.requestFn || performWebRequest
        const payload = await ariaRequest(conn, 'GET', '/models', undefined, { requestFn, timeoutMs: DEFAULT_TIMEOUT_MS })
        const count = payload && Array.isArray(payload.providers) ? payload.providers.length : 0
        return res.status(200).json({ ok: true, providers: count })
    } catch (e) {
        return res.status(200).json({ ok: false, error: e && e.message ? e.message : String(e) })
    }
}

module.exports = {
    ARIA_PRESETS,
    ARIA_RESPONSE_FORMATS,
    ARIA_ACTIONS,
    DEFAULT_PRESET,
    DEFAULT_RESPONSE_FORMAT,
    MAX_TOKENS_HARD_CAP,
    SETTING_ENDPOINT,
    SETTING_API_KEY,
    SETTING_PROVIDER_ID,
    SETTING_MODEL,
    SETTING_PRESET,
    normalizeAriaEndpoint,
    isValidPreset,
    isValidResponseFormat,
    getAriaSettings,
    getPublicAriaSettings,
    resolveAriaConnection,
    ariaRequest,
    normalizeChatBody,
    normalizeAutomationBody,
    runAriaAction,
    handleGetAriaSettings,
    handleSaveAriaSettings,
    handleTestAriaSettings,
}
