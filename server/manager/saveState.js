const path = require('path')
const fs = require('fs').promises
const { config } = require('../config')
const { log, logColors } = require('../log')

const EMPTY_LITEGRAPH = {
    last_node_id: 0,
    last_link_id: 0,
    nodes: [],
    links: [],
    groups: [],
    config: {},
    extra: {},
    version: 0.4,
}

const EMPTY_GRAPH = {
    nodes: { ...EMPTY_LITEGRAPH },
    currentValues: [],
}

let graphNodes = { ...EMPTY_GRAPH, nodes: { ...EMPTY_LITEGRAPH }, currentValues: [] }
let lastKnownNodeCount = 0
let backupLoopStarted = false
let restoreInProgress = false
let saveInProgress = false

const DATA_DIR = path.dirname(config.storage.nodes)
const BACKUP_DIR = path.join(DATA_DIR, '_backups')
const BACKUP_INTERVAL_MS = 15 * 60 * 1000
const BACKUP_MAX_SNAPSHOTS = 96
/** Graph/settings snapshots may restore these; auth files are never overwritten by backup restore. */
const RESTORABLE_JSON_FILES = new Set(['state.json', 'vars.json', 'settings.json'])
const AUTH_FILES = ['users.json', 'credentials.json']

const isLiteGraphSerialize = (value) => {
    return (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray(value.nodes)
    )
}

/** Coerce persisted / websocket payloads into { nodes: LiteGraphSerialize, currentValues: [] }. */
const normalizeGraphRoot = (raw) => {
    if (raw == null) {
        return null
    }
    if (Array.isArray(raw)) {
        return raw.length === 0 ? cloneEmptyGraph() : null
    }
    if (typeof raw !== 'object') {
        return null
    }
    if (isLiteGraphSerialize(raw)) {
        return {
            nodes: raw,
            currentValues: Array.isArray(raw.currentValues) ? raw.currentValues : [],
        }
    }
    const inner = raw.nodes
    if (isLiteGraphSerialize(inner)) {
        return {
            nodes: inner,
            currentValues: Array.isArray(raw.currentValues) ? raw.currentValues : [],
        }
    }
    return null
}

const cloneEmptyGraph = () => ({
    nodes: { ...EMPTY_LITEGRAPH, nodes: [], links: [] },
    currentValues: [],
})

const getNodeCount = (graphRoot) => {
    const normalized = normalizeGraphRoot(graphRoot)
    const list = normalized?.nodes?.nodes
    return Array.isArray(list) ? list.length : 0
}

const ensureDir = async (dirPath) => {
    await fs.mkdir(dirPath, { recursive: true })
}

const copyDir = async (sourceDir, targetDir, excludeName = null) => {
    await ensureDir(targetDir)
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
        if (excludeName && entry.name === excludeName) {
            continue
        }
        const srcPath = path.join(sourceDir, entry.name)
        const dstPath = path.join(targetDir, entry.name)
        if (entry.isDirectory()) {
            await copyDir(srcPath, dstPath, null)
        } else if (entry.isFile()) {
            await fs.copyFile(srcPath, dstPath)
        }
    }
}

const clearDataDir = async () => {
    const entries = await fs.readdir(DATA_DIR, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.name === path.basename(BACKUP_DIR)) {
            continue
        }
        const entryPath = path.join(DATA_DIR, entry.name)
        await fs.rm(entryPath, { recursive: true, force: true })
    }
}

const writeJsonAtomic = async (filePath, payload) => {
    const dir = path.dirname(filePath)
    await ensureDir(dir)
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, payload, { encoding: 'utf-8' })
    await fs.rename(tmpPath, filePath)
}

const readNodeCountFromStateFile = async (statePath) => {
    try {
        const raw = JSON.parse(await fs.readFile(statePath, { encoding: 'utf-8' }))
        return getNodeCount(raw)
    } catch {
        return 0
    }
}

