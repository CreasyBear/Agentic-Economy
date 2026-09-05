import { type Infer, type ObjectType } from 'convex/values'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { actionExecutionTransactArgs } from '../../actionExecutionControl'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import {
  admitRegisteredTransport,
  parsePublishedOperationSnapshot,
} from '@/modules/capability-supply/public'
import {
  operationInvokeAuthorityValue,
  operationResultValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { recordMarketEvidenceFact } from '../../marketEvidence'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'

export const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type OperationInvocationRow = Doc<'capabilityOperationInvocations'>
type PersistedOperationAuthority = Infer<typeof operationInvokeAuthorityValue>
type DispatchCommand = ObjectType<typeof actionExecutionTransactArgs>
type OperationResult = Infer<typeof operationResultValue>
type Usage = Infer<typeof usageValue>

export type OpenDispatchValue = Readonly<{
  invocationRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  operationRef: string
  sellerOnboardingCanary?: SellerOnboardingCanaryExecutionEnvelope
  idempotencyKey: string
  inputDigest: string
  requestDigest: string
  grantRef: string
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  operationJson: string
  inputJson: string
  authority?: PersistedOperationAuthority
  workId?: string
  attemptRef?: string
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required'
}>

export type OperationDispatchProjectionShape = Readonly<{
  state: 'completed' | 'refused' | 'reconciliation_required'
  result?: OperationResult
  usage?: Usage
  evidenceHash?: string
  attemptRef?: string
  dispatchState: 'completed' | 'failed' | 'reconciliation_required'
}>

export type DispatchResult =
  | { kind: 'enqueued'; workId: string }
  | { kind: 'replayed'; workId: string }
  | { kind: 'refused' }

type SellerCanaryRearmInput = Readonly<{
  envelope: SellerOnboardingCanaryExecutionEnvelope
  authority: PersistedOperationAuthority
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  operationJson: string
  inputJson: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  now: number
}>

export const SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION =
  'Route call signing is unavailable.' as const

export type SafeBeforeReleaseSellerCanaryProof = Readonly<{
  refusalCode: 'pre_release_failed'
  attemptRef: string
  attemptNumber: number
  effectGeneration: number
  controlDigest: string
  attemptDigest: string
}>

export type OperationDispatchMutationResult =
  | { kind: 'applied' | 'duplicate'; attemptRef: string; effectGeneration: number }
  | { kind: 'claimed' }
  | { kind: 'cancelled'; workId?: string }
  | { kind: 'reconciliation_required'; attemptRef: string; effectGeneration: number }
  | { kind: 'refused'; code: string }

function assertOperationResultJson(value: OperationResult): void {
  if (value.kind === 'completed' && !isBoundedJsonValue(value.output)) {
    throw new Error('operation_invocation_result_json_invalid')
  }
}

function persistedDispatchMatches(row: OperationInvocationRow, dispatch: OpenDispatchValue): boolean {
  const outerFieldsMatch = [
    row.invocationRef === dispatch.invocationRef,
    row.principalId === dispatch.principalId,
    row.ownerId === dispatch.ownerId,
    row.credentialId === dispatch.credentialId,
    row.applicationRef === dispatch.applicationRef,
    row.environment === dispatch.environment,
    row.operationRef === dispatch.operationRef,
    canonicalOptionalCanary(row.sellerOnboardingCanary) === canonicalOptionalCanary(dispatch.sellerOnboardingCanary),
    row.idempotencyKey === dispatch.idempotencyKey,
    row.inputDigest === dispatch.inputDigest,
    row.requestDigest === dispatch.requestDigest,
    row.grantRef === dispatch.grantRef,
    row.grantGeneration === dispatch.grantGeneration,
    row.policyDigest === dispatch.policyDigest,
    row.grantExpiresAt === dispatch.grantExpiresAt,
    row.operationJson === dispatch.operationJson,
    row.inputJson === dispatch.inputJson,
    row.workId === dispatch.workId,
  ].every(Boolean)
  if (!outerFieldsMatch) return false
  if ((row.authority === undefined) !== (dispatch.authority === undefined)) return false
  return row.authority === undefined
    || canonicalDigest(row.authority as never) === canonicalDigest(dispatch.authority as never)
}

function canonicalOptionalCanary(
  value: SellerOnboardingCanaryExecutionEnvelope | undefined,
): string | undefined {
  return value === undefined ? undefined : canonicalDigest(value as never)
}

function commandMatchesDispatch(command: unknown, dispatch: OpenDispatchValue): boolean {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const operation = parsePublishedOperationSnapshot(dispatch.operationJson)
  if (operation === undefined) return false
  const row = commandRow
  const attempt = currentAttemptWrite
  const control = asRecord(row.control)
  const owner = asRecord(field(control, 'owner'))
  const action = asRecord(field(control, 'action'))
  const authorityBinding = asRecord(row.authorityBinding)
  const idempotency = asRecord(attempt.idempotency)
  const attemptActor = asRecord(attempt.actor)
  const authority = dispatch.authority
  const matches = [
    row.executionRef === dispatch.invocationRef,
    row.sourceRef === `operation-invocation-source:${dispatch.invocationRef}`,
    row.preparedMaterialDigest === dispatch.inputDigest,
    field(control, 'executionRef') === dispatch.invocationRef,
    field(owner, 'callerRef') === dispatch.credentialId,
    field(owner, 'principalRef') === dispatch.principalId,
    field(action, 'id') === operation.operationId,
    field(authorityBinding, 'executionRef') === dispatch.invocationRef,
    field(authorityBinding, 'digest') === field(asRecord(authority), 'decisionDigest'),
    field(authorityBinding, 'targetDigest') === field(asRecord(authority), 'targetDigest'),
    field(authorityBinding, 'expiresAt') === field(asRecord(authority), 'expiresAt'),
    attempt.executionRef === dispatch.invocationRef,
    field(attemptActor, 'callerRef') === dispatch.credentialId,
    field(attemptActor, 'principalRef') === dispatch.principalId,
    field(idempotency, 'operationKey') === dispatch.operationRef,
    field(idempotency, 'materialInputDigest') === dispatch.inputDigest,
    typeof attempt.attemptRef === 'string',
    typeof attempt.effectGeneration === 'number',
  ]
  return matches.every(Boolean)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function field(record: Record<string, unknown> | undefined, key: string): unknown {
  return record === undefined ? undefined : record[key]
}

function withoutSystemFields<T extends { _id: unknown; _creationTime: number }>(
  row: T,
): Omit<T, '_id' | '_creationTime'> {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...value } = row
  return value
}

async function canonicalCommandReadbackMatches(ctx: MutationCtx, command: unknown): Promise<boolean> {
  if (!isRecord(command)) return false
  const commandRow = command.row
  const currentAttemptWrite = command.currentAttemptWrite
  if (!isRecord(commandRow) || !isRecord(currentAttemptWrite)) return false
  const expectedAttempt = currentAttemptWrite
  const [control, attempt] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', String(commandRow.executionRef)))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptRef', (query) => (
        query.eq('executionRef', String(expectedAttempt.executionRef))
          .eq('attemptRef', String(expectedAttempt.attemptRef))
      ))
      .unique(),
  ])
  if (control === null || attempt === null) return false
  return canonicalDigest(withoutSystemFields(control) as never) === canonicalDigest(commandRow as never)
    && canonicalDigest(withoutSystemFields(attempt) as never) === canonicalDigest(expectedAttempt as never)
}

