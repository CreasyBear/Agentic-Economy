import { v, type Infer } from 'convex/values'

import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  writableCustomerRequestV2Aggregate,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import {
  requestRegistrySnapshotDigest,
  type RegisteredEvaluationBinding,
} from '@/modules/customer-request/evaluation'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  routePlanGenerationIsInternallyConsistent,
  writableCustomerRequestRoutePlanGeneration,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  aggregateIsInternallyConsistent,
  commitAggregate as commitAggregateMachine,
  recordRoutePlanGenerationRetry as recordRoutePlanGenerationRetryMachine,
  refreshRoutePlanGeneration as refreshRoutePlanGenerationMachine,
} from '@/modules/customer-request/v2-write'
import {
  getCurrentAggregate as getCurrentAggregateMachine,
  getRoutePlanGeneration as getRoutePlanGenerationMachine,
  getRoutePlanGenerationRefreshReplay as getRoutePlanGenerationRefreshReplayMachine,
  hasLegacyEmbeddedRoute,
} from '@/modules/customer-request/v2-read'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { listRouteableCapabilitySupply } from './capabilitySupply'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { customerRequestV2WritePorts } from './customerRequestV2WritePorts'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'
import {
  customerRequestV2ReadPorts,
  readExactRoutePlanGeneration,
  readVerifiedCommandReplay,
} from './customerRequestV2ReadPorts'

export { aggregateIsInternallyConsistent } from '@/modules/customer-request/v2-write'

type RouteGeneration = Infer<typeof routePlanGenerationV2Value>

const commitResult = v.union(
  v.object({ kind: v.literal('stored'), requestId: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('replayed'), requestId: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('revision_conflict') }),
  v.object({ kind: v.literal('route_generation_conflict') }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
  v.object({ kind: v.literal('aggregate_invalid') }),
  v.object({ kind: v.literal('context_stale') }),
)
const submissionShell = v.object({
  commandKey: v.string(), commandDigest: v.string(),
  requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(),
  intent: v.string(), networkId: v.string(), createdAt: v.number(),
})
const reserveSubmissionResult = v.union(
  v.object({ kind: v.literal('stored'), requestId: v.string() }),
  v.object({ kind: v.literal('replayed'), requestId: v.string() }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
)
const submissionShellResult = v.union(
  v.object({ kind: v.literal('found'), shell: submissionShell }),
  v.object({ kind: v.literal('not_found') }),
)

const currentAggregateResult = v.union(
  v.object({
    kind: v.literal('current'), aggregate: customerRequestV2AggregateValue,
    routeGenerationNumber: v.number(),
    routeGenerationRef: v.optional(v.string()),
    currentDecisionCommandKey: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('resubmit_required'),
    requestId: v.string(), revision: v.number(), principalId: v.string(),
    reason: v.literal('legacy_embedded_route'),
  }),
  v.object({ kind: v.literal('not_found') }),
)
const routePlanGenerationResult = v.union(
  v.object({ kind: v.literal('found'), routeGeneration: routePlanGenerationV2Value }),
  v.object({ kind: v.literal('not_found') }),
)
const routePlanProjectionMaterialResult = v.union(
  v.object({
    kind: v.literal('found'),
    current: routePlanGenerationV2Value,
    previous: v.optional(routePlanGenerationV2Value),
    businesses: v.array(v.object({ businessId: v.string(), name: v.string() })),
    capabilities: v.array(v.object({
      capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
      name: v.string(), description: v.string(), resultLabels: v.array(v.string()),
    })),
  }),
  v.object({ kind: v.literal('not_found') }),
)
const commandReplayResult = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('conflict') }),
  v.object({
    kind: v.literal('resubmit_required'),
    requestId: v.string(), revision: v.number(),
    reason: v.literal('legacy_embedded_route'),
  }),
  v.object({
    kind: v.literal('replayed'), aggregate: customerRequestV2AggregateValue,
    routeGenerationRef: v.optional(v.string()),
    noEffect: v.boolean(),
  }),
)
const noopCommitResult = v.union(
  v.object({ kind: v.literal('stored') }),
  v.object({ kind: v.literal('replayed') }),
  v.object({ kind: v.literal('revision_conflict') }),
  v.object({ kind: v.literal('route_generation_conflict') }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
)
const generationRefreshResult = v.union(
  v.object({ kind: v.literal('unchanged'), routeGeneration: routePlanGenerationV2Value }),
  v.object({ kind: v.literal('superseded'), routeGeneration: routePlanGenerationV2Value }),
  v.object({ kind: v.literal('needs_information'), aggregate: customerRequestV2AggregateValue }),
  v.object({ kind: v.literal('unsupported'), aggregate: customerRequestV2AggregateValue }),
  v.object({
    kind: v.literal('retryable'),
    reason: v.union(
      v.literal('current_supply_unavailable'),
      v.literal('interpreter_unavailable'),
      v.literal('interpretation_unusable'),
      v.literal('context_changed'),
    ),
  }),
  v.object({ kind: v.literal('request_conflict') }),
  v.object({ kind: v.literal('route_generation_conflict') }),
  v.object({ kind: v.literal('identity_conflict') }),
  v.object({ kind: v.literal('command_conflict') }),
  v.object({ kind: v.literal('candidate_invalid') }),
  v.object({ kind: v.literal('context_stale') }),
)
const generationRefreshReplayResult = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('command_conflict') }),
  generationRefreshResult,
)

