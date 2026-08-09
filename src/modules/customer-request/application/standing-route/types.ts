import type { CustomerRoutePlan } from '@/modules/customer-request/agent-contract'
import type { ExactAmount } from '@/modules/money/public'
import type { RepeatPermissionUseRefusalReason } from '@/modules/customer-request/customer-projection'
import type { CustomerRequestActionResult } from '../action-result'
import type {
  CompareResumeAggregate,
  CompareResumeMandate,
  CompareResumePorts,
} from '../compare-resume/types'

export type StandingRouteAggregate = CompareResumeAggregate

export type StandingRouteGeneration = Readonly<{
  generationRef: string
  routes: readonly Readonly<{
    routePlanId: string
    steps: readonly Readonly<{
      dataUse: readonly unknown[]
    }>[]
  }>[]
}>

export type ProjectableStandingPolicy = Readonly<{
  policyRef: string
  policyDigest: string
  delegatedCredentialId: string
  generationRef: string
  routes: readonly Readonly<{ routePlanId: string }>[]
  limits: Readonly<{
    perUseSpend: ExactAmount
    cumulativeSpend: ExactAmount
    perUseDataAllocations: number
    cumulativeDataAllocations: number
    occurrences: number
  }>
  validFrom: number
  validUntil: number
  revokedAt?: number
}>

export type StandingServiceAssertion = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
  issuedAt: number
  signature: string
}>

export type StandingMoney = ExactAmount

export type AllowStandingRouteCommand = Readonly<{
  requestRef: string
  revision: number
  routeRef: string
  delegatedCredentialId: string
  occurrences: number
  cumulativeSpend: StandingMoney
  validUntil: number
  idempotencyKey: string
}>

export type UseStandingRouteCommand = Readonly<{
  requestRef: string
  revision: number
  routeRef: string
  permissionRef: string
  delegatedCredentialId: string
  idempotencyKey: string
}>

export type RevokeStandingRouteCommand = Readonly<{
  requestRef: string
  permissionRef: string
  routeRef: string
  idempotencyKey: string
}>

export type StandingServiceAuthorization = Readonly<
  | {
      operation: 'allow_repeat'
      command: AllowStandingRouteCommand
      assertion: StandingServiceAssertion
    }
  | {
      operation: 'use_repeat'
      command: UseStandingRouteCommand
      assertion: StandingServiceAssertion
    }
  | {
      operation: 'revoke_repeat'
      command: RevokeStandingRouteCommand
      assertion: StandingServiceAssertion
    }
>

export type StandingCredential = Readonly<{
  credentialId: string
  lastSeenAt: number
}>

export type IssueStandingPolicyResult = Readonly<
  | { kind: 'issued' | 'replayed'; policy: ProjectableStandingPolicy }
  | {
      kind: 'conflict'
      reason: 'command_changed' | 'request_revision_changed' | 'route_generation_changed'
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'policy_scope_invalid'
        | 'route_generation_invalid'
        | 'credential_not_authorized'
        | 'explicit_confirmation_required'
    }
>

export type IssueStandingMandateResult = Readonly<
  | {
      kind: 'issued' | 'replayed'
      mandate: CompareResumeMandate
    }
  | {
      kind: 'conflict'
      reason:
        | 'command_changed'
        | 'request_revision_changed'
        | 'route_generation_changed'
        | 'policy_changed'
        | 'active_mandate_exists'
    }
  | {
      kind: 'refused'
      reason: RepeatPermissionUseRefusalReason
    }
>

export type RevokeStandingPolicyResult = Readonly<
  | { kind: 'revoked' | 'replayed'; policy: ProjectableStandingPolicy }
  | { kind: 'conflict'; reason: 'command_changed' | 'policy_changed' }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'policy_not_found'
        | 'policy_integrity_invalid'
    }
>

