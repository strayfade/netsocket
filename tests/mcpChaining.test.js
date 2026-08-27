'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

describe('MCP chaining — multi-node sequences', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        );
    });

    beforeEach(() => {
        // Reset vars state
        const { replaceVarsAndPersist, getVarsSnapshot } = require('../server/utils/vars');
        // ensure clean variable state; keep async but sync via snapshot reset if needed
    });

    describe('OTP chain: Get OTP Accounts → JSON/Get Array Item → OTP', () => {
        let originalListCodes;
        let originalGetCode;

        beforeEach(() => {
            const { otpController } = require('../server/utils/authenticator');
            originalListCodes = otpController.listCodes;
            originalGetCode = otpController.getCode;
            otpController.listCodes = async () => ['Discord:Strayfade', 'Discord:Via', 'GitHub:Noah'];
            otpController.getCode = async (account) => {
                if (account === 'Discord:Strayfade') return '123456';
                if (account === 'Discord:Via') return '654321';
                return null;
            };
        });

        afterEach(() => {
            const { otpController } = require('../server/utils/authenticator');
            otpController.listCodes = originalListCodes;
            otpController.getCode = originalGetCode;
        });

        it('Get OTP Accounts returns JSON-stringified array that must be parsed before chaining', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const listResult = await executeStandaloneNode('Authentication/Get OTP Accounts', { inputs: {} });
            assert.equal(listResult.success, true);
            assert.ok(typeof listResult.outputs.Accounts === 'string');
            const parsed = JSON.parse(listResult.outputs.Accounts);
            assert.deepEqual(parsed, ['Discord:Strayfade', 'Discord:Via', 'GitHub:Noah']);
        });

        it('chains correctly via JSON/Get Array Item to OTP (primary fix validation)', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            // Step 1: list
            const listResult = await executeStandaloneNode('Authentication/Get OTP Accounts', { inputs: {} });
            assert.equal(listResult.success, true);

            // Step 2: extract first element via JSON/Get Array Item (new Index param, case-sensitive)
            const itemResult = await executeStandaloneNode('JSON/Get Array Item', {
                inputs: { Array: listResult.outputs.Accounts, Index: 0 },
            });
            assert.equal(itemResult.success, true);
            // Get Array Item serializes the element as JSON string (string elements remain quoted)
            const accountKey = JSON.parse(itemResult.outputSlots[0].value);
            assert.equal(accountKey, 'Discord:Strayfade');

            // Step 3: OTP via parsed value (common mistake is to pass the raw JSON array string — test that correct value succeeds)
            const otpResult = await executeStandaloneNode('Authentication/OTP', {
                inputs: { Account: accountKey },
            });
            assert.equal(otpResult.success, true);
            assert.equal(otpResult.outputs.Code, '123456');
        });

        it('also accepts lowercase index for backward compatibility', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const listResult = await executeStandaloneNode('Authentication/Get OTP Accounts', { inputs: {} });
            const itemResult = await executeStandaloneNode('JSON/Get Array Item', {
                inputs: { Array: listResult.outputs.Accounts, index: 1 },
            });
            assert.equal(itemResult.success, true);
            const accountKey = JSON.parse(itemResult.outputSlots[0].value);
            assert.equal(accountKey, 'Discord:Via');
            const otpResult = await executeStandaloneNode('Authentication/OTP', {
                inputs: { Account: accountKey },
            });
            assert.equal(otpResult.outputs.Code, '654321');
        });

        it('OTP node output uses named mcpKey Code (not output_0)', async () => {
            const { getNodeMetadata } = require('../server/manager/nodeImporter');
            const schema = getNodeMetadata('Authentication/OTP');
            assert.equal(schema.outputs[0].mcpKey, 'Code');
            assert.equal(schema.outputs[0].name, 'Code');
            const { getNodeInfo } = require('../server/mcp/handlers');
            const info = getNodeInfo('Authentication/OTP');
            assert.equal(info.callingGuide.executeNode.outputs[0].mcpKey, 'Code');
        });
    });

    describe('Variables chain: List Variables → Get Variable (now chainable via input) → Set Variable (fixed alignment)', () => {
        beforeEach(async () => {
            const { replaceVarsAndPersist } = require('../server/utils/vars');
            await replaceVarsAndPersist([
                { name: 'myVar', value: 'hello' },
                { name: 'otherVar', value: 'world' },
            ]);
        });

        afterEach(async () => {
            const { replaceVarsAndPersist } = require('../server/utils/vars');
            await replaceVarsAndPersist([]);
        });

        it('List Variables returns JSON array string of names', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const result = await executeStandaloneNode('Variables/List Variables', { inputs: {} });
            assert.equal(result.success, true);
            assert.ok(typeof result.outputs.Variables === 'string');
            const names = JSON.parse(result.outputs.Variables);
            assert.deepEqual(names.sort(), ['myVar', 'otherVar'].sort());
        });

        it('List Variables → Get Array Item → Get Variable chain works end-to-end', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const listResult = await executeStandaloneNode('Variables/List Variables', { inputs: {} });
            const itemResult = await executeStandaloneNode('JSON/Get Array Item', {
                inputs: { Array: listResult.outputs.Variables, Index: 0 },
            });
            const varName = JSON.parse(itemResult.outputSlots[0].value);
            assert.ok(['myVar', 'otherVar'].includes(varName));
            const getResult = await executeStandaloneNode('Variables/Get Variable', {
                inputs: { Name: varName },
            });
            assert.equal(getResult.success, true);
            assert.ok(typeof getResult.outputs.Value === 'string');
            assert.ok(['hello', 'world'].includes(getResult.outputs.Value));
        });

        it('Get Variable now accepts input Name (chainable) — previously property-only', async () => {
            const { getNodeMetadata } = require('../server/manager/nodeImporter');
            const schema = getNodeMetadata('Variables/Get Variable');
            const inputNames = schema.inputs.map((i) => i.name);
            assert.ok(inputNames.includes('Name'), 'Get Variable must have Name input for chaining');
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const result = await executeStandaloneNode('Variables/Get Variable', {
                inputs: { Name: 'myVar' },
            });
            assert.equal(result.success, true);
            assert.equal(result.outputs.Value, 'hello');
        });

        it('Set Variable output alignment fixed — outputs.Value (not undefined)', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const setResult = await executeStandaloneNode('Variables/Set Variable', {
                inputs: { Name: 'myVar', 'New Value': 'updated' },
            });
            assert.equal(setResult.success, true);
            // The bug was populateNextNodeLinks([value]) missing null placeholder for event output 0
            // so outputs.Value was undefined. After fix it must be the stored value.
            assert.equal(setResult.outputs.Value, 'updated');
            assert.equal(setResult.outputSlots[0].value, 'updated');
            assert.ok(setResult.eventsTriggered.some((e) => e.index === 0));
            // Verify persisted
            const getResult = await executeStandaloneNode('Variables/Get Variable', {
                inputs: { Name: 'myVar' },
            });
            assert.equal(getResult.outputs.Value, 'updated');
        });

        it('chaining Set Variable output Value into next Get Variable', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const setResult = await executeStandaloneNode('Variables/Set Variable', {
                inputs: { Name: 'chainTest', 'New Value': '42' },
            });
            assert.equal(setResult.outputs.Value, '42');
            const getResult = await executeStandaloneNode('Variables/Get Variable', {
                inputs: { Name: 'chainTest' },
            });
            assert.equal(getResult.outputs.Value, '42');
        });
    });

    describe('Generic chaining helpers & mcpPreferred guidance', () => {
        it('JSON/Get Array Item and JSON/Get Object Value are marked mcpPreferred for chaining', async () => {
            const { getNodeMetadata } = require('../server/manager/nodeImporter');
            const arrayItem = getNodeMetadata('JSON/Get Array Item');
            const objValue = getNodeMetadata('JSON/Get Object Value');
            assert.ok(arrayItem.mcpPreferred, 'Get Array Item should be mcpPreferred');
            assert.match(arrayItem.mcpPreferred, /OTP|Array/i);
            assert.ok(objValue.mcpPreferred, 'Get Object Value should be mcpPreferred');
        });

        it('Variables nodes carry mcpPreferred for discovery ranking', async () => {
            const { getNodeMetadata } = require('../server/manager/nodeImporter');
            assert.ok(getNodeMetadata('Variables/Get Variable').mcpPreferred);
            assert.ok(getNodeMetadata('Variables/Set Variable').mcpPreferred);
            assert.ok(getNodeMetadata('Variables/List Variables').mcpPreferred);
        });

        it('get_node_info chainingHint and callingGuide notes mention JSON parsing and output_0', async () => {
            const { getNodeInfo } = require('../server/mcp/handlers');
            const info = getNodeInfo('Authentication/Get OTP Accounts');
            assert.match(info.chainingHint, /outputs/);
            assert.ok(info.callingGuide.notes.some((n) => /JSON/i.test(n)));
            assert.ok(info.callingGuide.notes.some((n) => /output_0|mcpKey/i.test(n)));
        });

        it('anonymous outputs like Math/Add still use output_0', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            const { getNodeInfo } = require('../server/mcp/handlers');
            const info = getNodeInfo('Math/Add');
            assert.equal(info.callingGuide.executeNode.outputs[0].mcpKey, 'output_0');
            const result = await executeStandaloneNode('Math/Add', { inputs: { A: 2, B: 3 } });
            assert.equal(result.outputs.output_0, 5);
        });
    });

    describe('JSON chain simulating Web response → Get Object Value', () => {
        it('Web JSON string → Get Object Value extracts field for next node', async () => {
            const { executeStandaloneNode } = require('../server/manager/executeStandalone');
            // Simulate what Web/GET Response would return: a JSON-stringified object
            const fakeApiResponse = JSON.stringify({ temperature: 22, city: 'Toronto' });
            const extracted = await executeStandaloneNode('JSON/Get Object Value', {
                inputs: { JSON: fakeApiResponse, 'Key Name': 'temperature' },
            });
            assert.equal(extracted.success, true);
            // Get Object Value outputs raw value (number) — not stringified; agent would chain as string next
            assert.equal(extracted.outputSlots[0].value, 22);
            // Chain extracted value into Set Variable
            const setResult = await executeStandaloneNode('Variables/Set Variable', {
                inputs: { Name: 'temp', 'New Value': String(extracted.outputSlots[0].value) },
            });
            assert.equal(setResult.outputs.Value, '22');
        });
    });
});
