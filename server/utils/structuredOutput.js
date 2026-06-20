'use strict'

const { generateObject, jsonSchema } = require('ai')
const { log, logColors } = require('../log')
const { getOllamaProvider } = require('./languageModel')

const defaultSystemPrompt = `You are a structured data extraction assistant.
Return data that exactly matches the requested JSON schema.
Do not include explanations or markdown.`

const askAIStructured = async (prompt, schemaInput, systemPrompt, model) => {
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

    const provider = getOllamaProvider()
    if (!provider) {
        return { ok: false, object: null, error: 'Ollama provider is not available' }
    }

    try {
        const { object } = await generateObject({
            model: provider(String(model || 'lfm2.5')),
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
