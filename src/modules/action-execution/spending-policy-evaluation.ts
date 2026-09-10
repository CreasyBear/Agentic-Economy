import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  addExactAmounts,
  compareExactAmounts,
  sameExactScale,
  sumExactAmounts,
} from '@/modules/money/public'
import type {
  AuthorityUse,
  SpendingPolicy,
  SpendingPolicyDecision,
  SpendingPolicyProposal,
  SpendingPolicyRefusalCode,
  SpendingPolicyResult,
} from './spending-policy-types'
import {
  authorityUseIntegrityValid,
  canonicalPolicyDecisionMaterial,
  spendingPolicyIntegrityValid,
} from './spending-policy-integrity'
import {
  persistedAuthorityUseMaterialValid,
  policyProposalMaterialValid,
  spendingPolicyMaterialValid,
} from './spending-policy-validation'

export { canonicalPolicyDecisionMaterial }
export type { SpendingPolicyDecision, SpendingPolicyProposal }

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
