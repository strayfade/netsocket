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

const addPref = (category, id, displayName, type, defaultVal, description, options) => {
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