export const reserveSubmission = internalMutation({
  args: submissionShell,
  returns: reserveSubmissionResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getSubmissionShell = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: submissionShellResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const commitAggregate = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), expectedRevision: v.number(),
    expectedRouteGeneration: v.number(), aggregate: customerRequestV2AggregateValue,
    routeGeneration: v.optional(routePlanGenerationV2Value),
  },
  returns: commitResult,
  handler: async (ctx, args): Promise<Infer<typeof commitResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const recordNoopCommand = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRevision: v.number(), expectedRouteGeneration: v.number(), aggregateDigest: v.string(),
    routeGenerationRef: v.optional(v.string()), committedAt: v.number(),
  },
  returns: noopCommitResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const refreshRoutePlanGeneration = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRequestRevision: v.number(), expectedGeneration: v.number(), expectedGenerationRef: v.string(),
    expectedDecisionCommandKey: v.optional(v.string()),
    candidateAggregate: customerRequestV2AggregateValue,
    candidateRouteGeneration: v.optional(routePlanGenerationV2Value),
  },
  returns: generationRefreshResult,
  handler: async (ctx, args): Promise<Infer<typeof generationRefreshResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const recordRoutePlanGenerationRetry = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRequestRevision: v.number(), expectedGeneration: v.number(), expectedGenerationRef: v.string(),
    expectedDecisionCommandKey: v.optional(v.string()),
    reason: v.union(
      v.literal('current_supply_unavailable'),
      v.literal('interpreter_unavailable'),
      v.literal('interpretation_unusable'),
      v.literal('context_changed'),
    ),
    recordedAt: v.number(),
  },
  returns: generationRefreshResult,
  handler: async (ctx, args): Promise<Infer<typeof generationRefreshResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getRoutePlanGenerationRefreshReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: generationRefreshReplayResult,
  handler: async (ctx, args): Promise<Infer<typeof generationRefreshReplayResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

function domainAggregate(value: unknown): CustomerRequestV2Aggregate {
  return value as CustomerRequestV2Aggregate
}


function writableGenerationRefreshResult(
  result: Awaited<ReturnType<typeof refreshRoutePlanGenerationMachine>>,
): Infer<typeof generationRefreshResult> {
  if (result.kind === 'unchanged' || result.kind === 'superseded') {
    return {
      kind: result.kind,
      routeGeneration: writableCustomerRequestRoutePlanGeneration(result.routeGeneration),
    }
  }
  if (result.kind === 'needs_information' || result.kind === 'unsupported') {
    return {
      kind: result.kind,
      aggregate: writableCustomerRequestV2Aggregate(result.aggregate),
    }
  }
  return result
}

export const getCurrentAggregate = internalQuery({
  args: { requestId: v.string() },
  returns: currentAggregateResult,
  handler: async (ctx, args): Promise<Infer<typeof currentAggregateResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getCurrentRoutePlanGeneration = internalQuery({
  args: { requestId: v.string() },
  returns: routePlanGenerationResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getRoutePlanGeneration = internalQuery({
  args: { requestId: v.string(), generationRef: v.string() },
  returns: routePlanGenerationResult,
  handler: async (ctx, args): Promise<Infer<typeof routePlanGenerationResult>> => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getCurrentRoutePlanProjectionMaterial = internalQuery({
  args: { requestId: v.string() },
  returns: routePlanProjectionMaterialResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const getCommandReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: commandReplayResult,
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export async function currentRoutePlanGenerationGraphStatus(
  _db: QueryCtx['db'],
  _requestId: string,
  _generationRef: string,
  _now = Date.now(),
): Promise<'current' | 'stale' | 'invalid'> {
  return unlistedCustomerRequestTables()
}

type AvailableEligibleCapabilitySupply = Extract<
  Awaited<ReturnType<typeof listRouteableCapabilitySupply>>,
  { kind: 'available' }
>

function registeredEvaluationBindingsFromEligibleSupply(
  supply: AvailableEligibleCapabilitySupply,
): RegisteredEvaluationBinding[] {
  return supply.supplies.flatMap(({ offering, binding, publication }) => (
    publication === undefined
      ? []
      : [{
          operationRef: publication.operationRef,
          admittedOperation: publication.admittedOperation,
          businessId: String(offering.businessId),
          offeringId: offering.offeringId,
          bindingId: binding.bindingId,
          contractRef: {
            capabilityId: binding.capabilityId,
            version: binding.version,
            contractDigest: binding.contractDigest,
          },
          offeringRegistrationHash: offering.registrationHash,
          bindingRegistrationHash: binding.registrationHash,
          price: offering.presentation.price,
          priceDigest: publication.priceDigest,
          commercialRelationship: {
            ...offering.presentation.commercialRelationship,
            evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
          },
          cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
          publicationRef: publication.publicationRef,
          publicationRevision: publication.revision,
          readinessValidUntil: publication.readinessValidUntil,
        }]
  ))
}

function domainRouteGeneration(value: RouteGeneration): CustomerRequestRoutePlanGeneration
function domainRouteGeneration(value: undefined): undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined {
  return value as CustomerRequestRoutePlanGeneration | undefined
}
