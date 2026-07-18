import type { RouteMandate } from '@/modules/customer-request/route-mandate'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

export type AuthenticatedIdentity = Readonly<{
  issuer: string
  subject: string
  tokenIdentifier: string
}>

export type AuthenticatedRequestResult =
  | { kind: 'authenticated'; principalId: string; identity: AuthenticatedIdentity }
  | { kind: 'unauthenticated' }
  | { kind: 'not_found' }

export type ServiceAuthorization = Readonly<{
  command: Readonly<{
    requestRef: string
    revision: number
    routeRef: string
    idempotencyKey: string
  }>
  assertion: Readonly<{
    principalId: string
    ownerId: string
    credentialId: string
    scopes: readonly string[]
    issuedAt: number
    signature: string
  }>
}>

export type IssueCommandArgs = Readonly<{
  requestId: string
  expectedRequestRevision: number
  expectedGenerationRef: string
  selectedRoutePlanId: string
  maximumTotalSpend: Readonly<{ currency: string; amountMinor: number }>
  expiresAt: number
  idempotencyKey: string
  serviceAuthorization?: ServiceAuthorization
}>

export type IssueRefusalReason =
  | 'authentication_required'
  | 'request_not_found'
  | 'route_generation_invalid'
  | 'mandate_scope_invalid'

export type IssueResult = Readonly<
  | { kind: 'issued'; mandate: RouteMandate }
  | { kind: 'replayed'; mandate: RouteMandate }
  | {
      kind: 'conflict'
      reason:
        | 'command_changed'
        | 'request_revision_changed'
        | 'route_generation_changed'
        | 'active_mandate_exists'
    }
  | { kind: 'refused'; reason: IssueRefusalReason }
>

export type RevokeArgs = Readonly<{
  requestId: string
  mandateRef: string
  idempotencyKey: string
}>

export type RevocationProjection = Readonly<{
  revocationRef: string
  mandateRef: string
  mandateDigest: string
  reason: 'customer_revoked' | 'request_revised' | 'route_generation_superseded'
  requestRevision: number
  generationRef: string
  supersededByRequestRevision?: number
  supersededByGenerationRef?: string
  evidenceDigest: string
  recordedAt: number
}>

export type RevokeResult = Readonly<
  | { kind: 'revoked'; revocation: RevocationProjection }
  | { kind: 'replayed'; revocation: RevocationProjection }
  | {
      kind: 'conflict'
      reason: 'command_changed' | 'mandate_not_current'
    }
  | {
      kind: 'refused'
      reason: 'authentication_required' | 'request_not_found'
    }
>

type IssueAuthenticationEvidence = Readonly<{
  evidenceRef: string
  issuer: string
  subject: string
  tokenIdentifier: string
}>

type IssueAuthorizationEvidenceBase = Readonly<{
  evidenceRef: string
  evidenceDigest: string
  commandDigest: string
  principalId: string
  requestId: string
  requestRevision: number
  generationRef: string
  selectedRoutePlanId: string
  maximumTotalSpend: Readonly<{ currency: string; amountMinor: number }>
  issuedAt: number
  expiresAt: number
  authenticatedActor: AuthenticatedIdentity
}>

export type IssueEvidence = Readonly<{
  authentication: IssueAuthenticationEvidence
  authorization: Readonly<
    | (IssueAuthorizationEvidenceBase & { kind: 'explicit' })
    | (IssueAuthorizationEvidenceBase & {
        kind: 'standing_low_risk'
        standingPolicyRef: string
        standingPolicyDigest: string
        authorityUseRef: string
        authorityUseDigest: string
        delegatedCredentialId: string
      })
  >
}>

export type HistoryResult = Readonly<
  | { kind: 'not_found' }
  | {
      kind: 'found'
      issues: readonly Readonly<{ mandate: RouteMandate; evidence: IssueEvidence }>[]
      revocations: readonly RevocationProjection[]
    }
>

export type GetHistoryArgs = Readonly<{
  requestId: string
}>

export type IssueCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  mandateRef: string
  mandateDigest: string
  result: RouteMandate
}>

export type RevocationCommandRow = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  mandateRef: string
  revocationRef: string
}>

export type MandateHeadSnapshot = Readonly<{
  requestId: string
  principalId: string
  currentMandateRef: string
  currentMandateDigest: string
  currentRequestRevision: number
  currentGenerationRef: string
}>

export type MandateIssueSnapshot = Readonly<{
  mandateRef: string
  mandateDigest: string
  principalId: string
  requestId: string
  requestRevision: number
  generationRef: string
  routePlanId: string
  mandate: RouteMandate
  evidence: IssueEvidence
  recordedAt: number
}>

export type MandateRevocationSnapshot = Readonly<{
  revocationRef: string
  mandateRef: string
  mandateDigest: string
  principalId: string
  requestId: string
  reason: 'customer_revoked' | 'request_revised' | 'route_generation_superseded'
  requestRevision: number
  generationRef: string
  supersededByRequestRevision?: number
  supersededByGenerationRef?: string
  evidenceDigest: string
  recordedAt: number
}>

export type OpenCurrentRouteGenerationResult = Readonly<
  | {
      kind: 'found'
      requestRevision: number
      networkId: string
      generation: CustomerRequestRoutePlanGeneration
    }
  | { kind: 'not_found' }
>

export type PersistIssueInput = Readonly<{
  mandate: RouteMandate
  evidence: IssueEvidence
  principalId: string
  requestId: string
  requestRevision: number
  generationRef: string
  routePlanId: string
  commandKey: string
  commandDigest: string
  recordedAt: number
}>

export type PersistIssueResult = Readonly<
  | { kind: 'issued'; mandate: RouteMandate }
  | { kind: 'active_mandate_exists' }
>

export type CommitCustomerRevocationInput = Readonly<{
  commandKey: string
  commandDigest: string
  principalId: string
  requestId: string
  mandateRef: string
  head: MandateHeadSnapshot
  recordedAt: number
}>

export type { RouteMandate, CustomerRequestRoutePlanGeneration }
