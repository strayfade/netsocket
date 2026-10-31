import * as React from 'react'
import { CircleAlert, Eye, EyeOff, List, Pencil, Plus, Power, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import {
  ApiError,
  deleteProvider,
  getAriaSettings,
  saveAriaSettings,
  testAriaSettings,
  updateProvider,
  type AriaSettings,
  type Preference,
  type ProviderRow,
} from '@/lib/api'
import { PrefsForm } from '../PrefsForm'
import { ConfirmDialog, EmptyState, MetaPair, SubHeading } from '../SettingsPrimitives'
import { ProviderEditorDialog, ProviderModelsDialog, providerErrorMessage } from './ProviderEditor'

const ARIA_PRESETS = [
  { value: 'ping', label: 'Ping — one sentence' },
  { value: 'short', label: 'Short — 1–2 sentences' },
  { value: 'compact', label: 'Compact — brief' },
  { value: 'balanced', label: 'Balanced — default' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'extended', label: 'Extended — long-form' },
]

function AriaCard({ initial }: { initial: AriaSettings | null }) {
  const [endpoint, setEndpoint] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [preset, setPreset] = React.useState('balanced')
  const [hasKey, setHasKey] = React.useState(false)
  const [revealed, setRevealed] = React.useState(false)
  const [status, setStatus] = React.useState<{ kind: 'info' | 'ok' | 'err'; text: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    if (!initial) return
    setEndpoint(initial.endpoint || '')
    setPreset(initial.preset || 'balanced')
    setHasKey(!!initial.hasApiKey)
  }, [initial])

  const onSave = async () => {
    setSaving(true)
    try {
      await saveAriaSettings({
        endpoint: endpoint.trim(),
        preset,
        ...(apiKey ? { apiKey } : {}),
      })
      setApiKey('')
      setRevealed(false)
      setHasKey(true)
      setStatus({ kind: 'ok', text: 'Aria settings saved.' })
    } catch (err) {
      setStatus({ kind: 'err', text: providerErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const onTest = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const res = await testAriaSettings()
      if (res && res.ok) setStatus({ kind: 'ok', text: `Connected: ${res.providers ?? 0} Aria provider(s) found.` })
      else setStatus({ kind: 'err', text: `Failed: ${res?.error || 'unreachable'}` })
    } catch (err) {
      const detail = err instanceof ApiError ? String((err.body as { error?: string } | null)?.error || err.status) : 'network error'
      setStatus({ kind: 'err', text: `Failed: ${detail}` })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className="grid gap-3 border-b border-border/60 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] sm:gap-6">
        <div>
          <label htmlFor="aria-endpoint" className="block text-sm font-medium leading-tight">Aria endpoint</label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The Aria instance used by the <span className="font-mono text-[11px]">Language Processing/Aria</span> node.</p>
        </div>
        <Input id="aria-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://192.168.1.101:3000" className="sm:justify-self-end" />
      </div>
      <div className="grid gap-3 border-b border-border/60 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] sm:gap-6">
        <div>
          <label htmlFor="aria-key" className="block text-sm font-medium leading-tight">Aria API key</label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Settings → API Keys on the Aria dashboard.</p>
        </div>
        <InputGroup className="sm:justify-self-end sm:w-[21rem]">
          <Input
            id="aria-key"
            type={revealed ? 'text' : 'password'}
            value={apiKey}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasKey ? 'key saved — leave blank to keep' : 'required'}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-9 shrink-0 text-muted-foreground"
            aria-label={revealed ? 'Hide key' : 'Show key'}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
        </InputGroup>
      </div>
      <div className="grid gap-3 border-b border-border/60 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] sm:gap-6">
        <div>
          <label htmlFor="aria-preset" className="block text-sm font-medium leading-tight">Default verbosity</label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">How long Aria replies for the Language Processing node.</p>
        </div>
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger id="aria-preset" className="sm:justify-self-end sm:w-[21rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARIA_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <Button onClick={() => void onSave()} disabled={saving}>
          {saving ? <Spinner /> : null}
          Save
        </Button>
        <Button variant="outline" onClick={() => void onTest()} disabled={testing}>
          {testing ? <Spinner /> : <Power />}
          Test connection
        </Button>
        {status && (
          <span className={status.kind === 'err' ? 'flex items-center gap-2 text-xs text-destructive' : 'flex items-center gap-2 text-xs text-muted-foreground'} role="status">
            {status.kind === 'err' ? <CircleAlert className="h-3.5 w-3.5" /> : null}
            {status.text}
          </span>
        )}
      </div>
    </div>
  )
}

function ProviderRowItem({
  provider,
  busy,
  onEdit,
  onModels,
  onRemove,
  onMakeDefault,
}: {
  provider: ProviderRow
  busy: boolean
  onEdit: () => void
  onModels: () => void
  onRemove: () => void
  onMakeDefault: () => void
}) {
  return (
    <div className="mb-2 grid gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4 last:mb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{provider.name}</span>
          <Badge variant="secondary">{provider.kind === 'ollama' ? 'Ollama' : 'OpenAI'}</Badge>
          {provider.isDefault ? <Badge variant="outline" className="gap-1"><Star className="h-3 w-3" /> default</Badge> : null}
          {provider.hasApiKey ? <Badge variant="outline">key stored</Badge> : null}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <MetaPair label="Base URL" value={provider.baseUrl || '—'} title={provider.baseUrl} />
          <MetaPair label="Default model" value={provider.defaultModel || 'none'} title={provider.defaultModel} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!provider.isDefault ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={onMakeDefault}>
            <Star />
            Make default
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onModels}>
          <List />
          Models
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>
          <Pencil />
          Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={onRemove}>
          <Trash2 />
          Remove
        </Button>
      </div>
    </div>
  )
}

export function AiProvidersSection({
  providers,
  loading,
  refresh,
  ollamaPrefs,
}: {
  providers: ProviderRow[] | null
  loading: boolean
  refresh: () => void
  ollamaPrefs: Preference[]
}) {
  const [aria, setAria] = React.useState<AriaSettings | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ProviderRow | null>(null)
  const [modelsFor, setModelsFor] = React.useState<ProviderRow | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState<ProviderRow | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  React.useEffect(() => {
    getAriaSettings().then(setAria).catch(() => setAria({}))
  }, [])

  const makeDefault = async (provider: ProviderRow) => {
    setBusyId(provider.id)
    try {
      await updateProvider(provider.id, { isDefault: true })
      refresh()
    } catch {
      toast('Could not change the default provider')
    } finally {
      setBusyId(null)
    }
  }

  const doRemove = async () => {
    if (!confirmRemove) return
    setBusyId(confirmRemove.id)
    try {
      await deleteProvider(confirmRemove.id)
      toast('Provider removed')
      setConfirmRemove(null)
      refresh()
    } catch {
      toast('Could not remove provider')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <SubHeading title="Aria gateway" />
      <AriaCard initial={aria} />

      <SubHeading
        title="Providers"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true) }}>
            <Plus />
            Add provider
          </Button>
        }
      />
      {loading && providers == null ? (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !providers || providers.length === 0 ? (
        <EmptyState
          icon={<CircleAlert className="h-4 w-4" />}
          title="No providers configured yet."
          note="Add an Ollama or OpenAI-compatible provider to enable AI nodes."
        />
      ) : (
        providers.map((provider) => (
          <ProviderRowItem
            key={provider.id}
            provider={provider}
            busy={busyId === provider.id}
            onEdit={() => { setEditing(provider); setEditorOpen(true) }}
            onModels={() => setModelsFor(provider)}
            onRemove={() => setConfirmRemove(provider)}
            onMakeDefault={() => void makeDefault(provider)}
          />
        ))
      )}

      {ollamaPrefs.length > 0 && (
        <>
          <SubHeading title="Ollama (legacy)" />
          <PrefsForm prefs={ollamaPrefs} />
        </>
      )}

      <ProviderEditorDialog
        open={editorOpen}
        provider={editing}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditing(null)
        }}
        onSaved={() => {
          setEditorOpen(false)
          setEditing(null)
          toast(editing ? 'Provider saved' : 'Provider added')
          refresh()
        }}
      />
      <ProviderModelsDialog provider={modelsFor} onOpenChange={(open) => !open && setModelsFor(null)} />
      <ConfirmDialog
        open={confirmRemove != null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title={`Remove provider "${confirmRemove?.name ?? ''}"?`}
        description="AI nodes that reference this provider will fall back to the default provider."
        busy={busyId != null && busyId === confirmRemove?.id}
        onConfirm={() => void doRemove()}
      />
    </>
  )
}
