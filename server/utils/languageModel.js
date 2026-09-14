'use strict'

const { log, logColors } = require('../log')
const providerManager = require('../manager/providerManager')
const { getChatModel } = require('./providers')
const { generateText } = require('ai')

const DEFAULT_MODEL = providerManager.DEFAULT_MODEL || 'gemma4:e2b'
const OLLAMA_DEFAULT_MODEL_SETTING = 'ollama.defaultModel'

// Keep legacy pref registrations for describe but mark deprecated; actual storage moved to providers
// They will be auto-migrated on boot by providerManager.
try {
    require('../manager/nodePreferencesRegistry').addPref(
        'Ollama',
        'ollama.ip',
        'Host (IP or hostname) - deprecated, use AI Providers',
        'text',
        '127.0.0.1',
        '<p>Deprecated: use <strong>AI Providers</strong> settings. This field is kept only for migration.</p>'
    )
} catch (_) {}
try {
    require('../manager/nodePreferencesRegistry').addPref(
        'Ollama',
        OLLAMA_DEFAULT_MODEL_SETTING,
        'Default model - deprecated, use AI Providers',
        'text',
        DEFAULT_MODEL,
        '<p>Deprecated: use <strong>AI Providers</strong> settings.</p>'
    )
} catch (_) {}

function resolveDefaultModel(override) {
    const explicit = String(override || '').trim()
    if (explicit) return explicit
    const def = providerManager.getDefaultProvider()
    if (def && def.defaultModel) return String(def.defaultModel).trim() || DEFAULT_MODEL
    // fallback to legacy setting if provider not yet loaded
    try {
        const settingsManager = require('../manager/settingsManager')
        const stored = settingsManager.getStoredValue(OLLAMA_DEFAULT_MODEL_SETTING)
        if (stored !== undefined) {
            const trimmed = String(stored).trim()
            if (trimmed) return trimmed
        }
    } catch (_) {}
    return DEFAULT_MODEL
}

function resolveProviderAndModel(overrideProviderId, overrideModel) {
    return providerManager.resolveProviderAndModel(overrideProviderId, overrideModel)
}

const defaultSystemPrompt = `You are an intelligent robot that is able to 
    perform a user's instructions efficiently and exactly as requested. 
    You may receive input in many different forms of text, but you will 
    be instructed to perform an operation with the data. If the user wants 
    the output in a certain form, make sure that your output fits that 
    form exactly. Do not add explanations or comments on your output - ONLY 
    return what is requested of you. Also, make sure that responses are concise, 
    unless longer output is specifically requested. If you are asked to return
    code such as a JSON object, print the JSON object in plaintext, without using
    codeblocks! Do not use any form of markdown syntax. Only respond using JSON if 
    requested. Otherwise, respond using plaintext answers.`
let currentConversation = [{
    role: 'system',
    content: defaultSystemPrompt
}]
function sanitizeAiOutput(input) {
    if (typeof input !== 'string') return ''
    const quoteMap = {
        '\u201C': '"',
        '\u201D': '"',
        '\u201E': '"',
        '\u00AB': '"',
        '\u00BB': '"',
        '\u2018': "'",
        '\u2019': "'",
        '\u2032': "'",
        '\u2033': '"'
    }
    let normalized = ''
    for (let i = 0; i < input.length; i++) normalized += quoteMap[input[i]] ?? input[i]
    let result = ''
    for (let i = 0; i < normalized.length; i++) {
        const code = normalized.charCodeAt(i)
        if (code <= 127 && code !== 10 && code !== 13) result += normalized[i]
    }
    return result
}

const askAI = async (userText, systemPrompt, model, providerId) => {
    try {
        if (!userText) userText = ''
        if (!systemPrompt) systemPrompt = defaultSystemPrompt
        const resolved = resolveProviderAndModel(providerId, model)
        const provider = resolved.provider
        const modelId = resolved.modelId
        if (!provider) {
            log('No AI provider configured', logColors.Error)
            return ['', '']
        }
        let chatModel
        try {
            chatModel = getChatModel(provider, modelId)
        } catch (e) {
            log(`Failed to build chat model: ${e.message}`, logColors.Error)
            return ['', '']
        }
        currentConversation = [{ role: 'system', content: systemPrompt }]
        currentConversation.push({ role: 'user', content: userText })
        let { text } = await generateText({ model: chatModel, messages: currentConversation })
        if (text && text.includes('</think>')) text = text.substr(text.indexOf('</think>') + '</think>'.length)
        currentConversation.push({ role: 'assistant', content: text })
        const newText = sanitizeAiOutput(text)
        return Buffer.from(newText, 'latin1').toString('utf8'), Buffer.from(text, 'latin1').toString('utf8')
    } catch (e) {
        log(`Failed to ask AI: ${e.message}`, logColors.Error)
        return ['', '']
    }
}

// Legacy compat shims
const reinitOllama = () => { /* no-op, providers are resolved per call */ }
const getOllamaProvider = () => {
    const def = providerManager.getDefaultProvider()
    if (!def) return null
    // Return a function compatible with old call sites: ollama(modelName) -> chatModel
    return (modelName) => {
        const { provider, modelId } = resolveProviderAndModel(null, modelName)
        return getChatModel(provider, modelId)
    }
}

module.exports = {
    DEFAULT_MODEL,
    OLLAMA_DEFAULT_MODEL_SETTING,
    resolveDefaultModel,
    resolveProviderAndModel,
    askAI,
    reinitOllama,
    getOllamaProvider,
    sanitizeAiOutput,
}
