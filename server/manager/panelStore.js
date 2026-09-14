'use strict';

const fs = require('fs')
const path = require('path')
const { config } = require('../config')

const PANELS_PATH = config.storage.panels

const MAX_AUTOMATIONS_PER_PANEL = 100
const MAX_DEVICES_PER_PANEL = 20
const MAX_DEVICE_ID_LENGTH = 128

/** @type {{ version: number, panels: Record<string, object> }} */
let store = { version: 1, panels: {} }

const loadJsonFile = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) return fallback
        const raw = fs.readFileSync(filePath, 'utf8')
        if (!raw.trim()) return fallback
        return JSON.parse(raw)
    } catch {
        return fallback
    }
}

const writeJsonAtomic = (filePath, data) => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    const tmp = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, filePath)
}

const persist = () => {
    writeJsonAtomic(PANELS_PATH, store)
}

const normalizeDeviceIds = (value) => {
    if (value == null) return []
    if (!Array.isArray(value)) return null
    if (value.length > MAX_DEVICES_PER_PANEL) return null
    const ids = []
    for (const entry of value) {
        if (typeof entry !== 'string') return null
        const id = entry.trim()
        if (!id || id.length > MAX_DEVICE_ID_LENGTH) return null
        if (!ids.includes(id)) ids.push(id)
    }
    return ids
}

const load = () => {
    const raw = loadJsonFile(PANELS_PATH, { version: 2, panels: {} })
    const panels = raw && typeof raw.panels === 'object' && raw.panels ? raw.panels : {}
    let migrated = false
    for (const panel of Object.values(panels)) {
        if (!panel || typeof panel !== 'object') continue
        if (!Array.isArray(panel.deviceIds)) panel.deviceIds = []
        // Drop legacy per-panel token material (auth is sessions + device grants now).
        delete panel.tokenHash
        delete panel.deviceTokens
        delete panel.revoked
        // All automations are now allowed on every panel; drop legacy allowlist.
        if (panel.automationIds !== undefined) {
            if (Array.isArray(panel.automationIds) && panel.automationIds.length) migrated = true
            panel.automationIds = []
        } else {
            panel.automationIds = []
        }
        try {
            const next = normalizeWidgets(panel.widgets, [])
            if (JSON.stringify(next) !== JSON.stringify(panel.widgets)) migrated = true
            panel.widgets = next
        } catch {
            panel.widgets = normalizeWidgets(null)
            migrated = true
        }
    }
    store = { version: 2, panels }
    if (migrated) persist()
}

const normalizePanelId = (value) => {
    if (value == null) return null
    const trimmed = String(value).trim().toLowerCase()
    return trimmed || null
}

const isValidPanelId = (value) => {
    return typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value)
}

const slugify = (value) => {
    const slug = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
    return slug || 'panel'
}

const normalizeName = (value) => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().slice(0, 120)
    return trimmed || null
}

const {
    MAX_WIDGETS,
    VARIABLE_WIDGET_TYPES,
    DEFAULT_CLOCK_SIZE,
    DEFAULT_CONTENT_SIZE,
    DEFAULT_BUTTON_SIZE,
    normalizeVariable,
    normalizeAutomationId,
    validateWidgetList,
    flowLayout,
} = require('./widgetSchema')

/**
 * Migrate a legacy panel widget list (strings + {type, variable} objects
 * without positions) to the grid schema. The legacy `automations` toggle
 * expands into one 1x1 button per allowlisted automation. Legacy `weather`
 * had no function and is dropped (counted). Returns { widgets, dropped }.
 */
