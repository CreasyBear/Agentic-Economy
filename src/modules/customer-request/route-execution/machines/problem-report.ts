import { canonicalDigest } from '@/modules/common/canonical-digest'

import { routeAttemptIntegrityValid } from '../journal/integrity'
import { decideCustomerProblemReport } from '../problem-support/commands'

import type {
  CustomerProblemReportArgs,
  ProblemMutationPorts,
} from './problem-ports'

export type ReportProblemResult = Exclude<
  ReturnType<typeof decideCustomerProblemReport>,
  { kind: 'append' }
> | Extract<ReturnType<typeof decideCustomerProblemReport>, { kind: 'append' }>['result']

export async function reportProblem(
  args: CustomerProblemReportArgs,
  ports: ProblemMutationPorts,
): Promise<ReportProblemResult> {
  const head = await ports.loadRunHeadForProblem(args.requestId, args.principalId)
  if (head === null
    || args.idempotencyKey.trim().length === 0
    || args.summary.trim().length === 0
    || args.summary.length > 1_000) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const commandKey = `route-problem:v1:${canonicalDigest({
    principalId: args.principalId,
    requestId: args.requestId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const prior = await ports.loadPriorProblemReport(commandKey)
  const now = ports.now()
  if (prior !== null) {
    const decision = decideCustomerProblemReport({ args, head, prior, now })
    if (decision.kind === 'reported' || decision.kind === 'replayed') {
      return decision
    }
    if (decision.kind === 'conflict' || decision.kind === 'refused') {
      return decision
    }
    throw new Error('customer_request_route_problem_integrity_failure')
  }
  const run = await ports.loadRunForProblem(head.currentRunRef, args.principalId)
  if (run === null) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  const affectedStep = args.affectedStep ?? run.currentPosition
  const attempt = await ports.loadAttemptAtPosition(head.currentRunRef, affectedStep)
  if (attempt === null || !routeAttemptIntegrityValid(attempt)) {
    return { kind: 'refused', reason: 'evidence_not_found' }
  }
  const decision = decideCustomerProblemReport({
    args, head, prior: null, run, attempt, now,
  })
  if (decision.kind === 'append') {
    await ports.commitProblemReport(decision.record)
    return decision.result
  }
  if (decision.kind === 'conflict' || decision.kind === 'refused') {
    return decision
  }
  throw new Error('customer_request_route_problem_integrity_failure')
}
