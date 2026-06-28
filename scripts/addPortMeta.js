'use strict'

const fs = require('fs').promises
const path = require('path')
const {
    extractNodeSchemaFromDefinition,
    formatPortMetaAssignment,
} = require('../server/manager/nodeSchema')

async function walkNodeFiles(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...await walkNodeFiles(fullPath))
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(fullPath)
        }
    }

    return files
}

function stripPortMeta(source) {
    const lines = source.split('\n')
    const startLine = lines.findIndex((line) => line.includes('NodeDefinition.prototype.portMeta = {'))
    if (startLine < 0) return source

    let endLine = startLine + 1
    while (endLine < lines.length) {
        const line = lines[endLine]
        if (/^NodeDefinition\.prototype\./.test(line) && !line.includes('portMeta')) {
            break
        }
        if (/^const NodeFunction/.test(line)) {
            break
        }
        endLine++
    }

    return [...lines.slice(0, startLine), ...lines.slice(endLine)].join('\n')
}

function insertPortMeta(source, assignment) {
    const lines = source.split('\n')
    let insertIndex = lines.findIndex((line) => line.includes('NodeDefinition.prototype.description ='))

    if (insertIndex < 0) {
        insertIndex = lines.findIndex((line) => line.includes('NodeDefinition.prototype.title ='))
    }

    if (insertIndex < 0) {
        return null
    }

    lines.splice(insertIndex + 1, 0, assignment)
    return lines.join('\n')
}

async function rewritePortMeta(filePath) {
    let source = await fs.readFile(filePath, 'utf8')
    source = stripPortMeta(source)
    await fs.writeFile(filePath, source, 'utf8')

    delete require.cache[require.resolve(filePath)]
    const { NodeDefinition } = require(filePath)
    const schema = extractNodeSchemaFromDefinition(NodeDefinition)
    const assignment = formatPortMetaAssignment(schema.portMeta)
    const updated = insertPortMeta(source, assignment)

    if (!updated) {
        return { filePath, updated: false, reason: 'missing_title_or_description' }
    }

    await fs.writeFile(filePath, updated, 'utf8')
    return { filePath, updated: true, nodeType: schema.title }
}

async function main() {
    const nodesDir = path.join(__dirname, '../server/nodes')
    const files = await walkNodeFiles(nodesDir)
    const results = []

    for (const filePath of files) {
        results.push(await rewritePortMeta(filePath))
    }

    const updated = results.filter((result) => result.updated)
    const failed = results.filter((result) => !result.updated)

    console.log(`Rewrote portMeta in ${updated.length} node files.`)
    if (failed.length) {
        console.log(`Failed ${failed.length} files:`)
        for (const entry of failed) {
            console.log(`  ${path.relative(nodesDir, entry.filePath)} (${entry.reason})`)
        }
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
