import { type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  admitRegisteredTransport,
  parsePublishedToolSnapshot,
} from '@/modules/capability-supply/public'
import { callAuthorityValue } from '@/modules/capability-execution/convex'
import type { SellerOnboardingCanaryExecutionEnvelope } from '@/modules/capability-supply/public'
import type { DispatchResult } from './callIdentity'
import { withoutSystemFields } from './callIdentity'

const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type CallRow = Doc<'capabilityCalls'>
type PersistedOperationAuthority = Infer<typeof callAuthorityValue>

type SellerCanaryRearmInput = Readonly<{
  envelope: SellerOnboardingCanaryExecutionEnvelope
  authority: PersistedOperationAuthority
  grantGeneration: number
  policyDigest: string
  grantExpiresAt: number
  toolJson: string
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
type KnownUnpaidSellerCanaryRefusalCode =
  | 'grant_not_found'
  | 'grant_generation_stale'
  | 'operation_not_current'
  | 'provider_refused'

const LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION =
  'Provider approval is not current.'

function persistedOperationIsCanonicalCredentiallessX402(
  row: CallRow,
): boolean {
  if (row.toolJson === undefined || row.environment !== 'sandbox') return false
  const operation = parsePublishedToolSnapshot(row.toolJson)
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
  row: CallRow,
): boolean {
  const result = row.result
  return result?.kind === 'refused'
    && result.code === 'provider_refused'
    && result.toolRef === row.toolRef
    && result.retryable === false
    && result.nextAction === LEGACY_SELLER_CANARY_PROVIDER_APPROVAL_NEXT_ACTION
    && result.receipt === undefined
    && persistedOperationIsCanonicalCredentiallessX402(row)
}

function preClaimKnownUnpaidRefusalCode(
  row: CallRow,
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
  row: CallRow,
  canary: SellerOnboardingCanaryExecutionEnvelope,
  refreshed: SellerCanaryRearmInput,
): boolean {
  return [
    refreshed.envelope.canaryRef === canary.canaryRef,
    refreshed.envelope.callRef === row.callRef,
    refreshed.envelope.toolRef === row.toolRef,
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
  callRef: string,
): Promise<boolean> {
  const [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', callRef))
      .take(1),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', callRef))
      .take(1),
    ctx.db.query('moneyX402PaymentAttempts')
      // Payment attempts are keyed by attemptRef, but dispatchRef is the
      // invocation identity. Scan for that exact dispatch so a malformed or
      // legacy non-canonical attemptRef can never evade the no-effect fence.
      .filter((query) => query.eq(query.field('dispatchRef'), callRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .take(1),
    ctx.db.query('qualifiedUseReceipts')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('callRef'), callRef))
      .take(1),
  ])
  return [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals]
    .every((rows) => rows.length === 0)
}

export async function knownUnpaidSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: CallRow,
): Promise<KnownUnpaidSellerCanaryRefusalCode | undefined> {
  const code = preClaimKnownUnpaidRefusalCode(row)
  if (code === undefined) return undefined
  return await sellerCanaryHasNoEffectEvidence(ctx, row.callRef) ? code : undefined
}

function exactSellerCanaryAttemptIdentityMatches(
  row: CallRow,
  attempt: Doc<'actionExecutionAttempts'>,
  attemptNumber: number,
): boolean {
  return [
      attempt.executionRef === row.callRef,
      attempt.attemptNumber === attemptNumber,
      attempt.attemptRef === `operation-attempt:${row.callRef}:${attemptNumber}`,
      attempt.effectGeneration === attemptNumber,
      attempt.actor.callerRef === row.credentialId,
      attempt.actor.principalRef === row.principalId,
      attempt.idempotency.operationKey === row.toolRef,
      attempt.idempotency.materialInputDigest === row.inputDigest,
    ].every(Boolean)
}

