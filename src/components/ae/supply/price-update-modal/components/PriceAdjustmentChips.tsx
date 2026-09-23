import { cn } from '@/lib/utils'

import {
  PERCENT_ADJUSTMENTS,
  TACTILE,
  TIER_CHIP_VALUES,
  type PriceAdjustmentChipsProps,
} from '../price-update-modal.contracts'

export function PriceAdjustmentChips({
  priceAud,
  pending,
  onPercentageAdjustment,
  onTierValue,
}: PriceAdjustmentChipsProps) {
  return (
    <>
      <div className="grid gap-2">
        <span className="text-xs font-medium text-muted-foreground">Adjust by percentage</span>
        <div className="flex flex-wrap gap-2">
          {PERCENT_ADJUSTMENTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={cn(
                'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground hover:bg-muted/60',
                TACTILE,
              )}
              aria-pressed={false}
              disabled={pending}
              onClick={() => onPercentageAdjustment(chip.factor)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium text-muted-foreground">Set tier price</span>
        <div className="flex flex-wrap gap-2">
          {TIER_CHIP_VALUES.map((chipValue) => (
            <button
              key={chipValue}
              type="button"
              className={cn(
                'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1 font-mono text-xs font-medium tabular-nums text-foreground hover:bg-muted/60',
                TACTILE,
              )}
              aria-pressed={priceAud === chipValue}
              disabled={pending}
              onClick={() => onTierValue(chipValue)}
            >
              A${chipValue}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
