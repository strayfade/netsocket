'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const aria = require('../server/utils/aria')
const settingsManager = require('../server/manager/settingsManager')

global.LiteGraph = global.LiteGraph || { EVENT: 'event' }
const { NodeDefinition, NodeFunction } = require('../server/nodes/languageProcessing/aria')

const CONN = { endpoint: 'http://aria.local:3000', apiKey: 'aria_testkey' }

const okJson = (payload) => ({ ok: true, status: 200, body: JSON.stringify(payload), headers: {} })

const makeFakeTransport = (response) => {
    const calls = []
    const fn = async (method, url, options) => {
        calls.push({ method, url, auth: options.headers && options.headers.Authorization, body: options.body ? JSON.parse(options.body) : undefined })
        if (response instanceof Error) throw response
        return response
    }
    return { calls, fn }
}

const makeStore = (initial = {}) => {
    const data = { ...initial }
    return {
        data,
        getSetting: (k) => (k in data ? data[k] : ''),
        setSetting: (k, v) => { data[k] = String(v) },
        saveSettings: async () => {},
    }
}

const mockRes = () => {
    const res = { statusCode: 200, payload: undefined }
    res.status = (code) => { res.statusCode = code; return res }
    res.json = (obj) => { res.payload = obj; return res }
    res.sendStatus = (code) => { res.statusCode = code; return res }
    return res
}

const startStubAria = (handler) => new Promise((resolve) => {
    const seen = []
    const server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', () => {
            let body
            try { body = raw ? JSON.parse(raw) : undefined } catch { body = undefined }
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body })
            const out = handler(req, body)
            res.writeHead(out.status || 200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(out.payload !== undefined ? out.payload : {}))
        })
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port }))
})

const runNode = async (params) => {
    let populated = null
    let triggered = 0
    const behaviors = {
        populateNextNodeLinks: async (values) => { populated = values },
        getOutputNodeGroups: () => [[]],
        triggerNodeGroup: async () => { triggered++ },
    }
    const ok = await NodeFunction({}, params, behaviors)
    return { ok, populated, triggered }
}

const clearAriaSettings = () => {
    for (const key of [aria.SETTING_ENDPOINT, aria.SETTING_API_KEY, aria.SETTING_PRESET]) {
        settingsManager.setSetting(key, '')
    }
}

describe('normalizeAriaEndpoint', () => {
    it('strips trailing slashes and a trailing /api/v1', () => {
        assert.equal(aria.normalizeAriaEndpoint('http://192.168.1.101:3000/'), 'http://192.168.1.101:3000')
        assert.equal(aria.normalizeAriaEndpoint('http://192.168.1.101:3000/api/v1'), 'http://192.168.1.101:3000')
        assert.equal(aria.normalizeAriaEndpoint('https://aria.example.com/API/V1/'), 'https://aria.example.com')
        assert.equal(aria.normalizeAriaEndpoint(''), '')
    })
})

describe('presets and formats', () => {
    it('accepts the six documented presets and both formats', () => {
        for (const preset of ['ping', 'short', 'compact', 'balanced', 'detailed', 'extended']) {
            assert.equal(aria.isValidPreset(preset), true)
        }
        assert.equal(aria.isValidPreset('verbose'), false)
        assert.equal(aria.isValidResponseFormat('markdown'), true)
        assert.equal(aria.isValidResponseFormat('plaintext'), true)
        assert.equal(aria.isValidResponseFormat('html'), false)
    })
})

describe('normalizeChatBody', () => {
    it('builds a non-streaming body with verbosity settings', () => {
        const body = aria.normalizeChatBody({
            message: 'hi',
            preset: 'short', responseFormat: 'plaintext',
            includeToolCalls: false, includeToolResults: true, maxTokens: 150,
        })
        assert.equal(body.message, 'hi')
        assert.equal(body.providerId, undefined)
        assert.equal(body.model, undefined)
        assert.equal(body.preset, 'short')
        assert.equal(body.response_format, 'plaintext')
        assert.equal(body.include_tool_calls, false)
        assert.equal(body.include_tool_results, true)
        assert.equal(body.stream, false)
        assert.equal(body.maxTokens, 150)
    })

    it('prefers Messages history over Message and validates entries', () => {
        const body = aria.normalizeChatBody({
            message: 'ignored', messages: JSON.stringify([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]),
        })
        assert.ok(!('message' in body))
        assert.deepEqual(body.messages, [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])
        assert.throws(() => aria.normalizeChatBody({ messages: 'not json' }), /Messages must be a JSON array/)
        assert.throws(() => aria.normalizeChatBody({ messages: '[{"role":"wizard","content":"x"}]' }), /role/)
    })

    it('rejects missing prompts, bad presets and out-of-range token caps', () => {
        assert.throws(() => aria.normalizeChatBody({ message: '  ' }), /Message is required/)
        assert.throws(() => aria.normalizeChatBody({ message: 'hi', preset: 'verbose' }), /Unknown preset/)
        assert.throws(() => aria.normalizeChatBody({ message: 'hi', maxTokens: 9000 }), /Max Tokens/)
        const withoutCap = aria.normalizeChatBody({ message: 'hi', maxTokens: 0 })
        assert.ok(!('maxTokens' in withoutCap))
    })
})

