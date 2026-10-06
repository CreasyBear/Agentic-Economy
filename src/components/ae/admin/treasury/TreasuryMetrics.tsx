import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeOperatorSortableHeader, AeRecordTable } from '@/components/ae/operator/AeOperatorDataTable'
import { Badge } from '@/components/arc/badge/badge'
import { MetricsOverview, MetricsPanel } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'
import { AeApproximateQuotaMeter } from '@/components/ae/shared/usage-meter/AeApproximateQuotaMeter'
import buttonStyles from '@/components/arc/button/button.module.css'
import type { ColumnDef } from '@tanstack/react-table'
import { formatCount, formatRelativeTime, formatTimestamp } from '@/lib/ui/format-time'
import type { AdminTreasuryView, TreasuryCheck } from '@/modules/money/treasury-report'
import { sumTreasuryUnits, treasuryMoney, treasuryRatios } from './treasury-view-model'
import Decimal from 'decimal.js'

const unavailable = (label: string) => <AeInlineState state="unavailable" label={`${label} unavailable`} description="Waiting for a complete source read." />
function SourceTime({ label, at }: { label: string; at: number }) {
  return <p className="text-xs text-muted-foreground">{label}: <time dateTime={new Date(at).toISOString()} title={formatTimestamp(at)}>{formatRelativeTime(at)} · {formatTimestamp(at)}</time></p>
}
function Check({ label, check }: { label: string; check: TreasuryCheck | undefined }) {
  if (check === undefined || check.kind === 'unavailable') return unavailable(label)
  if (check.kind === 'matched') return <p className="text-sm"><Badge tone="success">{label === 'Cash' ? 'Cash reconciled' : `${label} matched`}</Badge> <span className="text-muted-foreground">{formatCount(check.checkedCount)} checked</span></p>
  return <p className="text-sm"><Badge tone={check.kind === 'mismatch' ? 'danger' : 'warning'}>{label} needs review</Badge> <span className="text-muted-foreground">{check.kind === 'attention' ? `${formatCount(check.pendingCount)} pending` : `${formatCount(check.checkedCount)} checked`}</span></p>
}

type BookedRefill = NonNullable<AdminTreasuryView['snapshot']>['deposits'][number]
type InFlightCall = Extract<NonNullable<AdminTreasuryView['snapshot']>['inFlight'], { kind: 'available' }>['calls'][number]
const amountSort = (left: string, right: string) => new Decimal(left).comparedTo(right)

function BookedRefills({ deposits, environment }: { deposits: readonly BookedRefill[]; environment: AdminTreasuryView['environment'] }) {
  const columns: ColumnDef<BookedRefill, unknown>[] = [
    { id: 'amount', accessorKey: 'amountUnits', meta: { label: 'Amount', numeric: true },
      header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
      sortingFn: (left, right) => amountSort(left.original.amountUnits, right.original.amountUnits),
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{row.original.chainTransactionHash === null ? 'Opening balance · ' : ''}{treasuryMoney(row.original.amountUnits)}</span> },
    { id: 'booked', accessorKey: 'bookedAt', meta: { label: 'Booked' },
      header: ({ column }) => <AeOperatorSortableHeader label="Booked" column={column} />,
      cell: ({ row }) => <time className="whitespace-nowrap" dateTime={new Date(row.original.bookedAt).toISOString()}>{formatTimestamp(row.original.bookedAt)}</time> },
    { id: 'transfer', accessorFn: row => `${row.transactionRef} ${row.chainTransactionHash ?? ''}`, header: 'Transfer', meta: { label: 'Transfer' }, enableSorting: false,
      cell: ({ row }) => {
        const hash = row.original.chainTransactionHash
        return <details className="min-w-0">
          <summary className="cursor-pointer text-sm">Transfer details</summary>
          <p className="mt-intra break-all text-xs" title={row.original.transactionRef}>{row.original.transactionRef}</p>
          {hash === null ? null : <p className="mt-intra break-all text-xs" title={hash}>{hash}</p>}
          {hash !== null && /^0x[0-9a-fA-F]{64}$/.test(hash) ? <a
            className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm} mt-intra`} target="_blank" rel="noopener noreferrer"
            href={`https://${environment === 'production' ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${hash}`}
          >View transfer<span className="sr-only"> on {environment === 'production' ? 'Base' : 'Base Sepolia'} (opens a new tab)</span></a> : null}
        </details>
      } },
  ]
  return <AeRecordTable columns={columns} data={deposits} getRowId={row => row.transactionRef} caption="Recent booked refills"
    filterPlaceholder="Filter booked refills" countLabel="refills" emptyMessage="No booked refills match this filter." />
}

