import { routePlanGenerationMatchesRequest } from '@/modules/customer-request/route-plan-generation'

import type { CustomerRequestV2WritePorts } from './ports'
import type {
  GenerationRefreshResult,
  RecordRoutePlanGenerationRetryArgs,
} from './types'

export async function recordRoutePlanGenerationRetry(
  args: RecordRoutePlanGenerationRetryArgs,
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
    || !Number.isSafeInteger(args.recordedAt) || args.recordedAt < 0) {
    return { kind: 'candidate_invalid' }
  }
  const requestHead = await ports.loadRequestHead(args.requestId)
  if (requestHead === null || requestHead.currentRevision !== args.expectedRequestRevision) {
    return { kind: 'request_conflict' }
  }
  if (requestHead.principalId !== args.principalId) return { kind: 'identity_conflict' }
  const routeHead = await ports.loadRoutePlanHead(args.requestId)
  if (routeHead?.currentGenerationRef === undefined
    || routeHead.currentGeneration !== args.expectedGeneration
    || routeHead.currentGenerationRef !== args.expectedGenerationRef
    || routeHead.currentDecisionCommandKey !== args.expectedDecisionCommandKey
    || routeHead.currentRequestRevision !== args.expectedRequestRevision) {
    return { kind: 'route_generation_conflict' }
  }
  const current = await ports.loadExactRoutePlanGeneration(args.requestId, args.expectedGenerationRef)
  if (current.kind !== 'found'
    || current.routeGeneration.generation !== args.expectedGeneration
    || !routePlanGenerationMatchesRequest(
      current.routeGeneration,
      { requestId: args.requestId, revision: args.expectedRequestRevision },
      args.expectedGeneration - 1,
    )) {
    throw new Error('customer_request_v2_refresh_generation_integrity_failure')
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
    resultKind: 'retryable',
    retryReason: args.reason,
    committedAt: args.recordedAt,
  })
  return { kind: 'retryable', reason: args.reason }
}
