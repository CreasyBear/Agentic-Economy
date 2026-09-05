import type { ActionContext, ActionResult } from '@/modules/common/action'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import type { JsonValue } from '@/modules/capability-contract/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ReconciliationEvidence } from './reconciliation-evidence'

export type ActionExecutionLimitValue = number | ExactAmount
export type ActionExecutionLimits = Readonly<Record<string, ActionExecutionLimitValue>>
export function parseActionExecutionLimits(
  value: Readonly<Record<string, JsonValue>>,
): ActionExecutionLimits | undefined {
  const limits: Record<string, ActionExecutionLimitValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'amount') {
      const parsed = exactAmountSchema.safeParse(raw)
      if (!parsed.success) return undefined
      limits[key] = parsed.data
      continue
    }
    if (typeof raw !== 'number') return undefined
    limits[key] = raw
  }
  return limits
}

export type ActionExecutionOrigin =
  | Readonly<{ kind: 'request_owned'; requestRef: string; revision: number }>
  | Readonly<{ kind: 'standalone'; callerRef: string; principalRef: string }>

export type ExecutionActor = Readonly<{ callerRef: string; principalRef: string }>

export type StandingMandateAuthorityBasis = Readonly<{
  kind: 'standing_mandate_use'
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  authorityUseRef: string
  grantEvidenceRef: string
}>
export type CustomerRequestMandateAuthorityBasis = Readonly<{
  kind: 'customer_request_mandate_use'
  mandateRef: string
  mandateDigest: string
  requestRevision: number
  routeGeneration: number
  authorization:
    | Readonly<{
        kind: 'explicit'
        authorizationEvidenceRef: string
        authorizationEvidenceDigest: string
      }>
    | Readonly<{
        kind: 'standing_low_risk'
        standingPolicyRef: string
        standingPolicyDigest: string
        authorityUseRef: string
      }>
  grantRef: string
  grantDigest: string
}>
export type PublicCapabilityAuthorityBasis = Readonly<{
  kind: 'public_capability_use'
  publicationRef: string
  publicationRevision: number
  operationRef: string
  bindingId: string
  bindingRegistrationHash: string
}>

export type PreparedExecution = Readonly<{
  materialInputDigest: string
  target: StableHashValue
  consequence: string
  dataUse: Readonly<{
    fields: readonly string[]
    limits: ActionExecutionLimits
  }>
  preparedAt: string
  freshUntil: string
}>

export const DecisionRefusalCodeValues = [
  'execution_not_found',
  'cross_principal_refused',
  'cross_origin_refused',
  'stale_execution_version',
  'authority_expired',
  'material_input_changed',
  'authority_not_accepted',
  'reconciliation_required',
  'lease_not_current',
  'effect_generation_stale',
  'invalid_control_state',
  'command_identity_conflict',
  'evidence_malformed',
  'evidence_digest_mismatch',
  'evidence_source_mismatch',
  'evidence_attempt_mismatch',
  'evidence_generation_stale',
  'evidence_time_invalid',
  'evidence_source_unverified',
] as const
export type DecisionRefusalCode = (typeof DecisionRefusalCodeValues)[number]

export type ActionAttemptView = Readonly<{
  attemptRef: string
  attemptNumber: number
  actor: ExecutionActor
  effectGeneration: number
  lease: Readonly<{ owner: string; expiresAt: string }>
  idempotency: Readonly<{
    operationKey: string
    materialInputDigest: string
    effectIdentity: string
  }>
  release:
    | Readonly<{ state: 'not_released' }>
    | Readonly<{ state: 'released'; observedAt: string }>
    | Readonly<{ state: 'possibly_released' }>
  outcome:
    | Readonly<{ state: 'running' }>
    | Readonly<{ state: 'returned'; businessOutcome: string }>
    | Readonly<{ state: 'failed'; retry: 'safe_before_release'; errorDigest?: string }>
    | Readonly<{
        state: 'uncertain'
        retry: 'reconcile_before_retry'
        errorDigest?: string
        reconciliationRequiredAt: string
      }>
    | Readonly<{
        state: 'timed_out'
        timeoutMs: number
        retry: 'reconcile_before_retry'
        reconciliationRequiredAt: string
      }>
    | Readonly<{ state: 'reconciled_not_released'; retry: 'safe_after_reconciliation'; observedAt: string }>
    | Readonly<{ state: 'reconciled_released'; externalOutcome: 'unknown'; observedAt: string }>
}>

