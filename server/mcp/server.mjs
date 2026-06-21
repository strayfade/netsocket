import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const toolResult = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
})

export function createNetsocketMcpServer(deps) {
    const {
        listNodeSummaries,
        getNodeInfo,
        executeNode,
    } = deps

    const server = new McpServer(
        { name: 'netsocket', version: '1.0.0' },
        {
            instructions: [
                'Netsocket exposes automation nodes that can run without a canvas graph.',
                'Typical workflow: list_nodes → get_node_info → execute_node, then pass prior outputs into the next execute_node call.',
                'Node types use the "Category/Name" format, for example "Math/Add" or "Language Processing/LLM".',
                'Provide input values in execute_node.inputs. Use execute_node.properties for node settings that are not wired as inputs.',
                'Use outputSlots or outputs from one call as inputs for the next node to chain automations.',
            ].join(' '),
        }
    )

    server.registerTool(
        'list_nodes',
        {
            title: 'List Netsocket Nodes',
            description: 'List available node types with category, title, and description. Optionally filter by category.',
            inputSchema: z.object({
                category: z.string().optional().describe('Optional category filter, e.g. "Math" or "Web"'),
            }),
        },
        async ({ category }) => toolResult({
            nodes: listNodeSummaries(category),
            count: listNodeSummaries(category).length,
        })
    )

    server.registerTool(
        'get_node_info',
        {
            title: 'Get Node Info',
            description: 'Get full metadata for a node type: inputs, outputs, properties, defaults, and example usage.',
            inputSchema: z.object({
                nodeType: z.string().describe('Node type in Category/Name format, e.g. "Math/Add"'),
            }),
        },
        async ({ nodeType }) => {
            const info = getNodeInfo(nodeType)
            if (!info) {
                return toolResult({
                    error: `Unknown node type: ${nodeType}`,
                    hint: 'Call list_nodes to see available node types.',
                })
            }
            return toolResult(info)
        }
    )

    server.registerTool(
        'execute_node',
        {
            title: 'Execute Node',
            description: 'Run a single node with the provided inputs and optional properties. Returns output values you can pass to another node.',
            inputSchema: z.object({
                nodeType: z.string().describe('Node type in Category/Name format'),
                inputs: z.record(z.string(), z.unknown()).optional().describe('Input values keyed by input name'),
                properties: z.record(z.string(), z.unknown()).optional().describe('Node property overrides keyed by property name'),
            }),
        },
        async ({ nodeType, inputs, properties }) => {
            try {
                const result = await executeNode(nodeType, { inputs: inputs || {}, properties: properties || {} })
                return toolResult(result)
            } catch (error) {
                return toolResult({
                    success: false,
                    nodeType,
                    error: error?.message || String(error),
                    code: error?.code || 'EXECUTION_FAILED',
                })
            }
        }
    )

    return server
}
