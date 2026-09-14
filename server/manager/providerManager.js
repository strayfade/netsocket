'use strict'

const fs = require('fs').promises
const crypto = require('crypto')
const { config } = require('../config')
const { log, logColors } = require('../log')

const DEFAULT_MODEL = 'gemma4:e2b'

let providers = []
let loaded = false

function normalizeBaseUrl(raw) {
    const s = String(raw || '').trim()
    if (!s) return ''
    // Allow plain host like "127.0.0.1:11434" -> add http://
    let candidate = s
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
        candidate = 'http://' + candidate
    }
    try {
        const u = new URL(candidate)
        // Strip trailing slash, keep origin + pathname (without /api or /v1 fluff stays as entered)
        let out = u.toString()
        // Remove trailing slashes
        out = out.replace(/\/+$/, '')
        return out
    } catch {
        return s.replace(/\/+$/, '')
    }
}

function sanitizeKind(k) {
    const s = String(k || '').trim().toLowerCase()
    if (s === 'ollama' || s === 'openai-compatible' || s === 'openai_like' || s === 'openai-like') {
        return s === 'openai_like' || s === 'openai-like' ? 'openai-compatible' : s
    }
    return 'openai-compatible'
}

function toPublicRow(row) {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        baseUrl: row.baseUrl,
        defaultModel: row.defaultModel || '',
        isDefault: !!row.isDefault,
        hasApiKey: !!row.apiKeyEncrypted,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }
}

function ensureSingleDefault() {
    if (!providers.length) return
    const defaults = providers.filter(p => p.isDefault)
    if (defaults.length === 0) {
        providers[0].isDefault = true
    } else if (defaults.length > 1) {
        const keep = defaults[0].id
        for (const p of providers) p.isDefault = (p.id === keep)
    }
}

async function loadProviders() {
    const p = config.storage.providers
    try {
        const raw = await fs.readFile(p, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
            providers = parsed.map(r => ({
                id: String(r.id),
                name: String(r.name || ''),
                kind: sanitizeKind(r.kind),
                baseUrl: normalizeBaseUrl(r.baseUrl),
                apiKeyEncrypted: r.apiKeyEncrypted ? String(r.apiKeyEncrypted) : null,
                defaultModel: r.defaultModel ? String(r.defaultModel) : '',
                isDefault: !!r.isDefault,
                createdAt: Number(r.createdAt) || Date.now(),
                updatedAt: Number(r.updatedAt) || Date.now(),
            })).filter(r => r.id && r.name && r.baseUrl)
            ensureSingleDefault()
            loaded = true
            log(`Loaded ${providers.length} AI provider(s)`)
            return
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            log(`Failed to load providers: ${e.message}`, logColors.Warning)
        }
    }
    // No file -> migrate from legacy settings or seed default
    await migrateFromLegacy()
    ensureSingleDefault()
    loaded = true
    await saveProviders()
}

async function migrateFromLegacy() {
    const settingsManager = require('./settingsManager')
    const legacyIp = settingsManager.getStoredValue('ollama.ip')
    const legacyModel = settingsManager.getStoredValue('ollama.defaultModel')
    const mcpModel = settingsManager.getStoredValue('mcp.agentModel')
    // Determine baseUrl and defaultModel
    let baseUrl = 'http://127.0.0.1:11434'
    if (legacyIp !== undefined && String(legacyIp).trim()) {
        const ip = String(legacyIp).trim()
        // Normalize: if already looks like URL, use as-is; else http://ip:11434
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(ip)) {
            baseUrl = normalizeBaseUrl(ip)
        } else {
            // legacy stored just host; port 11434 assumed
            baseUrl = normalizeBaseUrl(`http://${ip}:11434`)
        }
    }
    let defaultModel = DEFAULT_MODEL
    if (legacyModel !== undefined && String(legacyModel).trim()) {
        defaultModel = String(legacyModel).trim()
    } else if (mcpModel !== undefined && String(mcpModel).trim()) {
        defaultModel = String(mcpModel).trim()
    }

    if (providers.length === 0) {
        const now = Date.now()
        providers.push({
            id: crypto.randomUUID(),
            name: 'Ollama',
            kind: 'ollama',
            baseUrl,
            apiKeyEncrypted: null,
            defaultModel,
            isDefault: true,
            createdAt: now,
            updatedAt: now,
        })
        log(`Migrated legacy Ollama settings -> provider ${baseUrl} / ${defaultModel}`, logColors.Success)
    }

    const legacyKeys = ['ollama.ip', 'ollama.defaultModel', 'mcp.agentModel']
    const hasLegacy = legacyKeys.some(k => settingsManager.getStoredValue(k) !== undefined)
    if (hasLegacy) {
        try {
            const all = settingsManager.getAllSettings()
            const filtered = all.filter(e => !legacyKeys.includes(e.name))
            if (filtered.length !== all.length) {
                await settingsManager.replaceAllSettings(filtered)
                log('Cleaned legacy ollama/mcp settings keys', logColors.Info)
            }
        } catch (e) {
            log(`Failed to clean legacy settings: ${e.message}`, logColors.Warning)
        }
    }
}