const listSnapshotDirs = async () => {
    await ensureDir(BACKUP_DIR)
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true })
    return entries
        .filter((e) => e.isDirectory() && e.name.startsWith('snapshot-'))
        .map((e) => e.name)
        .sort()
}

const getLatestValidSnapshotDir = async () => {
    const snapshots = await listSnapshotDirs()
    for (let i = snapshots.length - 1; i >= 0; i--) {
        const dir = path.join(BACKUP_DIR, snapshots[i])
        const statePath = path.join(dir, path.basename(config.storage.nodes))
        const count = await readNodeCountFromStateFile(statePath)
        if (count > 0) {
            return dir
        }
    }
    return null
}

const pruneOldSnapshots = async () => {
    const snapshots = await listSnapshotDirs()
    const excess = snapshots.length - BACKUP_MAX_SNAPSHOTS
    if (excess <= 0) {
        return
    }
    for (let i = 0; i < excess; i++) {
        await fs.rm(path.join(BACKUP_DIR, snapshots[i]), { recursive: true, force: true })
    }
}

const loadNodesFromDisk = async () => {
    let rawText = null
    try {
        rawText = await fs.readFile(config.storage.nodes, { encoding: 'utf-8' })
        const parsed = JSON.parse(rawText)
        const normalized = normalizeGraphRoot(parsed)
        if (normalized) {
            graphNodes = normalized
            return
        }
        log('state.json has an unrecognized shape; attempting backup restore', logColors.Warning)
    } catch (error) {
        if (rawText != null) {
            log(`state.json is unreadable (${error}); attempting backup restore`, logColors.Warning)
        }
    }

    const restored = await restoreJsonFromLatestSnapshot()
    if (restored) {
        try {
            const parsed = JSON.parse(await fs.readFile(config.storage.nodes, { encoding: 'utf-8' }))
            const normalized = normalizeGraphRoot(parsed)
            if (normalized) {
                graphNodes = normalized
                return
            }
        } catch {
            /* fall through */
        }
    }

    graphNodes = cloneEmptyGraph()
}

const readAuthFileSnapshots = async () => {
    const preserved = new Map()
    for (const name of AUTH_FILES) {
        const filePath = path.join(DATA_DIR, name)
        try {
            preserved.set(name, await fs.readFile(filePath))
        } catch {
            /* file may not exist yet */
        }
    }
    return preserved
}

const writeAuthFileSnapshots = async (preserved) => {
    for (const [name, content] of preserved) {
        await fs.writeFile(path.join(DATA_DIR, name), content)
    }
}

const restoreJsonFromLatestSnapshot = async () => {
    const latestPath = await getLatestValidSnapshotDir()
    if (!latestPath) {
        return false
    }
    await ensureDir(DATA_DIR)
    const files = await fs.readdir(latestPath, { withFileTypes: true })
    let n = 0
    for (const e of files) {
        if (e.isFile() && RESTORABLE_JSON_FILES.has(e.name.toLowerCase())) {
            await fs.copyFile(path.join(latestPath, e.name), path.join(DATA_DIR, e.name))
            n++
        }
    }
    if (n > 0) {
        log(
            `Restored ${n} JSON file(s) from snapshot ${path.basename(latestPath)}`,
            logColors.Success
        )
    }
    return n > 0
}

const createBackup = async () => {
    const memoryCount = getNodeCount(graphNodes)
    const diskCount = await readNodeCountFromStateFile(config.storage.nodes)
    if (memoryCount === 0 && diskCount === 0) {
        return null
    }
    await ensureDir(BACKUP_DIR)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUP_DIR, `snapshot-${stamp}`)
    await copyDir(DATA_DIR, backupPath, path.basename(BACKUP_DIR))
    await pruneOldSnapshots()
    return backupPath
}

const restoreLatestBackup = async () => {
    const latestPath = await getLatestValidSnapshotDir()
    if (!latestPath) {
        return false
    }
    const preservedAuth = await readAuthFileSnapshots()
    await clearDataDir()
    await copyDir(latestPath, DATA_DIR, null)
    await writeAuthFileSnapshots(preservedAuth)
    return true
}

