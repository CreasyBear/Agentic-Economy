import { canonicalDigest } from '@/modules/common/canonical-digest'

import { decideSupportProblemStatus } from '../problem-support/commands'

import type {
  ProblemMutationPorts,
  ProblemUpdateArgs,
} from './problem-ports'

export type UpdateProblemStatusResult =
  | Exclude<ReturnType<typeof decideSupportProblemStatus>, { kind: 'append' }>
  | Extract<ReturnType<typeof decideSupportProblemStatus>, { kind: 'append' }>['result']
  | Readonly<{
    kind: 'refused'
    reason: 'authentication_required' | 'authority_denied' | 'report_not_found'
  }>

export async function updateProblemStatus(
  args: ProblemUpdateArgs,
  ports: ProblemMutationPorts,
): Promise<UpdateProblemStatusResult> {
  const authority = await ports.resolveSupportAnnotateAuthority()
  if (authority.kind === 'refused') {
    return authority
  }
  const report = await ports.loadProblemReportRef(args.reportRef)
  if (report === null) {
    return { kind: 'refused', reason: 'report_not_found' }
  }
  const commandKey = `route-problem-update:v1:${canonicalDigest({
    reportRef: args.reportRef,
    actorRef: authority.actorRef,
    idempotencyKey: args.idempotencyKey,
  })}`
  const prior = await ports.loadPriorProblemUpdate(commandKey)
  if (prior !== null) {
    const decision = decideSupportProblemStatus({
      args,
      actorRef: authority.actorRef,
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
  const decision = decideSupportProblemStatus({
    args,
    actorRef: authority.actorRef,
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
