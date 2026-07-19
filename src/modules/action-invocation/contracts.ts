import type { ActionContext, ActionResult } from '@/modules/common/action'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type ActionInvocationOrigin =
  | Readonly<{ kind: 'request_owned'; requestRef: string; revision: number }>
  | Readonly<{ kind: 'standalone'; callerRef: string; principalRef: string }>

export type InvocationActor = Readonly<{ callerRef: string; principalRef: string }>

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
  | 'invalid_control_state'

export type ActionAttemptView = Readonly<{
  attemptRef: string
  attemptNumber: number
  actor: InvocationActor
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
    | Readonly<{ state: 'returned'; businessOutcome: 'queued_communication' | 'refused' | 'not_found' | 'completed' }>
    | Readonly<{ state: 'failed'; retry: 'safe_before_release'; message: string }>
    | Readonly<{ state: 'uncertain'; retry: 'reconcile_before_retry'; message: string }>
    | Readonly<{ state: 'reconciled_not_released'; retry: 'safe_after_reconciliation'; observedAt: string }>
    | Readonly<{ state: 'reconciled_released'; externalOutcome: 'unknown'; observedAt: string }>
}>

export type ActionInvocationView<Result extends ActionResult = ActionResult> = Readonly<{
  invocationRef: string
  invocationVersion: number
  environment: 'MOCK/DEVELOPMENT ONLY'
  persistence: 'in_memory_only'
  origin: ActionInvocationOrigin
  owner: InvocationActor
  action: Readonly<{ id: string; contractVersion: string }>
  desired: Readonly<{ state: 'invoke' }>
  prepared?: PreparedInvocation
  authority?: Readonly<{ reference: string; expiresAt: string }>
  attempts: readonly ActionAttemptView[]
  observedResolution:
    | Readonly<{ state: 'pending' }>
    | Readonly<{
        state: 'returned'
        execution: 'runner_returned'
        businessOutcome: 'queued_communication' | 'refused' | 'not_found' | 'completed'
        result: Result
      }>
    | Readonly<{ state: 'threw'; execution: 'runner_threw'; message: string }>
  freshness:
    | Readonly<{ state: 'not_observed' }>
    | Readonly<{ state: 'current'; observedAt: string }>
  control:
    | Readonly<{ state: 'awaiting_authority' }>
    | Readonly<{ state: 'authorized'; decidedAt: string }>
    | Readonly<{ state: 'in_progress' }>
    | Readonly<{ state: 'retryable'; reason: 'pre_release_failure' }>
    | Readonly<{ state: 'reconciliation_required'; attemptRef: string }>
    | Readonly<{ state: 'terminal' }>
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
  execute(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    materialInput: Input
  }>): Promise<InvocationDecision<Result>>
  reconcile(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    resolution: 'not_released' | 'released'
  }>): InvocationDecision<Result>
  inspect(invocationRef: string): ActionInvocationView<Result> | undefined
}
