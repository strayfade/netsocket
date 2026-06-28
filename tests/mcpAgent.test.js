'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs').promises
const os = require('os')

describe('mcp handlers', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('lists node summaries with optional category filter', () => {
        const { listNodeSummaries } = require('../server/mcp/handlers')
        const all = listNodeSummaries()
        const math = listNodeSummaries('Math')

        assert.ok(all.length > 0)
        assert.ok(math.every((node) => node.category === 'Math'))
        assert.ok(math.some((node) => node.nodeType === 'Math/Add'))
    })

    it('returns node info for known types', () => {
        const { getNodeInfo } = require('../server/mcp/handlers')
        const info = getNodeInfo('Math/Add')

        assert.ok(info)
        assert.equal(info.category, 'Math')
        assert.equal(info.name, 'Add')
        assert.ok(info.example)
        assert.ok(info.callingGuide)
        assert.equal(info.callingGuide.executeNode.nodeType, 'Math/Add')
        assert.equal(info.inputs[0].structure, 'Numeric value (integer or float).')
        assert.equal(info.outputs[0].mcpKey, 'output_0')
        assert.deepEqual(info.example.expectedOutputs.output_0.type, 'number')
    })

    it('get_node_info resolves short node names', () => {
        const { getNodeInfo } = require('../server/mcp/handlers')
        const info = getNodeInfo('Alert')

        assert.ok(info)
        assert.equal(info.title, 'Notifiers/Alert')
    })

    it('searchNodeSummaries finds nodes by short name', () => {
        const { searchNodeSummaries } = require('../server/mcp/handlers')
        const matches = searchNodeSummaries('Alert')

        assert.ok(matches.some((node) => node.nodeType === 'Notifiers/Alert'))
    })

    it('searchNodeSummaries ranks Philips Hue light nodes for natural language', () => {
        const { searchNodeSummaries } = require('../server/mcp/handlers')
        const matches = searchNodeSummaries('turn on all philips hue lights')

        assert.ok(matches.length > 0)
        assert.equal(
            matches[0].nodeType,
            'Smart Home/Philips Hue/Lights/Get All Lights'
        )
    })

    it('listNodeSummaries supports query objects', () => {
        const { listNodeSummaries } = require('../server/mcp/handlers')
        const nodes = listNodeSummaries({ query: 'philips hue get all lights' })

        assert.ok(nodes.length > 0)
        assert.equal(nodes[0].nodeType, 'Smart Home/Philips Hue/Lights/Get All Lights')
        assert.ok(nodes[0].description)
    })

    it('listNodeSummaries falls back to name search for unknown categories', () => {
        const { listNodeSummaries } = require('../server/mcp/handlers')
        const nodes = listNodeSummaries('Alert')

        assert.ok(nodes.some((node) => node.nodeType === 'Notifiers/Alert'))
    })

    it('executes Math/Add via executeMcpNode', async () => {
        const { executeMcpNode } = require('../server/mcp/handlers')
        const result = await executeMcpNode('Math/Add', { inputs: { A: 2, B: 3 } })

        assert.equal(result.success, true)
        assert.equal(result.outputs.output_0, 5)
    })

    it('blocks recursive MCP Agent execution', async () => {
        const { executeMcpNode, MCP_AGENT_NODE_TYPE } = require('../server/mcp/handlers')
        const result = await executeMcpNode(MCP_AGENT_NODE_TYPE, {
            inputs: { Command: 'run another agent' },
        })

        assert.equal(result.success, false)
        assert.equal(result.code, 'RECURSION_BLOCKED')
        assert.match(result.error, /Recursive MCP Agent/)
    })

    it('includes mcpPreferred in node info when defined on the node', () => {
        const { getNodeInfo } = require('../server/mcp/handlers')
        const info = getNodeInfo('Smart Home/Philips Hue/Lights/Set Light State by ID')

        assert.ok(info)
        assert.match(String(info.mcpPreferred), /hex color/i)
    })

    it('searchNodeSummaries ranks mcpPreferred nodes above similar alternatives', () => {
        const { compareSearchResults, isMcpPreferred } = require('../server/mcp/handlers')
        const preferred = {
            node: {
                title: 'Smart Home/Philips Hue/Lights/Set Light State by ID',
                mcpPreferred: 'Use hex color and light ID.',
            },
            score: 42,
        }
        const alternative = {
            node: {
                title: 'Smart Home/Philips Hue/Lights/Set Light State',
            },
            score: 42,
        }

        assert.equal(compareSearchResults(preferred, alternative), -1)
        assert.equal(compareSearchResults(alternative, preferred), 1)
        assert.ok(isMcpPreferred(preferred.node))
        assert.ok(!isMcpPreferred(alternative.node))

        const sorted = [alternative, preferred].sort((a, b) => compareSearchResults(a, b)
            || a.node.title.localeCompare(b.node.title))
        assert.equal(sorted[0].node.title, preferred.node.title)
    })

    it('listNodeSummaries includes mcpPreferred in query results', () => {
        const { listNodeSummaries } = require('../server/mcp/handlers')
        const nodes = listNodeSummaries({ query: 'set light state by id' })
        const byId = nodes.find((node) => node.nodeType === 'Smart Home/Philips Hue/Lights/Set Light State by ID')

        assert.ok(byId)
        assert.ok(byId.mcpPreferred)
    })
})

