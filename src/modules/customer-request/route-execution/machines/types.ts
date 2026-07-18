import type { JsonValue } from '@/modules/capability-contract/public'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'
import type { RouteMandate } from '@/modules/customer-request/route-mandate'

import type { RouteAttemptState } from '../journal/export-state'

export type RunProjection = Readonly<{
  runRef: string
  requestId: string
  requestRevision: number
  generationRef: string
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  state:
    | 'queued'
    | 'running'
    | 'outcome_unknown'
    | 'completed'
    | 'failed'
    | 'cancelled'
  totalSteps: number
  completedSteps: number
  currentPosition: number
  currentState: RouteAttemptState
  resultJson?: string
  cancellationReleaseMayStartAt?: number
  cancellationUnavailableSince?: number
  cancellationRequestedAt?: number
  cancellationAttempt?: Readonly<
    | {
      state: 'pending'
      requestedAt: number
      nextCheckAt: number
    }
    | {
      state: 'unknown'
      requestedAt: number
      observedAt: number
      nextCheckAt: number
    }
    | {
      state: 'rejected'
      requestedAt: number
      observedAt: number
      reason: string
    }
  >
  updatedAt: number
}>

export type StartCommand = Readonly<{
  requestId: string
  principalId: string
  idempotencyKey: string
}>

export type StartResult = Readonly<
  | { kind: 'started'; run: RunProjection }
  | { kind: 'replayed'; run: RunProjection }
  | { kind: 'resumed'; run: RunProjection }
  | { kind: 'conflict'; reason: 'command_changed' }
  | {
    kind: 'refused'
    reason:
      | 'confirmation_required'
      | 'confirmation_expired'
      | 'confirmation_changed'
      | 'route_unavailable'
  }
>

export type LeaseCommand = Readonly<{
  workerId: string
  leaseDurationMs: number
}>

export type DispatchLease = Readonly<{
  dispatchRef: string
  attemptRef: string
  runRef: string
  position: number
  operationKeyDigest: string
  inputJson: string
  grant: RouteStepGrant
  leaseExpiresAt: number
}>

export type LeaseResult = Readonly<
  | { kind: 'leased'; dispatch: DispatchLease }
  | { kind: 'none' }
  | { kind: 'refused'; reason: 'lease_invalid' }
>

export type OutcomeCommand = Readonly<{
  attemptRef: string
  operationKeyDigest: string
  observationJson?: string
  outcome: Readonly<
    | { kind: 'succeeded'; outputJson: string }
    | { kind: 'partial'; outputJson: string }
    | { kind: 'failed' }
    | { kind: 'unknown' }
  >
}>

export type OutcomeResult = Readonly<
  | { kind: 'advanced'; run: RunProjection }
  | { kind: 'cancelled'; run: RunProjection }
  | { kind: 'completed'; run: RunProjection }
  | { kind: 'failed'; run: RunProjection }
  | { kind: 'outcome_unknown'; run: RunProjection }
  | { kind: 'replayed'; run: RunProjection }
  | {
    kind: 'refused'
    reason: 'attempt_not_current' | 'output_invalid'
  }
>

export type MandateLoadResult = Readonly<
  | { kind: 'active'; mandate: RouteMandate }
  | { kind: 'expired' }
  | { kind: 'missing' }
>

export type PriorRunCommand = Readonly<{
  commandDigest: string
  principalId: string
  requestId: string
  runRef: string
}>

export type RunHeadSnapshot = Readonly<{
  principalId: string
  currentRunRef: string
  currentMandateRef: string
}>

export type RunRecordSnapshot = Readonly<{
  runRef: string
  principalId: string
  requestId: string
  requestRevision: number
  mandateRef: string
  mandateDigest: string
  generationRef: string
  routePlanId: string
  routeDigest: string
  businesses?: readonly Readonly<{ businessRef: string; name: string }>[]
  state:
    | 'queued'
    | 'running'
    | 'outcome_unknown'
    | 'completed'
    | 'failed'
    | 'cancelled'
  totalSteps: number
  completedSteps: number
  currentPosition: number
  createdAt: number
  updatedAt: number
}>

export type AttemptRecordSnapshot = Readonly<{
  attemptRef: string
  attemptDigest: string
  runRef: string
  requestId: string
  mandateRef: string
  actionId: string
  position: number
  operationKeyDigest: string
  grant: RouteStepGrant
  inputJson: string
  inputDigest: string
  state: RouteAttemptState
  outputJson?: string
  outputDigest?: string
  transportObservationJson?: string
  transportObservationDigest?: string
  createdAt: number
  updatedAt: number
}>

export type DispatchRecordSnapshot = Readonly<{
  dispatchRef: string
  dispatchDigest: string
  runRef: string
  attemptRef: string
  operationKeyDigest: string
  state: 'pending' | 'leased' | 'delivered' | 'failed' | 'cancelled' | 'outcome_unknown'
  availableAt: number
  createdAt: number
  leaseOwner?: string
  leaseExpiresAt?: number
}>

export type ValidatedAttemptOutput = Readonly<{
  output: JsonValue
  evidence: readonly Readonly<{
    evidenceId: string
    outputPointer: string
    schemaIdentity: string
    valueDigest: string
  }>[]
}>

