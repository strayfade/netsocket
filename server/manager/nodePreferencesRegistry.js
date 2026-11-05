const prefs = []
const seenIds = new Set()

const normalizeOptions = (options) => {
    if (!Array.isArray(options)) return undefined
    const cleaned = []
    for (const opt of options) {
        if (opt && typeof opt === 'object') {
            const value = opt.value != null ? String(opt.value) : ''
            if (!value) continue
            cleaned.push({
                value,
                label: opt.label != null && String(opt.label) !== '' ? String(opt.label) : value,
            })
            continue
        }
        if (opt == null) continue
        const value = String(opt)
        if (!value) continue
        cleaned.push({ value, label: value })
    }
    return cleaned.length ? cleaned : undefined
}

/**
 * `secret` marks a pref whose stored value is itself a secret (a token, a Base32 TOTP seed). Callers that
 * expose prefs must mask flagged prefs even when the id matches no secret keyword — field semantics, not a
 * name heuristic.
 */
const addPref = (category, id, displayName, type, defaultVal, description, options, secret = false) => {
    if (seenIds.has(id)) return
    seenIds.add(id)
    const entry = {
        category,
        id,
        displayName,
        type,
        defaultVal,
        description: description != null && description !== '' ? String(description) : ''
    }
    if (secret) entry.secret = true
    if (type === 'select') {
        const normalized = normalizeOptions(options)
        if (normalized) entry.options = normalized
    }
    prefs.push(entry)
}

const getPrefs = () =>
    [...prefs].sort((a, b) => {
        const c = a.category.localeCompare(b.category)
        if (c !== 0) return c
        return a.displayName.localeCompare(b.displayName)
    })

module.exports = { addPref, getPrefs }
