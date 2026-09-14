'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

describe('providerManager', () => {
    let pm
    let tempDir
    let originalProviders
    let originalProviderKey
    let originalSettings

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-test-'))
        const { config } = require('../server/config')
        originalProviders = config.storage.providers
        originalProviderKey = config.storage.providerKey
        originalSettings = config.storage.settings
        config.storage.providers = path.join(tempDir, 'providers.json')
        config.storage.providerKey = path.join(tempDir, 'provider-key.json')
        config.storage.settings = path.join(tempDir, 'settings.json')
        await fs.writeFile(config.storage.settings, JSON.stringify([]), 'utf-8')
        delete require.cache[require.resolve('../server/manager/providerManager')]
        delete require.cache[require.resolve('../server/utils/providerCrypto')]
        delete require.cache[require.resolve('../server/manager/settingsManager')]
        // Reload settingsManager to point at temp path
        const sm = require('../server/manager/settingsManager')
        await sm.reloadSettings()
        pm = require('../server/manager/providerManager')
        await pm.loadProviders()
    })

    afterEach(async () => {
        const { config } = require('../server/config')
        config.storage.providers = originalProviders
        config.storage.providerKey = originalProviderKey
        config.storage.settings = originalSettings
        delete require.cache[require.resolve('../server/manager/providerManager')]
        delete require.cache[require.resolve('../server/utils/providerCrypto')]
        await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('seeds default Ollama provider when empty', () => {
        const list = pm.listProviders()
        assert.equal(list.length, 1)
        assert.equal(list[0].name, 'Ollama')
        assert.equal(list[0].kind, 'ollama')
        assert.equal(list[0].isDefault, true)
    })

    it('creates openai-compatible provider with token', async () => {
        const created = pm.createProvider({ name: 'OpenAI', kind: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-xyz', defaultModel: 'gpt-4o' })
        assert.equal(created.name, 'OpenAI')
        assert.equal(created.hasApiKey, true)
        assert.equal(created.kind, 'openai-compatible')
        await pm.saveProviders()
        const raw = pm.getProviderById(created.id)
        assert.ok(raw.apiKeyEncrypted)
        // Public list hides ciphertext
        const pub = pm.listProviders().find(p => p.id === created.id)
        assert.equal(pub.hasApiKey, true)
        assert.equal(pub.apiKeyEncrypted, undefined)
    })

    it('rejects duplicate name', () => {
        assert.throws(() => pm.createProvider({ name: 'Ollama', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434' }), /name_exists/)
    })

    it('rejects invalid baseUrl', () => {
        assert.throws(() => pm.createProvider({ name: 'Bad', kind: 'ollama', baseUrl: '' }), /baseUrl_required/)
    })

    it('updates provider and preserves token when apiKey omitted', async () => {
        const created = pm.createProvider({ name: 'ToUpdate', kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', apiKey: 'secret1' })
        await pm.saveProviders()
        const updated = pm.updateProvider(created.id, { name: 'Renamed' })
        assert.equal(updated.name, 'Renamed')
        assert.equal(updated.hasApiKey, true)
        // Clear token
        pm.updateProvider(created.id, { apiKey: '' })
        const cleared = pm.getProviderById(created.id)
        assert.equal(cleared.apiKeyEncrypted, null)
    })

    it('enforces single default', async () => {
        const a = pm.listProviders()[0]
        assert.equal(a.isDefault, true)
        const b = pm.createProvider({ name: 'Second', kind: 'openai-compatible', baseUrl: 'https://example.com/v1', isDefault: true })
        await pm.saveProviders()
        const list = pm.listProviders()
        const defaults = list.filter(p => p.isDefault)
        assert.equal(defaults.length, 1)
        assert.equal(defaults[0].id, b.id)
    })

    it('deletes provider and reassigns default', async () => {
        const second = pm.createProvider({ name: 'Second', kind: 'openai-compatible', baseUrl: 'https://example.com/v1' })
        await pm.saveProviders()
        const firstId = pm.listProviders().find(p => p.isDefault).id
        pm.deleteProvider(firstId)
        await pm.saveProviders()
        const list = pm.listProviders()
        assert.equal(list.length, 1)
        assert.equal(list[0].isDefault, true)
    })

    it('resolveProviderAndModel falls back to default', () => {
        const def = pm.getDefaultProvider()
        const { provider, modelId } = pm.resolveProviderAndModel(null, '')
        assert.equal(provider.id, def.id)
        assert.equal(modelId, def.defaultModel)
        const { modelId: custom } = pm.resolveProviderAndModel(null, 'my-model')
        assert.equal(custom, 'my-model')
    })

    it('migrates legacy ollama.ip and mcp.agentModel', async () => {
        // Remove providers file so next load triggers migration from legacy settings
        await fs.unlink(require('../server/config').config.storage.providers).catch(() => {})
        const sm = require('../server/manager/settingsManager')
        await sm.replaceAllSettings([{ name: 'ollama.ip', value: '192.168.1.50' }, { name: 'ollama.defaultModel', value: 'llama3.2' }, { name: 'mcp.agentModel', value: 'qwen3' }])
        delete require.cache[require.resolve('../server/manager/providerManager')]
        const pm2 = require('../server/manager/providerManager')
        await pm2.loadProviders()
        const list = pm2.listProviders()
        assert.ok(list.some(p => p.baseUrl.includes('192.168.1.50')))
        const def = pm2.getDefaultProvider()
        assert.equal(def.defaultModel, 'llama3.2')
        const { getStoredValue } = require('../server/manager/settingsManager')
        assert.equal(getStoredValue('ollama.ip'), undefined)
        assert.equal(getStoredValue('mcp.agentModel'), undefined)
    })

    it('normalizes baseUrl', () => {
        assert.equal(pm.normalizeBaseUrl('http://example.com/v1/'), 'http://example.com/v1')
        assert.equal(pm.normalizeBaseUrl('example.com'), 'http://example.com')
    })

    it('fails to delete unknown provider', () => {
        assert.throws(() => pm.deleteProvider('nope'), /not_found/)
    })
})
