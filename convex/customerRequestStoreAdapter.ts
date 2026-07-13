import { canonicalDigest } from '@/modules/common/canonical-digest'
import { preparedActionValue } from '@/modules/customer-request/runtime'
import type { CustomerRequestPreparationStore, PreparationRefusalReason } from '@/modules/customer-request/preparation'
import type { CustomerRequest, PlanRevision, PreparedAction } from '@/modules/customer-request/legacy-v1'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type Context = Pick<ActionCtx, 'runQuery' | 'runMutation'>

export function createConvexCustomerRequestPreparationStore(
  ctx: Context,
  now: () => number = Date.now,
): CustomerRequestPreparationStore {
  return {
    putRequest: async (request) => {
      const result = await ctx.runMutation(internal.customerRequests.putRequest, { request: writableRequest(request) })
      if (result.kind !== 'stored') throw new Error(`customer_request_${result.kind}`)
    },
    putPlanRevision: async (plan) => {
      const result = await ctx.runMutation(internal.customerRequests.putPlanRevision, { plan: writablePlan(plan) })
      if (result.kind !== 'stored') throw new Error(`plan_revision_${result.kind}`)
    },
    getRequest: async (requestId) => {
      const result = await ctx.runQuery(internal.customerRequests.getRequest, { requestId })
      if (result === null) return undefined
      const optimizeFor = result.routing.optimizeFor
      if (optimizeFor !== 'cost' && optimizeFor !== 'latency') throw new Error('customer_request_routing_invalid')
      return { ...result, routing: { ...result.routing, optimizeFor } }
    },
    getPlanRevision: async (planRevisionId) => await ctx.runQuery(internal.customerRequests.getPlanRevision, { planRevisionId }) ?? undefined,
    claimPreparation: async (input) => {
      const claimMaterial = { preparationScope: input.preparationScope, commandDigest: input.commandDigest }
      const result = await ctx.runMutation(internal.customerRequests.claimPreparation, {
        ...input,
        claimToken: `claim:${canonicalDigest(claimMaterial)}`,
        routingRequestId: `route:${canonicalDigest(claimMaterial)}`,
      })
      if (result.kind === 'prepared') return { kind: 'prepared', preparedAction: normalizePreparedAction(result.preparedAction) }
      if (result.kind === 'options_prepared') return { kind: 'options_prepared', candidateSet: result.candidateSet }
      if (result.kind === 'refused') return {
        kind: 'refused', reason: normalizeRefusalReason(result.reason),
        ...(result.inspectionRef === undefined ? {} : { inspectionRef: result.inspectionRef }),
      }
      return result
    },
    completePreparation: async (input) => normalizePreparedAction(await ctx.runMutation(internal.customerRequests.completePreparation, {
      ...input, preparedAction: writablePreparedAction(input.preparedAction), completedAt: now(),
    })),
    completeOptions: async (input) => await ctx.runMutation(internal.customerRequests.completeOptions, {
      ...input,
      candidateSet: {
        ...input.candidateSet,
        candidates: input.candidateSet.candidates.map((candidate) => ({
          ...candidate, business: { ...candidate.business }, expectedCost: { ...candidate.expectedCost },
          maximumCost: { ...candidate.maximumCost }, materialTerms: [...candidate.materialTerms],
          priceComponents: candidate.priceComponents.map((component) => ({ ...component })),
          comparableOutputs: candidate.comparableOutputs.map((output) => ({ ...output })),
          cancellation: { ...candidate.cancellation },
        })),
        attempts: input.candidateSet.attempts.map((attempt) => ({ ...attempt, business: { ...attempt.business } })),
      },
      completedAt: now(),
    }),
    refusePreparation: async (input) => {
      await ctx.runMutation(internal.customerRequests.refusePreparation, { ...input, completedAt: now() })
    },
  }
}

function writableRequest(request: CustomerRequest) {
  return {
    ...request,
    understanding: {
      ...request.understanding,
      hardConstraints: request.understanding.hardConstraints.map((requirement) => ({ ...requirement })),
      preferences: request.understanding.preferences.map((preference) => ({ ...preference })),
      substitutions: { ...request.understanding.substitutions, boundaries: [...request.understanding.substitutions.boundaries] },
    },
    knownFacts: { ...request.knownFacts },
    routing: { ...request.routing },
  }
}

function writablePlan(plan: PlanRevision) {
  return {
    ...plan,
    proposalProvenance: { ...plan.proposalProvenance },
    completionEvidence: plan.completionEvidence.map((evidence) => ({ ...evidence })),
    actions: plan.actions.map((action) => ({
      ...action,
      dependsOn: [...action.dependsOn],
      input: Object.fromEntries(Object.entries(action.input).map(([field, value]) => [field, { ...value }])),
      ...(action.providerAffinity === undefined ? {} : { providerAffinity: { ...action.providerAffinity } }),
    })),
  }
}

