const { log, logColors } = require('../log')
const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const { config } = require('../config')

let vars = []
let loaded = false
let dirty = false
let saveTimer = null
let debounceTimer = null
let saveInProgress = false

const SAVE_INTERVAL_MS = 1000
const SAVE_DEBOUNCE_MS = 100

/** Change listeners receive { name, value } after every setVar. */
const changeListeners = new Set()

const onVarsChanged = (listener) => {
    if (typeof listener !== 'function') return () => {}
    changeListeners.add(listener)
    return () => { changeListeners.delete(listener) }
}

const notifyChanged = (name, value) => {
    for (const listener of changeListeners) {
        try {
            listener({ name, value })
        } catch (e) {
            log(`vars listener error: ${e}`, logColors.Error)
        }
    }
}

const writeVarsToDisk = (snapshot) => {
    const filePath = config.storage.vars
    fsSync.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
    fsSync.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), { encoding: 'utf-8' })
    fsSync.renameSync(tmpPath, filePath)
}

const persistVars = async () => {
    if (!loaded || !dirty || saveInProgress) return
    saveInProgress = true
    try {
        writeVarsToDisk(vars)
        dirty = false
    } catch (e) {
        log(`Failed to save state variables: ${e}`, logColors.Error)
    } finally {
        saveInProgress = false
    }
}

const schedulePersist = () => {
    if (!loaded) return
    dirty = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        debounceTimer = null
        void persistVars()
    }, SAVE_DEBOUNCE_MS)
}

const startPersistLoop = () => {
    if (saveTimer) return
    saveTimer = setInterval(() => { void persistVars() }, SAVE_INTERVAL_MS)
}

const normalizeVarsArray = (raw) => {
    if (Array.isArray(raw)) {
        return raw
            .filter((e) => e && typeof e.name === 'string' && e.name.length)
            .map((e) => ({ name: e.name, value: e.value != null ? String(e.value) : '' }))
    }
    if (raw && typeof raw === 'object') {
        return Object.keys(raw).map((name) => ({
            name,
            value: raw[name] != null ? String(raw[name]) : ''
        }))
    }
    return []
}

const reloadVars = async () => {
    const varsPath = config.storage.vars
    try {
        const raw = JSON.parse(await fs.readFile(varsPath, { encoding: "utf-8" }))
        vars = normalizeVarsArray(raw)
        log(`Loaded state variables!`)
    }
    catch {
        log("Unable to load state variables (if this is a first run, ignore this warning)", logColors.Warning)
        await fs.writeFile(varsPath, JSON.stringify([], null, 2), { encoding: "utf-8" })
        vars = []
    }
    loaded = true
    dirty = false
    startPersistLoop()
}

const getVar = (varName) => {
    for (const variable of vars) {
        if (variable.name == varName)
            return variable.value
    }
    return ""
}

const setVar = (varName, newVal) => {
    const name = varName != null ? String(varName) : ''
    const value = newVal != null ? newVal.toString() : ''
    let found = false;
    for (let i = 0; i < vars.length; i++) {
        if (vars[i].name == name) {
            vars[i].value = value
            found = true;
        }
    }
    if (!found) {
        vars.push({
            name,
            value
        })
    }
    schedulePersist()
    notifyChanged(name, value)
}

const getVarsSnapshot = () => {
    return JSON.parse(JSON.stringify(Array.isArray(vars) ? vars : []))
}

const replaceVarsAndPersist = async (raw) => {
    const next = normalizeVarsArray(raw)
    vars = next
    dirty = false
    const varsPath = config.storage.vars
    await fs.writeFile(varsPath, JSON.stringify(next, null, 2), { encoding: 'utf-8' })
}

const resetForTests = () => {
    vars = []
    loaded = false
    dirty = false
    changeListeners.clear()
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
}

module.exports = {
    getVar,
    setVar,
    reloadVars,
    getVarsSnapshot,
    replaceVarsAndPersist,
    onVarsChanged,
    persistVars,
    resetForTests,
}