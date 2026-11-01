import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import kioskMarkup from './kioskMarkup.html?raw'
import { installShellLogicBridge, startNtpResync, stopNtpResync } from '@/lib/ntp'
import { loadScriptsSequential } from '@/lib/loadScript'

declare global {
  interface Window {
    startNetsocketPanelKiosk?: (panelId: string) => void
    stopNetsocketPanelKiosk?: () => void
  }
}

export function KioskPage() {
  const { panelId = '' } = useParams()
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !panelId) return
    host.innerHTML = kioskMarkup

    let cancelled = false
    void (async () => {
      installShellLogicBridge()
      await loadScriptsSequential([
        '/js/agentMarkdown.js',
        '/vendor/gridstack-all.js',
        '/js/widgets.js',
        '/js/panelKioskBootstrap.js',
      ])
      if (cancelled) return
      startNtpResync()
      window.startNetsocketPanelKiosk?.(panelId)
    })()

    return () => {
      cancelled = true
      window.stopNetsocketPanelKiosk?.()
      stopNtpResync()
    }
  }, [panelId])

  return (
    <main className="kiosk-wrap min-h-screen bg-black">
      <div ref={hostRef} />
    </main>
  )
}
