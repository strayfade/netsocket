const { log, logColors } = require('../log')
const fs = require('fs').promises
const { config } = require('../config')

let vars = []

const reloadVars = async () => {
    const varsPath = config.storage.vars
    try {
        vars = JSON.parse(await fs.readFile(varsPath, { encoding: "utf-8" }))
        log(`Loaded state variables!`)
    }
    catch {
        log("Unable to load state variables (if this is a first run, ignore this warning)", logColors.Warning)
        await fs.writeFile(varsPath, JSON.stringify({}), { encoding: "utf-8" })
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

module.exports = { getVar, setVar, reloadVars }