import { Button } from '@/components/arc/button/button'

import {
  PERCENT_ADJUSTMENTS,
  TIER_CHIP_VALUES,
  type PriceAdjustmentChipsProps,
} from '../price-update-modal.contracts'
import '../PriceRevisionComposition.css'

export function PriceAdjustmentChips({
  priceAud,
  pending,
  onPercentageAdjustment,
  onTierValue,
}: PriceAdjustmentChipsProps) {
  return (
    <>
      <div className="arc-price-revision-adjustments">
        <span>Adjust by percentage</span>
        <div className="arc-price-revision-adjustment-actions">
          {PERCENT_ADJUSTMENTS.map((chip) => (
            <Button
              key={chip.label}
              type="button"
              variant="secondary"
              size="md"
              aria-pressed={false}
              disabled={pending}
              onClick={() => onPercentageAdjustment(chip.factor)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="arc-price-revision-adjustments">
        <span>Set tier price</span>
        <div className="arc-price-revision-adjustment-actions">
          {TIER_CHIP_VALUES.map((chipValue) => (
            <Button
              key={chipValue}
              type="button"
              variant="secondary"
              size="md"
              aria-pressed={priceAud === chipValue}
              disabled={pending}
              onClick={() => onTierValue(chipValue)}
            >
              A${chipValue}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}
