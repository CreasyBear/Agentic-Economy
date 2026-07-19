import type { ActionContext, ActionResult } from '@/modules/common/action'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { ReconciliationEvidence } from './reconciliation-evidence'

export type ActionInvocationOrigin =
  | Readonly<{ kind: 'request_owned'; requestRef: string; revision: number }>
  | Readonly<{ kind: 'standalone'; callerRef: string; principalRef: string }>

export type InvocationActor = Readonly<{ callerRef: string; principalRef: string }>

export type StandingMandateAuthorityBasis = Readonly<{
  kind: 'standing_mandate_use'
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  authorityUseRef: string
  grantEvidenceRef: string
}>

export type PreparedInvocation = Readonly<{
  materialInputDigest: string
  target: StableHashValue
  consequence: string
  dataUse: Readonly<{
    fields: readonly string[]
    limits: Readonly<Record<string, number>>
  }>
  preparedAt: string
  freshUntil: string
}>

export type DecisionRefusalCode =
  | 'invocation_not_found'
  | 'cross_principal_refused'
  | 'cross_origin_refused'
  | 'stale_invocation_version'
  | 'authority_expired'
  | 'material_input_changed'
  | 'authority_not_accepted'
  | 'reconciliation_required'
  | 'lease_not_current'
  | 'effect_generation_stale'
  | 'invalid_control_state'
  | 'command_identity_conflict'
  | 'evidence_malformed'
  | 'evidence_digest_mismatch'
  | 'evidence_source_mismatch'
  | 'evidence_attempt_mismatch'
  | 'evidence_generation_stale'
  | 'evidence_time_invalid'
  | 'evidence_source_unverified'

export type ActionAttemptView = Readonly<{
  attemptRef: string
  attemptNumber: number
  actor: InvocationActor
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
    | Readonly<{ state: 'failed'; retry: 'safe_before_release'; message: string }>
    | Readonly<{
        state: 'uncertain'
        retry: 'reconcile_before_retry'
        message: string
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

export type ActionInvocationView<Result extends ActionResult = ActionResult> = Readonly<{
  invocationRef: string
  invocationVersion: number
  environment: 'MOCK/DEVELOPMENT ONLY'
  persistence: 'in_memory_only' | 'durable_control'
  origin: ActionInvocationOrigin
  owner: InvocationActor
  action: Readonly<{ id: string; contractVersion: string }>
  desired: Readonly<{ state: 'invoke' }>
  prepared?: PreparedInvocation
  authority?: Readonly<{ reference: string; expiresAt: string }>
  acceptedAuthority?:
    | Readonly<{ kind: 'approve_each'; authorityRef: string }>
    | StandingMandateAuthorityBasis
  attempts: readonly ActionAttemptView[]
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

export type InvokeActionInput<Input> = Readonly<{
  origin: ActionInvocationOrigin
  input: Input
  context: ActionContext
}>

export type PrepareActionInput<Input> = InvokeActionInput<Input> & Readonly<{
  actor: InvocationActor
  freshnessMs: number
}>

export type InvocationDecision<Result extends ActionResult> =
  | Readonly<{ kind: 'accepted'; view: ActionInvocationView<Result> }>
  | Readonly<{ kind: 'refused'; code: DecisionRefusalCode; view?: ActionInvocationView<Result> }>

export interface ActionInvocationTracer<Input, Result extends ActionResult> {
  invoke(input: InvokeActionInput<Input>): Promise<ActionInvocationView<Result>>
  prepare(input: PrepareActionInput<Input>): ActionInvocationView<Result>
  decide(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    accept: boolean
  }>): InvocationDecision<Result>
  authorizeStandingMandateUse(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    basis: StandingMandateAuthorityBasis
  }>): InvocationDecision<Result>
  execute(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    materialInput: Input
  }>): Promise<InvocationDecision<Result>>
  acquire(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    materialInput: Input
    leaseOwner: string
    leaseMs: number
    acceptedAuthorityBasis?: StandingMandateAuthorityBasis
  }>): InvocationDecision<Result>
  executeAcquired(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<InvocationDecision<Result>>
  publishObservation(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
    release: 'not_released' | 'released' | 'possibly_released'
  }>): InvocationDecision<Result>
  cancel(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    actor: InvocationActor
    origin: ActionInvocationOrigin
  }>): InvocationDecision<Result>
  reconcile(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    evidence: ReconciliationEvidence
  }>): InvocationDecision<Result>
  inspect(invocationRef: string): ActionInvocationView<Result> | undefined
  exportSnapshot(): InMemoryControlSnapshot<Input, Result>
}

export type InMemoryControlSnapshot<Input, Result extends ActionResult> = Readonly<{
  format: 'action-invocation-control:development:v1'
  records: readonly Readonly<{
    sourceRef: string
    control: Pick<
      ActionInvocationView<Result>,
      'invocationRef' | 'invocationVersion' | 'environment' | 'persistence' |
      'origin' | 'owner' | 'action' | 'desired' | 'authority' | 'attempts' |
      'acceptedAuthority' | 'freshness' | 'control'
    >
    authorityBinding?: AuthorityBindingSnapshot
  }>[]
}>

export type AuthorityBindingSnapshot = Readonly<{
  reference: string
  invocationRef: string
  actor: InvocationActor
  origin: ActionInvocationOrigin
  invocationVersion: number
  actionId: string
  contractVersion: string
  digest: string
  targetDigest: string
  consequence: string
  limits: Readonly<Record<string, number>>
  expiresAt: string
  acceptedBasis?:
    | Readonly<{ kind: 'approve_each'; authorityRef: string }>
    | StandingMandateAuthorityBasis
}>
