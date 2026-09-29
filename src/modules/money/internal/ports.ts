import type { ExactAmount } from './exact-amount'
import type { MoneyRefusal } from './money-types'

export type CreditPaymentRequest = Readonly<{
  commandRef: string
  principalId: string
  accountRef: string
  amount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
  providerRecoveryDeadlineAt: number
  principalAmount?: ExactAmount
  serviceFeeAmount?: ExactAmount
  taxAmount?: ExactAmount
  cancelReturnRef?: string
  checkoutExpiresAt?: number
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
  checkoutMode?: 'hosted_page'
  checkoutExpiresAt?: number
  requestDigest: string
  metadataDigest: string
  checkoutSessionDigest: string
  paymentIntentDigest?: string
  evidenceDigest: string
  evidenceRef: string
  observedAt: number
}>

export type CreditPaymentSession = Readonly<{
  kind: 'hosted_redirect'
  evidence: CreditPaymentEvidence
  expiresAt: number
  checkoutUrl?: string
}>

export type CreditPaymentPort = Readonly<{
  createOrRecoverCreditPayment: (input: CreditPaymentRequest & Readonly<{ boundExternalRef?: string }>) => Promise<CreditPaymentSession | MoneyRefusal>
  readCreditPayment: (input: CreditPaymentReadRequest) => Promise<CreditPaymentSession | MoneyRefusal>
}>

