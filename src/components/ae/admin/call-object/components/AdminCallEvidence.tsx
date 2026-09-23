import { CallMoneyFacts } from '@/components/ae/call-receipt/CallMoneyFacts'
import { CallReceiptTimeline } from '@/components/ae/call-receipt/CallReceiptTimeline'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import type { AdminCallObjectViewModel } from '../call-object.contracts'
import { ADMIN_CALL_OBJECT_COPY } from '../call-object.contracts'

export type AdminCallEvidenceProps = Readonly<{
  model: AdminCallObjectViewModel
}>

export function AdminCallEvidence({ model }: AdminCallEvidenceProps) {
  return (
    <div className="grid content-start gap-section">
      <AeSection
        title={ADMIN_CALL_OBJECT_COPY.factsTitle}
        description={ADMIN_CALL_OBJECT_COPY.factsDescription}
      >
        <AeFactList facts={model.facts} />
      </AeSection>
      {model.moneyTruth === null ? null : (
        <AeSection title={ADMIN_CALL_OBJECT_COPY.moneyTruthTitle}>
          <p className="text-sm text-muted-foreground">{model.moneyTruth}</p>
        </AeSection>
      )}
      <CallReceiptTimeline stages={model.view.receipt.stages} />
      {model.view.purchase.kind === 'uncertain' ? null : (
        <CallMoneyFacts view={model.view.receipt} />
      )}
    </div>
  )
}
