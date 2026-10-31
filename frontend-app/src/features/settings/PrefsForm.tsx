import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { InputGroup } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { savePreference, type Preference } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { SaveStatusIcon, SettingsRow, stripHtml } from './SettingsPrimitives'
import { cn } from '@/lib/utils'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Ids whose text values the server treats as "true"/"false" strings.
const BOOLISH_TEXT_RE = /(?:^|\.)(?:tls|secure|rejectUnauthorized)$/
// Ids whose last segment names a credential; masked until revealed.
const SECRET_RE = /(?:secret|token|passw|key)/i

function isSecret(pref: Preference): boolean {
  if (pref.type === 'readonly') return false
  const segment = String(pref.id).split('.').pop() || ''
  return SECRET_RE.test(segment)
}

function isBoolish(pref: Preference): boolean {
  return pref.type === 'boolean' || (pref.type === 'text' && BOOLISH_TEXT_RE.test(pref.id))
}

function PrefRow({ pref }: { pref: Preference }) {
  const serverValue = pref.value == null ? '' : String(pref.value)
  const [draft, setDraft] = React.useState(serverValue)
  const [boolValue, setBoolValue] = React.useState(serverValue === 'true')
  const [selectValue, setSelectValue] = React.useState(serverValue)
  const [state, setState] = React.useState<SaveState>('idle')
  const [revealed, setRevealed] = React.useState(false)
  const editingRef = React.useRef(false)
  const lastSavedRef = React.useRef(serverValue)
  const flashTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    lastSavedRef.current = serverValue
    if (!editingRef.current) {
      setDraft(serverValue)
      setBoolValue(serverValue === 'true')
      setSelectValue(serverValue)
    }
  }, [serverValue])

  React.useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
  }, [])

  const save = async (value: string) => {
    setState('saving')
    try {
      await savePreference(pref.id, value)
      lastSavedRef.current = value
      setState('saved')
      if (flashTimer.current) clearTimeout(flashTimer.current)
      flashTimer.current = setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('error')
      // Revert optimistic bool/select display; keep the text draft so the user can retry.
      setBoolValue(lastSavedRef.current === 'true')
      setSelectValue(lastSavedRef.current)
      toast(`Could not save ${pref.displayName}`, { description: 'The server rejected the change.' })
    }
  }

  const commitText = () => {
    editingRef.current = false
    // Compare against lastSavedRef, not the serverValue prop: the prefs list is
    // not refetched after a save, so the prop can be stale — comparing to it
    // would skip a save that restores the prop's (outdated) value.
    if (draft !== lastSavedRef.current) void save(draft)
  }

  const description = stripHtml(pref.description)
  const inputId = `pref-${pref.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const errored = state === 'error'

  let control: React.ReactNode
  if (isBoolish(pref)) {
    const checked = boolValue
    control = (
      <div className="flex items-center gap-3">
        <Switch
          id={inputId}
          checked={checked}
          disabled={state === 'saving'}
          onCheckedChange={(next) => {
            setBoolValue(next)
            if (state === 'saved' || state === 'error') setState('idle')
            void save(next ? 'true' : 'false')
          }}
        />
        <span className="text-xs text-muted-foreground">{checked ? 'Enabled' : 'Disabled'}</span>
      </div>
    )
  } else if (pref.type === 'select') {
    control = (
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next !== lastSavedRef.current) {
            setSelectValue(next)
            void save(next)
          }
        }}
      >
        <SelectTrigger id={inputId} className="w-full">
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {(pref.options || []).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label || opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (pref.type === 'readonly') {
    control = (
      <Input id={inputId} readOnly value={serverValue} placeholder="Not connected" tabIndex={-1} className="cursor-default" />
    )
  } else if (isSecret(pref)) {
    control = (
      <InputGroup className={cn(errored && 'border-destructive')}>
        <Input
          id={inputId}
          type={revealed ? 'text' : 'password'}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            editingRef.current = true
            if (state === 'error') setState('idle')
            setDraft(e.target.value)
          }}
          onFocus={() => {
            editingRef.current = true
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitText()
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="w-9 shrink-0 text-muted-foreground"
          aria-label={revealed ? 'Hide value' : 'Show value'}
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </InputGroup>
    )
  } else {
    control = (
      <Input
        id={inputId}
        type={pref.type === 'number' ? 'number' : 'text'}
        inputMode={pref.type === 'number' ? 'numeric' : undefined}
        value={draft}
        spellCheck={false}
        className={cn(errored && 'border-destructive')}
        onChange={(e) => {
          editingRef.current = true
          if (state === 'error') setState('idle')
          setDraft(e.target.value)
        }}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitText()
          }
        }}
      />
    )
  }

  const isSwitch = isBoolish(pref)

  return (
    <SettingsRow
      label={pref.displayName}
      description={description || undefined}
      htmlFor={pref.type === 'readonly' ? undefined : inputId}
      control={control}
      actions={
        isSwitch ? undefined : (
          <span className="w-4 shrink-0" aria-live="polite">
            <SaveStatusIcon state={state} />
          </span>
        )
      }
    />
  )
}

export function PrefsForm({ prefs }: { prefs: Preference[] }) {
  return (
    <div className="flex flex-col">
      {prefs.map((pref) => (
        <PrefRow key={pref.id} pref={pref} />
      ))}
    </div>
  )
}