function InFlightCalls({ calls }: { calls: readonly InFlightCall[] }) {
  const columns: ColumnDef<InFlightCall, unknown>[] = [
    { id: 'call', accessorKey: 'callRef', meta: { label: 'Call', truncate: true },
      header: ({ column }) => <AeOperatorSortableHeader label="Call" column={column} />,
      cell: ({ row }) => <a className="block min-w-0 truncate underline underline-offset-4" title={row.original.callRef}
        href={`/admin/calls/${encodeURIComponent(row.original.callRef)}`}>{row.original.callRef}</a> },
    { id: 'amount', accessorKey: 'amountUnits', meta: { label: 'Amount', numeric: true },
      header: ({ column }) => <AeOperatorSortableHeader label="Amount" column={column} />,
      sortingFn: (left, right) => amountSort(left.original.amountUnits, right.original.amountUnits),
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{treasuryMoney(row.original.amountUnits)}</span> },
    { id: 'created', accessorKey: 'createdAt', meta: { label: 'Created' },
      header: ({ column }) => <AeOperatorSortableHeader label="Created" column={column} />,
      cell: ({ row }) => <time className="whitespace-nowrap" title={formatTimestamp(row.original.createdAt)}
        dateTime={new Date(row.original.createdAt).toISOString()}>{formatRelativeTime(row.original.createdAt)}</time> },
  ]
  return <AeRecordTable columns={columns} data={calls} getRowId={row => row.callRef} caption="Unresolved Calls"
    filterPlaceholder="Filter unresolved Calls" countLabel="Calls" emptyMessage="No unresolved Calls match this filter." />
}

/**
 * Requires a typed source read; only a positive limit can define a percentage.
 * Ensures approximate geometry and exact under/at/over state come from the same units.
 * Invariant: display rounding never changes the limit state or the exact money facts.
 * On violation: null means the percentage is unavailable; source amounts remain visible.
 */
