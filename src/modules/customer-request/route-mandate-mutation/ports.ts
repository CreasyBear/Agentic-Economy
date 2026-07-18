import type { RouteMandate } from '@/modules/customer-request/route-mandate'

import type {
  AuthenticatedRequestResult,
  CommitCustomerRevocationInput,
  HistoryResult,
  IssueCommandRow,
  MandateHeadSnapshot,
  MandateIssueSnapshot,
  MandateRevocationSnapshot,
  OpenCurrentRouteGenerationResult,
  PersistIssueInput,
  PersistIssueResult,
  RevocationCommandRow,
  RevocationProjection,
  ServiceAuthorization,
} from './types'

export type RouteMandateMutationPorts = Readonly<{
  now: () => number

  authenticateOwnerForMutation: (
    requestId: string,
    serviceAuthorization?: ServiceAuthorization,
  ) => Promise<AuthenticatedRequestResult>

  authenticateOwner: (requestId: string) => Promise<AuthenticatedRequestResult>

  loadIssueCommand: (commandKey: string) => Promise<IssueCommandRow | null>

  verifyIssueCommandReplay: (command: IssueCommandRow) => Promise<RouteMandate>

  openCurrentRouteGeneration: (
    requestId: string,
  ) => Promise<OpenCurrentRouteGenerationResult>

  routePlanGenerationGraphStatus: (
    requestId: string,
    generationRef: string,
  ) => Promise<'current' | 'stale' | 'invalid'>

  loadMandateHead: (requestId: string) => Promise<MandateHeadSnapshot | null>

  loadIssueByMandateRef: (mandateRef: string) => Promise<MandateIssueSnapshot | null>

  loadRevocationByMandateRef: (
    mandateRef: string,
  ) => Promise<MandateRevocationSnapshot | null>

  assertReplacementIntegrity: (
    head: MandateHeadSnapshot,
    priorIssue: MandateIssueSnapshot,
    revocation: MandateRevocationSnapshot,
  ) => void

  persistIssue: (input: PersistIssueInput) => Promise<PersistIssueResult>

  loadRevocationCommand: (commandKey: string) => Promise<RevocationCommandRow | null>

  verifyRevocationCommandReplay: (
    command: RevocationCommandRow,
  ) => Promise<RevocationProjection>

  assertHeadMatchesIssue: (
    head: MandateHeadSnapshot,
    issue: MandateIssueSnapshot,
  ) => void

  commitCustomerRevocation: (
    input: CommitCustomerRevocationInput,
  ) => Promise<RevocationProjection>

  loadHistory: (
    requestId: string,
    principalId: string,
  ) => Promise<Extract<HistoryResult, { kind: 'found' }>>
}>
