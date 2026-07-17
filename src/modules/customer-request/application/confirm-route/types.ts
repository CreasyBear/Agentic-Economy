import type { CustomerRequestActionResult } from '../action-result'
import type {
  CompareResumeMandate,
  CompareResumePorts,
} from '../compare-resume/types'
import type { StandingRoutePorts } from '../standing-route/types'

export type ConfirmRouteCommand = Readonly<{
  requestRef: string
  revision: number
  routeRef: string
  idempotencyKey: string
}>

export type ConfirmServiceAssertion = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
  issuedAt: number
  signature: string
}>

export type ConfirmServiceAuthorization = Readonly<{
  command: ConfirmRouteCommand
  assertion: ConfirmServiceAssertion
}>

export type ConfirmMoney = Readonly<{ currency: string; amountMinor: number }>

export type IssueConfirmMandateResult = Readonly<
  | { kind: 'issued' | 'replayed'; mandate: CompareResumeMandate }
  | {
      kind: 'conflict'
      reason:
        | 'command_changed'
        | 'request_revision_changed'
        | 'route_generation_changed'
        | 'active_mandate_exists'
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'route_generation_invalid'
        | 'mandate_scope_invalid'
    }
>

export type ConfirmRoutePorts = Readonly<{
  loadCurrent: CompareResumePorts['loadCurrent']
  projectCurrentRoutePlans: StandingRoutePorts['projectCurrentRoutePlans']
  getCurrentRoutePlanGeneration: StandingRoutePorts['getCurrentRoutePlanGeneration']
  issueConfirmMandate: (input: Readonly<{
    requestId: string
    expectedRequestRevision: number
    expectedGenerationRef: string
    selectedRoutePlanId: string
    maximumTotalSpend: ConfirmMoney
    expiresAt: number
    idempotencyKey: string
    serviceAuthorization?: ConfirmServiceAuthorization
  }>) => Promise<IssueConfirmMandateResult>
}>

export type ConfirmRouteInput = ConfirmRouteCommand & Readonly<{
  principalId: string
  serviceAuthorization?: ConfirmServiceAuthorization
}>

export type ConfirmRouteResult = CustomerRequestActionResult