function safelyClosedSellerCanaryAttempt(
  row: CallRow,
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
  row: CallRow,
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

function isGenericSafeBeforeReleaseRefusal(row: CallRow): boolean {
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
    result.toolRef === row.toolRef,
    canary.callRef === row.callRef,
    canary.toolRef === row.toolRef,
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
  row: CallRow,
  control: Doc<'actionExecutionControls'>,
): boolean {
  const canonical = control.control.control
  const binding = control.authorityBinding
  const operation = parsePublishedToolSnapshot(row.toolJson ?? '')
  if (canonical.state !== 'retryable') return false
  if (binding === undefined || operation === undefined || row.authority === undefined) return false
  return [
      canonical.reason === 'pre_release_failure',
      control.executionRef === row.callRef,
      control.currentAttemptRef === row.attemptRef,
      control.sourceRef === `operation-invocation-source:${row.callRef}`,
      control.preparedMaterialDigest === row.inputDigest,
      control.control.owner.callerRef === row.credentialId,
      control.control.owner.principalRef === row.principalId,
      control.control.action.id === operation.operationId,
      binding.executionRef === row.callRef,
      binding.digest === row.authority.decisionDigest,
      binding.targetDigest === row.authority.targetDigest,
      binding.expiresAt === row.authority.expiresAt,
    ].every(Boolean)
}

function currentSafeBeforeReleaseAttempt(
  row: CallRow,
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
  row: CallRow,
): Promise<SafeBeforeReleaseSellerCanaryProof | undefined> {
  if (!isGenericSafeBeforeReleaseRefusal(row)) return undefined

  const [control, attempts, paymentAttempts, usage, qualifiedUse, providerJournals] = await Promise.all([
    ctx.db.query('actionExecutionControls')
      .withIndex('by_executionRef', (query) => query.eq('executionRef', row.callRef))
      .unique(),
    ctx.db.query('actionExecutionAttempts')
      .withIndex('by_executionRef_and_attemptNumber', (query) => query.eq('executionRef', row.callRef))
      .collect(),
    ctx.db.query('moneyX402PaymentAttempts')
      .filter((query) => query.eq(query.field('dispatchRef'), row.callRef))
      .take(1),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
      .take(1),
    ctx.db.query('qualifiedUseReceipts')
      .withIndex('by_callRef', (query) => query.eq('callRef', row.callRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('callRef'), row.callRef))
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
  row: CallRow,
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
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  const auditMaterial = {
    format: 'seller-onboarding-canary-rearm-audit:v1',
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
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
    toolJson: refreshed.toolJson,
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
      callRef: row.callRef,
      toolRef: row.toolRef,
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
  row: CallRow,
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
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
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
    callRef: row.callRef,
    priorWorkId,
    rearmedWorkId: workId,
    refusalCode: proof.refusalCode,
    priorResultDigest,
    refusalProvenance,
  } as const
  await ctx.db.insert('sellerOnboardingCanaryRearmAudits', {
    auditRef: `seller-canary-rearm:${canonicalDigest(auditMaterial as never).slice('sha256:'.length)}`,
    canaryRef: canary.canaryRef,
    callRef: row.callRef,
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
    toolJson: refreshed.toolJson,
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
      callRef: row.callRef,
      toolRef: row.toolRef,
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
  row: CallRow,
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
    canary.callRef === row.callRef,
    canary.toolRef === row.toolRef,
    canary.inputDigest === row.inputDigest,
    canary.idempotencyKey === row.idempotencyKey,
  ].every(Boolean)
  if (!retryableWorklessIdentity || row.authority === undefined) return { kind: 'refused' }
  if (!refreshedSellerCanaryIdentityMatches(row, canary, refreshed)) return { kind: 'refused' }

  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  await ctx.db.patch(row._id, {
    sellerOnboardingCanary: structuredClone(refreshed.envelope),
    grantGeneration: refreshed.grantGeneration,
    policyDigest: refreshed.policyDigest,
    grantExpiresAt: refreshed.grantExpiresAt,
    toolJson: refreshed.toolJson,
    inputJson: refreshed.inputJson,
    inputDigest: refreshed.inputDigest,
    requestDigest: refreshed.requestDigest,
    idempotencyKey: refreshed.idempotencyKey,
    authority: structuredClone(refreshed.authority),
    workId,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: refreshed.now,
  })
  return { kind: 'enqueued', workId }
}