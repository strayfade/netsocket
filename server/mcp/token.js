const crypto = require('crypto')
const settingsManager = require('../manager/settingsManager')
const { authSkipped } = require('../utils/sessionAuth')

const MCP_API_TOKEN_SETTING = 'mcp.apiToken'

require('../manager/nodePreferencesRegistry').addPref(
    'MCP',
    MCP_API_TOKEN_SETTING,
    'MCP API Token',
    'text',
    '',
    'Bearer token for MCP clients (e.g. Cursor). Set NETSOCKET_MCP_TOKEN in your environment and use Authorization: Bearer ${env:NETSOCKET_MCP_TOKEN} in .cursor/mcp.json. Regenerate from Dashboard if compromised.'
)

const generateMcpApiToken = () => crypto.randomBytes(32).toString('base64url')

const getMcpApiToken = () => settingsManager.getSetting(MCP_API_TOKEN_SETTING)

const persistMcpApiToken = async (token) => {
    settingsManager.setSetting(MCP_API_TOKEN_SETTING, token)
    await settingsManager.saveSettings()
}

/** When auth is enabled, ensure a token exists; returns the token or empty string when auth is skipped. */
const ensureMcpApiToken = async () => {
    if (authSkipped()) return ''
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
