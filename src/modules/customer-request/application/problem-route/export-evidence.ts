import { parseCustomerRouteResult } from '../route-plan-projection'
import type {
  ExportRouteEvidenceInput,
  ExportRouteEvidenceResult,
  ProblemRoutePorts,
} from './types'

export async function exportRouteEvidence(
  input: ExportRouteEvidenceInput,
  ports: ProblemRoutePorts,
): Promise<ExportRouteEvidenceResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind !== 'current' || current.aggregate.snapshot.principalId !== input.principalId) {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  const exported = await ports.exportCustomerEvidence({
    requestId: input.requestRef,
    principalId: input.principalId,
  })
  if (exported.kind === 'none') {
    return { kind: 'refused' as const, reason: 'request_not_found' as const }
  }
  const result = exported.resultJson === undefined
    ? undefined
    : parseCustomerRouteResult(exported.resultJson)
  return {
    kind: 'evidence' as const,
    requestRef: input.requestRef,
    state: exported.state,
    generatedAt: exported.generatedAt,
    steps: exported.steps.map((step) => ({
      ...step,
      evidence: step.evidence.map((item) => ({ ...item })),
    })),
    problems: exported.problems.map((problem) => ({
      ...problem,
      affected: { ...problem.affected },
      evidence: problem.evidence.map((item) => ({ ...item })),
      claims: problem.claims.map((claim) => ({
        ...claim,
        evidence: claim.evidence.map((item) => ({ ...item })),
      })),
      history: problem.history.map((item) => ({ ...item })),
    })),
    ...(result === undefined ? {} : { result }),
  }
}
