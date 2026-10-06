import { useEffect, useRef } from 'react'

import { CallOutcome } from '@/components/ae/shared/CallOutcome'
import { QuoteConfirmation } from '@/components/ae/shared/QuoteConfirmation'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import type { OwnerChatCard } from '../chat-session.contracts'

export type ChatApprovalCardsProps = Readonly<{
  cards: readonly OwnerChatCard[]
  problem?: string
  onApprove: (callRef: string) => void
  onDeny: (callRef: string) => void
  onFreshQuote: (callRef: string) => void
}>

function cardKey(card: OwnerChatCard): string {
  return card.kind === 'pending'
    ? `pending:${card.view.callRef}:${card.view.expired ? 'expired' : 'current'}`
    : `${card.kind}:${card.kind === 'result' ? card.view.callRef : card.callRef}`
}

export function ChatApprovalCards({ cards, problem, onApprove, onDeny, onFreshQuote }: ChatApprovalCardsProps) {
  const previous = useRef(new Set<string>())
  useEffect(() => {
    const next = new Set(cards.map(cardKey))
    const added = cards.find(card => !previous.current.has(cardKey(card)))
    previous.current = next
    if (added === undefined) return
    const callRef = added.kind === 'unavailable' ? added.callRef : added.view.callRef
    const selector = added.kind === 'pending' ? '[data-call-ref]' : '[data-outcome-ref]'
    const target = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(element => element.dataset[added.kind === 'pending' ? 'callRef' : 'outcomeRef'] === callRef)
    target?.querySelector<HTMLElement>(added.kind === 'pending' && added.view.expired ? 'button' : 'h2')?.focus()
  }, [cards])
  if (cards.length === 0) return null
  return (
    <section id="owner-chat-pending" tabIndex={-1} aria-label="Call confirmations and results" className="ae-chat-approvals grid min-w-0 gap-section" aria-live="polite">
      {problem ? <p role="alert" className="text-destructive">{problem}</p> : null}
      {cards.map(card => {
        const callRef = card.kind === 'unavailable' ? card.callRef : card.view.callRef
        if (card.kind === 'pending') return (
          <QuoteConfirmation key={callRef} view={card.view}
            onApprove={onApprove} onDeny={onDeny}
            onFreshQuote={() => onFreshQuote(callRef)} />
        )
        if (card.kind === 'result') return (
          <div key={callRef} data-outcome-ref={callRef}>
            <CallOutcome view={card.view} />
          </div>
        )
        return (
          <DecisionPanel key={callRef} data-outcome-ref={callRef}>
            <header className="arc-decision-header"><h2 tabIndex={-1} className="arc-decision-heading">Approval unavailable</h2></header>
            <div className="arc-decision-body">
              <p>{card.toolName} · {card.quoteLabel}</p>
              <p className="break-all text-sm">Input: {card.inputSummary}</p>
              <p role="alert" className="text-destructive">{card.reason}</p>
              <p className="break-all font-mono text-xs">Call reference: {callRef}</p>
            </div>
            <div className="arc-decision-actions"><AeActionLink type="button" variant="secondary" labelLayout="wrap" onAction={() => onFreshQuote(callRef)}>Get a fresh Quote</AeActionLink></div>
          </DecisionPanel>
        )
      })}
    </section>
  )
}
