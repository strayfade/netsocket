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

const performWebRequest = async (method, url, options = {}) => {
    const normalizedMethod = String(method || 'GET').toUpperCase()
    const targetUrl = string(url)
    const headers = options.headers && typeof options.headers === 'object'
        ? { ...options.headers }
        : {}

    const config = {
        method: normalizedMethod,
        url: targetUrl,
        headers,
        validateStatus: () => true,
    }

    if (options.body != null && options.body !== '' && normalizedMethod !== 'GET' && normalizedMethod !== 'DELETE') {
        config.data = string(options.body)
        if (!headers['Content-Type'] && !headers['content-type']) {
            headers['Content-Type'] = string(options.contentType || 'application/json')
        }
    }

    const response = await axios(config)
    return {
        status: response.status,
        body: formatResponseBody(response.data),
        headers: JSON.stringify(response.headers || {}),
    }
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
    signWebhookPayload,
    sendSignedWebhook,
}
