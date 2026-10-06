import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'

import type { PriceRevisionDiagnosticSlotProps } from '../price-update-modal.contracts'
import '../PriceRevisionComposition.css'

export function PriceRevisionDiagnosticSlot({ diagnostic }: PriceRevisionDiagnosticSlotProps) {
  return (
    <div className="arc-price-revision-diagnostic" role="status" aria-live="polite">
      {diagnostic ? (
        <AeAlert tone="danger" title={diagnostic.whatHappened} className="py-2">
            <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
            <span>{diagnostic.nextStep}</span>
          </AeAlert>
      ) : null}
    </div>
  )
}