export async function enqueueInvocationDispatch(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  authority: PersistedOperationAuthority,
  now: number,
): Promise<DispatchResult> {
  if (row.state !== 'pending') return { kind: 'refused' as const }
  if (row.workId !== undefined) {
    if (
      row.authority === undefined
      || canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
    ) return { kind: 'refused' as const }
    return { kind: 'replayed' as const, workId: row.workId }
  }
  if (
    row.authority !== undefined
    && canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
  ) return { kind: 'refused' as const }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityOperationInvocationWorker.run,
    { invocationRef: row.invocationRef },
    {
      retry: true,
      onComplete: internal.capabilityOperationInvocations.completeWork,
      context: { invocationRef: row.invocationRef },
    },
  )
  await ctx.db.patch(row._id, {
    workId,
    authority,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: now,
  })
  return { kind: 'enqueued' as const, workId }
}

type KnownUnpaidSellerCanaryRefusalCode =
  | 'grant_not_found'
  | 'grant_generation_stale'
  | 'operation_not_current'
  | 'provider_refused'

const LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION =
  'Provider approval is not current.'

function persistedOperationIsCanonicalCredentiallessX402(
  row: OperationInvocationRow,
): boolean {
  if (row.operationJson === undefined || row.environment !== 'sandbox') return false
  const operation = parsePublishedOperationSnapshot(row.operationJson)
  if (operation === undefined) return false
  const admitted = admitRegisteredTransport({
    adapterId: operation.binding.adapter.adapterId,
    endpointUrl: operation.binding.endpointUrl,
    authority: operation.binding.authority,
    continuation: operation.binding.continuation,
    cancellation: operation.binding.cancellation,
    config: operation.binding.adapter.config,
  })
  if (admitted.kind !== 'admitted') return false
  const authority = operation.binding.authority
  const connectionAuthority = operation.connectionAuthority
  const identityAuthority = operation.identity.connectionAuthority
  if (
    authority.kind !== 'provider_connection'
    || connectionAuthority === undefined
    || identityAuthority === undefined
  ) return false
  return [
    operation.runtimeEnvironment === 'sandbox',
    operation.identity.adapterId === 'x402-fetch:v2',
    operation.binding.adapter.adapterId === 'x402-fetch:v2',
    operation.identity.payment.kind === 'x402',
    connectionAuthority.connectionRef === authority.connectionRef,
    connectionAuthority.providerRef === authority.providerRef,
    connectionAuthority.adapterId === 'x402-fetch:v2',
    canonicalDigest(connectionAuthority as never) === canonicalDigest(identityAuthority as never),
    admitted.transport.adapterId === 'x402-fetch:v2',
    admitted.transport.configJson === operation.transport.configJson,
    admitted.transport.configDigest === operation.transport.configDigest,
    operation.identity.transportConfigDigest === operation.transport.configDigest,
  ].every(Boolean)
}

