import { v } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import { identifier } from './moneyLedgerValues'
import {
  decideExternalSpendFinalization,
  externalSpendFinalizationCommandRefusal,
  readExactAmount,
  type ExternalSpendFinalizationCommand,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendSettlementStatus,
  type ExternalSpendSubmissionStatus,
} from '../src/modules/money/public'
import {
  externalSpendAccepted,
  externalSpendIdentityArgs,
  externalSpendIdentityMatches,
  externalSpendRefusal,
  externalSpendSettlementStatus,
  externalSpendSubmissionStatus,
  externalSpendReservationView,
  transitionExternalSpendBudget,
} from './moneyExternalSpendShared'

export type FinalizeExternalInvocationSpendArgs = ExternalSpendIdentity &
  Readonly<{
    settlementStatus: ExternalSpendSettlementStatus
    submissionStatus: ExternalSpendSubmissionStatus
    paymentResponseDigest?: string
    providerReceiptDigest?: string
    evidenceRefs: string[]
    observedAt: number
  }>

export const finalizeExternalInvocationSpendArgs = {
  ...externalSpendIdentityArgs,
  settlementStatus: externalSpendSettlementStatus,
  submissionStatus: externalSpendSubmissionStatus,
  paymentResponseDigest: v.optional(identifier),
  providerReceiptDigest: v.optional(identifier),
  evidenceRefs: v.array(v.string()),
  observedAt: v.number(),
}

export async function finalizeExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: FinalizeExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const {
    observedAt,
    settlementStatus,
    submissionStatus,
    paymentResponseDigest,
    providerReceiptDigest,
    evidenceRefs,
    ...rawIdentity
  } = args
  const identity: ExternalSpendIdentity = {
    ...rawIdentity,
    amount,
  }
  const command = {
    submissionStatus,
    settlementStatus,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
  } satisfies ExternalSpendFinalizationCommand
  const commandRefusal =
    externalSpendFinalizationCommandRefusal(identity, command)
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
  const decision = decideExternalSpendFinalization({
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
    decision.budgetTarget !== undefined
    && !await transitionExternalSpendBudget(
      ctx,
      row,
      decision.budgetTarget,
      observedAt,
    )
  ) {
    return externalSpendRefusal('external_spend_budget_refused')
  }
  await ctx.db.patch(row._id, {
    state: decision.target,
    submissionStatus,
    finalizationDigest: decision.finalizationDigest,
    ...(paymentResponseDigest === undefined ? {} : { paymentResponseDigest }),
    ...(providerReceiptDigest === undefined ? {} : { providerReceiptDigest }),
    evidenceRefs,
    finalizedAt: observedAt,
    updatedAt: observedAt,
  })
  const updated = await ctx.db.get(row._id)
  return updated === null
    ? externalSpendRefusal('external_spend_state_conflict')
    : externalSpendAccepted(updated, false)
}