describe('createNetsocketMcpTools', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('defines list_nodes, get_node_info, and execute_node tools', () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })

        assert.ok(tools.list_nodes)
        assert.ok(tools.get_node_info)
        assert.ok(tools.execute_node)
        assert.equal(typeof tools.list_nodes.execute, 'function')
        assert.equal(typeof tools.get_node_info.execute, 'function')
        assert.equal(typeof tools.execute_node.execute, 'function')
    })

    it('list_nodes returns nodes and count', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.list_nodes.execute({ category: 'Math' })

        assert.ok(Array.isArray(result.nodes))
        assert.ok(result.count > 0)
        assert.equal(result.count, result.nodes.length)
        assert.ok(result.nodes.every((node) => node.nodeType))
        assert.ok(result.nodes.every((node) => node.name))
        assert.ok(result.hint)
    })

    it('list_nodes query returns ranked matches with descriptions', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.list_nodes.execute({ query: 'philips hue get all lights' })

        assert.ok(result.queried)
        assert.ok(result.nodes.length > 0)
        assert.equal(result.nodes[0].nodeType, 'Smart Home/Philips Hue/Lights/Get All Lights')
        assert.ok(result.nodes[0].description)
    })

    it('list_nodes query surfaces mcpPreferred nodes', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.list_nodes.execute({ query: 'set philips hue light color' })

        assert.ok(result.nodes.length > 0)
        const byId = result.nodes.find((node) => node.nodeType === 'Smart Home/Philips Hue/Lights/Set Light State by ID')
        assert.ok(byId)
        assert.ok(byId.mcpPreferred)
        assert.match(result.hint, /mcpPreferred/)
    })

    it('get_node_info returns metadata for known types', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.get_node_info.execute({ nodeType: 'Math/Add' })

        assert.equal(result.category, 'Math')
        assert.ok(result.example)
    })

    it('get_node_info returns error for unknown type', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.get_node_info.execute({ nodeType: 'Missing/Node' })

        assert.match(result.error, /Unknown node type/)
    })

    it('execute_node runs Math/Add', async () => {
        const { createNetsocketMcpTools } = require('../server/utils/netsocketMcpTools')
        const tools = createNetsocketMcpTools({ silent: true })
        const result = await tools.execute_node.execute({
            nodeType: 'Math/Add',
            inputs: { A: 4, B: 6 },
        })

        assert.equal(result.success, true)
        assert.equal(result.outputs.output_0, 10)
    })
})

describe('mcpAgentMemory', () => {
    it('persists and reloads conversation turns', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-agent-memory-'))
        const memoryPath = path.join(tempDir, 'mcp-agent-memory.json')

        const { config } = require('../server/config')
        const originalPath = config.storage.mcpAgentMemory
        config.storage.mcpAgentMemory = memoryPath

        try {
            const memory = require('../server/utils/mcpAgentMemory')
            await memory.reloadMcpAgentMemory()
            await memory.appendSessionTurn('test-session', 'hello', 'Hi there!')
            await memory.appendSessionTurn('test-session', 'what did I say?', 'You said hello.')

            const messages = await memory.getSessionMessages('test-session')
            assert.equal(messages.length, 4)
            assert.equal(messages[0].role, 'user')
            assert.equal(messages[0].content, 'hello')
            assert.equal(messages[3].content, 'You said hello.')

            delete require.cache[require.resolve('../server/utils/mcpAgentMemory')]
            const reloaded = require('../server/utils/mcpAgentMemory')
            await reloaded.reloadMcpAgentMemory()
            const persisted = await reloaded.getSessionMessages('test-session')
            assert.equal(persisted.length, 4)
        } finally {
            config.storage.mcpAgentMemory = originalPath
            delete require.cache[require.resolve('../server/utils/mcpAgentMemory')]
            await fs.rm(tempDir, { recursive: true, force: true })
        }
    })

    it('resolves session keys from conversation id or memory key', () => {
        const { resolveSessionKey } = require('../server/utils/mcpAgentMemory')

        assert.equal(resolveSessionKey({ conversationId: 'abc-123' }), 'conv:abc-123')
        assert.equal(resolveSessionKey({ memoryKey: 'kitchen' }), 'key:kitchen')
        assert.equal(resolveSessionKey({}), 'default')
    })
})

