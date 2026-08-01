import type {
  BusinessProblemViewResult,
  ExportRouteProblemForSupportInput,
  ListRouteProblemsForSupportInput,
  ProblemRoutePorts,
  ReadRouteProblemForBusinessInput,
  SupportProblemExportResult,
  SupportProblemListResult,
} from './types'

export { exportRouteEvidence } from './export-evidence'
export { projectProblemReported, projectProblemStatusChange } from './project'
export { recordRouteProblemBusinessReport } from './record-business'
export { replyRouteProblem } from './reply'
export { reportRouteProblem } from './report'
export { updateRouteProblemStatus } from './update-status'

export async function exportRouteProblemForSupport(
  input: ExportRouteProblemForSupportInput,
  ports: ProblemRoutePorts,
): Promise<SupportProblemExportResult> {
  return ports.exportProblemForSupport(input)
}

export async function listRouteProblemsForSupport(
  input: ListRouteProblemsForSupportInput,
  ports: ProblemRoutePorts,
): Promise<SupportProblemListResult> {
  return ports.listProblemsForSupport(input)
}

export async function readRouteProblemForBusiness(
  input: ReadRouteProblemForBusinessInput,
  ports: ProblemRoutePorts,
): Promise<BusinessProblemViewResult> {
  return ports.readProblemForBusiness(input)
}
export type {
  BusinessProblemReportResult,
  BusinessProblemViewResult,
  ExportRouteEvidenceInput,
  ExportRouteEvidenceResult,
  ExportRouteProblemForSupportInput,
  ListRouteProblemsForSupportInput,
  ProblemRoutePorts,
  ReadRouteProblemForBusinessInput,
  RecordRouteProblemBusinessReportInput,
  ReplyRouteProblemInput,
  ReplyRouteProblemResult,
  ReportRouteProblemInput,
  ReportRouteProblemResult,
  SupportProblemExportResult,
  SupportProblemListResult,
  UpdateRouteProblemStatusInput,
  UpdateRouteProblemStatusResult,
} from './types'
