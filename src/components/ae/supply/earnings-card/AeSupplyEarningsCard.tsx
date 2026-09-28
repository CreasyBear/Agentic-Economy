import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { AeSupplyEarningsCardProps } from './earnings-card.contracts'

export function AeSupplyEarningsCard({ readback }: AeSupplyEarningsCardProps) {
  if (readback.kind === 'error' || readback.kind === 'conflict') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Earnings unavailable</AlertTitle>
        <AlertDescription>{readback.kind === 'conflict' ? 'Provider ownership requires resolution before earnings can be shown.' : 'The earnings source could not be read. Try again.'}</AlertDescription>
      </Alert>
    )
  }
  if (readback.kind === 'not_found') {
    return <p className="text-sm text-muted-foreground">Set up a Provider profile to view earnings.</p>
  }
  if (readback.obligations.length === 0 && readback.transfers.length === 0) {
    return <p className="text-sm text-muted-foreground">No Provider obligations have been recorded.</p>
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Provider obligations from recorded Calls. Call settlement is not a Stripe transfer or bank payout.</p>
      <ul className="grid gap-3">
        {readback.obligations.map((obligation) => (
          <li key={obligation.obligationRef} className="grid gap-1 rounded-card border border-border p-4 text-sm">
            <strong>{formatCurrencyAmount({ currency: obligation.currency, units: obligation.amountUnits, exponent: obligation.exponent })}</strong>
            <span>Obligation: {obligation.state}</span>
            <span className="break-all">Call: {obligation.callRef}</span>
            <span className="break-all">Obligation reference: {obligation.obligationRef}</span>
            <span>Recorded: {new Date(obligation.createdAt).toLocaleString()}</span>
            {obligation.settlementTransactionRef === undefined ? null : (
              <span className="break-all">Settlement transaction: {obligation.settlementTransactionRef}</span>
            )}
            {obligation.settledAt === undefined ? null : <span>Settled: {new Date(obligation.settledAt).toLocaleString()}</span>}
            {obligation.reversedAt === undefined ? null : <span>Reversed: {new Date(obligation.reversedAt).toLocaleString()}</span>}
            {obligation.state === 'settled' ? <span>Payout not yet observed</span> : null}
          </li>
        ))}
      </ul>
      {readback.truncated ? <p className="text-sm text-muted-foreground">Showing the latest 100 obligations. Older records are not included.</p> : null}
      {readback.transfers.length === 0 ? null : (
        <section className="grid gap-3">
          <h3 className="font-medium">Recorded payout entries</h3>
          <p className="text-sm text-muted-foreground">These records are separate from managed x402 obligations. A recorded Stripe transfer is not a bank payout.</p>
          <ul className="grid gap-3">
            {readback.transfers.map((transfer) => (
              <li key={transfer.payoutRef} className="grid gap-1 rounded-card border border-border p-4 text-sm">
                <strong>{formatCurrencyAmount({ currency: transfer.currency, units: transfer.amountUnits, exponent: transfer.exponent })}</strong>
                <span>Record state: {transfer.state}</span>
                {transfer.transferStatus === undefined ? null : <span>Stripe transfer status: {transfer.transferStatus}</span>}
                <span className="break-all">Payout reference: {transfer.payoutRef}</span>
                {transfer.stripeTransferId === undefined ? null : <span className="break-all">Stripe transfer: {transfer.stripeTransferId}</span>}
                {transfer.transferEvidenceDigest === undefined ? null : <span className="break-all">Transfer evidence: {transfer.transferEvidenceDigest}</span>}
                {transfer.transferObservedAt === undefined ? null : <span>Observed: {new Date(transfer.transferObservedAt).toLocaleString()}</span>}
                <span>Payout not yet observed</span>
              </li>
            ))}
          </ul>
          {readback.transfersTruncated ? <p className="text-sm text-muted-foreground">Showing 100 transfer records. Other records are not included.</p> : null}
        </section>
      )}
    </div>
  )
}
