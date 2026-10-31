import { useEffect, useRef } from 'react'
import { loadScript } from '@/lib/loadScript'

/**
 * Host DOM for settingsModal.js (devices, smart home, AI providers, OTP,
 * Aria, preference registry, rendering). Opened via #open-settings.
 */
export function SettingsHost() {
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    void loadScript('/js/settingsModal.js')
  }, [])

  return (
    <div id="settings-modal" style={{ display: 'none', position: 'fixed', inset: 0, zIndex: 50 }}>
      <div id="settings-backdrop" className="settings-backdrop" aria-hidden="true" />
      <div className="settings-shell" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        <div id="settings-sidebar">
          <div className="settings-sidebar-top">
            <button type="button" id="close-settings" className="settings-close-btn" aria-label="Close settings">
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>
          <div id="settings-tabs-container" />
        </div>
        <div id="settings-content">
          <span id="settings-modal-title" className="visually-hidden">
            Application settings
          </span>
          <div id="settings-panels-scroll" className="ns-scroll" />
        </div>
      </div>
    </div>
  )
}
