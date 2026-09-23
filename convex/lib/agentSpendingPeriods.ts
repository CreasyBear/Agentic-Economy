import type { MutationCtx, QueryCtx } from '../_generated/server'
import { canonicalDigest, isCanonicalDigest } from '../../src/modules/common/canonical-digest'
import { currentUtcDayBounds, currentUtcMonthBounds } from '../../src/modules/common/freshness'
import {
  PACKAGE4_FORMANCE_REQUIREMENTS,
  spendingPeriodAdjustmentReference,
  type SpendingPeriods,
  type SpendingPeriodAdjustment,
} from '../../src/modules/money/public'

type PeriodRequest = Readonly<{
  principalRef: string
  dailyLimitUnits: string
  monthlyLimitUnits: string
  now: number
}>
export type PreparedSpendingPeriods =
  | { kind: 'prepared'; spendingPeriods: SpendingPeriods; commands: SpendingPeriodAdjustment[] }
  | { kind: 'refused'; reason: string }

function canonicalLimit(value: string): boolean {
  return /^(?:0|[1-9]\d{0,15})$/u.test(value)
    && BigInt(value) <= BigInt(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)
}

function requestedPeriods(input: PeriodRequest) {
  if (input.principalRef.length === 0 || input.principalRef.length > 500
    || !canonicalLimit(input.dailyLimitUnits) || !canonicalLimit(input.monthlyLimitUnits)
    || BigInt(input.dailyLimitUnits) > BigInt(input.monthlyLimitUnits)) return undefined
  try {
    return [
      { periodKind: 'day' as const, ...currentUtcDayBounds(input.now), limitUnits: input.dailyLimitUnits },
      { periodKind: 'month' as const, ...currentUtcMonthBounds(input.now), limitUnits: input.monthlyLimitUnits },
    ]
  } catch (cause) {
    if (cause instanceof RangeError) return undefined
    throw cause
  }
}

async function periodRow(
  ctx: Pick<QueryCtx, 'db'>,
  principalRef: string,
  periodKind: 'day' | 'month',
  periodStartAt: number,
) {
  const rows = await ctx.db.query('agentSpendingPeriods')
    .withIndex('by_principalRef_and_periodKind_and_periodStartAt', (q) => q
      .eq('principalRef', principalRef).eq('periodKind', periodKind).eq('periodStartAt', periodStartAt))
    .take(2)
  return rows.length > 1 ? undefined : rows[0] ?? null
}

// Admission inserts reservation_pending in the same transaction that checks the
// control rows. This indexed read and that write form the Convex ordering fence.
async function unresolvedReservation(
  ctx: MutationCtx,
  principalRef: string,
  changedPeriods: readonly { periodKind: 'day' | 'month'; periodStartAt: number }[],
) {
  const pending = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_formanceFinancialState', (q) => q
      .eq('principalId', principalRef).eq('formanceFinancialState', 'reservation_pending'))
    .take(129)
  const unknown = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_formanceFinancialState', (q) => q
      .eq('principalId', principalRef).eq('formanceFinancialState', 'outcome_unknown'))
    .filter((q) => q.eq(q.field('formanceReservationRefs'), undefined))
    .take(129)
  if (pending.length > 128 || unknown.length > 128) return true
  for (const call of [...pending, ...unknown]) {
    if (call.quoteRef === undefined) return true
    const quoteRef = call.quoteRef
    const quotes = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (q) => q.eq('quoteRef', quoteRef)).take(2)
    const quote = quotes.length === 1 ? quotes[0] : undefined
    if (quote?.spendingPeriods === undefined) return true
    if (changedPeriods.some((period) => (
      period.periodKind === 'day' ? quote.spendingPeriods!.daily : quote.spendingPeriods!.monthly
    ).periodStartAt === period.periodStartAt)) return true
  }
  return false
}

