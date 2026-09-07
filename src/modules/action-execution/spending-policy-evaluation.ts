import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  addExactAmounts,
  compareExactAmounts,
  sameExactScale,
  sumExactAmounts,
  type ExactAmount,
} from '@/modules/money/public'
import type {
  AuthorityUse,
  SpendingPolicyResult,
  SpendingPolicyRefusalCode,
  SpendingPolicy,
} from './spending-policy'
import {
  authorityUseIntegrityValid,
  spendingPolicyIntegrityValid,
} from './spending-policy'
import {
  persistedAuthorityUseMaterialValid,
  policyProposalMaterialValid,
  spendingPolicyMaterialValid,
} from './spending-policy-validation'

/**
 * Spending-policy decisions retain their v1 canonical bytes. The
 * storage-facing executionRef is projected back to the protected v1
 * callRef key only at this existing digest boundary.
 */
export function canonicalPolicyDecisionMaterial(
  decision: Omit<SpendingPolicyDecision, 'digest'>,
) {
  const { proposal, ...unchangedFields } = decision
  const { executionRef, ...unchangedProposalFields } = proposal
  const {
    spendingPolicyRef,
    spendingPolicyVersion,
    spendingPolicyGeneration,
  } = unchangedFields
  return {
    policyDecisionRef: unchangedFields.policyDecisionRef,
    policy: unchangedFields.policy,
    objectiveRef: unchangedFields.objectiveRef,
    mandateRef: spendingPolicyRef,
    mandateVersion: spendingPolicyVersion,
    mandateGeneration: spendingPolicyGeneration,
    proposal: { ...unchangedProposalFields, invocationRef: executionRef },
    capacity: unchangedFields.capacity,
    fallbackOrdinal: unchangedFields.fallbackOrdinal,
    heldWorstCaseLoss: unchangedFields.heldWorstCaseLoss,
    proposedWorstCaseLoss: unchangedFields.proposedWorstCaseLoss,
    maximumLoss: unchangedFields.maximumLoss,
    accepted: unchangedFields.accepted,
  }
}

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

