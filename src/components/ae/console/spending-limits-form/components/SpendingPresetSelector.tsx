import type { SpendingPresetSelectorProps } from '../spending-limits-form.contracts'

const PRESET_CHIP_CLASS =
  'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export function SpendingPresetSelector({
  presets,
  selectedPresetId,
  disabled,
  onSelectPreset,
}: SpendingPresetSelectorProps) {
  return (
    <div className="grid min-h-[2.75rem] gap-1.5">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const selected = selectedPresetId === preset.id
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onSelectPreset(preset.id)}
              className={`${PRESET_CHIP_CLASS}${selected ? ' border-foreground bg-muted' : ''}`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Presets keep per-call ≤ daily ≤ monthly.
      </p>
    </div>
  )
}
