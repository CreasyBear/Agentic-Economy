import { v, type Infer } from 'convex/values'
import { deploymentPaymentEnvironment } from '../../../../src/lib/deployment/environment'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment, x402PaymentProfileForEnvironment } from '../../../../src/modules/capability-supply/convex'
import { canonicalDigest, isCanonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { isRecord } from '../../../../src/modules/common/is-record'
import {
  isPositiveX402AtomicUnits, x402PayeeScreeningDecisionValue, x402SpendAdmissionResultValue,
  x402SpendPolicyFromEnvironment, x402SpendReservationRef, X402_SCREENING_FRESHNESS_MS,
  X402_SPEND_HISTORY_LIMIT, X402_SPEND_WINDOW_MS,
  type X402SpendAdmissionRefusalCode, type X402SpendAdmissionResult, type X402SpendPolicy,
} from '../../../../src/modules/money/x402-spend-admission'
import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx } from '../../../_generated/server'
import { loadByCustody } from './attempt'
import { canonicalUnsignedMaterialJson, isPaymentSigningIdempotencyKey, paymentAuthorizationExpiryFromMaterial } from './authorizationMaterial'
import type { AttemptRow } from './contracts'
import { persistedCallAuthorityIsCurrent } from '../billingAuthorization/persistedCall'

export const recordScreeningAndReserveSigningArgs = {
  purpose: v.union(v.literal('sign'), v.literal('forensic_replay')),
  custodyRef: v.string(),
  authorizationDigest: v.string(),
  custodyGeneration: v.number(),
  paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(),
  screeningInvocationRef: v.string(),
  screening: x402PayeeScreeningDecisionValue,
}
export const recordScreeningAndReserveSigningReturns = x402SpendAdmissionResultValue
export type RecordScreeningAndReserveSigningArgs = Infer<typeof recordScreeningAndReserveSigningArgsValue>
const recordScreeningAndReserveSigningArgsValue = v.object(recordScreeningAndReserveSigningArgs)
type Reservation = Doc<'moneyX402SpendReservations'>

function trustedPolicy(): Readonly<{
  policy: X402SpendPolicy
  environment: 'sandbox' | 'production'
  network: string
  asset: string
  custodyBudgetRef: string
  custodyGeneration: number
  payer: string
}> | undefined {
  const environment = deploymentPaymentEnvironment(env)
  const profile = x402PaymentProfileForEnvironment(environment)
  const custody = cdpX402CustodyConfigurationFromEnvironment(env)
  if (environment === undefined || profile === undefined || custody === undefined) return undefined
  const policy = x402SpendPolicyFromEnvironment(env, { environment, network: profile.network, asset: profile.asset })
  if (policy === undefined) return undefined
  return {
    policy, environment, network: profile.network, asset: profile.asset.toLowerCase(),
    custodyBudgetRef: cdpX402CustodyBudgetRef(custody, environment),
    custodyGeneration: custody.credentialGeneration,
    payer: custody.expectedEvmAddress,
  }
}

