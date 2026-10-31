import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { Settings2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getPreferences,
  listDevices,
  listProviders,
  listSmartHomeDevices,
  type PairedDevice,
  type Preference,
  type ProviderRow,
  type SmartHomeDevice,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { hasEditorRenderControls } from './netRender'
import { PrefsForm } from './PrefsForm'
import { BUILTIN_META, MERGED_CATEGORIES, WORKSPACE_CATEGORIES, categoryDescription, categoryIcon } from './settingsCatalog'
import { DevicesSection } from './sections/DevicesSection'
import { SmartHomeSection } from './sections/SmartHomeSection'
import { AiProvidersSection } from './sections/AiProvidersSection'
import { RenderingSection } from './sections/RenderingSection'
import { AuthenticatorSection } from './sections/AuthenticatorSection'

type Section = {
  id: string
  label: string
  icon: LucideIcon
  description: string
  render: () => React.ReactNode
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col gap-5 py-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const location = useLocation()
  const [prefs, setPrefs] = React.useState<Preference[] | null>(null)
  const [devices, setDevices] = React.useState<PairedDevice[] | null>(null)
  const [smartHome, setSmartHome] = React.useState<SmartHomeDevice[] | null>(null)
  const [providers, setProviders] = React.useState<ProviderRow[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [sectionId, setSectionId] = React.useState('devices')

  const load = React.useCallback(() => {
    setLoading(true)
    void Promise.allSettled([
      getPreferences().then(setPrefs),
      listDevices().then(setDevices),
      listSmartHomeDevices().then(setSmartHome),
      listProviders().then(setProviders),
    ]).then(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (open) load()
  }, [open, load])

  // Take over the editor socket's live registry pushes while open, restore the
  // legacy bridge on close so other UI keeps receiving them.
  React.useEffect(() => {
    if (!open) return
    const prevDevices = window.__netsocketOnDevicesChanged
    const prevSmartHome = window.__netsocketOnSmartHomeChanged
    window.__netsocketOnDevicesChanged = (list) => setDevices(list as PairedDevice[])
    window.__netsocketOnSmartHomeChanged = (list) => setSmartHome(list as SmartHomeDevice[])
    return () => {
      window.__netsocketOnDevicesChanged = prevDevices
      window.__netsocketOnSmartHomeChanged = prevSmartHome
    }
  }, [open])

  const renderAvailable = location.pathname === '/automate' && hasEditorRenderControls()

  const prefsFor = React.useCallback(
    (category: string) => (prefs || []).filter((p) => p.category === category),
    [prefs],
  )

  const sections = React.useMemo<Section[]>(() => {
    const categories = prefs
      ? [...new Set(prefs.map((p) => p.category))].sort((a, b) => a.localeCompare(b))
      : []
    const workspaceCats = categories.filter((c) => WORKSPACE_CATEGORIES.has(c))
    const integrationCats = categories.filter((c) => !WORKSPACE_CATEGORIES.has(c) && !MERGED_CATEGORIES.has(c))

    const out: Section[] = [
      {
        ...BUILTIN_META.devices,
        id: 'devices',
        render: () => <DevicesSection devices={devices} loading={loading} refresh={load} />,
      },
      {
        ...BUILTIN_META.smarthome,
        id: 'smarthome',
        render: () => (
          <SmartHomeSection
            mqttPrefs={prefsFor('Smart Home')}
            devices={smartHome}
            loading={loading}
            refresh={load}
          />
        ),
      },
      {
        ...BUILTIN_META.ai,
        id: 'ai',
        render: () => (
          <AiProvidersSection
            providers={providers}
            loading={loading}
            refresh={load}
            ollamaPrefs={prefsFor('Ollama')}
          />
        ),
      },
    ]

    if (renderAvailable) {
      out.push({ ...BUILTIN_META.rendering, id: 'rendering', render: () => <RenderingSection /> })
    }

    for (const cat of workspaceCats) {
      out.push({
        id: `cat:${cat}`,
        label: cat,
        icon: categoryIcon(cat),
        description: categoryDescription(cat),
        render: () => (prefs ? <PrefsForm prefs={prefsFor(cat)} /> : <CategorySkeleton />),
      })
    }

    if (categories.includes('Authenticator')) {
      out.push({
        ...BUILTIN_META.authenticator,
        id: 'cat:Authenticator',
        render: () => <AuthenticatorSection prefs={prefsFor('Authenticator')} />,
      })
    }

    for (const cat of integrationCats) {
      out.push({
        id: `cat:${cat}`,
        label: cat,
        icon: categoryIcon(cat),
        description: categoryDescription(cat),
        render: () => (prefs ? <PrefsForm prefs={prefsFor(cat)} /> : <CategorySkeleton />),
      })
    }

    return out
  }, [prefs, devices, smartHome, providers, loading, renderAvailable, prefsFor, load])

  const active = sections.find((s) => s.id === sectionId) || sections[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        // The per-section blurb was intentionally removed; silence Radix's
        // missing-description warning.
        aria-describedby={undefined}
        className="grid h-[min(760px,88svh)] w-[min(1080px,calc(100vw-1.5rem))] max-w-none gap-0 overflow-hidden border-0 bg-white/[0.03] p-0 sm:rounded-xl sm:grid-rows-[auto_minmax(0,1fr)]"
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <DialogHeader className="flex-row items-center gap-2 space-y-0">
            <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            <DialogTitle>Preferences</DialogTitle>
          </DialogHeader>
          <DialogClose className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-col sm:flex-row">
          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-1 overflow-x-auto p-2 sm:w-56 sm:flex-col sm:overflow-y-auto sm:overflow-x-hidden sm:p-3"
          >
            <div className="hidden px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 sm:block">
              Workspace
            </div>
            {sections
              .filter((s) => !s.id.startsWith('cat:') || WORKSPACE_CATEGORIES.has(s.label))
              .map((s) => (
                <NavButton key={s.id} section={s} active={active?.id === s.id} onSelect={setSectionId} />
              ))}
            <div className="hidden px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 sm:pt-5 sm:block">
              Integrations
            </div>
            {sections
              .filter((s) => s.id.startsWith('cat:') && !WORKSPACE_CATEGORIES.has(s.label))
              .map((s) => (
                <NavButton key={s.id} section={s} active={active?.id === s.id} onSelect={setSectionId} />
              ))}
          </nav>

          {/* pt-0 + the first-child zeroing rules let the first section band sit
              flush to the header; every later band keeps its equal mt/mb. */}
          <div className="min-w-0 flex-1 overflow-y-auto bg-card px-6 pb-5 [&>section:first-child>div:first-child]:mt-0 [&>*:first-child]:mt-0">
            {active ? active.render() : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NavButton({
  section,
  active,
  onSelect,
}: {
  section: Section
  active: boolean
  onSelect: (id: string) => void
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(section.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white font-medium text-black hover:bg-white'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span>{section.label}</span>
    </button>
  )
}
