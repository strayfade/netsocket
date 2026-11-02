import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import panelsMarkup from './panelsMarkup.html?raw'
import { installShellLogicBridge, startNtpResync, stopNtpResync } from '@/lib/ntp'
import { loadScriptsSequential } from '@/lib/loadScript'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { AddWidgetDialog, type WidgetDraft } from '@/features/widgets/AddWidgetDialog'

declare global {
  interface Window {
    startNetsocketPanels?: () => void
    stopNetsocketPanels?: () => void
  }
}

export function PanelsPage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<HTMLDialogElement | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [automationOptions, setAutomationOptions] = useState<{ value: string; label: string }[]>([])

  // Open/close the top-layer anchor alongside the React dialog so the shared
  // AddWidgetDialog stacks ABOVE the native panel-edit dialog (native dialogs
  // always paint over body-level portals).
  const setAddDialogOpen = (open: boolean) => {
    setAddOpen(open)
    const anchor = anchorRef.current
    if (!anchor) return
    try {
      if (open && !anchor.open) anchor.showModal()
      else if (!open && anchor.open) anchor.close()
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = panelsMarkup

    // Top-layer anchor: transparent 0x0 native <dialog> that hosts the React
    // AddWidgetDialog portal; opened modally so it stacks like the legacy
    // add-widget dialog did. pointer-events:auto matters — Radix disables body
    // pointer events while a modal is open, and this anchor is a body child.
    const anchor = document.createElement('dialog')
    anchor.id = 'panel-react-dialog-anchor'
    anchor.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;background:transparent;max-width:none;max-height:none;overflow:visible;pointer-events:auto;'
    document.body.appendChild(anchor)
    anchorRef.current = anchor
    const onAnchorCancel = (e: Event) => {
      // Escape on the anchor routes through React state so both close together.
      e.preventDefault()
      setAddDialogOpen(false)
    }
    anchor.addEventListener('cancel', onAnchorCancel)

    // The panel layout editor adds widgets through the shared AddWidgetDialog
    // (same one the dashboard uses) instead of the legacy island dialog. The
    // legacy #panel-add-widget-dialog stays mounted as the island's value
    // bridge: when WidgetEditor.openAddDialog showModal()s it we close it
    // immediately (before any paint) and mirror its freshly fetched automations
    // into the React dialog. Watch the [open] attribute rather than the 'open'
    // event — older Chromium kiosk builds set the attribute without firing it.
    const legacyAddDialog = host.querySelector('#panel-add-widget-dialog') as HTMLDialogElement | null
    let bridgeObserver: MutationObserver | null = null
    if (legacyAddDialog) {
      bridgeObserver = new MutationObserver((mutations) => {
        const opened = mutations.some(
          (m) => m.type === 'attributes' && m.attributeName === 'open' && legacyAddDialog.hasAttribute('open')
        )
        if (!opened) return
        try { legacyAddDialog.close() } catch { /* ignore */ }
        const picker = host.querySelector('#panel-dialog-automation') as HTMLSelectElement | null
        const options: { value: string; label: string }[] = []
        if (picker) {
          Array.prototype.forEach.call(picker.options, (opt: HTMLOptionElement) => {
            if (!opt.value || /\(not runnable\)$/.test(opt.textContent || '')) return
            options.push({ value: opt.value, label: opt.textContent || opt.value })
          })
        }
        setAutomationOptions(options)
        setAddDialogOpen(true)
      })
      bridgeObserver.observe(legacyAddDialog, { attributes: true })
    }

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
      if (bridgeObserver) bridgeObserver.disconnect()
      anchor.removeEventListener('cancel', onAnchorCancel)
      try { anchor.close() } catch { /* ignore */ }
      anchor.remove()
      anchorRef.current = null
      window.stopNetsocketPanels?.()
      stopNtpResync()
    }
  }, [])

  // Hand the validated draft to the island: write it into the legacy dialog's
  // (closed) controls and press its Add button — WidgetEditor validates the
  // same rules, adds the widget to the edit grid and PATCHes the panel.
  const addPanelWidget = (draft: WidgetDraft): boolean => {
    const sel = (id: string) => document.getElementById(id)
    const kindEl = sel('panel-dialog-kind') as HTMLSelectElement | null
    if (kindEl) {
      kindEl.value = draft.kind
      kindEl.dispatchEvent(new Event('change'))
    }
    const varEl = sel('panel-dialog-variable') as HTMLInputElement | null
    if (varEl) varEl.value = draft.variable
    const autoEl = sel('panel-dialog-automation') as HTMLSelectElement | null
    if (autoEl) autoEl.value = draft.automationId
    const showNameEl = sel('panel-dialog-show-name') as HTMLInputElement | null
    if (showNameEl) showNameEl.checked = draft.showName
    const showDateEl = sel('panel-dialog-show-date') as HTMLInputElement | null
    if (showDateEl) showDateEl.checked = draft.showDate
    const locationEl = sel('panel-dialog-location') as HTMLInputElement | null
    if (locationEl) locationEl.value = draft.location
    const unitEl = sel('panel-dialog-unit') as HTMLSelectElement | null
    if (unitEl) unitEl.value = draft.unit
    const gradientEl = sel('panel-dialog-gradient') as HTMLInputElement | null
    if (gradientEl) gradientEl.checked = draft.gradient
    const addBtn = sel('panel-dialog-add')
    if (!addBtn) return false
    addBtn.click()
    return true
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Room panels</h1>
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

      <AddWidgetDialog
        open={addOpen}
        onOpenChange={setAddDialogOpen}
        automationOptions={automationOptions}
        onAdd={addPanelWidget}
        portalContainer={anchorRef.current}
        popperContainer={anchorRef.current}
      />
    </div>
  )
}
