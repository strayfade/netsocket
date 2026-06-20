# AI agent guide for Netsocket

This document defines how AI agents should plan, implement, and review changes in this repository. Read it before making edits. For node-specific authoring details, also read [NODES.md](./NODES.md).

## What this project is

Netsocket is a self-hosted nodegraph editor and automation runtime. The server (`server/`) executes graphs, serves the frontend (`frontend/`), and persists user data under `DATA_DIR` (default: `data/`). Nodes are discovered from `server/nodes/` and registered at startup via `server/manager/nodeImporter.js`.

Stack: Node.js (CommonJS), Express, WebSockets, native `node:test` runner. License: GPLv3.

## Repository layout

| Path | Purpose |
|------|---------|
| `server/index.js` | HTTP/WebSocket entry, auth routes, trigger endpoints |
| `server/manager/` | Graph execution, persistence, settings, node import |
| `server/nodes/` | Node modules (`NodeDefinition` + `NodeFunction`) |
| `server/utils/` | Shared helpers (auth, parsing, triggers, integrations) |
| `frontend/` | Static UI (`editor.html`, `index.html`, `public/`) |
| `tests/` | Automated tests |
| `extensions/` | Optional integrations (overlay, mirror, etc.) |
| `NODES.md` | Node authoring reference and known edge cases |

## Required: tests for server-side changes

Every new or changed **server-side behavior** must include automated tests.

### What needs tests

- New or modified API routes (`server/index.js` and route handlers)
- Auth and session logic (`server/utils/sessionAuth.js`, login flows)
- Utilities, managers, and trigger pollers under `server/utils/` and `server/manager/`
- Node runtime logic when behavior is non-trivial (parsing, branching, external I/O, error paths)
- Security-sensitive code paths (authorization checks, secret validation, input sanitization)

Pure UI-only changes in `frontend/` should get tests when they introduce testable logic modules (see `frontend/public/js/loginLogic.js`). Trivial markup-only edits may rely on existing structural tests in `tests/indexHtml.test.js` unless behavior changes.

### How tests are written

- Use Node's built-in test runner: `require('node:test')` and `require('node:assert/strict')`.
- Put files in `tests/` with a `.test.js` suffix.
- Start test files with `'use strict';`.
- Prefer unit tests that import the module under test directly (see `tests/sessionAuth.test.js`).
- Mock HTTP with lightweight `req`/`res` objects rather than spinning up the full server when possible.
- Cover at least one **success path** and one **failure or edge path** per feature.
- Reset shared state in `beforeEach`/`afterEach` when tests mutate in-memory stores (sessions, users, settings).

### Register new tests

Add every new test file to the `test` and `test:watch` scripts in `package.json`:

```json
"test": "node --test --test-force-exit tests/....test.js ..."
```

Run `npm test` before finishing work. CI runs tests on Node 20.x and 22.x for pushes and PRs to `main` (`.github/workflows/test.yml`).

Do not merge server features without corresponding tests unless the user explicitly waives testing for a specific change.

## Required: security and privacy

Netsocket runs on users' machines and stores credentials, automation graphs, OAuth tokens, and integration secrets. Treat all user data as sensitive.

### Authentication and sessions

- Protected pages and APIs must go through `server/utils/sessionAuth.js` (`requireUserSession`, `canAccessPrivateApi`, `canAccessWithSessionOrIntegrationSecret`).
- `--skip-auth` is for local development only. Never weaken production auth paths or default to skipping auth.
- Session cookies must stay `httpOnly`, `sameSite: 'lax'`, and respect `COOKIE_SECURE=1` behind HTTPS.
- Use `safeRedirectPath` / `resolveRedirectTarget` patterns for redirects. Reject open redirects (`//`, absolute URLs, non-leading `/`).
- Compare secrets with timing-safe equality (`tokensEqual` / `integrationSecretMatches`). Do not use plain `===` for new secret comparisons.
- Apply login rate limiting for credential endpoints. Do not leak whether a username exists; use generic error messages on login failure.
- Passwords are stored as bcrypt hashes (`server/manager/saveCredentials.js`), never plaintext. Minimum length is `MIN_PASSWORD_LENGTH` (8).

### Secrets and credentials

- Integration secrets (webhooks, command palette, GitHub, notifications, Google OAuth) belong in settings via `nodePreferencesRegistry.addPref(...)`, persisted under `DATA_DIR`, not hardcoded in source.
- Never commit `.env`, `data/`, `credentials.json`, tokens, or real secrets.
- Never log passwords, session tokens, API keys, OAuth tokens, or webhook payloads containing credentials.
- When adding endpoints that accept secrets in URLs or headers, require configured secrets and fail closed (401/403) when missing or invalid.

