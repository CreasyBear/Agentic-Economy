import { canonicalDigest } from '@/modules/common/canonical-digest'

import { decideCustomerProblemReply } from '../problem-support'

import type {
  ProblemMutationPorts,
  ProblemReplyArgs,
} from './problem-ports'

export type ReplyProblemResult =
  | Exclude<ReturnType<typeof decideCustomerProblemReply>, { kind: 'append' }>
  | Extract<ReturnType<typeof decideCustomerProblemReply>, { kind: 'append' }>['result']
  | Readonly<{ kind: 'refused'; reason: 'report_not_found' }>

export async function replyProblem(
  args: ProblemReplyArgs,
  ports: ProblemMutationPorts,
): Promise<ReplyProblemResult> {
  const report = await ports.loadProblemReportRef(args.reportRef)
  if (report === null
    || report.requestId !== args.requestId
    || report.principalId !== args.principalId) {
    return { kind: 'refused', reason: 'report_not_found' }
  }
  const commandKey = `route-problem-reply:v1:${canonicalDigest({
    reportRef: args.reportRef,
    principalId: args.principalId,
    idempotencyKey: args.idempotencyKey,
  })}`
  const prior = await ports.loadPriorProblemUpdate(commandKey)
  if (prior !== null) {
    const decision = decideCustomerProblemReply({
      args,
      updates: [],
      prior,
      now: ports.now(),
    })
    if (decision.kind === 'append') {
      throw new Error('customer_request_route_problem_update_integrity_failure')
    }
    return decision
  }
  const updates = await ports.loadProblemUpdateRows(args.reportRef)
  const decision = decideCustomerProblemReply({
    args,
    updates,
    prior: null,
    now: ports.now(),
  })
  if (decision.kind === 'append') {
    await ports.commitProblemUpdate(decision.record)
    return decision.result
  }
  return decision
}