describe('normalizeAutomationBody', () => {
    it('builds a create body for interval schedules', () => {
        const body = aria.normalizeAutomationBody({
            name: 'Morning', message: 'Summarize',
            scheduleType: 'interval', intervalMinutes: 60, enabled: true, retentionRuns: 50,
        }, false)
        assert.deepEqual(body, {
            name: 'Morning', prompt: 'Summarize',
            scheduleType: 'interval', intervalMinutes: 60, enabled: true, retentionRuns: 50,
        })
    })

    it('requires fields on create and sends only filled fields on update', () => {
        assert.throws(() => aria.normalizeAutomationBody({ message: 'x', intervalMinutes: 5 }, false), /Name is required/)
        assert.throws(() => aria.normalizeAutomationBody({ name: 'n', message: 'x', scheduleType: 'cron' }, false), /Cron Expression/)
        assert.throws(() => aria.normalizeAutomationBody({}, true), /at least one field/)
        const patch = aria.normalizeAutomationBody({ name: 'Evening', enabled: false }, true)
        assert.deepEqual(patch, { name: 'Evening', enabled: false })
    })
})

describe('runAriaAction routing', () => {
    it('issues the right method and path per action', async () => {
        const cases = [
            ['Chat', 'POST', '/api/v1/chat', { message: 'hi' }],
            ['List Models', 'GET', '/api/v1/models', {}],
            ['List Chats', 'GET', '/api/v1/chats', {}],
            ['Get Chat', 'GET', '/api/v1/chats/c1', { chatId: 'c1' }],
            ['List Automations', 'GET', '/api/v1/automations', {}],
            ['Create Automation', 'POST', '/api/v1/automations', { name: 'n', message: 'p', scheduleType: 'interval', intervalMinutes: 5 }],
            ['Get Automation', 'GET', '/api/v1/automations/a1', { automationId: 'a1' }],
            ['Update Automation', 'PATCH', '/api/v1/automations/a1', { automationId: 'a1', name: 'new' }],
            ['Delete Automation', 'DELETE', '/api/v1/automations/a1', { automationId: 'a1' }],
            ['Run Automation', 'POST', '/api/v1/automations/a1/run', { automationId: 'a1' }],
            ['Automation Runs', 'GET', '/api/v1/automations/a1/runs', { automationId: 'a1' }],
            ['List MCP Servers', 'GET', '/api/v1/mcp-servers', {}],
        ]
        for (const [action, method, path, inputs] of cases) {
            const t = makeFakeTransport(okJson({ ok: true }))
            await aria.runAriaAction(action, inputs, CONN, { requestFn: t.fn })
            assert.equal(t.calls.length, 1, action)
            assert.equal(t.calls[0].method, method, action)
            assert.equal(t.calls[0].url, `http://aria.local:3000${path}`, action)
            assert.equal(t.calls[0].auth, 'Bearer aria_testkey', action)
        }
    })

    it('surfaces the API error text and transport failures', async () => {
        const bad = makeFakeTransport({ ok: false, status: 401, body: '{"error":"revoked"}', headers: {} })
        await assert.rejects(() => aria.runAriaAction('List Models', {}, CONN, { requestFn: bad.fn }), /Aria 401: revoked/)
        const down = makeFakeTransport(new Error('socket hang up'))
        await assert.rejects(() => aria.runAriaAction('List Models', {}, CONN, { requestFn: down.fn }), /Aria request failed/)
        await assert.rejects(() => aria.runAriaAction('Nope', {}, CONN, { requestFn: makeFakeTransport(okJson({})).fn }), /Unknown Action/)
    })
})

