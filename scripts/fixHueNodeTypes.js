'use strict'

const fs = require('fs')
const path = require('path')

const HUE_DIR = path.join(__dirname, '../server/nodes/smartHome/philipsHue')

/** Output port names that carry arrays, keyed by node filename. */
const ARRAY_OUTPUTS_BY_FILE = {
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

for (const [file, outputNames] of Object.entries(ARRAY_OUTPUTS_BY_FILE)) {
    const fullPath = path.join(HUE_DIR, file)
    if (!fs.existsSync(fullPath))
        throw new Error(`Missing node file: ${file}`)
    let source = fs.readFileSync(fullPath, 'utf8')
    for (const name of outputNames) {
        const from = `this.addOutput("${name}", "object");`
        const to = `this.addOutput("${name}", "array");`
        if (!source.includes(from))
            throw new Error(`${file}: expected ${from}`)
        source = source.replace(from, to)
    }
    if (file === 'getLightByName.js') {
        source = source.replace(
            'await behaviors.populateNextNodeLinks([{}, ""]);',
            'await behaviors.populateNextNodeLinks([[], ""]);'
        )
    }
    fs.writeFileSync(fullPath, source)
    updated++
}

console.log(`Updated array output types in ${updated} Hue node files`)
