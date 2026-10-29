'use strict';

const fs = require('fs')
const path = require('path')
const { config } = require('../config')
const {
    MAX_WIDGETS,
    DEFAULT_CLOCK_SIZE,
    DEFAULT_CONTENT_SIZE,
    DEFAULT_WIDGET_STYLE,
    normalizeWidgetStyle,
    validateWidgetList,
    flowLayout,
} = require('./widgetSchema')

const LAYOUT_PATH = config.storage.dashboard

// Legacy v1 kinds. stats/automations/weather were removed; clock/markdown/
// html migrate to positioned grid widgets. Dropped kinds are counted so the
// UI can toast once about what disappeared.
const LEGACY_DROPPED_KINDS = Object.freeze(['stats', 'automations', 'weather'])

/** @type {{ version: number, widgets: Array<object>, droppedLegacy: object, widgetStyle: string }} */
let layout = { version: 2, widgets: [], droppedLegacy: {}, widgetStyle: DEFAULT_WIDGET_STYLE }

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
    writeJsonAtomic(LAYOUT_PATH, layout)
}

const defaultWidgets = () => ([
    { id: 'w1', type: 'clock', x: 0, y: 0, ...DEFAULT_CLOCK_SIZE },
])

/**
 * Migrate a v1 widget list ({kind, variable?}) to the grid schema.
 * Returns { widgets, dropped } where dropped counts removed legacy kinds.
 * The automations card cannot expand without graph data, so it is dropped
 * here; per-button widgets are re-added from the layout editor instead.
 */
const migrateV1Widgets = (list) => {
    const sized = []
    const dropped = {}
    for (const entry of Array.isArray(list) ? list : []) {
        const kind = entry && typeof entry.kind === 'string' ? entry.kind : ''
        if (LEGACY_DROPPED_KINDS.includes(kind)) {
            dropped[kind] = (dropped[kind] || 0) + 1
            continue
        }
        if (kind === 'clock') {
            sized.push({ type: 'clock', ...DEFAULT_CLOCK_SIZE })
            continue
        }
        if ((kind === 'markdown' || kind === 'html')
            && typeof entry.variable === 'string' && entry.variable.trim()) {
            sized.push({
                type: kind,
                variable: entry.variable.trim().slice(0, 128),
                ...DEFAULT_CONTENT_SIZE,
            })
            continue
        }
        dropped.unknown = (dropped.unknown || 0) + 1
    }
    const widgets = flowLayout(sized).map((w, index) => ({ id: `w${index + 1}`, ...w }))
    return { widgets, dropped }
}

const load = () => {
    if (!fs.existsSync(LAYOUT_PATH)) {
        layout = {
            version: 2,
            widgets: defaultWidgets(),
            droppedLegacy: {},
            widgetStyle: DEFAULT_WIDGET_STYLE,
        }
        persist()
        return
    }
    const raw = loadJsonFile(LAYOUT_PATH, { version: 2, widgets: [] })
    const list = raw && Array.isArray(raw.widgets) ? raw.widgets : []
    const style = normalizeWidgetStyle(raw && raw.widgetStyle) || DEFAULT_WIDGET_STYLE
    try {
        if (raw && raw.version !== 2) {
            const { widgets, dropped } = migrateV1Widgets(list)
            layout = {
                version: 2,
                widgets: validateWidgetList(widgets),
                droppedLegacy: dropped,
                widgetStyle: style,
            }
            persist()
            return
        }
        layout = {
            version: 2,
            widgets: validateWidgetList(list),
            droppedLegacy: raw && typeof raw.droppedLegacy === 'object' && raw.droppedLegacy
                ? raw.droppedLegacy
                : {},
            widgetStyle: style,
        }
    } catch {
        layout = {
            version: 2,
            widgets: [],
            droppedLegacy: {},
            widgetStyle: DEFAULT_WIDGET_STYLE,
        }
    }
}

const getLayout = () => JSON.parse(JSON.stringify(layout))

const replaceLayout = (widgets, options = {}) => {
    const next = validateWidgetList(widgets)
    let style = layout.widgetStyle || DEFAULT_WIDGET_STYLE
    if (options && Object.prototype.hasOwnProperty.call(options, 'widgetStyle')) {
        const clean = normalizeWidgetStyle(options.widgetStyle)
        if (clean == null) throw new Error('invalid_widget_style')
        style = clean
    }
    layout = {
        version: 2,
        widgets: next,
        droppedLegacy: {},
        widgetStyle: style,
    }
    persist()
    return getLayout()
}

const setWidgetStyle = (widgetStyle) => {
    const clean = normalizeWidgetStyle(widgetStyle)
    if (clean == null) throw new Error('invalid_widget_style')
    layout.widgetStyle = clean
    persist()
    return getLayout()
}

const boundVariableNames = () => {
    const names = []
    for (const widget of layout.widgets) {
        if ((widget.type === 'markdown' || widget.type === 'html')
            && widget.variable && !names.includes(widget.variable)) {
            names.push(widget.variable)
        }
    }
    return names
}

const resetForTests = () => {
    layout = {
        version: 2,
        widgets: [],
        droppedLegacy: {},
        widgetStyle: DEFAULT_WIDGET_STYLE,
    }
}

load()

module.exports = {
    LAYOUT_PATH,
    MAX_WIDGETS,
    LEGACY_DROPPED_KINDS,
    load,
    getLayout,
    replaceLayout,
    setWidgetStyle,
    boundVariableNames,
    migrateV1Widgets,
    resetForTests,
}
