'use strict'

const { createOpenAI } = require('@ai-sdk/openai')
const { decrypt } = require('./providerCrypto')

function ensureTrailingSlash(url) {
    return url.endsWith('/') ? url : url + '/'
}

async function listModels(providerRow) {
    if (!providerRow) throw new Error('provider_required')
    let apiKey = null
    try {
        if (providerRow.apiKeyEncrypted) apiKey = decrypt(providerRow.apiKeyEncrypted)
    } catch (e) {
        throw new Error('decrypt_failed: ' + e.message)
    }
    const baseUrl = String(providerRow.baseUrl || '').trim()
    if (!baseUrl) throw new Error('baseUrl_required')

    if (providerRow.kind === 'ollama') {
        const url = new URL('/api/tags', baseUrl).toString()
        const headers = {}
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
        const res = await fetch(url, { headers })
        if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status} ${res.statusText}`)
        const data = await res.json()
        const models = Array.isArray(data.models) ? data.models : []
        return models.map(m => ({ id: String(m.name || m.model || '').trim() })).filter(m => m.id)
    }

    // openai-compatible
    const listUrl = new URL('models', ensureTrailingSlash(baseUrl)).toString()
    const headers = {}
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetch(listUrl, { headers })
    if (!res.ok) throw new Error(`/v1/models failed: ${res.status} ${res.statusText}`)
    const data = await res.json()
    const arr = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : []
    return arr.map(m => ({ id: String(m.id || m.name || '').trim() })).filter(m => m.id)
}

function getChatModel(providerRow, modelId) {
    if (!providerRow) throw new Error('provider_required')
    const id = String(modelId || '').trim()
    if (!id) throw new Error('model_required')
    let apiKey = 'unused'
    try {
        if (providerRow.apiKeyEncrypted) {
            const dec = decrypt(providerRow.apiKeyEncrypted)
            if (dec) apiKey = dec
        }
    } catch (e) {
        throw new Error('decrypt_failed: ' + e.message)
    }
    const baseUrl = String(providerRow.baseUrl || '').trim()
    let baseURL
    if (providerRow.kind === 'ollama') {
        baseURL = new URL('/v1', baseUrl).toString()
    } else {
        baseURL = baseUrl
    }
    const client = createOpenAI({ baseURL, apiKey, compatibility: 'compatible' })
    return client.chat(id)
}

module.exports = { listModels, getChatModel, ensureTrailingSlash }
