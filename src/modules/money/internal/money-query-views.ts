import type { ExactAmount } from './exact-amount'
import type { PayoutAccountState, PayoutState } from './money-types'

export type PayoutStatusView = Readonly<{
  businessId: string
  accountState: PayoutAccountState | 'missing'
  accountVersion?: number
  payoutState?: PayoutState
  payoutRef?: string
  payoutRevision?: number
  payoutCommandId?: string
  idempotencyKey?: string
  providerNet: ExactAmount
  minimumPayout: ExactAmount
  stripeTransferId?: string
  destinationAccountId?: string
  transferStatus?:
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'reversed'
    | 'outcome_unknown'
  providerRecoveryDeadlineAt?: number
  recoveryState?: 'provider_id' | 'idempotency_key' | 'admin_intervention'
  requestDigest?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
  evidence: 'source' | 'labelled_local_dev'
}>

export type ProviderEarningsView = Readonly<{
  businessId: string
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
  paidOut: ExactAmount
  held: ExactAmount
  recoveryDue: ExactAmount
  /** True when the source capped its ledger scan at the latest 100 entries. */
  truncated: boolean
  evidence: 'source' | 'labelled_local_dev'
}>