const migrateLegacyPanelWidgets = (value, automationIds) => {
    const sized = []
    const dropped = {}
    const aids = Array.isArray(automationIds) ? automationIds.map((id) => String(id)) : []
    for (const entry of Array.isArray(value) ? value : []) {
        if (typeof entry === 'string') {
            const name = entry.trim().toLowerCase()
            if (name === 'clock') {
                sized.push({ type: 'clock', ...DEFAULT_CLOCK_SIZE })
            } else if (name === 'automations') {
                for (const automationId of aids) {
                    sized.push({ type: 'button', automationId, ...DEFAULT_BUTTON_SIZE })
                }
            } else if (name === 'weather') {
                dropped.weather = (dropped.weather || 0) + 1
            } else {
                dropped.unknown = (dropped.unknown || 0) + 1
            }
            continue
        }
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : ''
            if (type === 'markdown' || type === 'html') {
                const variable = normalizeVariable(entry.variable)
                if (!variable) {
                    dropped.unknown = (dropped.unknown || 0) + 1
                    continue
                }
                sized.push({ type, variable, ...DEFAULT_CONTENT_SIZE })
                continue
            }
            if (type === 'clock') {
                sized.push({ type: 'clock', ...DEFAULT_CLOCK_SIZE })
                continue
            }
            if (type === 'button') {
                const automationId = normalizeAutomationId(entry.automationId)
                if (!automationId) {
                    dropped.unknown = (dropped.unknown || 0) + 1
                    continue
                }
                sized.push({ type: 'button', automationId, ...DEFAULT_BUTTON_SIZE })
                continue
            }
        }
        dropped.unknown = (dropped.unknown || 0) + 1
    }
    const widgets = flowLayout(sized).map((w, index) => ({ id: `w${index + 1}`, ...w }))
    return { widgets, dropped }
}

const isNewShape = (value) => Array.isArray(value)
    && value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
        && typeof entry.type === 'string');

/**
 * Normalize a panel widget list to the grid schema. New-shape arrays are
 * validated as-is; legacy arrays are migrated (needs the panel's
 * automationIds to expand the automations toggle into buttons).
 * Null/undefined yields a blank panel (no widgets).
 */
const normalizeWidgets = (value, automationIds = []) => {
    if (value == null) {
        return []
    }
    if (!Array.isArray(value)) return null
    if (value.length && !isNewShape(value)) {
        const { widgets } = migrateLegacyPanelWidgets(value, automationIds)
        return validateWidgetList(widgets)
    }
    return validateWidgetList(value)
}

/** Variable names bound to a panel's markdown/html widgets. */
const boundVariableNames = (panel) => {
    const names = []
    for (const widget of panel?.widgets || []) {
        if (widget && typeof widget === 'object'
            && VARIABLE_WIDGET_TYPES.includes(widget.type)
            && typeof widget.variable === 'string'
            && !names.includes(widget.variable)) {
            names.push(widget.variable)
        }
    }
    return names
}

const normalizeAutomationIds = (value) => {
    if (value == null) return []
    if (!Array.isArray(value)) return null
    if (value.length > MAX_AUTOMATIONS_PER_PANEL) return null
    const ids = []
    for (const entry of value) {
        if (entry == null) return null
        const id = String(entry).trim()
        if (!id || id.length > 128) return null
        if (!ids.includes(id)) ids.push(id)
    }
    return ids
}

const publicPanelView = (panel) => {
    if (!panel) return null
    return {
        id: panel.id,
        name: panel.name || '',
        room: panel.room || '',
        widgets: Array.isArray(panel.widgets)
            ? panel.widgets.map((w) => (w && typeof w === 'object' ? { ...w } : w))
            : [],
        automationIds: Array.isArray(panel.automationIds) ? [...panel.automationIds] : [],
        deviceIds: Array.isArray(panel.deviceIds) ? [...panel.deviceIds] : [],
        createdAt: panel.createdAt || null,
        updatedAt: panel.updatedAt || null,
        lastSeenAt: panel.lastSeenAt || null,
    }
}

