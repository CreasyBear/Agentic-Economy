import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import type { AeSupplyEarningsCardProps } from './earnings-card.contracts'

export function AeSupplyEarningsCard({ readback }: AeSupplyEarningsCardProps) {
  if (readback.kind === 'error' || readback.kind === 'conflict') {
    return (
      <Alert variant="destructive" className="arc-market">
        <AlertTitle>Earnings unavailable</AlertTitle>
        <AlertDescription>{readback.kind === 'conflict' ? 'Provider ownership requires resolution before earnings can be shown.' : 'The earnings source could not be read. Try again.'}</AlertDescription>
      </Alert>
    )
  }
  if (readback.kind === 'not_found') {
    return <AeEmptyState compact titleAs="p" title="Set up a Provider profile to view earnings." description="" />
  }
  if (readback.obligations.length === 0 && readback.transfers.length === 0) {
    return <AeEmptyState compact titleAs="p" title="No Provider obligations have been recorded." description="" />
  }
  return (
    <div className="arc-market arc-provider-earnings">
      <p className="arc-provider-earnings-disclaimer">Provider obligations from recorded Calls. Call settlement is not a Stripe transfer or bank payout.</p>
      <ul aria-label="Provider obligations" className="arc-provider-earnings-records">
        {readback.obligations.map((obligation) => (
          <li key={obligation.obligationRef} className="arc-provider-earnings-record">
            <strong>{formatCurrencyAmount({ currency: obligation.currency, units: obligation.amountUnits, exponent: obligation.exponent })}</strong>
            <span>Obligation: {obligation.state}</span>
            <span>Call: {obligation.callRef}</span>
            <span>Obligation reference: {obligation.obligationRef}</span>
            <span>Recorded: {new Date(obligation.createdAt).toLocaleString()}</span>
            {obligation.settlementTransactionRef === undefined ? null : (
              <span>Settlement transaction: {obligation.settlementTransactionRef}</span>
            )}
            {obligation.settledAt === undefined ? null : <span>Settled: {new Date(obligation.settledAt).toLocaleString()}</span>}
            {obligation.reversedAt === undefined ? null : <span>Reversed: {new Date(obligation.reversedAt).toLocaleString()}</span>}
            {obligation.state === 'settled' ? <span>Payout not yet observed</span> : null}
          </li>
        ))}
      </ul>
      {readback.truncated ? <p className="arc-provider-earnings-disclaimer">Showing the latest 100 obligations. Older records are not included.</p> : null}
      {readback.transfers.length === 0 ? null : (
        <section className="arc-provider-payout-records">
          <h3>Recorded payout entries</h3>
          <p className="arc-provider-earnings-disclaimer">These records are separate from managed x402 obligations. A recorded Stripe transfer is not a bank payout.</p>
          <ul aria-label="Recorded payout entries" className="arc-provider-earnings-records">
            {readback.transfers.map((transfer) => {
              const amount = { currency: transfer.currency, units: transfer.amountUnits, exponent: transfer.exponent }
              return (
                <li key={transfer.payoutRef} className="arc-provider-earnings-record">
                  <strong>{transfer.currency === 'AUD' ? formatDisplayAmount(amount) : formatCurrencyAmount(amount)}</strong>
                  {transfer.currency === 'AUD' ? <span>Exact amount: {formatCurrencyAmount(amount)}</span> : null}
                  <span>Record state: {transfer.state}</span>
                  {transfer.transferStatus === undefined ? null : <span>Stripe transfer status: {transfer.transferStatus}</span>}
                  <span>Payout reference: {transfer.payoutRef}</span>
                  {transfer.stripeTransferId === undefined ? null : <span>Stripe transfer: {transfer.stripeTransferId}</span>}
                  {transfer.transferEvidenceDigest === undefined ? null : <span>Transfer evidence: {transfer.transferEvidenceDigest}</span>}
                  {transfer.transferObservedAt === undefined ? null : <span>Observed: {new Date(transfer.transferObservedAt).toLocaleString()}</span>}
                  <span>Payout not yet observed</span>
                </li>
              )
            })}
          </ul>
          {readback.transfersTruncated ? <p className="arc-provider-earnings-disclaimer">Showing 100 transfer records. Other records are not included.</p> : null}
        </section>
      )}
    </div>
  )
}
