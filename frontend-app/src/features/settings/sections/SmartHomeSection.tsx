import * as React from 'react'
import { Ban, CheckCircle2, Save, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import {
  renameSmartHomeDevice,
  removeSmartHomeDevice,
  setSmartHomeDeviceStatus,
  type Preference,
  type SmartHomeDevice,
} from '@/lib/api'
import { PrefsForm } from '../PrefsForm'
import {
  ConfirmDialog,
  MetaPair,
  SubHeading,
  formatTime,
  shortId,
} from '../SettingsPrimitives'

const GROUPS = [
  { key: 'pending', title: 'Pending approval', empty: 'No smart-home devices waiting. Power on a device and it appears here.' },
  { key: 'approved', title: 'Approved', empty: 'No approved smart-home devices yet.' },
  { key: 'denied', title: 'Denied', empty: 'No denied devices.' },
] as const

function statusBadge(status: string) {
  if (status === 'approved') return <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">approved</Badge>
  if (status === 'denied') return <Badge variant="destructive">denied</Badge>
  return <Badge variant="secondary">pending</Badge>
}

function SmartHomeCard({
  device,
  busy,
  onRun,
  onRemove,
  onRename,
}: {
  device: SmartHomeDevice
  busy: boolean
  onRun: (action: 'approve' | 'deny' | 'pending') => void
  onRemove: () => void
  onRename: (friendlyName: string, room: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState(device.friendlyName || '')
  const [room, setRoom] = React.useState(device.room || '')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setName(device.friendlyName || '')
    setRoom(device.room || '')
  }, [device.friendlyName, device.room])

  const entities = device.entities || []
  const model = `${device.manufacturer || ''} ${device.model || ''}`.trim() || '—'

  return (
    <div className="border-b border-border/60 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-medium">{device.friendlyName || device.deviceId}</span>
        {statusBadge(device.status)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetaPair label="Device ID" value={shortId(device.deviceId)} title={device.deviceId} />
        <MetaPair label="Room" value={device.room || '—'} mono={false} />
        <MetaPair label="Source" value={device.source || 'bespoke'} mono={false} />
        <MetaPair label="Model" value={model} mono={false} />
        <MetaPair label="Availability" value={device.availability || 'unknown'} mono={false} />
        <MetaPair label="Last seen" value={formatTime(device.lastSeenAt)} mono={false} />
      </div>
      {entities.length > 0 && (
        <ul className="mt-3 space-y-1">
          {entities.map((ent) => {
            const caps = Array.isArray(ent.capabilities) ? ent.capabilities.join(', ') : ''
            const last = ent.lastState != null && ent.lastState !== '' ? ` · last: ${ent.lastState}` : ''
            return (
              <li key={ent.uniqueId} className="truncate font-mono text-xs text-muted-foreground">
                {[ent.component || '?', ent.objectId || ent.uniqueId, caps].filter(Boolean).join(' · ')}
                {last}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          aria-label="Friendly name"
          placeholder="Friendly name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-full max-w-52"
        />
        <Input
          aria-label="Room"
          placeholder="Room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="h-9 w-full max-w-32"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={saving || busy}
          onClick={async () => {
            setSaving(true)
            const ok = await onRename(name, room)
            setSaving(false)
            if (ok) toast('Saved')
          }}
        >
          <Save />
          Save
        </Button>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
      </div>
    </div>
  )
}

export function SmartHomeSection({
  mqttPrefs,
  devices,
  loading,
  refresh,
}: {
  mqttPrefs: Preference[]
  devices: SmartHomeDevice[] | null
  loading: boolean
  refresh: () => void
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState<SmartHomeDevice | null>(null)

  const run = async (device: SmartHomeDevice, action: 'approve' | 'deny' | 'pending') => {
    setBusyId(device.deviceId)
    try {
      await setSmartHomeDeviceStatus(device.deviceId, action)
      refresh()
    } catch {
      toast(`Could not ${action === 'pending' ? 'revoke' : action} device`)
    } finally {
      setBusyId(null)
    }
  }

  const rename = async (device: SmartHomeDevice, friendlyName: string, room: string): Promise<boolean> => {
    try {
      await renameSmartHomeDevice(device.deviceId, friendlyName, room)
      refresh()
      return true
    } catch {
      toast('Could not save name and room')
      return false
    }
  }

  const doRemove = async () => {
    if (!confirmRemove) return
    setBusyId(confirmRemove.deviceId)
    try {
      await removeSmartHomeDevice(confirmRemove.deviceId)
      toast('Device removed')
      setConfirmRemove(null)
      refresh()
    } catch {
      toast('Could not remove device')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <SubHeading title="MQTT broker" />
      {mqttPrefs.length ? <PrefsForm prefs={mqttPrefs} /> : <p className="py-4 text-sm text-muted-foreground">No MQTT settings registered.</p>}

      <SubHeading title="Pairing inbox" />
      {loading && devices == null ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        GROUPS.map((group) => {
          const matching = (devices || []).filter((d) => d.status === group.key)
          return (
            <section key={group.key}>
              <h4 className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group.title}</h4>
              {matching.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">{group.empty}</p>
              ) : (
                matching.map((device) => (
                  <SmartHomeCard
                    key={device.deviceId}
                    device={device}
                    busy={busyId === device.deviceId}
                    onRun={(action) => void run(device, action)}
                    onRemove={() => setConfirmRemove(device)}
                    onRename={(friendlyName, room) => rename(device, friendlyName, room)}
                  />
                ))
              )}
            </section>
          )
        })
      )}

      <ConfirmDialog
        open={confirmRemove != null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Remove this device?"
        description="Discovery data and command bindings for this device are deleted permanently; it must pair again."
        busy={busyId != null && busyId === confirmRemove?.deviceId}
        onConfirm={() => void doRemove()}
      />
    </>
  )
}
