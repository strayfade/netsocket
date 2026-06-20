'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
    filterArray,
    flattenObject,
    unflattenObject,
    validateJsonSchema,
    parseCsv,
    serializeCsv,
} = require('../server/utils/jsonTools')
const { markdownToHtml, fuzzyMatchScore } = require('../server/utils/stringTools')
const {
    parseDate,
    addDuration,
    isWithinRange,
    isBusinessHours,
} = require('../server/utils/timeTools')
const { decodeJwt, verifyJwtSignature } = require('../server/utils/jwtTools')
const { checkThrottle, resetAllThrottles } = require('../server/utils/throttleState')
const { signWebhookPayload } = require('../server/utils/httpRequest')
const { runCommand } = require('../server/utils/runCommand')

describe('jsonTools', () => {
    it('filters arrays by key and operator', () => {
        const rows = [
            { status: 'active', score: 10 },
            { status: 'inactive', score: 3 },
        ]
        assert.deepEqual(filterArray(rows, 'status', 'active'), [rows[0]])
        assert.deepEqual(filterArray(rows, 'score', '5', 'gt'), [rows[0]])
    })

    it('flattens and unflattens nested objects', () => {
        const nested = { user: { name: 'Ada', tags: ['a', 'b'] }, count: 2 }
        const flat = flattenObject(nested)
        assert.equal(flat['user.name'], 'Ada')
        assert.equal(flat['user.tags[0]'], 'a')
        assert.deepEqual(unflattenObject(flat), nested)
    })

    it('validates JSON schema subsets', () => {
        const schema = {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string', minLength: 1 },
                age: { type: 'number', minimum: 0 },
            },
        }
        assert.equal(validateJsonSchema({ name: 'Ada', age: 30 }, schema).valid, true)
        const invalid = validateJsonSchema({ age: -1 }, schema)
        assert.equal(invalid.valid, false)
        assert.ok(invalid.errors.length > 0)
    })

    it('parses and serializes CSV', () => {
        const csv = 'name,score\nAlice,10\nBob,5'
        const rows = parseCsv(csv, true)
        assert.deepEqual(rows, [
            { name: 'Alice', score: '10' },
            { name: 'Bob', score: '5' },
        ])
        assert.equal(serializeCsv(rows), csv)
    })
})

describe('stringTools', () => {
    it('converts markdown to HTML', () => {
        const html = markdownToHtml('# Title\n\nHello **world**')
        assert.match(html, /<h1>Title<\/h1>/)
        assert.match(html, /<strong>world<\/strong>/)
    })

    it('scores fuzzy matches', () => {
        assert.equal(fuzzyMatchScore('kitten', 'kitten'), 1)
        assert.ok(fuzzyMatchScore('kitten', 'sitting') > 0)
        assert.ok(fuzzyMatchScore('kitten', 'sitting') < 1)
    })
})

describe('timeTools', () => {
    it('parses dates and adds durations', () => {
        const ts = parseDate('2024-01-01T00:00:00.000Z')
        assert.equal(ts, Date.parse('2024-01-01T00:00:00.000Z'))
        assert.equal(addDuration(ts, 2, 'hours'), ts + 2 * 60 * 60 * 1000)
    })

    it('checks ranges and business hours', () => {
        const start = '2024-01-01T09:00:00.000Z'
        const end = '2024-01-01T17:00:00.000Z'
        assert.equal(isWithinRange('2024-01-01T12:00:00.000Z', start, end), true)
        assert.equal(isWithinRange('2024-01-02T12:00:00.000Z', start, end), false)
        assert.equal(typeof isBusinessHours(Date.parse('2024-01-02T15:00:00.000Z'), {
            startHour: 9,
            endHour: 17,
            weekdays: '1,2,3,4,5',
            timeZone: 'UTC',
        }), 'boolean')
    })
})

describe('jwtTools', () => {
    it('decodes JWT payloads', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ sub: '123' })).toString('base64url')
        const token = `${header}.${payload}.signature`
        const decoded = decodeJwt(token)
        assert.equal(decoded.valid, true)
        assert.equal(decoded.payload.sub, '123')
    })

    it('verifies HMAC JWT signatures', () => {
        const secret = 'test-secret'
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
        const payload = Buffer.from(JSON.stringify({ sub: '123' })).toString('base64url')
        const signingInput = `${header}.${payload}`
        const signature = crypto
            .createHmac('sha256', secret)
            .update(signingInput)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
        const token = `${signingInput}.${signature}`
        assert.equal(verifyJwtSignature(token, secret), true)
        assert.equal(verifyJwtSignature(token, 'wrong'), false)
    })
})

describe('throttleState', () => {
    beforeEach(() => {
        resetAllThrottles()
    })

    it('allows executions until the limit is reached', () => {
        assert.equal(checkThrottle('test', 2, 1000, 1000).allowed, true)
        assert.equal(checkThrottle('test', 2, 1000, 1100).allowed, true)
        assert.equal(checkThrottle('test', 2, 1000, 1200).allowed, false)
    })
})

describe('httpRequest helpers', () => {
    it('signs webhook payloads deterministically', () => {
        const signature = signWebhookPayload('{"ok":true}', 'secret')
        assert.match(signature, /^[a-f0-9]{64}$/)
        assert.equal(signature, signWebhookPayload('{"ok":true}', 'secret'))
    })
})

describe('runCommand', () => {
    it('runs a command and returns stdout', async () => {
        const command = process.platform === 'win32' ? 'cmd /c echo hello' : 'echo hello'
        const result = await runCommand({ command, timeoutMs: 5000 })
        assert.equal(result.ok, true)
        assert.match(result.stdout.trim(), /hello/)
    })

    it('times out invalid long-running commands', async () => {
        const command = process.platform === 'win32'
            ? 'ping -n 6 127.0.0.1'
            : 'sleep 5'
        const result = await runCommand({ command, timeoutMs: 500 })
        assert.equal(result.ok, false)
        assert.notEqual(result.exitCode, 0)
    })
})
