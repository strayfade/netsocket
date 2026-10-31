import * as React from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export function SettingsRow({
  label,
  description,
  htmlFor,
  control,
  actions,
}: {
  label: string
  description?: string
  htmlFor?: string
  control: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="grid items-center gap-3 border-b border-border/60 py-4 first:pt-0 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] sm:gap-6">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-sm font-medium leading-tight">
            {label}
          </label>
        ) : (
          <div className="text-sm font-medium leading-tight">{label}</div>
        )}
        {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-2 justify-self-stretch sm:justify-self-end">
        <div className="min-w-0 flex-1 sm:max-w-[21rem]">{control}</div>
        {actions}
      </div>
    </div>
  )
}

export function SubHeading({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-center justify-between gap-4 first:mt-0">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

export function EmptyState({ icon, title, note }: { icon?: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="flex flex-col items-start gap-1 py-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 text-foreground/80">
        {icon}
        <span>{title}</span>
      </div>
      {note && <p className="text-xs">{note}</p>}
    </div>
  )
}

/** Small mono key/value pair used in device and provider lists. */
export function MetaPair({ label, value, title, mono = true }: { label: string; value: React.ReactNode; title?: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">{label}</div>
      <div className={cn('truncate text-xs text-foreground/90', mono && 'font-mono')} title={title}>
        {value}
      </div>
    </div>
  )
}

/** Inline transient status icon shown next to a control after a save attempt. */
export function SaveStatusIcon({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving') return <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
  if (state === 'saved') return <Check className="h-3.5 w-3.5 text-emerald-400" aria-label="Saved" />
  if (state === 'error') return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Save failed" />
  return null
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Remove',
  busy = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function formatTime(ts: string | number | undefined | null): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return '—'
  }
}

export function shortId(id: string): string {
  if (id.length <= 18) return id
  return `${id.slice(0, 8)}…${id.slice(-6)}`
}

/** Preference descriptions arrive as server-authored HTML; render them as plain text. */
export function stripHtml(html: string | undefined): string {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