async function cleanLegacyHistory(ctx: MutationCtx, principalRef: string, monthStartAt: number) {
  // Bounded proof, never a truncated claim of absence. A busy legacy principal
  // requires explicit opening-usage evidence; no automatic zero initialization.
  const calls = await ctx.db.query('capabilityCalls')
    .withIndex('by_principalId_and_createdAt', (q) => q
      .eq('principalId', principalRef).gte('createdAt', monthStartAt))
    .take(129)
  if (calls.length > 128) return false
  for (const call of calls) {
    if (call.sellerOnboardingCanary !== undefined) continue
    if (call.quoteRef === undefined) return false
    const quoteRef = call.quoteRef
    const quotes = await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (q) => q.eq('quoteRef', quoteRef)).take(2)
    const quote = quotes.length === 1 ? quotes[0] : undefined
    if (quote === undefined || quote.principalId !== principalRef || quote.accountRef !== call.ownerId
      || quote.consumedCallRef !== call.callRef || quote.state !== 'consumed') return false
    if (quote.decisionAudUnits !== '0' && quote.spendingPeriods === undefined) return false
  }
  return true
}

/**
 * CONTRACT: Requires current authority resolved in this mutation and canonical
 * AUD/6 limits. Ensures one persisted command per stable Agent/UTC interval.
 * Invariant: pending commands are immutable; previous ceiling is acknowledged
 * configuration, never a balance. Unresolved admitted reservations fence changes.
 * On violation: typed refusal; no zero-history assumption or new admission.
 */
export async function prepareAgentSpendingPeriods(
  ctx: MutationCtx,
  input: PeriodRequest & Readonly<{ authorityDigest: string }>,
): Promise<PreparedSpendingPeriods> {
  const requested = requestedPeriods(input)
  if (requested === undefined || !isCanonicalDigest(input.authorityDigest)) {
    return { kind: 'refused', reason: 'spending_period_input_invalid' }
  }
  const rows = await Promise.all(requested.map((period) => periodRow(
    ctx, input.principalRef, period.periodKind, period.periodStartAt,
  )))
  if (rows.some((row, index) => row === undefined || (row !== null
    && (row.periodEndAt !== requested[index]!.periodEndAt
      || !Number.isSafeInteger(row.appliedRevision) || row.appliedRevision < 0
      || !canonicalLimit(row.appliedLimitUnits))))) {
    return { kind: 'refused', reason: 'spending_period_identity_conflict' }
  }
  // The monthly row is the durable clean-history decision for this month. New
  // daily rows reuse it, so active Agents don't rescan their lifetime on every day.
  if (rows[1] === null && !await cleanLegacyHistory(ctx, input.principalRef, requested[1]!.periodStartAt)) {
    return { kind: 'refused', reason: 'spending_period_legacy_history_requires_support' }
  }
  const changedPeriods = requested.filter((period, index) => {
    const row = rows[index]
    return row !== null && row !== undefined && row.pending === undefined
      && row.appliedLimitUnits !== period.limitUnits
  })
  // Initializing a new interval cannot race a purchase using that interval: it
  // has never been acknowledged. Only a revision of existing capacity needs to
  // wait for reservations that can still consume its previous ceiling.
  if (changedPeriods.length > 0 && await unresolvedReservation(ctx, input.principalRef, changedPeriods)) {
    return { kind: 'refused', reason: 'spending_period_reservation_recovery_pending' }
  }
  const commands: SpendingPeriodAdjustment[] = []
  const snapshots: SpendingPeriods['daily'][] = []
  for (const [index, period] of requested.entries()) {
    const row = rows[index]
    if (row === undefined || (row !== null && row.periodEndAt !== period.periodEndAt)) {
      return { kind: 'refused', reason: 'spending_period_identity_conflict' }
    }
    let pending = row?.pending
    if (row === null || (pending === undefined && row.appliedLimitUnits !== period.limitUnits)) {
      pending = {
        principalRef: input.principalRef,
        periodKind: period.periodKind,
        periodStartAt: period.periodStartAt,
        periodEndAt: period.periodEndAt,
        revision: (row?.appliedRevision ?? 0) + 1,
        previousLimitUnits: row?.appliedLimitUnits ?? '0',
        targetLimitUnits: period.limitUnits,
        authorityDigest: input.authorityDigest,
      }
      if (row === null) {
        await ctx.db.insert('agentSpendingPeriods', {
          principalRef: input.principalRef,
          periodKind: period.periodKind,
          periodStartAt: period.periodStartAt,
          periodEndAt: period.periodEndAt,
          appliedRevision: 0,
          appliedLimitUnits: '0',
          pending,
          cutover: 'clean_period',
        })
      } else {
        await ctx.db.patch(row._id, { pending })
      }
    }
    if (pending !== undefined) commands.push(pending)
    snapshots.push({
      periodStartAt: period.periodStartAt,
      periodEndAt: period.periodEndAt,
      revision: pending?.revision ?? row?.appliedRevision ?? 0,
      limitUnits: pending?.targetLimitUnits ?? row?.appliedLimitUnits ?? period.limitUnits,
    })
  }
  const dailySnapshot = snapshots[0]
  const monthlySnapshot = snapshots[1]
  if (dailySnapshot === undefined || monthlySnapshot === undefined) {
    return { kind: 'refused', reason: 'spending_periods_preparation_failed' }
  }
  return {
    kind: 'prepared',
    spendingPeriods: { version: 'ae.spending-periods:v1', daily: dailySnapshot, monthly: monthlySnapshot },
    commands,
  }
}