function isExactLegacySellerCanaryProviderApprovalRefusal(
  row: OperationInvocationRow,
): boolean {
  const result = row.result
  return result?.kind === 'refused'
    && result.code === 'provider_refused'
    && result.operationRef === row.operationRef
    && result.retryable === false
    && result.nextAction === LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION
    && result.receipt === undefined
    && persistedOperationIsCanonicalCredentiallessX402(row)
}

function preClaimKnownUnpaidRefusalCode(
  row: OperationInvocationRow,
): KnownUnpaidSellerCanaryRefusalCode | undefined {
  const result = row.result
  const knownPreClaimProjection = [
    row.state === 'refused',
    row.dispatchState === 'failed',
    result?.kind === 'refused',
    row.workId !== undefined,
    row.attemptRef === undefined,
    row.evidenceHash === undefined,
    row.usage === undefined,
    row.reconciliation === undefined,
  ].every(Boolean)
  if (!knownPreClaimProjection || result?.kind !== 'refused') return undefined
  return result.code === 'grant_not_found'
    || result.code === 'grant_generation_stale'
    || result.code === 'operation_not_current'
    ? result.code
    : isExactLegacySellerCanaryProviderApprovalRefusal(row)
      ? 'provider_refused'
    : undefined
}

function refreshedSellerCanaryIdentityMatches(
  row: OperationInvocationRow,
  canary: SellerOnboardingCanaryExecutionEnvelope,
  refreshed: SellerCanaryRearmInput,
): boolean {
  return [
    refreshed.envelope.canaryRef === canary.canaryRef,
    refreshed.envelope.invocationRef === row.invocationRef,
    refreshed.envelope.operationRef === row.operationRef,
    refreshed.envelope.inputDigest === row.inputDigest,
    refreshed.envelope.idempotencyKey === row.idempotencyKey,
    refreshed.envelope.funding.principalId === row.principalId,
    refreshed.envelope.funding.ownerId === row.ownerId,
    refreshed.envelope.funding.credentialId === row.credentialId,
    refreshed.envelope.funding.applicationRef === row.applicationRef,
    refreshed.envelope.funding.grantRef === row.grantRef,
    refreshed.inputDigest === row.inputDigest,
    refreshed.idempotencyKey === row.idempotencyKey,
    refreshed.envelope.expiresAt > refreshed.now,
  ].every(Boolean)
}

async function sellerCanaryHasNoEffectEvidence(
  ctx: MutationCtx | QueryCtx,
  invocationRef: string,
): Promise<boolean> {
  const [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', invocationRef))
      .take(1),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', invocationRef))
      .take(1),
    ctx.db.query('moneyX402PaymentAttempts')
      // Payment attempts are keyed by attemptRef, but dispatchRef is the
      // invocation identity. Scan for that exact dispatch so a malformed or
      // legacy non-canonical attemptRef can never evade the no-effect fence.
      .filter((query) => query.eq(query.field('dispatchRef'), invocationRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .take(1),
    ctx.db.query('qualifiedUseReceipts')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('invocationRef'), invocationRef))
      .take(1),
  ])
  return [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals]
    .every((rows) => rows.length === 0)
}

export async function knownUnpaidSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: OperationInvocationRow,
): Promise<KnownUnpaidSellerCanaryRefusalCode | undefined> {
  const code = preClaimKnownUnpaidRefusalCode(row)
  if (code === undefined) return undefined
  return await sellerCanaryHasNoEffectEvidence(ctx, row.invocationRef) ? code : undefined
}

function exactSellerCanaryAttemptIdentityMatches(
  row: OperationInvocationRow,
  attempt: Doc<'actionExecutionAttempts'>,
  attemptNumber: number,
): boolean {
  return [
      attempt.executionRef === row.invocationRef,
      attempt.attemptNumber === attemptNumber,
      attempt.attemptRef === `operation-attempt:${row.invocationRef}:${attemptNumber}`,
      attempt.effectGeneration === attemptNumber,
      attempt.actor.callerRef === row.credentialId,
      attempt.actor.principalRef === row.principalId,
      attempt.idempotency.operationKey === row.operationRef,
      attempt.idempotency.materialInputDigest === row.inputDigest,
    ].every(Boolean)
}

