## 1. Repository Structure

The repository is organized as follows:
```markdown
- `server/`: Contains server-side code (main logic, graph execution, web sockets, auth)
  - `index.js`: Entry point for HTTP/WebSocket server
  - `manager/`: Graph execution, persistence, node import
  - `nodes/`: Node modules (NodeDefinition + NodeFunction)
  - `utils/`: Shared helpers (auth, parsing, triggers)
- `frontend/`: Static UI components (editor.html, index.html)
- `tests/`: Automated tests (Node.js built-in test runner)
- `extensions/`: Optional integrations (overlays, mirrors)
- `NODES.md`: Node authoring reference
```

## 2. Development Setup

### Docker (Recommended for Production)
- **Install**: Pull from [Docker Hub](https://hub.docker.com/repository/docker/strayfade/netsocket/general)
- **Run**:
  ```bash
  docker run -e HOSTNAME=0.0.0.0 -e PORT=4675 -p 4675:4675 -e DATA_DIR=/netsocket/data -v netsocket-data:/netsocket/data strayfade/netsocket
  ```
- **Configuration**:
  - `DATA_DIR`: Persistent data directory (stored in `netsocket-data` volume)
  - `PORT`: Default 4675
  - `COMPOSE`: [docker-compose.yaml](https://github.com/strayfade/netsocket/blob/main/docker-compose.yaml) for managed setup

### Node.js (Development Only)
- **Install**:
  ```bash
  git clone https://github.com/strayfade/netsocket
  cd netsocket
  npm install
  ```
- **Run**:
  ```bash
  npm start
  ```
- **Security Note**: Use Docker for production; Node.js development lacks isolation and requires caution.

## 3. Nodegraph Editor Workflow

### Basic Interaction
1. **Add Nodes**:
   - Right-click canvas → "Add Node" → Select trigger or utility node
   - Example: Add `Button` trigger → Connect to `Print` node to output text

2. **Editing Nodes**:
   - **Trigger Nodes**: Click to open Parameters panel (e.g., Button node's "text" field)
   - **Debugging Nodes**: Use parameters to simulate output (e.g., `Print` node's "Text" field)

3. **Connections**:
   - Drag from `Execute` output of one node to `Execute` input of another
   - Direct connections override parameter values

4. **Controls**:
   - `Shift + Click`: Select multiple nodes
   - `Shift + Drag`: Move multiple nodes
   - `Alt + Drag`: Clone a node
   - `Ctrl + C/V`: Copy/Paste nodes

## 4. Testing Requirements

- **Scope**:
  - All server-side changes (API routes, auth, node logic) require tests
  - UI changes need tests if they introduce testable logic (e.g., `loginLogic.js`)

- **Practices**:
  - Use Node.js built-in tests (`require('node:test')`)
  - Write unit tests for modules (e.g., `tests/sessionAuth.test.js`)
  - Cover at least one **success path** and one **failure or edge path** per feature
  - Reset shared state in `beforeEach`/`afterEach`

- **Package.json Integration**:
  ```json
  "test": "node --test --test-force-exit tests/loginLogic.test.js tests/sessionAuth.test.js tests/saveUsers.test.js tests/saveStateRestore.test.js tests/loginPage.dom.test.js tests/indexHtml.test.js tests/webResearchTools.test.js tests/quickWebSearch.test.js tests/newNodes.test.js tests/missingNodes.test.js tests/mcpExecuteStandalone.test.js tests/mcpAgent.test.js tests/killProcessOnPort.test.js tests/hueNodes.test.js tests/forEach.test.js tests/alertDeviceRouting.test.js tests/authenticatorImport.test.js tests/deviceAuth.test.js"
  ```
  Run `npm test` locally. CI tests on Node 20.x/22.x for main branch.

## 5. Security Considerations

### Authentication
- Use `sessionAuth.js` for protected routes/APIs
- Passwords: BCrypt hashes, min length 8
- Session cookies: `httpOnly`, `sameSite: 'lax'`, and respect `COOKIE_SECURE=1` behind HTTPS

### Secrets & Credentials
- Integration secrets belong in settings via `nodePreferencesRegistry.addPref(...)`
- Never hardcode secrets or log sensitive data
- Never commit `.env`, `data/`, `credentials.json`, tokens, or real secrets

### Input Validation & Execution Safety
- Parse untrusted input at boundaries with `server/utils/inputParser`
- Validate types explicitly (`typeof x === 'string'`) for request bodies and WebSocket messages
- Wrap external I/O in `try/catch`; return `false` from `NodeFunction` on failure

### Transport Hardening
- WebSockets require session/auth or device pairing
- Device APIs (approve/deny) require session auth

## 6. Node Authoring Rules (from NODES.md)

- **One node per file** under `server/nodes/<category>/`
- Export: `module.exports = { NodeDefinition, NodeFunction }`
- Use stable titles (e.g., `Button`, `Print`) in `NodeDefinition`
- Keep `NodeDefinition` constructors simple (reconstructed from `constructor.toString()`)
- Add properties with `this.addProperty(name, defaultValue)` for editable defaults
- Use `this.addEnumProperty()` for fixed-choice string parameters

## 7. Node Development Patterns and Examples

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

### Color Guidelines
| Palette Key | Typical Use | Example Categories |
|-------------|-------------|--------------------|
| `green` | Pure data transforms | `math/`, `logic/`, `string/`, `json/` |
| `white` | Flow orchestration | `flowControl/`, `smartHome/` |
| `yellow` | Time and date | `time/` |
| `black` | Triggers | `triggers/` |
| `blue` | External I/O, side effects | `web/`, `languageProcessing/`, `debugging/` |
| `cyan` | Authentication | `authentication/` |

## 8. Debugging and Troubleshooting Approaches

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

## 9. Integration Patterns for External Services

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

## 10. Common Pitfalls to Avoid

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

## 10. Pre-Submission Checklist

Before considering work complete, verify:
- [ ] Server behavior changes have tests in `tests/` and are listed in `package.json`
- [ ] `npm test` passes
- [ ] Auth, secrets, and redirects handled safely
- [ ] New nodes follow NODES.md contract and stable titles
- [ ] Trigger/integration secrets use `nodePreferencesRegistry`
- [ ] Inputs parsed/validated; errors handled without crashing
- [ ] Change scope is minimal and matches existing conventions
- [ ] NODES.md updated only when node authoring rules change materially

## 11. Final Review Process

1. Run `npm test` to ensure all tests pass
2. Perform security review for auth, secrets, and input validation
3. Manual testing in editor for all new/updated nodes
4. Verify documentation is updated if needed
5. Ensure no unrelated files were modified

This guide should serve as a comprehensive reference for AI agents working with this codebase, ensuring consistent, secure, and maintainable development practices.
