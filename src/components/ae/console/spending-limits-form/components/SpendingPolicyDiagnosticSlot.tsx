import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import '../SpendingPolicyComposition.css'

export type SpendingPolicyDiagnosticSlotProps = Readonly<{
  diagnostic: Rule4Diagnostic
}>

export function SpendingPolicyDiagnosticSlot({ diagnostic }: SpendingPolicyDiagnosticSlotProps) {
  return (
    <Alert variant="destructive" className="arc-market arc-spending-policy-diagnostic">
      <AlertCircleIcon className="size-4" aria-hidden="true" />
      <AlertTitle>{diagnostic.whatHappened}</AlertTitle>
      <AlertDescription className="arc-spending-policy-diagnostic-body">
        <span>{diagnostic.financialImpact}</span>
        <span>{diagnostic.nextStep}</span>
      </AlertDescription>
    </Alert>
  )
}
