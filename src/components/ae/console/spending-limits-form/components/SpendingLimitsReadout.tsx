import type { SpendingLimitsReadoutProps } from '../spending-limits-form.contracts'
import '../SpendingReadoutComposition.css'

export function SpendingLimitsReadout({
  perCallDisplay,
  dailyDisplay,
  monthlyDisplay,
}: SpendingLimitsReadoutProps) {
  return (
    <dl className="arc-market arc-spending-readout">
      <div>
        <dt>Per call max</dt>
        <dd>
          {perCallDisplay}
        </dd>
      </div>
      <div>
        <dt>Daily budget</dt>
        <dd>
          {dailyDisplay}
        </dd>
      </div>
      <div>
        <dt>Monthly budget</dt>
        <dd>
          {monthlyDisplay}
        </dd>
      </div>
    </dl>
  )
}
