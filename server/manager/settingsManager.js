const { log, logColors } = require('../log')
const fs = require('fs').promises
const { config } = require('../config')

let settingsStorage = []

const reloadSettings = async () => {
    const settingsPath = config.storage.settings
    try {
        settingsStorage = JSON.parse(await fs.readFile(settingsPath, { encoding: "utf-8" }))
        log(`Loaded settings!`)
    }
    catch {
        log("Unable to load settings (if this is a first run, ignore this warning)", logColors.Warning)
        await fs.writeFile(settingsPath, JSON.stringify([]), { encoding: "utf-8" })
        settingsStorage = []
    }
}

const getSetting = (varName) => {
    for (const variable of settingsStorage) {
        if (variable.name == varName)
            return variable.value
    }
    return ""
}

/** Value from disk if the key exists; otherwise `undefined` (so callers can fall back to defaults). */
const getStoredValue = (varName) => {
    for (const variable of settingsStorage) {
        if (variable.name == varName) return variable.value
    }
    return undefined
}

const setSetting = (varName, newVal) => {
    let found = false;
    for (let i = 0; i < settingsStorage.length; i++) {
        if (settingsStorage[i].name == varName) {
            settingsStorage[i].value = newVal.toString()
            found = true;
        }
    }
    if (!found) {
        settingsStorage.push({
            name: varName,
            value: newVal.toString()
        })
    }
}

const getAllSettings = () => {
    return settingsStorage
}

const saveSettings = async () => {
    const settingsPath = config.storage.settings
    await fs.writeFile(settingsPath, JSON.stringify(settingsStorage), { encoding: "utf-8" })
}

module.exports = { getSetting, getStoredValue, setSetting, getAllSettings, reloadSettings, saveSettings }