function safelyClosedSellerCanaryAttempt(
  row: OperationInvocationRow,
  attempt: Doc<'actionExecutionAttempts'>,
  attemptNumber: number,
): boolean {
  if (
    !exactSellerCanaryAttemptIdentityMatches(row, attempt, attemptNumber)
    || attempt.release.state !== 'not_released'
  ) return false
  const outcome = attempt.outcome
  return (outcome.state === 'failed' && outcome.retry === 'safe_before_release')
    || (outcome.state === 'reconciled_not_released'
      && outcome.retry === 'safe_after_reconciliation')
}

function exactSafeBeforeReleaseAttemptHistory(
  row: OperationInvocationRow,
  attempts: Doc<'actionExecutionAttempts'>[],
  currentAttemptRef: string,
): Doc<'actionExecutionAttempts'> | undefined {
  const ordered = [...attempts].sort((left, right) => left.attemptNumber - right.attemptNumber)
  if (ordered.length === 0) return undefined
  const current = ordered.at(-1)
  if (
    current === undefined
    || current.attemptRef !== currentAttemptRef
    || current.outcome.state !== 'failed'
    || current.outcome.retry !== 'safe_before_release'
  ) return undefined
  return ordered.every((attempt, index) => (
    safelyClosedSellerCanaryAttempt(row, attempt, index + 1)
  )) ? current : undefined
}

function isGenericSafeBeforeReleaseRefusal(row: OperationInvocationRow): boolean {
  const canary = row.sellerOnboardingCanary
  const result = row.result
  if (canary === undefined || result?.kind !== 'refused') return false
  return [
    row.state === 'refused',
    row.dispatchState === 'failed',
    row.workId !== undefined,
    row.attemptRef !== undefined,
    row.usage === undefined,
    row.reconciliation === undefined,
    result.operationRef === row.operationRef,
    canary.invocationRef === row.invocationRef,
    canary.operationRef === row.operationRef,
    canary.inputDigest === row.inputDigest,
    canary.idempotencyKey === row.idempotencyKey,
    row.evidenceHash === undefined,
    result.code === 'pre_release_failed',
    result.retryable === false,
    result.nextAction === SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
    result.receipt === undefined,
  ].every(Boolean)
}

function safeBeforeReleaseCanonicalControlMatches(
  row: OperationInvocationRow,
  control: Doc<'actionExecutionControls'>,
): boolean {
  const canonical = control.control.control
  const binding = control.authorityBinding
  const operation = parsePublishedOperationSnapshot(row.operationJson ?? '')
  if (canonical.state !== 'retryable') return false
  if (binding === undefined || operation === undefined || row.authority === undefined) return false
  return [
      canonical.reason === 'pre_release_failure',
      control.executionRef === row.invocationRef,
      control.currentAttemptRef === row.attemptRef,
      control.sourceRef === `operation-invocation-source:${row.invocationRef}`,
      control.preparedMaterialDigest === row.inputDigest,
      control.control.owner.callerRef === row.credentialId,
      control.control.owner.principalRef === row.principalId,
      control.control.action.id === operation.operationId,
      binding.executionRef === row.invocationRef,
      binding.digest === row.authority.decisionDigest,
      binding.targetDigest === row.authority.targetDigest,
      binding.expiresAt === row.authority.expiresAt,
    ].every(Boolean)
}

function currentSafeBeforeReleaseAttempt(
  row: OperationInvocationRow,
  control: Doc<'actionExecutionControls'>,
  attempts: Doc<'actionExecutionAttempts'>[],
): Doc<'actionExecutionAttempts'> | undefined {
  const currentAttemptRef = control.currentAttemptRef
  if (currentAttemptRef === undefined) return undefined
  const attempt = exactSafeBeforeReleaseAttemptHistory(row, attempts, currentAttemptRef)
  if (attempt === undefined) return undefined
  if (control.currentEffectGeneration !== attempt.effectGeneration) return undefined
  return attempt
}

/**
 * Proves that the current seller-canary attempt stopped before any financial,
 * transport, usage, or provider effect. Managed seller-canary payment retries
 * were retired by the Formance cutover.
 */
export async function safeBeforeReleaseSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: OperationInvocationRow,
): Promise<SafeBeforeReleaseSellerCanaryProof | undefined> {
  if (!isGenericSafeBeforeReleaseRefusal(row)) return undefined

  const [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', row.invocationRef))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', row.invocationRef))
      .collect(),
    ctx.db.query('moneyX402PaymentAttempts')
      .filter((query) => query.eq(query.field('dispatchRef'), row.invocationRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef))
      .take(1),
    ctx.db.query('qualifiedUseReceipts')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('invocationRef'), row.invocationRef))
      .take(1),
  ])
  if (control === null) return undefined
  if (!safeBeforeReleaseCanonicalControlMatches(row, control)) return undefined
  const attempt = currentSafeBeforeReleaseAttempt(row, control, attempts)
  if (attempt === undefined) return undefined
  if ([paymentAttempts, usage, qualifiedUse, providerJournals].some((rows) => rows.length > 0)) {
    return undefined
  }
  return {
    refusalCode: 'pre_release_failed',
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    effectGeneration: attempt.effectGeneration,
    controlDigest: canonicalDigest(withoutSystemFields(control) as never),
    attemptDigest: canonicalDigest(withoutSystemFields(attempt) as never),
  }
}


