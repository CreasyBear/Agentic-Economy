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
} from '@/modules/customer-request/v2-read'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { listRouteableCapabilitySupply } from './capabilitySupply'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { customerRequestV2WritePorts } from './customerRequestV2WritePorts'
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
    const priorCommand = await ctx.db.query('customerRequestV2SubmissionShells')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (priorCommand !== null) {
      return priorCommand.commandDigest === args.commandDigest
        && priorCommand.requestId === args.requestId
        && priorCommand.principalId === args.principalId
        && priorCommand.delegatedAgentId === args.delegatedAgentId
        && priorCommand.intent === args.intent
        && priorCommand.networkId === args.networkId
        ? { kind: 'replayed' as const, requestId: args.requestId }
        : { kind: 'command_conflict' as const }
    }
    const priorRequest = await ctx.db.query('customerRequestV2SubmissionShells')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (priorRequest !== null) {
      return priorRequest.principalId === args.principalId
        && priorRequest.delegatedAgentId === args.delegatedAgentId
        ? { kind: 'command_conflict' as const }
        : { kind: 'identity_conflict' as const }
    }
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head !== null) {
      return head.principalId === args.principalId && head.delegatedAgentId === args.delegatedAgentId
        ? { kind: 'command_conflict' as const }
        : { kind: 'identity_conflict' as const }
    }
    await ctx.db.insert('customerRequestV2SubmissionShells', args)
    return { kind: 'stored' as const, requestId: args.requestId }
  },
})

export const getSubmissionShell = internalQuery({
  args: { requestId: v.string(), principalId: v.string() },
  returns: submissionShellResult,
  handler: async (ctx, args) => {
    const shell = await ctx.db.query('customerRequestV2SubmissionShells')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (shell === null || shell.principalId !== args.principalId) return { kind: 'not_found' as const }
    return {
      kind: 'found' as const,
      shell: {
        commandKey: shell.commandKey, commandDigest: shell.commandDigest,
        requestId: shell.requestId, principalId: shell.principalId,
        delegatedAgentId: shell.delegatedAgentId, intent: shell.intent,
        networkId: shell.networkId, createdAt: shell.createdAt,
      },
    }
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
    const { aggregate, routeGeneration, ...command } = args
    return await commitAggregateMachine({
      ...command,
      aggregate: domainAggregate(aggregate),
      ...(routeGeneration === undefined
        ? {}
        : { routeGeneration: domainRouteGeneration(routeGeneration) }),
    }, customerRequestV2WritePorts(ctx))
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
    const prior = await ctx.db.query('customerRequestV2Commands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (prior !== null) {
      return prior.commandDigest === args.commandDigest
        && prior.principalId === args.principalId
        && prior.requestId === args.requestId
        && prior.expectedRevision === args.expectedRevision
        && prior.resultingRevision === args.expectedRevision
        && prior.aggregateDigest === args.aggregateDigest
        && prior.expectedRouteGeneration === args.expectedRouteGeneration
        && prior.resultingRouteGenerationRef === args.routeGenerationRef
        && prior.noEffect === true
        ? { kind: 'replayed' as const }
        : { kind: 'command_conflict' as const }
    }
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head === null || head.currentRevision !== args.expectedRevision
      || head.currentAggregateDigest !== args.aggregateDigest) return { kind: 'revision_conflict' as const }
    if (head.principalId !== args.principalId) return { kind: 'identity_conflict' as const }
    const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if ((routeHead?.currentGeneration ?? 0) !== args.expectedRouteGeneration
      || routeHead?.currentGenerationRef !== args.routeGenerationRef) {
      return { kind: 'route_generation_conflict' as const }
    }
    await ctx.db.insert('customerRequestV2Commands', {
      commandKey: args.commandKey,
      commandDigest: args.commandDigest,
      principalId: args.principalId,
      requestId: args.requestId,
      expectedRevision: args.expectedRevision,
      resultingRevision: args.expectedRevision,
      aggregateDigest: args.aggregateDigest,
      expectedRouteGeneration: args.expectedRouteGeneration,
      ...(args.routeGenerationRef === undefined ? {} : { resultingRouteGenerationRef: args.routeGenerationRef }),
      noEffect: true,
      committedAt: args.committedAt,
    })
    return { kind: 'stored' as const }
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
    const { candidateAggregate, candidateRouteGeneration, ...command } = args
    return writableGenerationRefreshResult(await refreshRoutePlanGenerationMachine({
      ...command,
      candidateAggregate: domainAggregate(candidateAggregate),
      ...(candidateRouteGeneration === undefined
        ? {}
        : { candidateRouteGeneration: domainRouteGeneration(candidateRouteGeneration) }),
    }, customerRequestV2WritePorts(ctx)))
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
  handler: async (ctx, args): Promise<Infer<typeof generationRefreshResult>> => (
    writableGenerationRefreshResult(await recordRoutePlanGenerationRetryMachine(
      args,
      customerRequestV2WritePorts(ctx),
    ))
  ),
})

export const getRoutePlanGenerationRefreshReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: generationRefreshReplayResult,
  handler: async (ctx, args): Promise<Infer<typeof generationRefreshReplayResult>> => (
    await getRoutePlanGenerationRefreshReplayMachine(
      args,
      customerRequestV2ReadPorts(ctx),
    ) as Infer<typeof generationRefreshReplayResult>
  ),
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
  handler: async (ctx, args): Promise<Infer<typeof currentAggregateResult>> => (
    await getCurrentAggregateMachine(
      args,
      customerRequestV2ReadPorts(ctx),
    ) as Infer<typeof currentAggregateResult>
  ),
})

export const getCurrentRoutePlanGeneration = internalQuery({
  args: { requestId: v.string() },
  returns: routePlanGenerationResult,
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head?.currentGenerationRef === undefined) return { kind: 'not_found' as const }
    const result = await readExactRoutePlanGeneration(ctx.db, args.requestId, head.currentGenerationRef)
    if (result.kind !== 'found'
      || result.routeGeneration.generation !== head.currentGeneration
      || result.routeGeneration.generationDigest !== head.currentGenerationDigest) {
      throw new Error('customer_request_route_plan_head_integrity_failure')
    }
    return result
  },
})

export const getRoutePlanGeneration = internalQuery({
  args: { requestId: v.string(), generationRef: v.string() },
  returns: routePlanGenerationResult,
  handler: async (ctx, args): Promise<Infer<typeof routePlanGenerationResult>> => (
    await getRoutePlanGenerationMachine(
      args,
      customerRequestV2ReadPorts(ctx),
    ) as Infer<typeof routePlanGenerationResult>
  ),
})

export const getCurrentRoutePlanProjectionMaterial = internalQuery({
  args: { requestId: v.string() },
  returns: routePlanProjectionMaterialResult,
  handler: async (ctx, args) => {
    const current = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (current?.currentGenerationRef === undefined) return { kind: 'not_found' as const }
    const currentReadback = await readExactRoutePlanGeneration(
      ctx.db, args.requestId, current.currentGenerationRef,
    )
    if (currentReadback.kind !== 'found'
      || currentReadback.routeGeneration.generation !== current.currentGeneration
      || currentReadback.routeGeneration.generationDigest !== current.currentGenerationDigest) {
      throw new Error('customer_request_route_plan_projection_head_integrity_failure')
    }
    const previousRow = current.currentGeneration <= 1
      ? null
      : await ctx.db.query('customerRequestV2RoutePlanGenerations')
          .withIndex('by_requestId_and_generation', (query) => (
            query.eq('requestId', args.requestId).eq('generation', current.currentGeneration - 1)
          )).unique()
    if (current.currentGeneration > 1 && previousRow === null) {
      throw new Error('customer_request_route_plan_projection_history_integrity_failure')
    }
    const previous = previousRow?.routeGeneration
    if (previous !== undefined && !routePlanGenerationIsInternallyConsistent(
      domainRouteGeneration(previous), previous.generation - 1,
    )) throw new Error('customer_request_route_plan_projection_history_integrity_failure')

    const businessIds = uniqueSorted([
      ...currentReadback.routeGeneration.routes,
      ...(previous?.routes ?? []),
    ].flatMap((route) => route.steps.map(({ businessId }) => businessId)))
    if (businessIds.length > 512) {
      throw new Error('customer_request_route_plan_projection_business_limit_exceeded')
    }
    const businesses = []
    for (const businessId of businessIds) {
      const business = await ctx.db.get(businessId as Id<'businesses'>)
      if (business === null) throw new Error('customer_request_route_plan_projection_business_integrity_failure')
      businesses.push({ businessId, name: business.name })
    }
    const contractRefs = [...new Map([
      ...currentReadback.routeGeneration.routes,
      ...(previous?.routes ?? []),
    ].flatMap((route) => route.steps.map(({ contractRef }) => [
      `${contractRef.capabilityId}@${contractRef.version}:${contractRef.contractDigest}`,
      contractRef,
    ] as const))).values()]
    if (contractRefs.length > 512) {
      throw new Error('customer_request_route_plan_projection_capability_limit_exceeded')
    }
    const capabilities = []
    for (const ref of contractRefs) {
      const exact = await getExactRegisteredCapabilityContract(ctx.db, ref)
      if (exact.kind !== 'found') {
        throw new Error('customer_request_route_plan_projection_capability_integrity_failure')
      }
      capabilities.push({
        capabilityId: exact.contract.ref.capabilityId,
        version: exact.contract.ref.version,
        contractDigest: exact.contract.ref.contractDigest,
        name: exact.contract.name,
        description: exact.contract.description,
        resultLabels: exact.contract.customerAnnotations
          .filter(({ document, role }) => document === 'output'
            && (role === 'result' || role === 'completion_evidence'))
          .map(({ label }) => label),
      })
    }
    return {
      kind: 'found' as const,
      current: currentReadback.routeGeneration,
      ...(previous === undefined ? {} : { previous }),
      businesses,
      capabilities,
    }
  },
})

