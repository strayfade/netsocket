import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel, FieldRow } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

export const ADD_WIDGET_KIND_OPTIONS = [
  { value: 'button', label: 'Run Button' },
  { value: 'clock', label: 'Clock' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
  { value: 'timer', label: 'Timer' },
  { value: 'weather', label: 'Weather' },
]

export const WX_UNIT_OPTIONS = [
  { value: 'f', label: '°F (imperial)' },
  { value: 'c', label: '°C (metric)' },
]

/** Validated dialog output; per-kind fields are zeroed when not applicable. */
export type WidgetDraft = {
  kind: string
  variable: string
  automationId: string
  showName: boolean
  showDate: boolean
  location: string
  unit: 'f' | 'c'
  gradient: boolean
}

/**
 * Shared "Add widget" dialog for the dashboard and the panel layout editor.
 * Owns the per-kind option state (only the fields a kind actually uses are
 * shown) and the required-field checks; callers receive an already-valid
 * draft. Return false from onAdd to veto closing/reset (e.g. when the host
 * still rejects the draft).
 */
export function AddWidgetDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  automationOptions: { value: string; label: string }[]
  onAdd: (draft: WidgetDraft) => boolean | void
  /** Portal target override; see DialogContent.portalContainer. */
  portalContainer?: HTMLElement | null
  /** Dropdown portal target for the kind/automation/unit comboboxes. */
  popperContainer?: HTMLElement | null
}) {
  const [kind, setKind] = useState('clock')
  const [variable, setVariable] = useState('')
  const [automationId, setAutomationId] = useState('')
  const [showName, setShowName] = useState(false)
  const [showDate, setShowDate] = useState(true)
  const [wxLocation, setWxLocation] = useState('')
  const [wxUnit, setWxUnit] = useState('f')
  const [wxGradient, setWxGradient] = useState(true)

  const reset = () => {
    setKind('clock')
    setVariable('')
    setAutomationId('')
    setShowName(false)
    setShowDate(true)
    setWxLocation('')
    setWxUnit('f')
    setWxGradient(true)
  }

  const submit = () => {
    if (kind === 'button' && !automationId) {
      toast('Select an automation')
      return
    }
    if ((kind === 'markdown' || kind === 'html') && !variable.trim()) {
      toast('Enter a variable name')
      return
    }
    const location = wxLocation.replace(/\s+/g, ' ').trim()
    if (kind === 'weather' && !location) {
      toast('Enter a location')
      return
    }
    const accepted = props.onAdd({
      kind,
      variable: variable.trim(),
      automationId,
      showName,
      showDate,
      location: location.slice(0, 100),
      unit: wxUnit === 'c' ? 'c' : 'f',
      gradient: wxGradient,
    })
    if (accepted !== false) {
      props.onOpenChange(false)
      reset()
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent portalContainer={props.portalContainer}>
        <DialogHeader>
          <DialogTitle>Add widget</DialogTitle>
          <DialogDescription>
            Placed at a default size — drag corners in Edit layout to resize.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field>
            <FieldLabel>Type</FieldLabel>
            <Combobox
              options={ADD_WIDGET_KIND_OPTIONS}
              value={kind}
              onValueChange={setKind}
              placeholder="Widget type"
              searchPlaceholder="Filter types…"
              popperContainer={props.popperContainer}
            />
          </Field>

          {(kind === 'markdown' || kind === 'html') && (
            <Field>
              <FieldLabel htmlFor="add-wd-variable">Variable name</FieldLabel>
              <Input
                id="add-wd-variable"
                className="font-mono"
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                placeholder="morning_briefing"
                maxLength={128}
              />
            </Field>
          )}

          {kind === 'button' && (
            <>
              <Field>
                <FieldLabel>Automation</FieldLabel>
                <Combobox
                  options={props.automationOptions}
                  value={automationId}
                  onValueChange={setAutomationId}
                  placeholder={
                    props.automationOptions.length ? 'Select automation' : 'No runnable automations'
                  }
                  searchPlaceholder="Search automations…"
                  emptyText="Create a Triggers/Button in Automate first."
                  disabled={!props.automationOptions.length}
                  popperContainer={props.popperContainer}
                />
                <FieldDescription>
                  Automations are Triggers/Button nodes. Set their Name property to label them here.
                </FieldDescription>
              </Field>
              <FieldRow>
                <FieldLabel htmlFor="add-wd-show-name">Show name</FieldLabel>
                <Switch id="add-wd-show-name" checked={showName} onCheckedChange={setShowName} />
              </FieldRow>
            </>
          )}

          {kind === 'clock' && (
            <FieldRow>
              <FieldLabel htmlFor="add-wd-show-date">Show date</FieldLabel>
              <Switch id="add-wd-show-date" checked={showDate} onCheckedChange={setShowDate} />
            </FieldRow>
          )}

          {kind === 'weather' && (
            <>
              <Field>
                <FieldLabel htmlFor="add-wd-location">Location</FieldLabel>
                <Input
                  id="add-wd-location"
                  value={wxLocation}
                  onChange={(e) => setWxLocation(e.target.value)}
                  placeholder={'"Manhattan, US" or "47.61,-122.33"'}
                  maxLength={100}
                />
                <FieldDescription>
                  City name (optionally with country) or a lat,lon pair. Updates hourly from OpenWeatherMap.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Temperature units</FieldLabel>
                <Combobox
                  options={WX_UNIT_OPTIONS}
                  value={wxUnit}
                  onValueChange={setWxUnit}
                  placeholder="°F (imperial)"
                  aria-label="Temperature units"
                  popperContainer={props.popperContainer}
                />
              </Field>
              <FieldRow>
                <FieldLabel htmlFor="add-wd-gradient">Gradient background</FieldLabel>
                <Switch
                  id="add-wd-gradient"
                  checked={wxGradient}
                  onCheckedChange={setWxGradient}
                />
              </FieldRow>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Add widget</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
