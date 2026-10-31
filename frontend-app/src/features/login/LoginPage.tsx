import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { User, Lock, KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group'
import { Field, FieldDescription, FieldError, FieldLabel, FieldRow } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Kbd } from '@/components/ui/kbd'
import { getAuthState, getSession } from '@/lib/api'
import {
  getDefaultRememberMe,
  getLoginTitle,
  getSubmitLabel,
  mapLoginResponseToNotice,
  persistRememberMeChoice,
  resolveRedirectTarget,
  validateLoginForm,
} from '@/lib/loginLogic'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [notice, setNotice] = useState<{ message: string; variant: 'error' | 'info' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  const title = useMemo(
    () => getLoginTitle(needsRegistration, new Date().getHours()),
    [needsRegistration],
  )

  useEffect(() => {
    setRememberMe(getDefaultRememberMe(window.localStorage))
    void (async () => {
      if (await getSession()) {
        navigate(resolveRedirectTarget(params.get('redirect')), { replace: true })
        return
      }
      try {
        const state = await getAuthState()
        setNeedsRegistration(!!state.needsRegistration)
      } catch {
        setNeedsRegistration(false)
      }
      setReady(true)
    })()
  }, [navigate, params])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const validated = validateLoginForm({
      username,
      password,
      passwordConfirm,
      needsRegistration,
      rememberMe,
    })
    if (!validated.ok) {
      setNotice({ message: validated.message, variant: 'error' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated.body),
      })
      let errorBody: { error?: string } | null = null
      try {
        errorBody = await res.json()
      } catch {
        errorBody = null
      }
      const mapped = mapLoginResponseToNotice(res.status, errorBody, needsRegistration)
      if (mapped) {
        setNotice(mapped)
        setBusy(false)
        return
      }
      persistRememberMeChoice(window.localStorage, rememberMe)
      navigate(resolveRedirectTarget(params.get('redirect')), { replace: true })
    } catch {
      setNotice({
        message: needsRegistration
          ? 'Could not create account. Check your input and try again.'
          : 'Invalid username or password.',
        variant: 'error',
      })
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(255,255,255,0.12), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255,255,255,0.05), transparent)',
        }}
      />
      <Card className="relative z-10 w-full max-w-md border-border bg-card/95 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <img src="/favicon.png" alt="" className="h-8 w-8" />
            <span className="text-sm font-medium tracking-tight text-muted-foreground">netsocket</span>
            <Badge variant="outline" className="ml-auto">
              {needsRegistration ? 'Setup' : 'Sign in'}
            </Badge>
          </div>
          <CardTitle className="text-3xl tracking-tight capitalize">{title}</CardTitle>
          <CardDescription>
            {needsRegistration
              ? 'Set up the first account for this netsocket instance.'
              : 'Sign in to manage automations, dashboards, and panels.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
            {notice && (
              notice.variant === 'error' ? (
                <FieldError>{notice.message}</FieldError>
              ) : (
                <FieldDescription>{notice.message}</FieldDescription>
              )
            )}

            <Field>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <User className="h-4 w-4" />
                </InputGroupAddon>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                />
              </InputGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Lock className="h-4 w-4" />
                </InputGroupAddon>
                <Input
                  id="password"
                  type="password"
                  autoComplete={needsRegistration ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </InputGroup>
            </Field>

            {needsRegistration && (
              <Field>
                <FieldLabel htmlFor="passwordConfirm">Confirm password</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <KeyRound className="h-4 w-4" />
                  </InputGroupAddon>
                  <Input
                    id="passwordConfirm"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    disabled={busy}
                  />
                </InputGroup>
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>
            )}

            <Separator />

            <FieldRow>
              <div className="space-y-1">
                <FieldLabel htmlFor="rememberMe">Remember me</FieldLabel>
                <FieldDescription>Stay signed in on this device</FieldDescription>
              </div>
              <Switch
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={setRememberMe}
                disabled={busy}
              />
            </FieldRow>

            <Button type="submit" className="w-full" disabled={busy} size="lg">
              {busy && <Spinner className="mr-2" />}
              {getSubmitLabel(needsRegistration)}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Press <Kbd>Enter</Kbd> to submit
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
