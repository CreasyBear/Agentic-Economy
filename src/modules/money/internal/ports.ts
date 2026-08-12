import type { ExactAmount, MoneyRefusal } from '../public'

export type CreditPaymentRequest = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  amount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  providerRecoveryDeadlineAt: number
}>

export type CreditPaymentReadRequest = CreditPaymentRequest & Readonly<{
  externalRef: string
}>

export type CreditPaymentEvidence = Readonly<{
  provider: 'stripe'
  externalRef: string
  paymentId?: string
  amount: ExactAmount
  status: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  checkoutStatus?: 'open' | 'complete' | 'expired'
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required'
  requestDigest: string
  metadataDigest: string
  checkoutSessionDigest: string
  paymentIntentDigest?: string
  evidenceDigest: string
  evidenceRef: string
  observedAt: number
}>

export type CreditPaymentSession = Readonly<{
  evidence: CreditPaymentEvidence
  clientSecret: string
}>

export type CreditPaymentPort = Readonly<{
  createOrRecoverCreditPayment: (input: CreditPaymentRequest & Readonly<{ boundExternalRef?: string }>) => Promise<CreditPaymentSession | MoneyRefusal>
  readCreditPayment: (input: CreditPaymentReadRequest) => Promise<CreditPaymentSession | MoneyRefusal>
}>

export type ConnectAccountRequest = Readonly<{
  businessId: string
  currency: string
  idempotencyKey: string
  configuration: 'accounts_v2'
  providerRequestDigest: string
  providerRecoveryDeadlineAt: number
  recoveryLeaseOwner: string
  recoveryLeaseGeneration: number
  boundStripeAccountId?: string
}>

export type OnboardingLinkRequest = Readonly<{
  businessId: string
  currency: string
  stripeAccountId: string
  refreshRef: string
  returnRef: string
  idempotencyKey: string
}>

export type ConnectAccountEvidence = Readonly<{
  provider: 'stripe'
  businessId: string
  currency: string
  stripeAccountId: string
  detailsSubmitted: boolean
  recipientCapabilityActive: boolean
  restricted: boolean
  requirementsDigest: string
  evidenceRef: string
  observedAt: number
  providerObjectDigest: string
  providerObjectVersion?: number
  payloadDigest?: string
  eventId?: string
}>


export type ConnectAccountPort = Readonly<{
  createOrRecoverConnectAccount: (input: ConnectAccountRequest) => Promise<Readonly<{ provider: 'stripe'; stripeAccountId: string; evidenceRef: string }> | MoneyRefusal>
  createOnboardingLink: (input: OnboardingLinkRequest) => Promise<Readonly<{ provider: 'stripe'; url: string; evidenceRef: string }> | MoneyRefusal>
  readConnectAccount: (input: Readonly<{ businessId: string; currency: string; stripeAccountId: string }>) => Promise<ConnectAccountEvidence | MoneyRefusal>
}>
 
export type PayoutTransferRequest = Readonly<{
  payoutRef: string
  commandId: string
  destinationAccountId: string
  amount: ExactAmount
  inputDigest: string
  idempotencyKey: string
}>

export type PayoutTransferEvidence = Readonly<{
  provider: 'stripe'
  transferId: string
  destinationAccountId: string
  amount: ExactAmount
  status: 'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
  requestDigest: string
  evidenceDigest: string
  observedAt: number
}>

export type PayoutTransferNotReleasedEvidence = Readonly<{
  provider: 'stripe'
  resolution: 'not_released'
  destinationAccountId: string
  amount: ExactAmount
  status: 'failed'
  requestDigest: string
  evidenceDigest: string
  observedAt: number
}>

export type PayoutTransferPort = Readonly<{
  createOrRecoverTransfer: (input: PayoutTransferRequest & Readonly<{ boundExternalRef?: string }>) => Promise<PayoutTransferEvidence | MoneyRefusal>
  readTransfer: (input: Readonly<{ externalRef: string; idempotencyKey: string }>) => Promise<PayoutTransferEvidence | MoneyRefusal>
  readTransfersByIdentity: (input: PayoutTransferRequest) => Promise<readonly PayoutTransferEvidence[] | MoneyRefusal>
}>


