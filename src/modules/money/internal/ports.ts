import type { MoneyRefusal } from '../public'

export type CreditPaymentRequest = Readonly<{
  principalId: string
  accountRef: string
  currency: string
  amountMinor: number
  idempotencyKey: string
  inputDigest: string
  successReturnRef: string
}>
 
 
export type CreditPaymentEvidence = Readonly<{
  provider: 'stripe'
  externalRef: string
  checkoutUrl?: string
  currency: string
  amountMinor: number
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

export type ProviderTransferRequest = Readonly<{
  payoutRef: string
  businessId: string
  stripeAccountId: string
  currency: string
  amountMinor: number
  idempotencyKey: string
}>

export type ProviderTransferEvidence = Readonly<{
  provider: 'stripe'
  externalRef: string
  payoutRef: string
  currency: string
  amountMinor: number
  status: 'pending' | 'paid' | 'failed' | 'outcome_unknown'
  evidenceRef: string
}>

export type ProviderTransferPort = Readonly<{
  createProviderTransfer: (input: ProviderTransferRequest) => Promise<ProviderTransferEvidence | MoneyRefusal>
  readProviderTransfer: (input: Readonly<{ externalRef?: string; idempotencyKey: string }>) => Promise<ProviderTransferEvidence | MoneyRefusal>
}>

export type MoneyProviderPorts = CreditPaymentPort & ConnectAccountPort & ProviderTransferPort