function exposureMeter(spending: NonNullable<AdminTreasuryView['snapshot']>['spending'] | undefined) {
  if (spending?.kind !== 'available') return null
  const maximum = new Decimal(spending.maximumUnits)
  if (!maximum.gt(0)) return null
  const used = new Decimal(sumTreasuryUnits(spending.settledUnits, spending.liabilityUnits))
  const percentage = used.div(maximum).mul(100).toNumber()
  if (!Number.isFinite(percentage)) return null
  const limitState = used.gt(maximum) ? 'over' as const : used.eq(maximum) ? 'at' as const : 'under' as const
  return { percentage, limitState }
}
export function TreasuryMetrics({ view }: { view: AdminTreasuryView }) {
  const snapshot = view.snapshot
  const ledger = snapshot?.ledger
  const chain = snapshot?.chain
  const inflight = snapshot?.inFlight
  const spending = snapshot?.spending
  const ratios = treasuryRatios(snapshot)
  const exposure = exposureMeter(spending)
  return <MetricsOverview title="Treasury position" cards={[
    { label: 'Available for spending', value: ledger?.kind === 'available' ? treasuryMoney(ledger.availableUnits) : 'Unavailable' },
    { label: 'Committed to Calls', value: ledger?.kind === 'available' ? treasuryMoney(ledger.committedUnits) : 'Unavailable' },
    { label: 'Protected buffer', value: ledger?.kind === 'available' ? treasuryMoney(ledger.bufferUnits) : 'Unavailable' },
    { label: 'Customer credit · AUD', value: ratios.creditAudUnits === null ? 'Unavailable' : treasuryMoney(ratios.creditAudUnits, 'AUD') },
  ]}>
    <MetricsPanel title="Float" description="Company USDC working capital. Customer credit is held in AUD.">
      <div className="grid min-w-0 gap-related">
        {view.observation === null ? unavailable('Wallet observation') : <>
          <p className="text-2xl font-medium tabular-nums">{treasuryMoney(view.observation.totalUnits)}</p>
          <SourceTime label="Latest CDP wallet observation" at={view.observation.observedAt} />
        </>}
        {ledger?.kind !== 'available' ? unavailable('Ledger balances') : <>
          <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
            { label: 'Available for spending', value: treasuryMoney(ledger.availableUnits) },
            { label: 'Committed to Calls', value: treasuryMoney(ledger.committedUnits) },
            { label: 'Protected buffer', value: treasuryMoney(ledger.bufferUnits) },
          ]} />
          <SourceTime label="Native ledger snapshot" at={ledger.observedAt} />
        </>}
        {chain?.kind !== 'available' ? unavailable('Finalized chain balance') : <>
          <AeFactList density="compact" facts={[{ label: `Finalized chain balance · block ${chain.blockNumber}`, value: treasuryMoney(chain.totalUnits) }]} />
          <SourceTime label="Chain read" at={chain.observedAt} />
          <SourceTime label="Finalized block" at={chain.blockTimestamp} />
          {!chain.caughtUp ? <AeInlineState state="pending" label="Catching up" description="The confirmed chain range is still advancing." /> : null}
        </>}
        <Check label="Cash" check={snapshot?.checks.cash} />
        {snapshot?.rawCashDifferenceUnits !== null && snapshot?.rawCashDifferenceUnits !== undefined ? <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Cash comparison details</summary>
          <AeFactList className="mt-related" facts={[
            { label: 'Raw difference before timing adjustment', value: treasuryMoney(snapshot.rawCashDifferenceUnits) },
            { label: 'Timing adjustment', value: snapshot.cashTimingAdjustmentUnits === null ? 'Unavailable' : treasuryMoney(snapshot.cashTimingAdjustmentUnits) },
          ]} />
          <p className="mt-intra text-xs text-muted-foreground">Includes available, committed and protected buffer. Different measurement times may explain the raw difference.</p>
        </details> : null}
        {snapshot === null ? unavailable('Booked refills') : <div className="grid gap-intra border-t border-border pt-related">
          <h3 className="text-sm font-medium">Recent booked refills</h3>
          {snapshot.deposits.length === 0 && !snapshot.depositsComplete ? unavailable('Booked refills') : snapshot.deposits.length === 0 ? <p className="text-sm text-muted-foreground">No booked refills in this report.</p> : <BookedRefills deposits={snapshot.deposits} environment={view.environment} />}
          {!snapshot.depositsComplete ? <p className="text-xs text-muted-foreground">Additional booked entries are not shown here.</p> : null}
        </div>}
      </div>
    </MetricsPanel>
    <MetricsPanel title="Runway" description="Available USDC divided by the average daily provider payments over the last seven days. Committed funds and the buffer are excluded.">
      {ledger?.kind !== 'available' ? unavailable('Runway') : <>
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Provider payments · last 24 hours', value: treasuryMoney(ledger.payments24hUnits) },
          { label: 'Provider payments · last 7 days', value: treasuryMoney(ledger.payments7dUnits) },
          { label: 'Available runway', value: ratios.runway === null ? 'No spend in the last seven days' : `${ratios.runway >= 9999 ? '≥ ' : ''}${ratios.runway.toFixed(1)} days` },
        ]} />
        <p className="text-xs text-muted-foreground">Gross provider payments; returned funds do not reduce burn.</p>
      </>}
      <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-2" facts={view.controls.thresholds.kind === 'runway' ? [
        { label: 'Low-water mark', value: `${view.controls.thresholds.lowWaterDays} days of runway` },
        { label: 'Target float', value: `${view.controls.thresholds.targetDays} days of runway` },
      ] : [
        { label: 'Low-water mark · fixed', value: treasuryMoney(view.controls.thresholds.lowWaterUnits) },
        { label: 'Target float · fixed', value: treasuryMoney(view.controls.thresholds.targetFloatUnits) },
      ]} />
    </MetricsPanel>
    <MetricsPanel title="Coverage" description="Available USDC against all purchased and promotional AUD credit, including credit reserved for Calls. Committed USDC and the protected buffer are excluded from available funds.">
      {ledger?.kind !== 'available' ? unavailable('Customer credit') : <>
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Purchased credit · available + reserved', value: treasuryMoney(sumTreasuryUnits(ledger.purchasedAvailableAudUnits, ledger.purchasedReservedAudUnits), 'AUD') },
          { label: 'Promotional credit · available + reserved', value: treasuryMoney(sumTreasuryUnits(ledger.promotionalAvailableAudUnits, ledger.promotionalReservedAudUnits), 'AUD') },
          { label: 'Total credit', value: ratios.creditAudUnits === null ? 'Unavailable' : treasuryMoney(ratios.creditAudUnits, 'AUD') },
        ]} />
        {snapshot?.referenceRate.kind !== 'available' ? unavailable('Credit conversion and coverage') : <>
          <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-2" facts={[
            { label: 'Credit equivalent', value: ratios.creditUsdcUnits === null ? 'Unavailable' : treasuryMoney(ratios.creditUsdcUnits) },
            { label: 'Available USDC / credit equivalent', value: ratios.creditAudUnits === '0' ? 'No outstanding credit' : ratios.coverage === null ? 'Unavailable' : `${ratios.coverage >= 9999 ? '≥ ' : ''}${ratios.coverage.toFixed(2)}×` },
          ]} />
          <SourceTime label="Reference rate" at={snapshot.referenceRate.observedAt} />
        </>}
      </>}
      <Check label="Customer funding" check={snapshot?.checks.funding} />
    </MetricsPanel>
    <MetricsPanel title="In flight" description="Unresolved Calls and spend exposure remain visible while payments are paused.">
      {inflight?.kind !== 'available' ? unavailable('Reconciliation queue') : <>
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Calls requiring reconciliation', value: `${formatCount(inflight.count)} · ${treasuryMoney(inflight.amountUnits)}` },
          { label: 'Oldest unresolved Call', value: inflight.oldestAt === null ? 'None' : formatRelativeTime(inflight.oldestAt) },
          { label: 'Overdue reservations', value: `${formatCount(inflight.overdueCount)} · ${treasuryMoney(inflight.overdueUnits)}` },
        ]} />
        {inflight.calls.length > 0 ? <InFlightCalls calls={inflight.calls} /> : null}
        {!inflight.listedCallsComplete ? <a href="/admin/exceptions?kind=uncertain_call&partition=reconciliation_required" className="text-sm underline underline-offset-4">More Calls remain. Open the reconciliation queue.</a> : null}
      </>}
      {spending?.kind !== 'available' ? unavailable('Rolling spend exposure') : <div className="grid gap-intra">
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Settled · rolling 24 hours', value: treasuryMoney(spending.settledUnits) },
          { label: 'Unresolved signing liability', value: treasuryMoney(spending.liabilityUnits) },
          { label: 'Exposure / rolling limit', value: `${treasuryMoney(sumTreasuryUnits(spending.settledUnits, spending.liabilityUnits))} / ${treasuryMoney(spending.maximumUnits)}` },
        ]} />
        {exposure === null ? unavailable('Exposure percentage') : <>
          <p className="text-sm">Rolling spend exposure against limit</p>
          <AeApproximateQuotaMeter
            label="Rolling spend exposure against limit"
            percentage={exposure.percentage}
            limitState={exposure.limitState}
            summary={`Rolling spend exposure ${exposure.percentage.toFixed(1)}% of the limit. ${exposure.limitState === 'under' ? 'Under the limit.' : exposure.limitState === 'at' ? 'At the limit.' : 'Over the limit.'}`}
          />
        </>}
        {exposure === null ? null : <p className="text-xs text-muted-foreground">The percentage is approximate. Exposure and limit amounts above remain exact.</p>}
        <SourceTime label="Rolling window starts" at={spending.windowStartsAt} />
      </div>}
      <div className="grid gap-intra sm:grid-cols-2"><Check label="Provider payments" check={snapshot?.checks.settlements} /><Check label="Reservations" check={snapshot?.checks.reservations} /></div>
    </MetricsPanel>
  </MetricsOverview>
}
