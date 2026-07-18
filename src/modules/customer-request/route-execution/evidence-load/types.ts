import type {
  CustomerEvidenceExportAttemptSnapshot,
  CustomerEvidenceExportBindingSnapshot,
  CustomerEvidenceExportBusinessReportSnapshot,
  CustomerEvidenceExportProblemSnapshot,
  CustomerEvidenceExportProblemUpdateSnapshot,
  CustomerEvidenceExportRunSnapshot,
} from '../journal/export-evidence'

export type EvidenceLoadRunHead = Readonly<{
  currentRunRef: string
  principalId: string
}>

export type EvidenceLoadRun = CustomerEvidenceExportRunSnapshot & Readonly<{
  runRef: string
  principalId: string
}>

export type EvidenceLoadAttempt = CustomerEvidenceExportAttemptSnapshot & Readonly<{
  grant: CustomerEvidenceExportAttemptSnapshot['grant'] & Readonly<{
    step: CustomerEvidenceExportAttemptSnapshot['grant']['step'] & Readonly<{
      bindingId: string
    }>
  }>
}>

export type EvidenceLoadProblemReport = CustomerEvidenceExportProblemSnapshot & Readonly<{
  reportRef: string
  requestId: string
  createdAt: number
  category: CustomerEvidenceExportProblemSnapshot['category']
  summary: string
  businessName?: string
}>

export type EvidenceLoadBusinessReport = CustomerEvidenceExportBusinessReportSnapshot & Readonly<{
  statementRef: string
}>

export type EvidenceLoadPorts = Readonly<{
  getRunHeadByRequestId: (requestId: string) => Promise<EvidenceLoadRunHead | null>
  getRunByRunRef: (runRef: string) => Promise<EvidenceLoadRun | null>
  listAttemptsByRunRef: (runRef: string, take: number) => Promise<readonly EvidenceLoadAttempt[]>
  getBindingByBindingId: (
    bindingId: string,
  ) => Promise<CustomerEvidenceExportBindingSnapshot | null>
  listProblemsByRequestId: (
    requestId: string,
    take: number,
  ) => Promise<readonly CustomerEvidenceExportProblemSnapshot[]>
  listProblemReportsNewest: (limit: number) => Promise<readonly EvidenceLoadProblemReport[]>
  listProblemUpdatesByReportRef: (
    reportRef: string,
    take: number,
  ) => Promise<readonly CustomerEvidenceExportProblemUpdateSnapshot[]>
  listProblemBusinessReportsByReportRef: (
    reportRef: string,
    take: number,
  ) => Promise<readonly EvidenceLoadBusinessReport[]>
  now: () => number
}>
