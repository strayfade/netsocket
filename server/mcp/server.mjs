import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

const toolResult = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
})

const posSchema = z.array(z.number()).describe('Canvas position [x, y] in pixels')
const propertiesSchema = z.record(z.string(), z.unknown()).describe('Node properties keyed by property name')

export function createNetsocketMcpServer(deps) {
    const {
        listNodesForMcp,
        getNodeInfo,
        executeNode,
        getGraph,
        addNode,
        updateNode,
        removeNode,
        connectNodes,
        disconnectLink,
        alignNodes,
        addGroup,
        updateGroup,
        removeGroup,
        applyGraphEdits,
        graphUndo,
        graphRedo,
        executeGraphNode,
        getLogs,
        listSettings,
        getSetting,
        setSetting,
        getCanvas,
    } = deps

    const server = new McpServer(
        { name: 'netsocket', version: '1.0.0' },
        {
            instructions: [
                'Netsocket exposes automation nodes that can run standalone or wired into a canvas nodegraph.',
                'Standalone workflow: list_nodes with a query → get_node_info → execute_node, then pass prior outputs into the next execute_node call.',
                'Always call get_node_info before execute_node on a new node type. It returns callingGuide with required/optional inputs, output mcpKey names, type/structure notes, and an example payload.',
                'Node types use full paths, for example "Math/Add" or "Smart Home/Philips Hue/Lights/Get All Lights".',
                'Provide input values in execute_node.inputs keyed by input name. Match each value to the port type and structure documented on inputs[].structure.',
                'Use execute_node.properties only for node settings listed under properties, not for inputs that already have their own port.',
                'Event ports are graph-only; omit them from execute_node.inputs. Read results from execute_node.outputs (named by mcpKey) or execute_node.outputSlots. Unnamed outputs use output_0; named outputs use their name (Code, Accounts, Value, Lights, Response).',
                'Many nodes serialize array/object outputs as JSON strings — e.g. Authentication/Get OTP Accounts Accounts="[\\"Discord:Strayfade\\"]", Smart Home Get All Lights Lights is a JSON array string, Web Response is often JSON-stringified. If typeof output is string, JSON.parse it when you need an element or before feeding a JSON node (most JSON nodes accept either form).',
                'Chaining example (OTP): 1) execute_node "Authentication/Get OTP Accounts" → JSON.parse(outputs.Accounts)[0] = "Discord:Strayfade" → 2) execute_node "Authentication/OTP" with inputs {"Account":"Discord:Strayfade"} → outputs.Code is the 6-digit code. Use "JSON/Get Array Item" (inputs Array=indexed array string, index=0) to extract one element between steps when needed.',
                'Chaining example (HTTP → JSON): 1) Web/GET Request → outputs.Response (often JSON string) → 2) JSON/Get Object Value with inputs {"JSON": outputs.Response, "Key Name":"fieldName"} → 3) Variables/Set Variable with inputs {"Name":"myVar","New Value": extractedValue}.',
                'When multiple nodes can fulfill a task, prefer nodes marked mcpPreferred in list_nodes or get_node_info results.',
                'Some nodes use output_0 for anonymous outputs (Math/Add). Always check callingGuide.executeNode.outputs[].mcpKey to know the exact key.',
                'GRAPH AUTHORING: start with get_graph to see the current layout (it returns node ids, types, positions, ports, links, groups, and a rev number).',
                'Prefer apply_graph_edits for building automations: one call with many ops (add nodes, connect them, align) applied atomically as a single undo step. Pass baseRev from your last get_graph so concurrent editor edits fail safe with STALE_REV instead of clobbering. Use dryRun:true first to validate a complex batch.',
                'Think through dataflow before placing: entry/trigger nodes on the left (e.g. Triggers/Button for manual testing), data flowing left → right, one row per pipeline stage, ~240px horizontal and ~160px vertical spacing. Call get_node_info for every new node type so required inputs, port names and output keys are correct before wiring.',
                'Connect with connect_nodes (or an apply_graph_edits connect op) using port NAMES, not guessed indexes — get_graph shows each port name and type. Event outputs (Triggers/Button) wire to event inputs; data outputs wire to data inputs. A TYPE_MISMATCH error names both sides: insert a converter node instead of forcing it.',
                'Keep graphs tidy with Reroute nodes (type "Reroute", size 24x24): route every bend/crossing through them, chain them along long runs, and never leave diagonal wires crossing unrelated nodes. Finish with align_nodes (left/right/top/bottom/center-x/center-y) and group related nodes with add_group (one group per subsystem, short title).',
                'update_node moves/resizes nodes and edits parameters (properties); unknown property names are reported back as unknownProperties — check get_node_info for the canonical names. remove_node drops a node and its incident links. disconnect_link removes a single wire.',
                'Every mutation returns a rev. graph_undo/graph_redo revert whole MCP steps; they refuse with EXTERNAL_CHANGE if a human edited the canvas since (re-run with force:true to override).',
                'TEST your automation: execute_graph_node runs any node by id on the live graph (Button nodes act as manual triggers fanning out their event chain) and returns fresh log lines plus downstream outputValues. Then call get_logs (lines, optional level info/warn/error) to inspect engine output. Fix, re-apply, re-run until green.',
                'See what you built with get_canvas: format png returns a real screenshot (requires WebMCP URL + API key in settings, else you get an SVG fallback with pngUnavailable), svg is a schematic preview, json is the raw layout.',
                'list_settings/get_setting/set_setting edit the settings menu. Secret values (tokens, passwords, API keys) read back masked as *** with a configured flag — set them with set_setting but never expect to read them back.',
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
            description: 'Get full metadata for a node type: callingGuide (required inputs, output keys/types/structures), enriched port metadata, properties, defaults, and example usage. Check outputs[].mcpKey — anonymous outputs use output_0; many array/object outputs arrive as JSON strings (see structure).',
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
            description: 'Run a single node with the provided inputs and optional properties. Call get_node_info first to learn required inputs, value types/structures, and output mcpKey names. Note: array/object outputs are often JSON-stringified strings — JSON.parse them before using as JSON inputs; most JSON nodes accept either form. Unnamed outputs use key output_0.',
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

    if (getGraph) {
        server.registerTool(
            'get_graph',
            {
                title: 'Read Nodegraph',
                description: 'Read the main nodegraph layout: node ids, types, positions, ports, links, and groups, plus a rev number for optimistic concurrency. Filter by ids, nodeTypes, or a query substring on the type. Paginated with limit/offset.',
                inputSchema: z.object({
                    ids: z.array(z.string()).optional().describe('Only return these node ids'),
                    nodeTypes: z.array(z.string()).optional().describe('Only return these exact node types, e.g. ["Math/Add"]'),
                    query: z.string().optional().describe('Substring filter on node type, e.g. "hue"'),
                    limit: z.number().optional().describe('Max nodes to return (default 200, max 1000)'),
                    offset: z.number().optional().describe('Node offset for pagination (default 0)'),
                }),
            },
            async (args) => toolResult(getGraph(args || {}))
        )
    }

    if (addNode) {
        server.registerTool(
            'add_node',
            {
                title: 'Add Graph Node',
                description: 'Place a node on the graph. Ports and default properties come from get_node_info metadata; override with properties. Position is [x, y] pixels — flow left→right with ~240px horizontal / ~160px vertical spacing. Returns the new node id for wiring.',
                inputSchema: z.object({
                    nodeType: z.string().describe('Node type in Category/Name format, e.g. "Math/Add". Use "Reroute" for tidy wire bends.'),
                    id: z.string().optional().describe('Optional unique id (needed to wire this node within one apply_graph_edits batch); a UUID is generated if omitted'),
                    pos: posSchema.optional().describe('Canvas position [x, y]'),
                    properties: propertiesSchema.optional().describe('Initial property values (also fills unconnected input defaults)'),
                    size: z.array(z.number()).optional().describe('Node size [w, h]; defaults to 180x60 (24x24 for Reroute)'),
                    mode: z.number().optional().describe('Execution mode passthrough (default 0)'),
                }),
            },
            async (args) => toolResult(addNode(args))
        )
    }

    if (updateNode) {
        server.registerTool(
            'update_node',
            {
                title: 'Update Graph Node',
                description: 'Move/resize a node (pos, size) or edit its parameters (properties merged). Unknown property names are reported as unknownProperties — verify with get_node_info.',
                inputSchema: z.object({
                    id: z.string().describe('Node id from get_graph'),
                    pos: posSchema.optional(),
                    size: z.array(z.number()).optional().describe('Node size [w, h]'),
                    properties: propertiesSchema.optional(),
                    mode: z.number().optional(),
                }),
            },
            async (args) => toolResult(updateNode(args))
        )
    }

    if (removeNode) {
        server.registerTool(
            'remove_node',
            {
                title: 'Remove Graph Node',
                description: 'Delete a node and its incident links. Reports dropped link ids.',
                inputSchema: z.object({
                    id: z.string().describe('Node id from get_graph'),
                }),
            },
            async (args) => toolResult(removeNode(args))
        )
    }

    if (connectNodes) {
        server.registerTool(
            'connect_nodes',
            {
                title: 'Connect Nodes',
                description: 'Create a link from an output port to an input port. Prefer port NAMES (shown in get_graph) over indexes. Event outputs wire to event inputs, data to data; "*" (Reroute) adapts to either side. Connecting to an occupied input replaces the old link (reported as replacedLinkId).',
                inputSchema: z.object({
                    originId: z.string().describe('Id of the upstream node'),
                    originSlot: z.union([z.string(), z.number()]).describe('Output port name or index'),
                    targetId: z.string().describe('Id of the downstream node'),
                    targetSlot: z.union([z.string(), z.number()]).describe('Input port name or index'),
                }),
            },
            async (args) => toolResult(connectNodes(args))
        )
    }

    if (disconnectLink) {
        server.registerTool(
            'disconnect_link',
            {
                title: 'Disconnect Link',
                description: 'Remove a single wire by link id (see get_graph links).',
                inputSchema: z.object({
                    linkId: z.string().describe('Link id from get_graph'),
                }),
            },
            async (args) => toolResult(disconnectLink(args))
        )
    }

    if (alignNodes) {
        server.registerTool(
            'align_nodes',
            {
                title: 'Align Nodes',
                description: 'Align 2+ nodes along an axis: left, right, top, bottom, center-x, center-y. Use after placing a pipeline row to keep the graph neat.',
                inputSchema: z.object({
                    ids: z.array(z.string()).describe('Node ids to align (min 2)'),
                    axis: z.enum(['left', 'right', 'top', 'bottom', 'center-x', 'center-y']),
                }),
            },
            async (args) => toolResult(alignNodes(args))
        )
    }

    if (addGroup) {
        server.registerTool(
            'add_group',
            {
                title: 'Add Node Group',
                description: 'Place a labeled group box behind related nodes (one group per subsystem). Groups are visual only.',
                inputSchema: z.object({
                    title: z.string().optional().describe('Group label'),
                    pos: posSchema.optional().describe('Top-left [x, y]'),
                    size: z.array(z.number()).optional().describe('Size [w, h] (min 140x80)'),
                    color: z.string().optional().describe('Group color, e.g. "#0ea5e9"'),
                }),
            },
            async (args) => toolResult(addGroup(args || {}))
        )
    }

    if (updateGroup) {
        server.registerTool(
            'update_group',
            {
                title: 'Update Node Group',
                description: 'Move, resize, rename, or recolor a group. Groups are listed with their index in get_graph.',
                inputSchema: z.object({
                    groupIndex: z.number().describe('Group index from get_graph'),
                    title: z.string().optional(),
                    pos: posSchema.optional(),
                    size: z.array(z.number()).optional(),
                    color: z.string().optional(),
                }),
            },
            async (args) => toolResult(updateGroup(args))
        )
    }

    if (removeGroup) {
        server.registerTool(
            'remove_group',
            {
                title: 'Remove Node Group',
                description: 'Delete a group box by index. Nodes inside are kept.',
                inputSchema: z.object({
                    groupIndex: z.number().describe('Group index from get_graph'),
                }),
            },
            async (args) => toolResult(removeGroup(args))
        )
    }

    if (applyGraphEdits) {
        server.registerTool(
            'apply_graph_edits',
            {
                title: 'Apply Graph Edits (Batch)',
                description: 'Apply many ops atomically as one undo step — the recommended way to build automations. Ops: add {id?,nodeType,pos,properties,size}, update {id,pos,size,properties,mode}, remove {id}, connect {originId,originSlot,targetId,targetSlot}, disconnect {linkId}, align {ids,axis}, add_group {title,pos,size,color}, update_group {groupIndex,...}, remove_group {groupIndex}. To wire nodes within one batch, give add ops your own unique id (e.g. "src") and reference it in later connect ops. Pass baseRev from get_graph for safe concurrency; dryRun:true validates without committing.',
                inputSchema: z.object({
                    ops: z.array(z.record(z.string(), z.unknown())).describe('Edit operations in order (max 50)'),
                    baseRev: z.number().optional().describe('Expected graph rev from get_graph; fails with STALE_REV if the canvas changed since'),
                    dryRun: z.boolean().optional().describe('Validate only, do not commit'),
                }),
            },
            async (args) => toolResult(applyGraphEdits(args))
        )
    }

    if (graphUndo) {
        server.registerTool(
            'graph_undo',
            {
                title: 'Undo Graph Edit',
                description: 'Undo the last MCP graph change. Refuses with EXTERNAL_CHANGE if a human edited the canvas since — pass force:true to override.',
                inputSchema: z.object({
                    force: z.boolean().optional(),
                }),
            },
            async (args) => toolResult(graphUndo(args || {}))
        )
    }

    if (graphRedo) {
        server.registerTool(
            'graph_redo',
            {
                title: 'Redo Graph Edit',
                description: 'Redo an undone MCP graph change. Same EXTERNAL_CHANGE guard as graph_undo.',
                inputSchema: z.object({
                    force: z.boolean().optional(),
                }),
            },
            async (args) => toolResult(graphRedo(args || {}))
        )
    }

    if (executeGraphNode) {
        server.registerTool(
            'execute_graph_node',
            {
                title: 'Execute Graph Node',
                description: 'Run a node by id on the live graph (Triggers/Button acts as a manual trigger for its chain) with optional input overrides. Returns fresh engine log lines plus downstream outputValues. Use get_logs for wider log context.',
                inputSchema: z.object({
                    id: z.string().describe('Node id from get_graph'),
                    inputs: z.record(z.string(), z.unknown()).optional().describe('Optional input overrides; omit to resolve from upstream links/properties'),
                }),
            },
            async (args) => toolResult(await executeGraphNode(args))
        )
    }

    if (getLogs) {
        server.registerTool(
            'get_logs',
            {
                title: 'Read Engine Logs',
                description: 'Read recent netsocket engine log lines (up to 200). Filter by level: info, warn, error.',
                inputSchema: z.object({
                    lines: z.number().optional().describe('Max lines to return (default 50, max 200)'),
                    level: z.string().optional().describe('info, warn, or error'),
                }),
            },
            async (args) => toolResult(getLogs(args || {}))
        )
    }

    if (listSettings) {
        server.registerTool(
            'list_settings',
            {
                title: 'List Settings',
                description: 'List settings-menu entries with current values. Secrets (tokens, passwords, API keys) read back masked as *** with a configured flag.',
                inputSchema: z.object({}),
            },
            async () => toolResult(listSettings())
        )
    }

    if (getSetting) {
        server.registerTool(
            'get_setting',
            {
                title: 'Get Setting',
                description: 'Read one settings-menu entry by id (see list_settings). Secret values are masked.',
                inputSchema: z.object({
                    name: z.string().describe('Setting id, e.g. "webmcp.url"'),
                }),
            },
            async (args) => toolResult(getSetting(args))
        )
    }

    if (setSetting) {
        server.registerTool(
            'set_setting',
            {
                title: 'Set Setting',
                description: 'Edit one settings-menu entry by id. Only registered settings can be set. Secrets are accepted but never echoed back.',
                inputSchema: z.object({
                    name: z.string().describe('Setting id, e.g. "webmcp.url"'),
                    value: z.string().describe('New value as a string'),
                }),
            },
            async (args) => toolResult(await setSetting(args))
        )
    }

    if (getCanvas) {
        server.registerTool(
            'get_canvas',
            {
                title: 'View Canvas',
                description: 'See the current graph: png returns a real screenshot (needs WebMCP URL + API key settings; otherwise you get an SVG fallback with pngUnavailable), svg is a schematic preview, json is the raw layout.',
                inputSchema: z.object({
                    format: z.enum(['png', 'svg', 'json']).optional().describe('Default png'),
                }),
            },
            async (args) => toolResult(await getCanvas(args || {}))
        )
    }

    return server
}
