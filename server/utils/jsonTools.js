'use strict'

const filterArray = (items, key, value, operator = 'equals') => {
    if (!Array.isArray(items)) {
        return []
    }

    const op = String(operator || 'equals').toLowerCase()

    return items.filter((item) => {
        if (item == null || typeof item !== 'object') {
            return false
        }

        const actual = item[key]

        switch (op) {
            case 'equals':
            case 'eq':
                return String(actual) === String(value)
            case 'not equals':
            case 'neq':
                return String(actual) !== String(value)
            case 'contains':
                return String(actual).includes(String(value))
            case 'exists':
                return Object.prototype.hasOwnProperty.call(item, key)
            case 'gt':
                return Number(actual) > Number(value)
            case 'gte':
                return Number(actual) >= Number(value)
            case 'lt':
                return Number(actual) < Number(value)
            case 'lte':
                return Number(actual) <= Number(value)
            default:
                return String(actual) === String(value)
        }
    })
}

const flattenObject = (input, prefix = '', result = {}) => {
    if (input == null || typeof input !== 'object' || Array.isArray(input)) {
        if (prefix) {
            result[prefix] = input
        }
        return result
    }

    for (const [key, value] of Object.entries(input)) {
        const nextKey = prefix ? `${prefix}.${key}` : key
        if (value != null && typeof value === 'object' && !Array.isArray(value)) {
            flattenObject(value, nextKey, result)
        } else if (Array.isArray(value)) {
            value.forEach((entry, index) => {
                const arrayKey = `${nextKey}[${index}]`
                if (entry != null && typeof entry === 'object' && !Array.isArray(entry)) {
                    flattenObject(entry, arrayKey, result)
                } else {
                    result[arrayKey] = entry
                }
            })
        } else {
            result[nextKey] = value
        }
    }

    return result
}

const parseFlatPath = (flatKey) => {
    const segments = []
    const pattern = /([^[.\]]+)|\[(\d+)\]/g
    let match
    while ((match = pattern.exec(flatKey)) !== null) {
        segments.push(match[1] != null ? match[1] : Number(match[2]))
    }
    return segments
}

const unflattenObject = (flat) => {
    const result = {}

    for (const [flatKey, value] of Object.entries(flat || {})) {
        const path = parseFlatPath(flatKey)
        let cursor = result

        for (let i = 0; i < path.length; i++) {
            const key = path[i]
            const isLast = i === path.length - 1

            if (isLast) {
                cursor[key] = value
                break
            }

            const nextKey = path[i + 1]

            if (typeof nextKey === 'number') {
                if (!Array.isArray(cursor[key])) {
                    cursor[key] = []
                }

                if (i + 1 === path.length - 1) {
                    cursor[key][nextKey] = value
                    break
                }

                if (cursor[key][nextKey] == null) {
                    cursor[key][nextKey] = typeof path[i + 2] === 'number' ? [] : {}
                }

                cursor = cursor[key][nextKey]
                i++
                continue
            }

            if (cursor[key] == null || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
                cursor[key] = {}
            }
            cursor = cursor[key]
        }
    }

    return result
}

const typeOfValue = (value) => {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    return typeof value
}

const validateJsonSchema = (value, schema, path = 'root') => {
    const errors = []

    if (!schema || typeof schema !== 'object') {
        return { valid: false, errors: ['Schema must be a JSON object'] }
    }

    const pushError = (message) => errors.push(`${path}: ${message}`)

    if (schema.type != null) {
        const expected = schema.type
        const actual = typeOfValue(value)
        const allowed = Array.isArray(expected) ? expected : [expected]
        if (!allowed.includes(actual)) {
            pushError(`expected type ${allowed.join('|')}, got ${actual}`)
            return { valid: false, errors }
        }
    }

    if (schema.enum != null) {
        const allowed = schema.enum
        if (!allowed.some((entry) => Object.is(entry, value))) {
            pushError(`value must be one of ${JSON.stringify(allowed)}`)
        }
    }

    if (typeof value === 'string') {
        if (schema.minLength != null && value.length < schema.minLength) {
            pushError(`length must be >= ${schema.minLength}`)
        }
        if (schema.maxLength != null && value.length > schema.maxLength) {
            pushError(`length must be <= ${schema.maxLength}`)
        }
        if (schema.pattern != null) {
            const regex = new RegExp(schema.pattern)
            if (!regex.test(value)) {
                pushError(`must match pattern ${schema.pattern}`)
            }
        }
    }

    if (typeof value === 'number') {
        if (schema.minimum != null && value < schema.minimum) {
            pushError(`must be >= ${schema.minimum}`)
        }
        if (schema.maximum != null && value > schema.maximum) {
            pushError(`must be <= ${schema.maximum}`)
        }
    }

    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        if (Array.isArray(schema.required)) {
            for (const key of schema.required) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) {
                    pushError(`missing required property "${key}"`)
                }
            }
        }

        if (schema.properties && typeof schema.properties === 'object') {
            for (const [key, childSchema] of Object.entries(schema.properties)) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const child = validateJsonSchema(value[key], childSchema, `${path}.${key}`)
                    errors.push(...child.errors)
                }
            }
        }

        if (schema.additionalProperties === false && schema.properties) {
            for (const key of Object.keys(value)) {
                if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
                    pushError(`additional property "${key}" is not allowed`)
                }
            }
        }
    }

    if (Array.isArray(value)) {
        if (schema.minItems != null && value.length < schema.minItems) {
            pushError(`array length must be >= ${schema.minItems}`)
        }
        if (schema.maxItems != null && value.length > schema.maxItems) {
            pushError(`array length must be <= ${schema.maxItems}`)
        }
        if (schema.items) {
            value.forEach((entry, index) => {
                const child = validateJsonSchema(entry, schema.items, `${path}[${index}]`)
                errors.push(...child.errors)
            })
        }
    }

    return { valid: errors.length === 0, errors }
}

const parseCsvLine = (line) => {
    const fields = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const next = line[i + 1]

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (char === ',' && !inQuotes) {
            fields.push(current)
            current = ''
            continue
        }

        current += char
    }

    fields.push(current)
    return fields
}

const parseCsv = (text, hasHeader = true) => {
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = raw.split('\n').filter((line) => line.length > 0)
    if (lines.length === 0) {
        return []
    }

    const rows = lines.map(parseCsvLine)
    if (!hasHeader) {
        return rows.map((row) => {
            const obj = {}
            row.forEach((value, index) => {
                obj[`column${index + 1}`] = value
            })
            return obj
        })
    }

    const headers = rows[0]
    return rows.slice(1).map((row) => {
        const obj = {}
        headers.forEach((header, index) => {
            obj[header] = row[index] != null ? row[index] : ''
        })
        return obj
    })
}

const serializeCsv = (rows, columns) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return ''
    }

    const headers = Array.isArray(columns) && columns.length > 0
        ? columns
        : Object.keys(rows[0] || {})

    const escapeField = (value) => {
        const text = value == null ? '' : String(value)
        if (/[",\n\r]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`
        }
        return text
    }

    const lines = [headers.map(escapeField).join(',')]
    for (const row of rows) {
        lines.push(headers.map((header) => escapeField(row[header])).join(','))
    }
    return lines.join('\n')
}

module.exports = {
    filterArray,
    flattenObject,
    unflattenObject,
    validateJsonSchema,
    parseCsv,
    serializeCsv,
}
