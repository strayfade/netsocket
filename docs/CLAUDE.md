# CLAUDE.md

This document is a quick‑start guide for using Claude Code (or any similar AI harness) to work on the **Netsocket** repository.  
It covers how to interact with the AI, how to structure code, how to run tests, how to keep documentation up‑to‑date, and how to use the existing utilities and helpers that Netsocket ships with.

> **NOTE** – All file paths below are relative to the repository root (`C:\Users\Noah\Documents\GitHub\netsocket`).  
> When you see a path like `server/nodes/math/add.js`, the absolute path is  
> `C:\Users\Noah\Documents\GitHub\netsocket\server\nodes\math\add.js`.

---

## 1. Agent Interaction Patterns

| Step | What the AI does | How to phrase the request |
|------|------------------|---------------------------|
| **Read a file** | `Read` tool | `Read the file at server/nodes/math/add.js` |
| **Search for a pattern** | `Grep` tool | `Grep for "populateNextNodeLinks" in server/nodes/**/*.js` |
| **Create or modify a file** | `Write` or `Edit` tool (after a `Read`) | `Edit server/nodes/math/add.js: add a new output called "Sum"` |
| **Run a command** | `bash` tool | `bash: command="npm test"` |
| **Ask for clarification** | `question` tool | `question: "Do you want to add a test for the new node?"` |
| **Fetch external docs** | `webfetch` tool | `webfetch: url="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number"` |

**Typical workflow**

1. **Ask the AI** to read a file or search for a pattern.  
2. **Review the snippet** the AI returns.  
3. **Request a change** (add code, modify logic, add tests).  
4. **Run tests** (`npm test`) to verify.  
5. **Commit** the changes (use `git add`, `git commit`, `git push`).  
6. **Open a PR** and let the CI run.

---

## 2. Prompt Engineering Guidelines

| Guideline | Why it matters | Example prompt |
|-----------|----------------|----------------|
| **Be explicit about the target file** | The AI can read many files; specifying the path avoids accidental edits. | `Edit server/nodes/math/add.js: add a new output called "Sum"` |
| **Include the exact code you want to add** | The AI will copy the snippet verbatim, reducing syntax errors. | `Add the following code block to the end of server/nodes/math/add.js:`<br>`this.addOutput("Sum", "number");` |
| **Mention the surrounding context** | Helps the AI place the change correctly. | `In the constructor of NodeDefinition, after the existing outputs, insert the new output.` |
| **Ask for a test** | Tests are mandatory for server‑side changes. | `Create a new test file tests/newNodes.test.js that verifies the Sum output.` |
| **Request documentation updates** | Keeps AI.md, NODES.md, and README in sync. | `Add a section to AI.md describing how to add a new math node.` |
| **Use short, focused requests** | Avoids confusion and keeps the AI's output manageable. | `Show me the current implementation of NodeFunction in server/nodes/math/add.js.` |
| **Specify the style** | Netsocket uses CommonJS, semicolons, and a specific indentation style. | `Write the new NodeFunction using async/await and CommonJS syntax.` |

---

## 3. Code Structure Templates

### 3.1 New Node (CommonJS)

```js
// server/nodes/math/add.js
const { number } = require('../../utils/inputParser');

class NodeDefinition {
  constructor() {
    this.addInput('A', 'number');
    this.addInput('B', 'number');
    this.addOutput('Result', 'number');
  }
}
NodeDefinition.prototype.title = 'Math/Add';
NodeDefinition.prototype.color = 'green';

const NodeFunction = async (node, params, behaviors) => {
  const a = number(params.A);
  const b = number(params.B);
  const result = a + b;
  await behaviors.populateNextNodeLinks([result]);
  return true;
};

module.exports = { NodeDefinition, NodeFunction };
```

### 3.2 Event‑Driven Node

