import { canonicalDigest } from '@/modules/common/canonical-digest'

import { decideBusinessProblemClaim } from '../problem-support'

import type {
  BusinessProblemClaimArgs,
  ProblemMutationPorts,
} from './problem-ports'

export type RecordProblemBusinessReportResult =
  | Exclude<ReturnType<typeof decideBusinessProblemClaim>, { kind: 'append' }>
  | Extract<ReturnType<typeof decideBusinessProblemClaim>, { kind: 'append' }>['result']
  | Readonly<{
    kind: 'refused'
    reason:
      | 'authentication_required'
      | 'authority_denied'
      | 'report_not_found'
      | 'sharing_not_authorized'
  }>

export async function recordProblemBusinessReport(
  args: BusinessProblemClaimArgs,
  ports: ProblemMutationPorts,
): Promise<RecordProblemBusinessReportResult> {
  const authority = await ports.resolveBusinessProblemAuthority(args.reportRef)
  if (authority.kind === 'refused') {
    return authority
  }
  const commandKey = `route-problem-business-report:v1:${canonicalDigest({
    reportRef: args.reportRef,
    businessId: authority.business.id,
    idempotencyKey: args.idempotencyKey,
  })}`
  const prior = await ports.loadPriorBusinessClaim(commandKey)
  const decision = decideBusinessProblemClaim({
    args,
    report: authority.report,
    attempt: authority.attempt,
    business: authority.business,
    actorRef: authority.actorRef,
    prior,
    now: ports.now(),
  })
  if (decision.kind === 'append') {
    await ports.commitBusinessClaim(decision.record)
    return decision.result
  }
  if (decision.kind === 'recorded' || decision.kind === 'replayed') {
    return decision
  }
  if (decision.kind === 'conflict' || decision.kind === 'refused') {
    return decision
  }
  throw new Error('customer_request_route_problem_business_report_integrity_failure')
}
