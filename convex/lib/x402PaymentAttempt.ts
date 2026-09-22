import { type Infer } from 'convex/values'

import { degradeBackend } from '../../src/lib/observability/degrade-backend'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { recordMarketEvidenceFact } from '../marketEvidence'
import { internal } from '../_generated/api'
import {
  X402_PAYMENT_SIGNING_CLAIM_LEASE_MS,
  type AttemptRow,
  type ClaimArgs,
  type ClaimResult,
  type EventArgs,
  type ListExpiredPreparedArgs,
  type MarkPossiblySubmittedArgs,
  type ObserveArgs,
  type PrepareArgs,
  type ReadAttemptArgs,
  type ReadAuthorizationArgs,
  type ReadAuthorizationByDigestArgs,
  type ReconcileArgs,
  type ReconcileResult,
  type RecordAuthorizationFailureArgs,
  type RecordObservationArgs,
  type RecordSignatureDigestArgs,
  type RecordSigningIntentArgs,
  listExpiredPreparedX402PaymentAttemptsReturns,
  prepareX402PaymentAuthorizationReturns,
  readX402PaymentAttemptReturns,
  readX402PaymentAuthorizationByDigestReturns,
  readX402PaymentAuthorizationReturns,
  x402PaymentAttemptReadValue,
  x402PaymentAuthorizationMaterial,
} from './x402PaymentAttemptSchema'
import {
  assertManagedCustodyPolicy,
  assertX402PaymentEnvironmentFence,
  canonicalUnsignedMaterialJson,
  eventAttributionValid,
  expectedCustodyGenerationMatches,
  isPaymentSigningIdempotencyKey,
  paymentAuthorizationExpiryFromMaterial,
  paymentAuthorizationExpiryValid,
  prepareAttributionMatches,
  quarantinedOutputFromArgs,
  quarantinedOutputFromRow,
  reconciliationMismatch,
  sameQuarantinedOutput,
  storedAuthorization,
  x402AuthorizationDigest,
  x402CustodyRefDigest,
  x402PaymentIdentityDigest,
} from './x402PaymentAttemptIdentity'

export * from './x402PaymentAttemptSchema'
export * from './x402PaymentAttemptIdentity'

export async function loadByAttempt(
  ctx: QueryCtx | MutationCtx,
  attemptRef: string,
  effectGeneration: number,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_attemptRef_and_effectGeneration', (query) => (
      query.eq('attemptRef', attemptRef).eq('effectGeneration', effectGeneration)
    ))
    .unique()
}

export async function loadByCustody(
  ctx: QueryCtx | MutationCtx,
  custodyRef: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef))
    .unique()
}

async function loadByPaymentIdentifier(
  ctx: MutationCtx,
  paymentIdentifier: string,
): Promise<readonly AttemptRow[]> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_paymentIdentifier', (query) => (
      query.eq('paymentIdentifier', paymentIdentifier)
    ))
    .take(8)
}

export async function prepareX402PaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: PrepareArgs,
): Promise<Infer<typeof prepareX402PaymentAuthorizationReturns>> {
  assertX402PaymentEnvironmentFence({
    aeEnvironment: args.aeEnvironment,
    scheme: args.scheme,
    network: args.network,
    asset: args.asset,
  })
  assertManagedCustodyPolicy(args)
  const existing = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (existing !== null) {
    if (
      args.requestFingerprint !== undefined
      && existing.requestFingerprint !== args.requestFingerprint
    ) throw new Error('x402_payment_request_fingerprint_conflict')
    if (!prepareAttributionMatches(existing, args)) {
      throw new Error('x402_payment_attempt_attribution_invalid')
    }
    if (existing.state !== 'prepared') {
      throw new Error('x402_payment_attempt_reconciliation_required')
    }
    return {
      custodyRef: existing.custodyRef,
      authorizationDigest: existing.authorizationDigest,
      ...(existing.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: existing.custodyBudgetRef }),
      ...(existing.custodyGeneration === undefined ? {} : { custodyGeneration: existing.custodyGeneration }),
      ...(existing.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: existing.custodyDailyMaximumUnits }),
    }
  }
  const identified = await loadByPaymentIdentifier(ctx, args.paymentIdentifier)
  if (identified.some((row) => (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ))) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (identified.some((row) => (
    row.attemptRef !== args.attemptRef
    || row.effectGeneration !== args.effectGeneration
    || !prepareAttributionMatches(row, args)
  ))) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  const custodyRef = x402CustodyRefDigest(args)
  const paymentIdentityDigest = x402PaymentIdentityDigest(args)
  const authorizationDigest = x402AuthorizationDigest(paymentIdentityDigest, args.credentialRef)
  const { aeEnvironment: _aeEnvironment, ...persistArgs } = args
  await ctx.db.insert('moneyX402PaymentAttempts', {
    ...persistArgs,
    custodyRef,
    authorizationDigest,
    paymentIdentityDigest,
    state: 'prepared',
    preparedAt: Date.now(),
    evidenceRefs: [],
  })
  return {
    custodyRef,
    authorizationDigest,
    ...(args.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: args.custodyBudgetRef }),
    ...(args.custodyGeneration === undefined ? {} : { custodyGeneration: args.custodyGeneration }),
    ...(args.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: args.custodyDailyMaximumUnits }),
  }
}

