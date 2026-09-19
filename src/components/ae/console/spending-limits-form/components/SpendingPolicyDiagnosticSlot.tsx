import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export type SpendingPolicyDiagnosticSlotProps = Readonly<{
  diagnostic: Rule4Diagnostic
}>

export function SpendingPolicyDiagnosticSlot({ diagnostic }: SpendingPolicyDiagnosticSlotProps) {
  return (
    <Alert variant="destructive" className="py-2">
      <AlertCircleIcon className="size-4" />
      <AlertTitle className="text-sm">{diagnostic.whatHappened}</AlertTitle>
      <AlertDescription className="grid gap-1 text-xs">
        <span>{diagnostic.financialImpact}</span>
        <span>{diagnostic.nextStep}</span>
      </AlertDescription>
    </Alert>
  )
}
