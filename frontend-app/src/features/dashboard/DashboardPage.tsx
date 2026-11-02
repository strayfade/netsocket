import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Check } from 'lucide-react'
import { getDashboardSummary, putDashboardLayout, runDashboardAutomation } from '@/lib/api'
import { installShellLogicBridge, startNtpResync, stopNtpResync, setNtpTime } from '@/lib/ntp'
import { loadScriptsSequential } from '@/lib/loadScript'
import { connectVarsSocket } from '@/lib/ws'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, FieldRow } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { Automation, Widget } from '@/lib/api'

declare global {
  interface Window {
    Widgets?: {
      createItem: (widget: Widget, ctx: unknown) => HTMLElement | null
      syncItemSize?: (el: HTMLElement) => void
      syncGridSizes?: (root: HTMLElement) => void
    }
    WidgetEditor?: { tickClock: () => void }
    GridStack?: {
      init: (opts: unknown, el: HTMLElement) => {
        destroy: (remove?: boolean) => void
        setStatic: (v: boolean) => void
        save: (saveContent?: boolean) => Array<{ id: string; x: number; y: number; w: number; h: number }>
        on: (event: string, cb: (...args: unknown[]) => void) => void
      }
    }
    renderAgentMarkdown?: (text: string) => string
  }
}

const STYLE_OPTIONS = [
  { value: 'classic', label: 'Classic' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'soft', label: 'Soft' },
  { value: 'vivid', label: 'Vivid' },
  { value: 'neon', label: 'Neon' },
]

const KIND_OPTIONS = [
  { value: 'button', label: 'Run Button' },
  { value: 'clock', label: 'Clock' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'timer', label: 'Timer' },
  { value: 'weather', label: 'Weather' },
]

const UNIT_OPTIONS = [
  { value: 'f', label: '°F (imperial)' },
  { value: 'c', label: '°C (metric)' },
]

const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  button: { w: 1, h: 1 },
  clock: { w: 4, h: 2 },
  markdown: { w: 4, h: 2 },
  html: { w: 4, h: 2 },
  timer: { w: 4, h: 4 },
  weather: { w: 4, h: 3 },
}

type GridApi = NonNullable<NonNullable<typeof window.GridStack>['init']> extends (
  ...args: infer _
) => infer R
  ? R
  : never