/** Requires completion from the native executor (successful write or verified replay),
 * bound to this exact adjustment reference; callers cannot supply unrelated evidence. Ensures one acknowledgement, or conflict
 * retaining the pending fence. A newer policy cannot replace an uncertain command. */
export async function acknowledgeAgentSpendingPeriod(
  ctx: MutationCtx,
  input: Readonly<{ command: SpendingPeriodAdjustment; transactionRefs: string[] }>,
): Promise<{ kind: 'applied' | 'replayed' | 'conflict' }> {
  const command = input.command
  const zeroDelta = command.previousLimitUnits === command.targetLimitUnits
  if (zeroDelta ? input.transactionRefs.length !== 0 : (input.transactionRefs.length !== 1
    || input.transactionRefs[0] !== spendingPeriodAdjustmentReference(command))) return { kind: 'conflict' }
  const row = await periodRow(ctx, command.principalRef, command.periodKind, command.periodStartAt)
  if (row == null) return { kind: 'conflict' }
  const digest = canonicalDigest(command)
  if (row.appliedRevision === command.revision && row.appliedCommandDigest === digest
    && canonicalDigest(row.transactionRefs ?? []) === canonicalDigest(input.transactionRefs)) return { kind: 'replayed' }
  if (row.pending === undefined || canonicalDigest(row.pending) !== digest
    || row.appliedRevision + 1 !== command.revision
    || row.appliedLimitUnits !== command.previousLimitUnits) return { kind: 'conflict' }
  await ctx.db.patch(row._id, {
    appliedRevision: command.revision,
    appliedLimitUnits: command.targetLimitUnits,
    appliedCommandDigest: digest,
    transactionRefs: input.transactionRefs,
    pending: undefined,
  })
  return { kind: 'applied' }
}

/** Requires current authority limits and server time. Ensures admission can only
 * consume acknowledged current-period capacity. Pending/stale/malformed is false;
 * accepted idempotent Call replay occurs before this new-admission-only boundary. */
export async function spendingPeriodsAreCurrent(
  ctx: Pick<QueryCtx, 'db'>,
  input: PeriodRequest & Readonly<{ spendingPeriods: SpendingPeriods | undefined }>,
): Promise<boolean> {
  const requested = requestedPeriods(input)
  if (requested === undefined || input.spendingPeriods?.version !== 'ae.spending-periods:v1') return false
  const snapshots = [input.spendingPeriods.daily, input.spendingPeriods.monthly]
  for (const [index, period] of requested.entries()) {
    const snapshot = snapshots[index]
    if (snapshot === undefined || snapshot.periodStartAt !== period.periodStartAt
      || snapshot.periodEndAt !== period.periodEndAt || snapshot.limitUnits !== period.limitUnits
      || !Number.isSafeInteger(snapshot.revision) || snapshot.revision <= 0) return false
    const row = await periodRow(ctx, input.principalRef, period.periodKind, period.periodStartAt)
    if (row == null || row.pending !== undefined || row.appliedRevision !== snapshot.revision
      || row.appliedLimitUnits !== snapshot.limitUnits || row.periodEndAt !== snapshot.periodEndAt) return false
  }
  return true
}
