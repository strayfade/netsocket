import * as React from 'react'
import { ChevronRight, Copy, Eye, EyeOff, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputGroup } from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toast'
import { savePreference, type Preference } from '@/lib/api'
import { parseOtpAccounts, serializeOtpAccounts, otpCountLabel, type OtpAccount, type OtpValidation } from '../otpLogic'
import { PrefsForm } from '../PrefsForm'
import { SubHeading } from '../SettingsPrimitives'
import { cn } from '@/lib/utils'

function AccountRow({
  account,
  open,
  error,
  onToggle,
  onChange,
  onRemove,
}: {
  account: OtpAccount
  open: boolean
  error: string | null
  onToggle: () => void
  onChange: (next: OtpAccount) => void
  onRemove: () => void
}) {
  const [revealed, setRevealed] = React.useState(false)

  const revealCopy = async () => {
    try {
      await navigator.clipboard.writeText(account.secret)
      toast('Secret copied')
    } catch {
      toast('Could not access the clipboard')
    }
  }

  return (
    <div className={cn('border-b border-border/60 last:border-b-0', error && 'text-foreground')}>
      <button
        type="button"
        className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/50"
        aria-expanded={open}
        onClick={onToggle}
      >
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="min-w-0 truncate text-sm">
          <span className="font-medium">{account.issuer || 'New account'}</span>
          {account.account ? <span className="text-muted-foreground"> · {account.account}</span> : null}
        </span>
      </button>
      {open && (
        <div className="grid gap-4 pb-4 pl-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`otp-issuer-${account.issuer}-${account.account}`}>Issuer</FieldLabel>
              <Input
                value={account.issuer}
                placeholder="Google"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange({ ...account, issuer: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel>Account</FieldLabel>
              <Input
                value={account.account}
                placeholder="name@example.com"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange({ ...account, account: e.target.value })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>Secret</FieldLabel>
            <InputGroup className={cn(error && 'border-destructive')}>
              <Input
                type={revealed ? 'text' : 'password'}
                value={account.secret}
                placeholder="Base32 secret"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onChange({ ...account, secret: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                aria-label={revealed ? 'Hide secret' : 'Show secret'}
                aria-pressed={revealed}
                onClick={() => setRevealed((v) => !v)}
              >
                {revealed ? <EyeOff /> : <Eye />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground"
                aria-label="Copy secret"
                onClick={() => void revealCopy()}
              >
                <Copy />
              </Button>
            </InputGroup>
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-start">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 />
              Remove account
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AuthenticatorSection({ prefs }: { prefs: Preference[] }) {
  const otpPref = prefs.find((p) => p.id === 'authentication.otp_accounts') || null
  const otherPrefs = prefs.filter((p) => p.id !== 'authentication.otp_accounts')

  const parsed = React.useMemo(() => parseOtpAccounts(otpPref?.value), [otpPref?.value])
  const [accounts, setAccounts] = React.useState<OtpAccount[]>(parsed.accounts)
  const [touched, setTouched] = React.useState(false)
  const [openRows, setOpenRows] = React.useState<Set<number>>(new Set())
  const [rowError, setRowError] = React.useState<OtpValidation | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Re-seed from the server whenever the stored string changes and there is no
  // pending local edit.
  React.useEffect(() => {
    if (!touched) {
      setAccounts(parsed.accounts)
      setOpenRows(new Set())
    }
    setRowError(null)
    // parsed is derived from otpPref.value; re-seeding intentionally follows saves too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpPref?.value])

  const markTouched = () => {
    setTouched(true)
    setRowError(null)
  }

  const onSave = async () => {
    if (!otpPref) return
    const result = serializeOtpAccounts(accounts, parsed.invalid)
    if (!result.ok) {
      setRowError(result.error)
      setOpenRows((prev) => new Set(prev).add(result.error.index))
      return
    }
    setSaving(true)
    try {
      await savePreference(otpPref.id, result.value)
      setTouched(false)
      toast(result.duplicates > 0 ? 'Saved. Duplicate accounts keep the last secret.' : 'Saved', {
        description: 'The Authentication/OTP node picks up changes immediately.',
      })
    } catch {
      toast('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const openCountLabel = accounts.filter((a) => a.issuer || a.account || a.secret).length

  return (
    <>
      <SubHeading
        title="TOTP accounts"
        actions={
          <span className="text-xs text-muted-foreground">{otpCountLabel(openCountLabel)}</span>
        }
      />
      {parsed.invalid.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {parsed.invalid.length === 1
            ? '1 stored entry could not be parsed and will be kept when you save.'
            : `${parsed.invalid.length} stored entries could not be parsed and will be kept when you save.`}
        </p>
      )}
      {accounts.length === 0 ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          No accounts yet.
        </p>
      ) : (
        <div className="border-t border-border/60">
          {accounts.map((account, i) => (
            <AccountRow
              key={`${i}-${account.issuer}:${account.account}`}
              account={account}
              open={openRows.has(i)}
              error={rowError && rowError.index === i ? rowError.message : null}
              onToggle={() =>
                setOpenRows((prev) => {
                  const next = new Set(prev)
                  if (next.has(i)) next.delete(i)
                  else next.add(i)
                  return next
                })
              }
              onChange={(next) => {
                markTouched()
                setAccounts((prev) => prev.map((a, j) => (j === i ? next : a)))
              }}
              onRemove={() => {
                markTouched()
                setAccounts((prev) => prev.filter((_, j) => j !== i))
                setOpenRows((prev) => {
                  const next = new Set<number>()
                  prev.forEach((k) => {
                    if (k < i) next.add(k)
                    else if (k > i) next.add(k - 1)
                  })
                  return next
                })
              }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-4">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            markTouched()
            const nextIndex = accounts.length
            setAccounts((prev) => [...prev, { issuer: '', account: '', secret: '' }])
            setOpenRows(new Set([nextIndex]))
          }}
        >
          <Plus />
          Add account
        </Button>
        <Button size="sm" onClick={() => void onSave()} disabled={saving || !otpPref}>
          Save
        </Button>
        {touched && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>

      {otherPrefs.length > 0 && (
        <>
          <Separator className="my-6" />
          <PrefsForm prefs={otherPrefs} />
        </>
      )}
    </>
  )
}
