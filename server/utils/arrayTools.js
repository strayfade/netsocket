'use strict'

const { parseFlatPath } = require('./jsonTools')

const asArray = (value) => {
    if (Array.isArray(value)) return value
    if (value == null || value === '') return []
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

const getByPath = (input, path) => {
    if (input == null) {
        return undefined
    }
    const segments = parseFlatPath(path)
    if (segments.length === 0) {
        return input
    }
    let cursor = input
    for (const segment of segments) {
        if (cursor == null) {
            return undefined
        }
        cursor = cursor[segment]
    }
    return cursor
}

const sortArray = (items, key = '', direction = 'asc') => {
    const source = asArray(items).slice()
    const dir = String(direction || 'asc').toLowerCase() === 'desc' ? -1 : 1
    const keyName = String(key || '')

    source.sort((a, b) => {
        const left = keyName ? (a != null && typeof a === 'object' ? a[keyName] : undefined) : a
        const right = keyName ? (b != null && typeof b === 'object' ? b[keyName] : undefined) : b

        if (left == null && right == null) return 0
        if (left == null) return -1 * dir
        if (right == null) return 1 * dir

        const leftNum = Number(left)
        const rightNum = Number(right)
        if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && String(left).trim() !== '' && String(right).trim() !== '') {
            if (leftNum < rightNum) return -1 * dir
            if (leftNum > rightNum) return 1 * dir
            return 0
        }

        return String(left).localeCompare(String(right)) * dir
    })

    return source
}

const sliceArray = (items, begin = 0, end) => {
    const source = asArray(items)
    const start = Number(begin) || 0
    if (end == null || end === '') {
        return source.slice(start)
    }
    return source.slice(start, Number(end))
}

const concatArrays = (a, b) => asArray(a).concat(asArray(b))

const reverseArray = (items) => asArray(items).slice().reverse()

const pluckArray = (items, key) => {
    const keyName = String(key || '')
    return asArray(items).map((item) => {
        if (item == null || typeof item !== 'object') {
            return undefined
        }
        return item[keyName]
    })
}

const sumArray = (items, key = '') => {
    const keyName = String(key || '')
    return asArray(items).reduce((total, item) => {
        const value = keyName
            ? (item != null && typeof item === 'object' ? item[keyName] : NaN)
            : item
        const num = Number(value)
        return total + (Number.isFinite(num) ? num : 0)
    }, 0)
}

const averageArray = (items, key = '') => {
    const source = asArray(items)
    if (source.length === 0) {
        return 0
    }
    return sumArray(source, key) / source.length
}

const uniqueArray = (items, key = '') => {
    const source = asArray(items)
    const keyName = String(key || '')
    const seen = new Set()
    const result = []

    for (const item of source) {
        const token = keyName
            ? JSON.stringify(item != null && typeof item === 'object' ? item[keyName] : item)
            : JSON.stringify(item)
        if (seen.has(token)) {
            continue
        }
        seen.add(token)
        result.push(item)
    }
    return result
}

const findInArray = (items, key, value) => {
    const keyName = String(key || '')
    const match = asArray(items).find((item) => {
        if (item == null || typeof item !== 'object') {
            return String(item) === String(value)
        }
        if (!keyName) {
            return JSON.stringify(item) === String(value)
        }
        return String(item[keyName]) === String(value)
    })
    return match === undefined ? null : match
}

const findIndexInArray = (items, key, value) => {
    const keyName = String(key || '')
    return asArray(items).findIndex((item) => {
        if (item == null || typeof item !== 'object') {
            return String(item) === String(value)
        }
        if (!keyName) {
            return JSON.stringify(item) === String(value)
        }
        return String(item[keyName]) === String(value)
    })
}

const arrayIncludes = (items, value) => {
    const source = asArray(items)
    const target = value
    return source.some((item) => {
        if (typeof item === 'object' || typeof target === 'object') {
            return JSON.stringify(item) === JSON.stringify(target)
        }
        return String(item) === String(target)
    })
}

const deleteObjectKey = (obj, key) => {
    const source = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...obj } : {}
    delete source[String(key || '')]
    return source
}

const mergeObjects = (a, b) => {
    const left = a && typeof a === 'object' && !Array.isArray(a) ? a : {}
    const right = b && typeof b === 'object' && !Array.isArray(b) ? b : {}
    return { ...left, ...right }
}

module.exports = {
    asArray,
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
}
