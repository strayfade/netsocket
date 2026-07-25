'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const bcrypt = require('bcrypt')

const {
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
} = require('../server/utils/encodingTools')
const {
    getByPath,
    sortArray,
    sliceArray,
    concatArrays,
    reverseArray,
    pluckArray,
    sumArray,
    averageArray,
    uniqueArray,
    findInArray,
    findIndexInArray,
    arrayIncludes,
    deleteObjectKey,
    mergeObjects,
} = require('../server/utils/arrayTools')
const {
    formatTemplate,
    regexMatch,
    joinArray,
    isEmptyValue,
    typeOfValue,
    coalesceValue,
} = require('../server/utils/stringTools')
const {
    subtractDuration,
    durationBetween,
    formatTimestamp,
    convertTimezoneParts,
    parseDate,
} = require('../server/utils/timeTools')
const { encodeJwt, verifyJwtSignature, decodeJwt } = require('../server/utils/jwtTools')
const { parseHeadersInput } = require('../server/utils/httpRequest')

describe('encodingTools', () => {
    it('converts hex and decimal values', () => {
        assert.equal(hexToDec('FF'), 255)
        assert.equal(numberToHex(255, 2, true), 'FF')
        assert.equal(hexToNumber('1a2b'), 0x1a2b)
        assert.equal(hexToText(textToHex('Hi', false)), 'Hi')
    })

    it('encodes and decodes URL and HTML', () => {
        assert.equal(urlDecode(urlEncode('a b&c')), 'a b&c')
        assert.equal(htmlUnescape(htmlEscape('<x & "y">')), '<x & "y">')
    })

    it('builds and parses query strings', () => {
        const query = buildQueryString({ a: '1', b: 'x y' })
        assert.equal(query, 'a=1&b=x%20y')
        assert.deepEqual(parseQueryString('?a=1&b=x%20y'), { a: '1', b: 'x y' })
    })
})

describe('arrayTools', () => {
    const rows = [
        { name: 'b', score: 2 },
        { name: 'a', score: 10 },
        { name: 'a', score: 10 },
    ]

    it('gets nested paths', () => {
        assert.equal(getByPath({ user: { city: 'Austin' } }, 'user.city'), 'Austin')
        assert.equal(getByPath({ items: [{ id: 7 }] }, 'items[0].id'), 7)
    })

    it('sorts, slices, concats, reverses, and plucks', () => {
        assert.deepEqual(sortArray(rows, 'name', 'asc').map((r) => r.name), ['a', 'a', 'b'])
        assert.deepEqual(sliceArray([1, 2, 3, 4], 1, 3), [2, 3])
        assert.deepEqual(concatArrays([1], [2, 3]), [1, 2, 3])
        assert.deepEqual(reverseArray([1, 2, 3]), [3, 2, 1])
        assert.deepEqual(pluckArray(rows, 'score'), [2, 10, 10])
    })

    it('sums, averages, uniques, and finds', () => {
        assert.equal(sumArray(rows, 'score'), 22)
        assert.equal(averageArray([2, 4, 6]), 4)
        assert.equal(uniqueArray(rows, 'name').length, 2)
        assert.deepEqual(findInArray(rows, 'name', 'b'), rows[0])
        assert.equal(findIndexInArray(rows, 'name', 'b'), 0)
        assert.equal(arrayIncludes([1, 2, 3], 2), true)
    })

    it('deletes keys and merges objects', () => {
        assert.deepEqual(deleteObjectKey({ a: 1, b: 2 }, 'a'), { b: 2 })
        assert.deepEqual(mergeObjects({ a: 1 }, { b: 2, a: 3 }), { a: 3, b: 2 })
    })
})

describe('stringTools extensions', () => {
    it('formats templates and joins arrays', () => {
        assert.equal(formatTemplate('Hi {name}', { name: 'Ada' }), 'Hi Ada')
        assert.equal(joinArray(['a', 'b'], '-'), 'a-b')
    })

    it('matches regex groups', () => {
        const result = regexMatch('price $12.50', 'price \\$([0-9.]+)')
        assert.equal(result.matched, true)
        assert.deepEqual(result.groups, ['12.50'])
    })

    it('checks emptiness, type, and coalesce', () => {
        assert.equal(isEmptyValue(''), true)
        assert.equal(isEmptyValue([]), true)
        assert.equal(typeOfValue([1]), 'array')
        assert.equal(coalesceValue('', 'fallback'), 'fallback')
        assert.equal(coalesceValue('ok', 'fallback'), 'ok')
    })
})

describe('timeTools extensions', () => {
    it('subtracts durations and measures between timestamps', () => {
        const start = parseDate('2024-01-01T00:00:00.000Z')
        assert.equal(subtractDuration(start, 1, 'hours'), start - 3600000)
        assert.equal(durationBetween(start, start + 7200000, 'hours'), 2)
    })

    it('formats timestamps and converts timezones', () => {
        const ts = parseDate('2024-01-02T03:04:05.000Z')
        assert.equal(formatTimestamp(ts, 'yyyy-MM-dd HH:mm:ss', 'UTC'), '2024-01-02 03:04:05')
        const parts = convertTimezoneParts(ts, 'UTC')
        assert.equal(parts.isoLike, '2024-01-02T03:04:05')
    })
})

describe('jwt encode and hmac helpers', () => {
    it('encodes and verifies JWTs', () => {
        const token = encodeJwt({ sub: 'abc' }, 'secret', { algorithm: 'HS256', expiresInSeconds: 60 })
        assert.equal(verifyJwtSignature(token, 'secret'), true)
        assert.equal(decodeJwt(token).payload.sub, 'abc')
    })

    it('computes HMAC-SHA256 hex digests', () => {
        const digest = crypto.createHmac('sha256', 'secret').update('body').digest('hex')
        assert.match(digest, /^[a-f0-9]{64}$/)
    })
})

describe('bcrypt compare', () => {
    it('verifies bcrypt hashes', async () => {
        const hash = await bcrypt.hash('password', 4)
        assert.equal(await bcrypt.compare('password', hash), true)
        assert.equal(await bcrypt.compare('wrong', hash), false)
    })
})

describe('httpRequest header parsing', () => {
    it('parses header JSON strings and objects', () => {
        assert.deepEqual(parseHeadersInput('{"Authorization":"Bearer x"}'), { Authorization: 'Bearer x' })
        assert.deepEqual(parseHeadersInput({ A: '1' }), { A: '1' })
        assert.deepEqual(parseHeadersInput('not-json'), {})
    })
})
