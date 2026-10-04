import { BillingHistory } from '@/components/arc/blocks/billing-overview/billing-overview'
import { MetricsSummary } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { providerUnitDefinitions, type ProviderUnitEvidence } from '@/modules/capability-execution/provider-service-units'
import '../activity/components/ActivitySummaryComposition.css'
export function CallProviderUnits({evidence}: {evidence: ProviderUnitEvidence}) {
  const current = evidence.current
  return <BillingHistory title="Provider receipt quantities" description="Supported quantities from completed Call receipts. Failed, unresolved, unsupported and older attempts remain unknown. These quantities create no financial charge. Source time uses the recorded Call update at first capture; a rebuild can capture a later update.">
    {current === null ? <p className="text-sm text-muted-foreground">Current provider quantities are unknown. {evidence.observations.length === 0 ? 'No supported receipt quantities were recorded.' : 'Historical observations remain available below.'}</p> : <>
      <div className="arc-market arc-activity-monthly-summary"><MetricsSummary cards={current.units.map(unit => ({label: providerUnitDefinitions[unit.unitDefinitionRef].label, value: unit.state === 'observed' ? unit.quantityUnits ?? 'Unknown' : 'Unknown'}))} /></div>
      <AeFactList facts={[{label: 'Requested model', value: current.requestedModel ?? 'Unknown'}, {label: 'Response model field', value: current.responseModel ?? 'Unknown'},
        {label: 'Source coverage', value: `${current.units.filter(unit => unit.state === 'observed').length} of ${current.units.length} quantities reported`},
        {label: 'Attempt / effect generation', value: `${current.attemptNumber} / ${current.effectGeneration}`},
        {label: 'First captured Call update basis (UTC)', value: formatUtcTimestamp(current.occurredAt)}, {label: 'Evidence observed (UTC)', value: formatUtcTimestamp(current.observedAt)},
        {label: 'Decoder / transport', value: `${current.profile} / ${current.adapterId}`}, {label: 'Source digest', value: current.sourceDigest, mono: true}]} />
    </>}
    <p className="text-xs text-muted-foreground">Input tokens include cache reads; output tokens include reasoning. ElevenLabs character credits are an upstream unit. Response model fields may describe a gateway substitution incompletely. Quantities do not establish the provider cost, Aecon Credit balance or settled payment.</p>
    <details><summary>Inspect {evidence.observations.length} immutable provider observations</summary><ol className="grid gap-intra text-sm">
      {evidence.observations.map(row => <li key={row.observationRef}>Attempt {row.attemptNumber}, effect {row.effectGeneration}: {row.change === 'initial_attempt' ? 'Initial attempt observation' : 'Support correction'}. {row.units.map(unit => `${providerUnitDefinitions[unit.unitDefinitionRef].label}: ${unit.state === 'observed' ? unit.quantityUnits : 'Unknown'}`).join('; ')}. Observed {formatUtcTimestamp(row.observedAt)} UTC. <span className="break-all">{row.observationRef}</span></li>)}
    </ol></details>
  </BillingHistory>
}
