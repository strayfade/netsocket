'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
    parseCallArguments,
    parseEnumPropertyCall,
    formatPropertyLine,
    formatBooleanPropertyLine,
    normalizeBooleanDefault,
    serializePrototypeProperty,
    setupNodes,
} = require('../server/manager/nodeImporter')

describe('nodeImporter enum properties', () => {
    it('parses quoted call arguments with embedded commas', () => {
        const args = parseCallArguments(
            'this.addProperty("Schema", "{\\"type\\":\\"object\\",\\"required\\":[\\"answer\\"]}")'
        )
        assert.deepEqual(args, [
            'Schema',
            '{"type":"object","required":["answer"]}',
        ])
    })

    it('parses addInput call arguments', () => {
        const args = parseCallArguments('this.addInput("Prompt", "string")')
        assert.deepEqual(args, ['Prompt', 'string'])
    })

    it('parses addEnumProperty constructor lines', () => {
        const parsed = parseEnumPropertyCall(
            'this.addEnumProperty("Mode", "Boolean", ["Boolean", "Variable", "HTTP"]);'
        )
        assert.deepEqual(parsed, {
            name: 'Mode',
            defaultValue: 'Boolean',
            enumValues: ['Boolean', 'Variable', 'HTTP'],
        })
    })

    it('parses multiline addEnumProperty constructor lines', () => {
        const parsed = parseEnumPropertyCall(
            'this.addEnumProperty("Operator", "equals", [ "equals", "gt", "lt", ]);'
        )
        assert.deepEqual(parsed, {
            name: 'Operator',
            defaultValue: 'equals',
            enumValues: ['equals', 'gt', 'lt'],
        })
    })

    it('formats enum properties for the frontend importer', () => {
        const line = formatPropertyLine({
            name: 'Mode',
            defaultValue: 'Boolean',
            enumValues: ['Boolean', 'Variable', 'HTTP'],
        })
        assert.equal(
            line,
            '\t\tthis.addProperty("Mode", "Boolean", "enum", { values: ["Boolean","Variable","HTTP"] })\n'
        )
    })

    it('emits enum metadata for Wait Until in generated node code', async () => {
        const code = await setupNodes()
        assert.match(code, /createNode\("Flow Control\/Wait Until"/)
        assert.match(
            code,
            /addProperty\("Mode", "Boolean", "enum", \{ values: \["Boolean","Variable","HTTP"\] \}\)/
        )
    })

    it('emits True/False comboboxes for boolean inputs without explicit properties', async () => {
        const code = await setupNodes()
        assert.match(
            code,
            /createNode\("Logic\/AND"[\s\S]*addProperty\("A", "False", "enum", \{ values: \["True","False"\] \}\)/
        )
        assert.match(
            code,
            /createNode\("Logic\/AND"[\s\S]*addProperty\("B", "False", "enum", \{ values: \["True","False"\] \}\)/
        )
    })

    it('normalizes legacy boolean defaults to True/False combobox values', () => {
        assert.equal(normalizeBooleanDefault('true'), 'True')
        assert.equal(normalizeBooleanDefault('false'), 'False')
        assert.equal(formatBooleanPropertyLine('Condition', 'true').includes('"True"'), true)
    })

    it('emits number type metadata for number inputs', async () => {
        const code = await setupNodes()
        assert.match(
            code,
            /createNode\("Math\/Add"[\s\S]*addProperty\("A", "0", "number"\)/
        )
    })

    it('emits description metadata for nodes', async () => {
        const code = await setupNodes()
        assert.match(
            code,
            /createNode\("Math\/Add"[\s\S]*NodeDefinition\.prototype\.description = "Adds two numbers A and B and outputs the sum\."/
        )
    })

    it('quotes string prototype metadata such as mcpPreferred', () => {
        const line = serializePrototypeProperty('mcpPreferred', 'Prefer for OTP account lookup.')
        assert.equal(
            line,
            '\nNodeDefinition.prototype.mcpPreferred = "Prefer for OTP account lookup."'
        )
    })

    it('serializes boolean prototype metadata without quotes', () => {
        const line = serializePrototypeProperty('mcpPreferred', true)
        assert.equal(line, '\nNodeDefinition.prototype.mcpPreferred = true')
    })

    it('preserves JSON schema defaults with commas', async () => {
        const code = await setupNodes()
        assert.match(
            code,
            /createNode\("Language Processing\/Structured Output"[\s\S]*addProperty\("Schema", "\{\\"type\\":\\"object\\",\\"properties\\":\{\\"answer\\":\{\\"type\\":\\"string\\"\}\},\\"required\\":\[\\"answer\\"\]\}"\)/
        )
    })
})

describe('inputParser json', () => {
    const { json } = require('../server/utils/inputParser')

    it('returns objects unchanged', () => {
        const value = { name: 'Desk' }
        assert.deepEqual(json(value), value)
    })

    it('does not throw when JSON parsing fails', () => {
        assert.deepEqual(json('not valid json'), {})
    })
})

describe('inputParser bool', () => {
    const { bool } = require('../server/utils/inputParser')

    it('parses True/False and legacy true/false values', () => {
        assert.equal(bool('True'), true)
        assert.equal(bool('False'), false)
        assert.equal(bool('true'), true)
        assert.equal(bool('false'), false)
        assert.equal(bool(''), false)
        assert.equal(bool(null), false)
    })
})
