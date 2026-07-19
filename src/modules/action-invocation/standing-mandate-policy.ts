import type {
  AuthorityUse,
  MandateDecision,
  MandateRefusalCode,
  StandingMandate,
} from './standing-mandate'

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
  spend: Readonly<{ amountMinor: number; currency: string }>
  worstCaseLoss: Readonly<{ amountMinor: number; currency: string }>
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
    committedSpendMinor: number
    heldWorstCaseLossMinor: number
  }>
  fallbackOrdinal: number
  heldWorstCaseLossMinor: number
  proposedWorstCaseLossMinor: number
  maximumLossMinor: number
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
  const refusal = scopeRefusal(mandate, proposal)
  if (refusal !== undefined) return { kind: 'refused', code: refusal }
  const maximumLoss = mandate.scope.maximumLoss ?? mandate.scope.maximumSpend
  const heldWorstCaseLossMinor = input.uses
    .filter((use) => use.mandateRef === mandate.mandateRef && use.state !== 'not_released')
    .reduce((sum, use) => sum + (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor), 0)
  const committedSpendMinor = input.uses
    .filter((use) => use.state !== 'not_released')
    .reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0)
  if (committedSpendMinor + proposal.spend.amountMinor > mandate.scope.maximumSpend.amountMinor) {
    return { kind: 'refused', code: 'mandate_spend_exceeded' }
  }
  if (heldWorstCaseLossMinor + proposal.worstCaseLoss.amountMinor > maximumLoss.amountMinor) {
    return { kind: 'refused', code: 'mandate_risk_exceeded' }
  }
  const capacity = {
    consumedCount: input.uses.filter((use) => use.state === 'released').length,
    reservedCount: input.uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain').length,
    committedSpendMinor,
    heldWorstCaseLossMinor,
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
    heldWorstCaseLossMinor,
    proposedWorstCaseLossMinor: proposal.worstCaseLoss.amountMinor,
    maximumLossMinor: maximumLoss.amountMinor,
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
  if (proposal.dataFields.some((field) => !mandate.scope.allowedDataFields.includes(field))) {
    return 'mandate_data_widening'
  }
  if (
    proposal.spend.currency !== mandate.scope.maximumSpend.currency
    || proposal.worstCaseLoss.currency !== (mandate.scope.maximumLoss?.currency ?? mandate.scope.maximumSpend.currency)
  ) return 'mandate_currency_mismatch'
  if (!mandate.scope.permittedFallbacks.includes(proposal.fallbackRef)) return 'mandate_fallback_mismatch'
  if (proposal.risk !== mandate.scope.riskCeiling) return 'mandate_risk_exceeded'
  return undefined
}
import { canonicalDigest } from '@/modules/common/canonical-digest'
