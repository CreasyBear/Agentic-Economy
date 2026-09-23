import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { PriceRevisionDiagnosticSlotProps } from '../price-update-modal.contracts'

export function PriceRevisionDiagnosticSlot({ diagnostic }: PriceRevisionDiagnosticSlotProps) {
  return (
    <div className="min-h-[2.5rem]" role="status" aria-live="polite">
      {diagnostic ? (
        <Alert variant="destructive" className="py-2">
          <AlertTitle className="text-xs font-semibold">{diagnostic.whatHappened}</AlertTitle>
          <AlertDescription className="grid gap-0.5 text-xs">
            <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
            <span>{diagnostic.nextStep}</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
