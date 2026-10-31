import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { createProvider, listProviderModels, updateProvider, ApiError, type ProviderRow } from '@/lib/api'

export function providerErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code = String((err.body as { error?: string } | null)?.error || '')
    if (code === 'name_exists') return 'A provider with that name already exists.'
    if (code === 'name_required') return 'Name is required.'
    if (code === 'baseUrl_required') return 'Base URL is required.'
    if (code === 'baseUrl_invalid') return 'Base URL must start with http:// or https://.'
    if (code === 'cannot_clear_default') return 'Another provider must be the default before this one can be cleared.'
  }
  return 'Save failed.'
}

export function ProviderEditorDialog({
  open,
  provider,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** null = add mode; a row = edit mode */
  provider: ProviderRow | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const editing = provider != null
  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState('ollama')
  const [baseUrl, setBaseUrl] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [revealed, setRevealed] = React.useState(false)
  const [defaultModel, setDefaultModel] = React.useState('')
  const [isDefault, setIsDefault] = React.useState(false)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!provider) return
    setName(provider.name)
    setKind(provider.kind || 'ollama')
    setBaseUrl(provider.baseUrl || '')
    setApiKey('')
    setRevealed(false)
    setDefaultModel(provider.defaultModel || '')
    setIsDefault(!!provider.isDefault)
    setError(provider.hasApiKey ? 'Leave the key blank to keep the stored one.' : '')
  }, [provider])

  const onSubmit = async () => {
    const trimmedName = name.trim()
    const trimmedBase = baseUrl.trim()
    if (!trimmedName || !trimmedBase) {
      setError('Name and Base URL are required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: trimmedName,
          kind,
          baseUrl: trimmedBase,
          defaultModel,
          isDefault,
        }
        if (apiKey) body.apiKey = apiKey
        await updateProvider(provider.id, body)
      } else {
        await createProvider({
          name: trimmedName,
          kind,
          baseUrl: trimmedBase,
          defaultModel,
          isDefault,
          apiKey: apiKey || '',
        })
      }
      onSaved()
    } catch (err) {
      setError(providerErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit provider` : 'Add provider'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Change the endpoint this provider uses. AI nodes keep working while you edit.'
              : 'Register an Ollama or OpenAI-compatible endpoint so AI nodes can use it.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="prov-name">Name</FieldLabel>
              <Input id="prov-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Local Ollama" />
            </Field>
            <Field>
              <FieldLabel htmlFor="prov-kind">Kind</FieldLabel>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="prov-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="openai-compatible">OpenAI-compatible</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="prov-base">Base URL</FieldLabel>
            <Input
              id="prov-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={kind === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.openai.com/v1'}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="prov-key">Bearer token / API key</FieldLabel>
            <InputGroup>
              <Input
                id="prov-key"
                type={revealed ? 'text' : 'password'}
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editing && provider?.hasApiKey ? 'key saved — leave blank to keep' : 'optional'}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                aria-label={revealed ? 'Hide key' : 'Show key'}
                onClick={() => setRevealed((v) => !v)}
              >
                {revealed ? <EyeOff /> : <Eye />}
              </Button>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="prov-model">Default model</FieldLabel>
            <Input id="prov-model" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="gemma4:e2b" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(v === true)} />
            <span>
              Set as <strong className="text-foreground">default provider</strong> — new AI nodes use its default model
            </span>
          </label>
          {error && (error.startsWith('Leave') ? <FieldDescription>{error}</FieldDescription> : <FieldError>{error}</FieldError>)}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()} disabled={busy}>
            {busy ? <Spinner /> : null}
            {editing ? 'Save changes' : 'Add provider'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProviderModelsDialog({
  provider,
  onOpenChange,
}: {
  provider: ProviderRow | null
  onOpenChange: (open: boolean) => void
}) {
  const [models, setModels] = React.useState<string[] | null>(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!provider) return
    let cancelled = false
    setModels(null)
    setError('')
    listProviderModels(provider.id)
      .then((list) => {
        if (!cancelled) setModels(list)
      })
      .catch(() => {
        if (!cancelled) setError('Could not list models. Check the base URL and token.')
      })
    return () => {
      cancelled = true
    }
  }, [provider])

  return (
    <Dialog open={provider != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Models{provider ? ` — ${provider.name}` : ''}</DialogTitle>
          <DialogDescription>Models reported by this provider right now.</DialogDescription>
        </DialogHeader>
        {models == null && !error ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Spinner />
            Loading…
          </div>
        ) : error ? (
          <p className="py-2 text-sm text-destructive">{error}</p>
        ) : models && models.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No models returned.</p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="space-y-1 pr-2">
              {(models || []).map((m) => (
                <li key={m} className="rounded-sm px-1 py-0.5 font-mono text-xs">
                  {m}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
