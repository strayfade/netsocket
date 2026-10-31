export const LOGIN_GREETINGS = {
  earlyMorning: ['Good morning', 'Rise and shine', 'Morning already', 'Fresh start today', 'Still waking up?'],
  morning: ['Good morning', 'Morning', 'Top of the morning', 'Start your day', 'New day ahead'],
  afternoon: ['Good afternoon', 'Afternoon', 'Hello again', 'Nice to see you', 'Hope your day is going well'],
  evening: ['Good evening', 'Evening', 'Hello again', 'Nice to see you', 'Welcome back'],
  night: ['Good evening', 'Hello', 'Nice to see you', 'Welcome back', 'Still up late?'],
} as const

export const MIN_PASSWORD_LENGTH = 8
export const REMEMBER_ME_STORAGE_KEY = 'netsocket.rememberMe'

export function getGreetingPeriod(hour: number) {
  if (hour >= 5 && hour < 7) return 'earlyMorning'
  if (hour >= 7 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

export function pickLoginGreeting(hour: number, randomFn = Math.random) {
  const period = getGreetingPeriod(hour)
  const options = LOGIN_GREETINGS[period]
  const index = Math.floor(randomFn() * options.length)
  return options[index].toLowerCase()
}

export function getLoginTitle(needsRegistration: boolean, hour: number, randomFn?: () => number) {
  if (needsRegistration) return 'Create your account'
  return pickLoginGreeting(hour, randomFn)
}

export function getSubmitLabel(needsRegistration: boolean) {
  return needsRegistration ? 'Create account' : 'Sign In'
}

export function getDefaultRememberMe(storage: Storage | null | undefined) {
  if (!storage) return true
  try {
    const stored = storage.getItem(REMEMBER_ME_STORAGE_KEY)
    if (stored === '0') return false
    if (stored === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

export function persistRememberMeChoice(storage: Storage | null | undefined, rememberMe: boolean) {
  if (!storage) return
  try {
    storage.setItem(REMEMBER_ME_STORAGE_KEY, rememberMe ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function validateLoginForm({
  username,
  password,
  passwordConfirm,
  needsRegistration,
  rememberMe,
}: {
  username: string
  password: string
  passwordConfirm?: string
  needsRegistration: boolean
  rememberMe: boolean
}) {
  const trimmedUsername = typeof username === 'string' ? username.trim() : ''
  const pwd = typeof password === 'string' ? password : ''
  const confirm = typeof passwordConfirm === 'string' ? passwordConfirm : ''

  if (!trimmedUsername || !pwd) {
    return { ok: false as const, message: 'Enter a username and password.' }
  }
  if (needsRegistration) {
    if (pwd !== confirm) {
      return { ok: false as const, message: 'Passwords do not match.' }
    }
    if (pwd.length < MIN_PASSWORD_LENGTH) {
      return { ok: false as const, message: 'Password must be at least 8 characters.' }
    }
  }
  const body: Record<string, unknown> = {
    username: trimmedUsername,
    password: pwd,
    rememberMe: rememberMe === true,
  }
  if (needsRegistration) body.passwordConfirm = confirm
  return { ok: true as const, body }
}

export function resolveRedirectTarget(redirectParam: string | null) {
  if (
    typeof redirectParam === 'string' &&
    redirectParam.startsWith('/') &&
    !redirectParam.startsWith('//')
  ) {
    return redirectParam
  }
  return '/'
}

export function mapLoginResponseToNotice(
  status: number,
  errorBody: { error?: string } | null,
  needsRegistration: boolean,
) {
  if (status === 429) {
    return { message: 'Too many login attempts. Wait a few minutes and try again.', variant: 'error' as const }
  }
  if (status === 400 && errorBody?.error === 'password_mismatch') {
    return { message: 'Passwords do not match.', variant: 'error' as const }
  }
  if (status === 400 && errorBody?.error === 'password_too_short') {
    return { message: 'Password must be at least 8 characters.', variant: 'error' as const }
  }
  if (status === 200) return null
  return {
    message: needsRegistration
      ? 'Could not create account. Check your input and try again.'
      : 'Invalid username or password.',
    variant: 'error' as const,
  }
}