const listPanels = () => {
    return Object.values(store.panels)
        .map(publicPanelView)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

const getPanel = (panelId) => {
    const id = normalizePanelId(panelId)
    if (!id) return null
    return store.panels[id] || null
}

const getPanelPublic = (panelId) => publicPanelView(getPanel(panelId))

const uniqueIdFor = (base) => {
    let candidate = base
    let suffix = 2
    while (store.panels[candidate]) {
        candidate = `${base}-${suffix}`
        suffix += 1
    }
    return candidate
}

const createPanel = ({ id, name, room, widgets, deviceIds } = {}) => {
    const cleanName = normalizeName(name)
    if (!cleanName) throw new Error('name_required')
    const cleanAutomationIds = []
    const cleanWidgets = normalizeWidgets(widgets, cleanAutomationIds)
    if (!cleanWidgets) throw new Error('invalid_widgets')
    const cleanDeviceIds = normalizeDeviceIds(deviceIds)
    if (!cleanDeviceIds) throw new Error('invalid_device_ids')
    const requestedId = normalizePanelId(id)
    if (requestedId != null && !isValidPanelId(requestedId)) throw new Error('invalid_id')
    if (requestedId != null && store.panels[requestedId]) throw new Error('id_taken')
    const finalId = requestedId || uniqueIdFor(slugify(cleanName))
    const now = Date.now()
    const panel = {
        id: finalId,
        name: cleanName,
        room: normalizeName(room) || '',
        widgets: cleanWidgets,
        automationIds: cleanAutomationIds,
        deviceIds: cleanDeviceIds,
        createdAt: now,
        updatedAt: now,
        lastSeenAt: null,
    }
    store.panels[finalId] = panel
    persist()
    return { panel: publicPanelView(panel) }
}

const updatePanel = (panelId, { name, room, widgets, deviceIds } = {}) => {
    const panel = getPanel(panelId)
    if (!panel) return null
    if (name !== undefined) {
        const cleanName = normalizeName(name)
        if (!cleanName) throw new Error('name_required')
        panel.name = cleanName
    }
    if (room !== undefined) {
        panel.room = room == null || room === '' ? '' : (normalizeName(room) || '')
        if (room != null && String(room).trim() !== '' && !panel.room) throw new Error('invalid_room')
    }
    // automationIds is deprecated; ignore any value and keep [].
    panel.automationIds = []
    if (widgets !== undefined) {
        const cleanWidgets = normalizeWidgets(widgets, [])
        if (!cleanWidgets) throw new Error('invalid_widgets')
        panel.widgets = cleanWidgets
    }
    if (deviceIds !== undefined) {
        const cleanDeviceIds = normalizeDeviceIds(deviceIds)
        if (!cleanDeviceIds) throw new Error('invalid_device_ids')
        panel.deviceIds = cleanDeviceIds
    }
    panel.updatedAt = Date.now()
    persist()
    return publicPanelView(panel)
}

const deletePanel = (panelId) => {
    const id = normalizePanelId(panelId)
    if (!id || !store.panels[id]) return false
    delete store.panels[id]
    persist()
    return true
}

/** The stored panel record when the device is granted to it, else null. */
const verifyDeviceForPanel = (deviceId, panelId) => {
    const panel = getPanel(panelId)
    if (!panel) return null
    if (typeof deviceId !== 'string' || !deviceId) return null
    if (!(panel.deviceIds || []).includes(deviceId)) return null
    return panel
}

/** Panels (public view) granted to a device. */
const panelsForDevice = (deviceId) => {
    if (typeof deviceId !== 'string' || !deviceId) return []
    return Object.values(store.panels)
        .filter((panel) => panel
            && Array.isArray(panel.deviceIds)
            && panel.deviceIds.includes(deviceId))
        .map(publicPanelView)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

const touchLastSeen = (panelId) => {
    const panel = getPanel(panelId)
    if (!panel) return
    panel.lastSeenAt = Date.now()
    persist()
}

const resetForTests = () => {
    store = { version: 2, panels: {} }
}

load()

module.exports = {
    PANELS_PATH,
    migrateLegacyPanelWidgets,
    normalizeWidgets,
    boundVariableNames,
    MAX_AUTOMATIONS_PER_PANEL,
    MAX_DEVICES_PER_PANEL,
    load,
    listPanels,
    getPanel,
    getPanelPublic,
    createPanel,
    updatePanel,
    deletePanel,
    verifyDeviceForPanel,
    panelsForDevice,
    touchLastSeen,
    normalizePanelId,
    isValidPanelId,
    publicPanelView,
    resetForTests,
}