describe('runMcpAgent', () => {
    it('returns error for empty command', async () => {
        const {
            runMcpAgent,
            ASSISTANT_PERSONA,
            DEFAULT_SYSTEM_PROMPT,
            classifyInteractionMode,
        } = require('../server/utils/mcpAgent')
        const result = await runMcpAgent({ command: '   ', silent: true })

        assert.equal(result.response, '')
        assert.equal(result.error, 'Command is empty')
        assert.deepEqual(result.steps, [])
        assert.match(ASSISTANT_PERSONA, /friendly and capable assistant/)
        assert.match(ASSISTANT_PERSONA, /one sentence or less/)
        assert.match(ASSISTANT_PERSONA, /ONLY that value/)
        assert.match(DEFAULT_SYSTEM_PROMPT, /pure conversation/)
        assert.equal(classifyInteractionMode('hello!', {}), 'chat')
        assert.equal(classifyInteractionMode('Turn on the lights', {}), 'tools')
    })

    it('detects when execution follow-up is needed', () => {
        const {
            needsExecutionFollowUp,
            hasPendingExecute,
            countToolCalls,
            buildPrepareStep,
            getPendingNodeTypes,
            classifyInteractionMode,
            buildContinuationMessage,
        } = require('../server/utils/mcpAgent')

        assert.equal(classifyInteractionMode('hello!', {}), 'chat')
        assert.equal(
            needsExecutionFollowUp('chat', [], {}),
            false
        )
        assert.equal(
            needsExecutionFollowUp('tools', [{
                toolCalls: [{ toolName: 'list_nodes', input: {} }],
            }], {}),
            false
        )
        assert.equal(
            needsExecutionFollowUp('tools', [{
                toolCalls: [{ toolName: 'execute_node', input: { nodeType: 'Math/Add' } }],
            }], {}),
            false
        )
        assert.equal(
            needsExecutionFollowUp(
                'tools',
                [],
                { intent: 'otp' }
            ),
            true
        )

        const chainedSteps = [
            { toolCalls: [{ toolName: 'list_nodes', input: {} }] },
            { toolCalls: [{ toolName: 'get_node_info', input: { nodeType: 'Smart Home/Philips Hue/Lights/Get All Lights' } }] },
            { toolCalls: [{ toolName: 'execute_node', input: { nodeType: 'Smart Home/Philips Hue/Lights/Get All Lights' } }] },
            { toolCalls: [{ toolName: 'get_node_info', input: { nodeType: 'Smart Home/Philips Hue/Lights/Set Light State by ID' } }] },
        ]
        assert.equal(hasPendingExecute(chainedSteps), true)
        assert.deepEqual(
            getPendingNodeTypes(chainedSteps),
            ['Smart Home/Philips Hue/Lights/Set Light State by ID']
        )
        assert.match(
            buildContinuationMessage(chainedSteps),
            /Set Light State by ID/
        )
        assert.equal(
            needsExecutionFollowUp('tools', chainedSteps, {}),
            true
        )

        const prepareStep = buildPrepareStep('tools', {}, 'turn on lights')
        assert.deepEqual(
            prepareStep({ steps: [{ toolCalls: [{ toolName: 'get_node_info', input: {} }] }] }),
            { activeTools: ['execute_node'], toolChoice: 'required' }
        )
        assert.deepEqual(
            prepareStep({ steps: chainedSteps }),
            { activeTools: ['execute_node'], toolChoice: 'required' }
        )

        const chatPrepare = buildPrepareStep('chat', {}, 'hello')
        assert.deepEqual(chatPrepare({ steps: [] }), { toolChoice: 'none' })

        assert.equal(countToolCalls([
            { toolCalls: [{ toolName: 'get_node_info' }, { toolName: 'get_node_info' }] },
        ], 'get_node_info'), 2)
    })
})

