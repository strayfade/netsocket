'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

describe('providerCrypto', () => {
    let cryptoMod
    let tempKeyPath
    let originalProviderKey

    beforeEach(async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prov-crypto-'))
        tempKeyPath = path.join(tempDir, 'provider-key.json')
        const { config } = require('../server/config')
        originalProviderKey = config.storage.providerKey
        config.storage.providerKey = tempKeyPath
        delete require.cache[require.resolve('../server/utils/providerCrypto')]
        cryptoMod = require('../server/utils/providerCrypto')
    })

    it('encrypts and decrypts round-trip', () => {
        const plain = 'sk-test-1234567890'
        const enc = cryptoMod.encrypt(plain)
        assert.ok(enc && typeof enc === 'string')
        assert.notEqual(enc, plain)
        const dec = cryptoMod.decrypt(enc)
        assert.equal(dec, plain)
    })

    it('returns null for empty encrypt input', () => {
        assert.equal(cryptoMod.encrypt(''), null)
        assert.equal(cryptoMod.encrypt(null), null)
    })

    it('fails to decrypt invalid payload', () => {
        assert.throws(() => cryptoMod.decrypt('not-base64!!!'), /Invalid/)
    })

    it('masks secrets', () => {
        assert.equal(cryptoMod.maskSecret('sk-abcdef123456'), 'sk-a****3456')
        assert.equal(cryptoMod.maskSecret('short'), '****')
    })

    it('generates key file on first encrypt', async () => {
        const enc = cryptoMod.encrypt('hello')
        assert.ok(enc)
        const exists = await fs.stat(tempKeyPath).then(() => true).catch(() => false)
        assert.equal(exists, true)
    })
})
