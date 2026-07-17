import {
  compileCustomerRequest,
  writableCustomerRequestV2Aggregate,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'
import { writableCustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

import type { CustomerRequestActionResult } from '../action-result'
import { projectStoredAggregate } from '../route-plan-projection/project-aggregate'
import type { CommitResult, CommandReplayResult, CompileCommitInput } from './types'

export function durableSubmissionShellView(requestRef: string): CustomerRequestActionResult {
  return projectNeedsAttention({
    requestRef,
    revision: 0,
    summary: 'AE saved this Request but could not interpret it yet. Try again.',
  })
}

export function retryableCompileAdmissionFailure(
  result: CustomerRequestActionResult,
  expectedRevision: number,
): boolean {
  return result.kind === 'request'
    && result.revision === expectedRevision
    && result.state === 'needs_attention'
    && result.nextAction === 'retry'
}

export function compileProposal(input: CompileCommitInput) {
  return compileCustomerRequest({
    requestId: input.requestId,
    expectedRevision: input.expectedRevision,
    principalId: input.principalId,
    delegatedAgentId: input.delegatedAgentId,
    intent: input.intent,
    networkId: input.networkId,
    proposal: input.proposal,
    interpreterId: input.interpreterId,
    bindings: input.graph.bindings,
    models: input.graph.models,
    now: input.now,
    expectedRouteGeneration: input.expectedRouteGeneration,
    ...(input.priorFacts.length === 0 ? {} : { priorFacts: input.priorFacts }),
    ...(input.routeExclusions === undefined ? {} : { routeExclusions: input.routeExclusions }),
  })
}

export type CompileCommitPorts = Readonly<{
  replayCommittedCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    requestId: string
    principalId: string
  }>) => Promise<CustomerRequestActionResult | undefined>
  commitAggregate: (input: Readonly<{
    commandKey: string
    commandDigest: string
    expectedRevision: number
    expectedRouteGeneration: number
    aggregate: ReturnType<typeof writableCustomerRequestV2Aggregate>
    routeGeneration?: ReturnType<typeof writableCustomerRequestRoutePlanGeneration>
  }>) => Promise<CommitResult>
}>

export async function compileCommit(
  input: CompileCommitInput,
  ports: CompileCommitPorts,
): Promise<CustomerRequestActionResult> {
  const replay = await ports.replayCommittedCommand(input)
  if (replay !== undefined) return replay
  const compiled = input.compiledResult === undefined
    ? compileProposal(input)
    : input.compiledResult
  if (compiled.kind === 'refused') {
    return projectNeedsAttention({
      requestRef: input.requestId,
      revision: input.expectedRevision,
      summary: compiled.reason === 'capability_graph_invalid'
        ? 'The registered options changed. Try this request again.'
        : 'The request could not be interpreted safely.',
    })
  }
  const result = await ports.commitAggregate({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    expectedRevision: input.expectedRevision,
    expectedRouteGeneration: input.expectedRouteGeneration,
    aggregate: writableCustomerRequestV2Aggregate(compiled.aggregate),
    ...(compiled.routeGeneration === undefined
      ? {}
      : { routeGeneration: writableCustomerRequestRoutePlanGeneration(compiled.routeGeneration) }),
  })
  if (result.kind === 'revision_conflict' || result.kind === 'route_generation_conflict') {
    return { kind: 'conflict', requestRef: input.requestId, reason: 'revision_changed' }
  }
  if (result.kind === 'identity_conflict') {
    return { kind: 'conflict', requestRef: input.requestId, reason: 'identity_changed' }
  }
  if (result.kind === 'command_conflict') {
    return { kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused' }
  }
  if (result.kind === 'aggregate_invalid') {
    return projectNeedsAttention({
      requestRef: input.requestId, revision: input.expectedRevision,
      summary: 'The request changed before it could be recorded. Try again.',
    })
  }
  if (result.kind === 'context_stale') {
    return projectNeedsAttention({
      requestRef: input.requestId, revision: input.expectedRevision,
      summary: 'The registered options changed. Try this request again.',
    })
  }
  return projectStoredAggregate(compiled.aggregate, compiled.routeGeneration?.generationRef)
}

export type ReplayCommittedCommandPorts = Readonly<{
  getCommandReplay: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
  }>) => Promise<CommandReplayResult>
}>

export async function replayCommittedCommand(
  input: Readonly<{
    commandKey: string
    commandDigest: string
    requestId: string
    principalId: string
    noEffectReplay?: () => Promise<CustomerRequestActionResult>
  }>,
  ports: ReplayCommittedCommandPorts,
): Promise<CustomerRequestActionResult | undefined> {
  const replay = await ports.getCommandReplay({
    commandKey: input.commandKey,
    commandDigest: input.commandDigest,
    principalId: input.principalId,
    requestId: input.requestId,
  })
  if (replay.kind === 'not_found') return undefined
  if (replay.kind === 'conflict') {
    return { kind: 'conflict', requestRef: input.requestId, reason: 'idempotency_key_reused' }
  }
  if (replay.kind === 'needs_attention') {
    return projectNeedsAttention({
      requestRef: input.requestId,
      revision: 0,
      summary: 'This earlier request used a retired format. Start a new request to continue.',
    })
  }
  if (replay.noEffect && input.noEffectReplay !== undefined) return await input.noEffectReplay()
  return projectStoredAggregate(
    replay.aggregate as CustomerRequestV2Aggregate,
    replay.routeGenerationRef,
  )
}