/**
 * Re-arm one seller canary only when the prior worker stopped before claim and
 * every canonical effect ledger is empty. The enqueue, audit insert, and row
 * generation replacement share one Convex mutation transaction.
 */
export async function enqueueKnownUnpaidSellerCanaryRearm(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  const refusalCode = await knownUnpaidSellerCanaryRefusal(ctx, row)
  if (canary === undefined || refusalCode === undefined || row.workId === undefined) {
    return { kind: 'refused' }
  }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const priorWorkId = row.workId
  const priorResultDigest = canonicalDigest(row.result as never)
  const refusalProvenance = {
    phase: 'pre_claim' as const,
    source: refusalCode === 'provider_refused'
      ? 'legacy_exact_provider_approval' as const
      : 'known_preclaim_code' as const,
    ...(row.result?.kind !== 'refused' || row.result.nextAction === undefined
      ? {}
      : { nextAction: row.result.nextAction }),
  }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityOperationInvocationWorker.run,
    { invocationRef: row.invocationRef },
    {
      retry: true,
      onComplete: internal.capabilityOperationInvocations.completeWork,
      context: { invocationRef: row.invocationRef },
    },
  )
  const auditMaterial = {
    format: 'seller-onboarding-canary-rearm-audit:v1',
    canaryRef: canary.canaryRef,
    invocationRef: row.invocationRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    invocationRef: row.invocationRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode,
    priorResultDigest,
    refusalProvenance,
    rearmedEnvelopeDigest: canonicalDigest(refreshed.envelope as never),
    rearmedAuthorityDigest: canonicalDigest(refreshed.authority as never),
    rearmedAt: refreshed.now,
  })
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    operationJson: refreshed.operationJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    state: 'pending',
    workId,
    attemptRef: undefined,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    usage: undefined,
    evidenceHash: undefined,
    reconciliation: undefined,
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}

/**
 * Resume an exact seller canary only after its canonical attempt proves a
 * safe-before-release failure and every economic/effect ledger is empty.
 * Prior control and attempt history remain intact so the worker claims the
 * next attempt/effect generation.
 */
export async function enqueueSafeBeforeReleaseSellerCanaryResume(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  const proof = await safeBeforeReleaseSellerCanaryRefusal(ctx, row)
  if (canary === undefined || proof === undefined || row.workId === undefined) {
    return { kind: 'refused' }
  }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const priorWorkId = row.workId
  const priorResultDigest = canonicalDigest(row.result as never)
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityOperationInvocationWorker.run,
    { invocationRef: row.invocationRef },
    {
      retry: true,
      onComplete: internal.capabilityOperationInvocations.completeWork,
      context: { invocationRef: row.invocationRef },
    },
  )
  const commonRefusalProvenance = {
    phase: 'safe_before_release' as const,
    priorAttemptRef: proof.attemptRef,
    priorAttemptNumber: proof.attemptNumber,
    priorEffectGeneration: proof.effectGeneration,
    controlDigest: proof.controlDigest,
    attemptDigest: proof.attemptDigest,
  }
  const refusalProvenance = {
    ...commonRefusalProvenance,
    source: 'canonical_retryable_attempt' as const,
    nextAction: SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
  }
  const auditMaterial = {
    format: 'seller-onboarding-canary-rearm-audit:v1',
    canaryRef: canary.canaryRef,
    invocationRef: row.invocationRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode: proof.refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    invocationRef: row.invocationRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode: proof.refusalCode,
    priorResultDigest,
    refusalProvenance,
    rearmedEnvelopeDigest: canonicalDigest(refreshed.envelope as never),
    rearmedAuthorityDigest: canonicalDigest(refreshed.authority as never),
    rearmedAt: refreshed.now,
  })
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    operationJson: refreshed.operationJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    state: 'pending',
    workId,
    // Preserve attemptRef and the canonical control/attempt rows. The worker
    // uses that exact retryable snapshot to claim attempt N+1.
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    usage: undefined,
    evidenceHash: undefined,
    reconciliation: undefined,
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}

/**
 * Re-arm only the exact workless state produced by successful recovery.
 * Enqueue and the new workId patch occur in this mutation transaction, so a
 * concurrent replay observes one work generation rather than creating two.
 */