export type ActionExecutionView<Result extends ActionResult = ActionResult> = Readonly<{
  executionRef: string
  executionVersion: number
  origin: ActionExecutionOrigin
  owner: ExecutionActor
  action: Readonly<{ id: string; contractVersion: string }>
  desired: Readonly<{ state: 'invoke' }>
  attempts: readonly ActionAttemptView[]
  prepared?: PreparedExecution
  authority?: Readonly<{ reference: string; expiresAt: string }>
  acceptedAuthority?:
    | Readonly<{ kind: 'approve_each'; authorityRef: string }>
    | StandingMandateAuthorityBasis
    | CustomerRequestMandateAuthorityBasis
    | PublicCapabilityAuthorityBasis
  observedResolution:
    | Readonly<{ state: 'pending' }>
    | Readonly<{
        state: 'returned'
        execution: 'runner_returned' | 'pre_release_refused'
        businessOutcome: string
        resultReferenceable: boolean
        result: Result
      }>
    | Readonly<{ state: 'threw'; execution: 'runner_threw'; message: string }>
    | Readonly<{ state: 'timed_out'; timeoutMs: number; observedAt: string }>
  freshness:
    | Readonly<{ state: 'not_observed' }>
    | Readonly<{ state: 'current'; observedAt: string }>
  control:
    | Readonly<{ state: 'gathering_information'; missingFields: readonly string[] }>
    | Readonly<{ state: 'awaiting_authority' }>
    | Readonly<{ state: 'authorized'; decidedAt: string }>
    | Readonly<{
        state: 'leased'
        attemptRef: string
        leaseOwner: string
        effectGeneration: number
        leaseExpiresAt: string
        release: 'not_started' | 'not_released' | 'possibly_released'
      }>
    | Readonly<{ state: 'in_progress' }>
    | Readonly<{ state: 'retryable'; reason: 'pre_release_failure' }>
    | Readonly<{ state: 'reconciliation_required'; attemptRef: string }>
    | Readonly<{ state: 'terminal' }>
    | Readonly<{ state: 'cancelled'; effect: 'not_released' }>
    | Readonly<{ state: 'invalidated'; reason: DecisionRefusalCode }>
}>

type ActionExecutionAcceptedAuthority = NonNullable<ActionExecutionView['acceptedAuthority']>

/**
 * Project the runtime authority basis into the stable JSON material used by
 * authority-bound hashes. Keep this separate from the runtime union so later
 * vocabulary changes can preserve protected bytes without changing the
 * accepted authority stored or validated by the execution runtime.
 */
export function canonicalAuthorityBasisMaterial(
  basis: ActionExecutionAcceptedAuthority,
): StableHashValue {
  switch (basis.kind) {
    case 'approve_each':
      return {
        kind: basis.kind,
        authorityRef: basis.authorityRef,
      }
    case 'standing_mandate_use':
      return {
        kind: basis.kind,
        mandateRef: basis.mandateRef,
        mandateVersion: basis.mandateVersion,
        mandateGeneration: basis.mandateGeneration,
        authorityUseRef: basis.authorityUseRef,
        grantEvidenceRef: basis.grantEvidenceRef,
      }
    case 'customer_request_mandate_use':
      return {
        kind: basis.kind,
        mandateRef: basis.mandateRef,
        mandateDigest: basis.mandateDigest,
        requestRevision: basis.requestRevision,
        routeGeneration: basis.routeGeneration,
        authorization: basis.authorization.kind === 'explicit'
          ? {
              kind: basis.authorization.kind,
              authorizationEvidenceRef: basis.authorization.authorizationEvidenceRef,
              authorizationEvidenceDigest: basis.authorization.authorizationEvidenceDigest,
            }
          : {
              kind: basis.authorization.kind,
              standingPolicyRef: basis.authorization.standingPolicyRef,
              standingPolicyDigest: basis.authorization.standingPolicyDigest,
              authorityUseRef: basis.authorization.authorityUseRef,
            },
        grantRef: basis.grantRef,
        grantDigest: basis.grantDigest,
      }
    case 'public_capability_use':
      return {
        kind: basis.kind,
        publicationRef: basis.publicationRef,
        publicationRevision: basis.publicationRevision,
        operationRef: basis.operationRef,
        bindingId: basis.bindingId,
        bindingRegistrationHash: basis.bindingRegistrationHash,
      }
    default: {
      const exhaustive: never = basis
      return exhaustive
    }
  }
}

