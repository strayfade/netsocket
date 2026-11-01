import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Field, FieldDescription } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import { exportFullState, importFullState } from '@/lib/api'
import { toast } from '@/components/ui/toast'

type BackupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BackupDialog({ open, onOpenChange }: BackupDialogProps) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [labelDate, setLabelDate] = useState<Date | undefined>(new Date())
  const fileRef = useRef<HTMLInputElement>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus('Exporting…')
    try {
      const data = await exportFullState()
      const stamp = labelDate ? labelDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `netsocket-backup-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
      setStatus('Export complete.')
      toast('Backup exported')
    } catch {
      setStatus('Export failed.')
      toast('Export failed')
    } finally {
      setBusy(false)
    }
  }

  const onImportFile = async (file: File) => {
    setBusy(true)
    setStatus('Importing…')
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      await importFullState(payload)
      setStatus('Import complete. Reloading…')
      toast('Backup imported')
      window.setTimeout(() => window.location.reload(), 800)
    } catch {
      setStatus('Import failed. Check the file and try again.')
      toast('Import failed')
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Backup & restore</DialogTitle>
            <Badge variant="secondary">Full state</Badge>
          </div>
          <DialogDescription>
            Download or upload a single file with your entire node graph, workflow variables, and
            integration settings. Your netsocket login is never included.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldDescription>Filename date label (cosmetic)</FieldDescription>
          <DatePicker value={labelDate} onChange={setLabelDate} disabled={busy} />
        </Field>

        <Separator />

        <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" role="status">
          {busy && <Spinner />}
          {status}
        </p>

        <ButtonGroup className="w-full [&>button]:flex-1">
          <Button onClick={onExport} disabled={busy}>
            {busy ? <Spinner className="mr-2" /> : null}
            Export
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            Import…
          </Button>
        </ButtonGroup>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onImportFile(file)
            e.target.value = ''
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