describe('mcpAgentHints', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('resolves Alert from natural language command', () => {
        const { resolveCommandNodeHints, buildHintPrompt } = require('../server/utils/mcpAgentHints')
        const hints = resolveCommandNodeHints('Use the Alert node to send a test message')

        assert.equal(hints.skipListNodes, true)
        assert.equal(hints.matches.length, 1)
        assert.equal(hints.matches[0].nodeType, 'Notifiers/Alert')
        assert.match(buildHintPrompt(hints, 'tools'), /Likely target node/)
    })

    it('extracts node name from slash syntax', () => {
        const { resolveCommandNodeHints } = require('../server/utils/mcpAgentHints')
        const hints = resolveCommandNodeHints('Run Notifiers/Alert with message hello')

        assert.equal(hints.skipListNodes, true)
        assert.equal(hints.matches[0].nodeType, 'Notifiers/Alert')
    })

    it('resolves OTP intent from 2fa command', () => {
        const { resolveCommandNodeHints, buildHintPrompt } = require('../server/utils/mcpAgentHints')
        const hints = resolveCommandNodeHints('Give me the 2fa code for noahtaylor9265@gmail.com. Just the code please.')

        assert.equal(hints.intent, 'otp')
        assert.equal(hints.skipListNodes, true)
        assert.equal(hints.email, 'noahtaylor9265@gmail.com')
        assert.equal(hints.wantsCodeOnly, true)
        assert.match(buildHintPrompt(hints, 'tools'), /Authentication\/OTP/)
        assert.match(buildHintPrompt(hints, 'tools'), /Get OTP Accounts/)
        assert.match(buildHintPrompt(hints, 'tools'), /ONLY the numeric code/)
    })

    it('resolves quick web search intent from stock price command', () => {
        const { resolveCommandNodeHints, buildHintPrompt } = require('../server/utils/mcpAgentHints')
        const hints = resolveCommandNodeHints("What's the price of SNXX stock right now")

        assert.equal(hints.intent, 'quick_web_search')
        assert.equal(hints.skipListNodes, true)
        assert.equal(hints.matches[0].nodeType, 'Language Processing/Quick Web Search LLM')
        assert.match(buildHintPrompt(hints, 'tools'), /Quick Web Search LLM/)
    })

    it('builds conversational hint for greetings', () => {
        const { buildHintPrompt } = require('../server/utils/mcpAgentHints')
        assert.match(buildHintPrompt({}, 'chat'), /Reply naturally without using tools/)
    })

    it('builds list_nodes query hints for hue light commands', () => {
        const { resolveCommandNodeHints, buildHintPrompt, buildListNodesQuery } = require('../server/utils/mcpAgentHints')
        const command = 'Turn on all of the philips hue lights'
        const hints = resolveCommandNodeHints(command)

        assert.equal(hints.skipListNodes, false)
        assert.equal(hints.listQuery, buildListNodesQuery(command))
        assert.match(buildHintPrompt(hints, 'tools'), /list_nodes using query/)
        assert.ok(hints.matches.some((node) => node.nodeType === 'Smart Home/Philips Hue/Lights/Get All Lights'))
    })
})

describe('MCP Agent node', () => {
    before(async () => {
        await require('../server/manager/nodeImporter').setupNodes(
            path.join(__dirname, '../server/nodes')
        )
    })

    it('is registered with the expected title', () => {
        const { getNodeMetadata } = require('../server/manager/nodeImporter')
        const schema = getNodeMetadata('Language Processing/MCP Agent')

        assert.ok(schema)
        assert.equal(schema.category, 'Language Processing')
        assert.match(schema.description, /persistent local memory/)
        assert.ok(schema.inputs.some((input) => input.name === 'Conversation ID'))
        assert.ok(schema.inputs.some((input) => input.name === 'Memory Key'))
    })

    it('registers Quick Web Search LLM for MCP execute_node', () => {
        const { getNodeMetadata } = require('../server/manager/nodeImporter')
        const schema = getNodeMetadata('Language Processing/Quick Web Search LLM')

        assert.ok(schema)
        assert.equal(schema.category, 'Language Processing')
        assert.equal(schema.name, 'Quick Web Search LLM')
        assert.ok(schema.outputs.some((output) => output.name === 'Response'))
        assert.ok(schema.inputs.some((input) => input.name === 'Query'))
    })
})
