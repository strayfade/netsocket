import { useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'
import panelsMarkup from './panelsMarkup.html?raw'
import { installShellLogicBridge, startNtpResync, stopNtpResync } from '@/lib/ntp'
import { loadScriptsSequential } from '@/lib/loadScript'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

declare global {
  interface Window {
    startNetsocketPanels?: () => void
    stopNetsocketPanels?: () => void
  }
}

export function PanelsPage() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = panelsMarkup

    // Prefer React header button styling: hide legacy header CTA if present,
    // and wire New Panel through the bootstrap-bound #new-panel-open.
    const legacyHeader = host.querySelector('.panels-header') as HTMLElement | null
    if (legacyHeader) legacyHeader.style.display = 'none'

    let cancelled = false
    void (async () => {
      installShellLogicBridge()
      await loadScriptsSequential([
        '/js/agentMarkdown.js',
        '/vendor/gridstack-all.js',
        '/js/widgets.js',
        '/js/widgetEditor.js',
        '/js/panelDevicePicker.js',
        '/js/panelsBootstrap.js',
      ])
      if (cancelled) return
      startNtpResync()
      window.startNetsocketPanels?.()
    })()

    return () => {
      cancelled = true
      window.stopNetsocketPanels?.()
      stopNtpResync()
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Room panels</h1>
            <Badge variant="secondary">Live</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Live previews with real data. Actions sit underneath each preview.
          </p>
        </div>
        <Button
          onClick={() => document.getElementById('new-panel-open')?.click()}
        >
          <Plus className="h-4 w-4" />
          New Panel
        </Button>
      </div>
      <Separator />
      <div ref={hostRef} className="panels-page-host min-h-[200px]">
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    </div>
  )
}
