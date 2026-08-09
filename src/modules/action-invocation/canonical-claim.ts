import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ActionAttemptView,
  ActionInvocationOrigin,
  ActionInvocationLimits,
  ActionInvocationView,
  AuthorityBindingSnapshot,
  InvocationActor,
} from './contracts'
import { createAttempt } from './attempts'
import type {
  DurableActionInvocationPort,
  DurableAttemptOutcome,
  DurableAttemptRow,
  DurableControlRow,
  DurableHistoryRow,
  PersistControlCommand,
  PersistControlResult,
} from './internal/durable-contracts'

export type CanonicalClaimAcceptedAuthority = NonNullable<ActionInvocationView['acceptedAuthority']>

export type CanonicalClaimAuthority = Readonly<{
  reference: string
  decisionDigest: string
  targetDigest: string
  consequence: string
  limits: ActionInvocationLimits
  expiresAt: string
  acceptedBasis: CanonicalClaimAcceptedAuthority
}>

export type CanonicalClaimInput = Readonly<{
  invocationRef: string
  sourceRef: string
  invocationVersion: number
  expectedInvocationVersion: number | null
  expectedEffectGeneration?: number
  actor: InvocationActor
  origin: ActionInvocationOrigin
  action: Readonly<{ id: string; contractVersion: string }>
  materialInputDigest: string
  authority: CanonicalClaimAuthority
  attempt: Readonly<{
    attemptRef: string
    attemptNumber: number
    effectGeneration: number
    operationKey: string
    leaseOwner: string
    leaseExpiresAt: string
  }>
  recordedAt: string
}>

export type CustomerRequestCanonicalClaimMaterial = Readonly<
  Omit<CanonicalClaimInput, 'expectedInvocationVersion' | 'expectedEffectGeneration'>
>

export type CanonicalClaimSnapshot = Readonly<{
  control: DurableControlRow
  attempt: DurableAttemptRow
}>

export type CanonicalTerminalOutcome = Readonly<
  | {
      kind: 'returned'
      businessOutcome: string
      resultRef: string
      resultDigest: string
      resultReferenceable: boolean
      release: 'released' | 'possibly_released'
    }
  | {
      kind: 'failed'
      errorDigest: string
      release: 'not_released'
    }
  | {
      kind: 'uncertain'
      errorDigest: string
      reconciliationRequiredAt: string
      release: 'possibly_released'
    }
>

export type CanonicalClaimCommand = PersistControlCommand<ActionResult>
export type CanonicalClaimRefusalCode = Extract<PersistControlResult, { kind: 'refused' }>['code']

export type CanonicalClaimDecision = Readonly<
  | {
      kind: 'claimed'
      invocationRef: string
      attemptRef: string
      invocationVersion: number
      effectGeneration: number
    }
  | {
      kind: 'active'
      snapshot: CanonicalClaimSnapshot
    }
  | {
      kind: 'terminal_replay'
      snapshot: CanonicalClaimSnapshot
    }
  | {
      kind: 'refused'
      code: CanonicalClaimRefusalCode
      snapshot?: CanonicalClaimSnapshot
    }
>

/**
 * Build the single durable-before-I/O claim shared by provider transports.
 * Integrations may project their own journal state in the same Convex
 * mutation, but they must persist this command before resolving credentials or
 * touching a provider.
 */