```js
// server/nodes/debug/print.js
const { string } = require('../../utils/inputParser');

class NodeDefinition {
  constructor() {
    this.addInput('', LiteGraph.EVENT);
    this.addInput('Text', 'string');
    this.addOutput('', LiteGraph.EVENT);
    this.addOutput('Text', 'string');
  }
}
NodeDefinition.prototype.title = 'Debug/Print';
NodeDefinition.prototype.color = 'blue';

const NodeFunction = async (node, params, behaviors) => {
  const text = string(params.Text);
  console.log(text);
  await behaviors.populateNextNodeLinks([null, text]);
  await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[0] || []);
  return true;
};

module.exports = { NodeDefinition, NodeFunction };
```

### 3.3 Test Skeleton

```js
// tests/newNodes.test.js
'use strict';
const assert = require('node:assert/strict');
const { NodeFunction } = require('../server/nodes/math/add.js');

test('Math/Add returns correct sum', async () => {
  const node = {}; // dummy node object
  const params = { A: 2, B: 3 };
  const behaviors = {
    populateNextNodeLinks: async (arr) => { node.output = arr[0]; },
    getOutputNodeGroups: () => [],
    triggerNodeGroup: () => {}
  };
  const result = await NodeFunction(node, params, behaviors);
  assert.strictEqual(result, true);
  assert.strictEqual(node.output, 5);
});
```

---

## 4. Testing Workflow Integration

1. **Add tests** for every new or changed server‑side behavior.  
2. **Run locally**: `npm test` (or `npm run test:watch` for continuous feedback).  
3. **Check CI**: GitHub Actions (`.github/workflows/test.yml`) runs tests on Node 20.x and 22.x.  
4. **Review coverage**: If a new node has no tests, add at least one success and one failure path.  
5. **Commit**: `git add tests/newNodes.test.js` → `git commit -m "Add tests for Math/Add node"` → `git push`.  
6. **Open PR**: `gh pr create --fill`.  
7. **CI will run**; once all checks pass, merge.

---

## 5. Documentation Generation Best Practices

| Task | Tool | How to do it |
|------|------|--------------|
| **Update AI.md** | Manual edit | Add a new section "Adding a Math Node" with the code snippet from 3.1. |
| **Update NODES.md** | Manual edit | Add a new entry under "Pure transform node" with the same snippet. |
| **Generate API docs** | `jsdoc` (if installed) | `npx jsdoc -c jsdoc.json` – not currently used, but can be added. |
| **Keep README** | Manual edit | Add a "Node Authoring" subsection referencing AI.md and NODES.md. |
| **Lint docs** | `markdownlint` (if installed) | `npx markdownlint README.md AI.md NODES.md` |

**Tip** – When the AI writes documentation, always ask it to format the snippet as a fenced code block and to reference the correct file paths.

---

## 6. Common Commands & Shortcuts for AI Agents

| Command | What it does | Shortcut |
|---------|--------------|----------|
| `npm start` | Run the server in development mode | `npm start` |
| `npm run dev` | Same as `npm start` (keeps the same entry point) | `npm run dev` |
| `npm run dev:noauth` | Start server with `--skip-auth` (dev only) | `npm run dev:noauth` |
| `npm test` | Run all tests once | `npm test` |
| `npm run test:watch` | Run tests in watch mode | `npm run test:watch` |
| `npm run reset-credentials` | Reset user credentials (dev helper) | `npm run reset-credentials` |
| `git add <file>` | Stage a file | `git add <file>` |
| `git commit -m "<msg>"` | Commit staged changes | `git commit -m "<msg>"` |
| `git push` | Push to remote | `git push` |
| `gh pr create --fill` | Create a PR with the current branch | `gh pr create --fill` |
| `gh pr review --approve` | Approve a PR | `gh pr review --approve` |
| `gh pr close` | Close a PR | `gh pr close` |

When using the AI, you can ask it to run any of these commands via the `bash` tool, e.g.:

```json
{
  "command": "npm test",
  "timeout": 120000
}
```

---

## 7. File Organization & Naming Conventions