export async function claimX402PaymentAuthorizationHandler(
  ctx: MutationCtx,
  args: ClaimArgs,
): Promise<ClaimResult> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.requestFingerprint !== args.requestFingerprint) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (row.state !== 'prepared') {
    throw new Error('x402_payment_attempt_reconciliation_required')
  }
  const stored = storedAuthorization(row)
  if (stored !== undefined) return { kind: 'stored', ...stored }
  // Any unsigned intent or authorization identity is durable first-win
  // evidence, not a lease. Once it exists, a later worker must converge on the
  // same idempotency key and EIP-3009 nonce instead of minting another one.
  const authorizationIdentityFields = [
    row.paymentUnsignedMaterialJson,
    row.paymentUnsignedMaterialDigest,
    row.paymentSigningIdempotencyKey,
    row.paymentSignatureDigest,
    row.paymentPayer,
    row.paymentNonce,
    row.paymentAuthorizationValidBefore,
    row.paymentAuthorizationExpiresAt,
  ]
  if (authorizationIdentityFields.some((value) => value !== undefined)) {
    return { kind: 'pending' }
  }

  const now = Date.now()
  if (row.paymentSigningClaimedAt !== undefined) {
    const claimedAt = row.paymentSigningClaimedAt
    // Invalid or future timestamps fail closed. A valid bare claim can be
    // reclaimed only after its bounded lease expires without identity evidence.
    if (
      !Number.isSafeInteger(claimedAt)
      || claimedAt < 0
      || claimedAt > now
      || now - claimedAt < X402_PAYMENT_SIGNING_CLAIM_LEASE_MS
    ) return { kind: 'pending' }
  }
  await ctx.db.patch(row._id, { paymentSigningClaimedAt: now })
  return { kind: 'claimed' }
}