export function buildCanonicalClaimCommand(input: CanonicalClaimInput): CanonicalClaimCommand {
  validateClaimInput(input)
  const authorityBinding: AuthorityBindingSnapshot = {
    reference: input.authority.reference,
    invocationRef: input.invocationRef,
    actor: input.actor,
    origin: input.origin,
    invocationVersion: input.invocationVersion,
    actionId: input.action.id,
    contractVersion: input.action.contractVersion,
    digest: input.authority.decisionDigest,
    targetDigest: input.authority.targetDigest,
    consequence: input.authority.consequence,
    limits: input.authority.limits,
    expiresAt: input.authority.expiresAt,
    acceptedBasis: input.authority.acceptedBasis,
  }
  const attemptView = createAttempt({
    actionId: input.action.id,
    attemptRef: input.attempt.attemptRef,
    attemptNumber: input.attempt.attemptNumber,
    actor: input.actor,
    operationKey: input.attempt.operationKey,
    materialInputDigest: input.materialInputDigest,
    effectGeneration: input.attempt.effectGeneration,
    leaseOwner: input.attempt.leaseOwner,
    leaseExpiresAt: input.attempt.leaseExpiresAt,
  })
  const control = {
    invocationRef: input.invocationRef,
    invocationVersion: input.invocationVersion,
    origin: input.origin,
    owner: input.actor,
    action: input.action,
    desired: { state: 'invoke' as const },
    authority: {
      reference: input.authority.reference,
      expiresAt: input.authority.expiresAt,
    },
    acceptedAuthority: input.authority.acceptedBasis,
    freshness: { state: 'current' as const, observedAt: input.recordedAt },
    control: {
      state: 'leased' as const,
      attemptRef: input.attempt.attemptRef,
      leaseOwner: input.attempt.leaseOwner,
      effectGeneration: input.attempt.effectGeneration,
      leaseExpiresAt: input.attempt.leaseExpiresAt,
      release: 'not_started' as const,
    },
  }
  const row: DurableControlRow = {
    invocationRef: input.invocationRef,
    invocationVersion: input.invocationVersion,
    sourceRef: input.sourceRef,
    control,
    authorityBinding,
    preparedMaterialDigest: input.materialInputDigest,
    preparedTargetDigest: input.authority.targetDigest,
    consequence: input.authority.consequence,
    dataLimitSummary: input.authority.limits,
    authorityDecisionAt: input.recordedAt,
    currentAttemptRef: input.attempt.attemptRef,
    currentEffectGeneration: input.attempt.effectGeneration,
    currentLeaseOwner: input.attempt.leaseOwner,
    currentLeaseExpiresAt: input.attempt.leaseExpiresAt,
    updatedAt: input.recordedAt,
  }
  const currentAttemptWrite = projectAttempt(
    input.invocationRef,
    attemptView,
    input.recordedAt,
  )
  const commandId = `action-invocation-claim:v1:${input.invocationRef}:${input.attempt.attemptRef}`
  const canonicalCommandMaterial = {
    format: 'action-invocation-claim:v1',
    invocationRef: input.invocationRef,
    sourceRef: input.sourceRef,
    invocationVersion: input.invocationVersion,
    expectedInvocationVersion: input.expectedInvocationVersion,
    expectedEffectGeneration: input.expectedEffectGeneration ?? null,
    actor: input.actor,
    origin: input.origin,
    action: input.action,
    materialInputDigest: input.materialInputDigest,
    authority: input.authority,
    attempt: input.attempt,
    recordedAt: input.recordedAt,
  } as const
  const commandDigest = canonicalDigest(canonicalCommandMaterial as StableHashValue)
  return {
    commandId,
    commandDigest,
    expectedInvocationVersion: input.expectedInvocationVersion,
    ...(input.expectedEffectGeneration === undefined
      ? {}
      : { expectedEffectGeneration: input.expectedEffectGeneration }),
    row,
    currentAttemptWrite,
    history: {
      invocationRef: input.invocationRef,
      commandId,
      commandDigest,
      commandResult: 'applied',
      kind: 'claim_before_effect',
      effectGeneration: input.attempt.effectGeneration,
      actorRef: input.actor.callerRef,
    },
    canonicalCommandMaterial: canonicalCommandMaterial as StableHashValue,
  }
}

