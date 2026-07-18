import type { CustomerEvidenceExportProblemUpdateSnapshot } from '../journal/export-evidence'

import type { EvidenceLoadBusinessReport, EvidenceLoadPorts } from './types'

export function assertProblemUpdatesIntegrity(
  updates: readonly Readonly<{ version: number }>[],
): void {
  if (updates.length > 100 || updates.some((update, index) => update.version !== index + 1)) {
    throw new Error('customer_request_route_problem_update_integrity_failure')
  }
}

export function assertProblemBusinessReportsIntegrity(
  reports: readonly unknown[],
): void {
  if (reports.length > 100) {
    throw new Error('customer_request_route_problem_business_report_integrity_failure')
  }
}

export async function loadProblemUpdates(
  ports: Pick<EvidenceLoadPorts, 'listProblemUpdatesByReportRef'>,
  reportRef: string,
): Promise<readonly CustomerEvidenceExportProblemUpdateSnapshot[]> {
  const updates = await ports.listProblemUpdatesByReportRef(reportRef, 101)
  assertProblemUpdatesIntegrity(updates)
  return updates
}

export async function loadProblemBusinessReports(
  ports: Pick<EvidenceLoadPorts, 'listProblemBusinessReportsByReportRef'>,
  reportRef: string,
): Promise<readonly EvidenceLoadBusinessReport[]> {
  const reports = await ports.listProblemBusinessReportsByReportRef(reportRef, 101)
  assertProblemBusinessReportsIntegrity(reports)
  return reports
}
