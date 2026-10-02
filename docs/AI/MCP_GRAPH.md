# Building nodegraph automations over MCP

This guide teaches AI agents to create neat, working automations on the
netsocket canvas through the MCP tools. The tool descriptions in
`server/mcp/server.mjs` are the source of truth; this document adds worked
examples and the reasoning behind each step.

## The loop

```
get_graph → list_nodes/get_node_info per step → apply_graph_edits (dryRun, then commit)
→ align_nodes → get_canvas → execute_graph_node → get_logs → fix → repeat
```

1. **Read first.** `get_graph` shows node ids, types, positions, port names,
   links, groups, and a `rev`. Empty graph? You are starting fresh.
2. **Learn each node.** `get_node_info` for every new type: required inputs,
   port names/types, output `mcpKey` names, defaults. Never guess port names.
3. **Think through dataflow.** Triggers/entries on the left, data flowing
   left → right, one pipeline stage per row, ~240px horizontal / ~160px
   vertical spacing. Decide the full chain before placing anything.
4. **Batch the build.** One `apply_graph_edits` call: `add` ops with your own
   short ids (`"src"`, `"parse"`), then `connect` ops referencing them, then
   an `align` op. Pass `baseRev` from `get_graph`; `dryRun: true` first for
   complex batches.
5. **Tidy.** Reroutes at every bend, `align_nodes` per row, one `add_group`
   per subsystem.
6. **Look.** `get_canvas` (`png` when WebMCP is configured, else `svg`).
7. **Test.** `execute_graph_node` on the entry node (a `Triggers/Button`
   fans out its whole chain), then `get_logs` for wider context.

## Worked example 1: Button → Print hello-world

```json
{ "tool": "apply_graph_edits", "args": {
  "baseRev": 0,
  "ops": [
    { "op": "add", "id": "go", "nodeType": "Triggers/Button", "pos": [80, 80], "properties": { "Name": "Run demo" } },
    { "op": "add", "id": "say", "nodeType": "Debugging/Print", "pos": [400, 80], "properties": { "Text": "hello world" } },
    { "op": "connect", "originId": "go", "originSlot": 0, "targetId": "say", "targetSlot": 0 },
    { "op": "align", "ids": ["go", "say"], "axis": "center-y" }
  ]
}}
```

Then `execute_graph_node {"id": "<go uuid>"}` (use the real id from the
apply result when you omit custom ids) and confirm the `[DebugPrint]` line
via the returned `logLines` or `get_logs`.

## Worked example 2: HTTP → JSON → variable (with Reroute)

```json
{ "tool": "apply_graph_edits", "args": { "ops": [
  { "op": "add", "id": "go", "nodeType": "Triggers/Button", "pos": [80, 80] },
  { "op": "add", "id": "get", "nodeType": "Web/GET Request", "pos": [360, 80] },
  { "op": "add", "id": "bend", "nodeType": "Reroute", "pos": [640, 80] },
  { "op": "add", "id": "pick", "nodeType": "JSON/Get Object Value", "pos": [760, 80] },
  { "op": "add", "id": "save", "nodeType": "Variables/Set Variable", "pos": [1040, 80] },
  { "op": "connect", "originId": "go", "originSlot": 0, "targetId": "get", "targetSlot": 0 },
  { "op": "connect", "originId": "get", "originSlot": "Response", "targetId": "pick", "targetSlot": "JSON" },
  { "op": "align", "ids": ["go", "get", "bend", "pick", "save"], "axis": "center-y" }
]}}
```

Port names (`Response`, `JSON`, …) come from `get_node_info` — the names
above are illustrative; always verify. The `Reroute` between `get` and `pick`
keeps the long run straight and gives later branches a clean tap point.

## Data vs event wires

- **Data** outputs → data inputs (typed: `number`, `string`, `JSON`, …).
  `*` (Reroute) adapts to either side.
- **Event** outputs (triggers like `Triggers/Button`) → event inputs only.
- A `TYPE_MISMATCH` error names both sides: insert a converter node
  (`JSON/*`, `String/*`, …) instead of forcing the connection.

## Standalone vs on-graph execution

- `execute_node` runs one node with no graph (good for probing: OTP codes,
  single HTTP calls). Event ports are ignored there.
- `execute_graph_node` runs a node **in place**: upstream linked values
  resolve, downstream chains fire, link values update on the canvas.
  Pass `inputs` to override; omit to test the real wiring.

## Safety nets

- Every mutation returns `rev`. If `apply_graph_edits` reports `STALE_REV`,
  re-run `get_graph` — a human (or another agent) edited the canvas.
- `graph_undo` / `graph_redo` revert whole MCP steps. `EXTERNAL_CHANGE`
  means the canvas moved under you; `force: true` overrides.
- `get_logs` (`level: info|warn|error`) and `set_setting` for the settings
  menu. Secrets read back as `***` — that is expected, not an error.

## Screenshots

`get_canvas` returns `png` when the **WebMCP URL + API Key** settings are
configured (Dashboard → Preferences → MCP, or `set_setting`
`webmcp.url` / `webmcp.apiKey`). Netsocket pushes a preview into webmcp's
headless browser, so webmcp needs no access to your netsocket instance.
Without them you get an `svg` schematic plus `pngUnavailable` — still good
enough to check layout.
