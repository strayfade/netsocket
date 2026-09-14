'use strict'

const crypto = require('crypto')
const fs = require('fs')
const fsPromises = require('fs').promises
const { config } = require('../config')
const { log, logColors } = require('../log')

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

let cachedKey = null

function getKeySync() {
    if (cachedKey) return cachedKey
    const keyPath = config.storage.providerKey
    try {
        if (fs.existsSync(keyPath)) {
            const raw = JSON.parse(fs.readFileSync(keyPath, 'utf-8'))
            if (raw && typeof raw.key === 'string' && raw.key.length >= 44) {
                cachedKey = Buffer.from(raw.key, 'base64')
                if (cachedKey.length === 32) return cachedKey
            }
        }
    } catch (e) {
        log(`providerCrypto: failed to read key file: ${e.message}`, logColors.Warning)
    }
    // Generate new key
    const key = crypto.randomBytes(32)
    cachedKey = key
    try {
        const dir = require('path').dirname(keyPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(keyPath, JSON.stringify({ key: key.toString('base64') }, null, 2), 'utf-8')
        try { fs.chmodSync(keyPath, 0o600) } catch (_) { /* windows */ }
        log('Generated new provider encryption key', logColors.Success)
    } catch (e) {
        log(`providerCrypto: failed to persist key: ${e.message}`, logColors.Warning)
    }
    return cachedKey
}

function encrypt(plaintext) {
    if (typeof plaintext !== 'string' || !plaintext.length) return null
    const key = getKeySync()
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv(ALGO, key, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(payload) {
    if (typeof payload !== 'string' || !payload.length) return ''
    const key = getKeySync()
    const buf = Buffer.from(payload, 'base64')
    if (buf.length < IV_LEN + TAG_LEN) throw new Error('Invalid encrypted payload')
    const iv = buf.subarray(0, IV_LEN)
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
    const enc = buf.subarray(IV_LEN + TAG_LEN)
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()])
    return dec.toString('utf8')
}

function hasKey() {
    try { getKeySync(); return true } catch { return false }
}

function maskSecret(secret) {
    if (!secret || typeof secret !== 'string') return ''
    if (secret.length <= 8) return '****'
    return secret.slice(0, 4) + '****' + secret.slice(-4)
}

module.exports = { encrypt, decrypt, hasKey, maskSecret, getKeySync }
