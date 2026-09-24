import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { assertAgentAccessRateAdmission } from '../../platform/rateLimit'
import { activeChatTurnForMoney } from '../../chat/threadOwnership'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { evaluateOrganizationMonthlySpendFence } from '@/modules/money/public'
import {
  parsePublishedToolSnapshot,
  publishedToolMaterialMatches,
  type SellerOnboardingCanaryExecutionEnvelope,
} from '@/modules/capability-supply/public'
import type { CallIdempotencyReservation } from '@/modules/capability-execution/call-authority'
import { recordMarketEvidenceFact } from '../../../marketEvidence'
import {
  normalizeStoredAgentAccessGrant,
  normalizeStoredAgentAccessGrantForTool,
  projectAgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { toolProviderRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import { spendingPeriodsAreCurrent } from '../../money/spendingPeriods/periods'
import type { AbandonArgs, AbandonResult, ReserveArgs, ReserveResult } from './admissionReservation'
import type { CallRow, GrantRow } from './contracts'

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

function canonicalOptionalCanary(
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

type GrantRefusal = Extract<ReserveResult, { kind: 'refused' }>

function missingGrant(): GrantRefusal {
  return {
    kind: 'refused',
    code: 'grant_not_found',
    retryable: false,
    nextAction: 'Refresh the agent grant and retry.',
  }
}

function grantIdentityMatches(grant: NormalizedStoredAgentAccessGrant, args: ReserveArgs): boolean {
  return [
    grant.principalId === args.principalId,
    grant.ownerId === args.ownerId,
    grant.credentialId === args.credentialId,
    grant.applicationRef === args.applicationRef,
  ].every(Boolean)
}

function grantAdmissionRefusal(grant: GrantRow | null, args: ReserveArgs): GrantRefusal | null {
  if (grant === null) return missingGrant()
  let normalized: NormalizedStoredAgentAccessGrant
  try {
    normalized = normalizeStoredAgentAccessGrant(grant)
  } catch (cause) {
    return degradeBackend(cause, missingGrant(), { site: 'grantAdmissionRefusal', reason: 'invalid_response' })
  }
  if (normalized.environment !== args.environment) {
    return { kind: 'refused', code: 'environment_mismatch', retryable: false, nextAction: 'Use a grant for the requested environment.' }
  }
  if (!grantIdentityMatches(normalized, args)) return missingGrant()
  if (normalized.lifecycle === 'revoked') {
    return { kind: 'refused', code: 'grant_revoked', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  if (normalized.lifecycle === 'expired' || normalized.expiresAt <= args.now) {
    return { kind: 'refused', code: 'grant_expired', retryable: false, nextAction: 'Issue a new agent grant before retrying.' }
  }
  const generationMatches = [
    normalized.generation === args.grantGeneration,
    normalized.spendingPolicyDigest === args.policyDigest,
    normalized.expiresAt === args.grantExpiresAt,
  ].every(Boolean)
  return generationMatches
    ? null
    : { kind: 'refused', code: 'grant_generation_stale', retryable: false, nextAction: 'Refresh the agent grant and retry.' }
}

async function loadReservationGrant(
  ctx: MutationCtx,
  args: ReserveArgs,
): Promise<GrantRefusal | { kind: 'granted'; grant: NormalizedStoredAgentAccessGrant }> {
  const storedGrant = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  const refusal = grantAdmissionRefusal(storedGrant, args)
  if (refusal !== null) return refusal
  if (storedGrant === null) return missingGrant()
  const grant = normalizeStoredAgentAccessGrantForTool(storedGrant, args.toolRef)
  return grant === undefined ? missingGrant() : { kind: 'granted', grant }
}

async function concurrencyAdmissionRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  concurrentLimit: number,
): Promise<GrantRefusal | null> {
  // A pending or uncertain Call remains an active Agent commitment until its
  // lifecycle resolves. Credential rotation and grant expiry do not free it.
  const pendingRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_state', (query) => (
      query.eq('principalId', args.principalId).eq('state', 'pending')
    ))
    .take(concurrentLimit)
  if (pendingRows.length >= concurrentLimit) {
    return { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Retry after an active invocation completes.' }
  }
  const reconciliationRows = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_state', (query) => query.eq('principalId', args.principalId).eq('state', 'reconciliation_required'))
    .take(concurrentLimit - pendingRows.length)
  return pendingRows.length + reconciliationRows.length >= concurrentLimit
    ? { kind: 'refused', code: 'concurrency_limited', retryable: true, nextAction: 'Resolve an active invocation before retrying.' }
    : null
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

async function rateAndConcurrencyRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  grant: NormalizedStoredAgentAccessGrant,
): Promise<GrantRefusal | null> {
  const rate = await assertAgentAccessRateAdmission(ctx, {
    principalRef: args.principalId,
    maximumCallsPerMinute: grant.spendingPolicy.rate.maximumCallsPerMinute,
    maximumCallsPerHour: grant.spendingPolicy.rate.maximumCallsPerHour,
  })
  if (!rate.ok) {
    return {
      kind: 'refused',
      code: 'rate_limited',
      retryable: true,
      nextAction: 'Retry after the current rate window advances.',
    }
  }
  return await concurrencyAdmissionRefusal(
    ctx,
    args,
    'maximumConcurrentCalls' in grant.spendingPolicy.budget
      ? grant.spendingPolicy.budget.maximumConcurrentCalls
      : grant.spendingPolicy.budget.maximumConcurrentInvocations,
  )
}

/**
 * Paid period-aware Quotes must prove that both acknowledged control rows are
 * still current immediately before the Call/Quote transaction. This runs only
 * after the existing current-grant resolution; exact idempotent replay has
 * already returned above and therefore retains its original booking.
 */
async function spendingPeriodAdmissionRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  commitment: CommitmentRow | null,
  grant: NormalizedStoredAgentAccessGrant,
): Promise<GrantRefusal | null> {
  if (commitment === null || args.sellerOnboardingCanary !== undefined
    || commitment.decisionAudUnits === '0') return null
  const periods = commitment.spendingPeriods
  if (commitment.formanceSchemaVersion !== 'v1.4.0' || periods === undefined) {
    return {
      kind: 'refused',
      code: 'budget_exceeded',
      retryable: false,
      nextAction: 'Request a fresh Quote to refresh current spending limits.',
    }
  }
  const projected = projectAgentAccessGrant(grant)
  const daily = projected.budget.maximumDailySpend
  const monthly = projected.budget.maximumMonthlySpend
  if (daily.currency !== 'AUD' || daily.exponent !== 6
    || monthly.currency !== 'AUD' || monthly.exponent !== 6) {
    return {
      kind: 'refused',
      code: 'budget_exceeded',
      retryable: false,
      nextAction: 'Request a fresh Quote to refresh current spending limits.',
    }
  }
  if (!await spendingPeriodsAreCurrent(ctx, {
    principalRef: args.principalId,
    dailyLimitUnits: daily.units,
    monthlyLimitUnits: monthly.units,
    now: args.now,
    spendingPeriods: periods,
  })) {
    return {
      kind: 'refused',
      code: 'budget_exceeded',
      retryable: true,
      nextAction: 'Request a fresh Quote to refresh current spending limits.',
    }
  }
  const amount = BigInt(commitment.decisionAudUnits)
  if (BigInt(daily.units) < amount) {
    return {
      kind: 'refused',
      code: 'budget_exceeded',
      retryable: false,
      nextAction: 'Request a fresh Quote after the daily spending limit changes.',
    }
  }
  if (BigInt(monthly.units) < amount) {
    return {
      kind: 'refused',
      code: 'budget_exceeded',
      retryable: false,
      nextAction: 'Request a fresh Quote after the monthly spending limit changes.',
    }
  }
  return null
}

async function organizationMonthlySpendReserveRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  commitment: CommitmentRow | null,
): Promise<GrantRefusal | null> {
  if (commitment === null || commitment.decisionAudUnits === '0') return null
  let snapshot: { enabled: boolean; ceilingUnits?: string; monthSpendUnits?: string } | undefined = args.organizationMonthlySpend
  if (snapshot === undefined || !snapshot.enabled) {
    const budgetRow = await ctx.db
      .query('moneyMonthlySpendBudgets')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', args.ownerId))
      .unique()
    if (budgetRow === null || !budgetRow.enabled) return null
    snapshot = {
      enabled: true,
      ceilingUnits: budgetRow.ceilingUnits,
    }
  }
  const fence = evaluateOrganizationMonthlySpendFence({
    enabled: true,
    ...(snapshot.ceilingUnits === undefined ? {} : { ceilingUnits: snapshot.ceilingUnits }),
    ...(snapshot.monthSpendUnits === undefined ? {} : { monthSpendUnits: snapshot.monthSpendUnits }),
    requestUnits: commitment.decisionAudUnits,
  })
  switch (fence.kind) {
    case 'not_applicable':
    case 'admitted':
      return null
    case 'refused':
      return {
        kind: 'refused',
        code: 'budget_exceeded',
        retryable: false,
        nextAction: 'Request a fresh Quote after the organization monthly spending cap changes.',
      }
    case 'unavailable':
      return {
        kind: 'refused',
        code: 'budget_exceeded',
        retryable: false,
        nextAction: 'Request a fresh Quote once organization spend can be inspected again.',
      }
    default: {
      const exhaustive: never = fence
      return exhaustive
    }
  }
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

export async function abandonHandler(
  ctx: MutationCtx,
  args: AbandonArgs,
): Promise<AbandonResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || !abandonmentIdentityMatches(row, args)) return { kind: 'not_found' as const }
  if (dispatchHasStarted(row)) return { kind: 'dispatch_started' as const }
  const commitment = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
  await ctx.db.delete(row._id)
  const turnRef = args.turnRef
  if (turnRef !== undefined) {
    const turn = await ctx.db.query('chatTurns')
      .withIndex('by_turnRef', (query) => query.eq('turnRef', turnRef))
      .unique()
    if (turn !== null
      && turn.principalKind === 'agent_key'
      && turn.principalRef === row.principalId
      && turn.accountRef === row.ownerId
      && turn.credentialLocator === row.credentialId
      && turn.grantRef === row.grantRef
      && turn.inFlightCallRefs?.includes(row.callRef)) {
      await ctx.db.patch(turn._id, {
        inFlightCallRefs: turn.inFlightCallRefs.filter(ref => ref !== row.callRef),
        updatedAt: Date.now(),
      })
    }
  }
  if (commitment !== null
    && commitment.state === 'consumed'
    && commitment.consumedCallRef === row.callRef
    && commitment.expiresAt > Date.now()) {
    await ctx.db.patch(commitment._id, {
      state: 'issued',
      consumedCallRef: undefined,
      updatedAt: Date.now(),
    })
  }
  return { kind: 'abandoned' as const }
}

function abandonmentIdentityMatches(row: CallRow, args: AbandonArgs): boolean {
  return [
    row.quoteRef === args.quoteRef,
    row.principalId === args.principalId,
    row.ownerId === args.ownerId,
    row.credentialId === args.credentialId,
    row.applicationRef === args.applicationRef,
    row.grantRef === args.grantRef,
    row.grantGeneration === args.grantGeneration,
    row.policyDigest === args.policyDigest,
    row.grantExpiresAt === args.grantExpiresAt,
    row.environment === args.environment,
    row.toolRef === args.toolRef,
    row.idempotencyKey === args.idempotencyKey,
    row.inputDigest === args.inputDigest,
    row.requestDigest === args.requestDigest,
    row.callRef === args.callRef,
    canonicalOptionalCanary(row.sellerOnboardingCanary) === canonicalOptionalCanary(args.sellerOnboardingCanary),
  ].every(Boolean)
}

function dispatchHasStarted(row: CallRow): boolean {
  return [
    row.state !== 'pending',
    row.result !== undefined,
    row.workId !== undefined,
    row.authority !== undefined,
    row.dispatchState !== undefined,
  ].some(Boolean)
}
