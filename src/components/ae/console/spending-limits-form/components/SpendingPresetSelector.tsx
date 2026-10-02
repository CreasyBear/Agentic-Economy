import { Button } from '@/components/arc/button/button'
import type { SpendingPresetSelectorProps } from '../spending-limits-form.contracts'
import '../SpendingReadoutComposition.css'

export function SpendingPresetSelector({
  presets,
  selectedPresetId,
  disabled,
  onSelectPreset,
}: SpendingPresetSelectorProps) {
  return (
    <div className="arc-market arc-spending-presets">
      <div className="arc-spending-preset-options">
        {presets.map((preset) => {
          const selected = selectedPresetId === preset.id
          return (
            <Button
              key={preset.id}
              type="button"
              variant="secondary"
              size="md"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectPreset(preset.id)}
            >
              {preset.label}
            </Button>
          )
        })}
      </div>
      <p className="arc-spending-preset-hint">
        Presets keep per-call ≤ daily ≤ monthly.
      </p>
    </div>
  )
}
