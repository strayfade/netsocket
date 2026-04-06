const cron = require('node-cron')
const { log, logColors } = require('../log')
const settingsManager = require('../manager/settingsManager')
const { getNodes } = require('../manager/saveState')
const { executeGraph } = require('../manager/execute')

/** JSON array of { id, cron } mirrors active schedules; updated when the graph’s Cron nodes change. */
const SETTINGS_KEY = 'triggers.cron.schedules'

let tasks = []
let lastCronNodesStr = null

const getCronNodes = (graphRoot) => {
    const inner = graphRoot?.nodes
    const list = inner?.nodes
    if (!Array.isArray(list)) {
        return []
    }
    return list
        .filter((n) => n.type === 'Triggers/Cron')
        .map((n) => ({
            id: n.id,
            cron: String(n.properties?.Cron ?? '').trim(),
        }))
        .sort((a, b) => {
            const da = a.id - b.id
            if (da !== 0) return da
            return a.cron.localeCompare(b.cron)
        })
}

const stopAllJobs = () => {
    for (const t of tasks) {
        try {
            t.stop()
        } catch (_) {
            /* ignore */
        }
    }
    tasks = []
}


// Reschedules cron jobs when Cron node ids or expressions change.
// Persists the schedule list to settings (same serialized form used for scheduling).
const syncFromGraphIfNeeded = () => {
    const graphRoot = getNodes()
    const cronNodes = getCronNodes(graphRoot)
    const cronNodesStr = JSON.stringify(cronNodes)
    if (cronNodesStr === lastCronNodesStr) {
        return
    }
    lastCronNodesStr = cronNodesStr

    stopAllJobs()

    for (const { id, cron: expr } of cronNodes) {
        if (!expr) {
            log(`Cron trigger (node ${id}): empty expression, not scheduled.`, logColors.Warning)
            continue
        }
        if (!cron.validate(expr)) {
            log(`Cron trigger (node ${id}): invalid expression "${expr}", not scheduled.`, logColors.Error)
            continue
        }
        const nodeId = id
        const task = cron.schedule(expr, () => {
            const g = getNodes()
            const node = g?.nodes?.nodes?.find((n) => n.id === nodeId)
            if (!node || node.type !== 'Triggers/Cron') {
                return
            }
            executeGraph(node).catch((e) => {
                log(`Cron trigger execution error (node ${nodeId}): ${e}`, logColors.Error)
            })
        })
        tasks.push(task)
        log(`Cron scheduled (node ${id}): ${expr}`, logColors.Success)
    }

    settingsManager.setSetting(SETTINGS_KEY, cronNodesStr)
    settingsManager.saveSettings().catch((e) => {
        log(`Failed to save cron schedules to settings: ${e}`, logColors.Warning)
    })
}

module.exports = { syncFromGraphIfNeeded }
