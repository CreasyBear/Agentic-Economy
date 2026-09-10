import type { ExactAmount } from '@/modules/money/public'
import type { Ed25519VerificationKey } from '@/modules/common/ed25519-attestation'
import type {
  ExposureOffsetRuleIdentity,
  ExposureReleaseAttestation,
} from './exposure-offset-rules'

/**
 * Pure type/shape definitions shared across the spending-policy cluster
 * (spending-policy.ts, spending-policy-evaluation.ts, spending-policy-grant.ts).
 * This module carries no runtime logic and imports nothing from any of
 * those files, so none of them can form an import cycle through it.
 */

export const SPENDING_POLICY_FORMAT = 'ae.action-invocation-standing-mandate:v1' as const

export type SpendingPolicyScope = Readonly<{
  objective: string
  action: Readonly<{ id: string; version: string }>
  actions?: readonly Readonly<{ id: string; version: string }>[]
  providerRefs: readonly string[]
  recipientRefs: readonly string[]
  purposes: readonly string[]
  allowedDataFields: readonly string[]
  maximumSpend: ExactAmount
  maximumActionCount: number
  /** Historical v1 wire key: limits concurrently held effect-capacity reservations. */
  maximumConcurrentReservations: number
  startsAt: string
  expiresAt: string
  permittedFallbacks: readonly string[]
  riskCeiling: string
  maximumLoss?: ExactAmount
  exposureOffsetRules?: readonly ExposureOffsetRuleIdentity[]
  exposureOffsetVerificationKeys?: readonly Ed25519VerificationKey[]
}>

export type SpendingPolicy = Readonly<{
  format: typeof SPENDING_POLICY_FORMAT
  mode: 'spending_policy' | 'unrestricted_test_only'
  spendingPolicyRef: string
  version: number
  generation: number
  grantorRef: string
  principalRef: string
  delegateRef: string
  callerRef: string
  scope: SpendingPolicyScope
  issuedAt: string
  revoked: false | Readonly<{ reason: string; revokedAt: string }>
  digest: string
}>

export type AuthorityUseMaterial = Readonly<{
  authorityUseRef: string
  spendingPolicyRef: string
  spendingPolicyVersion: number
  spendingPolicyGeneration: number
  callerRef: string
  principalRef: string
  delegateRef: string
  executionRef: string
  action: Readonly<{ id: string; version: string }>
  preparedMaterialDigest: string
  providerRef: string
  recipientRef: string
  purpose: string
  dataFields: readonly string[]
  reservedSpend: ExactAmount
  reservedLoss?: ExactAmount
  fallbackRef: string | null
  risk: string
  effectGeneration: number
  policyDecisionRef?: string
}>

export type AuthorityUse = AuthorityUseMaterial & Readonly<{
  state: 'reserved' | 'not_released' | 'released' | 'uncertain'
  reservedAt: string
  settledAt?: string
  digest: string
}>

export type AuthorityExposureOffset = Readonly<{
  authorityUseRef: string
  offsetAuthorityUseRef: string
  spendingPolicyRef: string
  spendingPolicyVersion: number
  spendingPolicyGeneration: number
  principalRef: string
  providerRef: string
  exposureAction: Readonly<{ id: string; version: string }>
  offsetAction: Readonly<{ id: string; version: string }>
  exposureSubjectRef: string
  exposureResultRef: string
  exposureEvidenceRef: string
  offsetSubjectRef: string
  offsetResultRef: string
  offsetEvidenceRef: string
  amount: ExactAmount
  evidenceRuleRef: string
  evidenceRuleSource: string
  evidenceRuleVersion: string
  releaseAttestation: ExposureReleaseAttestation
  offsetGeneration: 1
  recordedAt: string
  digest: string
}>

export type SpendingPolicyRefusalCode =
  | 'spending_policy_material_invalid'
  | 'spending_policy_not_found'
  | 'spending_policy_integrity_invalid'
  | 'spending_policy_grant_unauthenticated'
  | 'spending_policy_revoked'
  | 'spending_policy_not_started'
  | 'spending_policy_expired'
  | 'spending_policy_generation_stale'
  | 'spending_policy_principal_mismatch'
  | 'spending_policy_delegate_mismatch'
  | 'spending_policy_caller_mismatch'
  | 'spending_policy_action_mismatch'
  | 'spending_policy_provider_mismatch'
  | 'spending_policy_recipient_mismatch'
  | 'spending_policy_purpose_mismatch'
  | 'spending_policy_data_widening'
  | 'spending_policy_spend_exceeded'
  | 'spending_policy_currency_mismatch'
  | 'spending_policy_count_exhausted'
  | 'spending_policy_concurrency_exhausted'
  | 'spending_policy_fallback_mismatch'
  | 'spending_policy_risk_exceeded'
  | 'authority_use_conflict'
  | 'authority_use_not_found'
  | 'authority_use_linkage_invalid'

export type SpendingPolicyResult<T> =
  | Readonly<{ kind: 'accepted'; value: T }>
  | Readonly<{ kind: 'refused'; code: SpendingPolicyRefusalCode }>

export type SpendingPolicyProposal = Readonly<{
  objectiveRef: string
  objective: string
  sourceOptionRef: string
  materialDigest: string
  authorityUseRef: string
  executionRef: string
  action: Readonly<{ id: string; version: string }>
  providerRef: string
  recipientRef: string
  purpose: string
  dataFields: readonly string[]
  spend: ExactAmount
  worstCaseLoss: ExactAmount
  fallbackRef: string
  risk: string
}>

export type SpendingPolicyDecision = Readonly<{
  policyDecisionRef: string
  policy: 'exact_scope_and_worst_case_loss:v1'
  objectiveRef: string
  spendingPolicyRef: string
  spendingPolicyVersion: number
  spendingPolicyGeneration: number
  proposal: SpendingPolicyProposal
  capacity: Readonly<{
    consumedCount: number
    reservedCount: number
    committedSpend: ExactAmount
    heldWorstCaseLoss: ExactAmount
  }>
  fallbackOrdinal: number
  heldWorstCaseLoss: ExactAmount
  proposedWorstCaseLoss: ExactAmount
  maximumLoss: ExactAmount
  accepted: true
  digest: string
}>
