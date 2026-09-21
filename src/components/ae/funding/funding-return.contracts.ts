export const fundingReturnCopy = {
  cancelled: {
    title: 'Payment cancelled',
    description: 'No payment was made or Credit added.',
    retryAction: 'Try again',
  },
  invalid: {
    title: 'Invalid funding link',
    description: 'This funding link is invalid or no longer available. Open Credit to start again.',
  },
  paid: {
    title: 'Credit added',
    description: (amount: string, agentName: string) =>
      `Paid. ${amount} is now available as Credit. Return to ${agentName} and ask it to retry the original Tool.`,
  },
  openAgentsAction: 'Open Agents',
  openCreditAction: 'Open Credit',
} as const
