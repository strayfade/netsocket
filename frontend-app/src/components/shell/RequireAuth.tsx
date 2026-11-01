import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { getSession } from '@/lib/api'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ok = await getSession()
      if (!cancelled) setState(ok ? 'ok' : 'denied')
    })()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (state === 'loading') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
        <Spinner className="h-6 w-6 text-muted-foreground" />
        <div className="w-64 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  return <>{children}</>
}
