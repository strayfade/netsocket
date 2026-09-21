# AI/AGENTS.md

## 1. Project Overview and Architecture

### What is Netsocket
Netsocket is a self-hosted home-automation hub and nodegraph runtime. The server (`server/`) executes graphs, serves the frontend (`frontend/`), and persists user data under `DATA_DIR` (default: `data/`). The primary UI is the Dashboard (`/dashboard`); the nodegraph editor lives under Automate (`/automate`); per-room touch surfaces live under Panels (`/panels`, `/panel/:id`).

### Architecture Overview
- **Backend**: Node.js (CommonJS), Express, WebSockets, native `node:test` runner
- **Frontend**: Static UI served from `frontend/`
- **Node System**: Nodes are discovered from `server/nodes/` and registered at startup
- **License**: GPLv3
- **Data Storage**: JSON files under `DATA_DIR` for persistence
- **Runtime**: Event-driven graph execution with in-memory state

### Key Components
| Component | Purpose | Location |
|-----------|---------|----------|
| `server/index.js` | HTTP/WebSocket entry, auth routes, trigger endpoints | Main entry |
| `server/manager/` | Graph execution, persistence, settings, node import | Core runtime |
| `server/nodes/` | Node modules (`NodeDefinition` + `NodeFunction`) | User nodes |
| `frontend/` | Static UI (`dashboard.html`, `editor.html`, `panels.html`, `index.html`, `public/`) | Web interface |
| `frontend/public/css/shell.css` | Shared Dashboard/Panels theme tokens and tab/card primitives | Hub styling |
| `frontend/public/js/shell.js` | Shared tab/session/toast logic (UMD, tested) | Hub logic |
| `server/manager/dashboardSummary.js` | Dashboard counts + automation list + runnable allowlist | Hub backend |
| `server/manager/widgetSchema.js` | Unified grid-widget schema, presets, validation, migration | Hub backend |
| `server/manager/panelStore.js` | Room panels: grid layouts, automation allowlists, device grants | Panels |
| `server/manager/panelApi.js` | Panel handlers (all session-gated) + device grant-discovery WS | Panels |
| `extensions/androidNotification` | Android companion app; Panel feature renders granted panels in a WebView | Panels |
| `server/manager/dashboardLayout.js` | Dashboard grid layout (v2 schema with legacy migration) | Hub backend |
| `server/utils/vars.js` | Variables: debounced persistence + change hooks | Hub backend |
| `frontend/public/js/widgets.js` | Shared grid-widget renderer (UMD, tested) | Hub frontend |
| `frontend/public/vendor/gridstack-*` | Vendored GridStack 13.3.0 (pinned; approved dep, upgrade deliberately) | Hub frontend |
| `tests/` | Automated tests | Testing |
| `extensions/` | Optional integrations (overlay, mirror, etc.) | Extras |

## 2. Agent-Specific Coding Guidelines

### Core Principles
1. **Minimal Scope**: Only change what the task requires. Match the style of the file you edit (quote style, semicolons, indentation)
2. **CommonJS Only**: In server code (`require` / `module.exports`). Avoid ES6 imports
3. **Reuse Existing Helpers**: Use `inputParser`, `sessionAuth`, `graphUtils`, `log` instead of duplicating logic
4. **Dependencies**: Avoid new npm packages unless necessary. Update `package.json` if added
5. **Logging**: Use `log(message, logColors.Error)` for errors; avoid logging sensitive values
6. **Comments**: Only where behavior is non-obvious. Prefer clear code over heavy documentation
7. **Do Not Edit Unrelated Files**: Avoid README marketing copy, unrelated nodes, drive-by refactors

### Node Creation Pattern
For new nodes, follow this exact structure:

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

### Testing Integration
1. Put files in `tests/` with `.test.js` suffix
2. Start test files with `'use strict';`
3. Prefer unit tests that import the module under test directly
4. Mock HTTP with lightweight `req`/`res` objects rather than spinning up the full server
5. Cover at least one **success path** and one **failure or edge path** per feature
6. Reset shared state in `beforeEach`/`afterEach` when tests mutate in-memory stores

## 3. Testing Requirements and Patterns

### What Needs Tests
- New or modified API routes (`server/index.js` and route handlers)
- Auth and session logic (`server/utils/sessionAuth.js`, login flows)
- Utilities, managers, and trigger pollers under `server/utils/` and `server/manager/`
- Node runtime logic when behavior is non-trivial (parsing, branching, external I/O, error paths)
- Security-sensitive code paths (authorization checks, secret validation, input sanitization)

### Unit Testing Best Practices
```js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { yourModule } = require('../server/utils/yourModule');

describe('YourModule tests', async () => {
  it('should handle success case', async () => {
    // Test success path
  });
  
  it('should handle error case', async () => {
    // Test failure/edge path
  });
});
```

### Test Registration
Add every new test file to the `test` and `test:watch` scripts in `package.json`:

```json
"test": "node --test --test-force-exit tests/....test.js ..."
```

