# Netsocket Node Authoring Guide

This guide explains how to create new nodes for Netsocket based on existing implementations in `server/nodes` and the runtime behavior in `server/manager`.

It is written for both human contributors and AI agents.

## What a node is

Each node module is a CommonJS file that exports:

- `NodeDefinition`: a class that describes UI inputs/outputs/properties.
- `NodeFunction`: async runtime logic executed by the server.

Typical shape:

```js
class NodeDefinition {
  constructor() {
    this.addInput("A", "number");
    this.addInput("B", "number");
    this.addOutput("", "number");
  }
}
NodeDefinition.prototype.title = "Math/Add";

const NodeFunction = async (node, params, behaviors) => {
  await behaviors.populateNextNodeLinks([/* output values in output order */]);
  return true;
};

module.exports = { NodeDefinition, NodeFunction };
```

## Where nodes are discovered and executed

- Node import/registration: `server/manager/nodeImporter.js`
- Execution engine: `server/manager/execute.js`
- Frontend node construction helper: `frontend/public/createNode.js`

Important implications:

- `NodeDefinition.prototype.title` is the runtime key. Keep it stable.
- Constructor code is reconstructed from `NodeDefinition.prototype.constructor.toString()`, so keep constructor straightforward.
- Output propagation uses output index order. `populateNextNodeLinks([v0, v1, ...])` maps by declared outputs.

## File placement and naming

1. Put the file under the relevant category in `server/nodes` (for example `math/add.js`, `flowControl/if.js`, `triggers/myTrigger.js`).
2. Use a title in `Category/Name` format (for example `Math/Add`, `Flow Control/If`).
3. Prefer one node per file.

## NodeDefinition rules

Inside `NodeDefinition.constructor()`:

- Declare inputs with `this.addInput(name, type)`.
- Declare outputs with `this.addOutput(name, type)`.
- Add editable defaults with `this.addProperty(name, defaultValue)` when input fallback is desired.
- For fixed-choice string parameters, use `this.addEnumProperty(name, defaultValue, valuesArray)` so the editor shows a combo box instead of free text.
- For event ports, use `LiteGraph.EVENT`.

Enum property example:

```js
this.addInput("Mode", "string");
this.addEnumProperty("Mode", "Boolean", ["Boolean", "Variable", "HTTP"]);
```

The importer converts enum properties into LiteGraph combo widgets in the node parameters panel.

Common prototype metadata used by the frontend:

