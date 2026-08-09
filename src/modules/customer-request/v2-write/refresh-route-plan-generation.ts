import {
  routePlanGenerationMatchesAggregate,
  routePlanGenerationMatchesRequest,
  routePlanGenerationMaterialDigest,
  routePlanGenerationOwnsCancellationPosture,
  routePlanGenerationOwnsDecisionSnapshot,
  type CustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'

import { aggregateIsInternallyConsistent } from './aggregate-consistency'
import type { CustomerRequestV2WritePorts } from './ports'
import type {
  GenerationRefreshResult,
  RefreshRoutePlanGenerationArgs,
} from './types'


export async function refreshRoutePlanGeneration(
  args: RefreshRoutePlanGenerationArgs,
  ports: CustomerRequestV2WritePorts,
): Promise<GenerationRefreshResult> {
  const prior = await ports.loadGenerationCommand(args.commandKey)
  if (prior !== null) {
    if (prior.commandDigest !== args.commandDigest
      || prior.principalId !== args.principalId
      || prior.requestId !== args.requestId
      || prior.expectedRequestRevision !== args.expectedRequestRevision
      || prior.expectedGeneration !== args.expectedGeneration
      || prior.expectedGenerationRef !== args.expectedGenerationRef
      || prior.expectedDecisionCommandKey !== args.expectedDecisionCommandKey) {
      return { kind: 'command_conflict' }
    }
    return await ports.readGenerationRefreshCommandResult(prior)
  }
  if (!Number.isSafeInteger(args.expectedRequestRevision) || args.expectedRequestRevision < 1
    || !Number.isSafeInteger(args.expectedGeneration) || args.expectedGeneration < 1
    || !aggregateIsInternallyConsistent(args.candidateAggregate, args.expectedRequestRevision - 1)
    || (args.candidateRouteGeneration !== undefined
      && (!routePlanGenerationOwnsDecisionSnapshot(args.candidateRouteGeneration)
        || !routePlanGenerationOwnsCancellationPosture(args.candidateRouteGeneration)))
    || !routePlanGenerationMatchesAggregate(
      args.candidateRouteGeneration,
      args.candidateAggregate,
      args.expectedGeneration,
    )) {
    return { kind: 'candidate_invalid' }
  }

  const requestHead = await ports.loadRequestHead(args.requestId)
  if (requestHead === null || requestHead.currentRevision !== args.expectedRequestRevision) {
    return { kind: 'request_conflict' }
  }
  if (requestHead.principalId !== args.principalId) return { kind: 'identity_conflict' }
  const revision = await ports.loadRevision(args.requestId, args.expectedRequestRevision)
  if (revision === null
    || revision.aggregate.aggregateDigest !== requestHead.currentAggregateDigest
    || !aggregateIsInternallyConsistent(revision.aggregate, args.expectedRequestRevision - 1)) {
    throw new Error('customer_request_v2_refresh_request_integrity_failure')
  }
  const routeHead = await ports.loadRoutePlanHead(args.requestId)
  if (routeHead?.currentGenerationRef === undefined
    || routeHead.currentGeneration !== args.expectedGeneration
    || routeHead.currentGenerationRef !== args.expectedGenerationRef
    || routeHead.currentDecisionCommandKey !== args.expectedDecisionCommandKey
    || routeHead.currentRequestRevision !== args.expectedRequestRevision) {
    return { kind: 'route_generation_conflict' }
  }
  const candidate = args.candidateAggregate
  if (candidate.snapshot.requestId !== revision.aggregate.snapshot.requestId
    || candidate.snapshot.revision !== revision.aggregate.snapshot.revision
    || candidate.snapshot.principalId !== revision.aggregate.snapshot.principalId
    || candidate.snapshot.delegatedAgentId !== revision.aggregate.snapshot.delegatedAgentId
    || candidate.snapshot.intent !== revision.aggregate.snapshot.intent
    || candidate.snapshot.networkId !== revision.aggregate.snapshot.networkId) {
    return { kind: 'candidate_invalid' }
  }
  const context = await ports.validateAggregateAgainstCurrentCapabilityGraph(
    candidate, args.candidateRouteGeneration,
  )
  if (context === 'stale') return { kind: 'context_stale' }
  if (context === 'invalid') return { kind: 'candidate_invalid' }
  const current = await ports.loadExactRoutePlanGeneration(args.requestId, args.expectedGenerationRef)
  if (current.kind !== 'found'
    || current.routeGeneration.generation !== args.expectedGeneration
    || !routePlanGenerationMatchesRequest(
      current.routeGeneration,
      revision.aggregate.snapshot,
      args.expectedGeneration - 1,
    )) {
    throw new Error('customer_request_v2_refresh_generation_integrity_failure')
  }

  let resultKind: 'unchanged' | 'superseded' | 'needs_information' | 'unsupported'
  let resultingGeneration: CustomerRequestRoutePlanGeneration | undefined
  if (args.candidateRouteGeneration === undefined) {
    resultKind = candidate.outcome === 'needs_information' ? 'needs_information' : 'unsupported'
  } else if (routePlanGenerationMaterialDigest(current.routeGeneration)
    === routePlanGenerationMaterialDigest(args.candidateRouteGeneration)) {
    resultKind = 'unchanged'
    resultingGeneration = current.routeGeneration
  } else {
    resultKind = 'superseded'
    resultingGeneration = args.candidateRouteGeneration
    const existing = await ports.loadGenerationByNumber(
      args.requestId, args.candidateRouteGeneration.generation,
    )
    if (existing !== null) return { kind: 'route_generation_conflict' }
    await ports.insertRoutePlanGeneration({
      requestId: args.requestId,
      generation: args.candidateRouteGeneration.generation,
      generationRef: args.candidateRouteGeneration.generationRef,
      generationDigest: args.candidateRouteGeneration.generationDigest,
      requestRevision: args.expectedRequestRevision,
      routeGeneration: args.candidateRouteGeneration,
      recordedAt: args.candidateRouteGeneration.createdAt,
    })
    await ports.patchRoutePlanHead(routeHead.id, {
      currentGeneration: args.candidateRouteGeneration.generation,
      currentGenerationRef: args.candidateRouteGeneration.generationRef,
      currentGenerationDigest: args.candidateRouteGeneration.generationDigest,
      currentDecisionCommandKey: null,
      currentDecisionCommandDigest: null,
      updatedAt: args.candidateRouteGeneration.createdAt,
    })
  }
  if (resultKind !== 'unchanged') {
    await ports.supersedeCurrentRouteMandate({
      requestId: args.requestId,
      nextRequestRevision: args.expectedRequestRevision,
      ...(resultingGeneration === undefined
        ? {}
        : { nextGenerationRef: resultingGeneration.generationRef }),
      reason: 'route_generation_superseded',
    })
  }
  await ports.insertGenerationCommand({
    commandKey: args.commandKey,
    commandDigest: args.commandDigest,
    principalId: args.principalId,
    requestId: args.requestId,
    expectedRequestRevision: args.expectedRequestRevision,
    expectedGeneration: args.expectedGeneration,
    expectedGenerationRef: args.expectedGenerationRef,
    ...(args.expectedDecisionCommandKey === undefined
      ? {}
      : { expectedDecisionCommandKey: args.expectedDecisionCommandKey }),
    resultKind,
    ...(resultingGeneration === undefined
      ? { resultAggregate: candidate }
      : {}),
    ...(resultingGeneration === undefined ? {} : {
      resultingGeneration: resultingGeneration.generation,
      resultingGenerationRef: resultingGeneration.generationRef,
      resultingGenerationDigest: resultingGeneration.generationDigest,
    }),
    committedAt: candidate.snapshot.recordedAt,
  })
  if (resultKind === 'needs_information' || resultKind === 'unsupported') {
    await ports.patchRoutePlanHead(routeHead.id, {
      currentDecisionCommandKey: args.commandKey,
      currentDecisionCommandDigest: args.commandDigest,
      updatedAt: candidate.snapshot.recordedAt,
    })
  } else if (resultKind === 'unchanged') {
    await ports.patchRoutePlanHead(routeHead.id, {
      currentDecisionCommandKey: null,
      currentDecisionCommandDigest: null,
      updatedAt: candidate.snapshot.recordedAt,
    })
  }
  if (resultKind === 'needs_information') return { kind: 'needs_information', aggregate: candidate }
  if (resultKind === 'unsupported') return { kind: 'unsupported', aggregate: candidate }
  if (resultKind === 'unchanged' && resultingGeneration !== undefined) {
    return { kind: 'unchanged', routeGeneration: resultingGeneration }
  }
  if (resultKind === 'superseded' && resultingGeneration !== undefined) {
    return { kind: 'superseded', routeGeneration: resultingGeneration }
  }
  throw new Error('customer_request_v2_refresh_result_integrity_failure')
}