export const getCommandReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: commandReplayResult,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestV2Commands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (command === null) return { kind: 'not_found' as const }
    if (command.commandDigest !== args.commandDigest || command.principalId !== args.principalId
      || command.requestId !== args.requestId) return { kind: 'conflict' as const }
    const verified = await readVerifiedCommandReplay(ctx.db, command)
    return {
      kind: 'replayed' as const,
      aggregate: verified.aggregate,
      noEffect: command.noEffect === true,
      ...(command.resultingRouteGenerationRef === undefined
        ? {}
        : { routeGenerationRef: command.resultingRouteGenerationRef }),
    }
  },
})

export async function currentRoutePlanGenerationGraphStatus(
  db: QueryCtx['db'],
  requestId: string,
  generationRef: string,
  now = Date.now(),
): Promise<'current' | 'stale' | 'invalid'> {
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return 'invalid'
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', requestId).eq('requestRevision', head.currentRevision)
    )).unique()
  if (revision === null
    || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
    || !aggregateIsInternallyConsistent(
      domainAggregate(revision.aggregate),
      head.currentRevision - 1,
    )) return 'invalid'
  const generation = await readExactRoutePlanGeneration(db, requestId, generationRef)
  if (generation.kind !== 'found'
    || generation.routeGeneration.requestRevision !== head.currentRevision) return 'invalid'
  const currentSupply = await listRouteableCapabilitySupply(db, {
    networkId: revision.aggregate.snapshot.networkId,
    limit: 64,
    now,
  })
  if (currentSupply.kind !== 'available') return 'stale'
  const bindings = registeredEvaluationBindingsFromEligibleSupply(currentSupply)
  if (requestRegistrySnapshotDigest(bindings) !== generation.routeGeneration.registrySnapshotDigest) return 'invalid'
  const routesAreCurrent = generation.routeGeneration.routes.every((route) => (
    route.expiresAt > now
    && route.steps.every((step) => bindings.some((binding) => (
      binding.businessId === step.businessId
      && binding.offeringId === step.offeringId
      && binding.bindingId === step.bindingId
      && sameCapabilityContractRef(binding.contractRef, step.contractRef)
      && binding.offeringRegistrationHash === step.offeringRegistrationHash
      && binding.bindingRegistrationHash === step.bindingRegistrationHash
      && binding.publicationRef === step.publicationRef
      && binding.publicationRevision === step.publicationRevision
      && binding.readinessValidUntil !== undefined
      && binding.readinessValidUntil >= route.expiresAt
      && binding.price !== undefined
      && canonicalDigest(binding.price) === canonicalDigest(step.price)
      && step.commercialRelationship !== undefined
      && binding.commercialRelationship !== undefined
      && canonicalDigest(binding.commercialRelationship) === canonicalDigest(step.commercialRelationship)
      && step.cancellation !== undefined
      && canonicalDigest(binding.cancellation) === canonicalDigest(step.cancellation)
    )))
  ))
  return routesAreCurrent ? 'current' : 'stale'
}

type AvailableEligibleCapabilitySupply = Extract<
  Awaited<ReturnType<typeof listRouteableCapabilitySupply>>,
  { kind: 'available' }
>

function registeredEvaluationBindingsFromEligibleSupply(
  supply: AvailableEligibleCapabilitySupply,
): RegisteredEvaluationBinding[] {
  return supply.supplies.map(({ offering, binding, publication }) => ({
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
    commercialRelationship: {
      ...offering.presentation.commercialRelationship,
      evidenceRefs: [...offering.presentation.commercialRelationship.evidenceRefs],
    },
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    ...(publication === undefined ? {} : {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    }),
  }))
}

function domainRouteGeneration(value: RouteGeneration): CustomerRequestRoutePlanGeneration
function domainRouteGeneration(value: undefined): undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined {
  return value as CustomerRequestRoutePlanGeneration | undefined
}
