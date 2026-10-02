import type { GstSplitBreakdownProps } from '../price-update-modal.contracts'
import '../PriceRevisionComposition.css'

export function GstSplitBreakdown({ baseText, gstText, totalText }: GstSplitBreakdownProps) {
  return (
    <dl className="arc-price-revision-gst">
      <div>
        <dt>Base price</dt>
        <dd>{baseText}</dd>
      </div>
      <div>
        <dt>GST</dt>
        <dd>{gstText}</dd>
      </div>
      <div>
        <dt>Total Buyer Consideration</dt>
        <dd>{totalText}</dd>
      </div>
    </dl>
  )
}
