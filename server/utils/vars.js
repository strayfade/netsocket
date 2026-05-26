const { log, logColors } = require('../log')
const fs = require('fs').promises
const { config } = require('../config')

let vars = []

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
}

const getVar = (varName) => {
    for (const variable of vars) {
        if (variable.name == varName)
            return variable.value
    }
    return ""
}

const setVar = (varName, newVal) => {
    let found = false;
    for (let i = 0; i < vars.length; i++) {
        if (vars[i].name == varName) {
            vars[i].value = newVal.toString()
            found = true;
        }
    }
    if (!found) {
        vars.push({
            name: varName,
            value: newVal.toString()
        })
    }
}

const getVarsSnapshot = () => {
    return JSON.parse(JSON.stringify(Array.isArray(vars) ? vars : []))
}

const replaceVarsAndPersist = async (raw) => {
    const next = normalizeVarsArray(raw)
    vars = next
    const varsPath = config.storage.vars
    await fs.writeFile(varsPath, JSON.stringify(next, null, 2), { encoding: 'utf-8' })
}

module.exports = { getVar, setVar, reloadVars, getVarsSnapshot, replaceVarsAndPersist }