function expectedMaterial(row: AttemptRow, payer: string, now: number, purpose: RecordScreeningAndReserveSigningArgs['purpose']): Readonly<{
  normalizedPayTo: string; typedDataDigest: string
}> | undefined {
  if (row.paymentUnsignedMaterialJson === undefined || !/^0x[0-9a-fA-F]{40}$/.test(row.payTo)) return undefined
  let material: unknown
  try {
    material = JSON.parse(row.paymentUnsignedMaterialJson)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'x402SpendAdmission.expectedMaterial', reason: 'invalid_response' })
  }
  if (!isRecord(material) || !isRecord(material.accepted) || !isRecord(material.authorization)
    || !isRecord(material.typedData) || !isRecord(material.typedData.domain)
    || !isRecord(material.typedData.message) || !isRecord(material.typedData.types)
    || canonicalUnsignedMaterialJson(material) !== row.paymentUnsignedMaterialJson) return undefined
  const accepted = material.accepted
  const authorization = material.authorization
  const typedData = material.typedData
  const message = material.typedData.message
  const domain = material.typedData.domain
  const normalizedPayTo = row.payTo.toLowerCase()
  const expiry = paymentAuthorizationExpiryFromMaterial(material)
  if (canonicalDigest(material) !== row.paymentUnsignedMaterialDigest
    || accepted.scheme !== row.scheme || accepted.network !== row.network
    || typeof accepted.asset !== 'string' || accepted.asset.toLowerCase() !== row.asset.toLowerCase()
    || typeof accepted.payTo !== 'string' || accepted.payTo.toLowerCase() !== normalizedPayTo
    || accepted.amount !== row.amountUnits
    || typeof authorization.to !== 'string' || authorization.to.toLowerCase() !== normalizedPayTo
    || authorization.value !== row.amountUnits
    || typeof authorization.from !== 'string' || authorization.from.toLowerCase() !== payer
    || row.paymentPayer !== payer || authorization.nonce !== row.paymentNonce
    || typeof message.to !== 'string' || message.to.toLowerCase() !== normalizedPayTo
    || typeof message.from !== 'string' || message.from.toLowerCase() !== payer
    || message.value !== row.amountUnits || message.nonce !== row.paymentNonce
    || message.validAfter !== authorization.validAfter || message.validBefore !== authorization.validBefore
    || typedData.primaryType !== 'TransferWithAuthorization'
    || domain.chainId !== Number(row.network.split(':')[1])
    || typeof domain.verifyingContract !== 'string' || domain.verifyingContract.toLowerCase() !== row.asset.toLowerCase()
    || expiry === undefined || expiry.paymentAuthorizationExpiresAt !== row.paymentAuthorizationExpiresAt
    || expiry.paymentAuthorizationValidBefore !== row.paymentAuthorizationValidBefore
    || (purpose === 'sign' ? expiry.paymentAuthorizationExpiresAt <= now : expiry.paymentAuthorizationExpiresAt > now)) return undefined
  return { normalizedPayTo, typedDataDigest: canonicalDigest(typedData) }
}

function screeningRefusal(
  args: RecordScreeningAndReserveSigningArgs,
  row: AttemptRow,
  expected: Readonly<{ normalizedPayTo: string; typedDataDigest: string }>,
  now: number,
): X402SpendAdmissionRefusalCode | undefined {
  const screening = args.screening
  if (!isPaymentSigningIdempotencyKey(args.screeningInvocationRef)
    || screening.network !== row.network || screening.normalizedPayTo !== expected.normalizedPayTo
    || screening.paymentUnsignedMaterialDigest !== row.paymentUnsignedMaterialDigest
    || screening.typedDataDigest !== expected.typedDataDigest
    || screening.reason.trim().length === 0 || screening.reason.length > 512
    || (screening.providerReference !== undefined && (screening.providerReference.length === 0 || screening.providerReference.length > 256))
    || (screening.evidenceDigest !== undefined && !isCanonicalDigest(screening.evidenceDigest))) return 'screening_identity_invalid'
  if (!Number.isSafeInteger(screening.startedAt) || !Number.isSafeInteger(screening.checkedAt)
    || screening.startedAt < 0 || screening.startedAt > screening.checkedAt
    || screening.checkedAt > now || now - screening.startedAt > X402_SCREENING_FRESHNESS_MS) return 'screening_stale'
  return screening.outcome === 'clear' ? undefined : 'screening_not_clear'
}

function potentialLegacyExposure(row: AttemptRow): boolean {
  return row.currency === 'USDC' && row.exponent === 6 && (
    row.paymentSigningClaimedAt !== undefined || row.paymentUnsignedMaterialJson !== undefined
    || row.paymentUnsignedMaterialDigest !== undefined || row.paymentSigningIdempotencyKey !== undefined
    || row.paymentSignatureDigest !== undefined || row.paymentNonce !== undefined
    || row.submissionStartedAt !== undefined || row.settlementStatus === 'settled'
    || row.settlementStatus === 'unknown' || row.state !== 'prepared'
  )
}

function attemptMaySign(row: AttemptRow, purpose: RecordScreeningAndReserveSigningArgs['purpose'], now: number): boolean {
  if (purpose === 'sign') return row.state === 'prepared' && row.submissionStartedAt === undefined
  return row.paymentSigningClaimedAt !== undefined && row.paymentSignatureDigest === undefined
    && row.submissionStartedAt === undefined && row.paymentAuthorizationExpiresAt !== undefined
    && row.paymentAuthorizationExpiresAt <= now && row.evidenceRefs.length === 0
    && ((row.state === 'reconciliation_required' && row.settlementStatus === 'unknown'
      && row.paymentResponseDigest === undefined && row.reconciliationEvidenceRef === undefined
      && row.reconciliationEvidenceDigest === undefined)
      || (row.state === 'observed' && row.settlementStatus === 'not_settled'
        && row.paymentResponseDigest !== undefined && row.reconciliationEvidenceRef !== undefined
        && row.reconciliationEvidenceDigest !== undefined))
}

