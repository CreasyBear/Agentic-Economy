import { projectProblemReported } from './project'
import type {
  ProblemRoutePorts,
  ReportRouteProblemInput,
  ReportRouteProblemResult,
} from './types'

export async function reportRouteProblem(
  input: ReportRouteProblemInput,
  ports: ProblemRoutePorts,
): Promise<ReportRouteProblemResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  const result = await ports.reportProblem({
    requestId: input.requestRef,
    idempotencyKey: input.idempotencyKey,
    category: input.category,
    summary: input.summary,
    principalId: input.principalId,
    ...(input.affectedStep === undefined ? {} : { affectedStep: input.affectedStep }),
    evidenceReceiptRefs: input.evidenceReceiptRefs,
    visibility: input.visibility,
  })
  if (result.kind === 'conflict') {
    return {
      kind: 'conflict' as const,
      requestRef: input.requestRef,
      reason: 'idempotency_key_reused' as const,
    }
  }
  if (result.kind === 'refused') {
    return {
      kind: 'refused' as const,
      reason: result.reason === 'evidence_not_found'
        ? 'evidence_not_found' as const
        : 'request_not_found' as const,
    }
  }
  return projectProblemReported({
    requestRef: input.requestRef,
    category: input.category,
    reportRef: result.reportRef,
    reportedAt: result.reportedAt,
    visibility: result.visibility,
    evidence: result.evidence,
    affected: result.affected,
  })
}
