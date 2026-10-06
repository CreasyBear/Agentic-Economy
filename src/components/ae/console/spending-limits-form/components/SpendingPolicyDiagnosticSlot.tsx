
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import '../SpendingPolicyComposition.css'

export type SpendingPolicyDiagnosticSlotProps = Readonly<{
  diagnostic: Rule4Diagnostic
}>

export function SpendingPolicyDiagnosticSlot({ diagnostic }: SpendingPolicyDiagnosticSlotProps) {
  return (
    <AeAlert tone="danger" title={diagnostic.whatHappened} className="arc-market arc-spending-policy-diagnostic"><div className="arc-spending-policy-diagnostic-body">
        <span>{diagnostic.financialImpact}</span>
        <span>{diagnostic.nextStep}</span>
      </div></AeAlert>
  )
}