- `title` (required)
- `color` (see [Node colors](#node-colors))
- `icon`
- `bigText`
- `title_mode`
- `collapsible`

## Node colors

Set the node header color with a named palette key:

```js
NodeDefinition.prototype.color = "green";
```

At registration time, `frontend/public/createNode.js` maps that key through `LGraphCanvas.node_colors` in `frontend/public/litegraph.js`. If the name is missing or unknown, the node keeps LiteGraph's default styling.

### Valid palette keys

Use only these established keys (defined in `LGraphCanvas.node_colors`):

| Key | Typical use |
| --- | --- |
| `green` | Pure data transforms (math, logic, string, JSON, hash, encoding, constants) |
| `white` | Flow control and smart-home / device integration |
| `yellow` | Time and date nodes |
| `black` | Triggers (graph entry points) |
| `blue` | External I/O, side effects, AI, and debugging |
| `cyan` | Authentication |
| `red` | Reserved; not used by established nodes (auth uses `cyan`) |
| `purple` | Available in the palette but unused by established nodes |

Do not invent new names such as `orange` or `gray` — they are ignored by the frontend and the node will not get the intended color.

### Color by category

These patterns come from long-standing nodes in `server/nodes` (recently added nodes were excluded because they may not follow conventions yet):

| Category / folder | Color | Notes |
| --- | --- | --- |
| `math/`, `logic/`, `string/`, `json/`, `hash/`, `encoding/`, `constants/` | `green` | Value-in, value-out transforms |
| `flowControl/` | `white` | Branching, loops, delays, sequencing |
| `time/` | `yellow` | Timestamps, date parts, formatting |
| `triggers/` | `black` | Webhooks, cron, buttons, external events |
| `web/`, `languageProcessing/`, `debugging/` | `blue` | HTTP, LLM calls, print/run-js helpers |
| `authentication/` | `cyan` | OTP, account lookup |
| `smartHome/` | `white` | Device queries and commands (Hue, Netsocket, etc.) |

### Pure vs side-effect coloring

Color usually reflects **what the node does**, not only whether it has event ports:

- **Pure transforms → `green`**. Most nodes with only data inputs/outputs use green, including JSON mutators like `JSON/Push Array Item` and `JSON/Set Array Item` even though they accept an event input to run in sequence.
- **Flow orchestration → `white`**. Nodes whose main job is controlling execution order or device state (If, For, Delay, Hue set-state, etc.).
- **Side effects / external systems → `blue`**. Network calls, LLM inference, arbitrary JS execution, debug logging, and writes to shared runtime state. Example: `Variables/Get Variable` is `green` (read), but `Variables/Set Variable` is `blue` (write + event flow).
- **Graph sources → `black`**. Triggers never sit in the middle of a value chain; they start flows.
- **Time → `yellow`**. All nodes under `time/` use yellow consistently, including simple getters like `Time/Get Current Timestamp`.

When adding a node, match the color of similar established nodes in the same category. If a node spans roles (for example, a JSON transform that also sends email), prefer the color that matches the primary user-facing purpose.

Example event node definition:

```js
class NodeDefinition {
  constructor() {
    this.addInput("", LiteGraph.EVENT);
    this.addInput("Condition", "boolean");
    this.addProperty("Condition", "false");
    this.addOutput("True", LiteGraph.EVENT);
    this.addOutput("False", LiteGraph.EVENT);
  }
}
NodeDefinition.prototype.title = "Flow Control/If";
```

## NodeFunction contract

`NodeFunction` receives:

- `node`: current node properties object passed by runtime.
- `params`: resolved input values for this execution.
- `behaviors`: helper functions:
  - `populateNextNodeLinks(valuesArray)`
  - `getOutputNodeGroups()`
  - `triggerNodeGroup(nodesArray)`

Use this function signature:

```js
const NodeFunction = async (node, params, behaviors) => {
  // compute values from params
  // populate outputs in order
  // optionally trigger event outputs
  return true;
};
```

## Input resolution and fallback behavior

From `execute.js`, input values are resolved in this order:

1. If the input is linked, value comes from upstream link state.
2. If not linked, runtime attempts fallback from `node.properties[inputName]`.
3. Otherwise value is `null`.

This means that if a node needs to have a default value, the Property should be added to the node design.

### Property fallback caveat

Current runtime checks fallback with a truthy test (`if (nodeToTrigger.properties[i.name])`), so falsy defaults (`false`, `0`, empty string) can be skipped. When writing nodes, explicitly handle `null` and missing values safely.

## Event vs value output patterns

There are two common patterns:

1. Pure/value nodes (no event ports): only call `populateNextNodeLinks`.
2. Event nodes: usually:
   - set data outputs with `populateNextNodeLinks`
   - trigger the chosen event branch via `triggerNodeGroup(getOutputNodeGroups()[idx])`

Example event flow:

```js
await behaviors.populateNextNodeLinks([null, method, path, headers]);
await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0]);
```

Use `null` placeholders for non-value event output slots when needed so value outputs stay aligned.

## Type parsing best practices

Most nodes import parsers from `server/utils/inputParser`:

- `number(...)`
- `string(...)`
- `bool(...)`
- `json(...)`

Recommended:

- Parse at boundaries (inputs, API payloads, env/settings values).
- Do not rely on implicit JS coercion.
- Emit output types matching the declared output type.

## Error handling best practices

- Wrap external I/O and parsing in `try/catch`.
- Log with `log(..., logColors.Error)` when useful.
- Return `false` for failed execution paths where appropriate.
- Keep side effects (API calls, device control, writes) explicit and guarded.

## Node preferences/settings

If a node needs user configuration or secrets, register settings at module load using:

`require('../../manager/nodePreferencesRegistry').addPref(...)`

Used by trigger and integration nodes (for example webhook secret keys, API credentials).

## Trigger node guidance

Trigger nodes are special because external pollers/handlers locate nodes by exact `type` string:

- webhook: `Triggers/Webhook`
- GitHub webhook: `Triggers/Github Webhook`
- command palette: `Triggers/Command Palette`
- OTP, calendar, email triggers follow the same pattern

Do not rename released trigger titles casually. It can break dispatch matching.

## Known edge cases in current codebase (read before copying patterns)

Existing nodes are not perfectly consistent. Avoid inheriting these bugs:

- Some nodes mismatch output order and `populateNextNodeLinks(...)` indexes (especially when event output is index 0).
- `variables/setVariable.js` writes only one output value while defining event + value outputs.
- Some web nodes reference `io.input.*` instead of `params.*`.
- Some JSON nodes overwrite computed outputs with empty arrays after mutation.
- `flowControl/sequence.js` currently triggers one branch twice.
- `string/equals.js` declares boolean output but emits string values.

When creating new nodes, follow runtime contract, not accidental behavior in buggy nodes.

## Minimal templates

### Pure transform node

```js
const { number } = require('../../utils/inputParser');

class NodeDefinition {
  constructor() {
    this.addInput("A", "number");
    this.addInput("B", "number");
    this.addOutput("Result", "number");
  }
}
NodeDefinition.prototype.title = "Math/My Op";
NodeDefinition.prototype.color = "green";

const NodeFunction = async (node, params, behaviors) => {
  const result = number(params.A) + number(params.B);
  await behaviors.populateNextNodeLinks([result]);
  return true;
};

module.exports = { NodeDefinition, NodeFunction };
```

### Event-driven node

```js
const { string } = require('../../utils/inputParser');

class NodeDefinition {
  constructor() {
    this.addInput("", LiteGraph.EVENT);
    this.addInput("Message", "string");
    this.addProperty("Message", "");
    this.addOutput("", LiteGraph.EVENT);
    this.addOutput("Message", "string");
  }
}
NodeDefinition.prototype.title = "Debug/My Event Node";

const NodeFunction = async (node, params, behaviors) => {
  const message = string(params.Message);
  await behaviors.populateNextNodeLinks([null, message]);
  await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || []);
  return true;
};

module.exports = { NodeDefinition, NodeFunction };
```

## Authoring workflow

1. Pick category and file path in `server/nodes`.
2. Implement `NodeDefinition` (inputs, outputs, properties, metadata).
3. Implement async `NodeFunction` with robust parsing and error handling.
4. Ensure output array indexes exactly match declared outputs.
5. For event nodes, trigger the intended output group index.
6. If needed, register node preferences via `nodePreferencesRegistry`.
7. Run the app, add node in editor, and smoke-test both linked and unlinked inputs.
8. Validate error paths (bad JSON, network failures, missing settings).

## Manual test checklist (required)

- [ ] Node appears in editor category and can be instantiated.
- [ ] `title` is correct and stable.
- [ ] Unlinked input behavior is correct (property fallback or explicit default).
- [ ] Linked input overrides fallback correctly.
- [ ] Output values are in the right output slots.
- [ ] Event outputs trigger only intended branches.
- [ ] Error paths do not crash execution loop.
- [ ] External integrations fail gracefully when config is missing.

## AI agent checklist before submitting changes

- [ ] Exports are exactly `module.exports = { NodeDefinition, NodeFunction }`.
- [ ] `NodeFunction` is async and uses `params` + `behaviors`.
- [ ] Output array alignment reviewed against output declaration order.
- [ ] Trigger nodes use exact, intentional title strings.
- [ ] No copy-pasted references to undefined variables (`io`, missing imports, etc.).
- [ ] Tested at least one success path and one failure path in a real graph.

