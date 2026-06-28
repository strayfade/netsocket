import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const toolResult = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
})

export function createNetsocketMcpServer(deps) {
    const {
        listNodesForMcp,
        getNodeInfo,
        executeNode,
    } = deps

    const server = new McpServer(
        { name: 'netsocket', version: '1.0.0' },
        {
            instructions: [
                'Netsocket exposes automation nodes that can run without a canvas graph.',
                'Typical workflow: list_nodes with a query → get_node_info → execute_node, then pass prior outputs into the next execute_node call.',
                'Always call get_node_info before execute_node on a new node type. It returns callingGuide with required/optional inputs, output mcpKey names, type/structure notes, and an example payload.',
                'Node types use full paths, for example "Math/Add" or "Smart Home/Philips Hue/Lights/Get All Lights".',
                'Provide input values in execute_node.inputs keyed by input name. Match each value to the port type and structure documented on inputs[].structure.',
                'Use execute_node.properties only for node settings listed under properties, not for inputs that already have their own port.',
                'Event ports are graph-only; omit them from execute_node.inputs. Read results from execute_node.outputs (named by mcpKey) or execute_node.outputSlots.',
                'When multiple nodes can fulfill a task, prefer nodes marked mcpPreferred in list_nodes or get_node_info results.',
            ].join(' '),
        }
    )

    server.registerTool(
        'list_nodes',
        {
            title: 'List Netsocket Nodes',
            description: 'Search or list available node types with name and description. Prefer passing a query with keywords from the user request.',
            inputSchema: z.object({
                query: z.string().optional().describe('Keywords to find relevant nodes, e.g. "philips hue get all lights"'),
                category: z.string().optional().describe('Optional category filter, e.g. "Math" or "Smart Home"'),
            }),
        },
        async ({ category, query }) => toolResult(listNodesForMcp({ category, query }))
    )

    server.registerTool(
        'get_node_info',
        {
            title: 'Get Node Info',
            description: 'Get full metadata for a node type: callingGuide (required inputs, output keys/types/structures), enriched port metadata, properties, defaults, and example usage.',
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
            description: 'Run a single node with the provided inputs and optional properties. Call get_node_info first to learn required inputs, value types/structures, and output mcpKey names.',
            inputSchema: z.object({
                nodeType: z.string().describe('Node type in Category/Name format'),
                inputs: z.record(z.string(), z.unknown()).optional().describe('Input values keyed by input port name; types must match get_node_info.inputs[].type and structure guidance'),
                properties: z.record(z.string(), z.unknown()).optional().describe('Node property overrides keyed by property name (only for settings not already declared as inputs)'),
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
