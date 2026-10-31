import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Slider } from '@/components/ui/slider'
import { SettingsRow, SubHeading } from '../SettingsPrimitives'
import {
  applyRenderQuality,
  getGridBrightness,
  getGridBrightnessBounds,
  getGridContrast,
  getGridContrastBounds,
  getQualityPresets,
  getRenderQuality,
  getRenderResolution,
  getShowFps,
  getShowSelectionKeybinds,
  setGridBrightness,
  setGridContrast,
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

export function RenderingSection() {
  const [quality, setQuality] = React.useState(() => getRenderQuality())
  const presets = React.useMemo(() => getQualityPresets(), [])
  const [fps, setFps] = React.useState(() => getShowFps())
  const [keybinds, setKeybinds] = React.useState(() => getShowSelectionKeybinds())
  const [resolution, setResolution] = React.useState(() => getRenderResolution())
  const contrastBounds = React.useMemo(() => getGridContrastBounds(), [])
  const brightnessBounds = React.useMemo(() => getGridBrightnessBounds(), [])
  const [contrast, setContrast] = React.useState(() => getGridContrast())
  const [brightness, setBrightness] = React.useState(() => getGridBrightness())

  return (
    <>
      <SubHeading title="Graph quality" description="Performance settings for the open graph canvas. Changes apply immediately and are remembered per browser." />
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
          <div className="flex items-center gap-3 sm:justify-end">
            <Switch checked={fps} onCheckedChange={(v) => { setShowFps(v); setFps(v) }} />
            <span className="text-xs text-muted-foreground">{fps ? 'Enabled' : 'Disabled'}</span>
          </div>
        }
      />
      <SettingsRow
        label="Selection hotkeys bar"
        description="Keep the keyboard-shortcut bar visible under the current selection."
        control={
          <div className="flex items-center gap-3 sm:justify-end">
            <Switch checked={keybinds} onCheckedChange={(v) => { setShowSelectionKeybinds(v); setKeybinds(v) }} />
            <span className="text-xs text-muted-foreground">{keybinds ? 'Enabled' : 'Disabled'}</span>
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
      <SubHeading title="Graph background" description="Contrast and brightness of the grid drawn behind nodes." />
      <SettingsRow
        label="Grid contrast"
        control={
          <SliderControl
            value={contrast}
            min={contrastBounds.min}
            max={contrastBounds.max}
            step={5}
            presets={[50, 100, 200]}
            ariaLabel="Grid contrast"
            onCommit={(v) => {
              const applied = setGridContrast(v)
              setContrast(applied)
              return applied
            }}
          />
        }
      />
      <SettingsRow
        label="Grid brightness"
        control={
          <SliderControl
            value={brightness}
            min={brightnessBounds.min}
            max={brightnessBounds.max}
            step={5}
            presets={[50, 100, 200]}
            ariaLabel="Grid brightness"
            onCommit={(v) => {
              const applied = setGridBrightness(v)
              setBrightness(applied)
              return applied
            }}
          />
        }
      />
    </>
  )
}