describe('resolveAriaConnection', () => {
    beforeEach(() => { clearAriaSettings() })
    afterEach(() => { clearAriaSettings() })

    it('fails closed when endpoint or key is missing', () => {
        assert.match(aria.resolveAriaConnection().error, /endpoint is not configured/)
        settingsManager.setSetting(aria.SETTING_ENDPOINT, 'http://aria.local:3000')
        assert.match(aria.resolveAriaConnection().error, /API key is not configured/)
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        const conn = aria.resolveAriaConnection()
        assert.equal(conn.ok, true)
        assert.equal(conn.endpoint, 'http://aria.local:3000')
    })
})

describe('aria-settings handlers', () => {
    it('GET requires auth and never exposes the key', () => {
        const denied = mockRes()
        aria.handleGetAriaSettings({}, denied, { canAccess: () => false })
        assert.equal(denied.statusCode, 401)
        const store = makeStore({ [aria.SETTING_ENDPOINT]: 'http://x:3000/', [aria.SETTING_API_KEY]: 'secret', [aria.SETTING_PRESET]: 'short' })
        const res = mockRes()
        aria.handleGetAriaSettings({}, res, { canAccess: () => true, settings: store })
        assert.equal(res.statusCode, 200)
        assert.equal(res.payload.endpoint, 'http://x:3000')
        assert.equal(res.payload.preset, 'short')
        assert.equal(res.payload.hasApiKey, true)
        assert.equal(res.payload.configured, true)
        assert.ok(!('apiKey' in res.payload))
    })

    it('POST saves fields, keeps the key when omitted, and validates presets', async () => {
        const store = makeStore({ [aria.SETTING_API_KEY]: 'original' })
        const res = mockRes()
        await aria.handleSaveAriaSettings({ body: { endpoint: 'http://y/', preset: 'ping' } }, res, { canAccess: () => true, settings: store })
        assert.equal(res.statusCode, 200)
        assert.equal(store.data[aria.SETTING_ENDPOINT], 'http://y/')
        assert.equal(store.data[aria.SETTING_API_KEY], 'original')
        assert.equal(res.payload.settings.preset, 'ping')
        const bad = mockRes()
        await aria.handleSaveAriaSettings({ body: { preset: 'verbose' } }, bad, { canAccess: () => true, settings: store })
        assert.equal(bad.statusCode, 400)
        const clear = mockRes()
        await aria.handleSaveAriaSettings({ body: { apiKey: null } }, clear, { canAccess: () => true, settings: store })
        assert.equal(clear.statusCode, 200)
        assert.equal(store.data[aria.SETTING_API_KEY], '')
    })

    it('test reports provider counts and transport errors without throwing', async () => {
        const denied = mockRes()
        await aria.handleTestAriaSettings({}, denied, { canAccess: () => false })
        assert.equal(denied.statusCode, 401)
        clearAriaSettings()
        const unconfigured = mockRes()
        await aria.handleTestAriaSettings({}, unconfigured, { canAccess: () => true })
        assert.equal(unconfigured.payload.ok, false)
        settingsManager.setSetting(aria.SETTING_ENDPOINT, 'http://aria.local:3000')
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        const ok = mockRes()
        const t = makeFakeTransport(okJson({ providers: [{ id: 'a' }, { id: 'b' }] }))
        await aria.handleTestAriaSettings({}, ok, { canAccess: () => true, requestFn: t.fn })
        assert.deepEqual(ok.payload, { ok: true, providers: 2 })
        const failing = mockRes()
        const down = makeFakeTransport(new Error('refused'))
        await aria.handleTestAriaSettings({}, failing, { canAccess: () => true, requestFn: down.fn })
        assert.equal(failing.payload.ok, false)
        assert.match(failing.payload.error, /refused/)
        clearAriaSettings()
    })
})