export async function claimCanonicalInvocation(
  input: CanonicalClaimInput,
  port: Pick<DurableActionInvocationPort, 'transact' | 'readControl' | 'readAttempt'>,
): Promise<CanonicalClaimDecision> {
  const result = await port.transact(buildCanonicalClaimCommand(input))
  if (result.kind === 'applied') {
    return {
      kind: 'claimed',
      invocationRef: input.invocationRef,
      attemptRef: input.attempt.attemptRef,
      invocationVersion: result.invocationVersion,
      effectGeneration: input.attempt.effectGeneration,
    }
  }
  if (result.kind === 'refused') return { kind: 'refused', code: result.code }
  const snapshot = await readClaimSnapshot(port, input.invocationRef, input.attempt.attemptRef)
  if (snapshot === undefined) return { kind: 'refused', code: 'command_identity_conflict' }
  return classifyDuplicate(snapshot, input.recordedAt)
}

export type CanonicalReleaseFenceInput = Readonly<{
  snapshot: CanonicalClaimSnapshot
  recordedAt: string
}>

export function buildCanonicalReleaseFenceCommand(
  input: CanonicalReleaseFenceInput,
): CanonicalClaimCommand {
  assertActiveClaim(input.snapshot, input.recordedAt)
  const { control, attempt } = input.snapshot
  const nextInvocationVersion = control.invocationVersion + 1
  const nextAttempt = {
    ...attempt,
    release: { state: 'possibly_released' as const },
    recordedAt: input.recordedAt,
  }
  const nextControl = {
    ...control,
    invocationVersion: nextInvocationVersion,
    control: {
      ...control.control,
      invocationVersion: nextInvocationVersion,
      control: {
        ...control.control.control,
        release: 'possibly_released' as const,
      },
    },
    ...(control.authorityBinding === undefined ? {} : {
      authorityBinding: {
        ...control.authorityBinding,
        invocationVersion: nextInvocationVersion,
      },
    }),
    ...(control.currentLeaseExpiresAt === undefined ? {} : {
      currentLeaseExpiresAt: control.currentLeaseExpiresAt,
    }),
    updatedAt: input.recordedAt,
  }
  const commandId = `action-invocation-release-fence:v1:${attempt.invocationRef}:${attempt.attemptRef}:${attempt.effectGeneration}`
  return makeTransitionCommand({
    commandId,
    kind: 'release_fence_before_network',
    expectedInvocationVersion: control.invocationVersion,
    expectedEffectGeneration: attempt.effectGeneration,
    row: nextControl,
    currentAttemptWrite: nextAttempt,
    priorAttempt: attempt,
    recordedAt: input.recordedAt,
    material: {
      format: 'action-invocation-release-fence:v1',
      invocationRef: attempt.invocationRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      recordedAt: input.recordedAt,
    },
  })
}

export async function persistCanonicalReleaseFence(
  input: CanonicalReleaseFenceInput,
  port: Pick<DurableActionInvocationPort, 'transact'>,
): Promise<PersistControlResult> {
  return await port.transact(buildCanonicalReleaseFenceCommand(input))
}

export type CanonicalTerminalOutcomeInput = Readonly<{
  snapshot: CanonicalClaimSnapshot
  outcome: CanonicalTerminalOutcome
  recordedAt: string
}>

