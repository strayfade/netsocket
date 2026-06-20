const path = require('path')
const fs = require('fs').promises
const fsSync = require('fs')
const { config } = require('../config')
const { log, logColors } = require('../log')

let tokenDict = []
let loaded = false
let saveTimer = null
let debounceTimer = null
let saveInProgress = false

const SAVE_INTERVAL_MS = 1000
const SAVE_DEBOUNCE_MS = 100

const readUsersFromDisk = () => {
    try {
        const raw = fsSync.readFileSync(config.storage.users, { encoding: 'utf-8' })
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return null
    }
}

const writeUsersToDisk = (users) => {
    const filePath = config.storage.users
    const dir = path.dirname(filePath)
    fsSync.mkdirSync(dir, { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    fsSync.writeFileSync(tmpPath, JSON.stringify(users), { encoding: 'utf-8' })
    fsSync.renameSync(tmpPath, filePath)
}

const saveUsers = async () => {
    if (!loaded || saveInProgress) return
    saveInProgress = true
    try {
        writeUsersToDisk(tokenDict)
    } catch (e) {
        log(`Failed to save sessions: ${e}`, logColors.Error)
    } finally {
        saveInProgress = false
    }
}

const scheduleSave = () => {
    if (!loaded) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        debounceTimer = null
        void saveUsers()
    }, SAVE_DEBOUNCE_MS)
}

const startSaveLoop = () => {
    if (saveTimer) return
    saveTimer = setInterval(() => { void saveUsers() }, SAVE_INTERVAL_MS)
}

const populateUsers = async () => {
    const filePath = config.storage.users
    let fileExists = false
    try {
        await fs.access(filePath)
        fileExists = true
    } catch {
        /* file may not exist yet */
    }

    try {
        const raw = await fs.readFile(filePath, { encoding: 'utf-8' })
        const parsed = JSON.parse(raw)
        tokenDict = Array.isArray(parsed) ? parsed : []
    } catch (e) {
        if (fileExists) {
            log(`Sessions file unreadable (${e}); leaving on-disk file unchanged`, logColors.Warning)
            tokenDict = []
        } else {
            tokenDict = []
            try {
                writeUsersToDisk(tokenDict)
            } catch (writeErr) {
                log(`Failed to initialize sessions file: ${writeErr}`, logColors.Error)
            }
        }
    }
    loaded = true
    startSaveLoop()
    log(`Loaded ${tokenDict.length} persisted session(s)`, logColors.Info)
}

const getUsers = () => tokenDict

const setUsers = (newDict) => {
    tokenDict = newDict
    scheduleSave()
}

/** Flush pending session writes (e.g. before shutdown). */
const flushUsers = async () => {
    if (!loaded) return
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    await saveUsers()
}

/**
 * Synchronous flush for login/logout and signal handlers.
 * When allowEmpty is false, an empty in-memory store will not overwrite sessions still on disk.
 */
const flushUsersSync = ({ allowEmpty = false } = {}) => {
    if (!loaded) return
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    if (tokenDict.length === 0 && !allowEmpty) {
        const onDisk = readUsersFromDisk()
        if (onDisk && onDisk.length > 0) {
            return
        }
    }
    try {
        writeUsersToDisk(tokenDict)
    } catch (e) {
        log(`Failed to flush sessions: ${e}`, logColors.Error)
    }
}

module.exports = { getUsers, setUsers, populateUsers, flushUsers, flushUsersSync }
