export const callRecoveryPanelCopy = {
  uncertainCharge: 'Charge not yet confirmed. We are reconciling this Call. Do not assume a charge or refund.',
  settledZeroCharge: (amount: string) => `${amount} charged. This receipt is unchanged until evidence is accepted.`,
} as const
