export type OwnerProviderEarningsObligation = Readonly<{
  obligationRef: string
  callRef: string
  toolRef: string
  currency: 'USDC'
  exponent: 6
  amountUnits: string
  state: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed'
  settlementTransactionRef?: string
  createdAt: number
  settledAt?: number
  reversedAt?: number
}>
export type OwnerProviderRecordedTransfer = Readonly<{
  payoutRef: string
  currency: string
  exponent: number
  amountUnits: string
  state: 'review' | 'held_kyc' | 'held_threshold' | 'transfer_pending' | 'paid' | 'reversed' | 'failed' | 'outcome_unknown'
  transferStatus?: 'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
  stripeTransferId?: string
  transferEvidenceDigest?: string
  transferObservedAt?: number
  createdAt: number
}>


export type OwnerProviderEarningsReadback = Readonly<
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
  | { kind: 'not_found' }
  | { kind: 'conflict'; code: 'multiple_businesses' | 'payout_owner_mismatch' }
  | {
      kind: 'available'
      businessId: string
      obligations: readonly OwnerProviderEarningsObligation[]
      transfers: readonly OwnerProviderRecordedTransfer[]
      transfersTruncated: boolean
      truncated: boolean
    }
>
