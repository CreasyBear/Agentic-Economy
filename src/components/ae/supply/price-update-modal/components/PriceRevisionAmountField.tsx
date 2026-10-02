import type { PriceRevisionAmountFieldProps } from '../price-update-modal.contracts'
import '../PriceRevisionComposition.css'

export function PriceRevisionAmountField({
  priceAud,
  pending,
  onPriceAudChange,
}: PriceRevisionAmountFieldProps) {
  return (
    <div className="arc-market arc-price-revision-field">
      <label htmlFor="ae-new-price-input" className="arc-price-revision-label">
        New Price per Call (AUD)
      </label>
      <div className="arc-price-revision-input-wrap">
        <span aria-hidden="true" className="arc-price-revision-currency">A$</span>
        <input
          id="ae-new-price-input"
          type="text"
          inputMode="decimal"
          value={priceAud}
          onChange={(e) => onPriceAudChange(e.target.value)}
          placeholder="0.10"
          className="arc-price-revision-input"
          disabled={pending}
        />
      </div>
    </div>
  )
}
