import { restorePromotionalCredit } from '../../money/promotionalCredit/allocation'
import type { MutationCtx } from '../../../_generated/server'
import type { AbandonArgs, AbandonResult } from './admissionReservation'
import type { CallRow } from './contracts'

export async function abandonHandler(
  ctx: MutationCtx,
  args: AbandonArgs,
): Promise<AbandonResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (row === null || !abandonmentIdentityMatches(row, args)) return { kind: 'not_found' as const }
  if (row.formanceReservationAttempt !== undefined && (row.formanceReservationAttempt.ambiguous
    || row.formanceReservationAttempt.generation !== args.reservationAttemptGeneration)) return { kind: 'dispatch_started' as const }
  if (dispatchHasStarted(row)) return { kind: 'dispatch_started' as const }
  const commitment = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
  if (row.promotionalCreditAllocation !== undefined) {
    const restored = await restorePromotionalCredit(ctx, row.promotionalCreditAllocation, row.ownerId, row.environment, Date.now())
    if (restored.kind !== 'restored') throw new Error('promotional_credit_restore_failed')
  }
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
  ].every(Boolean)
}

function dispatchHasStarted(row: CallRow): boolean {
  return [
    row.state !== 'pending',
    row.formanceFinancialState !== undefined && row.formanceFinancialState !== 'reservation_pending',
    row.result !== undefined,
    row.workId !== undefined,
    row.authority !== undefined,
    row.dispatchState !== undefined,
  ].some(Boolean)
}