export async function enqueueRecoveredSellerCanaryReplay(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  refreshed: SellerCanaryRearmInput,
): Promise<DispatchResult> {
  const canary = row.sellerOnboardingCanary
  if (canary === undefined) return { kind: 'refused' }
  const retryableWorklessIdentity = [
    row.state === 'pending',
    row.result === undefined,
    row.workId === undefined,
    row.attemptRef === undefined,
    row.dispatchState === undefined,
    row.authority !== undefined,
    canary.invocationRef === row.invocationRef,
    canary.operationRef === row.operationRef,
    canary.inputDigest === row.inputDigest,
    canary.idempotencyKey === row.idempotencyKey,
  ].every(Boolean)
  if (!retryableWorklessIdentity || row.authority === undefined) return { kind: 'refused' }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityOperationInvocationWorker.run,
    { invocationRef: row.invocationRef },
    {
      retry: true,
      onComplete: internal.capabilityOperationInvocations.completeWork,
      context: { invocationRef: row.invocationRef },
    },
  )
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    operationJson: refreshed.operationJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    workId,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}

export async function dispatchHandler(
  ctx: MutationCtx,
  args: {
    invocationRef: string
    principalId: string
    credentialId: string
    operationRef: string
    authority?: PersistedOperationAuthority
    now: number
  },
): Promise<DispatchResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (
    row === null
    || row.principalId !== args.principalId
    || row.credentialId !== args.credentialId
    || row.operationRef !== args.operationRef
    || row.operationJson === undefined
    || row.inputJson === undefined
  ) return { kind: 'refused' as const }
  if (args.authority === undefined) return { kind: 'refused' as const }
  return await enqueueInvocationDispatch(ctx, row, args.authority, args.now)
}

export async function claimDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command }: { dispatch: OpenDispatchValue; command: DispatchCommand },
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', dispatch.invocationRef))
    .unique()
  if (
    row === null
    || !persistedDispatchMatches(row, dispatch)
    || row.state !== 'pending'
    || row.dispatchState === 'completed'
    || row.dispatchState === 'reconciliation_required'
    || dispatch.authority === undefined
    || !commandMatchesDispatch(command, dispatch)
  ) return { kind: 'refused', code: 'outer_identity_refused' }
  const canonicalResult = await ctx.runMutation(
    internal.actionExecutionControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef: attempt.attemptRef,
    updatedAt: Date.now(),
  })
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}

function projectedOuterMatches(row: OperationInvocationRow, projection: OperationDispatchProjectionShape): boolean {
  return [
    row.state === projection.state,
    row.dispatchState === projection.dispatchState,
    row.attemptRef === projection.attemptRef,
    canonicalDigest((row.result ?? null) as never) === canonicalDigest((projection.result ?? null) as never),
    canonicalDigest((row.usage ?? null) as never) === canonicalDigest((projection.usage ?? null) as never),
    (row.evidenceHash ?? null) === (projection.evidenceHash ?? null),
  ].every(Boolean)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function validFinalizationEnvelope(
  row: OperationInvocationRow | null,
  dispatch: OpenDispatchValue,
  command: DispatchCommand,
  projection: OperationDispatchProjectionShape,
): row is OperationInvocationRow {
  if (row === null || !isRecord(projection)) return false
  return [
    persistedDispatchMatches(row, dispatch),
    ['completed', 'refused', 'reconciliation_required'].includes(projection.state),
    ['completed', 'failed', 'reconciliation_required'].includes(projection.dispatchState),
    isOptionalString(projection.attemptRef),
    commandMatchesDispatch(command, dispatch),
  ].every(Boolean)
}

async function terminalFinalizationResult(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  command: DispatchCommand,
  projection: OperationDispatchProjectionShape,
): Promise<OperationDispatchMutationResult | null> {
  if (row.state === 'pending') return null
  if (!projectedOuterMatches(row, projection)) return { kind: 'refused', code: 'outer_state_refused' }
  if (!await canonicalCommandReadbackMatches(ctx, command)) return { kind: 'refused', code: 'outer_state_refused' }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  return { kind: 'duplicate', attemptRef: attempt.attemptRef, effectGeneration: attempt.effectGeneration }
}

async function recordFinalizationEvidence(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  state: OperationDispatchProjectionShape['state'],
): Promise<void> {
  if (state === 'completed') {
    const completedAt = Date.now()
    await recordMarketEvidenceFact(ctx, 'ae_invocation_completed', row.invocationRef, completedAt, {
      operationRef: row.operationRef,
      durationMs: Math.max(0, completedAt - row.createdAt),
    })
  }
  if (state === 'reconciliation_required') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', row.invocationRef, Date.now())
  }
}

function callProjectionOperation(row: OperationInvocationRow) {
  if (row.operationJson === undefined) return undefined
  return parsePublishedOperationSnapshot(row.operationJson)
}

function accountReceiptFromProjection(projection: OperationDispatchProjectionShape) {
  const result = projection.result
  const receipt = result !== undefined && 'receipt' in result ? result.receipt : undefined
  return {
    receipt,
    accountReceipt: receipt?.commercialModel === 'account_aud' ? receipt : undefined,
  }
}

