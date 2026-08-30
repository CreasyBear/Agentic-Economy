import type { Doc } from '../../_generated/dataModel'
import type { ExactAmount } from '../../../src/modules/money/public'

export const DAILY_PAYOUT_ALLOCATION_READ_LIMIT = 1_000
export const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u

export type CanonicalPayoutAuthority = Readonly<{
  owningAccountRef: string
  authorityPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
}>
export type CanonicalQualifiedUseAuthority = CanonicalPayoutAuthority &
  Readonly<{ authorityResourceRef: string }>
export type CanonicalPayoutSettlementAuthority = CanonicalPayoutAuthority &
  Readonly<{ authorityResourceRefs: readonly string[] }>
export type PinnedAuthorityFields = Readonly<{
  owningAccountRef?: string
  authorityPrincipalRef?: string
  authorityGrantRef?: string
  authorityGrantGeneration?: number
}>
export type PinnedResourceFields = Readonly<{
  authorityResourceRef?: string
  authorityResourceRefs?: readonly string[]
}>
export type QualifiedUsePayoutAmounts = Readonly<{
  businessId: string
  currency: string
  exponent: number
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
  sourceDigest: string
}>
export type QualifiedUsePayoutResolution =
  | Readonly<{ kind: 'eligible'; amounts: QualifiedUsePayoutAmounts }>
  | Readonly<{ kind: 'excluded'; reason: 'free_tier' }>
  | Readonly<{
      kind: 'excluded'
      reason: 'refunded_before_delivery'
      amounts: QualifiedUsePayoutAmounts
    }>
export type DailyPayoutIdentity = Readonly<{
  payoutRef: string
  periodStart: string
  periodEnd: string
  periodStartAt: number
  periodEndAt: number
}>
export type DailyPayoutComposition = Readonly<{
  rows: readonly Doc<'moneyPayoutAllocations'>[]
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}>
export function qualifiedUseAuthorityFailure(): never {
  throw new Error('qualified_use_authority_invalid')
}
export function qualifiedUsePayoutFailure(): never {
  throw new Error('qualified_use_payout_allocation_invalid')
}

