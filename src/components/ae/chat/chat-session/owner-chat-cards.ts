import type { OwnerChatServerCard } from '../../../../../convex/chatCall'
import { formatDisplayAmount } from '@/modules/money/public'
import type { OwnerChatCard } from './chat-session.contracts'

export function projectOwnerChatCards(
  serverCards: readonly OwnerChatServerCard[] | undefined,
  now: number,
  approvalBusy: boolean,
): OwnerChatCard[] {
  return (serverCards ?? []).map((card): OwnerChatCard => {
    if (card.kind === 'result') return { kind: 'result', turnRef: card.turnRef, view: {
      callRef: card.callRef, label: card.status, detail: card.detail,
      purchaseKind: card.purchaseKind, payment: card.payment, delivery: card.delivery,
      ...(card.receiptHref === undefined ? {} : { receiptHref: card.receiptHref }),
    } }
    if (card.remainingCap === undefined) return {
      kind: 'unavailable', turnRef: card.turnRef, callRef: card.callRef,
      toolName: card.toolName, inputSummary: card.inputSummary,
      quoteLabel: `${formatDisplayAmount(card.quoteAmount)} per Call`,
      reason: card.blockedReason ?? 'Remaining spend cap is unavailable.',
    }
    return { kind: 'pending', turnRef: card.turnRef, view: {
      toolName: card.toolName,
      provider: card.provider.kind === 'verified' && card.provider.href !== undefined
        ? { kind: 'verified', name: card.provider.name, href: card.provider.href }
        : { kind: 'host', name: card.provider.name,
            ...(card.provider.href === undefined ? {} : { href: card.provider.href }) },
      callRef: card.callRef,
      quoteRef: card.quoteRef, quoteAmount: card.quoteAmount, expiresAt: card.expiresAt,
      inputSummary: card.inputSummary, remainingCap: card.remainingCap,
      expired: now >= card.expiresAt, pending: approvalBusy,
    } }
  }).reverse()
}
