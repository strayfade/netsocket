'use strict'

const axios = require('axios')
const crypto = require('node:crypto')
const { string } = require('./inputParser')

const formatResponseBody = (data) => {
    if (data == null) {
        return ''
    }
    if (typeof data === 'string') {
        return data
    }
    try {
        return JSON.stringify(data)
    } catch {
        return String(data)
    }
}

const parseHeadersInput = (headersInput) => {
    if (headersInput == null || headersInput === '') {
        return {}
    }
    if (typeof headersInput === 'object' && !Array.isArray(headersInput)) {
        return { ...headersInput }
    }
    try {
        const parsed = JSON.parse(String(headersInput))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed
        }
    } catch {
        // ignore invalid JSON
    }
    return {}
}

const performWebRequest = async (method, url, options = {}) => {
    const normalizedMethod = String(method || 'GET').toUpperCase()
    const targetUrl = string(url)
    const headers = parseHeadersInput(options.headers)

    const config = {
        method: normalizedMethod,
        url: targetUrl,
        headers,
        validateStatus: () => true,
    }

    const timeoutMs = Number(options.timeoutMs)
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        config.timeout = timeoutMs
    }

    if (options.body != null && options.body !== '' && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
        config.data = string(options.body)
        if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = string(options.contentType || 'application/json')
        }
    }

    const maxAttempts = Math.max(1, Math.trunc(Number(options.retries) || 0) + 1)
    let lastError = null

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await axios(config)
            return {
                status: response.status,
                body: formatResponseBody(response.data),
                headers: JSON.stringify(response.headers || {}),
                ok: response.status >= 200 && response.status < 300,
            }
        } catch (error) {
            lastError = error
            if (attempt >= maxAttempts - 1) {
                break
            }
        }
    }

    throw lastError || new Error('Request failed')
}

const signWebhookPayload = (payload, secret, algorithm = 'sha256') => {
    const hashAlg = algorithm === 'sha512' ? 'sha512' : algorithm === 'sha384' ? 'sha384' : 'sha256'
    return crypto
        .createHmac(hashAlg, String(secret || ''))
        .update(String(payload || ''))
        .digest('hex')
}

const sendSignedWebhook = async (options) => {
    const url = string(options.url)
    const body = string(options.body)
    const secret = string(options.secret)
    const headerName = string(options.headerName || 'X-Netsocket-Signature')
    const algorithm = string(options.algorithm || 'sha256')

    const headers = {
        'Content-Type': string(options.contentType || 'application/json'),
    }

    if (secret) {
        headers[headerName] = signWebhookPayload(body, secret, algorithm)
    }

    if (options.extraHeaders && typeof options.extraHeaders === 'object') {
        Object.assign(headers, options.extraHeaders)
    }

    return performWebRequest('POST', url, {
        body,
        headers,
        contentType: headers['Content-Type'],
    })
}

module.exports = {
    performWebRequest,
    formatResponseBody,
    parseHeadersInput,
    signWebhookPayload,
    sendSignedWebhook,
}
