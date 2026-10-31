import * as React from 'react'
import { Ban, CheckCircle2, Smartphone, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { removeDevice, setDeviceStatus, type PairedDevice } from '@/lib/api'
import { ConfirmDialog, MetaPair, formatTime, shortId } from '../SettingsPrimitives'

const GROUPS = [
  { key: 'pending', title: 'Pending approval', empty: 'No devices waiting for approval.' },
  { key: 'approved', title: 'Approved', empty: 'No approved devices yet.' },
  { key: 'denied', title: 'Denied', empty: 'No denied devices.' },
] as const

function statusBadge(status: string) {
  if (status === 'approved') return <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">approved</Badge>
  if (status === 'denied') return <Badge variant="destructive">denied</Badge>
  return <Badge variant="secondary">pending</Badge>
}

function DeviceActions({
  device,
  busy,
  onRun,
  onRemove,
}: {
  device: PairedDevice
  busy: boolean
  onRun: (action: 'approve' | 'deny' | 'pending') => void
  onRemove: () => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {device.status === 'pending' || device.status === 'denied' ? (
        <Button size="sm" disabled={busy} onClick={() => onRun('approve')}>
          <CheckCircle2 />
          Approve
        </Button>
      ) : null}
      {device.status === 'pending' || device.status === 'approved' ? (
        <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => onRun('deny')}>
          <Ban />
          Deny
        </Button>
      ) : null}
      {device.status === 'approved' ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRun('pending')}>
          <Undo2 />
          Revoke
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy} onClick={onRemove}>
        Remove
      </Button>
    </div>
  )
}

export function DevicesSection({
  devices,
  loading,
  refresh,
}: {
  devices: PairedDevice[] | null
  loading: boolean
  refresh: () => void
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState<PairedDevice | null>(null)

  const run = async (device: PairedDevice, action: 'approve' | 'deny' | 'pending') => {
    setBusyId(device.deviceId)
    try {
      await setDeviceStatus(device.deviceId, action)
      refresh()
    } catch {
      toast(`Could not ${action === 'pending' ? 'revoke' : action} device`)
    } finally {
      setBusyId(null)
    }
  }

  const doRemove = async () => {
    if (!confirmRemove) return
    setBusyId(confirmRemove.deviceId)
    try {
      await removeDevice(confirmRemove.deviceId)
      toast('Device removed')
      setConfirmRemove(null)
      refresh()
    } catch {
      toast('Could not remove device')
    } finally {
      setBusyId(null)
    }
  }

  if (loading && devices == null) {
    return (
      <div className="flex flex-col gap-6 py-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  const list = devices || []

  return (
    <>
      {GROUPS.map((group) => {
        const matching = list.filter((d) => d.status === group.key)
        return (
          <section key={group.key}>
            <h3 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
              {group.title}
            </h3>
            {matching.length === 0 ? (
              <p className="border-b border-border/60 py-4 text-sm text-muted-foreground last:border-b-0">{group.empty}</p>
            ) : (
              matching.map((device) => (
                <div
                  key={device.deviceId}
                  className="grid gap-3 border-b border-border/60 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate text-sm font-medium">{device.name || device.platform || 'Unknown device'}</span>
                      {statusBadge(device.status)}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                      <MetaPair label="Device ID" value={shortId(device.deviceId)} title={device.deviceId} />
                      <MetaPair label="IP address" value={device.ipAddress || '—'} />
                      <MetaPair label="Platform" value={device.platform || '—'} mono={false} />
                      <MetaPair label="Last seen" value={formatTime(device.lastSeenAt)} mono={false} />
                    </div>
                  </div>
                  <DeviceActions
                    device={device}
                    busy={busyId === device.deviceId}
                    onRun={(action) => void run(device, action)}
                    onRemove={() => setConfirmRemove(device)}
                  />
                </div>
              ))
            )}
          </section>
        )
      })}

      <ConfirmDialog
        open={confirmRemove != null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Remove this device?"
        description="The device will be forgotten permanently and must pair again before it can connect."
        busy={busyId != null && busyId === confirmRemove?.deviceId}
        onConfirm={() => void doRemove()}
      />
    </>
  )
}
