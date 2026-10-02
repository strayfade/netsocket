'use strict'

/**
 * MCP-facing system handlers: engine logs, settings, canvas view.
 * Injectable `webmcp`/`renderer` deps keep tests hermetic; production wiring
 * lives in server/mcp/mount.js.
 */

const settingsManager = require('../manager/settingsManager')
const { getPrefs } = require('../manager/nodePreferencesRegistry')
const { getLines } = require('../log')

require('./webmcp')

const SECRET_RE = /token|secret|password|passwd|api[_-]?key|clientkey|oauth|private|credential/i
const CONNECT_SETTING = 'google.oauth.connect'

const isSecretPref = (id) => SECRET_RE.test(String(id || ''))

const maskPrefValue = (pref, stored) => {
    const fallback = pref.defaultVal != null && pref.defaultVal !== '' ? String(pref.defaultVal) : ''
    const raw = stored !== undefined ? stored : fallback
    if (isSecretPref(pref.id)) {
        return { value: '***', configured: raw !== '' && raw != null }
    }
    return { value: raw, configured: raw !== '' && raw != null }
}

const listSettings = () => {
    const defs = getPrefs()
    return {
        success: true,
        count: defs.length,
        settings: defs.map((pref) => ({
            category: pref.category,
            id: pref.id,
            displayName: pref.displayName,
            type: pref.type,
            defaultVal: pref.defaultVal,
            description: pref.description || '',
            secret: isSecretPref(pref.id),
            ...maskPrefValue(pref, settingsManager.getStoredValue(pref.id)),
        })),
    }
}

const getSetting = (args = {}) => {
    const { name } = args
    const pref = getPrefs().find((entry) => entry.id === name)
    if (!pref) {
        return {
            success: false,
            code: 'UNKNOWN_SETTING',
            error: `Unknown setting ${JSON.stringify(name)}. Call list_settings to see registered settings.`,
        }
    }
    return {
        success: true,
        category: pref.category,
        id: pref.id,
        displayName: pref.displayName,
        type: pref.type,
        secret: isSecretPref(pref.id),
        ...maskPrefValue(pref, settingsManager.getStoredValue(pref.id)),
    }
}

const runSettingsSideEffects = async () => {
    try {
        await require('../utils/hueApi').setupHueApi()
    } catch (_) { /* best-effort, mirrors WS saveSetting */ }
    try {
        require('../utils/languageModel').reinitOllama()
    } catch (_) { /* best-effort, mirrors WS saveSetting */ }
}

const setSetting = async (args = {}, deps = {}) => {
    const { name, value } = args
    const { sideEffects = runSettingsSideEffects } = deps
    const pref = getPrefs().find((entry) => entry.id === name)
    if (!pref) {
        return {
            success: false,
            code: 'UNKNOWN_SETTING',
            error: `Unknown setting ${JSON.stringify(name)}. Call list_settings to see registered settings.`,
        }
    }
    if (name === CONNECT_SETTING) {
        return {
            success: false,
            code: 'READ_ONLY',
            error: 'The Google connect flag is managed by the OAuth flow and cannot be set over MCP.',
        }
    }
    settingsManager.setSetting(name, value ?? '')
    await settingsManager.saveSettings()
    await sideEffects()
    return { success: true, name, secret: isSecretPref(name), value: isSecretPref(name) ? '***' : String(value ?? '') }
}

const LOG_LEVEL_TAGS = { info: 'INFO', warn: 'WARN', warning: 'WARN', error: 'ERROR' }

const getLogs = (args = {}) => {
    const { lines = 50, level } = args
    const count = Math.min(Math.max(Number(lines) || 50, 1), 200)
    let all = getLines(1000)
    if (level != null && String(level).trim() !== '') {
        const tag = LOG_LEVEL_TAGS[String(level).trim().toLowerCase()]
        if (!tag) {
            return { success: false, code: 'INVALID_ARGS', error: 'level must be one of info, warn, error' }
        }
        all = all.filter((line) => line.includes(`[${tag}]`))
    }
    const sliced = all.slice(-count)
    return { success: true, lines: sliced, count: sliced.length, truncated: all.length > sliced.length }
}

const createSystemHandlers = (deps = {}) => {
    const {
        getRoot = () => { throw new Error('getRoot not wired') },
        renderSvg = null,
        renderHtml = null,
        screenshotHtml = null,
    } = deps

    const getCanvas = async (args = {}) => {
        const { format = 'png' } = args
        if (!['png', 'svg', 'json'].includes(format)) {
            return { success: false, code: 'INVALID_ARGS', error: 'format must be one of png, svg, json' }
        }
        let inner
        try {
            const root = getRoot()
            inner = root && root.nodes
            if (!inner || !Array.isArray(inner.nodes)) throw new Error('Invalid graph shape')
        } catch (error) {
            return { success: false, code: 'READ_FAILED', error: error?.message || String(error) }
        }
        if (format === 'json') {
            const { readGraph } = require('./graphStore')
            return { success: true, format: 'json', rev: null, ...readGraph({ nodes: inner, currentValues: [] }, {}) }
        }
        const renderer = renderSvg || require('./canvasRender').renderGraphSvg
        const { svg, width, height } = renderer(inner)
        if (format === 'svg') {
            return { success: true, format: 'svg', width, height, svg }
        }
        const shot = screenshotHtml || require('./webmcpClient').screenshotGraph
        const outcome = await shot({ svg, width, height })
        if (outcome.ok) {
            return { success: true, format: 'png', mimeType: outcome.mimeType || 'image/png', width: outcome.width || width, height: outcome.height || height, pngBase64: outcome.pngBase64 }
        }
        return {
            success: true,
            format: 'svg',
            width,
            height,
            svg,
            pngUnavailable: { code: outcome.code || 'SCREENSHOT_FAILED', error: outcome.error, hint: outcome.hint },
        }
    }

    return { listSettings, getSetting, setSetting, getLogs, getCanvas }
}

module.exports = {
    createSystemHandlers,
    listSettings,
    getSetting,
    setSetting,
    getLogs,
    isSecretPref,
}
