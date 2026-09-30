import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  if (check.kind === 'matched') return <p className="text-sm"><Badge variant="success">{label === 'Cash' ? 'Cash reconciled' : `${label} matched`}</Badge> <span className="text-muted-foreground">{formatCount(check.checkedCount)} checked</span></p>
  return <p className="text-sm"><Badge variant={check.kind === 'mismatch' ? 'destructive' : 'warning'}>{label} needs review</Badge> <span className="text-muted-foreground">{check.kind === 'attention' ? `${formatCount(check.pendingCount)} pending` : `${formatCount(check.checkedCount)} checked`}</span></p>
}
export function TreasuryMetrics({ view }: { view: AdminTreasuryView }) {
  const snapshot = view.snapshot
  const ledger = snapshot?.ledger
  const chain = snapshot?.chain
  const inflight = snapshot?.inFlight
  const spending = snapshot?.spending
  const ratios = treasuryRatios(snapshot)
  const percentage = spending?.kind === 'available' && new Decimal(spending.maximumUnits).gt(0)
    ? Decimal.min(new Decimal(sumTreasuryUnits(spending.settledUnits, spending.liabilityUnits)).div(spending.maximumUnits).mul(100), 100).toNumber() : null
  return <>
    <AeSection title="Float" description="Company USDC working capital. Customer credit is held in AUD.">
      <div className="grid gap-related rounded-card border border-border bg-card p-related">
        {view.observation === null ? unavailable('Wallet observation') : <>
          <p className="text-2xl font-semibold tabular-nums">{treasuryMoney(view.observation.totalUnits)}</p>
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
          {snapshot.deposits.length === 0 && !snapshot.depositsComplete ? unavailable('Booked refills') : snapshot.deposits.length === 0 ? <p className="text-sm text-muted-foreground">No booked refills in this report.</p> : <ul className="grid gap-related text-sm">
            {snapshot.deposits.map(deposit => <li key={deposit.transactionRef} className="grid gap-intra sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-related">
              <span className="font-medium tabular-nums">{deposit.chainTransactionHash === null ? 'Opening balance · ' : ''}{treasuryMoney(deposit.amountUnits)}</span>
              <time className="text-muted-foreground" dateTime={new Date(deposit.bookedAt).toISOString()}>{formatTimestamp(deposit.bookedAt)}</time>
              {deposit.chainTransactionHash !== null && /^0x[0-9a-fA-F]{64}$/.test(deposit.chainTransactionHash) ? <a
                className="underline underline-offset-4" target="_blank" rel="noopener noreferrer"
                href={`https://${view.environment === 'production' ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${deposit.chainTransactionHash}`}
              >View transfer<span className="sr-only"> on {view.environment === 'production' ? 'Base' : 'Base Sepolia'} (opens a new tab)</span></a> : null}
            </li>)}
          </ul>}
          {!snapshot.depositsComplete ? <p className="text-xs text-muted-foreground">Additional booked entries are not shown here.</p> : null}
        </div>}
      </div>
    </AeSection>
    <AeSection title="Runway" description="Available USDC divided by the average daily provider payments over the last seven days. Committed funds and the buffer are excluded.">
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
    </AeSection>
    <AeSection title="Coverage" description="Available USDC against all purchased and promotional AUD credit, including credit reserved for Calls. Committed USDC and the protected buffer are excluded from available funds.">
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
    </AeSection>
    <AeSection title="In flight" description="Unresolved Calls and spend exposure remain visible while payments are paused.">
      {inflight?.kind !== 'available' ? unavailable('Reconciliation queue') : <>
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Calls requiring reconciliation', value: `${formatCount(inflight.count)} · ${treasuryMoney(inflight.amountUnits)}` },
          { label: 'Oldest unresolved Call', value: inflight.oldestAt === null ? 'None' : formatRelativeTime(inflight.oldestAt) },
          { label: 'Overdue reservations', value: `${formatCount(inflight.overdueCount)} · ${treasuryMoney(inflight.overdueUnits)}` },
        ]} />
        {inflight.calls.length > 0 ? <ul className="grid gap-intra text-sm">
          {inflight.calls.map(call => <li key={call.callRef} className="flex flex-wrap items-center justify-between gap-intra">
            <a className="break-all underline underline-offset-4" href={`/admin/calls/${encodeURIComponent(call.callRef)}`}>{call.callRef}</a>
            <span className="tabular-nums">{treasuryMoney(call.amountUnits)} · {formatRelativeTime(call.createdAt)}</span>
          </li>)}
        </ul> : null}
        {!inflight.listedCallsComplete ? <a href="/admin/exceptions?kind=uncertain_call&partition=reconciliation_required" className="text-sm underline underline-offset-4">More Calls remain. Open the reconciliation queue.</a> : null}
      </>}
      {spending?.kind !== 'available' ? unavailable('Rolling spend exposure') : <div className="grid gap-intra">
        <AeFactList density="compact" className="grid-cols-1 sm:grid-cols-3" facts={[
          { label: 'Settled · rolling 24 hours', value: treasuryMoney(spending.settledUnits) },
          { label: 'Unresolved signing liability', value: treasuryMoney(spending.liabilityUnits) },
          { label: 'Exposure / rolling limit', value: `${treasuryMoney(sumTreasuryUnits(spending.settledUnits, spending.liabilityUnits))} / ${treasuryMoney(spending.maximumUnits)}` },
        ]} />
        {percentage === null ? null : <Progress value={percentage} aria-label="Rolling spend exposure against limit" />}
        <SourceTime label="Rolling window starts" at={spending.windowStartsAt} />
      </div>}
      <div className="grid gap-intra sm:grid-cols-2"><Check label="Provider payments" check={snapshot?.checks.settlements} /><Check label="Reservations" check={snapshot?.checks.reservations} /></div>
    </AeSection>
  </>
}
