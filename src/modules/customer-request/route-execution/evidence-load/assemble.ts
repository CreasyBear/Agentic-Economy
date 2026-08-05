import {
  projectCustomerEvidenceExport,
  type CustomerEvidenceExportFound,
} from '../journal/export-evidence'
import {
  projectSupportProblemList,
  type SupportProblemListRow,
} from '../problem-support/projections'

import { loadProblemBusinessReports, loadProblemUpdates } from './problem-rows'
import type { EvidenceLoadPorts } from './types'

export type AssembleCustomerEvidenceInput = Readonly<{
  requestId: string
  principalId: string
}>

export type AssembleCustomerEvidenceResult =
  | { kind: 'none' }
  | CustomerEvidenceExportFound

export async function assembleCustomerEvidenceExport(
  input: AssembleCustomerEvidenceInput,
  ports: EvidenceLoadPorts,
): Promise<AssembleCustomerEvidenceResult> {
  const head = await ports.getRunHeadByRequestId(input.requestId)
  if (head === null || head.principalId !== input.principalId) return { kind: 'none' as const }
  const run = await ports.getRunByRunRef(head.currentRunRef)
  if (run === null || run.principalId !== input.principalId) {
    throw new Error('customer_request_route_run_integrity_failure')
  }
  const [attempts, problems] = await Promise.all([
    ports.listAttemptsByRunRef(run.runRef, run.totalSteps + 1),
    ports.listProblemsByRequestId(input.requestId, 101),
  ])
  const bindings = await Promise.all(attempts.map(async (attempt) => (
    await ports.getBindingByBindingId(attempt.grant.step.bindingId)
  )))
  const [updatesByProblem, businessReportsByProblem] = await Promise.all([
    Promise.all(problems.map(async (problem) => loadProblemUpdates(ports, problem.reportRef))),
    Promise.all(problems.map(async (problem) => (
      loadProblemBusinessReports(ports, problem.reportRef)
    ))),
  ])
  return projectCustomerEvidenceExport({
    run,
    attempts,
    bindings,
    problems,
    updatesByProblem,
    businessReportsByProblem,
    principalId: input.principalId,
    generatedAt: ports.now(),
  })
}

export async function assembleSupportProblemList(
  input: Readonly<{ limit: number }>,
  ports: EvidenceLoadPorts,
): Promise<SupportProblemListRow[]> {
  const reports = await ports.listProblemReportsNewest(input.limit)
  const updatesByReport = await Promise.all(
    reports.map(async (problem) => loadProblemUpdates(ports, problem.reportRef)),
  )
  return projectSupportProblemList({
    reports,
    updatesByReport,
    observedAt: ports.now(),
  })
}
