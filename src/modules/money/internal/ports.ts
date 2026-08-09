import type { ExactAmount, MoneyRefusal } from '../public'

export type CreditPaymentRequest = Readonly<{
  principalId: string
  accountRef: string
  amount: ExactAmount
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
}>
 
 
export type CreditPaymentEvidence = Readonly<{
  provider: 'stripe'
  externalRef: string
  checkoutUrl?: string
  amount: ExactAmount
  status: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  evidenceRef: string
}>

export type CreditPaymentPort = Readonly<{
  createCreditPayment: (input: CreditPaymentRequest) => Promise<CreditPaymentEvidence | MoneyRefusal>
  readCreditPayment: (input: Readonly<{ externalRef: string; idempotencyKey: string }>) => Promise<CreditPaymentEvidence | MoneyRefusal>
}>

export type ConnectAccountRequest = Readonly<{
  businessId: string
  currency: string
  idempotencyKey: string
  configuration: 'accounts_v2'
}>

export type OnboardingLinkRequest = Readonly<{
  businessId: string
  stripeAccountId: string
  refreshRef: string
  returnRef: string
  idempotencyKey: string
}>

export type ConnectAccountPort = Readonly<{
  createConnectAccount: (input: ConnectAccountRequest) => Promise<Readonly<{ provider: 'stripe'; stripeAccountId: string; evidenceRef: string }> | MoneyRefusal>
  createOnboardingLink: (input: OnboardingLinkRequest) => Promise<Readonly<{ provider: 'stripe'; url: string; evidenceRef: string }> | MoneyRefusal>
}>

