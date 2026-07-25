'use strict'

const hexToDec = (hex) => {
    const cleaned = String(hex || '').trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length === 0 || cleaned.length > 2) {
        return NaN
    }
    return parseInt(cleaned, 16)
}

const numberToHex = (value, width = 0, uppercase = true) => {
    const num = Number(value)
    if (!Number.isFinite(num)) {
        return ''
    }
    const intVal = Math.trunc(num)
    if (intVal < 0) {
        return ''
    }
    let hex = intVal.toString(16)
    if (uppercase) {
        hex = hex.toUpperCase()
    }
    const pad = Math.max(0, Math.trunc(Number(width) || 0))
    if (pad > 0) {
        hex = hex.padStart(pad, '0')
    }
    return hex
}

const hexToNumber = (hex) => {
    const cleaned = String(hex || '').trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length === 0) {
        return NaN
    }
    const result = parseInt(cleaned, 16)
    return Number.isFinite(result) ? result : NaN
}

const textToHex = (text, uppercase = true) => {
    const hex = Buffer.from(String(text || ''), 'utf8').toString('hex')
    return uppercase ? hex.toUpperCase() : hex
}

const hexToText = (hex) => {
    const cleaned = String(hex || '').trim().replace(/^0x/i, '').replace(/\s+/g, '')
    if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
        return ''
    }
    try {
        return Buffer.from(cleaned, 'hex').toString('utf8')
    } catch {
        return ''
    }
}

const urlEncode = (text) => encodeURIComponent(String(text || ''))

const urlDecode = (text) => {
    try {
        return decodeURIComponent(String(text || ''))
    } catch {
        return String(text || '')
    }
}

const htmlEscape = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const htmlUnescape = (text) => String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')

const buildQueryString = (obj) => {
    const source = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
    const parts = []
    for (const [key, value] of Object.entries(source)) {
        if (value == null) {
            continue
        }
        if (Array.isArray(value)) {
            for (const entry of value) {
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`)
            }
        } else if (typeof value === 'object') {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`)
        } else {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        }
    }
    return parts.join('&')
}

const parseQueryString = (query) => {
    let text = String(query || '').trim()
    if (text.startsWith('?')) {
        text = text.slice(1)
    }
    const result = {}
    if (!text) {
        return result
    }
    for (const part of text.split('&')) {
        if (!part) continue
        const eq = part.indexOf('=')
        const rawKey = eq >= 0 ? part.slice(0, eq) : part
        const rawVal = eq >= 0 ? part.slice(eq + 1) : ''
        let key
        let val
        try {
            key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
            val = decodeURIComponent(rawVal.replace(/\+/g, ' '))
        } catch {
            key = rawKey
            val = rawVal
        }
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            const existing = result[key]
            if (Array.isArray(existing)) {
                existing.push(val)
            } else {
                result[key] = [existing, val]
            }
        } else {
            result[key] = val
        }
    }
    return result
}

module.exports = {
    hexToDec,
    numberToHex,
    hexToNumber,
    textToHex,
    hexToText,
    urlEncode,
    urlDecode,
    htmlEscape,
    htmlUnescape,
    buildQueryString,
    parseQueryString,
}
