'use strict'

const settingsManager = require('../manager/settingsManager')

const MCP_AGENT_MODEL_SETTING = 'mcp.agentModel'
const MCP_AGENT_DEFAULT_MODEL = 'qwen3.5:9b-mxfp8'

require('../manager/nodePreferencesRegistry').addPref(
    'MCP',
    MCP_AGENT_MODEL_SETTING,
    'MCP Agent model',
    'text',
    MCP_AGENT_DEFAULT_MODEL,
    '<p>Ollama model for the dashboard MCP assistant and the <strong>Language Processing/MCP Agent</strong> node. Use a tool-capable model such as <code>qwen3.5:9b-mxfp8</code> or <code>llama3.2</code>.</p>'
)

function resolveMcpAgentModel(override) {
    const explicit = String(override || '').trim()
    if (explicit) {
        return explicit
    }
    const stored = settingsManager.getStoredValue(MCP_AGENT_MODEL_SETTING)
    if (stored !== undefined) {
        const trimmed = String(stored).trim()
        if (trimmed) {
            return trimmed
        }
    }
    return MCP_AGENT_DEFAULT_MODEL
}

module.exports = {
    MCP_AGENT_MODEL_SETTING,
    MCP_AGENT_DEFAULT_MODEL,
    resolveMcpAgentModel,
}