describe('Language Processing/Aria node', () => {
    let stub = null

    beforeEach(() => { clearAriaSettings() })
    afterEach(async () => {
        clearAriaSettings()
        if (stub) { stub.server.close(); stub = null }
    })

    it('registers with a stable title and sensible defaults', () => {
        assert.equal(NodeDefinition.prototype.title, 'Language Processing/Aria')
        // NodeDefinition expects the LiteGraph node base (addInput/addProperty/...)
        // mixed in by the runtime importer; stub it here to read the defaults.
        const proto = NodeDefinition.prototype
        const stash = {}
        for (const key of ['addInput', 'addOutput', 'addProperty', 'addEnumProperty']) {
            stash[key] = proto[key]
        }
        proto.addInput = function () {}
        proto.addOutput = function () {}
        proto.addProperty = function (k, v) { this.properties = this.properties || {}; this.properties[k] = v }
        proto.addEnumProperty = function (k, v) { this.properties = this.properties || {}; this.properties[k] = v }
        let def
        try {
            def = new NodeDefinition()
        } finally {
            for (const key of Object.keys(stash)) {
                if (stash[key] === undefined) delete proto[key]
                else proto[key] = stash[key]
            }
        }
        assert.equal(def.properties.Action, 'Chat')
        assert.equal(def.properties.Preset, 'balanced')
        assert.equal(def.properties['Response Format'], 'markdown')
    })

    it('sends chat with verbosity settings and returns text plus tool calls', async () => {
        stub = await startStubAria(() => ({ payload: { text: 'All quiet.', toolCalls: [{ id: '1', status: 'success' }], preset: 'short', response_format: 'plaintext' } }))
        settingsManager.setSetting(aria.SETTING_ENDPOINT, `http://127.0.0.1:${stub.port}`)
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        const { ok, populated, triggered } = await runNode({
            Action: 'Chat', Message: 'Anything need my attention?',
            Preset: 'short', 'Response Format': 'plaintext',
            'Max Tokens': 150, 'Include Tool Calls': 'False',
        })
        assert.equal(ok, true)
        assert.equal(triggered, 1)
        assert.deepEqual(populated, [null, 'All quiet.', '[{"id":"1","status":"success"}]', ''])
        assert.equal(stub.seen.length, 1)
        const req = stub.seen[0]
        assert.equal(req.method, 'POST')
        assert.equal(req.url, '/api/v1/chat')
        assert.equal(req.auth, 'Bearer k')
        assert.equal(req.body.providerId, undefined)
        assert.equal(req.body.model, undefined)
        assert.equal(req.body.preset, 'short')
        assert.equal(req.body.response_format, 'plaintext')
        assert.equal(req.body.include_tool_calls, false)
        assert.equal(req.body.maxTokens, 150)
        assert.equal(req.body.stream, false)
    })

    it('falls back to the stored preset and does not send a model', async () => {
        stub = await startStubAria(() => ({ payload: { text: 'ok', toolCalls: [] } }))
        settingsManager.setSetting(aria.SETTING_ENDPOINT, `http://127.0.0.1:${stub.port}/api/v1`)
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        settingsManager.setSetting(aria.SETTING_PRESET, 'compact')
        const { ok, populated } = await runNode({ Action: 'Chat', Message: 'hi' })
        assert.equal(ok, true)
        assert.equal(populated[1], 'ok')
        assert.equal(stub.seen[0].body.providerId, undefined)
        assert.equal(stub.seen[0].body.model, undefined)
        assert.equal(stub.seen[0].body.preset, 'compact')
    })

    it('returns raw JSON for list actions', async () => {
        stub = await startStubAria(() => ({ payload: { providers: [{ id: 'p1' }] } }))
        settingsManager.setSetting(aria.SETTING_ENDPOINT, `http://127.0.0.1:${stub.port}`)
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        const { ok, populated } = await runNode({ Action: 'List Models' })
        assert.equal(ok, true)
        assert.equal(populated[1], '{"providers":[{"id":"p1"}]}')
        assert.equal(populated[2], '')
        assert.equal(populated[3], '')
    })

    it('routes validation and transport failures to the Error output', async () => {
        settingsManager.setSetting(aria.SETTING_ENDPOINT, 'http://127.0.0.1:1')
        settingsManager.setSetting(aria.SETTING_API_KEY, 'k')
        const missing = await runNode({ Action: 'Chat', Message: '   ' })
        assert.equal(missing.ok, false)
        assert.match(missing.populated[3], /Message is required/)
        const down = await runNode({ Action: 'List Models' })
        assert.equal(down.ok, false)
        assert.match(down.populated[3], /Aria request failed/)
        clearAriaSettings()
        const unconfigured = await runNode({ Action: 'Chat', Message: 'hi' })
        assert.equal(unconfigured.ok, false)
        assert.match(unconfigured.populated[3], /not configured/)
    })

    it('surfaces Aria API errors on chat', async () => {
        stub = await startStubAria(() => ({ status: 401, payload: { error: 'revoked' } }))
        settingsManager.setSetting(aria.SETTING_ENDPOINT, `http://127.0.0.1:${stub.port}`)
        settingsManager.setSetting(aria.SETTING_API_KEY, 'bad')
        const { ok, populated } = await runNode({ Action: 'Chat', Message: 'hi' })
        assert.equal(ok, false)
        assert.match(populated[3], /Aria 401: revoked/)
    })
})
