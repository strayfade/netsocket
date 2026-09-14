const path = require('path')
const fs = require('fs')
const { log, logColors } = require('./log')
const dataDir = process.env.DATA_DIR || path.join(__dirname, "../data");
log(`Checking data directory: ${dataDir}`)

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log(`Creating new data directory: ${dataDir}`)
}

const config = {
    storage: {
        nodes: path.join(dataDir, 'state.json'),
        users: path.join(dataDir, 'users.json'),
        credentials: path.join(dataDir, 'credentials.json'),
        vars: path.join(dataDir, 'vars.json'),
        settings: path.join(dataDir, 'settings.json'),
        mcpAgentMemory: path.join(dataDir, 'mcp-agent-memory.json'),
        subgraphs: path.join(dataDir, 'subgraphs.json'),
        devices: path.join(dataDir, 'devices.json'),
        serverIdentity: path.join(dataDir, 'server-identity.json'),
        panels: path.join(dataDir, 'panels.json'),
        dashboard: path.join(dataDir, 'dashboard.json'),
        providers: path.join(dataDir, 'providers.json'),
        providerKey: path.join(dataDir, 'provider-key.json'),
    }
}

module.exports = { config }