'use strict'

const settingsManager = require('./settingsManager')
const { addPref } = require('./nodePreferencesRegistry')

const DEFAULT_TAB_SETTING = 'ui.defaultTab'
const DEFAULT_TAB = 'automate'

const TAB_OPTIONS = Object.freeze([
    Object.freeze({ value: 'automate', label: 'Automate' }),
    Object.freeze({ value: 'dashboard', label: 'Dashboard' }),
    Object.freeze({ value: 'panels', label: 'Panels' }),
])

const TAB_PATHS = Object.freeze({
    dashboard: '/dashboard',
    automate: '/automate',
    panels: '/panels',
})

addPref(
    'Interface',
    DEFAULT_TAB_SETTING,
    'Default tab',
    'select',
    DEFAULT_TAB,
    '<p>Where <code>/</code> and post-login navigation land: Dashboard, Automate, or Panels.</p>',
    TAB_OPTIONS
)

const normalizeDefaultTab = (value) => {
    const key = String(value == null ? '' : value).trim().toLowerCase()
    return Object.prototype.hasOwnProperty.call(TAB_PATHS, key) ? key : DEFAULT_TAB
}

const resolveDefaultTab = () => {
    const stored = settingsManager.getStoredValue(DEFAULT_TAB_SETTING)
    if (stored === undefined) return DEFAULT_TAB
    return normalizeDefaultTab(stored)
}

const resolveDefaultTabPath = () => TAB_PATHS[resolveDefaultTab()]

module.exports = {
    DEFAULT_TAB_SETTING,
    DEFAULT_TAB,
    TAB_OPTIONS,
    TAB_PATHS,
    normalizeDefaultTab,
    resolveDefaultTab,
    resolveDefaultTabPath,
}
