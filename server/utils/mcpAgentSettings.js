'use strict'

const settingsManager = require('../manager/settingsManager')
const { resolveDefaultModel } = require('./languageModel')

const MCP_AGENT_MODEL_SETTING = 'mcp.agentModel'
const MCP_AGENT_DEFAULT_MODEL = 'qwen3.5:9b-mxfp8'

require('../manager/nodePreferencesRegistry').addPref(
    'MCP',
    MCP_AGENT_MODEL_SETTING,
    'MCP Agent model',
    'text',
    '',
    '<p>Optional override for the dashboard MCP assistant and the <strong>Language Processing/MCP Agent</strong> node. Leave blank to use the <strong>Ollama → Default model</strong> setting. Prefer a tool-capable model such as <code>qwen3.5:9b-mxfp8</code> or <code>llama3.2</code>.</p>'
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
    return resolveDefaultModel()
}

module.exports = {
    MCP_AGENT_MODEL_SETTING,
    MCP_AGENT_DEFAULT_MODEL,
    resolveMcpAgentModel,
}
