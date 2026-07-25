'use strict'

const settingsManager = require('./settingsManager')
const { addPref } = require('./nodePreferencesRegistry')

const DEBUG_MODE_KEY = 'debug.executionTrace'
const DEBUG_DELAY_KEY = 'debug.linkDelayMs'

addPref(
    'Debug',
    DEBUG_MODE_KEY,
    'Link activity debug mode',
    'boolean',
    'false',
    '<p>When enabled, links flash lime green and briefly grow whenever they carry new data or an execute trigger fires. Use with the delay below to slow execution for easier tracing.</p>'
)

addPref(
    'Debug',
    DEBUG_DELAY_KEY,
    'Link update delay (ms)',
    'number',
    '0',
    '<p>Optional pause after each link update or execute trigger while debug mode is on. <code>0</code> means no delay. Typical values: <code>50</code>–<code>250</code>.</p>'
)

let broadcaster = null

const setLinkActivityBroadcaster = (fn) => {
    broadcaster = typeof fn === 'function' ? fn : null
}

const isDebugEnabled = () => {
    const raw = settingsManager.getSetting(DEBUG_MODE_KEY)
    return raw === true || raw === 'true' || raw === '1'
}

const getLinkDelayMs = () => {
    const raw = settingsManager.getSetting(DEBUG_DELAY_KEY)
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(5000, Math.floor(n))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Broadcast link activity to editors and optionally delay after each link.
 * No-op when debug mode is off.
 * @param {Array<string|number>} linkIds
 * @param {'data'|'execute'} kind
 */
const notifyLinkActivity = async (linkIds, kind = 'data') => {
    if (!isDebugEnabled()) return
    const ids = (Array.isArray(linkIds) ? linkIds : [linkIds]).filter((id) => id != null)
    if (!ids.length) return

    const delayMs = getLinkDelayMs()
    for (const linkId of ids) {
        if (broadcaster) {
            try {
                broadcaster({
                    broadcastPurpose: 'linkActivity',
                    broadcastData: {
                        linkIds: [linkId],
                        kind: kind === 'execute' ? 'execute' : 'data',
                        at: Date.now(),
                    },
                })
            } catch (_) { /* ignore broadcast errors */ }
        }
        if (delayMs > 0) {
            await sleep(delayMs)
        }
    }
}

module.exports = {
    DEBUG_MODE_KEY,
    DEBUG_DELAY_KEY,
    setLinkActivityBroadcaster,
    isDebugEnabled,
    getLinkDelayMs,
    notifyLinkActivity,
}
