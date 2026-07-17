import { projectProblemStatusChange } from './project'
import type {
  ProblemRoutePorts,
  ReplyRouteProblemInput,
  ReplyRouteProblemResult,
} from './types'

export async function replyRouteProblem(
  input: ReplyRouteProblemInput,
  ports: ProblemRoutePorts,
): Promise<ReplyRouteProblemResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const result = await ports.replyProblem({
    requestId: input.requestRef,
    reportRef: input.reportRef,
    principalId: input.principalId,
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    message: input.message,
  })
  if (result.kind === 'conflict') {
    return { kind: 'conflict', reportRef: input.reportRef, reason: result.reason }
  }
  if (result.kind === 'refused') return result
  return projectProblemStatusChange('problem_reply_recorded', {
    reportRef: result.reportRef,
    version: result.version,
    state: result.state,
    recordedAt: result.recordedAt,
  })
}
