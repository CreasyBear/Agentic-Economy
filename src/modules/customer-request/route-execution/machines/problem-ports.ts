import type {
  BusinessClaimInsert,
  BusinessCausalityPosition,
  BusinessProblemClaimArgs,
  BusinessProblemClaimDecision,
  CustomerProblemReportArgs,
  CustomerProblemReportDecision,
  PriorBusinessClaim,
  PriorProblemReport,
  PriorProblemUpdate,
  ProblemReplyArgs,
  ProblemReportInsert,
  ProblemUpdateArgs,
  ProblemUpdateDecision,
  ProblemUpdateInsert,
  ProblemUpdateRow,
  ProblemVisibility,
} from '../problem-support/commands'
import type { AttemptEvidenceItem } from '../problem-support/evidence'
import type { RouteAttemptIntegritySnapshot } from '../journal/integrity'

export type ProblemRunHeadSnapshot = Readonly<{
  principalId: string
  currentRunRef: string
}>

export type ProblemRunSnapshot = Readonly<{
  principalId: string
  currentPosition: number
  totalSteps: number
  mandateRef: string
  businesses?: readonly Readonly<{ name: string }>[]
}>

export type ProblemAttemptSnapshot = RouteAttemptIntegritySnapshot & Readonly<{
  evidence?: readonly AttemptEvidenceItem[]
}>

export type ProblemReportOwnershipSnapshot = Readonly<{
  reportRef: string
  requestId: string
  principalId: string
}>

export type BusinessProblemAuthority =
  | Readonly<{
    kind: 'allowed'
    report: Readonly<{
      reportRef: string
      requestId: string
      step: number
      attemptRef: string
      visibility: ProblemVisibility
    }>
    attempt: ProblemAttemptSnapshot
    business: Readonly<{ id: string; name: string }>
    actorRef: string
  }>
  | Readonly<{
    kind: 'refused'
    reason:
      | 'authentication_required'
      | 'authority_denied'
      | 'report_not_found'
      | 'sharing_not_authorized'
  }>

export type SupportAuthority =
  | Readonly<{ kind: 'allowed'; actorRef: string }>
  | Readonly<{
    kind: 'refused'
    reason: 'authentication_required' | 'authority_denied'
  }>

export type ProblemMutationPorts = Readonly<{
  now: () => number

  loadRunHeadForProblem: (
    requestId: string,
    principalId: string,
  ) => Promise<ProblemRunHeadSnapshot | null>

  loadPriorProblemReport: (
    commandKey: string,
  ) => Promise<PriorProblemReport | null>

  loadRunForProblem: (
    runRef: string,
    principalId: string,
  ) => Promise<ProblemRunSnapshot | null>

  loadAttemptAtPosition: (
    runRef: string,
    position: number,
  ) => Promise<ProblemAttemptSnapshot | null>

  commitProblemReport: (record: ProblemReportInsert) => Promise<void>

  resolveBusinessProblemAuthority: (
    reportRef: string,
  ) => Promise<BusinessProblemAuthority>

  loadPriorBusinessClaim: (
    commandKey: string,
  ) => Promise<PriorBusinessClaim | null>

  commitBusinessClaim: (record: BusinessClaimInsert) => Promise<void>

  resolveSupportAnnotateAuthority: () => Promise<SupportAuthority>

  loadProblemReportRef: (
    reportRef: string,
  ) => Promise<ProblemReportOwnershipSnapshot | null>

  loadPriorProblemUpdate: (
    commandKey: string,
  ) => Promise<PriorProblemUpdate | null>

  loadProblemUpdateRows: (
    reportRef: string,
  ) => Promise<readonly ProblemUpdateRow[]>

  commitProblemUpdate: (record: ProblemUpdateInsert) => Promise<void>
}>

export type {
  BusinessProblemClaimArgs,
  BusinessProblemClaimDecision,
  CustomerProblemReportArgs,
  CustomerProblemReportDecision,
  ProblemReplyArgs,
  ProblemUpdateArgs,
  ProblemUpdateDecision,
  BusinessCausalityPosition,
}