### Input validation and execution safety

- Parse untrusted input at boundaries with `server/utils/inputParser` (`number`, `string`, `bool`, `json`).
- Validate types explicitly (`typeof x === 'string'`) for request bodies and WebSocket messages.
- Wrap external I/O (HTTP, filesystem, device APIs, Google) in `try/catch`; return `false` from `NodeFunction` on failure where appropriate.
- Do not expand execution surfaces casually. `Debugging/Run Javascript` uses `vm.runInNewContext` with a timeout; do not remove sandboxing or timeouts.
- Avoid `eval` outside existing node-import machinery in `nodeImporter.js`.

### HTTP and transport hardening

- Preserve baseline headers from `securityHeaders` middleware.
- WebSocket connections must validate session tokens or integration secrets before joining `connectedClients`.
- Keep JSON body limits intentional; do not raise limits without a documented reason.
- Prefer same-origin relative paths for frontend API calls.

### Data storage

- User state lives under `config.storage` paths in `server/config.js` (`state.json`, `users.json`, `credentials.json`, `vars.json`, `settings.json`).
- Do not expose raw storage files via new static routes.
- Be mindful of graph exports/imports: they can contain secrets from node properties. Do not add features that exfiltrate settings without auth.

## Node authoring

Follow [NODES.md](./NODES.md) for full detail. Non-negotiable rules:

1. One node per file under the appropriate `server/nodes/<category>/` folder.
2. Export exactly: `module.exports = { NodeDefinition, NodeFunction }`.
3. Set a stable `NodeDefinition.prototype.title` in `Category/Name` format. **Do not rename released trigger titles**; pollers match on the exact string.
4. Keep `NodeDefinition` constructors simple; `nodeImporter.js` reconstructs them from `constructor.toString()`.
5. `NodeFunction` must be `async`, take `(node, params, behaviors)`, and align `populateNextNodeLinks([...])` indexes with declared outputs.
6. Register integration settings with `nodePreferencesRegistry.addPref` when a node needs configuration or secrets.
7. Do not copy known-buggy patterns listed in NODES.md ("Known edge cases").

After adding a node, smoke-test in the editor (linked and unlinked inputs, success and error paths). Add automated tests when logic is easy to isolate (pure transforms, parsing, validation).

## Code style and change discipline

- **Minimize scope.** Only change what the task requires. Match the style of the file you edit (quote style, semicolons, indentation).
- **CommonJS only** in server code (`require` / `module.exports`). Frontend logic modules that need tests may use a UMD wrapper like `loginLogic.js`.
- **Reuse existing helpers** (`inputParser`, `sessionAuth`, `graphUtils`, `log`) instead of duplicating logic.
- **Dependencies:** avoid new npm packages unless necessary. If added, update `package.json` and ensure CI still passes with `npm ci`.
- **Logging:** use `log(message, logColors.Error)` for errors; avoid logging sensitive values.
- **Comments:** only where behavior is non-obvious. Prefer clear code over heavy documentation.
- **Do not edit unrelated files** (README marketing copy, unrelated nodes, drive-by refactors).

## Environment and runtime

| Variable | Purpose |
|----------|---------|
| `DATA_DIR` | Persistent data directory (Docker: `/netsocket/data`) |
| `PORT` | HTTP port (default `4675`) |
| `HOSTNAME` | Bind address |
| `COOKIE_SECURE` | Set to `1` when serving over HTTPS |

Local dev: `npm run develop` (auth on) or `npm run develop-noauth` (`--skip-auth`, dev only).

## Pre-submit checklist

Before considering work complete, verify:

- [ ] Server behavior changes have tests in `tests/` and are listed in `package.json` `test` script
- [ ] `npm test` passes
- [ ] Auth, secrets, and redirects handled safely; no sensitive data logged or committed
- [ ] New nodes follow NODES.md contract and stable titles
- [ ] Trigger/integration secrets use `nodePreferencesRegistry`, not inline constants
- [ ] Inputs parsed/validated; errors handled without crashing the execution loop
- [ ] Change scope is minimal and matches existing conventions
- [ ] NODES.md updated only when node authoring rules or public node contracts change materially

## Related documentation

- [README.md](./README.md) — install, Docker, basic usage
- [NODES.md](./NODES.md) — node implementation guide, templates, and known pitfalls