export function buildCanonicalTerminalOutcomeCommand(
  input: CanonicalTerminalOutcomeInput,
): CanonicalClaimCommand {
  assertClaimForTerminalOutcome(input.snapshot, input.outcome, input.recordedAt)
  const { control, attempt } = input.snapshot
  const nextInvocationVersion = control.invocationVersion + 1
  const terminalControlState = input.outcome.kind === 'returned'
    ? { state: 'terminal' as const }
    : input.outcome.kind === 'failed'
      ? { state: 'retryable' as const, reason: 'pre_release_failure' as const }
      : { state: 'reconciliation_required' as const, attemptRef: attempt.attemptRef }
  const nextAttempt: DurableAttemptRow = {
    ...attempt,
    release: input.outcome.release === 'released'
      ? { state: 'released' as const, observedAt: input.recordedAt }
      : { state: input.outcome.release },
    outcome: outcomeRow(input.outcome),
    recordedAt: input.recordedAt,
  }
  const nextControl = {
    ...control,
    invocationVersion: nextInvocationVersion,
    control: {
      ...control.control,
      invocationVersion: nextInvocationVersion,
      control: terminalControlState,
    },
    ...(control.authorityBinding === undefined ? {} : {
      authorityBinding: {
        ...control.authorityBinding,
        invocationVersion: nextInvocationVersion,
      },
    }),
    ...(input.outcome.kind === 'returned' ? {
      sourceResultRef: input.outcome.resultRef,
      sourceResultDigest: input.outcome.resultDigest,
      terminalBusinessOutcome: input.outcome.businessOutcome,
      terminalResultReferenceable: input.outcome.resultReferenceable,
    } : {}),
    updatedAt: input.recordedAt,
  }
  const commandId = `action-invocation-terminal:v1:${attempt.invocationRef}:${attempt.attemptRef}:${attempt.effectGeneration}`
  return makeTransitionCommand({
    commandId,
    kind: `terminal_${input.outcome.kind}`,
    expectedInvocationVersion: control.invocationVersion,
    expectedEffectGeneration: attempt.effectGeneration,
    row: nextControl,
    currentAttemptWrite: nextAttempt,
    priorAttempt: attempt,
    recordedAt: input.recordedAt,
    material: {
      format: 'action-invocation-terminal:v1',
      invocationRef: attempt.invocationRef,
      attemptRef: attempt.attemptRef,
      effectGeneration: attempt.effectGeneration,
      outcome: input.outcome,
      recordedAt: input.recordedAt,
    },
  })
}

export async function persistCanonicalTerminalOutcome(
  input: CanonicalTerminalOutcomeInput,
  port: Pick<DurableActionInvocationPort, 'transact'>,
): Promise<PersistControlResult> {
  return await port.transact(buildCanonicalTerminalOutcomeCommand(input))
}

function outcomeRow(outcome: CanonicalTerminalOutcome): DurableAttemptOutcome {
  if (outcome.kind === 'returned') {
    return { state: 'returned', businessOutcome: outcome.businessOutcome }
  }
  if (outcome.kind === 'failed') {
    return { state: 'failed', retry: 'safe_before_release', errorDigest: outcome.errorDigest }
  }
  return {
    state: 'uncertain',
    retry: 'reconcile_before_retry',
    errorDigest: outcome.errorDigest,
    reconciliationRequiredAt: outcome.reconciliationRequiredAt,
  }
}

function projectAttempt(
  invocationRef: string,
  attempt: ActionAttemptView,
  recordedAt: string,
): DurableAttemptRow {
  return {
    invocationRef,
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    actor: attempt.actor,
    effectGeneration: attempt.effectGeneration,
    lease: attempt.lease,
    idempotency: attempt.idempotency,
    release: attempt.release,
    outcome: attempt.outcome,
    recordedAt,
  }
}

function makeTransitionCommand(input: Readonly<{
  commandId: string
  kind: string
  expectedInvocationVersion: number
  expectedEffectGeneration: number
  row: DurableControlRow
  currentAttemptWrite: DurableAttemptRow
  priorAttempt: DurableAttemptRow
  recordedAt: string
  material: StableHashValue
}>): CanonicalClaimCommand {
  const commandDigest = canonicalDigest(input.material)
  const history: Omit<DurableHistoryRow, 'invocationVersion' | 'recordedAt' | 'current'> = {
    invocationRef: input.row.invocationRef,
    commandId: input.commandId,
    commandDigest,
    commandResult: 'applied',
    kind: input.kind,
    effectGeneration: input.expectedEffectGeneration,
    actorRef: input.currentAttemptWrite.actor.callerRef,
    attemptTransition: {
      attemptRef: input.currentAttemptWrite.attemptRef,
      effectGeneration: input.currentAttemptWrite.effectGeneration,
      priorDigest: canonicalDigest(input.priorAttempt as never),
      nextDigest: canonicalDigest(input.currentAttemptWrite as never),
      priorReleaseState: input.priorAttempt.release.state,
      nextReleaseState: input.currentAttemptWrite.release.state,
      priorOutcomeState: input.priorAttempt.outcome.state,
      nextOutcomeState: input.currentAttemptWrite.outcome.state,
    },
  }
  return {
    commandId: input.commandId,
    commandDigest,
    expectedInvocationVersion: input.expectedInvocationVersion,
    expectedEffectGeneration: input.expectedEffectGeneration,
    row: input.row,
    currentAttemptWrite: input.currentAttemptWrite,
    history,
    canonicalCommandMaterial: input.material,
  }
}

