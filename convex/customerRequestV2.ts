import { v, type Infer } from 'convex/values'

import {
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RegisteredEvaluationBinding,
} from '@/modules/customer-request/evaluation'
import {
  customerRequestV2AggregateValue,
  routePlanGenerationV2Value,
} from '@/modules/customer-request/runtime'
import {
  compileRoutePlans, composeRequestActions, CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import { deriveCustomerDecisionPreference } from '@/modules/customer-request/semantic-interpreter'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationMatchesRequest,
  routePlanGenerationMatchesAggregate,
  routePlanGenerationMaterialDigest,
  routePlanGenerationOwnsCancellationPosture,
  routePlanGenerationOwnsDecisionSnapshot,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'

import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { listEligibleCapabilitySupply } from './capabilitySupply'
import {
  getActiveExactCapabilityContract,
  getExactRegisteredCapabilityContract,
} from './capabilityContractDocuments'
import { supersedeCurrentRouteMandate } from './customerRequestRouteMandateLifecycle'

type Aggregate = Infer<typeof customerRequestV2AggregateValue>
type RouteGeneration = Infer<typeof routePlanGenerationV2Value>
const MAX_AGGREGATE_BYTES = 700_000

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

const currentAggregateResult = v.union(
  v.object({
    kind: v.literal('current'), aggregate: customerRequestV2AggregateValue,
    routeGenerationNumber: v.number(),
    routeGenerationRef: v.optional(v.string()),
    currentDecisionCommandKey: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('needs_attention'), requestId: v.string(),
    reason: v.literal('historical_request_resubmit_required'), resumable: v.literal(false),
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
    kind: v.literal('needs_attention'), requestId: v.string(),
    reason: v.literal('historical_request_resubmit_required'), resumable: v.literal(false),
  }),
  v.object({
    kind: v.literal('replayed'), aggregate: customerRequestV2AggregateValue,
    routeGenerationRef: v.optional(v.string()),
  }),
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

export const commitAggregate = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), expectedRevision: v.number(),
    expectedRouteGeneration: v.number(), aggregate: customerRequestV2AggregateValue,
    routeGeneration: v.optional(routePlanGenerationV2Value),
  },
  returns: commitResult,
  handler: async (ctx, args) => {
    if (!aggregateIsInternallyConsistent(args.aggregate, args.expectedRevision)) {
      return { kind: 'aggregate_invalid' as const }
    }
    const candidateGeneration = domainRouteGeneration(args.routeGeneration)
    if ((candidateGeneration !== undefined && !routePlanGenerationOwnsDecisionSnapshot(candidateGeneration))
      || !routePlanGenerationMatchesAggregate(
      candidateGeneration,
      domainAggregate(args.aggregate),
      args.expectedRouteGeneration,
    )) {
      return { kind: 'aggregate_invalid' as const }
    }
    const snapshot = args.aggregate.snapshot
    const prior = await ctx.db.query('customerRequestV2Commands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (prior !== null) {
      const matches = prior.commandDigest === args.commandDigest
        && prior.aggregateDigest === args.aggregate.aggregateDigest
        && prior.requestId === snapshot.requestId
        && prior.expectedRouteGeneration === args.expectedRouteGeneration
        && prior.resultingRouteGenerationRef === args.routeGeneration?.generationRef
      if (!matches) return { kind: 'command_conflict' as const }
      const verified = await readVerifiedCommandReplay(ctx.db, prior)
      if (verified.kind !== 'current') throw new Error('customer_request_v2_command_integrity_failure')
      return { kind: 'replayed' as const, requestId: prior.requestId, revision: prior.resultingRevision }
    }
    if (candidateGeneration !== undefined
      && !routePlanGenerationOwnsCancellationPosture(candidateGeneration)) {
      return { kind: 'aggregate_invalid' as const }
    }
    const context = await validateAggregateAgainstCurrentCapabilityGraph(ctx.db, args.aggregate, args.routeGeneration)
    if (context === 'stale') return { kind: 'context_stale' as const }
    if (context === 'invalid') return { kind: 'aggregate_invalid' as const }
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', snapshot.requestId)).unique()
    if ((head?.currentRevision ?? 0) !== args.expectedRevision) return { kind: 'revision_conflict' as const }
    if (head !== null && (head.principalId !== snapshot.principalId
      || head.delegatedAgentId !== snapshot.delegatedAgentId)) return { kind: 'identity_conflict' as const }
    const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', snapshot.requestId)).unique()
    if ((routeHead?.currentGeneration ?? 0) !== args.expectedRouteGeneration) {
      return { kind: 'route_generation_conflict' as const }
    }
    const existingRevision = await ctx.db.query('customerRequestV2Revisions')
      .withIndex('by_requestId_and_requestRevision', (query) => (
        query.eq('requestId', snapshot.requestId).eq('requestRevision', snapshot.revision)
      )).unique()
    if (existingRevision !== null) return { kind: 'revision_conflict' as const }
    const existingGeneration = args.routeGeneration === undefined ? null
      : await ctx.db.query('customerRequestV2RoutePlanGenerations')
          .withIndex('by_requestId_and_generation', (query) => (
            query.eq('requestId', snapshot.requestId).eq('generation', args.routeGeneration!.generation)
          )).unique()
    if (existingGeneration !== null) return { kind: 'route_generation_conflict' as const }

    await supersedeCurrentRouteMandate(ctx.db, {
      requestId: snapshot.requestId,
      nextRequestRevision: snapshot.revision,
      ...(args.routeGeneration === undefined
        ? {}
        : { nextGenerationRef: args.routeGeneration.generationRef }),
      reason: 'request_revised',
      recordedAt: snapshot.recordedAt,
    })

    await ctx.db.insert('customerRequestV2Revisions', {
      requestId: snapshot.requestId, requestRevision: snapshot.revision, aggregate: writableAggregate(args.aggregate),
    })
    if (args.routeGeneration !== undefined) {
      await ctx.db.insert('customerRequestV2RoutePlanGenerations', {
        requestId: snapshot.requestId,
        generation: args.routeGeneration.generation,
        generationRef: args.routeGeneration.generationRef,
        generationDigest: args.routeGeneration.generationDigest,
        requestRevision: snapshot.revision,
        routeGeneration: writableRouteGeneration(args.routeGeneration),
        recordedAt: snapshot.recordedAt,
      })
      if (routeHead === null) {
        await ctx.db.insert('customerRequestV2RoutePlanHeads', {
          requestId: snapshot.requestId,
          currentGeneration: args.routeGeneration.generation,
          currentRequestRevision: snapshot.revision,
          currentGenerationRef: args.routeGeneration.generationRef,
          currentGenerationDigest: args.routeGeneration.generationDigest,
          createdAt: snapshot.recordedAt,
          updatedAt: snapshot.recordedAt,
        })
      } else {
        await ctx.db.patch(routeHead._id, {
          currentGeneration: args.routeGeneration.generation,
          currentRequestRevision: snapshot.revision,
          currentGenerationRef: args.routeGeneration.generationRef,
          currentGenerationDigest: args.routeGeneration.generationDigest,
          currentDecisionCommandKey: undefined,
          currentDecisionCommandDigest: undefined,
          updatedAt: snapshot.recordedAt,
        })
      }
    } else if (routeHead !== null) {
      await ctx.db.patch(routeHead._id, {
        currentRequestRevision: snapshot.revision,
        currentGenerationRef: undefined,
        currentGenerationDigest: undefined,
        currentDecisionCommandKey: undefined,
        currentDecisionCommandDigest: undefined,
        updatedAt: snapshot.recordedAt,
      })
    }
    if (head === null) {
      await ctx.db.insert('customerRequestV2Heads', {
        requestId: snapshot.requestId,
        principalId: snapshot.principalId,
        delegatedAgentId: snapshot.delegatedAgentId,
        currentRevision: snapshot.revision,
        currentAggregateDigest: args.aggregate.aggregateDigest,
        createdAt: snapshot.recordedAt,
        updatedAt: snapshot.recordedAt,
      })
    } else {
      await ctx.db.patch(head._id, {
        currentRevision: snapshot.revision,
        currentAggregateDigest: args.aggregate.aggregateDigest,
        updatedAt: snapshot.recordedAt,
      })
    }
    await ctx.db.insert('customerRequestV2Commands', {
      commandKey: args.commandKey,
      commandDigest: args.commandDigest,
      principalId: snapshot.principalId,
      requestId: snapshot.requestId,
      expectedRevision: args.expectedRevision,
      resultingRevision: snapshot.revision,
      aggregateDigest: args.aggregate.aggregateDigest,
      expectedRouteGeneration: args.expectedRouteGeneration,
      ...(args.routeGeneration === undefined
        ? {}
        : { resultingRouteGenerationRef: args.routeGeneration.generationRef }),
      committedAt: snapshot.recordedAt,
    })
    return { kind: 'stored' as const, requestId: snapshot.requestId, revision: snapshot.revision }
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
  handler: async (ctx, args) => {
    const prior = await ctx.db.query('customerRequestV2RoutePlanGenerationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (prior !== null) {
      if (prior.commandDigest !== args.commandDigest
        || prior.principalId !== args.principalId
        || prior.requestId !== args.requestId
        || prior.expectedRequestRevision !== args.expectedRequestRevision
        || prior.expectedGeneration !== args.expectedGeneration
        || prior.expectedGenerationRef !== args.expectedGenerationRef
        || prior.expectedDecisionCommandKey !== args.expectedDecisionCommandKey) {
        return { kind: 'command_conflict' as const }
      }
      return await readGenerationRefreshCommandResult(ctx.db, prior)
    }
    if (!Number.isSafeInteger(args.expectedRequestRevision) || args.expectedRequestRevision < 1
      || !Number.isSafeInteger(args.expectedGeneration) || args.expectedGeneration < 1
      || !aggregateIsInternallyConsistent(args.candidateAggregate, args.expectedRequestRevision - 1)
      || (args.candidateRouteGeneration !== undefined
        && (!routePlanGenerationOwnsDecisionSnapshot(domainRouteGeneration(args.candidateRouteGeneration))
          || !routePlanGenerationOwnsCancellationPosture(domainRouteGeneration(args.candidateRouteGeneration))))
      || !routePlanGenerationMatchesAggregate(
        domainRouteGeneration(args.candidateRouteGeneration),
        domainAggregate(args.candidateAggregate),
        args.expectedGeneration,
      )) return { kind: 'candidate_invalid' as const }

    const requestHead = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (requestHead === null || requestHead.currentRevision !== args.expectedRequestRevision) {
      return { kind: 'request_conflict' as const }
    }
    if (requestHead.principalId !== args.principalId) return { kind: 'identity_conflict' as const }
    const revision = await ctx.db.query('customerRequestV2Revisions')
      .withIndex('by_requestId_and_requestRevision', (query) => (
        query.eq('requestId', args.requestId).eq('requestRevision', args.expectedRequestRevision)
      )).unique()
    if (revision === null || 'routes' in revision.aggregate.plan
      || revision.aggregate.aggregateDigest !== requestHead.currentAggregateDigest
      || !aggregateIsInternallyConsistent(revision.aggregate, args.expectedRequestRevision - 1)) {
      throw new Error('customer_request_v2_refresh_request_integrity_failure')
    }
    const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (routeHead?.currentGenerationRef === undefined
      || routeHead.currentGeneration !== args.expectedGeneration
      || routeHead.currentGenerationRef !== args.expectedGenerationRef
      || routeHead.currentDecisionCommandKey !== args.expectedDecisionCommandKey
      || routeHead.currentRequestRevision !== args.expectedRequestRevision) {
      return { kind: 'route_generation_conflict' as const }
    }
    const candidate = args.candidateAggregate
    if (candidate.snapshot.requestId !== revision.aggregate.snapshot.requestId
      || candidate.snapshot.revision !== revision.aggregate.snapshot.revision
      || candidate.snapshot.principalId !== revision.aggregate.snapshot.principalId
      || candidate.snapshot.delegatedAgentId !== revision.aggregate.snapshot.delegatedAgentId
      || candidate.snapshot.intent !== revision.aggregate.snapshot.intent
      || candidate.snapshot.networkId !== revision.aggregate.snapshot.networkId) {
      return { kind: 'candidate_invalid' as const }
    }
    const context = await validateAggregateAgainstCurrentCapabilityGraph(
      ctx.db, candidate, args.candidateRouteGeneration,
    )
    if (context === 'stale') return { kind: 'context_stale' as const }
    if (context === 'invalid') return { kind: 'candidate_invalid' as const }

    const current = await readExactRoutePlanGeneration(ctx.db, args.requestId, args.expectedGenerationRef)
    if (current.kind !== 'found'
      || current.routeGeneration.generation !== args.expectedGeneration
      || !routePlanGenerationMatchesRequest(
        domainRouteGeneration(current.routeGeneration),
        revision.aggregate.snapshot,
        args.expectedGeneration - 1,
      )) throw new Error('customer_request_v2_refresh_generation_integrity_failure')

    let resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported'
    let resultingGeneration: RouteGeneration | undefined
    if (args.candidateRouteGeneration === undefined) {
      resultKind = candidate.outcome === 'needs_information' ? 'needs_information' : 'unsupported'
    } else if (routePlanGenerationMaterialDigest(domainRouteGeneration(current.routeGeneration))
      === routePlanGenerationMaterialDigest(domainRouteGeneration(args.candidateRouteGeneration))) {
      resultKind = 'unchanged'
      resultingGeneration = current.routeGeneration
    } else {
      resultKind = 'superseded'
      resultingGeneration = args.candidateRouteGeneration
      const existing = await ctx.db.query('customerRequestV2RoutePlanGenerations')
        .withIndex('by_requestId_and_generation', (query) => (
          query.eq('requestId', args.requestId).eq('generation', args.candidateRouteGeneration!.generation)
        )).unique()
      if (existing !== null) return { kind: 'route_generation_conflict' as const }
      await ctx.db.insert('customerRequestV2RoutePlanGenerations', {
        requestId: args.requestId,
        generation: args.candidateRouteGeneration.generation,
        generationRef: args.candidateRouteGeneration.generationRef,
        generationDigest: args.candidateRouteGeneration.generationDigest,
        requestRevision: args.expectedRequestRevision,
        routeGeneration: writableRouteGeneration(args.candidateRouteGeneration),
        recordedAt: args.candidateRouteGeneration.createdAt,
      })
      await ctx.db.patch(routeHead._id, {
        currentGeneration: args.candidateRouteGeneration.generation,
        currentGenerationRef: args.candidateRouteGeneration.generationRef,
        currentGenerationDigest: args.candidateRouteGeneration.generationDigest,
        currentDecisionCommandKey: undefined,
        currentDecisionCommandDigest: undefined,
        updatedAt: args.candidateRouteGeneration.createdAt,
      })
    }
    if (resultKind !== 'unchanged') {
      await supersedeCurrentRouteMandate(ctx.db, {
        requestId: args.requestId,
        nextRequestRevision: args.expectedRequestRevision,
        ...(resultingGeneration === undefined
          ? {}
          : { nextGenerationRef: resultingGeneration.generationRef }),
        reason: 'route_generation_superseded',
        recordedAt: candidate.snapshot.recordedAt,
      })
    }
    await ctx.db.insert('customerRequestV2RoutePlanGenerationCommands', {
      commandKey: args.commandKey, commandDigest: args.commandDigest,
      principalId: args.principalId, requestId: args.requestId,
      expectedRequestRevision: args.expectedRequestRevision,
      expectedGeneration: args.expectedGeneration, expectedGenerationRef: args.expectedGenerationRef,
      ...(args.expectedDecisionCommandKey === undefined
        ? {}
        : { expectedDecisionCommandKey: args.expectedDecisionCommandKey }),
      resultKind,
      ...(resultingGeneration === undefined
        ? { resultAggregate: writableAggregate(candidate) }
        : {}),
      ...(resultingGeneration === undefined ? {} : {
        resultingGeneration: resultingGeneration.generation,
        resultingGenerationRef: resultingGeneration.generationRef,
        resultingGenerationDigest: resultingGeneration.generationDigest,
      }),
      committedAt: candidate.snapshot.recordedAt,
    })
    if (resultKind === 'needs_information' || resultKind === 'unsupported') {
      await ctx.db.patch(routeHead._id, {
        currentDecisionCommandKey: args.commandKey,
        currentDecisionCommandDigest: args.commandDigest,
        updatedAt: candidate.snapshot.recordedAt,
      })
    } else if (resultKind === 'unchanged') {
      await ctx.db.patch(routeHead._id, {
        currentDecisionCommandKey: undefined,
        currentDecisionCommandDigest: undefined,
        updatedAt: candidate.snapshot.recordedAt,
      })
    }
    if (resultKind === 'needs_information') return { kind: 'needs_information' as const, aggregate: candidate }
    if (resultKind === 'unsupported') return { kind: 'unsupported' as const, aggregate: candidate }
    if (resultKind === 'unchanged' && resultingGeneration !== undefined) {
      return { kind: 'unchanged' as const, routeGeneration: resultingGeneration }
    }
    if (resultKind === 'superseded' && resultingGeneration !== undefined) {
      return { kind: 'superseded' as const, routeGeneration: resultingGeneration }
    }
    throw new Error('customer_request_v2_refresh_result_integrity_failure')
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
  handler: async (ctx, args) => {
    const prior = await ctx.db.query('customerRequestV2RoutePlanGenerationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (prior !== null) {
      if (prior.commandDigest !== args.commandDigest
        || prior.principalId !== args.principalId
        || prior.requestId !== args.requestId
        || prior.expectedRequestRevision !== args.expectedRequestRevision
        || prior.expectedGeneration !== args.expectedGeneration
        || prior.expectedGenerationRef !== args.expectedGenerationRef
        || prior.expectedDecisionCommandKey !== args.expectedDecisionCommandKey) {
        return { kind: 'command_conflict' as const }
      }
      return await readGenerationRefreshCommandResult(ctx.db, prior)
    }
    if (!Number.isSafeInteger(args.expectedRequestRevision) || args.expectedRequestRevision < 1
      || !Number.isSafeInteger(args.expectedGeneration) || args.expectedGeneration < 1
      || !Number.isSafeInteger(args.recordedAt) || args.recordedAt < 0) {
      return { kind: 'candidate_invalid' as const }
    }
    const requestHead = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (requestHead === null || requestHead.currentRevision !== args.expectedRequestRevision) {
      return { kind: 'request_conflict' as const }
    }
    if (requestHead.principalId !== args.principalId) return { kind: 'identity_conflict' as const }
    const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (routeHead?.currentGenerationRef === undefined
      || routeHead.currentGeneration !== args.expectedGeneration
      || routeHead.currentGenerationRef !== args.expectedGenerationRef
      || routeHead.currentDecisionCommandKey !== args.expectedDecisionCommandKey
      || routeHead.currentRequestRevision !== args.expectedRequestRevision) {
      return { kind: 'route_generation_conflict' as const }
    }
    const current = await readExactRoutePlanGeneration(ctx.db, args.requestId, args.expectedGenerationRef)
    if (current.kind !== 'found'
      || current.routeGeneration.generation !== args.expectedGeneration
      || !routePlanGenerationMatchesRequest(
        domainRouteGeneration(current.routeGeneration),
        { requestId: args.requestId, revision: args.expectedRequestRevision },
        args.expectedGeneration - 1,
      )) throw new Error('customer_request_v2_refresh_generation_integrity_failure')
    await ctx.db.insert('customerRequestV2RoutePlanGenerationCommands', {
      commandKey: args.commandKey, commandDigest: args.commandDigest,
      principalId: args.principalId, requestId: args.requestId,
      expectedRequestRevision: args.expectedRequestRevision,
      expectedGeneration: args.expectedGeneration, expectedGenerationRef: args.expectedGenerationRef,
      ...(args.expectedDecisionCommandKey === undefined
        ? {}
        : { expectedDecisionCommandKey: args.expectedDecisionCommandKey }),
      resultKind: 'retryable', retryReason: args.reason, committedAt: args.recordedAt,
    })
    return { kind: 'retryable' as const, reason: args.reason }
  },
})

