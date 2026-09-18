export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export const SHELL = 'min-h-[11rem]'

export type ConnectReturnDiagnostic = Readonly<{
  whatHappened: string
  financialImpact: string
  nextStep: string
}>

export const RESTRICTED_DIAGNOSTIC: ConnectReturnDiagnostic = {
  whatHappened: 'Stripe requires additional verification documents.',
  financialImpact: 'A$0.00 affected — payouts are held until verification completes.',
  nextStep: 'Return to Stripe Express to upload required identity verification documents.',
}

export const TIMEOUT_DIAGNOSTIC: ConnectReturnDiagnostic = {
  whatHappened: 'Verification is taking longer than expected.',
  financialImpact: 'A$0.00 affected — Stripe is still processing in the background.',
  nextStep:
    'You can continue configuring your tools. Payouts will activate as soon as Stripe completes verification.',
}

export const VERIFYING_TITLE = 'Verifying your payout setup with Stripe...'
export const VERIFYING_DESCRIPTION =
  'We are confirming your bank account details and KYC submission with Stripe. This panel updates automatically once verified.'

export const READY_TITLE = 'Payouts enabled. Your tools are now ready to monetize.'
export const READY_DESCRIPTION =
  'Your bank account is connected and ready to receive monthly settlements. You can now publish callable tools to the market.'
