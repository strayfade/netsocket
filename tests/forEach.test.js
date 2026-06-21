'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('Flow Control/For Each', () => {
    it('outputs each array item as an object', async () => {
        const { NodeFunction } = require('../server/nodes/flowControl/forEach')
        const elements = []
        const indexes = []
        let finishTriggered = false
        const onFinishGroup = [{}]

        const behaviors = {
            populateNextNodeLinks: async (values) => {
                elements.push(values[1])
                indexes.push(values[2])
            },
            getOutputNodeGroups: () => [[{}], [], [], onFinishGroup],
            triggerNodeGroup: async (nodes) => {
                if (nodes === onFinishGroup)
                    finishTriggered = true
            },
        }

        const ok = await NodeFunction(
            {},
            { Array: JSON.stringify([{ name: 'Desk' }, { name: 'Lamp' }]), 'Delay (ms)': 0 },
            behaviors
        )

        assert.equal(ok, true)
        assert.deepEqual(elements, [{ name: 'Desk' }, { name: 'Lamp' }])
        assert.deepEqual(indexes, [0, 1])
        assert.equal(finishTriggered, true)
    })
})