async function readClaimSnapshot(
  port: Pick<DurableActionInvocationPort, 'readControl' | 'readAttempt'>,
  invocationRef: string,
  attemptRef: string,
): Promise<CanonicalClaimSnapshot | undefined> {
  const control = await port.readControl(invocationRef)
  if (control === undefined || control.currentAttemptRef !== attemptRef) return undefined
  const attempt = await port.readAttempt(invocationRef, attemptRef)
  return attempt === undefined ? undefined : { control, attempt }
}

function classifyDuplicate(snapshot: CanonicalClaimSnapshot, recordedAt: string): CanonicalClaimDecision {
  const { control, attempt } = snapshot
  if (control.control.control.state === 'terminal' || attempt.outcome.state === 'returned') {
    return { kind: 'terminal_replay', snapshot }
  }
  if (
    control.control.control.state === 'reconciliation_required'
    || attempt.outcome.state === 'uncertain'
    || attempt.release.state === 'possibly_released'
  ) {
    return { kind: 'refused', code: 'reconciliation_required', snapshot }
  }
  if (control.control.control.state === 'leased') {
    const expiresAt = Date.parse(attempt.lease.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.parse(recordedAt)) {
      return { kind: 'refused', code: 'lease_not_current', snapshot }
    }
    return { kind: 'active', snapshot }
  }
  if (attempt.outcome.state === 'failed') return { kind: 'terminal_replay', snapshot }
  return { kind: 'refused', code: 'lease_not_current', snapshot }
}

function assertActiveClaim(snapshot: CanonicalClaimSnapshot, recordedAt: string): void {
  const { control, attempt } = snapshot
  if (
    control.invocationRef !== attempt.invocationRef
    || control.currentAttemptRef !== attempt.attemptRef
    || control.currentEffectGeneration !== attempt.effectGeneration
    || control.control.control.state !== 'leased'
    || control.control.control.attemptRef !== attempt.attemptRef
    || attempt.outcome.state !== 'running'
    || attempt.release.state !== 'not_released'
    || Date.parse(attempt.lease.expiresAt) <= Date.parse(recordedAt)
  ) {
    throw new Error('action_invocation_claim_not_active')
  }
}

function assertClaimForTerminalOutcome(
  snapshot: CanonicalClaimSnapshot,
  outcome: CanonicalTerminalOutcome,
  recordedAt: string,
): void {
  const { control, attempt } = snapshot
  if (
    control.invocationRef !== attempt.invocationRef
    || control.currentAttemptRef !== attempt.attemptRef
    || control.currentEffectGeneration !== attempt.effectGeneration
    || (control.control.control.state !== 'leased' && control.control.control.state !== 'in_progress')
    || attempt.outcome.state !== 'running'
  ) {
    throw new Error('action_invocation_claim_not_current')
  }
  if (outcome.kind === 'returned' && (outcome.resultRef.trim().length === 0 || outcome.resultDigest.trim().length === 0)) {
    throw new Error('action_invocation_terminal_result_invalid')
  }
  if (outcome.kind === 'uncertain' && outcome.reconciliationRequiredAt <= recordedAt) {
    throw new Error('action_invocation_terminal_reconciliation_time_invalid')
  }
}

