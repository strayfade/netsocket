'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const settingsManager = require('../server/manager/settingsManager')
const client = require('../server/mcp/webmcpClient')

const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(payload),
})

const sseResponse = (payload) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    text: async () => `: ping\nid: 1\ndata: ${JSON.stringify(payload)}\n\n`,
})

describe('webmcp client', () => {
    let realFetch
    let settingsSnap

    beforeEach(() => {
        realFetch = globalThis.fetch
        settingsSnap = settingsManager.getAllSettings().slice()
        require('../server/mcp/webmcp')
    })

    afterEach(() => {
        globalThis.fetch = realFetch
        const live = settingsManager.getAllSettings()
        live.length = 0
        live.push(...settingsSnap)
    })

    it('reports unconfigured state without touching the network', () => {
        const live = settingsManager.getAllSettings()
        for (let i = live.length - 1; i >= 0; i--) {
            if (String(live[i].name || '').startsWith('webmcp.')) live.splice(i, 1)
        }
        let called = false
        globalThis.fetch = async () => { called = true; throw new Error('should not fetch') }
        const config = client.getWebmcpConfig()
        assert.equal(config.ok, false)
        assert.equal(config.code, 'WEBMCP_UNCONFIGURED')
        assert.equal(called, false)
    })

    it('rejects non-http(s) urls', () => {
        settingsManager.setSetting('webmcp.url', 'ftp://example.com/mcp')
        settingsManager.setSetting('webmcp.apiKey', 'k')
        assert.equal(client.getWebmcpConfig().code, 'WEBMCP_UNCONFIGURED')
    })

    it('parses JSON and SSE envelopes', async () => {
        const envelope = { jsonrpc: '2.0', id: 7, result: { protocolVersion: '2025-06-18' } }
        assert.deepEqual(await client.parseRpcBody(jsonResponse(envelope)), envelope)
        assert.deepEqual(await client.parseRpcBody(sseResponse(envelope)), envelope)
    })

    it('maps 401 to WEBMCP_AUTH', async () => {
        globalThis.fetch = async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '' })
        const outcome = await client.screenshotGraph({ svg: '<svg></svg>', width: 100, height: 100 }, {
            config: { ok: true, url: 'https://webmcp.test/mcp', apiKey: 'bad' },
        })
        assert.equal(outcome.ok, false)
        assert.equal(outcome.code, 'WEBMCP_AUTH')
        assert.ok(outcome.hint)
    })

    it('runs the screenshot sequence and extracts the image', async () => {
        const calls = []
        globalThis.fetch = async (url, options) => {
            const body = JSON.parse(options.body)
            calls.push(body.method === 'tools/call' ? body.params.name : body.method)
            assert.equal(options.headers.Authorization, 'Bearer good-key')
            if (body.method === 'initialize') {
                return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } })
            }
            const tool = body.params.name
            if (tool === 'take_screenshot') {
                return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'image', data: 'iVBORw0=', mimeType: 'image/png' }] } })
            }
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { content: [] } })
        }
        const outcome = await client.screenshotGraph({ svg: '<svg></svg>', width: 800, height: 600 }, {
            config: { ok: true, url: 'https://webmcp.test/mcp', apiKey: 'good-key' },
        })
        assert.equal(outcome.ok, true)
        assert.equal(outcome.pngBase64, 'iVBORw0=')
        assert.deepEqual(calls, ['initialize', 'new_page', 'evaluate_script', 'resize_page', 'take_screenshot'])
    })

    it('surfaces tool errors with WEBMCP_ERROR', async () => {
        globalThis.fetch = async (url, options) => {
            const body = JSON.parse(options.body)
            if (body.method === 'initialize') {
                return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } })
            }
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { isError: true, content: [{ type: 'text', text: 'no such page' }] } })
        }
        const outcome = await client.screenshotGraph({ svg: '<svg></svg>', width: 100, height: 100 }, {
            config: { ok: true, url: 'https://webmcp.test/mcp', apiKey: 'k' },
        })
        assert.equal(outcome.ok, false)
        assert.equal(outcome.code, 'WEBMCP_ERROR')
    })

    it('refuses oversized previews', async () => {
        let called = false
        globalThis.fetch = async () => { called = true; throw new Error('should not fetch') }
        const outcome = await client.screenshotGraph({ svg: `<svg>${'x'.repeat(client.MAX_HTML_BYTES + 1)}</svg>`, width: 100, height: 100 }, {
            config: { ok: true, url: 'https://webmcp.test/mcp', apiKey: 'k' },
        })
        assert.equal(outcome.code, 'GRAPH_TOO_LARGE')
        assert.equal(called, false)
    })
})
