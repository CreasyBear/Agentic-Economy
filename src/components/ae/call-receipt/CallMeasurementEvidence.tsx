import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import type { ServiceUsageEvidence } from '@/modules/capability-execution/service-usage-evidence'

export function CallMeasurementEvidence({ evidence }: { evidence: ServiceUsageEvidence }) {
  if (evidence.kind !== 'available') return <AeSection title="Service measurement"><p className="text-sm text-muted-foreground">{evidence.kind === 'not_recorded' ? 'No delivered-request measurement was recorded.' : evidence.kind === 'not_observed' ? 'The measurement was not observed by this cutoff.' : 'Measurement evidence is unavailable.'}</p></AeSection>
  return <AeSection title="Service measurement" description="Canonical evidence support for one delivered request. Refunds do not reverse delivery.">
    <AeFactList facts={[
      { label: 'Historical recorded quantity', value: '1 delivered request' },
      { label: 'Currently supported quantity', value: evidence.currentQuantityUnits === null ? 'Unknown — canonical support is absent' : '1 delivered request' },
      { label: 'Measured occurrence (UTC)', value: formatUtcTimestamp(evidence.originalOccurredAt) },
      { label: 'Evidence observed through (UTC)', value: formatUtcTimestamp(evidence.asOfObservedAt) },
      { label: 'Selected revision', value: evidence.currentRevisionRef, mono: true },
    ]} />
    <p className="text-xs text-muted-foreground">Support changes preserve the original assertion. Unknown support does not prove that delivery was undone, and creates no financial adjustment.</p>
    {evidence.revisions.length === 0 ? <p className="text-xs text-muted-foreground">No support revisions by this cutoff.</p> : <details><summary>Inspect {evidence.revisions.length} support revisions</summary>
      <ol className="grid gap-intra text-sm">{evidence.revisions.map(row => <li key={row.revisionRef}>Revision {row.revision}: {row.quantityUnits === null ? 'Unknown support' : 'Supported: 1 request'}; effective {formatUtcTimestamp(row.effectiveAt)} UTC; observed {formatUtcTimestamp(row.observedAt)} UTC. <span className="break-all">{row.revisionRef}</span></li>)}</ol>
    </details>}
  </AeSection>
}