export const getRoutePlanGenerationRefreshReplay = internalQuery({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
  },
  returns: generationRefreshReplayResult,
  handler: async (ctx, args) => {
    const command = await ctx.db.query('customerRequestV2RoutePlanGenerationCommands')
      .withIndex('by_commandKey', (query) => query.eq('commandKey', args.commandKey)).unique()
    if (command === null) return { kind: 'not_found' as const }
    if (command.commandDigest !== args.commandDigest || command.principalId !== args.principalId
      || command.requestId !== args.requestId) return { kind: 'command_conflict' as const }
    return await readGenerationRefreshCommandResult(ctx.db, command)
  },
})

export const getCurrentAggregate = internalQuery({
  args: { requestId: v.string() },
  returns: currentAggregateResult,
  handler: async (ctx, args) => {
    const head = await ctx.db.query('customerRequestV2Heads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    if (head !== null) {
      const revision = await ctx.db.query('customerRequestV2Revisions')
        .withIndex('by_requestId_and_requestRevision', (query) => (
          query.eq('requestId', args.requestId).eq('requestRevision', head.currentRevision)
        )).unique()
      if (revision !== null && 'routes' in revision.aggregate.plan) {
        if (revision.aggregate.aggregateDigest !== head.currentAggregateDigest
          || !legacyAggregateIsInternallyConsistent(revision.aggregate)) {
          throw new Error('customer_request_v2_legacy_aggregate_integrity_failure')
        }
        return {
          kind: 'needs_attention' as const,
          requestId: args.requestId,
          reason: 'historical_request_resubmit_required' as const,
          resumable: false as const,
        }
      }
      if (revision === null || revision.aggregate.aggregateDigest !== head.currentAggregateDigest
        || !aggregateIsInternallyConsistent(revision.aggregate, head.currentRevision - 1)) {
        throw new Error('customer_request_v2_aggregate_integrity_failure')
      }
      const routeHead = await ctx.db.query('customerRequestV2RoutePlanHeads')
        .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
      if (routeHead !== null && routeHead.currentRequestRevision !== head.currentRevision) {
        throw new Error('customer_request_route_plan_head_integrity_failure')
      }
      if (routeHead !== null && (!Number.isSafeInteger(routeHead.currentGeneration)
        || routeHead.currentGeneration < 1
        || (routeHead.currentGenerationRef === undefined)
          !== (routeHead.currentGenerationDigest === undefined)
        || (routeHead.currentDecisionCommandKey === undefined)
          !== (routeHead.currentDecisionCommandDigest === undefined))) {
        throw new Error('customer_request_route_plan_head_integrity_failure')
      }
      const hasCurrentGeneration = routeHead?.currentGenerationRef !== undefined
      if (routeHead?.currentDecisionCommandKey === undefined
        && (revision.aggregate.outcome === 'plan_ready') !== hasCurrentGeneration) {
        throw new Error('customer_request_route_plan_head_integrity_failure')
      }
      if (routeHead?.currentGenerationRef !== undefined) {
        const currentGeneration = await readExactRoutePlanGeneration(
          ctx.db,
          args.requestId,
          routeHead.currentGenerationRef,
        )
        if (currentGeneration.kind !== 'found'
          || currentGeneration.routeGeneration.generation !== routeHead.currentGeneration
          || currentGeneration.routeGeneration.generationDigest !== routeHead.currentGenerationDigest
          || !routePlanGenerationMatchesRequest(
            domainRouteGeneration(currentGeneration.routeGeneration),
            revision.aggregate.snapshot,
            routeHead.currentGeneration - 1,
          )) {
          throw new Error('customer_request_route_plan_head_integrity_failure')
        }
      }
      const currentDecision = routeHead?.currentDecisionCommandKey === undefined
        ? undefined
        : await readCurrentDecisionAggregate(ctx.db, routeHead, head.principalId)
      return {
        kind: 'current' as const,
        aggregate: currentDecision?.aggregate ?? revision.aggregate,
        routeGenerationNumber: routeHead?.currentGeneration ?? 0,
        ...(routeHead?.currentGenerationRef === undefined
          ? {}
          : { routeGenerationRef: routeHead.currentGenerationRef }),
        ...(currentDecision === undefined
          ? {}
          : { currentDecisionCommandKey: currentDecision.commandKey }),
      }
    }
    const historicalSnapshot = await ctx.db.query('customerRequestHeads')
      .withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
    const historicalRequest = historicalSnapshot === null
      ? await ctx.db.query('customerRequests').withIndex('by_requestId', (query) => query.eq('requestId', args.requestId)).unique()
      : null
    return historicalSnapshot !== null || historicalRequest !== null
      ? {
          kind: 'needs_attention' as const,
          requestId: args.requestId,
          reason: 'historical_request_resubmit_required' as const,
          resumable: false as const,
        }
      : { kind: 'not_found' as const }
  },
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
  handler: async (ctx, args) => await readExactRoutePlanGeneration(ctx.db, args.requestId, args.generationRef),
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

    const businessIds = [...new Set([
      ...currentReadback.routeGeneration.routes,
      ...(previous?.routes ?? []),
    ].flatMap((route) => route.steps.map(({ businessId }) => businessId)))].sort()
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
    if (verified.kind === 'legacy') {
      return {
        kind: 'needs_attention' as const,
        requestId: command.requestId,
        reason: 'historical_request_resubmit_required' as const,
        resumable: false as const,
      }
    }
    return {
      kind: 'replayed' as const,
      aggregate: verified.aggregate,
      ...(command.resultingRouteGenerationRef === undefined
        ? {}
        : { routeGenerationRef: command.resultingRouteGenerationRef }),
    }
  },
})