function projectedAudAmountUnits(
  projection: OperationDispatchProjectionShape,
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): string | undefined {
  if (accountReceipt?.buyerCharge.currency === 'AUD' && accountReceipt.buyerCharge.exponent === 6) {
    return accountReceipt.buyerCharge.units
  }
  const amount = projection.usage?.amount
  return amount?.currency === 'AUD' && amount.exponent === 6 ? amount.units : undefined
}

function projectedPaymentState(
  accountReceipt: ReturnType<typeof accountReceiptFromProjection>['accountReceipt'],
): 'settled' | 'released' | 'unknown' | 'not_applicable' {
  if (accountReceipt?.state === 'settled') return 'settled'
  if (accountReceipt?.state === 'refunded') return 'released'
  if (accountReceipt?.state === 'reconciliation_required') return 'unknown'
  return 'not_applicable'
}

function projectedDeliveryState(
  state: OperationDispatchProjectionShape['state'],
): 'delivered' | 'not_delivered' | 'unknown' {
  if (state === 'completed') return 'delivered'
  return state === 'reconciliation_required' ? 'unknown' : 'not_delivered'
}

async function providerObligationProjectionFields(
  ctx: MutationCtx,
  invocationRef: string,
) {
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  return obligation === null
    ? {}
    : {
        providerObligationState: obligation.state,
        providerAmountUnits: obligation.providerAmountUnits,
      }
}

export async function upsertCallProjection(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  projection: OperationDispatchProjectionShape,
  now: number,
): Promise<void> {
  if (row.sellerOnboardingCanary !== undefined) return
  const operation = callProjectionOperation(row)
  if (operation === undefined) throw new Error('call_projection_operation_invalid')
  const { receipt, accountReceipt } = accountReceiptFromProjection(projection)
  const audAmountUnits = projectedAudAmountUnits(projection, accountReceipt)
  const callState = projection.state === 'reconciliation_required'
    ? 'outcome_unknown' as const
    : projection.state
  const providerFields = await providerObligationProjectionFields(ctx, row.invocationRef)
  const fields = {
    accountRef: row.ownerId,
    principalRef: row.principalId,
    credentialRef: row.credentialId,
    applicationRef: row.applicationRef,
    operationRef: row.operationRef,
    providerRef: operation.identity.businessId,
    operationLabel: operation.contract.name,
    state: callState,
    deliveryState: projectedDeliveryState(projection.state),
    paymentState: projectedPaymentState(accountReceipt),
    ...providerFields,
    ...(audAmountUnits === undefined ? {} : { audAmountUnits }),
    ...(receipt?.receiptRef === undefined ? {} : { receiptRef: receipt.receiptRef }),
    ...(projection.state !== 'reconciliation_required'
      ? {}
      : { recoveryRef: row.invocationRef }),
    latencyMs: Math.max(0, now - row.createdAt),
    updatedAt: now,
  }
  const existing = await ctx.db.query('capabilityOperationCallProjections')
    .withIndex('by_callRef', (query) => query.eq('callRef', row.invocationRef))
    .unique()
  const next = {
    callRef: row.invocationRef,
    ...fields,
    createdAt: row.createdAt,
  }
  if (existing === null) {
    await ctx.db.insert('capabilityOperationCallProjections', next)
  } else {
    await ctx.db.patch(existing._id, fields)
  }
}

export async function finalizeDispatchHandler(
  ctx: MutationCtx,
  { dispatch, command, projection }: {
    dispatch: OpenDispatchValue
    command: DispatchCommand
    projection: OperationDispatchProjectionShape
  },
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', dispatch.invocationRef))
    .unique()
  if (!validFinalizationEnvelope(row, dispatch, command, projection)) {
    return { kind: 'refused', code: 'outer_identity_refused' }
  }
  const normalizedProjection = projection
  if (normalizedProjection.result !== undefined) {
    assertOperationResultJson(normalizedProjection.result)
  }
  const terminalResult = await terminalFinalizationResult(ctx, row, command, normalizedProjection)
  if (terminalResult !== null) return terminalResult
  const canonicalResult = await ctx.runMutation(
    internal.actionExecutionControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  const finalizedAt = Date.now()
  await ctx.db.patch(row._id, {
    state: normalizedProjection.state,
    result: normalizedProjection.result,
    usage: normalizedProjection.usage,
    evidenceHash: normalizedProjection.evidenceHash,
    attemptRef: normalizedProjection.attemptRef,
    dispatchState: normalizedProjection.dispatchState,
    updatedAt: finalizedAt,
  })
  await upsertCallProjection(ctx, row, normalizedProjection, finalizedAt)
  await recordFinalizationEvidence(ctx, row, normalizedProjection.state)
  return {
    kind: canonicalResult.kind,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
  }
}

type CancellationArgs = Readonly<{
  invocationRef: string
  principalId: string
  credentialId: string
  idempotencyKey: string
}>

function cancellationIdentityMatches(row: OperationInvocationRow | null, args: CancellationArgs): row is OperationInvocationRow {
  if (row === null) return false
  return [
    row.principalId === args.principalId,
    row.credentialId === args.credentialId,
    row.idempotencyKey === args.idempotencyKey,
  ].every(Boolean)
}

function cancelledResult(workId?: string): OperationDispatchMutationResult {
  return workId === undefined ? { kind: 'cancelled' } : { kind: 'cancelled', workId }
}

async function patchCancelledInvocation(ctx: MutationCtx, row: OperationInvocationRow): Promise<void> {
  await ctx.db.patch(row._id, {
    state: 'cancelled',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'invocation_cancelled',
      retryable: false,
    },
    workId: undefined,
    attemptRef: undefined,
    dispatchState: 'failed',
    updatedAt: Date.now(),
  })
}