| Directory | Purpose | Naming Rules |
|-----------|---------|--------------|
| `server/` | Backend logic | Files use `snake_case.js` or `PascalCase.js` for node modules. |
| `server/nodes/<category>/` | Node modules | One node per file. File name matches the node title's last segment (e.g., `add.js` for `Math/Add`). |
| `server/utils/` | Shared helpers | Exported functions are camelCase. |
| `server/manager/` | Runtime managers | Files are camelCase (e.g., `nodeImporter.js`). |
| `frontend/` | Static UI | `public/` contains JS modules; use UMD or CommonJS. |
| `tests/` | Automated tests | `.test.js` suffix, `use strict`; tests are grouped by feature. |
| `extensions/` | Optional integrations | Each extension has its own folder. |
| `data/` | Runtime data | Not committed; contains `users.json`, `state.json`, etc. |
| `docs/` | Optional generated docs | Not used currently. |

**Node title format** – `Category/Name` (e.g., `Math/Add`).  
**Color palette** – Use the keys defined in `frontend/public/litegraph.js` (`green`, `white`, `yellow`, `black`, `blue`, `cyan`). Do not invent new keys.

---

## 8. Leveraging Existing Utilities & Helpers

| Utility | Where it lives | Typical use |
|---------|----------------|-------------|
| `inputParser` | `server/utils/inputParser.js` | Parse and validate node inputs (`number`, `string`, `bool`, `json`). |
| `sessionAuth` | `server/utils/sessionAuth.js` | Protect routes and WebSocket connections. |
| `nodePreferencesRegistry` | `server/manager/nodePreferencesRegistry.js` | Register node‑specific settings or secrets. |
| `log` | `server/utils/log.js` | Structured logging (`log(message, logColors.Error)` etc.). |
| `graphUtils` | `server/utils/graphUtils.js` | Helpers for graph traversal and node linking. |
| `deviceAuth` | `server/utils/deviceAuth.js` | Device pairing and authentication. |
| `webResearchTools` | `server/utils/webResearchTools.js` | HTTP helpers for web scraping. |
| `mcpExecuteStandalone` | `server/manager/mcpExecuteStandalone.js` | Stand‑alone execution of a node graph. |

**How to use them in AI prompts**

- **Parsing inputs**: `Use inputParser.number(params.A)` to safely convert `params.A` to a number.  
- **Logging**: `log('Error: ...', logColors.Error)` – keep logs readable.  
- **Registering a secret**: `nodePreferencesRegistry.addPref('MyNode', 'apiKey', 'string', 'Your API key')`.  
- **Testing**: Mock `sessionAuth` by creating a fake `req`/`res` object.

---

## Quick Reference – AI Prompt Templates

| Scenario | Prompt |
|----------|--------|
| **Add a new node** | `Create a new node at server/nodes/math/subtract.js that subtracts B from A and outputs the result. Include NodeDefinition, NodeFunction, and export statement.` |
| **Add a test** | `Write a test file tests/subtract.test.js that verifies the subtract node returns the correct value and handles missing inputs.` |
| **Update documentation** | `Add a section to AI.md titled "Adding a Math Node" that explains the code snippet from 3.1 and references NODES.md.` |
| **Run tests** | `Run npm test and report any failures.` |
| **Lint a file** | `Run eslint on server/nodes/math/add.js and show any warnings.` |
| **Explain a function** | `Explain what NodeFunction does in server/nodes/debug/print.js, focusing on the use of behaviors.populateNextNodeLinks.` |

---

### Final Checklist Before Submitting

- [ ] All new server‑side changes have at least one passing test.  
- [ ] `npm test` passes locally and on CI.  
- [ ] Documentation (AI.md, NODES.md, README.md) is updated.  
- [ ] No secrets or credentials are committed.  
- [ ] Node titles are stable and match the existing naming convention.  
- [ ] Code follows the CommonJS style used throughout the repo.  
- [ ] Commit message follows the repo style (short, imperative).  

Happy coding with Claude!