async function readVerifiedCommandReplay(
  db: QueryCtx['db'],
  command: Readonly<{
    requestId: string
    resultingRevision: number
    aggregateDigest: string
    expectedRouteGeneration?: number
    resultingRouteGenerationRef?: string
  }>,
): Promise<Readonly<{ kind: 'legacy' } | { kind: 'current'; aggregate: Aggregate }>> {
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', command.requestId).eq('requestRevision', command.resultingRevision)
    )).unique()
  if (revision === null) throw new Error('customer_request_v2_command_integrity_failure')
  if ('routes' in revision.aggregate.plan) {
    if (revision.aggregate.aggregateDigest !== command.aggregateDigest
      || !legacyAggregateIsInternallyConsistent(revision.aggregate)) {
      throw new Error('customer_request_v2_legacy_command_integrity_failure')
    }
    return { kind: 'legacy' }
  }
  if (revision.aggregate.aggregateDigest !== command.aggregateDigest
    || !aggregateIsInternallyConsistent(revision.aggregate, command.resultingRevision - 1)) {
    throw new Error('customer_request_v2_command_integrity_failure')
  }
  if ((revision.aggregate.outcome === 'plan_ready')
    !== (command.resultingRouteGenerationRef !== undefined)) {
    throw new Error('customer_request_v2_command_generation_integrity_failure')
  }
  if (command.resultingRouteGenerationRef !== undefined) {
    if (command.expectedRouteGeneration === undefined) {
      throw new Error('customer_request_v2_command_generation_integrity_failure')
    }
    const generation = await readExactRoutePlanGeneration(
      db, command.requestId, command.resultingRouteGenerationRef,
    )
    if (generation.kind !== 'found'
      || generation.routeGeneration.requestRevision !== command.resultingRevision
      || !routePlanGenerationMatchesAggregate(
        domainRouteGeneration(generation.routeGeneration),
        domainAggregate(revision.aggregate),
        command.expectedRouteGeneration,
      )) {
      throw new Error('customer_request_v2_command_generation_integrity_failure')
    }
  }
  return { kind: 'current', aggregate: revision.aggregate }
}

