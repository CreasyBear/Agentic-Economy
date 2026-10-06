import type { ChatOwnerApprovalsProps } from '../chat-session.contracts'
import { ChatApprovalCards } from './ChatApprovalCards'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function ChatOwnerApprovals({ cards, problem, onApprove, onDeny, onFreshQuote }: ChatOwnerApprovalsProps) {
  return <>
    {cards.some(card => card.kind === 'pending') ? (
      <a href="#owner-chat-pending" className={`arc-market arc-chat ${actionLinkClassName('ghost', 'sm')}`}>
        Review pending Call
      </a>
    ) : null}
    <ChatApprovalCards cards={cards} problem={problem}
      onApprove={onApprove} onDeny={onDeny} onFreshQuote={onFreshQuote} />
  </>
}