export function evaluateSpendingPolicy(input: Readonly<{
  spendingPolicy: SpendingPolicy
  proposal: SpendingPolicyProposal
  uses: readonly AuthorityUse[]
  policyDecisionRef: string
}>): SpendingPolicyResult<SpendingPolicyDecision> {
  const { spendingPolicy, proposal } = input
  if (
    !spendingPolicyMaterialValid(spendingPolicy)
    || !spendingPolicyIntegrityValid(spendingPolicy)
    || !policyProposalMaterialValid(proposal)
    || input.uses.some((use) => (
      !persistedAuthorityUseMaterialValid(use) || !authorityUseIntegrityValid(use)
    ))
    || input.policyDecisionRef.length === 0
  ) return { kind: 'refused', code: 'spending_policy_material_invalid' }
  const refusal = scopeRefusal(spendingPolicy, proposal)
  if (refusal !== undefined) return { kind: 'refused', code: refusal }
  const maximumLoss = spendingPolicy.scope.maximumLoss ?? spendingPolicy.scope.maximumSpend
  const relevantUses = input.uses
    .filter((use) => use.spendingPolicyRef === spendingPolicy.spendingPolicyRef && use.state !== 'not_released')
  const heldWorstCaseLoss = sumExactAmounts(
    relevantUses.map((use) => use.reservedLoss ?? use.reservedSpend),
    maximumLoss,
  )
  const committedSpend = sumExactAmounts(
    relevantUses.map((use) => use.reservedSpend),
    spendingPolicy.scope.maximumSpend,
  )
  const proposedCommittedSpend = committedSpend === undefined
    ? undefined
    : addExactAmounts(committedSpend, proposal.spend)
  const proposedLoss = heldWorstCaseLoss === undefined
    ? undefined
    : addExactAmounts(heldWorstCaseLoss, proposal.worstCaseLoss)
  if (
    heldWorstCaseLoss === undefined
    || committedSpend === undefined
    || proposedCommittedSpend === undefined
    || proposedLoss === undefined
  ) return { kind: 'refused', code: 'spending_policy_material_invalid' }
  const spendComparison = compareExactAmounts(proposedCommittedSpend, spendingPolicy.scope.maximumSpend)
  const lossComparison = compareExactAmounts(proposedLoss, maximumLoss)
  if (spendComparison === undefined || lossComparison === undefined) {
    return { kind: 'refused', code: 'spending_policy_material_invalid' }
  }
  if (spendComparison > 0) {
    return { kind: 'refused', code: 'spending_policy_spend_exceeded' }
  }
  if (lossComparison > 0) {
    return { kind: 'refused', code: 'spending_policy_risk_exceeded' }
  }
  const capacity = {
    consumedCount: input.uses.filter((use) => use.state === 'released').length,
    reservedCount: input.uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain').length,
    committedSpend,
    heldWorstCaseLoss,
  }
  const material = {
    policyDecisionRef: input.policyDecisionRef,
    policy: 'exact_scope_and_worst_case_loss:v1' as const,
    objectiveRef: proposal.objectiveRef,
    spendingPolicyRef: spendingPolicy.spendingPolicyRef,
    spendingPolicyVersion: spendingPolicy.version,
    spendingPolicyGeneration: spendingPolicy.generation,
    proposal,
    capacity,
    fallbackOrdinal: spendingPolicy.scope.permittedFallbacks.indexOf(proposal.fallbackRef),
    heldWorstCaseLoss,
    proposedWorstCaseLoss: proposal.worstCaseLoss,
    maximumLoss,
    accepted: true as const,
  }
  return {
    kind: 'accepted',
    value: { ...material, digest: canonicalDigest(canonicalPolicyDecisionMaterial(material)) },
  }
}

function scopeRefusal(
  spendingPolicy: SpendingPolicy,
  proposal: SpendingPolicyProposal,
): SpendingPolicyRefusalCode | undefined {
  const actions = spendingPolicy.scope.actions ?? [spendingPolicy.scope.action]
  if (proposal.objective !== spendingPolicy.scope.objective) return 'spending_policy_action_mismatch'
  if (!actions.some((action) => action.id === proposal.action.id && action.version === proposal.action.version)) {
    return 'spending_policy_action_mismatch'
  }
  if (!spendingPolicy.scope.providerRefs.includes(proposal.providerRef)) return 'spending_policy_provider_mismatch'
  if (!spendingPolicy.scope.recipientRefs.includes(proposal.recipientRef)) return 'spending_policy_recipient_mismatch'
  if (!spendingPolicy.scope.purposes.includes(proposal.purpose)) return 'spending_policy_purpose_mismatch'
  const allowedDataFields = new Set(spendingPolicy.scope.allowedDataFields)
  if (proposal.dataFields.some((field) => !allowedDataFields.has(field))) {
    return 'spending_policy_data_widening'
  }
  if (
    !sameExactScale(proposal.spend, spendingPolicy.scope.maximumSpend)
    || !sameExactScale(proposal.worstCaseLoss, spendingPolicy.scope.maximumLoss ?? spendingPolicy.scope.maximumSpend)
    || compareExactAmounts(proposal.spend, spendingPolicy.scope.maximumSpend) === undefined
    || compareExactAmounts(proposal.worstCaseLoss, spendingPolicy.scope.maximumLoss ?? spendingPolicy.scope.maximumSpend) === undefined
  ) return 'spending_policy_currency_mismatch'
  if (!spendingPolicy.scope.permittedFallbacks.includes(proposal.fallbackRef)) return 'spending_policy_fallback_mismatch'
  if (proposal.risk !== spendingPolicy.scope.riskCeiling) return 'spending_policy_risk_exceeded'
  return undefined
}
