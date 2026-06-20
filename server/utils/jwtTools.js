'use strict'

const crypto = require('node:crypto')

const decodeBase64Url = (segment) => {
    const normalized = String(segment).replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return Buffer.from(padded, 'base64').toString('utf8')
}

const decodeJwt = (token) => {
    const parts = String(token || '').split('.')
    if (parts.length < 2) {
        return {
            valid: false,
            header: null,
            payload: null,
            error: 'JWT must contain at least header and payload segments',
        }
    }

    try {
        const header = JSON.parse(decodeBase64Url(parts[0]))
        const payload = JSON.parse(decodeBase64Url(parts[1]))
        return { valid: true, header, payload, error: null }
    } catch (error) {
        return {
            valid: false,
            header: null,
            payload: null,
            error: error.message,
        }
    }
}

const verifyJwtSignature = (token, secret, algorithm = 'HS256') => {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) {
        return false
    }

    const [headerSegment, payloadSegment, signatureSegment] = parts
    const signingInput = `${headerSegment}.${payloadSegment}`

    let decoded
    try {
        decoded = JSON.parse(decodeBase64Url(headerSegment))
    } catch {
        return false
    }

    const alg = decoded.alg || algorithm
    if (alg !== 'HS256' && alg !== 'HS384' && alg !== 'HS512') {
        return false
    }

    const hashAlg = alg === 'HS384' ? 'sha384' : alg === 'HS512' ? 'sha512' : 'sha256'
    const expected = crypto
        .createHmac(hashAlg, String(secret))
        .update(signingInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    const provided = signatureSegment.replace(/=+$/, '')

    if (expected.length !== provided.length) {
        return false
    }

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(provided)
        )
    } catch {
        return false
    }
}

module.exports = {
    decodeJwt,
    verifyJwtSignature,
    decodeBase64Url,
}