async function readGenerationRefreshCommandResult(
  db: QueryCtx['db'],
  command: Readonly<{
    requestId: string
    resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported' | 'retryable'
    retryReason?: 'current_supply_unavailable' | 'interpreter_unavailable' | 'interpretation_unusable' | 'context_changed'
    resultAggregate?: Aggregate
    resultingGeneration?: number
    resultingGenerationRef?: string
    resultingGenerationDigest?: string
  }>,
) {
  if (command.resultKind === 'retryable') {
    if (command.retryReason === undefined || command.resultingGeneration !== undefined
      || command.resultingGenerationRef !== undefined || command.resultingGenerationDigest !== undefined
      || command.resultAggregate !== undefined) {
      throw new Error('customer_request_v2_refresh_command_integrity_failure')
    }
    return { kind: 'retryable' as const, reason: command.retryReason }
  }
  if (command.resultKind === 'needs_information' || command.resultKind === 'unsupported') {
    if (command.retryReason !== undefined || command.resultingGeneration !== undefined || command.resultingGenerationRef !== undefined
      || command.resultingGenerationDigest !== undefined || command.resultAggregate === undefined
      || command.resultAggregate.outcome !== command.resultKind
      || !aggregateIsInternallyConsistent(
        command.resultAggregate, command.resultAggregate.snapshot.revision - 1,
      )) {
      throw new Error('customer_request_v2_refresh_command_integrity_failure')
    }
    return { kind: command.resultKind, aggregate: command.resultAggregate }
  }
  if (command.retryReason !== undefined || command.resultingGeneration === undefined || command.resultingGenerationRef === undefined
    || command.resultingGenerationDigest === undefined || command.resultAggregate !== undefined) {
    throw new Error('customer_request_v2_refresh_command_integrity_failure')
  }
  const generation = await readExactRoutePlanGeneration(db, command.requestId, command.resultingGenerationRef)
  if (generation.kind !== 'found'
    || generation.routeGeneration.generation !== command.resultingGeneration
    || generation.routeGeneration.generationDigest !== command.resultingGenerationDigest) {
    throw new Error('customer_request_v2_refresh_command_integrity_failure')
  }
  return { kind: command.resultKind, routeGeneration: generation.routeGeneration }
}

