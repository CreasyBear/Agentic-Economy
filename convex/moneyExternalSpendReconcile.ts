import { v } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import { identifier } from './moneyLedgerValues'
import {
  decideExternalSpendReconciliation,
  externalSpendReconciliationCommandRefusal,
  readExactAmount,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
} from '../src/modules/money/public'
import {
  externalSpendAccepted,
  externalSpendIdentityArgs,
  externalSpendIdentityMatches,
  externalSpendRefusal,
  externalSpendReservationView,
  transitionExternalSpendBudget,
} from './moneyExternalSpendShared'

export type ReconcileExternalInvocationSpendArgs = ExternalSpendIdentity &
  Readonly<{
    settlementStatus: 'settled' | 'not_settled'
    paymentResponseDigest: string
    evidenceRef: string
    evidenceDigest: string
    observedAt: number
  }>

export const reconcileExternalInvocationSpendArgs = {
  ...externalSpendIdentityArgs,
  settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
  paymentResponseDigest: identifier,
  evidenceRef: identifier,
  evidenceDigest: identifier,
  observedAt: v.number(),
}

export async function reconcileExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: ReconcileExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const { observedAt, settlementStatus, paymentResponseDigest, evidenceRef, evidenceDigest, ...rawIdentity } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const command = {
    settlementStatus,
    paymentResponseDigest,
    evidenceRef,
    evidenceDigest,
  } as const
  const commandRefusal =
    externalSpendReconciliationCommandRefusal(identity, command)
  if (commandRefusal !== undefined) {
    return externalSpendRefusal(commandRefusal)
  }
  const row = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (row === null) return externalSpendRefusal('external_spend_not_found')
  if (!externalSpendIdentityMatches(row, identity)) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  const reservation = externalSpendReservationView(row)
  if (reservation === undefined) {
    return externalSpendRefusal('external_spend_state_conflict')
  }
  const decision = decideExternalSpendReconciliation({
    identity,
    reservation,
    command,
  })
  if (decision.kind === 'refused') {
    return externalSpendRefusal(decision.code)
  }
  if (decision.kind === 'replayed') {
    return externalSpendAccepted(row, true)
  }
  if (
    !await transitionExternalSpendBudget(
      ctx,
      row,
      decision.target,
      observedAt,
    )
  ) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  await ctx.db.patch(row._id, {
    state: decision.target,
    paymentResponseDigest,
    reconciliationDigest: decision.reconciliationDigest,
    reconciliationEvidenceRef: evidenceRef,
    reconciliationEvidenceDigest: evidenceDigest,
    reconciledAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}
