import type { AeRecordTableFeatures } from '@/components/ae/operator/AeOperatorDataTable'
import type { ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/arc/button/button'
import { BillingHistory } from '@/components/ae/shared/arc-pro/billing-overview/billing-overview'
import { formatTimestamp } from '@/lib/ui/format-time'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MetricsSummary } from '@/components/ae/shared/arc-pro/metrics-dashboard/metrics-dashboard'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { formatExactAmount, type UsageReconciliation } from '@/modules/money/public'
import './ActivitySummaryComposition.css'

type Summary = Extract<UsageReconciliation, { kind: 'available' }>
type Credential = Summary['credentials'][number]
function amount(units: string, currency: 'AUD' | 'USDC' = 'AUD') {
  const negative = units.startsWith('-')
  const value = formatExactAmount({ currency, exponent: 6, units: negative ? units.slice(1) : units })
  return value === undefined ? 'Unavailable' : `${negative ? '−' : ''}${currency} ${value}`
}
const bridgeLabels = { before_period: 'Calls created before this period', in_period: 'Calls created in this period', after_period: 'Calls created after this period', unattributed: 'Unattributed entries' } as const
export function ActivityReconciliation({ result, retryPending, onRetry, returnScope, sourceFactsCapturedAt }: { result: UsageReconciliation; retryPending: boolean; onRetry: () => void; returnScope: ActivityReturnScope; sourceFactsCapturedAt?: number }) {
  const columns = useMemo<ColumnDef<AeRecordTableFeatures, Credential, unknown>[]>(() => [
    { accessorKey: 'credentialRef', header: 'Credential', cell: ({ row }) => <span className="block min-w-48 max-w-full whitespace-normal break-all">{row.original.credentialRef}</span> },
    { accessorKey: 'createdCallCountUnits', header: 'Calls created' },
    { accessorKey: 'linkedCallCountUnits', header: 'Calls linked to period entries' },
    { id: 'gross', header: 'Purchased charges', cell: ({ row }) => amount(row.original.totals.grossChargeUnits) },
    { id: 'refund', header: 'Refunds', cell: ({ row }) => amount(row.original.totals.refundUnits) },
    { id: 'net', header: 'Net purchased cost', cell: ({ row }) => amount(row.original.totals.netChargeUnits) },
    { id: 'promo', header: 'Net promotional use', cell: ({ row }) => amount(row.original.totals.netPromotionalUseUnits) },
  ], [])
  const entryColumns = useMemo<ColumnDef<AeRecordTableFeatures, Summary['entries'][number], unknown>[]>(() => [
    { accessorKey: 'transactionId', header: 'Ledger transaction' },
    { accessorKey: 'kind', header: 'Financial entry' },
    { id: 'amount', header: 'Amount', cell: ({row}) => row.original.units === null || row.original.currency === null ? 'Unknown' : amount(row.original.units, row.original.currency) },
    { id: 'effective', header: 'Effective (UTC)', cell: ({row}) => formatTimestamp(row.original.occurredAt, 'UTC') },
    { id: 'recorded', header: 'Recorded (UTC)', cell: ({row}) => row.original.recordedAt === null ? 'Unknown' : formatTimestamp(row.original.recordedAt, 'UTC') },
    { id: 'call', header: 'Call evidence', cell: ({row}) => row.original.callRef === null ? 'Unattributed' : <Link to="/calls/$callRef" params={{callRef:row.original.callRef}} search={returnScope} aria-label={`View Call for ledger transaction ${row.original.transactionId}`}>View Call</Link> },
    { id: 'status', header: 'Included in measured amounts', cell: ({row}) => row.original.kind === 'unsupported' ? 'No — unsupported entry' : row.original.reverted ? 'No — reverted original' : 'Yes' },
  ], [returnScope])
  if (result.kind !== 'available') return <AeSection title="Financial reconciliation"><p className="text-sm text-muted-foreground">Financial reconciliation is unavailable. Choose a shorter period or retry the read.</p><Button type="button" variant="secondary" loading={retryPending} onClick={onRetry}>{retryPending ? 'Refreshing…' : 'Retry reconciliation'}</Button></AeSection>
  return <AeSection title="Financial reconciliation" description="Financial entries use ledger effective dates. Call counts and recorded obligations use Call creation dates. All amounts retain six decimal places.">
    <p className="text-xs text-muted-foreground">Ledger snapshot: {formatTimestamp(result.snapshotAt, 'UTC')} UTC. Selected financial period: {formatTimestamp(result.periodStartAt, 'UTC')} to {formatTimestamp(result.periodEndAt, 'UTC')} UTC.</p>
    <div className="arc-market arc-activity-monthly-summary"><MetricsSummary cards={[
      { label: result.amountCoverage === 'complete' ? 'Gross purchased-credit charges' : 'Measured purchased-credit charges', value: amount(result.totals.grossChargeUnits) },
      { label: 'Purchased-credit refunds', value: amount(result.totals.refundUnits) },
      { label: result.amountCoverage === 'complete' ? 'Net customer purchased cost' : 'Measured net purchased cost', value: amount(result.totals.netChargeUnits) },
      { label: 'Net promotional-credit use', value: amount(result.totals.netPromotionalUseUnits) },
      { label: 'Booked provider transfers', value: amount(result.totals.providerTransferUnits, 'USDC') },
      { label: 'Booked provider reversals', value: amount(result.totals.providerReversalUnits, 'USDC') },
    ]} /></div>
    <p className="text-xs text-muted-foreground">Amount coverage: {result.amountCoverage}. {result.amountCoverage === 'partial' ? 'Every amount above is a measured subset; missing or reverted evidence prevents confirmed totals.' : 'All supported ledger entries in the financial period were read.'} Call attribution: {result.attributionCoverage}; {result.unattributedTransactionCountUnits} entries remain unattributed. Missing provider costs remain unknown.</p>
    <details><summary className="cursor-pointer text-sm">How these amounts and dates reconcile</summary>
    <p className="text-xs text-muted-foreground">Charges include the fees and tax already booked in the buyer sale. Provider transfers are shown separately in USDC; they are never subtracted again from the customer charge. A customer refund does not reverse provider payment.</p>
    <p className="text-xs text-muted-foreground">{sourceFactsCapturedAt === undefined ? 'Canonical Call links are verified at read time; financial entries retain their ledger snapshot cutoff.' : `Canonical Call links were verified and frozen at ${formatTimestamp(sourceFactsCapturedAt, 'UTC')} UTC. This view reproduces that draft version.`}</p>
    <ul className="grid gap-1 text-sm" aria-label="Call creation period bridge">
      {result.bridge.map(row => <li key={row.callCreated}>{bridgeLabels[row.callCreated]}: {amount(row.totals.netChargeUnits)} net purchased cost; {amount(row.totals.netPromotionalUseUnits)} net promotional use; {amount(row.totals.netProviderTransferUnits, 'USDC')} net provider transfer.</li>)}
    </ul>
    <p className="text-xs text-muted-foreground">{result.createdCallCountUnits} Calls created in this window have {amount(result.createdCallProviderObligationUnits, 'USDC')} recorded obligations; {result.unknownProviderObligationCallCountUnits} have no recorded obligation amount. An obligation is not confirmed cost. These counts describe recorded activity; internal production traffic has not been classified.</p>
    </details>
    <BillingHistory title="Credential attribution" description="Shared Credentials may represent multiple Agents. Canonical Call identity controls attribution. Charges use financial dates; created counts use Call dates."><AeRecordTable columns={columns} data={result.credentials} getRowId={row => row.credentialRef} caption="Credential attribution from canonical Calls and verified ledger references" emptyMessage="No credential-attributed usage in this period." hideFilter /></BillingHistory>
    <details><summary className="cursor-pointer text-sm">Inspect {result.transactionCountUnits} financial entries</summary>
      <AeRecordTable columns={entryColumns} data={result.entries} getRowId={row => row.transactionId} caption="Financial evidence and its verified Call source" emptyMessage="No charge, refund, promotional use or provider transfer entries in this period." maxHeight="60vh" />
    </details>
  </AeSection>
}