export type StepAdmissionResult = Readonly<
  | { kind: 'admitted'; grant: RouteStepGrant }
  | { kind: 'replayed'; grant: RouteStepGrant }
  | { kind: 'conflict'; reason: 'command_changed' }
  | {
    kind: 'refused'
    reason:
      | 'mandate_not_current'
      | 'mandate_scope_mismatch'
      | 'step_already_reserved'
      | 'spend_limit_exceeded'
  }
>

export type RouteBusinessSnapshot = Readonly<{
  businessRef: string
  name: string
}>

export type CancelCommand = Readonly<{
  requestId: string
  principalId: string
  idempotencyKey: string
  mode: 'current_and_downstream' | 'after_current_step'
}>

export type CancelResult = Readonly<
  | { kind: 'cancelled'; run: RunProjection }
  | { kind: 'replayed'; run: RunProjection }
  | { kind: 'pending'; run: RunProjection }
  | { kind: 'too_late'; run: RunProjection }
  | { kind: 'refused'; reason: 'run_not_found' }
  | { kind: 'conflict'; reason: 'command_changed' }
>

export type PriorCancelCommand = Readonly<{
  commandDigest: string
  principalId: string
  requestId: string
  runRef: string
  mode?: 'current_and_downstream' | 'after_current_step'
  result: 'cancelled' | 'pending' | 'too_late' | 'rejected'
}>

export type CancellationAttemptSnapshot = Readonly<{
  cancellationRef: string
  runRef: string
  attemptRef: string
  operationKeyDigest: string
  state: 'pending' | 'accepted' | 'rejected' | 'unknown'
  requestedAt: number
  updatedAt: number
  resolvedAt?: number
  reason?: string
}>

export type CancelMandateLoadResult = Readonly<
  | { kind: 'active'; mandateRef: string; mandateDigest: string; networkId: string }
  | { kind: 'missing' }
>

export type CancelSupplyLoadResult = Readonly<
  | {
    kind: 'available'
    binding: Readonly<{
      adapterId: string
      endpointUrl: string
      credentialRef: string
      configJson: string
      configDigest: string
    }>
  }
  | { kind: 'unavailable' }
>

export type CancellationInvocation = Readonly<{
  cancellationRef: string
  attemptRef: string
  operationKeyDigest: string
  binding: Readonly<{
    adapterId: string
    endpointUrl: string
    credentialRef: string
    configJson: string
    configDigest: string
  }>
  authority: Readonly<{
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: Readonly<{ currency: string; amountMinor: number }>
    expiresAt: number
  }>
}>

export type OpenCancellationResult = Readonly<
  | { kind: 'available'; invocation: CancellationInvocation }
  | { kind: 'unavailable' }
>

export type CancellationObservation = Readonly<{
  disposition: 'accepted' | 'rejected' | 'unknown' | 'unsupported'
  requestDigest: string
  responseDigest?: string
  providerReference?: string
  reason?: string
  failureCode?: string
}>

export type ResolveCancellationCommand = Readonly<{
  cancellationRef: string
  observation: CancellationObservation
}>

export type ResolveCancellationResult = Readonly<
  | { kind: 'recorded'; run: RunProjection }
  | { kind: 'replayed'; run: RunProjection }
  | { kind: 'refused' }
>

export type OpenLeasedDispatchCommand = Readonly<{
  dispatchRef: string
  workerId: string
}>

export type LeasedInvocation = Readonly<{
  dispatchRef: string
  attemptRef: string
  runRef: string
  operationKeyDigest: string
  inputJson: string
  inputDigest: string
  binding: Readonly<{
    adapterId: string
    endpointUrl: string
    credentialRef: string
    configJson: string
    configDigest: string
  }>
  authority: Readonly<{
    mandateDigest: string
    grantDigest: string
    capabilityContractDigest: string
    maximumSpend: Readonly<{ currency: string; amountMinor: number }>
    expiresAt: number
  }>
}>

export type OpenLeasedDispatchResult = Readonly<
  | { kind: 'available'; invocation: LeasedInvocation }
  | { kind: 'unavailable' }
>

export type RecoverExpiredDispatchCommand = Readonly<{
  dispatchRef: string
}>

export type RecoverExpiredDispatchResult = Readonly<
  | { kind: 'requeued' }
  | { kind: 'outcome_unknown' }
  | { kind: 'unchanged' }
>

export type MarkDispatchedCommand = Readonly<{
  dispatchRef: string
  attemptRef: string
  workerId: string
}>

export type MarkDispatchedResult = Readonly<
  | { kind: 'recorded' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: 'lease_not_current' }
>

export type RecordNotReleasedCommand = Readonly<{
  dispatchRef: string
  attemptRef: string
  workerId: string
  observationJson: string
}>

export type RecordNotReleasedResult = Readonly<
  | { kind: 'failed'; run: RunProjection }
  | { kind: 'replayed'; run: RunProjection }
  | { kind: 'refused'; reason: 'lease_not_current' }
>

export type MarkAcceptedCommand = Readonly<{
  attemptRef: string
  operationKeyDigest: string
}>

export type MarkAcceptedResult = Readonly<
  | { kind: 'recorded' }
  | { kind: 'replayed' }
  | { kind: 'refused'; reason: 'attempt_not_current' }
>

export type DispatchPublicationSnapshot = Readonly<{
  disposition: string
  businessId: string
  networkId: string
  offeringId: string
  bindingId: string
  capabilityId: string
  version: number
  contractDigest: string
  credentialState: string
  healthState: string
  readinessObservedAt?: number
  readinessValidUntil?: number
}>
