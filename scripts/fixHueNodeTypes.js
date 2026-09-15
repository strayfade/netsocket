'use strict'

const fs = require('fs')
const path = require('path')

const HUE_DIR = path.join(__dirname, '../server/nodes/smartHome/philipsHue')

/** Output port names that should be JSON, keyed by node filename. */
const JSON_OUTPUTS_BY_FILE = {
    'getAllLights.js': ['Lights'],
    'getNewLights.js': ['Lights'],
    'getLightByName.js': ['Light Object'],
    'getAllGroups.js': ['Groups'],
    'getGroupByName.js': ['Groups'],
    'getLightGroups.js': ['Groups'],
    'getLuminaries.js': ['Groups'],
    'getLightSources.js': ['Groups'],
    'getRooms.js': ['Groups'],
    'getZones.js': ['Groups'],
    'getEntertainment.js': ['Groups'],
    'getAllScenes.js': ['Scenes'],
    'getSceneByName.js': ['Scenes'],
    'getAllSensors.js': ['Sensors'],
    'getNewSensors.js': ['Sensors'],
    'getAllSchedules.js': ['Schedules'],
    'getScheduleByName.js': ['Schedules'],
    'getAllRules.js': ['Rules'],
    'getRuleByName.js': ['Rules'],
    'getAllResourceLinks.js': ['Resource Links'],
    'getResourceLinkByName.js': ['Resource Links'],
}

let updated = 0

for (const [file, outputNames] of Object.entries(JSON_OUTPUTS_BY_FILE)) {
    const fullPath = path.join(HUE_DIR, file)
    if (!fs.existsSync(fullPath))
        throw new Error(`Missing node file: ${file}`)
    let source = fs.readFileSync(fullPath, 'utf8')
    let changed = false
    for (const name of outputNames) {
        const variants = [
            `this.addOutput("${name}", "object");`,
            `this.addOutput("${name}", "array");`,
            `this.addOutput('${name}', 'object');`,
            `this.addOutput('${name}', 'array');`,
        ]
        const target = `this.addOutput("${name}", "JSON");`
        for (const v of variants) {
            if (source.includes(v)) {
                source = source.replace(v, target)
                changed = true
            }
        }
    }
    if (changed) {
        fs.writeFileSync(fullPath, source)
        updated++
    }
}

console.log(`Ensured JSON output types in ${updated} Hue node files`)
