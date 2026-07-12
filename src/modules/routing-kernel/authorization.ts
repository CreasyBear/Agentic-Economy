import { isCanonicalAuthorityDigest, type AuthorizeInput, type RouteAuthorization, type RouteQuote } from './public'
import { IncidentAuthorizationError } from './internal/kernel'

export type AuthorizeRouteForPrincipalInput = AuthorizeInput & Readonly<{ now: number }>

export type AuthorizeRouteForPrincipalDependencies = Readonly<{
  getQuote: (quoteId: string) => Promise<RouteQuote | undefined>
  issue: (input: AuthorizeInput) => Promise<RouteAuthorization>
}>

export type AuthorizeRouteForPrincipalResult =
  | Readonly<{ kind: 'authorized'; authorization: RouteAuthorization }>
  | Readonly<{
      kind: 'authorization_refused'
      reason:
        | 'quote_not_found'
        | 'quote_digest_mismatch'
        | 'quote_digest_invalid'
        | 'quote_caller_mismatch'
        | 'quote_expired'
        | 'currency_mismatch'
        | 'spend_below_quote_maximum'
        | 'authorization_expired'
        | 'data_field_not_declared'
        | 'incident_frozen'
        | 'incident_epoch_stale'
    }>

export async function authorizeRouteForPrincipal(
  input: AuthorizeRouteForPrincipalInput,
  dependencies: AuthorizeRouteForPrincipalDependencies,
): Promise<AuthorizeRouteForPrincipalResult> {
  const quote = await dependencies.getQuote(input.quoteId)
  if (quote === undefined) return refused('quote_not_found')
  if (!isCanonicalAuthorityDigest(quote.quoteDigest) || !isCanonicalAuthorityDigest(input.quoteDigest)) return refused('quote_digest_invalid')
  if (quote.quoteDigest !== input.quoteDigest) return refused('quote_digest_mismatch')
  if (quote.caller.principalId !== input.principalId || quote.caller.agentId !== input.agentId) {
    return refused('quote_caller_mismatch')
  }
  if (quote.expiresAt <= input.now) return refused('quote_expired')
  if (quote.selectedGraph.maximumCost.currency !== input.currency) return refused('currency_mismatch')
  if (input.maximumSpendMinor < quote.selectedGraph.maximumCost.amountMinor) {
    return refused('spend_below_quote_maximum')
  }
  if (input.expiresAt <= input.now) return refused('authorization_expired')
  if ((input.allowedDataFields ?? []).some((field) => !quote.selectedGraph.dataFields.includes(field))) return refused('data_field_not_declared')
  const allowedDataFields = input.allowedDataFields ?? []
  const disclosureSteps = quote.selectedGraph.steps.filter((step) => step.dataFields.some((field) => allowedDataFields.includes(field)))
  const recipientBindingIds = [...new Set(disclosureSteps.map((step) => step.bindingId))].sort()
  const purposes = [...new Set(disclosureSteps.map((step) => step.capabilityContractId))].sort()
  if (recipientBindingIds.some((bindingId) => !(input.allowedRecipientBindingIds ?? recipientBindingIds).includes(bindingId))) return refused('data_field_not_declared')
  if (purposes.some((purpose) => !(input.allowedDisclosurePurposes ?? purposes).includes(purpose))) return refused('data_field_not_declared')

  let authorization: RouteAuthorization
  try {
    authorization = await dependencies.issue({
    ...(input.authorizationRef === undefined ? {} : { authorizationRef: input.authorizationRef }),
    budgetAuthorityRef: input.budgetAuthorityRef ?? `budget-authority:${input.principalId}:${input.currency}:provider-cost-v1`,
    budgetMaximumGrossMinor: input.budgetMaximumGrossMinor ?? input.maximumSpendMinor,
    dataAuthorizationBudgetRef: input.dataAuthorizationBudgetRef ?? `data-budget:${input.principalId}:default`,
    protectedFieldSetId: input.protectedFieldSetId ?? 'field-set:kernel-input:v1',
    dataBudgetMaximumAttempts: input.dataBudgetMaximumAttempts ?? disclosureSteps.length,
    dataBudgetMaximumExposures: input.dataBudgetMaximumExposures ?? disclosureSteps.length,
    allowedRecipientBindingIds: recipientBindingIds,
    allowedDisclosurePurposes: purposes,
    maximumDisclosureAttempts: Math.min(input.maximumDisclosureAttempts ?? disclosureSteps.length, disclosureSteps.length),
    maximumDisclosureExposures: Math.min(input.maximumDisclosureExposures ?? disclosureSteps.length, disclosureSteps.length),
    quoteId: quote.quoteId,
    quoteDigest: quote.quoteDigest,
    principalId: quote.caller.principalId,
    agentId: quote.caller.agentId,
    maximumSpendMinor: quote.selectedGraph.maximumCost.amountMinor,
    currency: quote.selectedGraph.maximumCost.currency,
    expiresAt: Math.min(input.expiresAt, quote.expiresAt),
    allowedDataFields,
    incidentEpochDigest: quote.incidentEpochDigest,
    })
  } catch (error) {
    if (error instanceof IncidentAuthorizationError) return refused(error.code)
    throw error
  }
  return { kind: 'authorized', authorization }
}

function refused(reason: Extract<AuthorizeRouteForPrincipalResult, { kind: 'authorization_refused' }>['reason']) {
  return { kind: 'authorization_refused', reason } as const
}