### CI Configuration
- Tests run on Node 20.x and 22.x for pushes and PRs to `main` (`.github/workflows/test.yml`)
- Run `npm test` before finishing work
- Do not merge server features without corresponding tests unless explicitly waived

## 4. Security and Privacy Best Practices for AI Agents

### Authentication and Sessions
- Protected pages and APIs must go through `server/utils/sessionAuth.js`
  - `requireUserSession`, `canAccessPrivateApi`, `canAccessWithSessionOrIntegrationSecret`
- Session cookies must stay `httpOnly`, `sameSite: 'lax'`, and respect `COOKIE_SECURE=1` behind HTTPS
- Use `safeRedirectPath` / `resolveRedirectTarget` patterns for redirects
- Reject open redirects (`//`, absolute URLs, non-leading `/`)
- Compare secrets with timing-safe equality (`tokensEqual` / `integrationSecretMatches`)

### Authentication Patterns
```js
// Example authentication check
if (!canAccessPrivateApi(req, res)) {
  return res.sendStatus(401);
}

// Secure redirect example
const safeRedirect = safeRedirectPath(req.query.redirect);
```

### Secrets and Credentials Management
- Integration secrets belong in settings via `nodePreferencesRegistry.addPref(...)`
- Never commit `.env`, `data/`, `credentials.json`, tokens, or real secrets
- Never log passwords, session tokens, API keys, OAuth tokens, or webhook payloads
- When adding endpoints accepting secrets, require configured secrets and fail closed

### Input Validation and Execution Safety
- Parse untrusted input at boundaries with `server/utils/inputParser`
- Validate types explicitly (`typeof x === 'string'`) for request bodies and WebSocket messages
- Wrap external I/O in `try/catch`; return `false` from `NodeFunction` on failure
- **Critical**: Do not remove sandboxing or timeouts from `Debugging/Run Javascript` nodes
- Avoid `eval` outside existing node-import machinery in `nodeImporter.js`

### HTTP and Transport Hardening
- Preserve baseline headers from `securityHeaders` middleware
- WebSocket connections must validate a user session, legacy integration secret, or complete device pairing handshake
- Device approve/deny/remove APIs are session-authenticated only
- Device identity keys and server identity material live under `DATA_DIR`
- Keep JSON body limits intentional; do not raise limits without documented reason
- Prefer same-origin relative paths for frontend API calls

## 5. Node Development Patterns and Examples

### Node Definition Contract
Every node must export exactly:
```js
module.exports = { NodeDefinition, NodeFunction }
```

### NodeDefinition Rules
- One node per file under `server/nodes/<category>/`
- Set stable `NodeDefinition.prototype.title` in `Category/Name` format
- Keep `NodeDefinition` constructors simple (reconstructed from `constructor.toString()`)
- Add properties with `this.addProperty(name, defaultValue)` for editable defaults
- Use `this.addEnumProperty()` for fixed-choice string parameters

### NodeFunction Contract
```js
const NodeFunction = async (node, params, behaviors) => {
  // Compute values from params
  // Populate outputs in order
  // Optionally trigger event outputs
  return true;
};
```

### Event Node Pattern
```js
class NodeDefinition {
  constructor() {
    this.addInput("", LiteGraph.EVENT);
    this.addInput("Condition", "boolean");
    this.addProperty("Condition", "false");
    this.addOutput("", LiteGraph.EVENT);
    this.addOutput("True", LiteGraph.EVENT);
    this.addOutput("False", LiteGraph.EVENT);
  }
}
NodeDefinition.prototype.title = "Flow Control/If";

const NodeFunction = async (node, params, behaviors) => {
  const condition = params.Condition ?? node.properties.Condition;
  await behaviors.populateNextNodeLinks([null, condition]);
  await behaviors.triggerNodeGroup(behaviors.getOutputNodeGroups()[condition ? 0 : 1]);
  return true;
};
```

### Input Resolution Order
1. If the input is linked, value comes from upstream link state
2. If not linked, runtime attempts fallback from `node.properties[inputName]`
3. Otherwise value is `null`

### Color Guidelines
| Palette Key | Typical Use | Example Categories |
|-------------|-------------|--------------------|
| `green` | Pure data transforms | `math/`, `logic/`, `string/`, `json/` |
| `white` | Flow orchestration | `flowControl/`, `smartHome/` |
| `yellow` | Time and date | `time/` |
| `black` | Triggers | `triggers/` |
| `blue` | External I/O, side effects | `web/`, `languageProcessing/`, `debugging/` |
| `cyan` | Authentication | `authentication/` |

### Error Handling Best Practices
- Wrap external I/O and parsing in `try/catch`
- Log with `log(..., logColors.Error)` when useful
- Return `false` for failed execution paths
- Keep side effects explicit and guarded

## 6. Debugging and Troubleshooting Approaches

### Runtime Debugging
1. **Enable Debug Mode**: Use `npm run dev:noauth` for local development with auth skipped
2. **Check Logs**: All server activity is logged via `log()` function
3. **Browser DevTools**: Inspect network traffic in browser for API calls
4. **WebSocket Debugging**: Monitor WebSocket connections for real-time debugging

