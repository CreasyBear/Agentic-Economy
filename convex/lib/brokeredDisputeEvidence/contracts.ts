import type { ExactAmount } from '@/modules/money/public'
import type { Doc } from '../../_generated/dataModel'

export type ExternalPayoutIdentity = Readonly<{
  payoutRef: string
  payoutKey: string
  payoutSource: string
  payoutEvidence: string
}>

export type BrokeredDisputeIdentity = Readonly<{
  lossTransactionRef: string
  lossInputDigest: string
}>

export type ExternalPayoutEvidenceInput = Readonly<{
  identity: ExternalPayoutIdentity
  externalRef: string
  businessId: string
  providerAccountRef: string
  providerVersion: number
  providerAmount: ExactAmount
  settledAt: number
  payoutCount: number
  payoutIdempotencyRows: readonly Doc<'moneyTransactions'>[]
  payoutRows: readonly Doc<'moneyTransactions'>[]
  payoutEntries: readonly Doc<'moneyLedgerEntries'>[]
}>

export type BrokeredDisputeReplayInput = Readonly<{
  originalTransactionRef: string
  originalPrincipalId: string
  originalCurrency: string
  originalExponent: number
  originalState: string
  originalBudgetState: string | undefined
  businessId: string
  disputeRef: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  refundTransactionRef: string
  refundInputDigest: string
  lossTransactionRef: string
  lossInputDigest: string
  operatorAccountRef: string
  rakeAccountRef: string
  lossAccountRef: string
  operatorAmount: ExactAmount
  rakeAmount: ExactAmount
  providerAmount: ExactAmount
  invocationRef: string
  attemptRef: string
  observedAt: number
  originalUpdatedAt: number
  operatorVersion: number
  lossAccountVersion: number
  prior: Doc<'moneyTransactions'>
  reversalRows: readonly Doc<'moneyTransactions'>[]
  refundRows: readonly Doc<'moneyLedgerEntries'>[]
  lossRows: readonly Doc<'moneyTransactions'>[]
  lossEntries: readonly Doc<'moneyLedgerEntries'>[]
}>
