import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { activeChatTurnForMoney } from '../../chat/threads/ownership'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  parsePublishedToolSnapshot,
  publishedToolMaterialMatches,
  type SellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import type { CallIdempotencyReservation } from '@/modules/capability-execution/call-authority'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import {
  loadReservationGrant,
  missingGrant,
  organizationMonthlySpendReserveRefusal,
  rateAndConcurrencyRefusal,
  spendingPeriodAdmissionRefusal,
} from './admissionRefusal'
import { toolProviderRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import type { ReserveArgs, ReserveResult } from './admissionReservation'
import type { CallRow } from './contracts'

function reservationFromArgs(args: ReserveArgs): CallIdempotencyReservation {
  return {
    quoteRef: args.quoteRef,
    principalId: args.principalId,
    credentialId: args.credentialId,
    applicationRef: args.applicationRef,
    grantRef: args.grantRef,
    grantGeneration: args.grantGeneration,
    policyDigest: args.policyDigest,
    grantExpiresAt: args.grantExpiresAt,
    environment: args.environment,
    toolRef: args.toolRef,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    requestDigest: args.requestDigest,
    callRef: args.callRef,
  }
}

function reservationFromRow(row: CallRow): CallIdempotencyReservation | undefined {
  if (row.quoteRef === undefined
    || row.grantRef === undefined
    || row.policyDigest === undefined
    || row.grantExpiresAt === undefined) return undefined
  return {
    quoteRef: row.quoteRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    applicationRef: row.applicationRef,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    policyDigest: row.policyDigest,
    grantExpiresAt: row.grantExpiresAt,
    environment: row.environment,
    toolRef: row.toolRef,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    requestDigest: row.requestDigest,
    callRef: row.callRef,
  }
}

function operationSnapshotMatches(existing: CallRow, args: ReserveArgs): boolean {
  if (existing.toolJson === undefined || args.toolJson === undefined) return true
  return publishedToolMaterialMatches(
    parsePublishedToolSnapshot(existing.toolJson),
    parsePublishedToolSnapshot(args.toolJson),
  )
}

// A reservation is identified by the stable Principal tuple plus the request
// material the idempotency key stands for. The credential, the grant it was
// issued under, and the derived callRef are effect evidence retained on the
// stored row: a credential rotation must replay the original Call, so those
// fields are read back through reservationFromRow instead of compared.
function existingReservationMatches(existing: CallRow, args: ReserveArgs): boolean {
  return [
    existing.quoteRef !== undefined,
    existing.grantRef !== undefined,
    existing.policyDigest !== undefined,
    existing.grantExpiresAt !== undefined,
    existing.quoteRef === args.quoteRef,
    existing.principalId === args.principalId,
    existing.ownerId === args.ownerId,
    existing.applicationRef === args.applicationRef,
    existing.environment === args.environment,
    existing.toolRef === args.toolRef,
    existing.idempotencyKey === args.idempotencyKey,
    existing.inputDigest === args.inputDigest,
    existing.requestDigest === args.requestDigest,
    operationSnapshotMatches(existing, args),
    existing.inputJson === args.inputJson,
    canonicalOptionalCanary(existing.sellerOnboardingCanary) === canonicalOptionalCanary(args.sellerOnboardingCanary),
  ].every(Boolean)
}

export function canonicalOptionalCanary(
  value: SellerOnboardingCanaryExecutionEnvelope | undefined,
): string | undefined {
  return value === undefined ? undefined : canonicalDigest(value as never)
}

function canaryEnvelopeMatchesReservation(args: ReserveArgs): boolean {
  const canary = args.sellerOnboardingCanary
  if (canary === undefined) return true
  return [
    (args.environment === 'sandbox' || args.environment === 'production'),
    canary.executionPurpose === 'seller_onboarding_canary',
    canary.callRef === args.callRef,
    canary.toolRef === args.toolRef,
    canary.inputDigest === args.inputDigest,
    canary.idempotencyKey === args.idempotencyKey,
    canary.readinessValidUntil > args.now,
    canary.expiresAt > args.now,
    canary.expiresAt <= canary.readinessValidUntil,
    canary.funding.kind === 'ae_owned',
    canary.funding.principalId === args.principalId,
    canary.funding.ownerId === args.ownerId,
    canary.funding.credentialId === args.credentialId,
    canary.funding.applicationRef === args.applicationRef,
    canary.funding.grantRef === args.grantRef,
    canary.funding.grantGeneration === args.grantGeneration,
    canary.funding.policyDigest === args.policyDigest,
    canary.funding.ledgerEffects === 'external_spend_only',
    canary.accountingPolicy.recordBuyerUsage === false,
    canary.accountingPolicy.accrueProviderEarnings === false,
    canary.accountingPolicy.accruePlatformRake === false,
    canary.accountingPolicy.recordQualifiedUse === false,
  ].every(Boolean)
}

async function replayExistingReservation(
  ctx: MutationCtx,
  existing: CallRow,
  args: ReserveArgs,
): Promise<ReserveResult> {
  if (!existingReservationMatches(existing, args)) return { kind: 'conflict' }
  const reservation = reservationFromRow(existing)
  if (reservation === undefined) return { kind: 'conflict' }
  if (existing.toolJson === undefined && args.toolJson !== undefined) {
    await ctx.db.patch(existing._id, { toolJson: args.toolJson, updatedAt: args.now })
  }
  return { kind: 'replayed', reservation }
}

type CommitmentRow = Doc<'capabilityQuotes'>

async function loadReservationCommitment(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<CommitmentRow | null> {
  if (args.sellerOnboardingCanary !== undefined) return null
  return await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
}

function commitmentMatchesReservation(commitment: CommitmentRow | null, args: ReserveArgs): boolean {
  if (args.sellerOnboardingCanary !== undefined) return commitment === null
  if (commitment === null) return false
  return [
    commitment.state === 'issued',
    commitment.expiresAt > args.now,
    commitment.principalId === args.principalId,
    commitment.accountRef === args.ownerId,
    commitment.credentialId === args.credentialId,
    commitment.applicationRef === args.applicationRef,
    commitment.environment === args.environment,
    commitment.grantRef === args.grantRef,
    commitment.grantGeneration === args.grantGeneration,
    commitment.grantPolicyDigest === args.policyDigest,
    commitment.toolRef === args.toolRef,
    commitment.inputDigest === args.inputDigest,
    args.toolJson === undefined || commitment.toolJson === args.toolJson,
    args.inputJson === undefined || commitment.normalizedInputJson === args.inputJson,
  ].every(Boolean)
}

async function persistReservedCall(
  ctx: MutationCtx,
  args: ReserveArgs,
  reservation: CallIdempotencyReservation,
  commitment: CommitmentRow | null,
  formanceFinancialState?: 'reservation_pending',
): Promise<void> {
  await ctx.db.insert('capabilityCalls', {
    ...reservation,
    ...(args.toolJson === undefined ? {} : { toolJson: args.toolJson }),
    ...(args.inputJson === undefined ? {} : { inputJson: args.inputJson }),
    ...(args.sellerOnboardingCanary === undefined
      ? {}
      : { sellerOnboardingCanary: structuredClone(args.sellerOnboardingCanary) }),
    ...(formanceFinancialState === undefined ? {} : { formanceFinancialState }),
    ownerId: args.ownerId,
    state: 'pending',
    createdAt: args.now,
    updatedAt: args.now,
  })
  if (commitment !== null) {
    await ctx.db.patch(commitment._id, {
      state: 'consumed',
      consumedCallRef: reservation.callRef,
      updatedAt: args.now,
    })
  }
}

async function attachCallToTurn(ctx: MutationCtx, turn: Doc<'chatTurns'>, callRef: string): Promise<void> {
  const refs = turn.inFlightCallRefs ?? []
  if (!refs.includes(callRef)) {
    await ctx.db.patch(turn._id, { inFlightCallRefs: [...refs, callRef] })
  }
}

export async function reserveHandler(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<ReserveResult> {
  const turnRef = args.turnRef
  const turn = turnRef === undefined ? null : await ctx.db.query('chatTurns')
    .withIndex('by_turnRef', (query) => query.eq('turnRef', turnRef))
    .unique()
  if (turnRef !== undefined && (turn === null
    || turn.principalKind !== 'agent_key'
    || turn.principalRef !== args.principalId
    || turn.accountRef !== args.ownerId
    || turn.credentialLocator !== args.credentialId
    || turn.grantRef !== args.grantRef
    || !await activeChatTurnForMoney(ctx, turn))) {
    return missingGrant()
  }
  if (!canaryEnvelopeMatchesReservation(args)) return { kind: 'conflict' }
  // Keyed by the stable Principal: a rotated credential replays the original
  // reservation instead of minting a second Call under the same key.
  const existing = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_idempotencyKey', (query) => query.eq('principalId', args.principalId).eq('idempotencyKey', args.idempotencyKey))
    .take(2)
  if (existing.length > 1) return { kind: 'conflict' }
  const reservation = reservationFromArgs(args)
  const replay = existing[0]
  if (replay !== undefined) {
    const result = await replayExistingReservation(ctx, replay, args)
    if (result.kind === 'replayed' && turn !== null) {
      await attachCallToTurn(ctx, turn, result.reservation.callRef)
    }
    return result
  }
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return {
      kind: 'refused',
      code: 'operation_not_ready',
      retryable: false,
      nextAction: 'The Provider is offboarding; select another Tool.',
    }
  }

  const commitment = await loadReservationCommitment(ctx, args)
  if (!commitmentMatchesReservation(commitment, args)) return { kind: 'conflict' }

  const grantDecision = await loadReservationGrant(ctx, args)
  if (grantDecision.kind === 'refused') return grantDecision
  const normalizedGrant = grantDecision.grant

  const periodRefusal = await spendingPeriodAdmissionRefusal(ctx, args, commitment, normalizedGrant)
  if (periodRefusal !== null) return periodRefusal

  const organizationSpendRefusal = await organizationMonthlySpendReserveRefusal(ctx, args, commitment)
  if (organizationSpendRefusal !== null) return organizationSpendRefusal

  const admissionRefusal = await rateAndConcurrencyRefusal(ctx, args, normalizedGrant)
  if (admissionRefusal !== null) return admissionRefusal
  const paidPeriodAwareCall = commitment !== null
    && commitment.decisionAudUnits !== '0'
    && commitment.spendingPeriods !== undefined
  await persistReservedCall(
    ctx,
    args,
    reservation,
    commitment,
    paidPeriodAwareCall ? 'reservation_pending' : undefined,
  )
  if (turn !== null) await attachCallToTurn(ctx, turn, reservation.callRef)
  await recordMarketEvidenceFact(ctx, 'ae_invocation', reservation.callRef, args.now, {
    toolRef: reservation.toolRef,
  })

  return { kind: 'reserved', reservation }
}

