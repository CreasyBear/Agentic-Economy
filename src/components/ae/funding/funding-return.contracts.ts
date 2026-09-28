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
      `Paid. ${amount} is now available as Credit. Return to ${agentName} and ask it to retry the original Tool.`,
  },
  openAgentsAction: 'Open Agents',
  openCreditAction: 'Open Credit',
} as const
