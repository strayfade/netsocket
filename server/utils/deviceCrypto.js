'use strict'

const crypto = require('crypto')

const PROTOCOL_INFO = 'netsocket-device-v1'
const CHALLENGE_BYTES = 32
const NONCE_BYTES = 12
const SESSION_KEY_BYTES = 32

/** ASN.1 SPKI prefix for a raw 32-byte Ed25519 public key */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
/** ASN.1 PKCS#8 prefix for a raw 32-byte Ed25519 seed */
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
/** ASN.1 SPKI prefix for a raw 32-byte X25519 public key */
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
/** ASN.1 PKCS#8 prefix for a raw 32-byte X25519 private key */
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

const b64 = (buf) => Buffer.from(buf).toString('base64')
const fromB64 = (str) => Buffer.from(String(str || ''), 'base64')

const requireRaw32 = (buf, label) => {
    if (!Buffer.isBuffer(buf) || buf.length !== 32) {
        throw new Error(`${label}_must_be_32_bytes`)
    }
    return buf
}

const generateEd25519KeyPair = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const publicDer = publicKey.export({ type: 'spki', format: 'der' })
    const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' })
    const publicRaw = publicDer.subarray(publicDer.length - 32)
    const privateRaw = privateDer.subarray(privateDer.length - 32)
    return {
        publicKey: publicRaw,
        privateKey: privateRaw,
        publicKeyB64: b64(publicRaw),
        privateKeyB64: b64(privateRaw),
    }
}

const generateX25519KeyPair = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519')
    const publicDer = publicKey.export({ type: 'spki', format: 'der' })
    const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' })
    const publicRaw = publicDer.subarray(publicDer.length - 32)
    const privateRaw = privateDer.subarray(privateDer.length - 32)
    return {
        publicKey: publicRaw,
        privateKey: privateRaw,
        publicKeyB64: b64(publicRaw),
        privateKeyB64: b64(privateRaw),
    }
}

const ed25519PublicFromB64 = (publicKeyB64) => {
    const raw = requireRaw32(fromB64(publicKeyB64), 'ed25519_public')
    return crypto.createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
        type: 'spki',
        format: 'der',
    })
}

const ed25519PrivateFromB64 = (privateKeyB64) => {
    const raw = requireRaw32(fromB64(privateKeyB64), 'ed25519_private')
    return crypto.createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_PREFIX, raw]),
        type: 'pkcs8',
        format: 'der',
    })
}

const x25519PublicFromB64 = (publicKeyB64) => {
    const raw = requireRaw32(fromB64(publicKeyB64), 'x25519_public')
    return crypto.createPublicKey({
        key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
        type: 'spki',
        format: 'der',
    })
}

const x25519PrivateFromB64 = (privateKeyB64) => {
    const raw = requireRaw32(fromB64(privateKeyB64), 'x25519_private')
    return crypto.createPrivateKey({
        key: Buffer.concat([X25519_PKCS8_PREFIX, raw]),
        type: 'pkcs8',
        format: 'der',
    })
}

const signEd25519 = (privateKeyB64, message) => {
    const key = ed25519PrivateFromB64(privateKeyB64)
    const data = Buffer.isBuffer(message) ? message : Buffer.from(String(message), 'utf8')
    return b64(crypto.sign(null, data, key))
}

const verifyEd25519 = (publicKeyB64, message, signatureB64) => {
    try {
        const key = ed25519PublicFromB64(publicKeyB64)
        const data = Buffer.isBuffer(message) ? message : Buffer.from(String(message), 'utf8')
        return crypto.verify(null, data, key, fromB64(signatureB64))
    } catch {
        return false
    }
}

const deriveSharedSecret = (privateKeyB64, peerPublicKeyB64) => {
    const privateKey = x25519PrivateFromB64(privateKeyB64)
    const publicKey = x25519PublicFromB64(peerPublicKeyB64)
    return crypto.diffieHellman({ privateKey, publicKey })
}

const deriveSessionKey = (sharedSecret, challengeB64) => {
    const salt = fromB64(challengeB64)
    return Buffer.from(crypto.hkdfSync(
        'sha256',
        sharedSecret,
        salt,
        Buffer.from(PROTOCOL_INFO, 'utf8'),
        SESSION_KEY_BYTES,
    ))
}

const randomChallengeB64 = () => b64(crypto.randomBytes(CHALLENGE_BYTES))

const encryptPayload = (sessionKey, plaintextObj) => {
    const nonce = crypto.randomBytes(NONCE_BYTES)
    const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8')
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, nonce)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()
    return {
        nonce: b64(nonce),
        ciphertext: b64(Buffer.concat([ciphertext, tag])),
    }
}

const decryptPayload = (sessionKey, nonceB64, ciphertextB64) => {
    const nonce = fromB64(nonceB64)
    const packed = fromB64(ciphertextB64)
    if (packed.length < 16) {
        throw new Error('ciphertext_too_short')
    }
    const tag = packed.subarray(packed.length - 16)
    const ciphertext = packed.subarray(0, packed.length - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
}

/**
 * Canonical challenge string both peers sign/verify.
 * Includes server identity pubkey so the device can pin it.
 */
const buildChallengeMessage = ({
    challenge,
    deviceId,
    deviceIdentityPublicKey,
    deviceEcdhPublicKey,
    serverIdentityPublicKey,
    serverEcdhPublicKey,
}) => [
    'netsocket-device-auth-v1',
    String(challenge || ''),
    String(deviceId || ''),
    String(deviceIdentityPublicKey || ''),
    String(deviceEcdhPublicKey || ''),
    String(serverIdentityPublicKey || ''),
    String(serverEcdhPublicKey || ''),
].join('\n')

module.exports = {
    PROTOCOL_INFO,
    generateEd25519KeyPair,
    generateX25519KeyPair,
    signEd25519,
    verifyEd25519,
    deriveSharedSecret,
    deriveSessionKey,
    randomChallengeB64,
    encryptPayload,
    decryptPayload,
    buildChallengeMessage,
    b64,
    fromB64,
}