export type InvokeActionInput<Input> = Readonly<{
  origin: ActionExecutionOrigin
  input: Input
  context: ActionContext
}>

export type PrepareActionInput<Input> = InvokeActionInput<Input> & Readonly<{
  actor: ExecutionActor
  freshnessMs: number
}>

export type ExecutionDecision<Result extends ActionResult> =
  | Readonly<{ kind: 'accepted'; view: ActionExecutionView<Result> }>
  | Readonly<{ kind: 'refused'; code: DecisionRefusalCode; view?: ActionExecutionView<Result> }>

export interface ActionExecutionTracer<Input, Result extends ActionResult> {
  invoke(input: InvokeActionInput<Input>): Promise<ActionExecutionView<Result>>
  prepare(input: PrepareActionInput<Input>): Promise<ActionExecutionView<Result>>
  prepareExisting(input: PrepareActionInput<Input> & Readonly<{
    executionRef: string
    expectedExecutionVersion: number
  }>): Promise<ActionExecutionView<Result>>
  revisePrepared(input: PrepareActionInput<Input> & Readonly<{
    executionRef: string
    expectedExecutionVersion: number
  }>): Promise<ExecutionDecision<Result>>
  decide(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    authorityRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
    accept: boolean
  }>): Promise<ExecutionDecision<Result>>
  authorizeStandingMandateUse(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    authorityRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
    basis: StandingMandateAuthorityBasis
  }>): Promise<ExecutionDecision<Result>>
  execute(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    authorityRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
    materialInput: Input
  }>): Promise<ExecutionDecision<Result>>
  acquire(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    authorityRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
    materialInput: Input
    leaseOwner: string
    leaseMs: number
    acceptedAuthorityBasis?: StandingMandateAuthorityBasis
  }>): Promise<ExecutionDecision<Result>>
  executeAcquired(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<ExecutionDecision<Result>>
  publishObservation(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
    release: 'not_released' | 'released' | 'possibly_released'
  }>): Promise<ExecutionDecision<Result>>
  cancel(input: Readonly<{
    executionRef: string
    idempotencyKey: string
    expectedExecutionVersion: number
    actor: ExecutionActor
    origin: ActionExecutionOrigin
  }>): Promise<ExecutionDecision<Result>>
  reconcile(input: Readonly<{
    executionRef: string
    expectedExecutionVersion: number
    attemptRef: string
    actor: ExecutionActor
    origin: ActionExecutionOrigin
    evidence: ReconciliationEvidence
  }>): Promise<ExecutionDecision<Result>>
  inspect(executionRef: string): ActionExecutionView<Result> | undefined
  exportSnapshot(): InMemoryControlSnapshot<Result>
}

export type InMemoryControlSnapshot<Result extends ActionResult> = Readonly<{
  format: 'action-execution-control:development:v1'
  records: readonly Readonly<{
    sourceRef: string
    control: Pick<
      ActionExecutionView<Result>,
      'executionRef' | 'executionVersion' |
      'origin' | 'owner' | 'action' | 'desired' | 'authority' | 'attempts' |
      'acceptedAuthority' | 'freshness' | 'control'
    >
    authorityBinding?: AuthorityBindingSnapshot
  }>[]
}>

export type AuthorityBindingSnapshot = Readonly<{
  reference: string
  executionRef: string
  actor: ExecutionActor
  origin: ActionExecutionOrigin
  executionVersion: number
  actionId: string
  contractVersion: string
  digest: string
  expiresAt: string
  targetDigest: string
  consequence: string
  limits: ActionExecutionLimits
  acceptedBasis?:
    | Readonly<{ kind: 'approve_each'; authorityRef: string }>
    | StandingMandateAuthorityBasis
    | CustomerRequestMandateAuthorityBasis
    | PublicCapabilityAuthorityBasis

}>