export async function recordX402PaymentSigningIntentHandler(
  ctx: MutationCtx,
  args: RecordSigningIntentArgs,
): Promise<null> {
  if (!isPaymentSigningIdempotencyKey(args.paymentSigningIdempotencyKey)) {
    throw new Error('x402_payment_signing_idempotency_key_invalid')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(args.paymentUnsignedMaterialJson)
  } catch (cause) {
    degradeBackend(cause, undefined, {
      site: 'recordX402PaymentSigningIntentHandler',
      reason: 'invalid_response',
    })
    throw new Error('x402_payment_unsigned_material_invalid', { cause })
  }
  const parsedExpiry = paymentAuthorizationExpiryFromMaterial(parsed)
  if (
    canonicalUnsignedMaterialJson(parsed) !== args.paymentUnsignedMaterialJson
    || canonicalDigest(parsed) !== args.paymentUnsignedMaterialDigest
    || !paymentAuthorizationExpiryValid(
      args.paymentAuthorizationValidBefore,
      args.paymentAuthorizationExpiresAt,
    )
    || args.paymentPayer.trim().length === 0
    || args.paymentNonce.trim().length === 0
    || args.requestFingerprint.trim().length === 0
  ) throw new Error('x402_payment_unsigned_material_invalid')

  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.requestFingerprint !== args.requestFingerprint) {
    throw new Error('x402_payment_request_fingerprint_conflict')
  }
  if (row.state !== 'prepared') throw new Error('x402_payment_attempt_reconciliation_required')

  const existingIntentFields = [
    row.paymentUnsignedMaterialJson,
    row.paymentUnsignedMaterialDigest,
    row.paymentSigningIdempotencyKey,
    row.paymentPayer,
    row.paymentNonce,
    row.paymentAuthorizationValidBefore,
    row.paymentAuthorizationExpiresAt,
  ]
  const hasExistingIntent = existingIntentFields.some((value) => value !== undefined)
  if (hasExistingIntent) {
    if (
      row.paymentUnsignedMaterialJson !== args.paymentUnsignedMaterialJson
      || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
      || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
      || row.paymentPayer !== args.paymentPayer
      || row.paymentNonce !== args.paymentNonce
      || row.paymentAuthorizationValidBefore !== args.paymentAuthorizationValidBefore
      || row.paymentAuthorizationExpiresAt !== args.paymentAuthorizationExpiresAt
    ) throw new Error('x402_payment_unsigned_identity_conflict')
    return null
  }
  if (
    parsedExpiry?.paymentAuthorizationValidBefore !== args.paymentAuthorizationValidBefore
    || parsedExpiry?.paymentAuthorizationExpiresAt !== args.paymentAuthorizationExpiresAt
  ) throw new Error('x402_payment_unsigned_material_invalid')
  await ctx.db.patch(row._id, {
    paymentUnsignedMaterialJson: args.paymentUnsignedMaterialJson,
    paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey,
    paymentPayer: args.paymentPayer,
    paymentNonce: args.paymentNonce,
    paymentAuthorizationValidBefore: args.paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt: args.paymentAuthorizationExpiresAt,
    paymentSigningClaimedAt: row.paymentSigningClaimedAt ?? Date.now(),
  })
  return null
}

export async function recordX402PaymentAuthorizationFailureHandler(
  ctx: MutationCtx,
  args: RecordAuthorizationFailureArgs,
): Promise<null> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    row.state !== 'prepared'
    || row.submissionStartedAt !== undefined
    || row.paymentSignatureDigest !== undefined
  ) throw new Error('x402_payment_authorization_failure_state_invalid')
  if (args.code !== 'provider_authority_invalid' && args.detail !== undefined) {
    throw new Error('x402_payment_authorization_failure_detail_invalid')
  }
  if (
    row.authorizationFailureCode === args.code
    && row.authorizationFailureDetail === args.detail
  ) {
    return null
  }
  await ctx.db.patch(row._id, {
    authorizationFailureCode: args.code,
    ...(args.detail === undefined
      ? { authorizationFailureDetail: undefined }
      : { authorizationFailureDetail: args.detail }),
    authorizationFailureObservedAt: Date.now(),
  })
  return null
}

export async function recordX402PaymentSignatureDigestHandler(
  ctx: MutationCtx,
  args: RecordSignatureDigestArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) {
    throw new Error('x402_payment_custody_generation_conflict')
  }
  if (row.state !== 'prepared') throw new Error('x402_payment_attempt_reconciliation_required')

  const hasAuthorizationIdentity = (
    args.paymentPayer !== undefined
    || args.paymentNonce !== undefined
    || args.requestFingerprint !== undefined
  )
  if (hasAuthorizationIdentity) {
    if (
      args.paymentPayer === undefined
      || args.paymentNonce === undefined
      || args.requestFingerprint === undefined
    ) throw new Error('x402_payment_authorization_material_invalid')
    if (row.requestFingerprint !== args.requestFingerprint) {
      throw new Error('x402_payment_request_fingerprint_conflict')
    }
    const stored = storedAuthorization(row)
    if (stored !== undefined) {
      if (
        stored.paymentSignatureDigest !== args.paymentSignatureDigest
        || stored.paymentPayer !== args.paymentPayer
        || stored.paymentNonce !== args.paymentNonce
      ) throw new Error('x402_payment_signature_identity_conflict')
      return null
    }
    if (
      row.paymentUnsignedMaterialJson === undefined
      || row.paymentUnsignedMaterialDigest === undefined
      || row.paymentSigningIdempotencyKey === undefined
      || !isPaymentSigningIdempotencyKey(row.paymentSigningIdempotencyKey)
      || row.paymentPayer !== args.paymentPayer
      || row.paymentNonce !== args.paymentNonce
      || row.paymentAuthorizationValidBefore === undefined
      || row.paymentAuthorizationExpiresAt === undefined
      || !paymentAuthorizationExpiryValid(
        row.paymentAuthorizationValidBefore,
        row.paymentAuthorizationExpiresAt,
      )
    ) throw new Error('x402_payment_authorization_material_invalid')
    await ctx.db.patch(row._id, {
      paymentSignatureDigest: args.paymentSignatureDigest,
    })
    return null
  }
  if (
    row.paymentSignatureDigest !== undefined
    && row.paymentSignatureDigest !== args.paymentSignatureDigest
  ) throw new Error('x402_payment_signature_identity_conflict')
  if (row.paymentSignatureDigest === undefined) {
    await ctx.db.patch(row._id, { paymentSignatureDigest: args.paymentSignatureDigest })
  }
  return null
}

