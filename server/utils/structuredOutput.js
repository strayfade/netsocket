'use strict'

const { generateObject, jsonSchema } = require('ai')
const { log, logColors } = require('../log')
const { resolveDefaultModel } = require('./languageModel')
const providerManager = require('../manager/providerManager')
const { getChatModel } = require('./providers')

const defaultSystemPrompt = `You are a structured data extraction assistant.
Return data that exactly matches the requested JSON schema.
Do not include explanations or markdown.`

const askAIStructured = async (prompt, schemaInput, systemPrompt, model, providerId) => {
    let schemaObject
    try {
        schemaObject = typeof schemaInput === 'string'
            ? JSON.parse(schemaInput)
            : schemaInput
    } catch (error) {
        log(`Structured output schema parse failed: ${error.message}`, logColors.Error)
        return { ok: false, object: null, error: 'Invalid JSON schema' }
    }

    if (!schemaObject || typeof schemaObject !== 'object') {
        return { ok: false, object: null, error: 'Schema must be a JSON object' }
    }

    const resolved = providerManager.resolveProviderAndModel(providerId, model)
    const provider = resolved.provider
    const modelId = resolved.modelId || resolveDefaultModel(model)
    if (!provider) {
        return { ok: false, object: null, error: 'No AI provider configured' }
    }
    let chatModel
    try { chatModel = getChatModel(provider, modelId) } catch (e) { return { ok: false, object: null, error: e.message } }

    try {
        const { object } = await generateObject({
            model: chatModel,
            schema: jsonSchema(schemaObject),
            prompt: String(prompt || ''),
            system: String(systemPrompt || defaultSystemPrompt),
        })

        return { ok: true, object, error: null }
    } catch (error) {
        log(`Structured output generation failed: ${error.message}`, logColors.Error)
        return { ok: false, object: null, error: error.message }
    }
}

module.exports = {
    askAIStructured,
    defaultSystemPrompt,
}
