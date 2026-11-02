import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Slider } from '@/components/ui/slider'
import { SettingsRow, SubHeading } from '../SettingsPrimitives'
import {
  applyRenderQuality,
  getCanvasBgColor,
  getGridOpacity,
  getGridOpacityBounds,
  getGridSnap,
  getNodeBgColor,
  getNodeBgOpacity,
  getNodeBgOpacityBounds,
  isValidColorHex,
  getQualityPresets,
  getRenderQuality,
  getRenderResolution,
  getShowFps,
  getShowSelectionKeybinds,
  setCanvasBgColor,
  setGridOpacity,
  setGridSnap,
  setNodeBgColor,
  setNodeBgOpacity,
  setRenderResolution,
  setShowFps,
  setShowSelectionKeybinds,
} from '../netRender'

function SliderControl({
  value,
  min,
  max,
  step,
  presets,
  onCommit,
  ariaLabel,
}: {
  value: number
  min: number
  max: number
  step: number
  presets: number[]
  onCommit: (v: number) => number
  ariaLabel: string
}) {
  const [local, setLocal] = React.useState<number>(value)
  React.useEffect(() => setLocal(value), [value])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Slider
          value={[local]}
          min={min}
          max={max}
          step={step}
          aria-label={ariaLabel}
          onValueChange={(v) => setLocal(v[0])}
          onValueCommit={(v) => setLocal(onCommit(v[0]))}
        />
        <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">{local}</span>
      </div>
      <div className="flex gap-1.5">
        {presets.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={local === p ? 'secondary' : 'ghost'}
            className="min-w-12"
            onClick={() => setLocal(onCommit(p))}
          >
            {p}%
          </Button>
        ))}
      </div>
    </div>
  )
}

function ColorInputControl({
  value,
  placeholder,
  ariaLabel,
  onCommit,
}: {
  value: string
  placeholder: string
  ariaLabel: string
  // Returns the state now in effect, or null if the value was rejected (the
  // field then reverts). Empty-string semantics are up to the caller.
  onCommit: (v: string) => string | null
}) {
  const [draft, setDraft] = React.useState(value)
  const appliedRef = React.useRef(value)
  React.useEffect(() => {
    setDraft(value)
    appliedRef.current = value
  }, [value])
  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed === appliedRef.current) return
    const applied = onCommit(trimmed) ?? appliedRef.current
    appliedRef.current = applied
    setDraft(applied)
  }
  return (
    <div className="flex items-center gap-2 sm:justify-end">
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-sm border border-white/15"
        style={{ background: isValidColorHex(draft) ? draft : 'transparent' }}
      />
      <Input
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        spellCheck={false}
        className="w-36 font-mono text-xs"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}

export function RenderingSection() {
  const [quality, setQuality] = React.useState(() => getRenderQuality())
  const presets = React.useMemo(() => getQualityPresets(), [])
  const [fps, setFps] = React.useState(() => getShowFps())
  const [keybinds, setKeybinds] = React.useState(() => getShowSelectionKeybinds())
  const [resolution, setResolution] = React.useState(() => getRenderResolution())
  const opacityBounds = React.useMemo(() => getGridOpacityBounds(), [])
  const [opacity, setOpacity] = React.useState(() => getGridOpacity())
  const [gridSnap, setGridSnapState] = React.useState(() => getGridSnap())
  const [canvasBg, setCanvasBg] = React.useState(() => getCanvasBgColor())
  const nodeOpacityBounds = React.useMemo(() => getNodeBgOpacityBounds(), [])
  const [nodeOpacity, setNodeOpacity] = React.useState(() => getNodeBgOpacity())
  const [nodeBg, setNodeBg] = React.useState(() => getNodeBgColor())

  return (
    <>
      <SubHeading title="Graph quality" />
      <div className="[&>*:first-child]:pt-0 [&>*:last-child]:pb-0 [&>*:last-child]:border-b-0">
      <SettingsRow label="Quality preset" htmlFor="render-quality" control={
        <ToggleGroup
          id="render-quality"
          type="single"
          value={quality}
          onValueChange={(v) => {
            if (!v) return
            setQuality(applyRenderQuality(v))
          }}
          className="sm:justify-end"
        >
          {presets.map((p) => (
            <ToggleGroupItem key={p.key} value={p.key}>
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      } />
      <SettingsRow
        label="Show framerate"
        description="Overlay the canvas FPS counter."
        control={
          <div className="flex justify-end">
            <Switch checked={fps} onCheckedChange={(v) => { setShowFps(v); setFps(v) }} />
          </div>
        }
      />
      <SettingsRow
        label="Selection hotkeys bar"
        description="Keep the keyboard-shortcut bar visible under the current selection."
        control={
          <div className="flex justify-end">
            <Switch checked={keybinds} onCheckedChange={(v) => { setShowSelectionKeybinds(v); setKeybinds(v) }} />
          </div>
        }
      />
      <SettingsRow
        label="Render resolution"
        description="Internal rendering scale of the canvas — lower values stay smooth on large graphs."
        control={
          <SliderControl
            value={resolution}
            min={25}
            max={100}
            step={5}
            presets={[50, 75, 100]}
            ariaLabel="Render resolution percent"
            onCommit={(v) => {
              const applied = setRenderResolution(v)
              setResolution(applied)
              return applied
            }}
          />
        }
      />
      </div>
      <SubHeading title="Graph background" />
      <div className="[&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      <SettingsRow
        label="Canvas background"
        description="Flat fill color behind the grid — a hex value like #000000."
        control={
          <ColorInputControl
            value={canvasBg}
            placeholder="#000000"
            ariaLabel="Canvas background color"
            onCommit={(v) => {
              const applied = setCanvasBgColor(v)
              if (applied != null) setCanvasBg(applied)
              return applied
            }}
          />
        }
      />
      <SettingsRow
        label="Grid snap"
        description="Dragged nodes and groups snap onto the background grid — hold Ctrl while dragging to move freely."
        control={
          <div className="flex justify-end">
            <Switch checked={gridSnap} onCheckedChange={(v) => { setGridSnap(v); setGridSnapState(v) }} />
          </div>
        }
      />
      <SettingsRow
        label="Grid opacity"
        description="Alpha of the grid image drawn over the canvas background color."
        control={
          <SliderControl
            value={opacity}
            min={opacityBounds.min}
            max={opacityBounds.max}
            step={5}
            presets={[25, 50, 100]}
            ariaLabel="Grid opacity"
            onCommit={(v) => {
              const applied = setGridOpacity(v)
              setOpacity(applied)
              return applied
            }}
          />
        }
      />
      </div>
      <SubHeading title="Node appearance" />
      <div className="[&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      <SettingsRow
        label="Node background"
        description="Body fill for every node — a hex value like #141414; empty restores the default translucent black."
        control={
          <ColorInputControl
            value={nodeBg}
            placeholder="default"
            ariaLabel="Node background color"
            onCommit={(v) => {
              const applied = setNodeBgColor(v)
              setNodeBg(applied)
              return applied
            }}
          />
        }
      />
      <SettingsRow
        label="Node opacity"
        description="Transparency of the node body fills — titles, text and selection stay fully opaque."
        control={
          <SliderControl
            value={nodeOpacity}
            min={nodeOpacityBounds.min}
            max={nodeOpacityBounds.max}
            step={5}
            presets={[25, 50, 100]}
            ariaLabel="Node opacity"
            onCommit={(v) => {
              const applied = setNodeBgOpacity(v)
              setNodeOpacity(applied)
              return applied
            }}
          />
        }
      />
      </div>
    </>
  )
}