async function readCurrentDecisionAggregate(
  db: QueryCtx['db'],
  head: Readonly<{
    requestId: string
    currentRequestRevision: number
    currentGeneration: number
    currentGenerationRef?: string
    currentDecisionCommandKey?: string
    currentDecisionCommandDigest?: string
  }>,
  principalId: string,
): Promise<Readonly<{ commandKey: string; aggregate: Aggregate }>> {
  const commandKey = head.currentDecisionCommandKey
  const commandDigest = head.currentDecisionCommandDigest
  if (commandKey === undefined
    || commandDigest === undefined
    || head.currentGenerationRef === undefined) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  const command = await db.query('customerRequestV2RoutePlanGenerationCommands')
    .withIndex('by_commandKey', (query) => query.eq('commandKey', commandKey)).unique()
  if (command === null
    || command.commandDigest !== commandDigest
    || command.principalId !== principalId
    || command.requestId !== head.requestId
    || command.expectedRequestRevision !== head.currentRequestRevision
    || command.expectedGeneration !== head.currentGeneration
    || command.expectedGenerationRef !== head.currentGenerationRef
    || (command.resultKind !== 'needs_information' && command.resultKind !== 'unsupported')) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  const result = await readGenerationRefreshCommandResult(db, command)
  if (result.kind !== 'needs_information' && result.kind !== 'unsupported') {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  if (result.aggregate.snapshot.requestId !== head.requestId
    || result.aggregate.snapshot.revision !== head.currentRequestRevision
    || result.aggregate.snapshot.principalId !== principalId) {
    throw new Error('customer_request_v2_current_decision_integrity_failure')
  }
  return { commandKey: command.commandKey, aggregate: result.aggregate }
}

export function aggregateIsInternallyConsistent(aggregate: Aggregate, expectedRevision: number): boolean {
  const { aggregateDigest: _aggregateDigest, ...material } = aggregate
  const outcomeIsConsistent = aggregate.evaluation.posture === 'unsupported'
    ? aggregate.outcome === 'unsupported'
    : aggregate.evaluation.posture === 'needs_information'
      ? aggregate.outcome === 'needs_information'
      : aggregate.outcome === 'plan_ready' || aggregate.outcome === 'unsupported'
  return aggregate.aggregateVersion === 2
    && aggregateByteLengthWithinLimit(aggregate)
    && aggregate.snapshot.revision === expectedRevision + 1
    && aggregate.evaluation.requestId === aggregate.snapshot.requestId
    && aggregate.evaluation.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.requestId === aggregate.snapshot.requestId
    && aggregate.plan.requestRevision === aggregate.snapshot.revision
    && aggregate.plan.registrySnapshotDigest === aggregate.evaluation.registrySnapshotDigest
    && outcomeIsConsistent
    && aggregate.snapshot.facts.length <= 128
    && aggregate.evaluation.facts.length <= 128
    && aggregate.plan.actions.length <= 64
    && aggregate.evaluation.candidates.length <= 256
    && aggregate.snapshot.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.facts.every(({ value }) => isBoundedJsonValue(value))
    && aggregate.evaluation.criteria.every(({ value }) => isBoundedJsonValue(value))
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue) === aggregate.evaluation.factsDigest
    && canonicalDigest(aggregate.snapshot.facts as StableHashValue) === canonicalDigest(aggregate.evaluation.facts as StableHashValue)
    && canonicalDigest({
      requestId: aggregate.snapshot.requestId,
      revision: aggregate.snapshot.revision,
      principalId: aggregate.snapshot.principalId,
      delegatedAgentId: aggregate.snapshot.delegatedAgentId,
      intent: aggregate.snapshot.intent,
      networkId: aggregate.snapshot.networkId,
      facts: aggregate.snapshot.facts,
    } as StableHashValue) === aggregate.snapshot.snapshotDigest
    && planAuthorityIsConsistent(aggregate)
    && completionAuthorityIsConsistent(aggregate)
    && canonicalDigest(material as StableHashValue) === aggregate.aggregateDigest
}

