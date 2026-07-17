import { projectCustomerRequestProblemTracking } from '@/modules/customer-request/problem-tracking'

import type {
  ProblemAffected,
  ProblemCategory,
  ProblemLabeledEvidence,
  ProblemVisibility,
  ReplyRouteProblemResult,
  ReportRouteProblemResult,
  UpdateRouteProblemStatusResult,
} from './types'

export function projectProblemReported(input: Readonly<{
  requestRef: string
  category: ProblemCategory
  reportRef: string
  reportedAt: number
  visibility: ProblemVisibility
  evidence: readonly ProblemLabeledEvidence[]
  affected: ProblemAffected
}>): Extract<ReportRouteProblemResult, { kind: 'problem_reported' }> {
  const tracking = projectCustomerRequestProblemTracking(input.reportedAt, input.reportedAt)
  return {
    kind: 'problem_reported' as const,
    requestRef: input.requestRef,
    reportRef: input.reportRef,
    state: 'received' as const,
    reportedAt: input.reportedAt,
    problem: {
      category: input.category,
      claimSource: 'customer' as const,
      causality: 'unknown' as const,
      resolution: 'not_adjudicated' as const,
      nextAction: 'await_status_update' as const,
      nextActor: 'ae' as const,
      nextUpdateDueAt: tracking.nextUpdateDueAt ?? input.reportedAt,
      decisionAuthority: tracking.decisionAuthority,
      visibility: input.visibility,
      evidence: input.evidence.map((item) => ({ ...item })),
      affected: { ...input.affected },
    },
  }
}

export function projectProblemStatusChange(
  kind: 'problem_status_updated' | 'problem_reply_recorded',
  input: Readonly<{
    reportRef: string
    version: number
    state: 'investigating' | 'waiting_for_customer' | 'closed'
    recordedAt: number
  }>,
): Extract<UpdateRouteProblemStatusResult | ReplyRouteProblemResult, {
  kind: 'problem_status_updated' | 'problem_reply_recorded'
}> {
  const tracking = projectCustomerRequestProblemTracking(
    input.recordedAt,
    input.recordedAt,
    { state: input.state, recordedAt: input.recordedAt },
  )
  if (tracking.nextAction === 'check_status') {
    throw new Error('problem_status_projection_integrity_failure')
  }
  return {
    kind,
    reportRef: input.reportRef,
    version: input.version,
    state: input.state,
    nextAction: tracking.nextAction,
    nextActor: tracking.nextActor,
    ...(tracking.nextUpdateDueAt === undefined ? {} : { nextUpdateDueAt: tracking.nextUpdateDueAt }),
    decisionAuthority: tracking.decisionAuthority,
    recordedAt: input.recordedAt,
  }
}
