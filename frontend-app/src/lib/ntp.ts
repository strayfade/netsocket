const CLOCK_TIME_ZONE = 'America/New_York'
const NTP_RESYNC_MS = 24 * 60 * 60 * 1000

let ntpAtSyncMs: number | null = null
let perfAtSyncMs: number | null = null
let resyncTimer: ReturnType<typeof setInterval> | null = null

function performanceNowMs() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now()
    }
  } catch {
    /* fall through */
  }
  return Date.now()
}

export function setNtpTime(ntpNowMs: number) {
  const ntp = Number(ntpNowMs)
  if (!isFinite(ntp)) return ntpAtSyncMs
  ntpAtSyncMs = ntp
  perfAtSyncMs = performanceNowMs()
  return ntpAtSyncMs
}

export function ntpNow() {
  if (ntpAtSyncMs == null || perfAtSyncMs == null) return Date.now()
  return Math.floor(ntpAtSyncMs + (performanceNowMs() - perfAtSyncMs))
}

export function formatEasternClock(ms?: number) {
  const instant = new Date(typeof ms === 'number' ? ms : ntpNow())
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLOCK_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(instant)
  let hour = '12'
  let minute = '00'
  for (const part of timeParts) {
    if (part.type === 'hour') hour = part.value
    if (part.type === 'minute') minute = part.value
  }
  const date = instant.toLocaleDateString('en-US', {
    timeZone: CLOCK_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  return { time: `${hour}:${minute}`, date, timeZone: CLOCK_TIME_ZONE }
}

export async function syncNtpTime() {
  try {
    const res = await fetch('/v1/time', { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = (await res.json()) as { now?: number }
    if (data?.now != null) setNtpTime(data.now)
    return data
  } catch {
    return null
  }
}

export function startNtpResync(intervalMs = NTP_RESYNC_MS) {
  stopNtpResync()
  void syncNtpTime()
  resyncTimer = setInterval(() => {
    void syncNtpTime()
  }, intervalMs)
}

export function stopNtpResync() {
  if (resyncTimer) {
    clearInterval(resyncTimer)
    resyncTimer = null
  }
}

/** Expose NTP helpers for legacy Widgets / WidgetEditor / panel bootstraps. */
export function installShellLogicBridge() {
  const bridge = {
    ntpNow,
    setNtpTime,
    setServerTime: (serverNowMs: number) => setNtpTime(serverNowMs),
    formatEasternClock,
    syncNtpTime,
    startNtpResync,
    stopNtpResync,
    buildLoginRedirect: (pathname: string) => {
      const target =
        typeof pathname === 'string' && pathname.startsWith('/') && !pathname.startsWith('//')
          ? pathname
          : '/dashboard'
      return `/login?redirect=${encodeURIComponent(target)}`
    },
    ensureSession: async () => {
      try {
        const res = await fetch('/v1/session', { credentials: 'same-origin' })
        return !!res?.ok
      } catch {
        return false
      }
    },
    showToast: (message: string) => {
      window.dispatchEvent(new CustomEvent('ns-toast', { detail: { message } }))
    },
  }
  ;(window as unknown as { ShellLogic: typeof bridge }).ShellLogic = bridge
}