function legacyAggregateIsInternallyConsistent(aggregate: Aggregate): boolean {
  if (!('routes' in aggregate.plan)) return false
  const { planRevisionId, planDigest, createdAt: _createdAt, ...planMaterial } = aggregate.plan
  const { aggregateDigest, ...aggregateMaterial } = aggregate
  return planDigest === canonicalDigest(planMaterial as StableHashValue)
    && planRevisionId === `plan:${planDigest}`
    && aggregateDigest === canonicalDigest(aggregateMaterial as StableHashValue)
}

async function readExactRoutePlanGeneration(
  db: QueryCtx['db'],
  requestId: string,
  generationRef: string,
) {
  const row = await db.query('customerRequestV2RoutePlanGenerations')
    .withIndex('by_requestId_and_generationRef', (query) => (
      query.eq('requestId', requestId).eq('generationRef', generationRef)
    )).unique()
  if (row === null) return { kind: 'not_found' as const }
  if (row.requestId !== row.routeGeneration.requestId
    || row.requestRevision !== row.routeGeneration.requestRevision
    || row.generation !== row.routeGeneration.generation
    || row.generationRef !== row.routeGeneration.generationRef
    || row.generationDigest !== row.routeGeneration.generationDigest
    || !routePlanGenerationIsInternallyConsistent(
      domainRouteGeneration(row.routeGeneration),
      row.generation - 1,
    )) throw new Error('customer_request_route_plan_generation_integrity_failure')
  return { kind: 'found' as const, routeGeneration: row.routeGeneration }
}

