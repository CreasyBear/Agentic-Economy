import { useId } from 'react'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, formatDisplayAmount } from '@/modules/money/public'
import type { QuoteConfirmationView } from './object-family.contracts'
import { AlphaLearningNotice } from './AlphaLearningNotice'
import { approvalEffectsLabel, approvalDataUseLabel } from './approval-disclosures'

export type QuoteConfirmationProps = Readonly<{
  view: QuoteConfirmationView
  onApprove: (callRef: string) => void
  onDeny: (callRef: string) => void
  onFreshQuote: () => void
}>

export function QuoteConfirmation({ view, onApprove, onDeny, onFreshQuote }: QuoteConfirmationProps) {
  const priceUnavailable = view.quoteAmount.currency !== 'AUD' || view.remainingCap.amount.currency !== 'AUD'
  const headingId = useId()
  const context = view.decisionContext
  const accepted = context?.acceptedQuote.kind === 'available' && context.acceptedQuote.quoteRef === view.quoteRef
    ? context.acceptedQuote : undefined
  const decisionUnavailable = accepted === undefined
    || accepted.maximumSpend.currency !== view.quoteAmount.currency
    || accepted.maximumSpend.exponent !== view.quoteAmount.exponent
    || accepted.maximumSpend.units !== view.quoteAmount.units
  return (
    <DecisionPanel role="region" data-call-ref={view.callRef} aria-labelledby={headingId}>
      <header className="arc-decision-header">
        <h2 id={headingId} tabIndex={-1} className="arc-decision-heading">Confirm this Call</h2>
        <span className="arc-decision-status" data-tone={view.expired || priceUnavailable || decisionUnavailable ? 'warning' : 'neutral'}>
          {view.expired ? 'Quote expired' : priceUnavailable ? 'AUD Quote unavailable' : decisionUnavailable ? 'Decision facts unavailable' : 'Approval required'}
        </span>
      </header>
      <div className="arc-decision-body">
        <AeFactList className="arc-decision-facts" facts={[
          { label: 'Tool', value: accepted?.tool.name ?? view.toolName },
          ...(context === undefined ? [] : [{ label: 'Agent', value: context.agent.currentDisplayName === null ? `${context.agent.principalRef} (current name unavailable)` : `${context.agent.currentDisplayName} (current Account label)` }]),
          { label: view.provider.kind === 'verified' ? 'Verified Provider' : 'Directory Host', value: view.provider.href
            ? <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" href={view.provider.href}>{view.provider.name}</a>
            : view.provider.name },
          { label: 'Quote', value: <span className="font-mono tabular-nums">{view.quoteAmount.units === '0' ? 'Free · ' : ''}{formatDisplayAmount(view.quoteAmount)} per Call</span> },
          { label: 'Expires', value: <time dateTime={new Date(view.expiresAt).toISOString()}>{formatTimestamp(view.expiresAt, 'UTC')} UTC</time> },
          { label: 'Remaining cap after Call', value: <span className="font-mono tabular-nums">{formatDisplayAmount(view.remainingCap.amount)} · {view.remainingCap.window}</span> },
          { label: 'Input', value: view.inputSummary },
          ...(accepted === undefined ? [] : [
            { label: 'Declared effects', value: approvalEffectsLabel(accepted.effects) },
            { label: 'Declared data release', value: approvalDataUseLabel(accepted.dataUse) },
          ]),
          { label: 'Call reference', value: <span className="break-all font-mono text-xs">{view.callRef}</span> },
          { label: 'Quote reference', value: <span className="break-all font-mono text-xs">{view.quoteRef}</span> },
          ...(view.quoteAmount.currency === 'AUD' ? [] : [{ label: 'Source amount', value: formatCurrencyAmount(view.quoteAmount) }]),
        ]} />
        {decisionUnavailable ? <p role="alert" className="text-sm text-muted-foreground">The accepted Quote’s Tool, price, effects and data release could not be confirmed. Approval stays unavailable. Request fresh decision details or decline this Call.</p> : null}
        {accepted === undefined ? null : <details className="text-sm">
          <summary>Accepted Quote details</summary>
          <AeFactList facts={[
            { label: 'Contribution', value: accepted.tool.description },
            { label: 'Purpose', value: 'Not recorded for this Call' },
            { label: 'Recorded Provider', value: accepted.provider.name ?? `${accepted.provider.ref} (name not recorded)` },
            { label: 'Seller and full commercial terms', value: 'Not established by this Quote record.' },
            ...(context === undefined ? [] : [
              { label: 'Agent reference', value: context.agent.principalRef },
              { label: 'Application', value: context.agent.applicationRef },
            ]),
            ...(view.acceptedIdentity === undefined ? [] : [
              { label: 'Account', value: view.acceptedIdentity.accountRef },
              { label: 'Tool reference', value: view.acceptedIdentity.toolRef },
              { label: 'Tool version', value: String(view.acceptedIdentity.toolVersion) },
              { label: 'Spending policy', value: `${view.acceptedIdentity.grantRef} · generation ${view.acceptedIdentity.grantGeneration}` },
              { label: 'Policy digest', value: view.acceptedIdentity.policyDigest },
            ]),
          ]} />
          <p>Getting a fresh Quote prepares a chat request for review. It does not submit, approve or repeat this Call.</p>
        </details>}
        <AlphaLearningNotice />
      </div>
      <div className="arc-decision-actions">
        {view.expired || priceUnavailable || decisionUnavailable ? (
          <AeActionLink type="button" labelLayout="wrap" disabled={view.pending} onAction={onFreshQuote}>Get a fresh Quote</AeActionLink>
        ) : (
          <AeActionLink type="button" labelLayout="wrap" disabled={view.pending || decisionUnavailable} onAction={() => onApprove(view.callRef)}>Approve this Call</AeActionLink>
        )}
        <AeActionLink type="button" variant="secondary" labelLayout="wrap" disabled={view.pending} onAction={() => onDeny(view.callRef)}>Not now</AeActionLink>
      </div>
    </DecisionPanel>
  )
}
