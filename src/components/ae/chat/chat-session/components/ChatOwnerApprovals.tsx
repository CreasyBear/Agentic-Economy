import type { ChatOwnerApprovalsProps } from '../chat-session.contracts'
import { ChatApprovalCards } from './ChatApprovalCards'

export function ChatOwnerApprovals({ cards, problem, onApprove, onDeny, onFreshQuote }: ChatOwnerApprovalsProps) {
  return <>
    {cards.some(card => card.kind === 'pending') ? (
      <a href="#owner-chat-pending" className="w-fit text-sm underline underline-offset-4 focus-visible:outline-2">
        Review pending Call
      </a>
    ) : null}
    <ChatApprovalCards cards={cards} problem={problem}
      onApprove={onApprove} onDeny={onDeny} onFreshQuote={onFreshQuote} />
  </>
}
