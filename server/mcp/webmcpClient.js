'use strict'

/**
 * Minimal MCP client for webmcp (a Chrome DevTools MCP over Streamable HTTP),
 * used by get_canvas to screenshot an SVG graph preview as a real PNG.
 *
 * Only outbound HTTPS from netsocket to the configured webmcp URL is needed:
 * the preview HTML is pushed into webmcp's browser via evaluate_script, so
 * webmcp never needs inbound access or a netsocket session.
 *
 * Tool names/params follow chrome-devtools-mcp (webmcp 1.8.0): new_page,
 * evaluate_script ({function, args}), resize_page ({width, height}),
 * take_screenshot (returns image content).
 */

const settingsManager = require('../manager/settingsManager')
const { WEBMCP_URL_SETTING, WEBMCP_API_KEY_SETTING } = require('./webmcp')
const { renderPreviewHtml } = require('./canvasRender')

require('./webmcp')

const DEFAULT_TIMEOUT_MS = 30000
const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_SCREENSHOT_DIM = 4096

const getWebmcpConfig = () => {
    const url = String(settingsManager.getSetting(WEBMCP_URL_SETTING) || '').trim()
    const apiKey = String(settingsManager.getSetting(WEBMCP_API_KEY_SETTING) || '')
    if (!url) {
        return { ok: false, code: 'WEBMCP_UNCONFIGURED', error: 'WebMCP URL is not set', hint: 'Set it in Dashboard → Preferences → WebMCP URL (or set_setting webmcp.url).' }
    }
    if (!/^https?:\/\//i.test(url)) {
        return { ok: false, code: 'WEBMCP_UNCONFIGURED', error: `WebMCP URL must start with http:// or https:// (got ${JSON.stringify(url)})` }
    }
    if (!apiKey) {
        return { ok: false, code: 'WEBMCP_UNCONFIGURED', error: 'WebMCP API key is not set', hint: 'Set it in Dashboard → Preferences → WebMCP API Key (or set_setting webmcp.apiKey).' }
    }
    return { ok: true, url, apiKey }
}

const fetchImpl = (...args) => {
    if (typeof globalThis.fetch !== 'function') {
        throw new Error('Global fetch is unavailable')
    }
    return globalThis.fetch(...args)
}

/** Parse a StreamableHTTP response body: either a JSON envelope or SSE `data:` lines. */
const parseRpcBody = async (response) => {
    const text = await response.text()
    const contentType = String(response.headers?.get?.('content-type') || '')
    if (!contentType.includes('text/event-stream')) {
        return JSON.parse(text)
    }
    const envelopes = []
    for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
            envelopes.push(JSON.parse(payload))
        } catch (_) { /* ignore non-JSON SSE data lines */ }
    }
    if (!envelopes.length) {
        throw new Error('Empty SSE response from WebMCP endpoint')
    }
    return envelopes[envelopes.length - 1]
}

const rpcCall = async ({ url, apiKey, method, params, protocolVersion, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                Authorization: `Bearer ${apiKey}`,
                ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 1000000, method, params }),
            signal: controller.signal,
        })
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeout = new Error(`WebMCP request timed out (${method})`)
            timeout.code = 'WEBMCP_TIMEOUT'
            throw timeout
        }
        const failure = new Error(`WebMCP request failed (${method}): ${error?.message || error}`)
        failure.code = 'WEBMCP_ERROR'
        throw failure
    } finally {
        clearTimeout(timer)
    }
    if (response.status === 401 || response.status === 403) {
        const failure = new Error('WebMCP rejected the API key (401/403)')
        failure.code = 'WEBMCP_AUTH'
        failure.hint = 'Check Dashboard → Preferences → WebMCP API Key.'
        throw failure
    }
    if (!response.ok) {
        const failure = new Error(`WebMCP HTTP ${response.status} (${method})`)
        failure.code = 'WEBMCP_ERROR'
        throw failure
    }
    let envelope
    try {
        envelope = await parseRpcBody(response)
    } catch (error) {
        const failure = new Error(`WebMCP returned an unreadable response (${method}): ${error?.message || error}`)
        failure.code = 'WEBMCP_ERROR'
        throw failure
    }
    if (envelope && envelope.error) {
        const failure = new Error(`WebMCP error (${method}): ${envelope.error.message || JSON.stringify(envelope.error)}`)
        failure.code = 'WEBMCP_ERROR'
        failure.data = envelope.error
        throw failure
    }
    return envelope ? envelope.result : null
}

const initialize = async ({ url, apiKey, timeoutMs }) => {
    const result = await rpcCall({
        url,
        apiKey,
        method: 'initialize',
        params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'netsocket', version: '1.0.0' },
        },
        timeoutMs,
    })
    return (result && result.protocolVersion) || '2025-06-18'
}

const callTool = async ({ url, apiKey, protocolVersion, name, args, timeoutMs }) => {
    const result = await rpcCall({
        url,
        apiKey,
        method: 'tools/call',
        params: { name, arguments: args || {} },
        protocolVersion,
        timeoutMs,
    })
    if (result && result.isError) {
        const text = (result.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join('\n')
        const failure = new Error(`WebMCP tool ${name} failed: ${text || 'unknown error'}`)
        failure.code = 'WEBMCP_ERROR'
        throw failure
    }
    return result
}

const findImageContent = (result) => {
    const items = (result && result.content) || []
    return items.find((item) => item && item.type === 'image' && item.data) || null
}

const RENDER_FUNCTION = `(html) => { document.open(); document.write(html); document.close(); return { w: Math.min(document.documentElement.scrollWidth, 4096), h: Math.min(document.documentElement.scrollHeight, 4096) }; }`

const screenshotGraph = async ({ svg, width, height }, overrides = {}) => {
    const config = overrides.config || getWebmcpConfig()
    if (!config.ok) return config
    const { url, apiKey } = config
    const timeoutMs = overrides.timeoutMs || DEFAULT_TIMEOUT_MS

    const html = renderPreviewHtml(svg, width, height)
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        return { ok: false, code: 'GRAPH_TOO_LARGE', error: `Preview HTML exceeds ${(MAX_HTML_BYTES / 1024 / 1024).toFixed(0)} MB; use get_canvas format svg instead.` }
    }

    try {
        const protocolVersion = await initialize({ url, apiKey, timeoutMs })
        const call = (name, args) => callTool({ url, apiKey, protocolVersion, name, args, timeoutMs })
        await call('new_page', { url: 'about:blank' })
        await call('evaluate_script', { function: RENDER_FUNCTION, args: [html] })
        const shotWidth = Math.min(Math.max(Number(width) || 800, 320), MAX_SCREENSHOT_DIM)
        const shotHeight = Math.min(Math.max(Number(height) || 600, 240), MAX_SCREENSHOT_DIM)
        await call('resize_page', { width: shotWidth, height: shotHeight })
        const shot = await call('take_screenshot', {})
        const image = findImageContent(shot)
        if (!image) {
            return { ok: false, code: 'WEBMCP_ERROR', error: 'take_screenshot returned no image content' }
        }
        return { ok: true, pngBase64: image.data, mimeType: image.mimeType || 'image/png', width: shotWidth, height: shotHeight }
    } catch (error) {
        return { ok: false, code: error?.code || 'WEBMCP_ERROR', error: error?.message || String(error), hint: error?.hint }
    }
}

module.exports = {
    getWebmcpConfig,
    screenshotGraph,
    parseRpcBody,
    initialize,
    callTool,
    DEFAULT_TIMEOUT_MS,
    MAX_HTML_BYTES,
}
