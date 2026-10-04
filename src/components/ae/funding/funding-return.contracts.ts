import type { ReactNode } from 'react'

import type { AeUiStateTone } from '@/lib/ui/ui-state'

export type FundingReturnPageState = Readonly<{
  tone: AeUiStateTone
  title: string
  description: string
  action?: ReactNode
  focusTitle?: boolean
}>

export const fundingReturnCopy = {
  cancelled: {
    title: 'Check your payment',
    description: 'This page cannot confirm whether payment completed. Open Credit to check the original attempt before starting another payment.',
    openCreditAction: 'Open Credit',
  },
  invalid: {
    title: 'Invalid funding link',
    description: 'This funding link is invalid or no longer available. Open Credit if you own the Account.',
  },
  paid: {
    title: 'Credit added',
    description: (amount: string, agentName: string) =>
      `Paid. ${amount} is now available as Credit. Return to ${agentName} in the original task. Credit does not grant spending authority or complete a Tool purchase.`,
    instruction: (fundingSessionId: string) => [
      `Continue our original Agentic Economy task. Refresh the server’s Tool list and check funding.handoff.status for fundingSessionId ${JSON.stringify(fundingSessionId)}.`,
      'Keep the original Tool and input. If a Call already exists, check that same Call and follow its recorded recovery actions. If delivered, return its actual result and receipt. An uncertain result is not permission to create another purchase.',
      'If no Call exists and Credit is confirmed, get a fresh Quote for the intended Tool and input. Check current authority and any required approval. Make one authorized Call with a stable idempotency key, then return its actual result and receipt.',
      'Funding is not purchase authority. Do not start another payment for this session.',
    ].join('\n\n'),
  },
  openAgentsAction: 'Open Agents',
  openCreditAction: 'Open Credit',
} as const