function writablePreparedAction(action: PreparedAction) {
  return {
    ...action,
    selectedBusiness: { ...action.selectedBusiness },
    alternatives: action.alternatives.map((alternative) => ({
      business: { ...alternative.business }, expectedCost: { ...alternative.expectedCost },
      maximumCost: { ...alternative.maximumCost }, expectedLatencyMs: alternative.expectedLatencyMs,
    })),
    comparisonBasis: { ...action.comparisonBasis, selectedBecause: [...action.comparisonBasis.selectedBecause] },
    allowedFallbacks: action.allowedFallbacks.map((fallback) => ({
      business: { ...fallback.business }, trigger: fallback.trigger, maximumCost: { ...fallback.maximumCost },
    })),
    expectedCost: { ...action.expectedCost }, maximumGrossCost: { ...action.maximumGrossCost },
    priceComponents: action.priceComponents.map((component) => ({ ...component })),
    disclosures: action.disclosures.map((disclosure) => ({
      ...disclosure, purposes: [...disclosure.purposes], purposeLabels: [...disclosure.purposeLabels],
    })),
    materialTerms: action.materialTerms.map((term) => ({ ...term })),
    cancellation: { ...action.cancellation },
  }
}

function normalizePreparedAction(action: Infer<typeof preparedActionValue>): PreparedAction {
  const objective = action.comparisonBasis.objective
  const commercialInfluence = action.comparisonBasis.commercialInfluence
  const cancellationKind = action.cancellation.kind
  if ((objective !== 'cost' && objective !== 'latency')
    || (commercialInfluence !== 'none' && commercialInfluence !== 'disclosed')
    || (cancellationKind !== 'supported' && cancellationKind !== 'conditional' && cancellationKind !== 'unsupported')
    || action.priceComponents.some((component) => component.kind !== 'provider' && component.kind !== 'ae_fee' && component.kind !== 'tax')) {
    throw new Error('prepared_action_persistence_invalid')
  }
  return {
    ...action,
    comparisonBasis: { ...action.comparisonBasis, objective, commercialInfluence },
    cancellation: { ...action.cancellation, kind: cancellationKind },
    priceComponents: action.priceComponents.map((component) => ({ ...component, kind: normalizePriceKind(component.kind) })),
    disclosures: action.disclosures.map((disclosure) => ({
      ...disclosure,
      dataCategory: disclosure.dataCategory ?? disclosure.field,
      purposeLabels: disclosure.purposeLabels ?? disclosure.purposes.map(customerPurposeLabel),
      status: disclosure.status ?? (disclosure.timing === 'already_shared_to_prepare' ? 'released' : 'not_released'),
      recordedAt: disclosure.recordedAt ?? action.preparedAt,
      inspectionRef: disclosure.inspectionRef ?? action.preparedActionId,
      timing: normalizeDisclosureTiming(disclosure.timing),
    })),
  }
}

function normalizePriceKind(value: unknown): 'provider' | 'ae_fee' | 'tax' {
  if (value === 'provider' || value === 'ae_fee' || value === 'tax') return value
  throw new Error('prepared_action_persistence_invalid')
}

function normalizeDisclosureTiming(value: unknown): 'already_shared_to_prepare' | 'on_execution' {
  if (value === 'already_shared_to_prepare' || value === 'on_execution') return value
  throw new Error('prepared_action_persistence_invalid')
}

function customerPurposeLabel(value: string) {
  const words = value.replace(/[_-]+/g, ' ').trim()
  if (words.length === 0) return 'Prepare this option'
  const first = words.at(0)
  return first === undefined ? 'Prepare this option' : `${first.toUpperCase()}${words.slice(1)}`
}

const PREPARATION_REFUSALS: readonly PreparationRefusalReason[] = [
  'request_not_found', 'request_revision_changed', 'plan_revision_not_found', 'plan_revision_changed', 'action_not_found',
  'capability_contract_not_found', 'action_input_unresolved', 'action_input_mismatch', 'preparation_authority_required',
  'authority_evidence_invalid', 'authority_signer_mismatch', 'authority_principal_mismatch', 'authority_agent_mismatch', 'authority_request_mismatch',
  'authority_request_revision_mismatch', 'authority_field_denied', 'authority_recipient_denied', 'authority_purpose_denied',
  'authority_expired', 'authority_revoked', 'authority_not_yet_valid', 'authority_state_conflict',
  'authority_recipient_capacity_exceeded', 'authority_exposure_capacity_exceeded', 'authority_operation_capacity_exceeded',
  'authority_allocation_conflict', 'preparation_release_contract_mismatch', 'preparation_data_release_uncertain',
  'no_connected_option', 'route_contract_mismatch', 'route_currency_mismatch',
  'route_spend_exceeded', 'route_data_contract_mismatch', 'route_recipient_limit_exceeded', 'route_quote_expired',
  'route_ranking_required',
  'preparation_purpose_not_composable',
]

function normalizeRefusalReason(value: unknown): PreparationRefusalReason {
  if (value === 'preparation_authority_invalid') return 'authority_evidence_invalid'
  const reason = PREPARATION_REFUSALS.find((candidate) => candidate === value)
  if (reason === undefined) throw new Error('preparation_refusal_persistence_invalid')
  return reason
}
