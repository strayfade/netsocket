'use strict';

// Unified widget schema shared by the dashboard layout and per-panel layouts.
// Every widget is a grid item: { id, type, x, y, w, h } plus a binding for
// button (automationId) and markdown/html (variable) types.
//
// Fixed size presets (w x h in grid units, 12-column grid):
//   every widget type: 1x1 … 4x4 (all width/height pairs)

const GRID_COLUMNS = 12
const MAX_ROW_SPAN = 12
const MAX_WIDGETS = 100
const MAX_VARIABLE_LENGTH = 128
const MAX_AUTOMATION_ID_LENGTH = 128
const MAX_PRESET_SPAN = 4

const WIDGET_TYPES = Object.freeze(['button', 'clock', 'markdown', 'html'])
const VARIABLE_WIDGET_TYPES = Object.freeze(['markdown', 'html'])

const buildSizePresets = (maxSpan = MAX_PRESET_SPAN) => {
    const presets = []
    for (let w = 1; w <= maxSpan; w++) {
        for (let h = 1; h <= maxSpan; h++) {
            presets.push(Object.freeze({ w, h }))
        }
    }
    return Object.freeze(presets)
}

const ALL_SIZE_PRESETS = buildSizePresets()

const TYPE_PRESETS = Object.freeze({
    button: ALL_SIZE_PRESETS,
    clock: ALL_SIZE_PRESETS,
    markdown: ALL_SIZE_PRESETS,
    html: ALL_SIZE_PRESETS,
})

const DEFAULT_CLOCK_SIZE = Object.freeze({ w: 4, h: 2 })
const DEFAULT_CONTENT_SIZE = Object.freeze({ w: 4, h: 2 })
const DEFAULT_BUTTON_SIZE = Object.freeze({ w: 1, h: 1 })

const isInt = (value) => typeof value === 'number' && Number.isInteger(value)

const normalizeId = (value, fallback) => {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return value
    return fallback
}

const normalizeVariable = (value) => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim().slice(0, MAX_VARIABLE_LENGTH)
    return trimmed || null
}

const normalizeAutomationId = (value) => {
    if (value == null) return null
    const id = String(value).trim().slice(0, MAX_AUTOMATION_ID_LENGTH)
    return id || null
}

const normalizePosition = (entry) => {
    const x = isInt(entry.x) ? entry.x : 0
    const y = isInt(entry.y) ? entry.y : 0
    const w = isInt(entry.w) ? entry.w : 1
    const h = isInt(entry.h) ? entry.h : 1
    if (x < 0 || x >= GRID_COLUMNS || y < 0 || y > 99) return null
    if (w < 1 || w > GRID_COLUMNS || h < 1 || h > MAX_ROW_SPAN) return null
    if (x + w > GRID_COLUMNS) return null
    return { x, y, w, h }
};

/**
 * Validate one widget entry into canonical shape. Throws invalid_* errors.
 * Preset sizes are an editor UX concern; the server accepts any in-bounds box.
 */
const validateWidget = (entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('invalid_widget')
    }
    const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : ''
    if (!WIDGET_TYPES.includes(type)) throw new Error('invalid_type')
    const pos = normalizePosition(entry)
    if (!pos) throw new Error('invalid_widget')
    const widget = { id: normalizeId(entry.id, `w${index + 1}`), type, ...pos }
    if (type === 'button') {
        const automationId = normalizeAutomationId(entry.automationId)
        if (!automationId) throw new Error('automation_required')
        widget.automationId = automationId
        if (entry.showName === true) widget.showName = true
    }
    if (VARIABLE_WIDGET_TYPES.includes(type)) {
        const variable = normalizeVariable(entry.variable)
        if (!variable) throw new Error('variable_required')
        widget.variable = variable
    }
    return widget
}

const validateWidgetList = (widgets) => {
    if (!Array.isArray(widgets)) throw new Error('invalid_layout')
    if (widgets.length > MAX_WIDGETS) throw new Error('too_many_widgets')
    return widgets.map((entry, index) => validateWidget(entry, index))
};

/**
 * Next-fit shelf pack: assign positions to size-known widgets in order.
 * GridStack compacts on load anyway; this just avoids initial overlap.
 */
const flowLayout = (sized) => {
    let x = 0
    let y = 0
    let rowH = 0
    return sized.map((entry) => {
        const w = Math.min(entry.w, GRID_COLUMNS)
        if (x + w > GRID_COLUMNS) {
            x = 0
            y += rowH
            rowH = 0
        }
        const placed = { ...entry, x, y, w }
        x += w
        rowH = Math.max(rowH, entry.h)
        return placed
    })
};

const presetFor = (type, presetIndex = 0) => {
    const presets = TYPE_PRESETS[type] || TYPE_PRESETS.markdown
    return presets[Math.min(Math.max(presetIndex, 0), presets.length - 1)]
};

module.exports = {
    GRID_COLUMNS,
    MAX_ROW_SPAN,
    MAX_WIDGETS,
    MAX_VARIABLE_LENGTH,
    MAX_AUTOMATION_ID_LENGTH,
    WIDGET_TYPES,
    VARIABLE_WIDGET_TYPES,
    TYPE_PRESETS,
    DEFAULT_CLOCK_SIZE,
    DEFAULT_CONTENT_SIZE,
    DEFAULT_BUTTON_SIZE,
    normalizeVariable,
    normalizeAutomationId,
    validateWidget,
    validateWidgetList,
    flowLayout,
    presetFor,
}
