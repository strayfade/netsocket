'use strict'

const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, 'generateHueNodes.js')
let source = fs.readFileSync(file, 'utf8')

const sections = [
    ['// --- Lights ---', '// --- Groups ---', 'Lights'],
    ['// --- Groups ---', '// --- Scenes ---', 'Groups'],
    ['// --- Scenes ---', '// --- Sensors ---', 'Scenes'],
    ['// --- Sensors ---', '// --- Schedules ---', 'Sensors'],
    ['// --- Schedules ---', '// --- Rules ---', 'Schedules'],
    ['// --- Rules ---', '// --- Resource links ---', 'Rules'],
    ['// --- Resource links ---', '// --- Configuration (Bridge) ---', 'Resource Links'],
]

for (const [start, end, folder] of sections) {
    const startIndex = source.indexOf(start)
    const endIndex = source.indexOf(end)
    if (startIndex < 0 || endIndex < 0)
        throw new Error(`Missing section markers: ${start}`)
    const chunk = source.slice(startIndex, endIndex)
    const patched = chunk.replace(
        /emit(Read|Write)Node\(\{\n(?!    folder:)/g,
        `emit$1Node({\n    folder: '${folder}',\n`
    )
    source = source.slice(0, startIndex) + patched + source.slice(endIndex)
}

fs.writeFileSync(file, source)
console.log('Patched generateHueNodes.js section folders')
