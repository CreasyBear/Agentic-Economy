import {
  projectCustomerCriteria,
  projectNeedsAttention,
} from '@/modules/customer-request/customer-projection'

import type { CustomerRequestActionResult } from '../action-result'
import {
  interpreterFailureCode,
  proposeThenCompile,
  rebindStoredFacts,
} from '../interpret-compile'
import type { RequestGraph } from '../interpret-compile/types'
import { projectStoredAggregate } from '../route-plan-projection'
import { routeRefreshCommand } from './currency'
import type {
  CompareResumeAggregate,
  CompareResumePorts,
  CompareResumeRouteGeneration,
  GenerationRefreshReplayResult,
  RouteRefreshRetryReason,
  StoredAggregateResult,
} from './types'

type CurrentAggregate = Extract<StoredAggregateResult, { kind: 'current' }>

export async function refreshCurrentRouteGeneration(
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  caller: Readonly<{ principalId: string }>,
  current: CurrentAggregate,
  graph: RequestGraph,
  currentGeneration: CompareResumeRouteGeneration,
  ports: Pick<
    CompareResumePorts,
    | 'getRoutePlanGenerationRefreshReplay'
    | 'createInterpreter'
    | 'refreshRoutePlanGeneration'
    | 'recordRoutePlanGenerationRetry'
    | 'projectCurrentRoutePlans'
  >,
): Promise<CustomerRequestActionResult> {
  const { commandKey, commandDigest } = routeRefreshCommand(args, caller.principalId)
  const replay = await ports.getRoutePlanGenerationRefreshReplay({
    commandKey, commandDigest, principalId: caller.principalId, requestId: args.requestRef,
  })
  if (replay.kind !== 'not_found') {
    return await projectGenerationRefreshResult(current.aggregate, replay, ports)
  }

  const interpreter = ports.createInterpreter()
  if (interpreter === undefined) {
    return await persistRetryableRouteRefresh(
      args, caller, current, currentGeneration, 'interpreter_unavailable', ports,
    )
  }
  const priorFacts = rebindStoredFacts(current.aggregate.snapshot.facts as never, graph.models)
  const now = Date.now()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const step = await proposeThenCompile({
      intent: current.aggregate.snapshot.intent,
      priorFacts,
      graph,
      // A propose failure ends the refresh below, so this is always the interpreter's last ask.
      finalAttempt: true,
      compileBase: {
        commandKey,
        commandDigest,
        requestId: args.requestRef,
        expectedRevision: args.revision - 1,
        expectedRouteGeneration: currentGeneration.generation,
        principalId: caller.principalId,
        delegatedAgentId: current.aggregate.snapshot.delegatedAgentId,
        networkId: current.aggregate.snapshot.networkId,
        now,
      },
    }, interpreter)
    if (step.kind === 'propose_failed') {
      console.error('customer_request_route_refresh_interpretation_failed', interpreterFailureCode(step.error))
      return await persistRetryableRouteRefresh(
        args, caller, current, currentGeneration, 'interpreter_unavailable', ports,
      )
    }
    if (step.kind === 'refused') {
      if (step.reason === 'capability_graph_invalid') continue
      return await persistRetryableRouteRefresh(
        args, caller, current, currentGeneration, 'interpretation_unusable', ports,
      )
    }
    const result = await ports.refreshRoutePlanGeneration({
      commandKey, commandDigest, principalId: caller.principalId, requestId: args.requestRef,
      expectedRequestRevision: args.revision,
      expectedGeneration: currentGeneration.generation,
      expectedGenerationRef: currentGeneration.generationRef,
      ...(current.currentDecisionCommandKey === undefined
        ? {}
        : { expectedDecisionCommandKey: current.currentDecisionCommandKey }),
      candidateAggregate: step.preview.aggregate,
      ...(step.preview.routeGeneration === undefined ? {} : {
        candidateRouteGeneration: step.preview.routeGeneration,
      }),
    })
    return result.kind === 'context_stale'
      ? await persistRetryableRouteRefresh(
          args, caller, current, currentGeneration, 'context_changed', ports,
        )
      : await projectGenerationRefreshResult(current.aggregate, result, ports)
  }
  return await persistRetryableRouteRefresh(
    args, caller, current, currentGeneration, 'context_changed', ports,
  )
}

export async function persistRetryableRouteRefresh(
  args: Readonly<{ requestRef: string; revision: number; idempotencyKey: string }>,
  caller: Readonly<{ principalId: string }>,
  current: CurrentAggregate,
  currentGeneration: CompareResumeRouteGeneration,
  reason: RouteRefreshRetryReason,
  ports: Pick<
    CompareResumePorts,
    'recordRoutePlanGenerationRetry' | 'projectCurrentRoutePlans'
  >,
): Promise<CustomerRequestActionResult> {
  const result = await ports.recordRoutePlanGenerationRetry({
    ...routeRefreshCommand(args, caller.principalId),
    principalId: caller.principalId, requestId: args.requestRef,
    expectedRequestRevision: args.revision,
    expectedGeneration: currentGeneration.generation,
    expectedGenerationRef: currentGeneration.generationRef,
    ...(current.currentDecisionCommandKey === undefined
      ? {}
      : { expectedDecisionCommandKey: current.currentDecisionCommandKey }),
    reason, recordedAt: Date.now(),
  })
  return await projectGenerationRefreshResult(current.aggregate, result, ports)
}

export async function projectGenerationRefreshResult(
  current: CompareResumeAggregate,
  result: Exclude<GenerationRefreshReplayResult, { kind: 'not_found' }>,
  ports: Pick<CompareResumePorts, 'projectCurrentRoutePlans'>,
): Promise<CustomerRequestActionResult> {
  if (result.kind === 'command_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'idempotency_key_reused',
  }
  if (result.kind === 'request_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'revision_changed',
  }
  if (result.kind === 'route_generation_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'options_changed',
  }
  if (result.kind === 'identity_conflict') return {
    kind: 'conflict', requestRef: current.snapshot.requestId, reason: 'identity_changed',
  }
  if (result.kind === 'candidate_invalid' || result.kind === 'context_stale') {
    return projectNeedsAttention({
      requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
      summary: 'AE could not refresh the available options. Try again.',
    })
  }
  if (result.kind === 'retryable') return projectNeedsAttention({
    requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
    summary: 'AE could not refresh the available options. Try again.',
  })
  if (result.kind === 'needs_information' || result.kind === 'unsupported') {
    if (result.kind === 'needs_information') {
      return projectStoredAggregate(result.aggregate, undefined)
    }
    return {
      kind: 'request', requestRef: result.aggregate.snapshot.requestId,
      revision: result.aggregate.snapshot.revision, state: 'unsupported',
      summary: 'AE cannot arrange this request end to end yet.',
      nextAction: 'revise_request', missingFields: [],
      criteria: projectCustomerCriteria(result.aggregate.evaluation.criteria),
      options: [],
    }
  }
  if (result.kind !== 'unchanged' && result.kind !== 'superseded') {
    return projectNeedsAttention({
      requestRef: current.snapshot.requestId, revision: current.snapshot.revision,
      summary: 'AE could not refresh the available options. Try again.',
    })
  }
  return await ports.projectCurrentRoutePlans(current)
}
