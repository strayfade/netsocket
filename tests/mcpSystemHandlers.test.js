'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const settingsManager = require('../server/manager/settingsManager')
const { log, logColors, addPushLogListener } = require('../server/log')
const { createSystemHandlers } = require('../server/mcp/systemHandlers')

const snapshotSettings = () => settingsManager.getAllSettings().slice()
const restoreSettings = (snap) => {
    const live = settingsManager.getAllSettings()
    live.length = 0
    live.push(...snap)
}

describe('system handlers', () => {
    let settingsSnap
    let realSaveSettings

    beforeEach(() => {
        settingsSnap = snapshotSettings()
        realSaveSettings = settingsManager.saveSettings
        settingsManager.saveSettings = async () => {}
        // Register webmcp prefs (idempotent) for settings tests.
        require('../server/mcp/webmcp')
    })

    afterEach(() => {
        settingsManager.saveSettings = realSaveSettings
        restoreSettings(settingsSnap)
    })

    it('reads and filters engine logs', () => {
        log('[test] info line for mcp')
        log('[test] error line for mcp', logColors.Error)
        const { getLogs } = createSystemHandlers({ getRoot: () => { throw new Error('unused') } })

        const all = getLogs({ lines: 500 })
        assert.equal(all.success, true)
        assert.ok(all.lines.some((line) => line.includes('[test] info line for mcp')))

        const errors = getLogs({ lines: 500, level: 'error' })
        assert.ok(errors.lines.length > 0)
        assert.ok(errors.lines.every((line) => line.includes('[ERROR]')))
        assert.ok(!errors.lines.some((line) => line.includes('[test] info line for mcp')))

        assert.equal(getLogs({ level: 'bogus' }).code, 'INVALID_ARGS')
    })

    it('captures log lines through a listener and unsubscribes', () => {
        const seen = []
        const remove = addPushLogListener((line) => seen.push(line))
        log('[test] listener line')
        remove()
        log('[test] after unsubscribe')
        assert.ok(seen.some((line) => line.includes('[test] listener line')))
        assert.ok(!seen.some((line) => line.includes('[test] after unsubscribe')))
    })

    it('lists settings with secrets masked', () => {
        const { listSettings } = createSystemHandlers({ getRoot: () => { throw new Error('unused') } })
        const result = listSettings()
        assert.equal(result.success, true)
        const apiKey = result.settings.find((entry) => entry.id === 'webmcp.apiKey')
        assert.ok(apiKey, 'webmcp.apiKey pref is registered')
        assert.equal(apiKey.secret, true)
        assert.equal(apiKey.value, '***')
        const url = result.settings.find((entry) => entry.id === 'webmcp.url')
        assert.equal(url.secret, false)
    })

    it('gets and sets non-secret settings', async () => {
        const handlers = createSystemHandlers({ getRoot: () => { throw new Error('unused') } })
        let sideEffects = 0
        const set = await handlers.setSetting(
            { name: 'webmcp.url', value: 'http://webmcp-test:3000/mcp' },
            { sideEffects: async () => { sideEffects += 1 } }
        )
        assert.equal(set.success, true)
        assert.equal(set.value, 'http://webmcp-test:3000/mcp')
        assert.equal(sideEffects, 1)
        assert.equal(handlers.getSetting({ name: 'webmcp.url' }).value, 'http://webmcp-test:3000/mcp')
    })

    it('masks secret values on set and rejects unknown settings', async () => {
        const handlers = createSystemHandlers({ getRoot: () => { throw new Error('unused') } })
        const set = await handlers.setSetting({ name: 'webmcp.apiKey', value: 's3cr3t' }, { sideEffects: async () => {} })
        assert.equal(set.success, true)
        assert.equal(set.value, '***')
        assert.equal(handlers.getSetting({ name: 'webmcp.apiKey' }).value, '***')

        assert.equal(handlers.getSetting({ name: 'nope.missing' }).code, 'UNKNOWN_SETTING')
        const bad = await handlers.setSetting({ name: 'nope.missing', value: 'x' }, { sideEffects: async () => {} })
        assert.equal(bad.code, 'UNKNOWN_SETTING')
    })

    it('returns an SVG schematic and JSON layout from get_canvas', async () => {
        const inner = {
            last_node_id: 0,
            last_link_id: 0,
            nodes: [
                {
                    id: 'a',
                    type: 'Math/Add',
                    pos: [100, 100],
                    size: [180, 60],
                    mode: 0,
                    inputs: [{ name: 'A', type: 'number', link: null }],
                    outputs: [{ name: '', type: 'number', links: [], slot_index: 0 }],
                    properties: {},
                },
            ],
            links: [],
            groups: [{ title: 'Math', bounding: [50, 50, 300, 200], color: '#0ea5e9', font_size: 24 }],
            config: {},
        }
        const handlers = createSystemHandlers({ getRoot: () => ({ nodes: inner, currentValues: [] }) })

        const svg = await handlers.getCanvas({ format: 'svg' })
        assert.equal(svg.success, true)
        assert.equal(svg.format, 'svg')
        assert.ok(svg.svg.includes('<svg'))
        assert.ok(svg.svg.includes('Math'))

        const json = await handlers.getCanvas({ format: 'json' })
        assert.equal(json.success, true)
        assert.equal(json.nodes[0].id, 'a')

        assert.equal((await handlers.getCanvas({ format: 'bmp' })).code, 'INVALID_ARGS')
    })

    it('falls back to SVG when webmcp is unconfigured', async () => {
        const live = settingsManager.getAllSettings()
        for (let i = live.length - 1; i >= 0; i--) {
            if (String(live[i].name || '').startsWith('webmcp.')) live.splice(i, 1)
        }
        const handlers = createSystemHandlers({ getRoot: () => ({ nodes: { nodes: [], links: [], groups: [] }, currentValues: [] }) })
        const result = await handlers.getCanvas({ format: 'png' })
        assert.equal(result.success, true)
        assert.equal(result.format, 'svg')
        assert.equal(result.pngUnavailable.code, 'WEBMCP_UNCONFIGURED')
    })
})