export function DashboardPage() {
  const gridRef = useRef<HTMLDivElement>(null)
  const gridApi = useRef<GridApi | null>(null)
  const widgetsRef = useRef<Widget[]>([])
  const varsRef = useRef<Record<string, string>>({})
  const autosRef = useRef<Automation[]>([])
  const weatherRef = useRef<Record<string, unknown>>({})
  const styleRef = useRef('classic')
  const editingRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [widgetStyle, setWidgetStyle] = useState('classic')
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [kind, setKind] = useState('clock')
  const [variable, setVariable] = useState('')
  const [automationId, setAutomationId] = useState('')
  const [showName, setShowName] = useState(false)
  const [showDate, setShowDate] = useState(true)
  const [wxLocation, setWxLocation] = useState('')
  const [wxUnit, setWxUnit] = useState('f')
  const [wxGradient, setWxGradient] = useState(true)

  const automationOptions = useMemo(
    () =>
      automations
        .filter((a) => a.runnable)
        .map((a) => ({
          value: String(a.id),
          label: a.title || a.type || String(a.id),
        })),
    [automations],
  )

  const refreshVarContent = useCallback((name: string, value: string) => {
    varsRef.current[name] = value
    document.querySelectorAll(`[data-var-content="${CSS.escape(name)}"]`).forEach((node) => {
      ;(node as HTMLElement).innerHTML = window.renderAgentMarkdown
        ? window.renderAgentMarkdown(value)
        : ''
    })
    document.querySelectorAll(`[data-var-frame="${CSS.escape(name)}"]`).forEach((frame) => {
      ;(frame as HTMLIFrameElement).srcdoc = value
    })
  }, [])

  const runAutomation = useCallback(async (item: Automation, btn?: HTMLButtonElement) => {
    try {
      await runDashboardAutomation(item.id)
    } catch {
      toast('Run failed')
    } finally {
      if (btn) btn.disabled = false
    }
  }, [])

  const rebuildGrid = useCallback(() => {
    const container = gridRef.current
    if (!container || !window.GridStack || !window.Widgets) return

    if (gridApi.current) {
      try {
        gridApi.current.destroy(false)
      } catch {
        /* ignore */
      }
      gridApi.current = null
    }
    container.innerHTML = ''
    container.setAttribute('data-widget-style', styleRef.current)

    const list = widgetsRef.current
    list.forEach((widget) => {
      const item = window.Widgets!.createItem(widget, {
        automations: autosRef.current,
        variables: varsRef.current,
        weatherMap: weatherRef.current,
        onRun: runAutomation,
        renderMarkdown: window.renderAgentMarkdown
          ? window.renderAgentMarkdown.bind(window)
          : null,
      })
      if (item) container.appendChild(item)
    })

    try {
      window.WidgetEditor?.tickClock()
    } catch {
      /* ignore */
    }

    const grid = window.GridStack.init(
      {
        column: 12,
        cellHeight: 'auto',
        margin: 0,
        staticGrid: !editingRef.current,
        animate: false,
        float: true,
        draggable: { handle: '.widget-drag-handle' },
        disableResize: false,
        resizable: { handles: 'n,e,s,w,se,sw,ne,nw' },
        columnOpts: { breakpoints: [{ w: 640, c: 4 }] },
      },
      container,
    )
    gridApi.current = grid
    container.classList.toggle('editing', editingRef.current)

    const persistPositions = () => {
      if (!gridApi.current) return
      try {
        const saved = gridApi.current.save(false) || []
        const byId = Object.fromEntries(widgetsRef.current.map((w) => [w.id, w]))
        const next: Widget[] = []
        saved.forEach((node) => {
          const prior = byId[node.id]
          if (!prior) return
          next.push({
            ...prior,
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
          })
        })
        widgetsRef.current.forEach((w) => {
          if (!next.some((n) => n.id === w.id)) next.push(w)
        })
        widgetsRef.current = next
        setWidgets(next)
        void saveLayout(next)
      } catch {
        /* ignore */
      }
    }

    grid.on('change', (...args: unknown[]) => {
      const items = args[1] as Array<{ el?: HTMLElement }> | undefined
      if (window.Widgets?.syncItemSize && Array.isArray(items)) {
        items.forEach((node) => {
          if (node?.el) window.Widgets!.syncItemSize!(node.el)
        })
      }
      if (editingRef.current) persistPositions()
    })
    grid.on('resizestop', (...args: unknown[]) => {
      const el = args[1] as HTMLElement | undefined
      if (el && window.Widgets?.syncItemSize) window.Widgets.syncItemSize(el)
      if (editingRef.current) persistPositions()
    })
    grid.on('dragstop', () => {
      if (editingRef.current) persistPositions()
    })

    if (window.Widgets.syncGridSizes) window.Widgets.syncGridSizes(container)
  }, [runAutomation])

  const saveLayout = useCallback(async (nextWidgets: Widget[]) => {
    setSaving(true)
    try {
      await putDashboardLayout(nextWidgets, styleRef.current)
      toast('Layout saved')
    } catch (e) {
      const err = e as { body?: { error?: string }; status?: number }
      toast(`Save failed: ${err.body?.error || err.status || 'error'}`)
    } finally {
      setSaving(false)
    }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const data = await getDashboardSummary()
      if (data.now != null) setNtpTime(data.now)
      varsRef.current = (data.variables as Record<string, string>) || {}
      weatherRef.current = (data.weather as Record<string, unknown>) || {}
      const autos = Array.isArray(data.automations) ? data.automations : []
      autosRef.current = autos
      setAutomations(autos)
      const style = (data.layout && data.layout.widgetStyle) || 'classic'
      styleRef.current = style
      setWidgetStyle(style)
      let next = data.layout && Array.isArray(data.layout.widgets) ? data.layout.widgets : []
      if (!next.length) next = [{ id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 }]
      widgetsRef.current = next
      setWidgets(next)
      rebuildGrid()
    } catch {
      toast('Could not load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [rebuildGrid])

  useEffect(() => {
    let alive = true
    let clockTimer: ReturnType<typeof setInterval> | null = null
    let summaryTimer: ReturnType<typeof setInterval> | null = null
    let varsClient: ReturnType<typeof connectVarsSocket> | null = null

    void (async () => {
      try {
        installShellLogicBridge()
        await loadScriptsSequential([
          '/js/agentMarkdown.js',
          '/vendor/gridstack-all.js',
          '/js/widgets.js',
          '/js/widgetEditor.js',
        ])
        if (!alive) return
        window.WidgetEditor?.tickClock()
        clockTimer = setInterval(() => window.WidgetEditor?.tickClock(), 15000)
        startNtpResync()
        varsClient = connectVarsSocket((name, value) => refreshVarContent(name, value))
        // Inline first load so a stale callback cannot leave the page spinning.
        try {
          const data = await getDashboardSummary()
          if (!alive) return
          if (data.now != null) setNtpTime(data.now)
          varsRef.current = (data.variables as Record<string, string>) || {}
          weatherRef.current = (data.weather as Record<string, unknown>) || {}
          const autos = Array.isArray(data.automations) ? data.automations : []
          autosRef.current = autos
          setAutomations(autos)
          const style = (data.layout && data.layout.widgetStyle) || 'classic'
          styleRef.current = style
          setWidgetStyle(style)
          let next = data.layout && Array.isArray(data.layout.widgets) ? data.layout.widgets : []
          if (!next.length) next = [{ id: 'w1', type: 'clock', x: 0, y: 0, w: 4, h: 2 }]
          widgetsRef.current = next
          setWidgets(next)
          rebuildGrid()
        } catch (err) {
          console.error(err)
          if (alive) toast('Could not load dashboard data')
        } finally {
          if (alive) setLoading(false)
        }
        if (!alive) return
        summaryTimer = setInterval(() => {
          void loadSummary()
        }, 60000)
      } catch (err) {
        console.error('Dashboard bootstrap failed', err)
        if (alive) {
          toast('Dashboard failed to load scripts')
          setLoading(false)
        }
      }
    })()

    return () => {
      alive = false
      if (clockTimer) clearInterval(clockTimer)
      if (summaryTimer) clearInterval(summaryTimer)
      stopNtpResync()
      varsClient?.close()
      if (gridApi.current) {
        try {
          gridApi.current.destroy(false)
        } catch {
          /* ignore */
        }
      }
    }
    // Bootstrap once on mount; loadSummary/rebuild use refs + stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleEditing = () => {
    const next = !editing
    editingRef.current = next
    setEditing(next)
    if (gridApi.current) {
      try {
        gridApi.current.setStatic(!next)
      } catch {
        /* ignore */
      }
    }
    gridRef.current?.classList.toggle('editing', next)
    if (!next) {
      // save when leaving edit
      try {
        const saved = gridApi.current?.save(false) || []
        const byId = Object.fromEntries(widgetsRef.current.map((w) => [w.id, w]))
        const nextWidgets: Widget[] = []
        saved.forEach((node) => {
          const prior = byId[node.id]
          if (!prior) return
          nextWidgets.push({ ...prior, x: node.x, y: node.y, w: node.w, h: node.h })
        })
        widgetsRef.current = nextWidgets
        setWidgets(nextWidgets)
        void saveLayout(nextWidgets)
      } catch {
        /* ignore */
      }
    }
  }

  const onStyleChange = (value: string) => {
    styleRef.current = value
    setWidgetStyle(value)
    gridRef.current?.setAttribute('data-widget-style', value)
    void saveLayout(widgetsRef.current)
  }

  const addWidget = () => {
    const size = DEFAULT_SIZES[kind] || DEFAULT_SIZES.clock
    const id = `w${Date.now().toString(36)}`
    const widget: Widget = {
      id,
      type: kind,
      x: 0,
      y: 0,
      w: size.w,
      h: size.h,
    }
    if (kind === 'button') {
      if (!automationId) {
        toast('Select an automation')
        return
      }
      widget.automationId = automationId
      if (showName) widget.showName = true
    }
    if (kind === 'markdown' || kind === 'html') {
      if (!variable.trim()) {
        toast('Enter a variable name')
        return
      }
      widget.variable = variable.trim()
    }
    if (kind === 'clock' && !showDate) widget.showDate = false
    if (kind === 'weather') {
      const location = wxLocation.replace(/\s+/g, ' ').trim()
      if (!location) {
        toast('Enter a location')
        return
      }
      widget.location = location.slice(0, 100)
      if (wxUnit === 'c') widget.unit = 'c'
      if (!wxGradient) widget.gradient = false
    }

    const next = [...widgetsRef.current, widget]
    widgetsRef.current = next
    setWidgets(next)
    setAddOpen(false)
    setKind('clock')
    setVariable('')
    setAutomationId('')
    setShowName(false)
    setShowDate(true)
    setWxLocation('')
    setWxUnit('f')
    setWxGradient(true)
    rebuildGrid()
    void saveLayout(next)
  }

  const clearWidgets = () => {
    widgetsRef.current = []
    setWidgets([])
    rebuildGrid()
    void saveLayout([])
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          {saving && (
            <Badge variant="outline" className="gap-1">
              <Spinner className="h-3 w-3" /> Saving
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup>
            <Button variant={editing ? 'default' : 'secondary'} onClick={toggleEditing}>
              {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editing ? 'Done' : 'Edit layout'}
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add widget
            </Button>
          </ButtonGroup>

          <Field className="w-44 gap-1.5">
            <FieldLabel className="sr-only">Widget style</FieldLabel>
            <Combobox
              options={STYLE_OPTIONS}
              value={widgetStyle}
              onValueChange={onStyleChange}
              placeholder="Style"
              searchPlaceholder="Filter styles…"
              aria-label="Widget design style"
            />
          </Field>
        </div>
      </div>

      <Separator />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="relative min-h-[240px]">
            {loading && (
              <div className="absolute inset-0 z-10 grid grid-cols-2 gap-3 p-1 md:grid-cols-3">
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </div>
            )}
            <div ref={gridRef} className="grid-stack" id="dashboard-widgets" data-widget-style={widgetStyle} />
            {!loading && widgets.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-sm text-muted-foreground">No widgets yet. Add a clock or run button to get started.</p>
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add widget
                </Button>
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setAddOpen(true)}>Add widget</ContextMenuItem>
          <ContextMenuItem onSelect={toggleEditing}>
            {editing ? 'Finish editing' : 'Edit layout'}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => void loadSummary()}>Refresh</ContextMenuItem>
          <ContextMenuItem className="text-destructive" onSelect={clearWidgets}>
            Clear all widgets
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add widget</DialogTitle>
            <DialogDescription>
              Placed at a default size — drag corners in Edit layout to resize.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Combobox
                options={KIND_OPTIONS}
                value={kind}
                onValueChange={setKind}
                placeholder="Widget type"
                searchPlaceholder="Filter types…"
              />
            </Field>

            {(kind === 'markdown' || kind === 'html') && (
              <Field>
                <FieldLabel htmlFor="dialog-variable">Variable name</FieldLabel>
                <Input
                  id="dialog-variable"
                  className="font-mono"
                  value={variable}
                  onChange={(e) => setVariable(e.target.value)}
                  placeholder="morning_briefing"
                  maxLength={128}
                />
              </Field>
            )}

            {kind === 'button' && (
              <>
                <Field>
                  <FieldLabel>Automation</FieldLabel>
                  <Combobox
                    options={automationOptions}
                    value={automationId}
                    onValueChange={setAutomationId}
                    placeholder={automationOptions.length ? 'Select automation' : 'No runnable automations'}
                    searchPlaceholder="Search automations…"
                    emptyText="Create a Triggers/Button in Automate first."
                    disabled={!automationOptions.length}
                  />
                  <FieldDescription>
                    Automations are Triggers/Button nodes. Set their Name property to label them here.
                  </FieldDescription>
                </Field>
                <FieldRow>
                  <FieldLabel htmlFor="dialog-show-name">Show name</FieldLabel>
                  <Switch id="dialog-show-name" checked={showName} onCheckedChange={setShowName} />
                </FieldRow>
              </>
            )}

            {kind === 'clock' && (
              <FieldRow>
                <FieldLabel htmlFor="dialog-show-date">Show date</FieldLabel>
                <Switch id="dialog-show-date" checked={showDate} onCheckedChange={setShowDate} />
              </FieldRow>
            )}

            {kind === 'weather' && (
              <>
                <Field>
                  <FieldLabel htmlFor="dialog-wx-location">Location</FieldLabel>
                  <Input
                    id="dialog-wx-location"
                    value={wxLocation}
                    onChange={(e) => setWxLocation(e.target.value)}
                    placeholder={'"Manhattan, US" or "47.61,-122.33"'}
                    maxLength={100}
                  />
                  <FieldDescription>
                    City name (optionally with country) or a lat,lon pair. Updates hourly from OpenWeatherMap.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>Temperature units</FieldLabel>
                  <Combobox
                    options={UNIT_OPTIONS}
                    value={wxUnit}
                    onValueChange={setWxUnit}
                    placeholder="°F (imperial)"
                    aria-label="Temperature units"
                  />
                </Field>
                <FieldRow>
                  <FieldLabel htmlFor="dialog-wx-gradient">Gradient background</FieldLabel>
                  <Switch
                    id="dialog-wx-gradient"
                    checked={wxGradient}
                    onCheckedChange={setWxGradient}
                  />
                </FieldRow>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addWidget}>Add widget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