export async function markX402PaymentPossiblySubmittedHandler(
  ctx: MutationCtx,
  args: MarkPossiblySubmittedArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || !eventAttributionValid(row, args as EventArgs)) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    args.settlementStatus !== undefined
    && row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    args.settlementDigest !== undefined
    && row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.settlementDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  if (row.state !== 'prepared') return null
  await ctx.db.patch(row._id, {
    state: 'possibly_submitted',
    submissionStartedAt: Date.now(),
  })
  return null
}

export async function observeX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ObserveArgs,
): Promise<null> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || !eventAttributionValid(row, args as EventArgs)) {
    throw new Error('x402_payment_attempt_attribution_invalid')
  }
  if (
    args.settlementStatus !== undefined
    && row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    args.settlementDigest !== undefined
    && row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.settlementDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : args.state
  const evidenceRefs = [...new Set([
    ...row.evidenceRefs.filter(ref => ref.startsWith(`chain:${row.network}:`)
      || ref.startsWith('response-request:') || ref.startsWith('response-payment:')),
    ...args.evidenceRefs,
  ])]
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    const sameEvidence = (
      row.state === targetState
      && (row.settlementStatus ?? undefined) === args.settlementStatus
      && (row.paymentResponseDigest ?? undefined) === args.settlementDigest
      && row.evidenceRefs.length === evidenceRefs.length
      && row.evidenceRefs.every((ref, index) => ref === evidenceRefs[index])
    )
    if (sameEvidence) return null
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  if (row.state !== 'possibly_submitted') {
    throw new Error('x402_payment_attempt_observation_state_invalid')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    ...(args.settlementStatus === undefined ? {} : { settlementStatus: args.settlementStatus }),
    ...(args.settlementDigest === undefined ? {} : { paymentResponseDigest: args.settlementDigest }),
    observedAt: Date.now(),
    evidenceRefs,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${row.attemptRef}:${row.effectGeneration}`, Date.now())
  }
  return null
}

/** Retain response bytes without claiming payment or delivery has completed. */
export async function checkpointX402ResponseHandler(
  ctx: MutationCtx,
  args: Readonly<{
    dispatchRef: string; attemptRef: string; effectGeneration: number;
    toolRef: string; inputDigest: string; paymentIdentifier: string;
    responseDigest: string; outputJson: string;
    settlementTransactionRef?: string;
    requestDigest: string; paymentResponseDigest?: string;
  }>,
): Promise<null> {
  const output = quarantinedOutputFromArgs({
    settlementStatus: 'unknown', quarantinedResponseDigest: args.responseDigest,
    quarantinedOutputJson: args.outputJson,
  })
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef
    || row.toolRef !== args.toolRef || row.inputDigest !== args.inputDigest
    || row.paymentIdentifier !== args.paymentIdentifier
    || !['possibly_submitted', 'observed', 'reconciliation_required'].includes(row.state)) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  const persisted = quarantinedOutputFromRow(row)
  const txRef = args.settlementTransactionRef
  if (!/^sha256:[0-9a-f]{64}$/.test(args.requestDigest)
    || (args.paymentResponseDigest !== undefined && !/^sha256:[0-9a-f]{64}$/.test(args.paymentResponseDigest))) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if (txRef !== undefined && (!txRef.startsWith(`chain:${row.network}:`)
    || !/^chain:eip155:\d+:0x[0-9a-fA-F]{64}$/.test(txRef))) {
    throw new Error('x402_payment_observation_attribution_invalid')
  }
  if (persisted !== undefined) {
    if (!sameQuarantinedOutput(persisted, output)) throw new Error('x402_payment_quarantined_output_conflict')
    return null
  }
  await ctx.db.patch(row._id, {
    quarantinedResponseDigest: args.responseDigest, quarantinedOutputJson: args.outputJson,
    evidenceRefs: [...new Set([...row.evidenceRefs, `response-request:${args.requestDigest}`,
      ...(args.paymentResponseDigest === undefined ? [] : [`response-payment:${args.paymentResponseDigest}`]),
      ...(txRef === undefined ? [] : [txRef])])],
  })
  if (txRef !== undefined) await ctx.scheduler.runAfter(60_000, internal.moneyX402ResponseActions.recover, {
    callRef: args.dispatchRef, attempt: 0,
  })
  return null
}

export async function recordX402PaymentObservationHandler(
  ctx: MutationCtx,
  args: RecordObservationArgs,
): Promise<null> {
  const quarantinedOutput = quarantinedOutputFromArgs(args)
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (
    row === null
    || row.dispatchRef !== args.dispatchRef
    || row.paymentIdentifier !== args.paymentIdentifier
    || (row.toolRef !== undefined && row.toolRef !== args.toolRef)
    || (row.inputDigest !== undefined && row.inputDigest !== args.inputDigest)
    || (
      row.state !== 'prepared'
      && row.state !== 'possibly_submitted'
      && row.state !== 'observed'
      && row.state !== 'reconciliation_required'
    )
  ) throw new Error('x402_payment_observation_attribution_invalid')
  if (
    row.settlementStatus !== undefined
    && row.settlementStatus !== args.settlementStatus
  ) throw new Error('x402_payment_settlement_identity_conflict')
  if (
    row.paymentResponseDigest !== undefined
    && row.paymentResponseDigest !== args.paymentResponseDigest
  ) throw new Error('x402_payment_response_identity_conflict')
  const persistedQuarantinedOutput = quarantinedOutputFromRow(row)
  const targetState = args.settlementStatus === 'unknown' ? 'reconciliation_required' : 'observed'
  if (row.state === 'observed' || row.state === 'reconciliation_required') {
    if (row.state !== targetState) {
      throw new Error('x402_payment_attempt_observation_state_invalid')
    }
    if (row.settlementStatus !== args.settlementStatus) {
      throw new Error('x402_payment_settlement_identity_conflict')
    }
    if (row.paymentResponseDigest !== args.paymentResponseDigest) {
      throw new Error('x402_payment_response_identity_conflict')
    }
    const observationDigests = [
      row.paymentObservationDigest,
      row.transportObservationDigest,
      row.transportRequestDigest,
    ]
    const missingObservationDigests = observationDigests.every((value) => value === undefined)
    if (missingObservationDigests) {
      if (
        persistedQuarantinedOutput !== undefined && quarantinedOutput !== undefined
        && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)
      ) throw new Error('x402_payment_quarantined_output_conflict')
      await ctx.db.patch(row._id, {
        toolRef: args.toolRef,
        inputDigest: args.inputDigest,
        paymentObservationDigest: args.paymentObservationDigest,
        transportObservationDigest: args.transportObservationDigest,
        transportRequestDigest: args.transportRequestDigest,
        ...(persistedQuarantinedOutput === undefined && quarantinedOutput !== undefined
          ? {
              quarantinedResponseDigest: quarantinedOutput.responseDigest,
              quarantinedOutputJson: quarantinedOutput.outputJson,
            }
          : {}),
        observedAt: args.observedAt,
      })
      return null
    }
    if (
      row.toolRef !== args.toolRef
      || row.inputDigest !== args.inputDigest
      || row.paymentObservationDigest !== args.paymentObservationDigest
      || row.transportObservationDigest !== args.transportObservationDigest
      || row.transportRequestDigest !== args.transportRequestDigest
    ) throw new Error('x402_payment_observation_attribution_invalid')
    if (quarantinedOutput !== undefined && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
      throw new Error('x402_payment_quarantined_output_conflict')
    }
    return null
  }
  if (persistedQuarantinedOutput !== undefined && quarantinedOutput !== undefined
    && !sameQuarantinedOutput(persistedQuarantinedOutput, quarantinedOutput)) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  await ctx.db.patch(row._id, {
    state: targetState,
    toolRef: args.toolRef,
    paymentObservationDigest: args.paymentObservationDigest,
    inputDigest: args.inputDigest,
    transportObservationDigest: args.transportObservationDigest,
    transportRequestDigest: args.transportRequestDigest,
    settlementStatus: args.settlementStatus,
    ...(args.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: args.paymentResponseDigest }),
    ...(quarantinedOutput === undefined
      ? {}
      : {
          quarantinedResponseDigest: quarantinedOutput.responseDigest,
          quarantinedOutputJson: quarantinedOutput.outputJson,
        }),
    observedAt: args.observedAt,
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  if (args.settlementStatus === 'unknown') {
    await recordMarketEvidenceFact(ctx, 'ae_reconciliation_required', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return null
}

export async function reconcileX402PaymentAttemptHandler(
  ctx: MutationCtx,
  args: ReconcileArgs,
): Promise<ReconcileResult> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch: 'attempt_not_found',
    })
    return { kind: 'reconciliation_required' }
  }
  const mismatch = reconciliationMismatch(row, args)
  if (mismatch !== undefined) {
    console.warn('x402_payment_attempt_reconciliation_refused', {
      attemptRef: args.attemptRef,
      effectGeneration: args.effectGeneration,
      mismatch,
    })
    return { kind: 'reconciliation_required' }
  }
  if (row.reconciliationEvidenceDigest !== undefined) {
    return row.reconciliationEvidenceRef === args.evidenceRef
      && row.reconciliationEvidenceDigest === args.evidenceDigest
      && row.paymentResponseDigest === args.paymentResponseDigest
      ? { kind: 'settled', settlementStatus: args.settlementStatus }
      : { kind: 'reconciliation_required' }
  }
  await ctx.db.patch(row._id, {
    reconciliationEvidenceRef: args.evidenceRef,
    reconciliationEvidenceDigest: args.evidenceDigest,
    paymentObservationDigest: args.paymentObservationDigest,
    settlementStatus: args.settlementStatus,
    paymentResponseDigest: args.paymentResponseDigest,
    state: 'observed',
  })
  if (args.settlementStatus === 'settled') {
    await recordMarketEvidenceFact(ctx, 'ae_settlement', `${args.attemptRef}:${args.effectGeneration}`, args.observedAt)
  }
  return { kind: 'settled', settlementStatus: args.settlementStatus }
}

async function loadByAuthorizationDigest(
  ctx: QueryCtx,
  authorizationDigest: string,
): Promise<AttemptRow | null> {
  return await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_authorizationDigest', (query) => (
      query.eq('authorizationDigest', authorizationDigest)
    ))
    .unique()
}

function authorizationMaterial(row: AttemptRow): Infer<typeof x402PaymentAuthorizationMaterial> {
  return {
    dispatchRef: row.dispatchRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    challengeDigest: row.challengeDigest,
    challengeJson: row.challengeJson,
    selectedRequirementJson: row.selectedRequirementJson,
    providerEndpoint: row.providerEndpoint,
    scheme: row.scheme,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    credentialRef: row.credentialRef,
    amountUnits: row.amountUnits,
    currency: row.currency,
    exponent: row.exponent,
    custodyRef: row.custodyRef,
    ...(row.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: row.custodyBudgetRef }),
    ...(row.custodyGeneration === undefined ? {} : { custodyGeneration: row.custodyGeneration }),
    ...(row.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: row.custodyDailyMaximumUnits }),
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
    ...(row.requestFingerprint === undefined ? {} : { requestFingerprint: row.requestFingerprint }),
    ...(row.paymentUnsignedMaterialJson === undefined ? {} : { paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson }),
    ...(row.paymentUnsignedMaterialDigest === undefined ? {} : { paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest }),
    ...(row.paymentSigningIdempotencyKey === undefined ? {} : { paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey }),
    ...(row.paymentPayer === undefined ? {} : { paymentPayer: row.paymentPayer }),
    ...(row.paymentNonce === undefined ? {} : { paymentNonce: row.paymentNonce }),
    ...(row.paymentAuthorizationValidBefore === undefined ? {} : { paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore }),
    ...(row.paymentAuthorizationExpiresAt === undefined ? {} : { paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt }),
    ...(row.paymentSigningClaimedAt === undefined ? {} : { paymentSigningClaimedAt: row.paymentSigningClaimedAt }),
    ...(row.authorizationFailureCode === undefined ? {} : { authorizationFailureCode: row.authorizationFailureCode }),
    ...(row.authorizationFailureDetail === undefined ? {} : { authorizationFailureDetail: row.authorizationFailureDetail }),
    ...(row.authorizationFailureObservedAt === undefined ? {} : { authorizationFailureObservedAt: row.authorizationFailureObservedAt }),
    state: row.state,
    ...(row.transportObservationDigest === undefined ? {} : { transportObservationDigest: row.transportObservationDigest }),
    ...(row.transportRequestDigest === undefined ? {} : { transportRequestDigest: row.transportRequestDigest }),
    ...(row.paymentObservationDigest === undefined ? {} : { paymentObservationDigest: row.paymentObservationDigest }),
    ...(row.settlementStatus === undefined ? {} : { settlementStatus: row.settlementStatus }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
  }
}

function attemptRead(row: AttemptRow): Infer<typeof x402PaymentAttemptReadValue> {
  const hasQuarantinedResponseDigest = row.quarantinedResponseDigest !== undefined
  const hasQuarantinedOutputJson = row.quarantinedOutputJson !== undefined
  if (hasQuarantinedResponseDigest !== hasQuarantinedOutputJson) {
    throw new Error('x402_payment_quarantined_output_conflict')
  }
  return {
    dispatchRef: row.dispatchRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    paymentIdentifier: row.paymentIdentifier,
    operationKeyDigest: row.operationKeyDigest,
    challengeDigest: row.challengeDigest,
    challengeJson: row.challengeJson,
    selectedRequirementJson: row.selectedRequirementJson,
    providerEndpoint: row.providerEndpoint,
    scheme: row.scheme,
    network: row.network,
    asset: row.asset,
    payTo: row.payTo,
    amountUnits: row.amountUnits,
    currency: row.currency,
    exponent: row.exponent,
    credentialRef: row.credentialRef,
    custodyRef: row.custodyRef,
    ...(row.custodyBudgetRef === undefined ? {} : { custodyBudgetRef: row.custodyBudgetRef }),
    ...(row.custodyGeneration === undefined ? {} : { custodyGeneration: row.custodyGeneration }),
    ...(row.custodyDailyMaximumUnits === undefined ? {} : { custodyDailyMaximumUnits: row.custodyDailyMaximumUnits }),
    authorizationDigest: row.authorizationDigest,
    ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
    ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    ...(row.paymentSignatureDigest === undefined ? {} : { paymentSignatureDigest: row.paymentSignatureDigest }),
    ...(row.requestFingerprint === undefined ? {} : { requestFingerprint: row.requestFingerprint }),
    ...(row.paymentUnsignedMaterialJson === undefined ? {} : { paymentUnsignedMaterialJson: row.paymentUnsignedMaterialJson }),
    ...(row.paymentUnsignedMaterialDigest === undefined ? {} : { paymentUnsignedMaterialDigest: row.paymentUnsignedMaterialDigest }),
    ...(row.paymentSigningIdempotencyKey === undefined ? {} : { paymentSigningIdempotencyKey: row.paymentSigningIdempotencyKey }),
    ...(row.paymentPayer === undefined ? {} : { paymentPayer: row.paymentPayer }),
    ...(row.paymentNonce === undefined ? {} : { paymentNonce: row.paymentNonce }),
    ...(row.paymentAuthorizationValidBefore === undefined ? {} : { paymentAuthorizationValidBefore: row.paymentAuthorizationValidBefore }),
    ...(row.paymentAuthorizationExpiresAt === undefined ? {} : { paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt }),
    ...(row.paymentSigningClaimedAt === undefined ? {} : { paymentSigningClaimedAt: row.paymentSigningClaimedAt }),
    ...(row.authorizationFailureCode === undefined ? {} : { authorizationFailureCode: row.authorizationFailureCode }),
    ...(row.authorizationFailureDetail === undefined ? {} : { authorizationFailureDetail: row.authorizationFailureDetail }),
    ...(row.authorizationFailureObservedAt === undefined ? {} : { authorizationFailureObservedAt: row.authorizationFailureObservedAt }),
    state: row.state,
    preparedAt: row.preparedAt,
    ...(row.submissionStartedAt === undefined ? {} : { submissionStartedAt: row.submissionStartedAt }),
    ...(row.observedAt === undefined ? {} : { observedAt: row.observedAt }),
    ...(row.transportObservationDigest === undefined ? {} : { transportObservationDigest: row.transportObservationDigest }),
    ...(row.transportRequestDigest === undefined ? {} : { transportRequestDigest: row.transportRequestDigest }),
    ...(row.paymentObservationDigest === undefined ? {} : { paymentObservationDigest: row.paymentObservationDigest }),
    ...(row.settlementStatus === undefined ? {} : { settlementStatus: row.settlementStatus }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.quarantinedResponseDigest === undefined || row.quarantinedOutputJson === undefined
      ? {}
      : {
          quarantinedResponseDigest: row.quarantinedResponseDigest,
          quarantinedOutputJson: row.quarantinedOutputJson,
        }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
    evidenceRefs: row.evidenceRefs,
  }
}

export async function readX402PaymentAuthorizationHandler(
  ctx: QueryCtx,
  args: ReadAuthorizationArgs,
): Promise<Infer<typeof readX402PaymentAuthorizationReturns>> {
  const row = await loadByCustody(ctx, args.custodyRef)
  if (row === null || row.authorizationDigest !== args.authorizationDigest) return null
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
  if (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ) throw new Error('x402_payment_request_fingerprint_conflict')
  return authorizationMaterial(row)
}

export async function readX402PaymentAuthorizationByDigestHandler(
  ctx: QueryCtx,
  args: ReadAuthorizationByDigestArgs,
): Promise<Infer<typeof readX402PaymentAuthorizationByDigestReturns>> {
  const row = await loadByAuthorizationDigest(ctx, args.authorizationDigest)
  if (row === null || row.custodyRef !== args.custodyRef) return null
  if (!expectedCustodyGenerationMatches(row, args.custodyGeneration)) return null
  if (
    args.requestFingerprint !== undefined
    && row.requestFingerprint !== args.requestFingerprint
  ) throw new Error('x402_payment_request_fingerprint_conflict')
  return authorizationMaterial(row)
}

export async function readX402PaymentAttemptHandler(
  ctx: QueryCtx,
  args: ReadAttemptArgs,
): Promise<Infer<typeof readX402PaymentAttemptReturns>> {
  const row = await loadByAttempt(ctx, args.attemptRef, args.effectGeneration)
  if (row === null || row.dispatchRef !== args.dispatchRef) return null
  return attemptRead(row)
}

export async function listExpiredPreparedX402PaymentAttemptsHandler(
  ctx: QueryCtx,
  args: ListExpiredPreparedArgs,
): Promise<Infer<typeof listExpiredPreparedX402PaymentAttemptsReturns>> {
  if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 25) {
    throw new Error('x402_payment_expired_prepared_limit_invalid')
  }
  const rows = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_state_and_paymentAuthorizationExpiresAt', (query) => (
      query.eq('state', 'prepared').lte('paymentAuthorizationExpiresAt', args.now)
    ))
    .take(args.limit)
  return rows.flatMap((row) => {
    if (row.paymentAuthorizationExpiresAt === undefined) return []
    return [{
      dispatchRef: row.dispatchRef,
      attemptRef: row.attemptRef,
      effectGeneration: row.effectGeneration,
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      ...(row.reservationRef === undefined ? {} : { reservationRef: row.reservationRef }),
      paymentAuthorizationExpiresAt: row.paymentAuthorizationExpiresAt,
    }]
  })
}
