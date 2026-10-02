import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { PriceRevisionDiagnosticSlotProps } from '../price-update-modal.contracts'
import '../PriceRevisionComposition.css'

export function PriceRevisionDiagnosticSlot({ diagnostic }: PriceRevisionDiagnosticSlotProps) {
  return (
    <div className="arc-price-revision-diagnostic" role="status" aria-live="polite">
      {diagnostic ? (
        <Alert variant="destructive" className="py-2">
          <AlertTitle>{diagnostic.whatHappened}</AlertTitle>
          <AlertDescription>
            <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
            <span>{diagnostic.nextStep}</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
