import type {
  AuthorityUse,
  MandateDecision,
  MandateRefusalCode,
  StandingMandate,
} from './standing-mandate'

export type StandingMandatePolicyProposal = Readonly<{
  objective: string
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
  policy: 'exact_scope_and_worst_case_loss:v1'
  fallbackOrdinal: number
  heldWorstCaseLossMinor: number
  proposedWorstCaseLossMinor: number
  maximumLossMinor: number
}>

export function evaluateStandingMandatePolicy(input: Readonly<{
  mandate: StandingMandate
  proposal: StandingMandatePolicyProposal
  uses: readonly AuthorityUse[]
}>): MandateDecision<StandingMandatePolicyDecision> {
  const { mandate, proposal } = input
  const refusal = scopeRefusal(mandate, proposal)
  if (refusal !== undefined) return { kind: 'refused', code: refusal }
  const maximumLoss = mandate.scope.maximumLoss ?? mandate.scope.maximumSpend
  const heldWorstCaseLossMinor = input.uses
    .filter((use) => use.mandateRef === mandate.mandateRef && use.state !== 'not_released')
    .reduce((sum, use) => sum + (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor), 0)
  if (heldWorstCaseLossMinor + proposal.worstCaseLoss.amountMinor > maximumLoss.amountMinor) {
    return { kind: 'refused', code: 'mandate_risk_exceeded' }
  }
  return {
    kind: 'accepted',
    value: {
      policy: 'exact_scope_and_worst_case_loss:v1',
      fallbackOrdinal: mandate.scope.permittedFallbacks.indexOf(proposal.fallbackRef),
      heldWorstCaseLossMinor,
      proposedWorstCaseLossMinor: proposal.worstCaseLoss.amountMinor,
      maximumLossMinor: maximumLoss.amountMinor,
    },
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
