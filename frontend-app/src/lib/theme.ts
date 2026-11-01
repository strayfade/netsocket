export type ThemeId = 'oled'

const THEME_STORAGE_KEY = 'netsocket.theme'

export function getTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'oled') return stored
  } catch {
    /* ignore */
  }
  return 'oled'
}

export function setTheme(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export function initTheme() {
  setTheme(getTheme())
}