export async function currentRoutePlanGenerationGraphStatus(
  db: QueryCtx['db'],
  requestId: string,
  generationRef: string,
): Promise<'current' | 'stale' | 'invalid'> {
  const head = await db.query('customerRequestV2Heads')
    .withIndex('by_requestId', (query) => query.eq('requestId', requestId)).unique()
  if (head === null) return 'invalid'
  const revision = await db.query('customerRequestV2Revisions')
    .withIndex('by_requestId_and_requestRevision', (query) => (
      query.eq('requestId', requestId).eq('requestRevision', head.currentRevision)
    )).unique()
  if (revision === null || 'routes' in revision.aggregate.plan) return 'invalid'
  const generation = await readExactRoutePlanGeneration(db, requestId, generationRef)
  if (generation.kind !== 'found'
    || generation.routeGeneration.requestRevision !== head.currentRevision) return 'invalid'
  const currentSupply = await listEligibleCapabilitySupply(db, {
    networkId: revision.aggregate.snapshot.networkId,
    limit: 64,
  })
  if (currentSupply.kind !== 'available') return 'stale'
  const bindings: RegisteredEvaluationBinding[] = currentSupply.supplies.map(({ offering, binding, publication }) => ({
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
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    ...(publication === undefined ? {} : {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    }),
  }))
  if (requestRegistrySnapshotDigest(bindings) !== generation.routeGeneration.registrySnapshotDigest) return 'invalid'
  const routesAreCurrent = generation.routeGeneration.routes.every((route) => (
    route.expiresAt > Date.now()
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
      && step.cancellation !== undefined
      && canonicalDigest(binding.cancellation) === canonicalDigest(step.cancellation)
    )))
  ))
  return routesAreCurrent ? 'current' : 'stale'
}

function writableRouteGeneration(generation: RouteGeneration): RouteGeneration {
  return structuredClone(generation)
}

function domainRouteGeneration(value: RouteGeneration): CustomerRequestRoutePlanGeneration
function domainRouteGeneration(value: undefined): undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined
function domainRouteGeneration(value: unknown): CustomerRequestRoutePlanGeneration | undefined {
  return value as CustomerRequestRoutePlanGeneration | undefined
}

function domainAggregate(value: unknown): CustomerRequestV2Aggregate {
  return value as CustomerRequestV2Aggregate
}

async function validateAggregateAgainstCurrentCapabilityGraph(
  db: Parameters<typeof listEligibleCapabilitySupply>[0], aggregate: Aggregate,
  routeGeneration: RouteGeneration | undefined,
): Promise<'current' | 'stale' | 'invalid'> {
  const currentSupply = await listEligibleCapabilitySupply(db, {
    networkId: aggregate.snapshot.networkId,
    limit: 64,
  })
  if (currentSupply.kind !== 'available') return 'stale'
  const bindings: RegisteredEvaluationBinding[] = currentSupply.supplies.map(({ offering, binding, publication }) => ({
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
    cancellation: { ...binding.cancellation, evidenceRefs: [...binding.cancellation.evidenceRefs] },
    ...(publication === undefined ? {} : {
      publicationRef: publication.publicationRef, publicationRevision: publication.revision,
      readinessValidUntil: publication.readinessValidUntil,
    }),
  }))
  if (requestRegistrySnapshotDigest(bindings) !== aggregate.evaluation.registrySnapshotDigest) return 'stale'
  const models = new Map<string, CapabilityDecisionModel>()
  for (const binding of bindings) {
    const key = exactRefKey(binding.contractRef)
    if (models.has(key)) continue
    const stored = await getActiveExactCapabilityContract(db, binding.contractRef)
    if (stored.kind !== 'found') return 'stale'
    let model: CapabilityDecisionModel
    try {
      model = openCapabilityDecisionModel(encodeCapabilityContractDocumentJson(stored.documentJson).contract)
    } catch {
      return 'stale'
    }
    if (!sameCapabilityContractRef(model.contractRef, binding.contractRef)) return 'stale'
    models.set(key, model)
  }
  const facts = rebindAggregateFacts(aggregate.snapshot.facts, models)
  if (facts === undefined) return 'invalid'
  const resolveModel = (ref: Aggregate['plan']['actions'][number]['contractRef']) => models.get(exactRefKey(ref))
  const baseActions = [...aggregate.plan.actions].sort((left, right) => left.selectionKey.localeCompare(right.selectionKey)).flatMap((action, ordinal) => {
    const model = resolveModel(action.contractRef)
    if (model === undefined || model.selectionKey !== action.selectionKey || model.semanticDigest !== action.semanticDigest) return []
    const actionMaterial = {
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      ordinal,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
    }
    return [{
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      dependsOn: [],
      inputs: facts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef)),
      inputMappings: [],
    }]
  })
  const actions = composeRequestActions(baseActions, models)
  if (actions === undefined) return 'invalid'
  if (actions.length !== aggregate.plan.actions.length
    || canonicalDigest(actions as StableHashValue) !== canonicalDigest(aggregate.plan.actions as StableHashValue)) return 'invalid'
  const evaluation = aggregate.plan.actions.length === 0 && aggregate.evaluation.nextRequirement?.kind === 'intent_direction'
    ? evaluateIntentDirectionRequestSnapshot({
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        intent: aggregate.snapshot.intent,
        facts,
        registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
        prompt: aggregate.evaluation.nextRequirement.prompt,
      })
    : evaluateCustomerRequestSnapshot({
        requestId: aggregate.snapshot.requestId,
        requestRevision: aggregate.snapshot.revision,
        intent: aggregate.snapshot.intent,
        facts,
        registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
        ...(() => {
          const preference = deriveCustomerDecisionPreference(aggregate.snapshot.intent)
          return preference === undefined ? {} : { decisionPreference: preference }
        })(),
        candidates: discoverRequestEvaluationCandidates({
          selectedCapabilities: actions.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
          bindings,
          resolveModel,
        }),
        proposedActions: actions,
        resolveModel,
      })
  if (evaluation.candidates.some((candidate) => candidate.viability.kind === 'incompatible')) return 'invalid'
  if (canonicalDigest(evaluation as StableHashValue) !== canonicalDigest(aggregate.evaluation as StableHashValue)) return 'invalid'
  const routes = compileRoutePlans({
    requestId: aggregate.snapshot.requestId, requestRevision: aggregate.snapshot.revision,
    registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
    actions, candidates: evaluation.candidates, now: aggregate.snapshot.recordedAt,
    models,
    ...(evaluation.decisionPreference === undefined ? {} : { objective: evaluation.decisionPreference.objective }),
  })
  const unknownCostFailsClosed = routeGeneration === undefined
    && aggregate.outcome === 'unsupported'
    && routes !== undefined
    && routes.length > 0
    && routes.some((route) => route.maximumTotalCost.kind !== 'known')
  return routes !== undefined
    && (unknownCostFailsClosed
      || canonicalDigest(routes as StableHashValue) === canonicalDigest(routeGeneration?.routes ?? [] as StableHashValue))
    ? 'current' : 'invalid'
}