function validateClaimInput(input: CanonicalClaimInput): void {
  const references = [
    input.invocationRef,
    input.sourceRef,
    input.actor.callerRef,
    input.actor.principalRef,
    input.action.id,
    input.materialInputDigest,
    input.authority.reference,
    input.authority.decisionDigest,
    input.authority.targetDigest,
    input.attempt.attemptRef,
    input.attempt.operationKey,
    input.attempt.leaseOwner,
  ]
  if (references.some((value) => value.trim().length === 0)) {
    throw new Error('action_invocation_claim_identity_invalid')
  }
  if (!Number.isSafeInteger(input.invocationVersion) || input.invocationVersion < 1) {
    throw new Error('action_invocation_claim_version_invalid')
  }
  if (
    input.expectedInvocationVersion !== null
    && (!Number.isSafeInteger(input.expectedInvocationVersion) || input.expectedInvocationVersion < 0)
  ) {
    throw new Error('action_invocation_claim_expected_version_invalid')
  }
  if (
    input.expectedEffectGeneration !== undefined
    && (!Number.isSafeInteger(input.expectedEffectGeneration) || input.expectedEffectGeneration < 1)
  ) {
    throw new Error('action_invocation_claim_expected_generation_invalid')
  }
  if (
    !Number.isSafeInteger(input.attempt.attemptNumber)
    || input.attempt.attemptNumber < 1
    || !Number.isSafeInteger(input.attempt.effectGeneration)
    || input.attempt.effectGeneration < 1
  ) {
    throw new Error('action_invocation_claim_attempt_invalid')
  }
  if (input.authority.expiresAt <= input.recordedAt || input.attempt.leaseExpiresAt <= input.recordedAt) {
    throw new Error('action_invocation_claim_expiry_invalid')
  }
  if (input.authority.acceptedBasis.kind === 'approve_each'
    && input.authority.acceptedBasis.authorityRef !== input.authority.reference) {
    throw new Error('action_invocation_claim_authority_mismatch')
  }
  if (input.authority.acceptedBasis.kind === 'standing_mandate_use'
    && input.authority.acceptedBasis.grantEvidenceRef.trim().length === 0) {
    throw new Error('action_invocation_claim_authority_evidence_missing')
  }
  if (input.authority.acceptedBasis.kind === 'customer_request_mandate_use') {
    const basis = input.authority.acceptedBasis
    const authorityReferences = [
      basis.mandateRef,
      basis.mandateDigest,
      basis.grantRef,
      basis.grantDigest,
      basis.authorization.kind === 'explicit'
        ? basis.authorization.authorizationEvidenceRef
        : basis.authorization.standingPolicyRef,
      basis.authorization.kind === 'explicit'
        ? basis.authorization.authorizationEvidenceDigest
        : basis.authorization.standingPolicyDigest,
    ]
    if (authorityReferences.some((value) => value.trim().length === 0)) {
      throw new Error('action_invocation_claim_customer_request_authority_invalid')
    }
    if (
      !Number.isSafeInteger(basis.requestRevision)
      || basis.requestRevision < 0
      || !Number.isSafeInteger(basis.routeGeneration)
      || basis.routeGeneration < 1
    ) {
      throw new Error('action_invocation_claim_customer_request_authority_generation_invalid')
    }
    if (
      basis.authorization.kind === 'standing_low_risk'
      && basis.authorization.authorityUseRef.trim().length === 0
    ) {
      throw new Error('action_invocation_claim_customer_request_authority_use_invalid')
    }
  }
  if (input.authority.acceptedBasis.kind === 'public_capability_use') {
    const basis = input.authority.acceptedBasis
    if (
      basis.publicationRef.trim().length === 0
      || basis.operationRef.trim().length === 0
      || basis.bindingId.trim().length === 0
      || basis.bindingRegistrationHash.trim().length === 0
      || !Number.isSafeInteger(basis.publicationRevision)
      || basis.publicationRevision < 1
    ) {
      throw new Error('action_invocation_claim_public_capability_authority_invalid')
    }
  }
}
