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

const encodeBase64Url = (value) => Buffer
    .from(String(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const encodeJwt = (payload, secret, options = {}) => {
    const algorithm = String(options.algorithm || 'HS256')
    if (algorithm !== 'HS256' && algorithm !== 'HS384' && algorithm !== 'HS512') {
        throw new Error(`Unsupported JWT algorithm: ${algorithm}`)
    }

    const header = {
        alg: algorithm,
        typ: 'JWT',
        ...(options.header && typeof options.header === 'object' ? options.header : {}),
    }

    const body = payload && typeof payload === 'object' ? { ...payload } : {}
    if (options.expiresInSeconds != null && Number.isFinite(Number(options.expiresInSeconds))) {
        body.exp = Math.floor(Date.now() / 1000) + Math.trunc(Number(options.expiresInSeconds))
    }
    if (body.iat == null) {
        body.iat = Math.floor(Date.now() / 1000)
    }

    const headerSegment = encodeBase64Url(JSON.stringify(header))
    const payloadSegment = encodeBase64Url(JSON.stringify(body))
    const signingInput = `${headerSegment}.${payloadSegment}`
    const hashAlg = algorithm === 'HS384' ? 'sha384' : algorithm === 'HS512' ? 'sha512' : 'sha256'
    const signature = crypto
        .createHmac(hashAlg, String(secret || ''))
        .update(signingInput)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    return `${signingInput}.${signature}`
}

module.exports = {
    decodeJwt,
    verifyJwtSignature,
    decodeBase64Url,
    encodeBase64Url,
    encodeJwt,
}