function rebindAggregateFacts(
  storedFacts: Aggregate['snapshot']['facts'], models: ReadonlyMap<string, CapabilityDecisionModel>,
) {
  const facts = storedFacts.flatMap((fact) => {
    const model = models.get(exactRefKey(fact.contractRef))
    const input = model?.inputs.find((candidate) => candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer && candidate.schemaIdentity === fact.schemaIdentity)
    if (model === undefined || input === undefined || model.selectionKey !== fact.selectionKey
      || !isBoundedJsonValue(fact.value)) return []
    return [{
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      inputKey: input.key,
      inputPointer: input.inputPointer,
      schemaIdentity: input.schemaIdentity,
      value: fact.value,
      source: fact.source,
    }]
  })
  return facts.length === storedFacts.length ? facts : undefined
}

function planAuthorityIsConsistent(aggregate: Aggregate): boolean {
  const ordinals = new Map([...aggregate.plan.actions].sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
    .map((action, ordinal) => [action.actionId, ordinal]))
  const expectedActions = aggregate.plan.actions.map((action) => {
    const ordinal = ordinals.get(action.actionId)
    if (ordinal === undefined) return undefined
    const actionMaterial = {
      requestId: aggregate.snapshot.requestId,
      requestRevision: aggregate.snapshot.revision,
      ordinal,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
    }
    const inputs = aggregate.snapshot.facts.filter((fact) => fact.selectionKey === action.selectionKey
      && sameCapabilityContractRef(fact.contractRef, action.contractRef))
    return {
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: action.contractRef,
      selectionKey: action.selectionKey,
      semanticDigest: action.semanticDigest,
      dependsOn: action.dependsOn,
      inputs,
      inputMappings: action.inputMappings,
    }
  })
  if (expectedActions.some((action) => action === undefined)) return false
  if (canonicalDigest(expectedActions as StableHashValue) !== canonicalDigest(aggregate.plan.actions as StableHashValue)) {
    return false
  }
  const proposalDigest = canonicalDigest({
    interpreterId: aggregate.plan.interpreterId,
    selected: [...aggregate.plan.actions]
      .sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
      .map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
    facts: aggregate.snapshot.facts,
  })
  const planMaterial = {
    requestId: aggregate.snapshot.requestId,
    requestRevision: aggregate.snapshot.revision,
    proposedByAgentId: aggregate.snapshot.delegatedAgentId,
    interpreterId: aggregate.plan.interpreterId,
    interpretationEvidence: aggregate.plan.interpretationEvidence,
    proposalDigest,
    registrySnapshotDigest: aggregate.evaluation.registrySnapshotDigest,
    actions: aggregate.plan.actions,
    completionRequirements: aggregate.evaluation.completionRequirements,
    compilerVersion: CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
    authority: 'proposal_only' as const,
  }
  const planDigest = canonicalDigest(planMaterial)
  return aggregate.plan.proposedByAgentId === aggregate.snapshot.delegatedAgentId
    && aggregate.plan.proposalDigest === proposalDigest
    && aggregate.plan.compilerVersion === CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION
    && aggregate.plan.authority === 'proposal_only'
    && aggregate.plan.planDigest === planDigest
    && aggregate.plan.planRevisionId === `plan:${planDigest}`
    && aggregate.plan.createdAt === aggregate.snapshot.recordedAt
}

function completionAuthorityIsConsistent(aggregate: Aggregate): boolean {
  if (canonicalDigest(aggregate.plan.completionRequirements as StableHashValue)
    !== canonicalDigest(aggregate.evaluation.completionRequirements as StableHashValue)) return false
  return aggregate.plan.completionRequirements.every((requirement) => {
    const action = aggregate.plan.actions.find(({ actionId }) => actionId === requirement.actionId)
    return action !== undefined
      && canonicalDigest(action.contractRef) === canonicalDigest(requirement.contractRef)
  })
}

function aggregateByteLengthWithinLimit(aggregate: Aggregate): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(aggregate)).byteLength <= MAX_AGGREGATE_BYTES
  } catch {
    return false
  }
}

function exactRefKey(ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}

function writableAggregate(aggregate: Aggregate): Aggregate {
  return structuredClone(aggregate)
}
