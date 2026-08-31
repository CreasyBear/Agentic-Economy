import { type Infer, type ObjectType } from 'convex/values'
import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { actionInvocationTransactArgs } from '../../actionInvocationControl'
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
import type {
  X402PaymentAuthorizationFailureCode,
  X402PaymentAuthorizationFailureDetail,
} from '../../moneyX402PaymentAuthorization'

export const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

type OperationInvocationRow = Doc<'capabilityOperationInvocations'>
type PersistedOperationAuthority = Infer<typeof operationInvokeAuthorityValue>
type DispatchCommand = ObjectType<typeof actionInvocationTransactArgs>
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
  refusalCode: 'pre_release_failed' | 'payment_signature_unavailable'
  attemptRef: string
  attemptNumber: number
  effectGeneration: number
  controlDigest: string
  attemptDigest: string
  authorizationFailureCode?: X402PaymentAuthorizationFailureCode
  authorizationFailureDetail?: X402PaymentAuthorizationFailureDetail
  managedUnsignedRefundProof?: Readonly<{
    paymentAttemptDigest: string
    reservationDigest: string
    currentHistoryDigest: string
  }>
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
  return [
    row.invocationRef === dispatch.invocationRef,
    row.sourceRef === `operation-invocation-source:${dispatch.invocationRef}`,
    row.preparedMaterialDigest === dispatch.inputDigest,
    field(control, 'invocationRef') === dispatch.invocationRef,
    field(owner, 'callerRef') === dispatch.credentialId,
    field(owner, 'principalRef') === dispatch.principalId,
    field(action, 'id') === operation.operationId,
    field(authorityBinding, 'invocationRef') === dispatch.invocationRef,
    field(authorityBinding, 'digest') === field(asRecord(authority), 'decisionDigest'),
    field(authorityBinding, 'targetDigest') === field(asRecord(authority), 'targetDigest'),
    field(authorityBinding, 'expiresAt') === field(asRecord(authority), 'expiresAt'),
    attempt.invocationRef === dispatch.invocationRef,
    field(attemptActor, 'callerRef') === dispatch.credentialId,
    field(attemptActor, 'principalRef') === dispatch.principalId,
    field(idempotency, 'operationKey') === dispatch.operationRef,
    field(idempotency, 'materialInputDigest') === dispatch.inputDigest,
    typeof attempt.attemptRef === 'string',
    typeof attempt.effectGeneration === 'number',
  ].every(Boolean)
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
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', String(commandRow.invocationRef)))
      .unique(),
    ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (query) => (
        query.eq('invocationRef', String(expectedAttempt.invocationRef))
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
  const [control, attempts, reservations, paymentAttempts, usage, qualifiedUse, providerJournals] = await Promise.all([
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .take(1),
    ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (query) => query.eq('invocationRef', invocationRef))
      .take(1),
    ctx.db.query('moneyExternalSpendReservations')
      .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (query) => (
        query.eq('invocationRef', invocationRef)
      ))
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
  return [control, attempts, reservations, paymentAttempts, usage, qualifiedUse, providerJournals]
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
  attempt: Doc<'actionInvocationAttempts'>,
  attemptNumber: number,
): boolean {
  return [
      attempt.invocationRef === row.invocationRef,
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
  attempt: Doc<'actionInvocationAttempts'>,
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
  attempts: Doc<'actionInvocationAttempts'>[],
  currentAttemptRef: string,
): Doc<'actionInvocationAttempts'> | undefined {
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

type SafeBeforeReleaseOuterKind = 'generic_pre_release' | 'managed_unsigned_refund'

function exactAmountMatches(
  left: Readonly<{ currency: string; units: string; exponent: number }>,
  right: Readonly<{ currency: string; units: string; exponent: number }>,
): boolean {
  return left.currency === right.currency
    && left.units === right.units
    && left.exponent === right.exponent
}

function managedUnsignedRefundOuterMatches(row: OperationInvocationRow): boolean {
  const canary = row.sellerOnboardingCanary
  const result = row.result
  if (canary === undefined || result?.kind !== 'refused' || result.receipt === undefined) return false
  const receipt = result.receipt
  const operation = parsePublishedOperationSnapshot(row.operationJson ?? '')
  const payment = operation?.identity.payment
  const zero = {
    currency: canary.funding.requestedSpend.currency,
    units: '0',
    exponent: canary.funding.requestedSpend.exponent,
  }
  return payment?.kind === 'x402' && [
    result.code === 'payment_signature_unavailable',
    result.retryable === false,
    result.nextAction === undefined,
    row.evidenceHash !== undefined,
    receipt.receiptRef === `seller-canary-receipt:${canary.canaryRef}:${row.attemptRef}`,
    receipt.state === 'refunded',
    receipt.network === payment.network,
    receipt.asset.toLowerCase() === payment.asset.toLowerCase(),
    exactAmountMatches(receipt.providerQuotedAmount, canary.funding.requestedSpend),
    exactAmountMatches(receipt.agenticEconomyFee, zero),
    exactAmountMatches(receipt.totalBuyerAuthorization, zero),
    receipt.priceDigest === canary.priceDigest,
    receipt.transactionRef === undefined,
    receipt.settlementTransactionHash === undefined,
    receipt.accountingTransactionRefs === undefined,
    receipt.paymentIdentifier !== undefined,
    receipt.externalSettlementRef !== undefined,
    receipt.refundState === 'released',
    receipt.lossState === 'none',
    receipt.evidenceHash === row.evidenceHash,
  ].every(Boolean)
}

function safeBeforeReleaseOuterKind(
  row: OperationInvocationRow,
): SafeBeforeReleaseOuterKind | undefined {
  const canary = row.sellerOnboardingCanary
  const result = row.result
  if (canary === undefined) return undefined
  if (result === undefined) return undefined
  if (result.kind !== 'refused') return undefined
  const common = [
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
  ].every(Boolean)
  if (!common) return undefined
  const genericPreRelease = [
    row.evidenceHash === undefined,
    result.code === 'pre_release_failed',
    result.retryable === false,
    result.nextAction === SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
    result.receipt === undefined,
  ].every(Boolean)
  if (genericPreRelease) return 'generic_pre_release'
  return managedUnsignedRefundOuterMatches(row)
    ? 'managed_unsigned_refund'
    : undefined
}

const unsignedPaymentFields = [
  'paymentSignatureDigest',
  'paymentUnsignedMaterialJson',
  'paymentUnsignedMaterialDigest',
  'paymentSigningIdempotencyKey',
  'paymentPayer',
  'paymentNonce',
  'paymentAuthorizationValidBefore',
  'paymentAuthorizationExpiresAt',
  'paymentSigningClaimedAt',
  'submissionStartedAt',
] as const

function paymentLaneMatches(
  paymentAttempt: Doc<'actionInvocationAttempts'>,
  currentAttempt: Doc<'actionInvocationAttempts'>,
  payment: Doc<'moneyX402PaymentAttempts'>,
  reservation: Doc<'moneyExternalSpendReservations'>,
): boolean {
  const isCurrent = [
    paymentAttempt.attemptRef === currentAttempt.attemptRef,
    paymentAttempt.effectGeneration === currentAttempt.effectGeneration,
  ].every(Boolean)
  if (isCurrent) return true
  if (paymentAttempt.attemptNumber >= currentAttempt.attemptNumber) return false
  if (paymentAttempt.outcome.state === 'reconciled_not_released') {
    return [
      paymentAttempt.outcome.retry === 'safe_after_reconciliation',
      payment.reconciliationEvidenceRef !== undefined,
      payment.reconciliationEvidenceDigest !== undefined,
      payment.reconciliationEvidenceRef === reservation.reconciliationEvidenceRef,
      payment.reconciliationEvidenceDigest === reservation.reconciliationEvidenceDigest,
      payment.paymentResponseDigest !== undefined,
      payment.paymentResponseDigest === reservation.paymentResponseDigest,
      reservation.submissionStatus === 'unknown',
    ].every(Boolean)
  }
  const failedSafeBeforeRelease = paymentAttempt.outcome.state === 'failed'
    ? paymentAttempt.outcome.retry === 'safe_before_release'
    : false
  return [
    failedSafeBeforeRelease,
    payment.paymentResponseDigest === undefined,
    payment.reconciliationEvidenceRef === undefined,
    payment.reconciliationEvidenceDigest === undefined,
    reservation.paymentResponseDigest === undefined,
    reservation.reconciliationEvidenceRef === undefined,
    reservation.reconciliationEvidenceDigest === undefined,
    reservation.submissionStatus === 'not_submitted',
  ].every(Boolean)
}

function paymentReservationIdentityMatches(input: Readonly<{
  row: OperationInvocationRow
  canary: SellerOnboardingCanaryExecutionEnvelope
  operation: NonNullable<ReturnType<typeof parsePublishedOperationSnapshot>>
  providerRef: string
  paymentAttempt: Doc<'actionInvocationAttempts'>
  payment: Doc<'moneyX402PaymentAttempts'>
  reservation: Doc<'moneyExternalSpendReservations'>
}>): boolean {
  const { row, canary, operation, providerRef, paymentAttempt, payment, reservation } = input
  const operationPayment = operation.identity.payment
  if (operationPayment.kind !== 'x402') return false
  return [
    payment.dispatchRef === row.invocationRef,
    payment.operationRef === row.operationRef,
    payment.inputDigest === row.inputDigest,
    payment.effectGeneration === paymentAttempt.effectGeneration,
    payment.operationKeyDigest === payment.paymentIdentifier,
    payment.providerEndpoint === operation.binding.endpointUrl,
    payment.credentialRef === 'env:AE_X402_CDP_ACCOUNT_NAME',
    payment.network === operationPayment.network,
    payment.asset.toLowerCase() === operationPayment.asset.toLowerCase(),
    payment.payTo.toLowerCase() === operationPayment.payTo.toLowerCase(),
    payment.payTo.toLowerCase() === canary.sellerPayTo.toLowerCase(),
    reservation.invocationRef === row.invocationRef,
    reservation.operationRef === row.operationRef,
    reservation.attemptRef === payment.attemptRef,
    reservation.effectGeneration === payment.effectGeneration,
    reservation.credentialId === row.credentialId,
    reservation.principalId === row.principalId,
    reservation.environment === 'sandbox',
    reservation.grantRef === row.grantRef,
    reservation.grantGeneration === row.grantGeneration,
    reservation.budgetPolicyRef === canary.funding.budgetRef,
    reservation.providerRef === providerRef,
    reservation.paymentIdentifier === payment.paymentIdentifier,
    reservation.challengeDigest === payment.challengeDigest,
    reservation.amountUnits === payment.amountUnits,
    reservation.currency === payment.currency,
    reservation.exponent === payment.exponent,
    payment.custodyBudgetRef === reservation.custodyRef,
    payment.custodyGeneration === reservation.custodyGeneration,
  ].every(Boolean)
}

function paymentReservationSafetyMatches(
  canary: SellerOnboardingCanaryExecutionEnvelope,
  payment: Doc<'moneyX402PaymentAttempts'>,
  reservation: Doc<'moneyExternalSpendReservations'>,
): boolean {
  const executionContext = reservation.executionContext
  if (executionContext?.kind !== 'seller_onboarding_canary') return false
  return [
    payment.state === 'observed',
    payment.settlementStatus === 'not_settled',
    unsignedPaymentFields.every((field) => payment[field] === undefined),
    reservation.state === 'released',
    reservation.finalizationDigest !== undefined,
    reservation.finalizedAt !== undefined,
    reservation.providerReceiptDigest === undefined,
    reservation.reversalEvidenceRef === undefined,
    reservation.reversalEvidenceDigest === undefined,
    executionContext.canaryRef === canary.canaryRef,
    executionContext.fundingBudgetRef === canary.funding.budgetRef,
  ].every(Boolean)
}

function reconciledAttemptHasOnePair(
  attempt: Doc<'actionInvocationAttempts'>,
  payments: Doc<'moneyX402PaymentAttempts'>[],
): boolean {
  const pairCount = payments.filter((payment) => [
    payment.attemptRef === attempt.attemptRef,
    payment.effectGeneration === attempt.effectGeneration,
  ].every(Boolean)).length
  return attempt.outcome.state === 'reconciled_not_released'
    ? pairCount === 1
      : pairCount <= 1
}

function currentCanaryCommitmentMatches(
  row: OperationInvocationRow,
  reservation: Doc<'moneyExternalSpendReservations'>,
): boolean {
  const context = reservation.executionContext
  const canary = row.sellerOnboardingCanary
  if (context?.kind !== 'seller_onboarding_canary') return false
  if (canary === undefined) return false
  return context.canaryCommitmentDigest === canary.canaryCommitmentDigest
}

function managedCurrentLedgerMatches(input: Readonly<{
  row: OperationInvocationRow
  receipt: NonNullable<Extract<OperationResult, { kind: 'refused' }>['receipt']>
  payment: Doc<'moneyX402PaymentAttempts'>
  reservation: Doc<'moneyExternalSpendReservations'>
  reservationCount: number
}>): boolean {
  const { row, receipt, payment, reservation, reservationCount } = input
  return [
    reservationCount === 1,
    row.evidenceHash !== undefined,
    payment.transportObservationDigest === row.evidenceHash,
    payment.paymentResponseDigest === undefined,
    payment.reconciliationEvidenceRef === undefined,
    payment.reconciliationEvidenceDigest === undefined,
    payment.observedAt !== undefined,
    payment.evidenceRefs.length === 0,
    reservation.submissionStatus === 'not_submitted',
    reservation.paymentResponseDigest === undefined,
    reservation.providerReceiptDigest === undefined,
    reservation.reconciliationEvidenceRef === undefined,
    reservation.reconciliationEvidenceDigest === undefined,
    reservation.reversalEvidenceRef === undefined,
    reservation.reversalEvidenceDigest === undefined,
    currentCanaryCommitmentMatches(row, reservation),
    row.evidenceHash !== undefined && reservation.evidenceRefs.includes(row.evidenceHash),
    receipt.externalSettlementRef === reservation.reservationRef,
    receipt.paymentIdentifier === payment.paymentIdentifier,
  ].every(Boolean)
}

function managedCurrentHistoryMatches(
  row: OperationInvocationRow,
  attempt: Doc<'actionInvocationAttempts'>,
  history: Doc<'actionInvocationHistory'>[],
): boolean {
  const claim = history.find((entry) => entry.kind === 'claim_before_effect')
  const fence = history.find((entry) => entry.kind === 'release_fence_before_network')
  const terminal = history.find((entry) => entry.kind === 'terminal_failed')
  const fenceTransition = fence === undefined ? undefined : fence.attemptTransition
  const terminalTransition = terminal === undefined ? undefined : terminal.attemptTransition
  if (claim === undefined) return false
  if (fenceTransition === undefined) return false
  if (terminalTransition === undefined) return false
  return [
    history.length === 3,
    fenceTransition.attemptRef === attempt.attemptRef,
    fenceTransition.effectGeneration === attempt.effectGeneration,
    fenceTransition.priorReleaseState === 'not_released',
    fenceTransition.nextReleaseState === 'possibly_released',
    fenceTransition.priorOutcomeState === 'running',
    fenceTransition.nextOutcomeState === 'running',
    terminalTransition.attemptRef === attempt.attemptRef,
    terminalTransition.effectGeneration === attempt.effectGeneration,
    terminalTransition.priorReleaseState === 'possibly_released',
    terminalTransition.nextReleaseState === 'not_released',
    terminalTransition.priorOutcomeState === 'running',
    terminalTransition.nextOutcomeState === 'failed',
    history.every((entry) => [
      entry.invocationRef === row.invocationRef,
      entry.commandResult === 'applied',
      entry.current,
      entry.observation === undefined,
    ].every(Boolean)),
  ].every(Boolean)
}

function refusedReceipt(
  row: OperationInvocationRow,
): Extract<OperationResult, { kind: 'refused' }>['receipt'] | undefined {
  if (row.result?.kind !== 'refused') return undefined
  return row.result.receipt
}

function managedOuterLedgerShapeMatches(
  outerKind: SafeBeforeReleaseOuterKind,
  receipt: Extract<OperationResult, { kind: 'refused' }>['receipt'] | undefined,
  evidenceHash: string | undefined,
  reservationCount: number,
): boolean {
  if (outerKind === 'generic_pre_release') return true
  return [
    receipt !== undefined,
    evidenceHash !== undefined,
    reservationCount > 0,
  ].every(Boolean)
}

function sellerCanaryProviderRoute(row: OperationInvocationRow): Readonly<{
  operation: NonNullable<ReturnType<typeof parsePublishedOperationSnapshot>>
  providerRef: string
}> | undefined {
  const operation = parsePublishedOperationSnapshot(row.operationJson ?? '')
  if (operation === undefined) return undefined
  if (operation.identity.payment.kind !== 'x402') return undefined
  if (operation.binding.authority.kind !== 'provider_connection') return undefined
  return { operation, providerRef: operation.binding.authority.providerRef }
}

function referencedReservationRefs(
  payments: Doc<'moneyX402PaymentAttempts'>[],
): string[] {
  return payments.flatMap((payment) => {
    if (payment.reservationRef === undefined) return []
    return [payment.reservationRef]
  })
}

function reservationForPayment(
  payment: Doc<'moneyX402PaymentAttempts'>,
  reservationsByRef: Map<string, Doc<'moneyExternalSpendReservations'>>,
): Doc<'moneyExternalSpendReservations'> | undefined {
  if (payment.reservationRef === undefined) return undefined
  return reservationsByRef.get(payment.reservationRef)
}

function managedCurrentDocuments(input: Readonly<{
  payment: Doc<'moneyX402PaymentAttempts'> | undefined
  reservation: Doc<'moneyExternalSpendReservations'> | undefined
  receipt: Extract<OperationResult, { kind: 'refused' }>['receipt'] | undefined
}>): Readonly<{
  payment: Doc<'moneyX402PaymentAttempts'>
  reservation: Doc<'moneyExternalSpendReservations'>
  receipt: NonNullable<Extract<OperationResult, { kind: 'refused' }>['receipt']>
}> | undefined {
  if (input.payment === undefined) return undefined
  if (input.reservation === undefined) return undefined
  if (input.receipt === undefined) return undefined
  return input as Readonly<{
    payment: Doc<'moneyX402PaymentAttempts'>
    reservation: Doc<'moneyExternalSpendReservations'>
    receipt: NonNullable<Extract<OperationResult, { kind: 'refused' }>['receipt']>
  }>
}

function currentLedgerLaneMatches(input: Readonly<{
  row: OperationInvocationRow
  outerKind: SafeBeforeReleaseOuterKind
  attempt: Doc<'actionInvocationAttempts'>
  payment: Doc<'moneyX402PaymentAttempts'> | undefined
  reservation: Doc<'moneyExternalSpendReservations'> | undefined
  receipt: Extract<OperationResult, { kind: 'refused' }>['receipt'] | undefined
  reservationCount: number
  history: Doc<'actionInvocationHistory'>[]
}>): boolean {
  if (input.outerKind === 'generic_pre_release') {
    return [
      input.payment === undefined,
      input.reservationCount === 0,
      input.history.every((entry) => entry.observation === undefined),
    ].every(Boolean)
  }
  const managed = managedCurrentDocuments(input)
  if (managed === undefined) return false
  return [
    managedCurrentLedgerMatches({
      row: input.row,
      receipt: managed.receipt,
      payment: managed.payment,
      reservation: managed.reservation,
      reservationCount: input.reservationCount,
    }),
    managedCurrentHistoryMatches(input.row, input.attempt, input.history),
  ].every(Boolean)
}

function sellerCanaryUnpaidLedgersMatch(
  row: OperationInvocationRow,
  outerKind: SafeBeforeReleaseOuterKind,
  attempt: Doc<'actionInvocationAttempts'>,
  attempts: Doc<'actionInvocationAttempts'>[],
  reservations: Doc<'moneyExternalSpendReservations'>[],
  payments: Doc<'moneyX402PaymentAttempts'>[],
  history: Doc<'actionInvocationHistory'>[],
): boolean {
  const canary = row.sellerOnboardingCanary
  const receipt = refusedReceipt(row)
  if (canary === undefined) return false
  if (payments.length !== reservations.length) return false
  if (!managedOuterLedgerShapeMatches(outerKind, receipt, row.evidenceHash, reservations.length)) return false
  const route = sellerCanaryProviderRoute(row)
  if (route === undefined) return false
  const { operation, providerRef } = route
  const attemptsByRef = new Map(attempts.map((candidate) => [candidate.attemptRef, candidate]))
  const reservationsByRef = new Map(reservations.map((reservation) => [reservation.reservationRef, reservation]))
  const paymentReservationRefs = referencedReservationRefs(payments)
  const referenceIntegrity = [
    reservationsByRef.size === reservations.length,
    paymentReservationRefs.length === payments.length,
    new Set(paymentReservationRefs).size === payments.length,
    new Set(payments.map((payment) => payment.attemptRef)).size === payments.length,
    reservations.every((reservation) => paymentReservationRefs.includes(reservation.reservationRef)),
  ].every(Boolean)
  if (!referenceIntegrity) return false
  const ledgersSafe = payments.every((payment) => {
    const paymentAttempt = attemptsByRef.get(payment.attemptRef)
    const reservation = reservationForPayment(payment, reservationsByRef)
    if (paymentAttempt === undefined || reservation === undefined) return false
    return [
      paymentLaneMatches(paymentAttempt, attempt, payment, reservation),
      paymentReservationIdentityMatches({ row, canary, operation, providerRef, paymentAttempt, payment, reservation }),
      paymentReservationSafetyMatches(canary, payment, reservation),
    ].every(Boolean)
  })
  if (!ledgersSafe) return false
  if (!attempts.every((candidate) => reconciledAttemptHasOnePair(candidate, payments))) return false
  const currentPayment = payments.find((payment) => [
    payment.attemptRef === attempt.attemptRef,
    payment.effectGeneration === attempt.effectGeneration,
  ].every(Boolean))
  const currentReservation = currentPayment === undefined
    ? undefined
    : reservationForPayment(currentPayment, reservationsByRef)
  const currentReservationCount = reservations.filter((reservation) => [
    reservation.attemptRef === attempt.attemptRef,
    reservation.effectGeneration === attempt.effectGeneration,
  ].every(Boolean)).length
  const currentHistory = history.filter((entry) => entry.effectGeneration === attempt.effectGeneration)
  return currentLedgerLaneMatches({
    row,
    outerKind,
    attempt,
    payment: currentPayment,
    reservation: currentReservation,
    receipt,
    reservationCount: currentReservationCount,
    history: currentHistory,
  })
}

function safeBeforeReleaseCanonicalControlMatches(
  row: OperationInvocationRow,
  control: Doc<'actionInvocationControls'>,
): boolean {
  const canonical = control.control.control
  const binding = control.authorityBinding
  const operation = parsePublishedOperationSnapshot(row.operationJson ?? '')
  if (canonical.state !== 'retryable') return false
  if (binding === undefined || operation === undefined || row.authority === undefined) return false
  return [
      canonical.reason === 'pre_release_failure',
      control.invocationRef === row.invocationRef,
      control.currentAttemptRef === row.attemptRef,
      control.sourceRef === `operation-invocation-source:${row.invocationRef}`,
      control.preparedMaterialDigest === row.inputDigest,
      control.control.owner.callerRef === row.credentialId,
      control.control.owner.principalRef === row.principalId,
      control.control.action.id === operation.operationId,
      binding.invocationRef === row.invocationRef,
      binding.digest === row.authority.decisionDigest,
      binding.targetDigest === row.authority.targetDigest,
      binding.expiresAt === row.authority.expiresAt,
    ].every(Boolean)
}

function currentSafeBeforeReleaseAttempt(
  row: OperationInvocationRow,
  control: Doc<'actionInvocationControls'>,
  attempts: Doc<'actionInvocationAttempts'>[],
): Doc<'actionInvocationAttempts'> | undefined {
  const currentAttemptRef = control.currentAttemptRef
  if (currentAttemptRef === undefined) return undefined
  const attempt = exactSafeBeforeReleaseAttemptHistory(row, attempts, currentAttemptRef)
  if (attempt === undefined) return undefined
  if (control.currentEffectGeneration !== attempt.effectGeneration) return undefined
  return attempt
}

type ManagedUnsignedRefundDigestProof = NonNullable<
  SafeBeforeReleaseSellerCanaryProof['managedUnsignedRefundProof']
>
type ManagedAuthorizationFailureProof = Pick<
  SafeBeforeReleaseSellerCanaryProof,
  'authorizationFailureCode' | 'authorizationFailureDetail'
>

function managedAuthorizationFailureProof(input: Readonly<{
  outerKind: SafeBeforeReleaseOuterKind
  attempt: Doc<'actionInvocationAttempts'>
  payments: Doc<'moneyX402PaymentAttempts'>[]
}>): ManagedAuthorizationFailureProof {
  if (input.outerKind !== 'managed_unsigned_refund') return {}
  const payment = input.payments.find((candidate) => (
    candidate.attemptRef === input.attempt.attemptRef
    && candidate.effectGeneration === input.attempt.effectGeneration
  ))
  if (payment?.authorizationFailureCode === undefined) return {}
  return {
    authorizationFailureCode: payment.authorizationFailureCode,
    ...(payment.authorizationFailureDetail === undefined
      ? {}
      : { authorizationFailureDetail: payment.authorizationFailureDetail }),
  }
}

function managedUnsignedRefundDigestProof(input: Readonly<{
  outerKind: SafeBeforeReleaseOuterKind
  attempt: Doc<'actionInvocationAttempts'>
  payments: Doc<'moneyX402PaymentAttempts'>[]
  reservations: Doc<'moneyExternalSpendReservations'>[]
  history: Doc<'actionInvocationHistory'>[]
}>): ManagedUnsignedRefundDigestProof | undefined {
  if (input.outerKind !== 'managed_unsigned_refund') return undefined
  const payment = input.payments.find((candidate) => [
    candidate.attemptRef === input.attempt.attemptRef,
    candidate.effectGeneration === input.attempt.effectGeneration,
  ].every(Boolean))
  if (payment === undefined) return undefined
  const reservation = input.reservations.find((candidate) => candidate.reservationRef === payment.reservationRef)
  if (reservation === undefined) return undefined
  const currentHistory = input.history
    .filter((entry) => entry.effectGeneration === input.attempt.effectGeneration)
    .sort((left, right) => left.invocationVersion - right.invocationVersion)
  return {
    paymentAttemptDigest: canonicalDigest(withoutSystemFields(payment) as never),
    reservationDigest: canonicalDigest(withoutSystemFields(reservation) as never),
    currentHistoryDigest: canonicalDigest(currentHistory.map((entry) => withoutSystemFields(entry)) as never),
  }
}

function managedDigestProofRequirementMet(
  outerKind: SafeBeforeReleaseOuterKind,
  proof: ManagedUnsignedRefundDigestProof | undefined,
): boolean {
  return [outerKind === 'generic_pre_release', proof !== undefined].some(Boolean)
}

/**
 * Proves a post-claim retry from canonical durable state. The generic lane has
 * no current economic rows. The managed x402 lane may have crossed the local
 * release fence, but must prove every attempt ended unpaid and the current
 * authorization was never signed or submitted before its reservation closed.
 */
export async function safeBeforeReleaseSellerCanaryRefusal(
  ctx: MutationCtx | QueryCtx,
  row: OperationInvocationRow,
): Promise<SafeBeforeReleaseSellerCanaryProof | undefined> {
  const outerKind = safeBeforeReleaseOuterKind(row)
  if (outerKind === undefined) return undefined

  const [control, attempts, reservations, paymentAttempts, usage, qualifiedUse, providerJournals, history] = await Promise.all([
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef))
      .unique(),
    ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptNumber', (query) => query.eq('invocationRef', row.invocationRef))
      .collect(),
    ctx.db.query('moneyExternalSpendReservations')
      .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (query) => query.eq('invocationRef', row.invocationRef))
      .collect(),
    ctx.db.query('moneyX402PaymentAttempts')
      .filter((query) => query.eq(query.field('dispatchRef'), row.invocationRef))
      .collect(),
    ctx.db.query('moneyUsageEvents')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef))
      .take(1),
    ctx.db.query('qualifiedUseReceipts')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef))
      .take(1),
    ctx.db.query('providerConsequenceJournal')
      .filter((query) => query.eq(query.field('invocationRef'), row.invocationRef))
      .take(1),
    ctx.db.query('actionInvocationHistory')
      .withIndex('by_invocationRef_and_invocationVersion', (query) => query.eq('invocationRef', row.invocationRef))
      .collect(),
  ])
  if (control === null) return undefined
  if (!safeBeforeReleaseCanonicalControlMatches(row, control)) return undefined
  const attempt = currentSafeBeforeReleaseAttempt(row, control, attempts)
  if (attempt === undefined) return undefined
  if ([usage, qualifiedUse, providerJournals].some((rows) => rows.length > 0)) return undefined
  const ledgerProofMatches = sellerCanaryUnpaidLedgersMatch(
    row,
    outerKind,
    attempt,
    attempts,
    reservations,
    paymentAttempts,
    history,
  )
  if (!ledgerProofMatches) return undefined
  const managedUnsignedRefundProof = managedUnsignedRefundDigestProof({
    outerKind,
    attempt,
    payments: paymentAttempts,
    reservations,
    history,
  })
  if (!managedDigestProofRequirementMet(outerKind, managedUnsignedRefundProof)) return undefined
  const authorizationFailureProof = managedAuthorizationFailureProof({
    outerKind,
    attempt,
    payments: paymentAttempts,
  })
  const refusalCode = {
    generic_pre_release: 'pre_release_failed',
    managed_unsigned_refund: 'payment_signature_unavailable',
  } as const
  return {
    refusalCode: refusalCode[outerKind],
    attemptRef: attempt.attemptRef,
    attemptNumber: attempt.attemptNumber,
    effectGeneration: attempt.effectGeneration,
    controlDigest: canonicalDigest(withoutSystemFields(control) as never),
    attemptDigest: canonicalDigest(withoutSystemFields(attempt) as never),
    ...authorizationFailureProof,
    ...(managedUnsignedRefundProof === undefined ? {} : { managedUnsignedRefundProof }),
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
  const refusalProvenance = proof.managedUnsignedRefundProof === undefined
    ? {
        ...commonRefusalProvenance,
        source: 'canonical_retryable_attempt' as const,
        nextAction: SELLER_CANARY_ROUTE_SIGNING_UNAVAILABLE_NEXT_ACTION,
      }
    : {
        ...commonRefusalProvenance,
        source: 'managed_x402_unsigned_refund' as const,
        ...proof.managedUnsignedRefundProof,
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
    internal.actionInvocationControl.transact,
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
    internal.actionInvocationControl.transact,
    command,
  )
  if (canonicalResult.kind === 'refused') return canonicalResult
  if (!await canonicalCommandReadbackMatches(ctx, command)) {
    return { kind: 'refused', code: 'command_identity_conflict' }
  }
  const attempt = command.currentAttemptWrite as { attemptRef: string; effectGeneration: number }
  await ctx.db.patch(row._id, {
    state: normalizedProjection.state,
    result: normalizedProjection.result,
    usage: normalizedProjection.usage,
    evidenceHash: normalizedProjection.evidenceHash,
    attemptRef: normalizedProjection.attemptRef,
    dispatchState: normalizedProjection.dispatchState,
    updatedAt: Date.now(),
  })
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
  canonical: Doc<'actionInvocationControls'>['control']['control'],
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
  const control = await ctx.db.query('actionInvocationControls')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
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
