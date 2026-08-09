import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  addExactAmounts,
  compareExactAmounts,
  type ExactAmount,
} from '@/modules/money/public'
import type {
  AuthorityUse,
  MandateDecision,
  MandateRefusalCode,
  StandingMandate,
} from './standing-mandate'
import {
  authorityUseIntegrityValid,
  mandateIntegrityValid,
} from './standing-mandate'
import {
  persistedAuthorityUseMaterialValid,
  policyProposalMaterialValid,
  standingMandateMaterialValid,
} from './standing-mandate-validation'

export type StandingMandatePolicyProposal = Readonly<{
  objectiveRef: string
  objective: string
  sourceOptionRef: string
  materialDigest: string
  authorityUseRef: string
  invocationRef: string
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

export type StandingMandatePolicyDecision = Readonly<{
  policyDecisionRef: string
  policy: 'exact_scope_and_worst_case_loss:v1'
  objectiveRef: string
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  proposal: StandingMandatePolicyProposal
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

export function evaluateStandingMandatePolicy(input: Readonly<{
  mandate: StandingMandate
  proposal: StandingMandatePolicyProposal
  uses: readonly AuthorityUse[]
  policyDecisionRef: string
}>): MandateDecision<StandingMandatePolicyDecision> {
  const { mandate, proposal } = input
  if (
    !standingMandateMaterialValid(mandate)
    || !mandateIntegrityValid(mandate)
    || !policyProposalMaterialValid(proposal)
    || input.uses.some((use) => (
      !persistedAuthorityUseMaterialValid(use) || !authorityUseIntegrityValid(use)
    ))
    || input.policyDecisionRef.length === 0
  ) return { kind: 'refused', code: 'mandate_material_invalid' }
  const refusal = scopeRefusal(mandate, proposal)
  if (refusal !== undefined) return { kind: 'refused', code: refusal }
  const maximumLoss = mandate.scope.maximumLoss ?? mandate.scope.maximumSpend
  const relevantUses = input.uses
    .filter((use) => use.mandateRef === mandate.mandateRef && use.state !== 'not_released')
  const heldWorstCaseLoss = sumExactAmounts(
    relevantUses.map((use) => use.reservedLoss ?? use.reservedSpend),
    maximumLoss,
  )
  const committedSpend = sumExactAmounts(
    relevantUses.map((use) => use.reservedSpend),
    mandate.scope.maximumSpend,
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
  ) return { kind: 'refused', code: 'mandate_material_invalid' }
  const spendComparison = compareExactAmounts(proposedCommittedSpend, mandate.scope.maximumSpend)
  const lossComparison = compareExactAmounts(proposedLoss, maximumLoss)
  if (spendComparison === undefined || lossComparison === undefined) {
    return { kind: 'refused', code: 'mandate_material_invalid' }
  }
  if (spendComparison > 0) {
    return { kind: 'refused', code: 'mandate_spend_exceeded' }
  }
  if (lossComparison > 0) {
    return { kind: 'refused', code: 'mandate_risk_exceeded' }
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
    mandateRef: mandate.mandateRef,
    mandateVersion: mandate.version,
    mandateGeneration: mandate.generation,
    proposal,
    capacity,
    fallbackOrdinal: mandate.scope.permittedFallbacks.indexOf(proposal.fallbackRef),
    heldWorstCaseLoss,
    proposedWorstCaseLoss: proposal.worstCaseLoss,
    maximumLoss,
    accepted: true as const,
  }
  return {
    kind: 'accepted',
    value: { ...material, digest: canonicalDigest(material as never) },
  }
}

function scopeRefusal(
  mandate: StandingMandate,
  proposal: StandingMandatePolicyProposal,
): MandateRefusalCode | undefined {
  const actions = mandate.scope.actions ?? [mandate.scope.action]
  if (proposal.objective !== mandate.scope.objective) return 'mandate_action_mismatch'
  if (!actions.some((action) => action.id === proposal.action.id && action.version === proposal.action.version)) {
    return 'mandate_action_mismatch'
  }
  if (!mandate.scope.providerRefs.includes(proposal.providerRef)) return 'mandate_provider_mismatch'
  if (!mandate.scope.recipientRefs.includes(proposal.recipientRef)) return 'mandate_recipient_mismatch'
  if (!mandate.scope.purposes.includes(proposal.purpose)) return 'mandate_purpose_mismatch'
  const allowedDataFields = new Set(mandate.scope.allowedDataFields)
  if (proposal.dataFields.some((field) => !allowedDataFields.has(field))) {
    return 'mandate_data_widening'
  }
  if (
    !sameExactScale(proposal.spend, mandate.scope.maximumSpend)
    || !sameExactScale(proposal.worstCaseLoss, mandate.scope.maximumLoss ?? mandate.scope.maximumSpend)
    || compareExactAmounts(proposal.spend, mandate.scope.maximumSpend) === undefined
    || compareExactAmounts(proposal.worstCaseLoss, mandate.scope.maximumLoss ?? mandate.scope.maximumSpend) === undefined
  ) return 'mandate_currency_mismatch'
  if (!mandate.scope.permittedFallbacks.includes(proposal.fallbackRef)) return 'mandate_fallback_mismatch'
  if (proposal.risk !== mandate.scope.riskCeiling) return 'mandate_risk_exceeded'
  return undefined
}
function sameExactScale(left: ExactAmount, right: ExactAmount): boolean {
  return left.currency === right.currency && left.exponent === right.exponent
}

function sumExactAmounts(amounts: readonly ExactAmount[], zeroReference: ExactAmount): ExactAmount | undefined {
  let total: ExactAmount = { ...zeroReference, units: '0' }
  for (const amount of amounts) {
    if (!sameExactScale(total, amount)) return undefined
    const next = addExactAmounts(total, amount)
    if (next === undefined) return undefined
    total = next
  }
  return total
}
