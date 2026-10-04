import { Link } from '@tanstack/react-router'
import { BillingHistory } from '@/components/arc/blocks/billing-overview/billing-overview'
import { MetricsSummary } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import { monthlyDraftPeriod, type MonthlyDraftSnapshot } from '@/modules/capability-execution/monthly-usage-draft'
import { summarizeProviderUnits, providerUnitDefinitions, validProviderObservation } from '@/modules/capability-execution/provider-service-units'
import type { ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import './ActivitySummaryComposition.css'
export function MonthlyProviderUnits({snapshot, returnScope}: {snapshot: Pick<MonthlyDraftSnapshot, 'month' | 'draftRef' | 'providerUnitEvidence'>; returnScope: ActivityReturnScope}) {
  const {periodStartAt, periodEndAt} = monthlyDraftPeriod(snapshot.month)
  const evidence = snapshot.providerUnitEvidence
  const rows = evidence?.flatMap(row => {
    const attempts = new Map<string, typeof row.evidence.observations[number]>()
    for (const observation of row.evidence.observations) attempts.set(`${observation.attemptRef}:${observation.effectGeneration}`, observation)
    return [...attempts.values()].filter(observation => observation.occurredAt >= periodStartAt && observation.occurredAt < periodEndAt)
      .map(observation => ({callRef: row.callRef, observation, current: row.evidence.currentSupport === 'verified' && row.evidence.current?.observationRef === observation.observationRef}))
  }) ?? []
  const units = summarizeProviderUnits(rows.map(row => ({observation: row.observation, verified: validProviderObservation(row.observation)})), 'historical_latest_attempt_reports')
  const calls = new Set(rows.map(row => row.callRef))
  return <BillingHistory title="Frozen provider receipt quantities" description="Historical provider reports by attempt. Select the latest report per attempt; corrections are not added together. Each unit is separate. The source month uses the recorded Call update at first capture for an attempt. Rebuilds may capture a later update; actual service time is unproved. Financial entries use their ledger dates.">
    {evidence === undefined ? <p>Provider quantity evidence was not captured in this older draft.</p> : <>
      <div className="arc-market arc-activity-monthly-summary"><MetricsSummary cards={units.map(unit => ({label: `Historically reported ${providerUnitDefinitions[unit.unitDefinitionRef].label}`, value: unit.observedReceiptCountUnits === '0' ? 'Unknown' : unit.observedQuantityUnits}))} /></div>
      {units.map(unit => <p className="text-xs text-muted-foreground" key={unit.unitDefinitionRef}>{providerUnitDefinitions[unit.unitDefinitionRef].label}: {unit.observedReceiptCountUnits} reported attempts; {unit.unknownReceiptCountUnits} attempts with unknown quantities.</p>)}
      <p className="text-xs text-muted-foreground">{rows.length} captured attempt reports in {calls.size} Calls have a recorded source date in this month. {rows.filter(row => row.current).length} match the current canonical source at capture. {evidence.length - calls.size} other captured Calls have no provider history for this month. Historical reports do not establish current delivery or payment. Failed, unresolved, unsupported and uncaptured consumption remains unknown.</p>
      <ul className="text-sm">{rows.map(row => <li key={row.observation.observationRef}><Link className="break-all" to="/calls/$callRef" params={{callRef: row.callRef}} search={{...returnScope, returnDraftRef: snapshot.draftRef}}>Inspect receipt {row.callRef}, attempt {row.observation.attemptNumber}</Link>: {row.current ? 'Current source supported at capture' : 'Historical provider report; current support not established'}.</li>)}</ul>
    </>}
  </BillingHistory>
}