function cancellationNeedsReconciliation(
  canonical: Doc<'actionExecutionControls'>['control']['control'],
  attemptRef: string | undefined,
): boolean {
  if (attemptRef === undefined) return true
  if (canonical.state === 'reconciliation_required') return true
  return canonical.state === 'leased' && canonical.release === 'possibly_released'
}

async function patchCancellationReconciliation(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  attemptRef: string,
  effectGeneration: number,
): Promise<void> {
  if (row.state !== 'pending') return
  await ctx.db.patch(row._id, {
    state: 'reconciliation_required',
    dispatchState: 'reconciliation_required',
    result: {
      kind: 'reconciliation_required',
      invocationRef: row.invocationRef,
      operationRef: row.operationRef,
      evidence: {
        attemptRef,
        effectGeneration,
        requiredAt: new Date(Date.now() + 1_000).toISOString(),
        retry: 'reconcile_before_retry',
        evidenceSource: `operation:${row.operationRef}`,
      },
    },
    attemptRef,
    updatedAt: Date.now(),
  })
}

async function markCancellationClaimed(
  ctx: MutationCtx,
  row: OperationInvocationRow,
  attemptRef: string | undefined,
): Promise<void> {
  if (row.state !== 'pending' || attemptRef === undefined) return
  await ctx.db.patch(row._id, {
    dispatchState: 'running',
    attemptRef,
    updatedAt: Date.now(),
  })
}

export async function cancelBeforeClaimHandler(
  ctx: MutationCtx,
  args: CancellationArgs,
): Promise<OperationDispatchMutationResult> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (!cancellationIdentityMatches(row, args)) return { kind: 'refused', code: 'invocation_not_found' }
  if (row.state === 'cancelled') return cancelledResult(row.workId)
  const control = await ctx.db.query('actionExecutionControls')
    .withIndex('by_executionRef', (query) => query.eq('executionRef', args.invocationRef))
    .unique()
  if (control === null && row.state === 'pending') {
    const workId = row.workId
    await patchCancelledInvocation(ctx, row)
    return cancelledResult(workId)
  }
  if (control === null) return { kind: 'refused', code: 'invocation_state_refused' }
  const canonical = control.control.control
  const attemptRef = control.currentAttemptRef
  const effectGeneration = control.currentEffectGeneration ?? 1
  if (canonical.state === 'cancelled') {
    await patchCancelledInvocation(ctx, row)
    return { kind: 'cancelled' }
  }
  if (cancellationNeedsReconciliation(canonical, attemptRef)) {
    const reconciliationAttemptRef = attemptRef ?? `operation-attempt:${row.invocationRef}:1`
    await patchCancellationReconciliation(ctx, row, reconciliationAttemptRef, effectGeneration)
    return {
      kind: 'reconciliation_required',
      attemptRef: reconciliationAttemptRef,
      effectGeneration,
    }
  }
  await markCancellationClaimed(ctx, row, attemptRef)
  return { kind: 'claimed' }
}

export async function openDispatchHandler(
  ctx: QueryCtx,
  args: { invocationRef: string },
): Promise<OpenDispatchValue | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique()
  if (
    row === null
    || row.operationJson === undefined
    || row.inputJson === undefined
  ) return null
  return {
    ...(row.commitmentRef === undefined ? {} : { commitmentRef: row.commitmentRef }),
    invocationRef: row.invocationRef,
    principalId: row.principalId,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    environment: row.environment,
    state: row.state,
    operationRef: row.operationRef,
    ...(row.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(row.sellerOnboardingCanary) }),
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    operationJson: row.operationJson,
    inputJson: row.inputJson,
    ...(row.authority === undefined ? {} : { authority: structuredClone(row.authority) }),
    ...(row.workId === undefined ? {} : { workId: row.workId }),
    ...(row.attemptRef === undefined ? {} : { attemptRef: row.attemptRef }),
    ...(row.dispatchState === undefined ? {} : { dispatchState: row.dispatchState }),
  }
}
