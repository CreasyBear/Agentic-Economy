import { canonicalAuthorityDigest } from '../authority-digest'
import { createStepGrant } from '../step-grant'
import { createDisclosureGrant } from '../disclosure-grant'
import type {
  CandidateGraphStepQuote,
  DisclosureGrant,
  KernelCaller,
  RouteAuthorization,
  RouteQuote,
  StepGrant,
} from '../model'
import { sameCaller } from '../shared/incident-scope'

type ExecutionDigestRequest = Readonly<{
  quoteId: string
  quoteDigest: string
  authorizationRef: string
  executionPurpose?: 'incident_canary'
  canaryRecoveryGrantId?: string
}>

export function projectDataForStep(
  data: Readonly<Record<string, string>>,
  declaredFields: readonly string[],
): Readonly<Record<string, string>> {
  const fields = new Set(declaredFields)
  return Object.freeze(Object.fromEntries(
    Object.entries(data).filter(([field]) => fields.has(field)),
  ))
}

export function createExecutionRequestDigest(
  request: ExecutionDigestRequest,
  data: Readonly<Record<string, string>>,
): string {
  return canonicalAuthorityDigest({
    quoteId: request.quoteId,
    quoteDigest: request.quoteDigest,
    authorizationRef: request.authorizationRef,
    ...(request.executionPurpose === undefined ? {} : { executionPurpose: request.executionPurpose }),
    ...(request.canaryRecoveryGrantId === undefined ? {} : { canaryRecoveryGrantId: request.canaryRecoveryGrantId }),
    data,
  })
}

export function grantForStep(input: Readonly<{
  quote: RouteQuote
  step: CandidateGraphStepQuote
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  requestDigest: string
  disclosedDataFields: readonly string[]
  attempt: number
  issuedAt: number
  expiresAt: number
}>): StepGrant {
  return createStepGrant({
    stepGrantId: input.stepGrantId,
    rootRunId: input.rootRunId,
    leafRunId: input.leafRunId,
    quoteId: input.quote.quoteId,
    quoteDigest: input.quote.quoteDigest,
    incidentEpochDigest: input.step.incidentEpochDigest ?? input.quote.incidentEpochDigest,
    requestDigest: input.requestDigest,
    bindingId: input.step.bindingId,
    nodeId: input.step.nodeId,
    capabilityContractId: input.step.capabilityContractId,
    maximumCost: input.step.maximumCost,
    disclosedDataFields: input.disclosedDataFields,
    attempt: input.attempt,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    enforcementPoint: 'provider_release',
  })
}

export function disclosureGrantForStep(input: Readonly<{
  authorization: RouteAuthorization
  step: CandidateGraphStepQuote
  stepGrant: StepGrant
  data: Readonly<Record<string, string>>
}>): DisclosureGrant | undefined {
  const fields = Object.keys(input.data).sort()
  if (fields.length === 0) return undefined
  return createDisclosureGrant({
    disclosureGrantId: `disclosure-grant:${input.stepGrant.stepGrantId}`,
    dataAuthorizationBudgetRef: input.authorization.dataAuthorizationBudgetRef,
    rootRunId: input.stepGrant.rootRunId,
    leafRunId: input.stepGrant.leafRunId,
    stepGrantId: input.stepGrant.stepGrantId,
    quoteId: input.stepGrant.quoteId,
    quoteDigest: input.stepGrant.quoteDigest,
    requestDigest: input.stepGrant.requestDigest,
    recipientBindingId: input.step.bindingId,
    purpose: input.step.capabilityContractId,
    fields,
    projectionDigest: canonicalAuthorityDigest(input.data),
    attempt: input.stepGrant.attempt,
    issuedAt: input.stepGrant.issuedAt,
    expiresAt: input.stepGrant.expiresAt,
    incidentEpochDigest: input.stepGrant.incidentEpochDigest,
  })
}

export function authorizationRefusal(
  quote: RouteQuote,
  authorization: RouteAuthorization | undefined,
  caller: KernelCaller,
  now: number,
): string | undefined {
  if (quote.expiresAt <= now) return 'quote_expired'
  if (authorization === undefined) return 'authorization_not_found'
  if (authorization.consumedAt !== undefined) return 'authorization_consumed'
  if (authorization.quoteId !== quote.quoteId || authorization.quoteDigest !== quote.quoteDigest) return 'authorization_quote_mismatch'
  if (authorization.principalId !== caller.principalId || authorization.agentId !== caller.agentId) return 'authorization_caller_mismatch'
  if (!sameCaller(quote.caller, caller)) return 'quote_caller_mismatch'
  if (authorization.expiresAt <= now) return 'authorization_expired'
  if (authorization.currency !== quote.selectedGraph.maximumCost.currency) return 'authorization_currency_mismatch'
  if (authorization.maximumSpendMinor < quote.selectedGraph.maximumCost.amountMinor) return 'authorization_spend_exceeded'
  return undefined
}

