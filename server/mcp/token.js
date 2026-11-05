const crypto = require('crypto')
const settingsManager = require('../manager/settingsManager')

const MCP_API_TOKEN_SETTING = 'mcp.apiToken'

require('../manager/nodePreferencesRegistry').addPref(
    'MCP',
    MCP_API_TOKEN_SETTING,
    'MCP API Token',
    'text',
    '',
    'Bearer token for MCP clients (e.g. Cursor). Required on every MCP request, even when login is disabled. Set NETSOCKET_MCP_TOKEN in your environment and use Authorization: Bearer ${env:NETSOCKET_MCP_TOKEN} in .cursor/mcp.json. Regenerate from Dashboard if compromised.'
)

const generateMcpApiToken = () => crypto.randomBytes(32).toString('base64url')

const getMcpApiToken = () => settingsManager.getSetting(MCP_API_TOKEN_SETTING)

const persistMcpApiToken = async (token) => {
    settingsManager.setSetting(MCP_API_TOKEN_SETTING, token)
    await settingsManager.saveSettings()
}

/** Ensure the MCP bearer token exists in every login state — MCP requires it even when login is disabled. */
const ensureMcpApiToken = async () => {
    const existing = getMcpApiToken()
    if (existing) return existing
    const token = generateMcpApiToken()
    await persistMcpApiToken(token)
    return token
}

const regenerateMcpApiToken = async () => {
    const token = generateMcpApiToken()
    await persistMcpApiToken(token)
    return token
}

module.exports = {
    MCP_API_TOKEN_SETTING,
    getMcpApiToken,
    ensureMcpApiToken,
    regenerateMcpApiToken,
}
