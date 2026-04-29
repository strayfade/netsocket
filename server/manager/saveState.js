const path = require('path')
const fs = require('fs').promises
const { config } = require('../config')
const { log, logColors } = require('../log')

let graphNodes = [];
let lastKnownNodeCount = 0
let backupLoopStarted = false
let restoreInProgress = false

const DATA_DIR = path.dirname(config.storage.nodes)
const BACKUP_DIR = path.join(DATA_DIR, '_backups')
const BACKUP_INTERVAL_MS = 15 * 60 * 1000

const getNodeCount = (graphRoot) => {
    const list = graphRoot?.nodes?.nodes
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

const loadNodesFromDisk = async () => {
    try {
        graphNodes = JSON.parse(await fs.readFile(config.storage.nodes, { encoding: "utf-8" }))
    }
    catch {
        graphNodes = [];
        await fs.writeFile(config.storage.nodes, `[]`, { encoding: "utf-8" })
    }
}

const createBackup = async () => {
    await ensureDir(BACKUP_DIR)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUP_DIR, `snapshot-${stamp}`)
    await copyDir(DATA_DIR, backupPath, path.basename(BACKUP_DIR))
    return backupPath
}

const restoreLatestBackup = async () => {
    await ensureDir(BACKUP_DIR)
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true })
    const snapshots = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
    if (!snapshots.length) {
        return false
    }
    const latest = snapshots[snapshots.length - 1]
    const latestPath = path.join(BACKUP_DIR, latest)
    await clearDataDir()
    await copyDir(latestPath, DATA_DIR, null)
    return true
}

const restoreFromBackupIfNeeded = async () => {
    if (restoreInProgress) {
        return
    }
    restoreInProgress = true
    try {
        log(`Sudden empty nodegraph detected. Restoring latest backup...`, logColors.WarningVisible)
        const didRestore = await restoreLatestBackup()
        if (!didRestore) {
            log(`No backup snapshot available; keeping current in-memory graph state.`, logColors.Warning)
            return
        }
        await loadNodesFromDisk()
        const restoredCount = getNodeCount(graphNodes)
        if (restoredCount > 0) {
            lastKnownNodeCount = restoredCount
        }
        log(`Backup restore complete (${restoredCount} nodes recovered).`, logColors.SuccessVisible)
    } catch (error) {
        log(`Backup restore failed: ${error}`, logColors.ErrorVisible)
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
        log(`Initial data backup created at: ${location}`, logColors.Success)
    } catch (error) {
        log(`Initial data backup failed: ${error}`, logColors.Warning)
    }
    const timer = setInterval(async () => {
        try {
            const location = await createBackup()
            log(`Data backup created: ${location}`, logColors.Success)
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
    const count = getNodeCount(graphNodes)
    if (count > 0) {
        lastKnownNodeCount = count
    }
    await startBackupLoop()
}
const saveNodes = async () => {
    if (lastKnownNodeCount > 0 && getNodeCount(graphNodes) === 0 && !restoreInProgress) {
        await restoreFromBackupIfNeeded()
        return
    }
    let nodesStr = JSON.stringify(graphNodes)
    await fs.writeFile(config.storage.nodes, nodesStr, { encoding: "utf-8" })
}
setInterval(saveNodes, 1000)

const getNodes = () => {
    return graphNodes
}
const setNodes = (newNodes) => {
    const incomingCount = getNodeCount(newNodes)
    if (lastKnownNodeCount > 0 && incomingCount === 0 && !restoreInProgress) {
        void restoreFromBackupIfNeeded()
        return
    }
    graphNodes = newNodes
    if (incomingCount > 0) {
        lastKnownNodeCount = incomingCount
    }
}

module.exports = { getNodes, setNodes, populateNodes }
