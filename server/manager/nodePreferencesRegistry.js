const prefs = []
const seenIds = new Set()

const addPref = (category, id, displayName, type, defaultVal, description) => {
    if (seenIds.has(id)) return
    seenIds.add(id)
    prefs.push({
        category,
        id,
        displayName,
        type,
        defaultVal,
        description: description != null && description !== '' ? String(description) : ''
    })
}

const getPrefs = () =>
    [...prefs].sort((a, b) => {
        const c = a.category.localeCompare(b.category)
        if (c !== 0) return c
        return a.displayName.localeCompare(b.displayName)
    })

module.exports = { addPref, getPrefs }