### Common Debugging Tools
- **Log Analysis**: Use `server/index.js` log stream for server events
- **Graph Execution**: Debug with `graphUtils` and `executeGraph` functions
- **Device Pairing**: Monitor device auth flow in `server/utils/deviceAuth.js`
- **Integration Debugging**: Check `server/utils/httpRequest.js` for external API calls

### Troubleshooting Workflow
1. **Start with Logs**: Check server logs for errors and warnings
2. **Validate Input**: Verify input parsing and validation
3. **Test Graph**: Smoke test in editor (linked and unlinked inputs)
4. **Check Security**: Ensure authentication and authorization are correct
5. **Review Dependencies**: Verify required environment variables and settings

### Node-Specific Debugging
For nodes, test:
- Node appears in editor category and can be instantiated
- `title` is correct and stable
- Unlinked input behavior is correct (property fallback)
- Linked input overrides fallback correctly
- Output values are in right output slots
- Event outputs trigger only intended branches
- Error paths don't crash execution loop

## 7. Integration Patterns for External Services

### Google Integration
```js
const { buildOAuthClient, getStoredTokens, mergeTokenSets } = require('./utils/googleAuth');

const oAuth2Client = buildOAuthClient(req);
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES
});
```

### Hue Integration
```js
const hueApi = require('./utils/hueApi');
await hueApi.setupHueApi();
```

### MCP (Model Context Protocol)
```js
const { runMcpAgent } = require('./utils/mcpAgent');

const result = await runMcpAgent({
  command,
  memoryKey,
  silent: true,
});
```

### Webhook Handling
```js
app.post('/v1/postNotification/:secret', async (req, res) => {
  const expectedSecret = settingsManager.getSetting('triggersNotification.secret');
  if (!expectedSecret || req.params.secret !== expectedSecret) {
    return res.sendStatus(403);
  }
  await onNewNotification(notificationContent);
  res.sendStatus(200);
});
```

### OAuth Flow
- Google OAuth: `/v1/google/auth/start` → `/v1/google/auth/callback`
- MCP API Token: `/v1/mcp/regenerate-token`
- Session Management: `/v1/session`, `/login`, `/logout`

## 8. Common Pitfalls to Avoid

### Development Pitfalls
1. **Input Order Mismatch**: Output array indexes must exactly match declared output order
2. **Event Output Misalignment**: Event outputs are often index 0, causing confusion
3. **Property Fallback Issues**: Falsy defaults (`false`, `0`, empty string) can be skipped
4. **Timing Issues**: Asynchronous operations must be properly awaited
5. **Circular Dependencies**: Import circular dependencies between modules

### Security Pitfalls
1. **Hardcoded Secrets**: Never hardcode secrets; use `nodePreferencesRegistry`
2. **Logging Sensitive Data**: Never log passwords, tokens, or credentials
3. **Weak Validation**: Always validate input types explicitly
4. **Open Redirects**: Always use `safeRedirectPath` for redirects
5. **Missing Auth**: Never skip authentication in production

### Testing Pitfalls
1. **Incomplete Coverage**: Always test both success and error paths
2. **State Contamination**: Reset shared state in `beforeEach`/`afterEach`
3. **Mock Over-Mocking**: Mock only what's necessary for isolated testing
4. **Environment Assumptions**: Don't assume environment variables exist

### Runtime Pitfalls
1. **Null Checks**: Always handle `null` values from unlinked inputs
2. **Error Handling**: Never let exceptions bubble up unhandled
3. **Memory Leaks**: Be careful with WebSocket connections and timers
4. **Race Conditions**: Consider async operation ordering

### Specific Buggy Patterns to Avoid
- **Variables/Set Variable**: Only writes one output value while defining event + value outputs
- **JSON nodes**: Overwrite computed outputs with empty arrays after mutation
- **FlowControl/Sequence**: Triggers one branch twice
- **String/Equals**: Declares boolean output but emits string values
- **Mismatched populateNextNodeLinks**: Indexes don't align with output declaration order

### Pre-Submission Checklist
Before considering work complete, verify:
- [ ] Server behavior changes have tests in `tests/` and are listed in `package.json`
- [ ] `npm test` passes
- [ ] Auth, secrets, and redirects handled safely
- [ ] New nodes follow NODES.md contract and stable titles
- [ ] Trigger/integration secrets use `nodePreferencesRegistry`
- [ ] Inputs parsed/validated; errors handled without crashing
- [ ] Change scope is minimal and matches existing conventions
- [ ] NODES.md updated only when node authoring rules change materially

### Final Review Process
1. Run `npm test` to ensure all tests pass
2. Perform security review for auth, secrets, and input validation
3. Manual testing in editor for all new/updated nodes
4. Verify documentation is updated if needed
5. Ensure no unrelated files were modified

This guide should serve as a comprehensive reference for AI agents working with this codebase, ensuring consistent, secure, and maintainable development practices.