async function saveProviders() {
    const p = config.storage.providers
    ensureSingleDefault()
    await fs.writeFile(p, JSON.stringify(providers, null, 2), 'utf-8')
}

function listProviders() {
    return providers.map(toPublicRow)
}

function getProvidersRaw() {
    return providers
}

function getProviderById(id) {
    return providers.find(p => p.id === String(id)) || null
}

function getDefaultProvider() {
    ensureSingleDefault()
    return providers.find(p => p.isDefault) || providers[0] || null
}

function getDefaultProviderPublic() {
    const p = getDefaultProvider()
    return p ? toPublicRow(p) : null
}

function resolveProviderAndModel(overrideProviderId, overrideModel) {
    // Returns { provider, modelId }
    let provider = null
    if (overrideProviderId) {
        provider = getProviderById(overrideProviderId)
    }
    if (!provider) provider = getDefaultProvider()
    let modelId = String(overrideModel || '').trim()
    if (!modelId) {
        modelId = provider ? (provider.defaultModel || DEFAULT_MODEL) : DEFAULT_MODEL
    }
    return { provider, modelId }
}

function createProvider({ name, kind, baseUrl, apiKey, defaultModel, isDefault }) {
    const id = crypto.randomUUID()
    const now = Date.now()
    const normalizedKind = sanitizeKind(kind)
    const normalizedUrl = normalizeBaseUrl(baseUrl)
    if (!String(name || '').trim()) throw new Error('name_required')
    if (!normalizedUrl) throw new Error('baseUrl_required')
    try { new URL(normalizedUrl) } catch { throw new Error('baseUrl_invalid') }
    let encrypted = null
    if (apiKey && String(apiKey).trim()) {
        const { encrypt } = require('../utils/providerCrypto')
        encrypted = encrypt(String(apiKey))
    }
    const row = {
        id,
        name: String(name).trim(),
        kind: normalizedKind,
        baseUrl: normalizedUrl,
        apiKeyEncrypted: encrypted,
        defaultModel: String(defaultModel || '').trim(),
        isDefault: !!isDefault,
        createdAt: now,
        updatedAt: now,
    }
    if (providers.some(p => p.name.toLowerCase() === row.name.toLowerCase())) {
        throw new Error('name_exists')
    }
    if (row.isDefault) {
        for (const p of providers) p.isDefault = false
    } else if (providers.length === 0) {
        row.isDefault = true
    }
    providers.push(row)
    ensureSingleDefault()
    return toPublicRow(row)
}

function updateProvider(id, patch) {
    const row = getProviderById(id)
    if (!row) throw new Error('not_found')
    if (patch.name !== undefined) {
        const n = String(patch.name).trim()
        if (!n) throw new Error('name_required')
        if (providers.some(p => p.id !== row.id && p.name.toLowerCase() === n.toLowerCase())) throw new Error('name_exists')
        row.name = n
    }
    if (patch.kind !== undefined) row.kind = sanitizeKind(patch.kind)
    if (patch.baseUrl !== undefined) {
        const u = normalizeBaseUrl(patch.baseUrl)
        if (!u) throw new Error('baseUrl_required')
        try { new URL(u) } catch { throw new Error('baseUrl_invalid') }
        row.baseUrl = u
    }
    if (patch.apiKey !== undefined) {
        // empty string means clear; undefined means leave; non-empty means set
        if (patch.apiKey === null || patch.apiKey === '') {
            row.apiKeyEncrypted = null
        } else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
            const { encrypt } = require('../utils/providerCrypto')
            row.apiKeyEncrypted = encrypt(String(patch.apiKey))
        }
    }
    if (patch.defaultModel !== undefined) row.defaultModel = String(patch.defaultModel || '').trim()
    if (patch.isDefault !== undefined) {
        if (patch.isDefault) {
            for (const p of providers) p.isDefault = false
            row.isDefault = true
        } else {
            // Don't allow clearing last default
            const others = providers.filter(p => p.id !== row.id && p.isDefault)
            if (providers.filter(p => p.isDefault).length === 1 && row.isDefault && !others.length) {
                throw new Error('cannot_clear_default')
            }
            row.isDefault = false
        }
    }
    row.updatedAt = Date.now()
    ensureSingleDefault()
    return toPublicRow(row)
}

function deleteProvider(id) {
    const idx = providers.findIndex(p => p.id === String(id))
    if (idx === -1) throw new Error('not_found')
    const wasDefault = providers[idx].isDefault
    providers.splice(idx, 1)
    if (wasDefault && providers.length) {
        providers[0].isDefault = true
    }
    ensureSingleDefault()
}

function setDefaultProvider(id) {
    const row = getProviderById(id)
    if (!row) throw new Error('not_found')
    for (const p of providers) p.isDefault = false
    row.isDefault = true
    row.updatedAt = Date.now()
    return toPublicRow(row)
}

module.exports = {
    DEFAULT_MODEL,
    loadProviders,
    saveProviders,
    listProviders,
    getProvidersRaw,
    getProviderById,
    getDefaultProvider,
    getDefaultProviderPublic,
    resolveProviderAndModel,
    createProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
    toPublicRow,
    normalizeBaseUrl,
}
