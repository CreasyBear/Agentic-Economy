import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type { PriceRevisionAmountFieldProps } from '../price-update-modal.contracts'

export function PriceRevisionAmountField({
  priceAud,
  pending,
  onPriceAudChange,
}: PriceRevisionAmountFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="ae-new-price-input" className="text-sm font-semibold">
        New Price per Call (AUD)
      </Label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">A$</span>
        <Input
          id="ae-new-price-input"
          type="text"
          inputMode="decimal"
          value={priceAud}
          onChange={(e) => onPriceAudChange(e.target.value)}
          placeholder="0.10"
          className="pl-8 font-mono text-sm tabular-nums"
          disabled={pending}
        />
      </div>
    </div>
  )
}
