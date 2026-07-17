import type {
  BusinessProblemReportResult,
  ProblemRoutePorts,
  RecordRouteProblemBusinessReportInput,
} from './types'

export async function recordRouteProblemBusinessReport(
  input: RecordRouteProblemBusinessReportInput,
  ports: ProblemRoutePorts,
): Promise<BusinessProblemReportResult> {
  const result = await ports.recordProblemBusinessReport({
    reportRef: input.reportRef,
    idempotencyKey: input.idempotencyKey,
    causalityPosition: input.causalityPosition,
    statement: input.statement,
    evidenceReceiptRefs: input.evidenceReceiptRefs ?? [],
  })
  if (result.kind === 'conflict') {
    return { kind: 'conflict', reason: 'idempotency_key_reused' }
  }
  if (result.kind === 'refused') return result
  return {
    kind: 'business_report_recorded',
    statementRef: result.statementRef,
    reportRef: result.reportRef,
    business: result.business,
    claimSource: 'business',
    causalityPosition: result.causalityPosition,
    causality: 'unknown',
    resolution: 'not_adjudicated',
    decisionAuthority: 'not_assigned',
    statement: result.statement,
    evidence: result.evidence.map((item) => ({ ...item })),
    recordedAt: result.recordedAt,
  }
}
