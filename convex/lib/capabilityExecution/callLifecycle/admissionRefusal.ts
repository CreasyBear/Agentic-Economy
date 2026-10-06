import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { assertAgentAccessRateAdmission } from '../../platform/rateLimit'
import { evaluateOrganizationMonthlySpendFence } from '@/modules/money/public'
import { readOutstandingPlanExposureHandler } from '../plans/planCommands'
import {
  normalizeStoredAgentAccessGrant,
  normalizeStoredAgentAccessGrantForTool,
  projectAgentAccessGrant,
  type NormalizedStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import { spendingPeriodsAreCurrent } from '../../money/spendingPeriods/periods'
import type { ReserveArgs, ReserveResult } from './admissionReservation'
import type { GrantRow } from './contracts'

type GrantRefusal = Extract<ReserveResult, { kind: 'refused' }>
type CommitmentRow = Doc<'capabilityQuotes'>

export function missingGrant(): GrantRefusal {
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

export async function loadReservationGrant(
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

export async function rateAndConcurrencyRefusal(
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
export async function spendingPeriodAdmissionRefusal(
  ctx: MutationCtx,
  args: ReserveArgs,
  commitment: CommitmentRow | null,
  grant: NormalizedStoredAgentAccessGrant,
): Promise<GrantRefusal | null> {
  if (commitment === null || commitment.decisionAudUnits === '0') return null
  const periods = commitment.spendingPeriods
  if (!['v1.4.0', 'v1.5.0'].includes(commitment.formanceSchemaVersion) || periods === undefined) {
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

export async function organizationMonthlySpendReserveRefusal(
  ctx: Pick<MutationCtx, 'db'>,
  args: Pick<ReserveArgs, 'ownerId' | 'now' | 'organizationMonthlySpend'>,
  commitment: Pick<CommitmentRow, 'decisionAudUnits'> | null,
): Promise<GrantRefusal | null> {
  if (commitment === null || commitment.decisionAudUnits === '0') return null
  const budgetRow = await ctx.db.query('moneyMonthlySpendBudgets')
    .withIndex('by_accountRef', query => query.eq('accountRef', args.ownerId)).unique()
  if (budgetRow === null || !budgetRow.enabled) return null
  const snapshot = args.organizationMonthlySpend
  const organizationMonth = new Date(args.now).toISOString().slice(0, 7)
  const held = await readOutstandingPlanExposureHandler(ctx, { accountRef: args.ownerId, organizationMonth })
  if (held.kind !== 'available' || snapshot?.planExposureDigest !== held.digest
    || snapshot.organizationMonth !== organizationMonth) return {
    kind: 'refused', code: 'budget_exceeded', retryable: true,
    nextAction: 'Retry with the same idempotency key to inspect current organization spend.',
  }
  const fence = evaluateOrganizationMonthlySpendFence({
    enabled: true,
    ceilingUnits: budgetRow.ceilingUnits,
    ...(snapshot.monthSpendUnits === undefined ? {} : { monthSpendUnits: snapshot.monthSpendUnits }),
    requestUnits: commitment.decisionAudUnits,
    heldPlanExposure: { kind: 'known', units: held.units },
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
