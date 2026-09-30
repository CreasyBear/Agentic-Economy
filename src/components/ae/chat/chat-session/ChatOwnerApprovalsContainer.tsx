import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import type { ChatOwnerApprovalsContainerProps } from './chat-session.contracts'
import { projectOwnerChatCards } from './owner-chat-cards'
import { ChatOwnerApprovals } from './components/ChatOwnerApprovals'
import { RecoveryNotice } from '../recovery/RecoveryNotice'

export function ChatOwnerApprovalsContainer({ threadId, now, onFreshQuote }: ChatOwnerApprovalsContainerProps) {
  const serverCards = useQuery(api.chatCall.readOwnerChatCards, { threadId })
  const decideApproval = useMutation(api.capabilityCalls.decideCallApproval)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(false)
  const [problemCallRef, setProblemCallRef] = useState<string | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const cards = projectOwnerChatCards(serverCards, now, busy)

  async function decide(callRef: string, decision: 'approve' | 'deny'): Promise<void> {
    if (busy) return
    setBusy(true)
    setProblem(false)
    setProblemCallRef(null)
    setNeedsVerification(false)
    try {
      const result = await decideApproval({ callRef, decision })
      if (result.kind === 'refused') {
        setProblem(true)
        setNeedsVerification(result.code === 'mfa_reverification_required')
        setProblemCallRef(callRef)
        return
      }
      if (decision === 'deny') document.getElementById('tool-chat-prompt')?.focus()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setProblem(true)
      setProblemCallRef(callRef)
      setNeedsVerification(false)
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

  return <>
    <ChatOwnerApprovals cards={cards} problem=""
      onApprove={(callRef) => { void decide(callRef, 'approve') }}
      onDeny={(callRef) => { void decide(callRef, 'deny') }}
      onFreshQuote={freshQuote} />
    {problem ? (
      <RecoveryNotice reason={needsVerification ? 'approval_verification_required' : 'approval_failed'}
        {...(problemCallRef === null ? {} : { callRefs: [problemCallRef] })} />
    ) : null}
  </>
}
