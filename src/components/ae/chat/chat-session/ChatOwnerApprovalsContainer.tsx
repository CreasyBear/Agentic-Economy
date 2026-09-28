import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { ChatOwnerApprovalsContainerProps } from './chat-session.contracts'
import { projectOwnerChatCards } from './owner-chat-cards'
import { ChatOwnerApprovals } from './components/ChatOwnerApprovals'

export function ChatOwnerApprovalsContainer({ threadId, now, onFreshQuote }: ChatOwnerApprovalsContainerProps) {
  const serverCards = useQuery(api.chatCall.readOwnerChatCards, { threadId })
  const decideApproval = useMutation(api.capabilityCalls.decideCallApproval)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const cards = projectOwnerChatCards(serverCards, now, busy)

  async function decide(callRef: string, decision: 'approve' | 'deny'): Promise<void> {
    if (busy) return
    setBusy(true)
    setProblem('')
    try {
      const result = await decideApproval({ callRef, decision })
      if (result.kind === 'refused') {
        setProblem(result.code === 'mfa_reverification_required'
          ? 'Verify it is you in Account security, then approve this Call again.'
          : `Call decision refused: ${result.code}. Request a fresh Quote or check Call status.`)
        return
      }
      if (decision === 'deny') document.getElementById('tool-chat-prompt')?.focus()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setProblem('Could not decide this Call. Check its status before trying again.')
    } finally {
      setBusy(false)
    }
  }

  function freshQuote(callRef: string): void {
    const card = cards.find(value => value.kind === 'pending'
      ? value.view.callRef === callRef : value.kind === 'unavailable' && value.callRef === callRef)
    if (card?.kind !== 'pending' && card?.kind !== 'unavailable') return
    onFreshQuote(card.kind === 'pending' ? card.view.toolName : card.toolName,
      card.kind === 'pending' ? card.view.inputSummary : card.inputSummary)
  }

  return <ChatOwnerApprovals cards={cards} problem={problem}
    onApprove={(callRef) => { void decide(callRef, 'approve') }}
    onDeny={(callRef) => { void decide(callRef, 'deny') }}
    onFreshQuote={freshQuote} />
}