function sameExposure(row: Reservation, attempt: AttemptRow, policy: X402SpendPolicy, typedDataDigest: string): boolean {
  return row.reservationRef === attempt.spendReservationRef && row.platformBudgetRef === policy.platformBudgetRef
    && row.custodyRef === attempt.custodyRef && row.custodyBudgetRef === attempt.custodyBudgetRef
    && row.custodyGeneration === attempt.custodyGeneration
    && row.dispatchRef === attempt.dispatchRef && row.attemptRef === attempt.attemptRef
    && row.effectGeneration === attempt.effectGeneration && row.authorizationDigest === attempt.authorizationDigest
    && row.paymentIdentityDigest === attempt.paymentIdentityDigest
    && row.paymentUnsignedMaterialDigest === attempt.paymentUnsignedMaterialDigest
    && row.paymentSigningIdempotencyKey === attempt.paymentSigningIdempotencyKey
    && row.typedDataDigest === typedDataDigest && row.normalizedPayTo === attempt.payTo.toLowerCase()
    && row.amountUnits === attempt.amountUnits && row.currency === 'USDC' && row.exponent === 6
    && row.network === attempt.network && row.asset === attempt.asset.toLowerCase()
}

function historyValid(rows: readonly Reservation[], now: number): boolean {
  return rows.every((row) => isPositiveX402AtomicUnits(row.amountUnits)
    && Number.isSafeInteger(row.reservedAt) && row.reservedAt >= 0 && row.reservedAt <= now
    && (row.state !== 'settled' || (Number.isSafeInteger(row.settledAt) && row.settledAt >= row.reservedAt && row.settledAt <= now)))
}

async function exposureRefusal(
  ctx: MutationCtx, row: AttemptRow, policy: X402SpendPolicy,
  existing: Reservation | null, now: number,
): Promise<X402SpendAdmissionRefusalCode | undefined> {
  const legacy = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_network_and_spendReservationRef', (q) => q.eq('network', row.network).eq('spendReservationRef', undefined))
  let legacyCount = 0
  for await (const previous of legacy) {
    if (++legacyCount > X402_SPEND_HISTORY_LIMIT || potentialLegacyExposure(previous)) return 'spend_history_incomplete'
    // Attempt rows can retain large provider responses. Leave room for one
    // more row, the cap reads and the refusal audit instead of exhausting the
    // transaction before a decision can commit.
    try {
      const metrics = await ctx.meta.getTransactionMetrics()
      if (metrics.bytesRead.remaining < 4 * 1024 * 1024
        || metrics.documentsRead.remaining < 1024) return 'spend_history_incomplete'
    } catch (cause) {
      return degradeBackend(cause, 'spend_history_incomplete' as const, {
        site: 'x402SpendAdmission.historyHeadroom', reason: 'source_unavailable',
      })
    }
  }
  const liabilities = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_platformBudgetRef_and_state_and_settledAt', (q) => q.eq('platformBudgetRef', policy.platformBudgetRef).eq('state', 'liability'))
    .take(X402_SPEND_HISTORY_LIMIT + 1)
  const settled = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_platformBudgetRef_and_state_and_settledAt', (q) => q.eq('platformBudgetRef', policy.platformBudgetRef).eq('state', 'settled').gte('settledAt', now - X402_SPEND_WINDOW_MS))
    .take(X402_SPEND_HISTORY_LIMIT + 1)
  const callRows = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_dispatchRef', (q) => q.eq('dispatchRef', row.dispatchRef))
    .take(X402_SPEND_HISTORY_LIMIT + 1)
  const exposure = [...liabilities, ...settled]
  if (exposure.length > X402_SPEND_HISTORY_LIMIT || callRows.length > X402_SPEND_HISTORY_LIMIT) return 'spend_history_saturated'
  if (!historyValid(exposure, now) || !historyValid(callRows, now)) return 'spend_history_incomplete'
  const initial = await ctx.db.query('moneyX402SpendReservations')
    .withIndex('by_platformBudgetRef_and_normalizedPayTo_and_reservedAt', (q) => q.eq('platformBudgetRef', policy.platformBudgetRef).eq('normalizedPayTo', row.payTo.toLowerCase()))
    .order('asc').first()
  if (initial !== null && !historyValid([initial], now)) return 'spend_history_incomplete'
  const withoutOwn = (candidate: Reservation) => candidate._id !== existing?._id && candidate.state !== 'unused'
  const amount = BigInt(row.amountUnits)
  const total = (rows: readonly Reservation[]) => rows.filter(withoutOwn).reduce((sum, candidate) => sum + BigInt(candidate.amountUnits), amount)
  if (total(callRows) > BigInt(policy.callMaximumUnits)) return 'spend_call_cap_exceeded'
  if (total(exposure) > BigInt(policy.platformDailyMaximumUnits)) return 'spend_platform_cap_exceeded'
  const payeeRows = exposure.filter((candidate) => candidate.normalizedPayTo === row.payTo.toLowerCase())
  const payeeTotal = total(payeeRows)
  if (payeeTotal > BigInt(policy.payeeDailyMaximumUnits)) return 'spend_payee_cap_exceeded'
  if ((initial === null || now - initial.reservedAt < X402_SPEND_WINDOW_MS)
    && payeeTotal > BigInt(policy.newPayeeMaximumUnits)) return 'spend_new_payee_cap_exceeded'
  return undefined
}