const restoreFromBackupIfNeeded = async () => {
    if (restoreInProgress) {
        return
    }
    restoreInProgress = true
    try {
        log('Empty or invalid nodegraph detected; restoring from backup...', logColors.Warning)
        const didRestore = await restoreLatestBackup()
        if (!didRestore) {
            log('No valid backup snapshot found; keeping in-memory graph state.', logColors.Warning)
            return
        }
        await loadNodesFromDisk()
        const restoredCount = getNodeCount(graphNodes)
        if (restoredCount > 0) {
            lastKnownNodeCount = restoredCount
            log(`Backup restore complete (${restoredCount} nodes recovered).`, logColors.Success)
        } else {
            log('Backup restore did not recover any nodes.', logColors.Error)
        }
    } catch (error) {
        log(`Backup restore failed: ${error}`, logColors.Error)
    } finally {
        restoreInProgress = false
    }
}

const startBackupLoop = async () => {
    if (backupLoopStarted) {
        return
    }
    backupLoopStarted = true
    await ensureDir(BACKUP_DIR)
    try {
        const location = await createBackup()
        if (location) {
            log(`Initial data backup created at: ${location}`, logColors.Success)
        }
    } catch (error) {
        log(`Initial data backup failed: ${error}`, logColors.Warning)
    }
    const timer = setInterval(async () => {
        try {
            const location = await createBackup()
            if (location) {
                log(`Data backup created: ${location}`, logColors.Success)
            }
        } catch (error) {
            log(`Scheduled data backup failed: ${error}`, logColors.Warning)
        }
    }, BACKUP_INTERVAL_MS)
    if (typeof timer.unref === 'function') {
        timer.unref()
    }
}

const populateNodes = async () => {
    await loadNodesFromDisk()
    let count = getNodeCount(graphNodes)
    if (count === 0) {
        await restoreJsonFromLatestSnapshot()
        await loadNodesFromDisk()
        count = getNodeCount(graphNodes)
    }
    if (count > 0) {
        lastKnownNodeCount = count
    }
    await startBackupLoop()
}

const saveNodes = async () => {
    if (restoreInProgress || saveInProgress) {
        return
    }
    saveInProgress = true
    try {
        const count = getNodeCount(graphNodes)
        if (lastKnownNodeCount > 0 && count === 0) {
            await restoreFromBackupIfNeeded()
            return
        }
        if (count === 0) {
            return
        }
        const normalized = normalizeGraphRoot(graphNodes)
        if (!normalized) {
            log('Refusing to persist invalid nodegraph shape', logColors.Warning)
            return
        }
        graphNodes = normalized
        await writeJsonAtomic(config.storage.nodes, JSON.stringify(normalized))
    } catch (error) {
        log(`Failed to save nodegraph: ${error}`, logColors.Error)
    } finally {
        saveInProgress = false
    }
}
setInterval(saveNodes, 1000)

const getNodes = () => {
    return graphNodes
}

const setNodes = (newNodes, opts = {}) => {
    const fromImport = opts.fromImport === true
    const normalized = normalizeGraphRoot(newNodes)
    if (!normalized) {
        if (!fromImport && lastKnownNodeCount > 0 && !restoreInProgress) {
            void restoreFromBackupIfNeeded()
        }
        return
    }
    const incomingCount = getNodeCount(normalized)
    if (!fromImport && lastKnownNodeCount > 0 && incomingCount === 0) {
        if (!restoreInProgress) {
            void restoreFromBackupIfNeeded()
        }
        return
    }
    graphNodes = normalized
    if (incomingCount > 0) {
        lastKnownNodeCount = incomingCount
    } else if (fromImport) {
        lastKnownNodeCount = 0
    }
}

module.exports = { getNodes, setNodes, populateNodes }
