'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')

describe('Philips Hue nodes', () => {
    it('registers all generated Hue node titles', async () => {
        const { setupNodes, getNodeMetadataList } = require('../server/manager/nodeImporter')
        await setupNodes()
        const titles = new Set(getNodeMetadataList().map((node) => node.title))
        const dir = path.join(__dirname, '../server/nodes/smartHome/philipsHue')
        const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js'))
        assert.ok(files.length >= 60, `expected Hue node files, found ${files.length}`)
        for (const file of files) {
            const mod = require(path.join(dir, file))
            assert.ok(mod.NodeDefinition, `${file} exports NodeDefinition`)
            assert.ok(mod.NodeFunction, `${file} exports NodeFunction`)
            const title = mod.NodeDefinition.prototype.title
            assert.match(title, /^Smart Home\/Philips Hue\/[^/]+\/.+/, `${file} title should include a UI subfolder`)
            assert.ok(titles.has(title), `${title} is registered by nodeImporter`)
        }
    })

    it('uses array types for list outputs', () => {
        const dir = path.join(__dirname, '../server/nodes/smartHome/philipsHue')
        const listNodes = [
            ['getAllLights.js', 'Lights'],
            ['getGroupByName.js', 'Groups'],
            ['getSceneByName.js', 'Scenes'],
            ['getLightByName.js', 'Light Object'],
        ]
        for (const [file, port] of listNodes) {
            const mod = require(path.join(dir, file))
            const source = fs.readFileSync(path.join(dir, file), 'utf8')
            assert.match(
                source,
                new RegExp(`this\\.addOutput\\("${port.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}", "array"\\);`),
                `${file} should declare ${port} as array`
            )
            assert.ok(mod.NodeDefinition, `${file} exports NodeDefinition`)
        }
    })

    it('returns failure outputs when the bridge is not connected', async () => {
        const { runHueRead, failArray, failArrayJson } = require('../server/utils/hueNodeHelpers')
        const outputs = []
        const behaviors = {
            populateNextNodeLinks: async (values) => {
                outputs.push(values)
            },
        }
        const ok = await runHueRead(behaviors, [failArray], async () => [[]])
        assert.equal(ok, false)
        assert.deepEqual(outputs[0], [failArrayJson])
    })

    it('serializes bridge arrays as JSON strings for downstream nodes', () => {
        const { serializeHueArray } = require('../server/utils/hueNodeHelpers')
        const lights = [{
            id: 1,
            type: 'light',
            getJsonPayload() {
                return { id: 1, name: 'Desk', type: 'light', node_hue_api: { type: 'light', version: 1 } }
            },
        }]
        const parsed = JSON.parse(serializeHueArray(lights))
        assert.equal(parsed.length, 1)
        assert.equal(parsed[0].name, 'Desk')
    })
})
