import {
  routePlanGenerationMatchesAggregate,
  routePlanGenerationOwnsCancellationPosture,
  routePlanGenerationOwnsDecisionSnapshot,
} from '@/modules/customer-request/route-plan-generation'

import { aggregateIsInternallyConsistent } from './aggregate-consistency'
import type { CustomerRequestV2WritePorts } from './ports'
import type { CommitAggregateArgs, CommitAggregateResult } from './types'

export async function commitAggregate(
  args: CommitAggregateArgs,
  ports: CustomerRequestV2WritePorts,
): Promise<CommitAggregateResult> {
  if (!aggregateIsInternallyConsistent(args.aggregate, args.expectedRevision)) {
    return { kind: 'aggregate_invalid' }
  }
  const candidateGeneration = args.routeGeneration
  if ((candidateGeneration !== undefined && !routePlanGenerationOwnsDecisionSnapshot(candidateGeneration))
    || !routePlanGenerationMatchesAggregate(
      candidateGeneration,
      args.aggregate,
      args.expectedRouteGeneration,
    )) {
    return { kind: 'aggregate_invalid' }
  }
  const snapshot = args.aggregate.snapshot
  const prior = await ports.loadCommitCommand(args.commandKey)
  if (prior !== null) {
    const matches = prior.commandDigest === args.commandDigest
      && prior.aggregateDigest === args.aggregate.aggregateDigest
      && prior.requestId === snapshot.requestId
      && prior.expectedRouteGeneration === args.expectedRouteGeneration
      && prior.resultingRouteGenerationRef === args.routeGeneration?.generationRef
    if (!matches) return { kind: 'command_conflict' }
    const verified = await ports.verifyCommitCommandReplay(prior)
    if (verified.kind !== 'current') throw new Error('customer_request_v2_command_integrity_failure')
    return { kind: 'replayed', requestId: prior.requestId, revision: prior.resultingRevision }
  }
  if (candidateGeneration !== undefined
    && !routePlanGenerationOwnsCancellationPosture(candidateGeneration)) {
    return { kind: 'aggregate_invalid' }
  }
  const context = await ports.validateAggregateAgainstCurrentCapabilityGraph(
    args.aggregate, args.routeGeneration,
  )
  if (context === 'stale') return { kind: 'context_stale' }
  if (context === 'invalid') return { kind: 'aggregate_invalid' }
  const head = await ports.loadRequestHead(snapshot.requestId)
  if ((head?.currentRevision ?? 0) !== args.expectedRevision) return { kind: 'revision_conflict' }
  if (head !== null && (head.principalId !== snapshot.principalId
    || head.delegatedAgentId !== snapshot.delegatedAgentId)) {
    return { kind: 'identity_conflict' }
  }
  const routeHead = await ports.loadRoutePlanHead(snapshot.requestId)
  if ((routeHead?.currentGeneration ?? 0) !== args.expectedRouteGeneration) {
    return { kind: 'route_generation_conflict' }
  }
  const existingRevision = await ports.loadRevision(snapshot.requestId, snapshot.revision)
  if (existingRevision !== null) return { kind: 'revision_conflict' }
  const existingGeneration = args.routeGeneration === undefined
    ? null
    : await ports.loadGenerationByNumber(snapshot.requestId, args.routeGeneration.generation)
  if (existingGeneration !== null) return { kind: 'route_generation_conflict' }

  await ports.supersedeCurrentRouteMandate({
    requestId: snapshot.requestId,
    nextRequestRevision: snapshot.revision,
    ...(args.routeGeneration === undefined
      ? {}
      : { nextGenerationRef: args.routeGeneration.generationRef }),
    reason: 'request_revised',
  })

  await ports.insertRevision({
    requestId: snapshot.requestId,
    requestRevision: snapshot.revision,
    aggregate: args.aggregate,
  })
  if (args.routeGeneration !== undefined) {
    await ports.insertRoutePlanGeneration({
      requestId: snapshot.requestId,
      generation: args.routeGeneration.generation,
      generationRef: args.routeGeneration.generationRef,
      generationDigest: args.routeGeneration.generationDigest,
      requestRevision: snapshot.revision,
      routeGeneration: args.routeGeneration,
      recordedAt: snapshot.recordedAt,
    })
    if (routeHead === null) {
      await ports.insertRoutePlanHead({
        requestId: snapshot.requestId,
        currentGeneration: args.routeGeneration.generation,
        currentRequestRevision: snapshot.revision,
        currentGenerationRef: args.routeGeneration.generationRef,
        currentGenerationDigest: args.routeGeneration.generationDigest,
        createdAt: snapshot.recordedAt,
        updatedAt: snapshot.recordedAt,
      })
    } else {
      await ports.patchRoutePlanHead(routeHead.id, {
        currentGeneration: args.routeGeneration.generation,
        currentRequestRevision: snapshot.revision,
        currentGenerationRef: args.routeGeneration.generationRef,
        currentGenerationDigest: args.routeGeneration.generationDigest,
        currentDecisionCommandKey: null,
        currentDecisionCommandDigest: null,
        updatedAt: snapshot.recordedAt,
      })
    }
  } else if (routeHead !== null) {
    await ports.patchRoutePlanHead(routeHead.id, {
      currentRequestRevision: snapshot.revision,
      currentGenerationRef: null,
      currentGenerationDigest: null,
      currentDecisionCommandKey: null,
      currentDecisionCommandDigest: null,
      updatedAt: snapshot.recordedAt,
    })
  }
  if (head === null) {
    await ports.insertRequestHead({
      requestId: snapshot.requestId,
      principalId: snapshot.principalId,
      delegatedAgentId: snapshot.delegatedAgentId,
      currentRevision: snapshot.revision,
      currentAggregateDigest: args.aggregate.aggregateDigest,
      createdAt: snapshot.recordedAt,
      updatedAt: snapshot.recordedAt,
    })
  } else {
    await ports.patchRequestHead({
      headId: head.id,
      currentRevision: snapshot.revision,
      currentAggregateDigest: args.aggregate.aggregateDigest,
      updatedAt: snapshot.recordedAt,
    })
  }
  await ports.insertCommitCommand({
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
  return { kind: 'stored', requestId: snapshot.requestId, revision: snapshot.revision }
}