export type StandingRoutePorts = Readonly<{
  loadCurrent: CompareResumePorts['loadCurrent']
  projectCurrentRoutePlans: CompareResumePorts['projectCurrentRoutePlans']
  getCurrentRoutePlanGeneration: (input: Readonly<{
    requestId: string
  }>) => Promise<Readonly<
    | { kind: 'found'; routeGeneration: StandingRouteGeneration }
    | { kind: 'not_found' }
  >>
  listStandingCredentials: (input: Readonly<{
    ownerId: string
  }>) => Promise<readonly StandingCredential[]>
  listPermissions: (input: Readonly<{
    requestId: string
    principalId: string
  }>) => Promise<Readonly<{
    kind: 'found'
    permissions: readonly Readonly<{
      requestRevision: number
      policy: ProjectableStandingPolicy
    }>[]
  }>>
  resolvePermission: (input: Readonly<{
    requestId: string
    permissionRef: string
    principalId: string
  }>) => Promise<Readonly<
    | { kind: 'found'; requestRevision: number; policy: ProjectableStandingPolicy }
    | { kind: 'not_found' }
  >>
  issueStandingPolicy: (input: Readonly<{
    requestId: string
    expectedRequestRevision: number
    expectedGenerationRef: string
    selectedRoutePlanId: string
    delegatedCredentialId: string
    perUseSpend: StandingMoney
    cumulativeSpend: StandingMoney
    perUseDataAllocations: number
    cumulativeDataAllocations: number
    occurrences: number
    validUntil: number
    idempotencyKey: string
    serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'allow_repeat' }>
  }>) => Promise<IssueStandingPolicyResult>
  issueMandate: (input: Readonly<{
    requestId: string
    policyRef: string
    expectedPolicyDigest: string
    expectedRequestRevision: number
    expectedGenerationRef: string
    selectedRoutePlanId: string
    delegatedCredentialId: string
    mandateExpiresAt: number
    idempotencyKey: string
    serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'use_repeat' }>
  }>) => Promise<IssueStandingMandateResult>
  revokeStandingPolicy: (input: Readonly<{
    requestId: string
    policyRef: string
    expectedPolicyDigest: string
    idempotencyKey: string
    serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'revoke_repeat' }>
  }>) => Promise<RevokeStandingPolicyResult>
}>

export type RepeatPermissionReceipt = Readonly<{
  kind: 'repeat_permission'
  status: 'active' | 'withdrawn'
  permissionRef: string
  requestRef: string
  revision: number
  routeRef: string
  delegatedCredentialId: string
  limits: ProjectableStandingPolicy['limits']
  fallback: 'ask_for_confirmation'
  validFrom: number
  validUntil: number
  withdrawnAt?: number
}>

export type RepeatPermissionResult = Readonly<
  | RepeatPermissionReceipt
  | {
      kind: 'conflict'
      requestRef: string
      reason: 'revision_changed' | 'options_changed' | 'identity_changed' | 'idempotency_key_reused'
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'interpreter_unavailable'
        | 'capabilities_unavailable'
        | 'evidence_not_found'
        | 'invalid_amendment'
    }
  | {
      kind: 'unavailable'
      reason:
        | 'choice_not_current'
        | 'credential_not_authorized'
        | 'repeat_permission_not_available'
      summary: string
    }
>

export type RepeatPermissionAssistantsResult = Readonly<
  | {
      kind: 'connected_assistants'
      requestRef: string
      assistants: readonly Readonly<{
        assistantRef: string
        label: string
        lastUsedAt: number
      }>[]
      permissions: readonly RepeatPermissionReceipt[]
    }
  | {
      kind: 'refused'
      reason:
        | 'authentication_required'
        | 'request_not_found'
        | 'interpreter_unavailable'
        | 'capabilities_unavailable'
        | 'evidence_not_found'
        | 'invalid_amendment'
    }
>

export type SelectableCurrentRouteResult = Readonly<
  | {
      kind: 'selected'
      preview: Extract<CustomerRequestActionResult, { kind: 'request' }> & Readonly<{
        decision: NonNullable<Extract<CustomerRequestActionResult, { kind: 'request' }>['decision']> & Readonly<{
          outcome: Readonly<{ kind: 'routes_available' }>
          generationRef: string
          routes: readonly CustomerRoutePlan[]
        }>
      }>
      displayedRoute: CustomerRoutePlan
      selectedRoute: StandingRouteGeneration['routes'][number]
      generationRef: string
    }
  | {
      kind: 'not_selectable'
      preview: CustomerRequestActionResult
      reason: 'preview_unavailable' | 'route_not_current' | 'route_missing'
    }
>

export type ListStandingRouteAssistantsInput = Readonly<{
  requestRef: string
  principalId: string
  ownerId: string
}>

export type AllowStandingRouteInput = AllowStandingRouteCommand & Readonly<{
  principalId: string
  serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'allow_repeat' }>
}>

export type UseStandingRouteInput = UseStandingRouteCommand & Readonly<{
  principalId: string
  serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'use_repeat' }>
}>

export type InspectStandingRouteInput = Readonly<{
  requestRef: string
  permissionRef: string
  routeRef: string
  principalId: string
}>

export type RevokeStandingRouteInput = RevokeStandingRouteCommand & Readonly<{
  principalId: string
  serviceAuthorization?: Extract<StandingServiceAuthorization, { operation: 'revoke_repeat' }>
}>