/**
 * Requires: current managed unsigned identity, admitted USDC6 lane, complete
 * trusted limits and a fresh, single-use clear for this exact signing material.
 * Ensures: audit + one exposure commit atomically before returning admitted.
 * Invariant: liability survives time, rotation and retry; cap reads and insert
 * share one serializable Convex transaction. No external call occurs here.
 * On violation: return refused after audit insertion so evidence is committed.
 */
export async function recordScreeningAndReserveSigningHandler(
  ctx: MutationCtx, args: RecordScreeningAndReserveSigningArgs,
): Promise<X402SpendAdmissionResult> {
  const now = Date.now()
  const previous = await ctx.db.query('moneyX402PayeeScreeningChecks')
    .withIndex('by_screeningInvocationRef', (q) => q.eq('screeningInvocationRef', args.screeningInvocationRef)).unique()
  if (previous !== null) return { kind: 'refused', code: 'screening_replayed', screeningCheckRef: previous.screeningCheckRef }
  const screeningCheckRef = canonicalDigest({ kind: 'ae.x402.screening-check:v1', screeningInvocationRef: args.screeningInvocationRef.slice(0, 256) })
  const row = await loadByCustody(ctx, args.custodyRef)
  const trusted = trustedPolicy()
  let code: X402SpendAdmissionRefusalCode | undefined
  let expected: Readonly<{ normalizedPayTo: string; typedDataDigest: string }> | undefined
  let existing: Reservation | null = null
  if (trusted === undefined) code = 'spend_configuration_invalid'
  else if (row === null || !attemptMaySign(row, args.purpose, now)
    || row.authorizationDigest !== args.authorizationDigest || !isCanonicalDigest(args.authorizationDigest)
    || row.custodyGeneration !== args.custodyGeneration || row.custodyGeneration !== trusted.custodyGeneration
    || row.custodyBudgetRef !== trusted.custodyBudgetRef
    || row.network !== trusted.network || row.asset.toLowerCase() !== trusted.asset || row.scheme !== 'exact'
    || row.currency !== 'USDC' || row.exponent !== 6 || !isPositiveX402AtomicUnits(row.amountUnits)
    || row.paymentIdentityDigest === undefined || !isCanonicalDigest(row.paymentIdentityDigest)
    || row.paymentUnsignedMaterialDigest !== args.paymentUnsignedMaterialDigest
    || row.paymentSigningIdempotencyKey !== args.paymentSigningIdempotencyKey
    || !isPaymentSigningIdempotencyKey(args.paymentSigningIdempotencyKey)) code = 'spend_identity_conflict'
  else if (row.spendReservationRef === undefined) code = 'spend_history_incomplete'
  else if (row.spendReservationRef !== x402SpendReservationRef({ custodyRef: row.custodyRef, attemptRef: row.attemptRef, effectGeneration: row.effectGeneration, paymentIdentityDigest: row.paymentIdentityDigest })) code = 'spend_identity_conflict'
  else if (row.toolRef === undefined || row.inputDigest === undefined || !(await persistedCallAuthorityIsCurrent(ctx, {
    callRef: row.dispatchRef, toolRef: row.toolRef, inputDigest: row.inputDigest, attemptRef: row.attemptRef,
  }))) code = 'spend_authority_invalid'
  else {
    expected = expectedMaterial(row, trusted.payer, now, args.purpose)
    if (expected === undefined) code = 'spend_identity_conflict'
    else code = screeningRefusal(args, row, expected, now)
    if (code === undefined && expected !== undefined) {
      existing = await ctx.db.query('moneyX402SpendReservations')
        .withIndex('by_attemptRef_and_effectGeneration', (q) => q.eq('attemptRef', row.attemptRef).eq('effectGeneration', row.effectGeneration)).unique()
      if (existing !== null && !sameExposure(existing, row, trusted.policy, expected.typedDataDigest)) code = 'spend_identity_conflict'
      else if (existing !== null && existing.state !== 'liability') code = 'spend_reservation_terminal'
      else code = await exposureRefusal(ctx, row, trusted.policy, existing, now)
    }
  }
  // Persist only bounded, non-secret provider evidence, including on refusal.
  const decision = {
    ...args.screening,
    network: args.screening.network.slice(0, 128), normalizedPayTo: args.screening.normalizedPayTo.slice(0, 128),
    paymentUnsignedMaterialDigest: args.screening.paymentUnsignedMaterialDigest.slice(0, 128),
    typedDataDigest: args.screening.typedDataDigest.slice(0, 128), reason: args.screening.reason.slice(0, 512),
    ...(args.screening.providerReference === undefined ? {} : { providerReference: args.screening.providerReference.slice(0, 256) }),
    ...(args.screening.evidenceDigest === undefined ? {} : { evidenceDigest: args.screening.evidenceDigest.slice(0, 128) }),
  }
  await ctx.db.insert('moneyX402PayeeScreeningChecks', {
    screeningCheckRef, screeningInvocationRef: args.screeningInvocationRef.slice(0, 256),
    custodyRef: args.custodyRef.slice(0, 128), authorizationDigest: args.authorizationDigest.slice(0, 128),
    custodyGeneration: args.custodyGeneration,
    paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest.slice(0, 128),
    paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey.slice(0, 128),
    ...(row === null ? {} : {
      dispatchRef: row.dispatchRef, attemptRef: row.attemptRef, effectGeneration: row.effectGeneration,
      ...(row.paymentIdentityDigest === undefined ? {} : { paymentIdentityDigest: row.paymentIdentityDigest }),
    }),
    ...(expected === undefined ? {} : { expectedNormalizedPayTo: expected.normalizedPayTo, expectedTypedDataDigest: expected.typedDataDigest }),
    decision, admission: code === undefined ? 'admitted' : 'refused',
    ...(code === undefined ? {} : { refusalCode: code }),
    ...(trusted === undefined ? {} : { policyRevision: trusted.policy.policyRevision }),
    ...(code === undefined && row !== null ? { spendReservationRef: row.spendReservationRef } : {}),
    recordedAt: now,
  })
  if (code !== undefined) return { kind: 'refused', code, screeningCheckRef }
  // These values have been established above; avoid an assertion/throw after
  // the audit write because it would roll back the refusal record.
  if (row === null || trusted === undefined || expected === undefined
    || row.spendReservationRef === undefined || row.paymentIdentityDigest === undefined) {
    return { kind: 'refused', code: 'spend_identity_conflict', screeningCheckRef }
  }
  if (existing === null) await ctx.db.insert('moneyX402SpendReservations', {
    reservationRef: row.spendReservationRef, platformBudgetRef: trusted.policy.platformBudgetRef,
    custodyBudgetRef: trusted.custodyBudgetRef, custodyRef: row.custodyRef, custodyGeneration: trusted.custodyGeneration,
    environment: trusted.environment, network: row.network, asset: trusted.asset, currency: 'USDC', exponent: 6,
    dispatchRef: row.dispatchRef, attemptRef: row.attemptRef, effectGeneration: row.effectGeneration,
    authorizationDigest: row.authorizationDigest, paymentIdentityDigest: row.paymentIdentityDigest,
    paymentUnsignedMaterialDigest: args.paymentUnsignedMaterialDigest,
    paymentSigningIdempotencyKey: args.paymentSigningIdempotencyKey, typedDataDigest: expected.typedDataDigest,
    normalizedPayTo: expected.normalizedPayTo, amountUnits: row.amountUnits, reservedAt: now,
    policyRevision: trusted.policy.policyRevision, initialScreeningCheckRef: screeningCheckRef, state: 'liability',
  })
  return { kind: 'admitted', reservationRef: row.spendReservationRef, screeningCheckRef, policyRevision: trusted.policy.policyRevision }
}
