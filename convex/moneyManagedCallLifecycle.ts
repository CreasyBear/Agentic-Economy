import { v } from 'convex/values'
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'
import {
  AUD_EXPONENT,
  applyJournalTransaction,
  prepareBalancedJournalTransaction,
  projectionChecksum,
  type MoneyBalanceProjection,
  type MoneyJournalAccount,
} from '../src/modules/money/public'
import { releaseManagedCallInTransaction } from './moneyManagedCall'

const transitionResult = v.union(
  v.object({ kind: v.literal('accepted'), state: v.string(), replayed: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.string() }),
)

function projection(row: Doc<'moneyBalanceProjections'>): MoneyBalanceProjection {
  return {
    ledgerAccountRef: row.ledgerAccountRef,
    accountRef: row.accountRef,
    asset: row.asset,
    exponent: row.exponent,
    balanceUnits: BigInt(row.balanceUnits),
    version: row.version,
    ...(row.lastTransactionRef === undefined ? {} : { lastTransactionRef: row.lastTransactionRef }),
  }
}

async function reservationByInvocation(ctx: MutationCtx, invocationRef: string) {
  return await ctx.db.query('moneyCallReservations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
}

async function moveExposure(
  ctx: MutationCtx,
  reservation: Doc<'moneyCallReservations'>,
  from: 'reservedUnits' | 'pendingUnits',
  to: 'pendingUnits' | 'settledUnits',
  now: number,
) {
  const row = await ctx.db.query('moneyRegulatoryExposureProjections')
    .withIndex('by_environment_and_asset', (query) => query
      .eq('environment', reservation.environment).eq('asset', 'AUD'))
    .unique()
  const amount = BigInt(reservation.decisionAudUnits)
  if (row === null || BigInt(row[from]) < amount) throw new Error('managed_call_exposure_projection_invalid')
  await ctx.db.patch(row._id, {
    [from]: (BigInt(row[from]) - amount).toString(),
    [to]: (BigInt(row[to]) + amount).toString(),
    version: row.version + 1,
    updatedAt: now,
  })
}

async function moveTreasury(
  ctx: MutationCtx,
  reservation: Doc<'moneyCallReservations'>,
  target: 'pending_outflow' | 'settled',
  evidenceDigest: string,
  now: number,
) {
  if (reservation.treasuryReservationRef === undefined) return
  const row = await ctx.db.query('moneyTreasuryReservations')
    .withIndex('by_reservationRef', (query) => query.eq('reservationRef', reservation.treasuryReservationRef!))
    .unique()
  if (row === null) throw new Error('managed_call_treasury_reservation_missing')
  const treasury = await ctx.db.query('moneyTreasuryProjections')
    .withIndex('by_custody', (query) => query
      .eq('environment', row.environment)
      .eq('custodyRef', row.custodyRef)
      .eq('custodyGeneration', row.custodyGeneration))
    .unique()
  if (treasury === null) throw new Error('managed_call_treasury_projection_missing')
  const amount = BigInt(row.amountUnits)
  if (target === 'pending_outflow') {
    if (row.state !== 'committed' || BigInt(treasury.committedUnits) < amount) {
      throw new Error('managed_call_submission_state_conflict')
    }
    await ctx.db.patch(treasury._id, {
      committedUnits: (BigInt(treasury.committedUnits) - amount).toString(),
      pendingOutflowUnits: (BigInt(treasury.pendingOutflowUnits) + amount).toString(),
      version: treasury.version + 1,
      updatedAt: now,
    })
    await ctx.db.patch(row._id, {
      state: 'pending_outflow',
      submissionDigest: evidenceDigest,
      submittedAt: now,
      updatedAt: now,
    })
    return
  }
  if (row.state !== 'pending_outflow' && row.state !== 'outcome_unknown') {
    throw new Error('managed_call_settlement_state_conflict')
  }
  if (BigInt(treasury.pendingOutflowUnits) < amount) throw new Error('managed_call_treasury_projection_invalid')
  await ctx.db.patch(treasury._id, {
    pendingOutflowUnits: (BigInt(treasury.pendingOutflowUnits) - amount).toString(),
    settledOutflowUnits: (BigInt(treasury.settledOutflowUnits) + amount).toString(),
    version: treasury.version + 1,
    updatedAt: now,
  })
  await ctx.db.patch(row._id, {
    state: 'settled',
    finalEvidenceDigest: evidenceDigest,
    finalizedAt: now,
    updatedAt: now,
  })
}

async function settleAudJournal(
  ctx: MutationCtx,
  reservation: Doc<'moneyCallReservations'>,
  evidenceDigest: string,
  now: number,
) {
  const callRef = `ledger:aud:call-reservation:${reservation.invocationRef}`
  const obligationRef = `ledger:aud:provider-obligation:${reservation.providerRef}`
  const [callAccount, callBalance, obligationAccount, obligationBalance] = await Promise.all([
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', callRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', callRef)).unique(),
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', obligationRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', obligationRef)).unique(),
  ])
  if (callAccount === null || callBalance === null) throw new Error('managed_call_settlement_journal_missing')
  const callDefinition = {
    ledgerAccountRef: callRef,
    accountRef: callAccount.accountRef,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'call_reservation_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const obligationDefinition = {
    ledgerAccountRef: obligationRef,
    accountRef: `provider:${reservation.providerRef}`,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'provider_obligation_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const amount = BigInt(reservation.decisionAudUnits)
  const transactionRef = `journal:call-settlement:${reservation.invocationRef}`
  const prepared = prepareBalancedJournalTransaction({
    transactionRef,
    idempotencyKey: `call-settlement:${reservation.commitmentRef}`,
    accountRef: reservation.accountRef,
    kind: 'call_settlement',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    postings: [
      { postingRef: `${transactionRef}:call`, ledgerAccountRef: callRef, side: 'debit', amountUnits: amount },
      { postingRef: `${transactionRef}:provider`, ledgerAccountRef: obligationRef, side: 'credit', amountUnits: amount },
    ],
    evidenceRefs: [...reservation.evidenceRefs, evidenceDigest],
    occurredAt: now,
  }, [callDefinition, obligationDefinition])
  if (prepared.kind === 'refused') throw new Error(prepared.code)
  const next = applyJournalTransaction(
    [projection(callBalance), ...(obligationBalance === null ? [] : [projection(obligationBalance)])],
    [callDefinition, obligationDefinition],
    prepared.transaction,
  )
  if (obligationAccount === null) {
    await ctx.db.insert('moneyLedgerAccounts', {
      ...obligationDefinition,
      state: 'active',
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
  }
  await ctx.db.insert('moneyLedgerTransactions', {
    transactionRef,
    accountRef: reservation.accountRef,
    kind: 'call_settlement',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    idempotencyKey: prepared.transaction.idempotencyKey,
    inputDigest: reservation.identityDigest,
    journalDigest: prepared.transaction.journalDigest,
    debitUnits: amount.toString(),
    creditUnits: amount.toString(),
    state: 'posted',
    evidenceRefs: [...prepared.transaction.evidenceRefs],
    ...(reservation.treasuryReservationRef === undefined
      ? {}
      : { externalRef: reservation.treasuryReservationRef }),
    occurredAt: now,
    recordedAt: now,
  })
  for (const posting of prepared.transaction.postings) {
    await ctx.db.insert('moneyLedgerPostings', {
      postingRef: posting.postingRef,
      transactionRef,
      position: posting.position,
      ledgerAccountRef: posting.ledgerAccountRef,
      side: posting.side,
      amountUnits: posting.amountUnits.toString(),
      asset: 'AUD',
      exponent: AUD_EXPONENT,
      createdAt: now,
    })
  }
  for (const value of next) {
    const row = value.ledgerAccountRef === callRef ? callBalance : obligationBalance
    const fields = {
      accountRef: value.accountRef,
      asset: 'AUD' as const,
      exponent: AUD_EXPONENT,
      balanceUnits: value.balanceUnits.toString(),
      version: value.version,
      checksum: projectionChecksum([value]),
      state: 'active' as const,
      lastTransactionRef: transactionRef,
      updatedAt: now,
    }
    if (row === null) await ctx.db.insert('moneyBalanceProjections', { ledgerAccountRef: value.ledgerAccountRef, ...fields })
    else await ctx.db.patch(row._id, fields)
  }
}

async function settleBudgets(ctx: MutationCtx, reservation: Doc<'moneyCallReservations'>, now: number) {
  const amount = BigInt(reservation.decisionAudUnits)
  for (const window of [
    { kind: 'day' as const, start: reservation.budgetDayStart },
    { kind: 'month' as const, start: reservation.budgetMonthStart },
  ]) {
    const row = await ctx.db.query('moneyAgentBudgetProjections')
      .withIndex('by_principal_and_policy_window', (query) => query
        .eq('principalRef', reservation.principalRef)
        .eq('environment', reservation.environment)
        .eq('budgetPolicyRef', reservation.budgetPolicyRef)
        .eq('budgetGeneration', reservation.budgetGeneration)
        .eq('windowKind', window.kind)
        .eq('windowStart', window.start))
      .unique()
    if (row === null || BigInt(row.reservedUnits) < amount) throw new Error('managed_call_budget_projection_invalid')
    await ctx.db.patch(row._id, {
      reservedUnits: (BigInt(row.reservedUnits) - amount).toString(),
      settledUnits: (BigInt(row.settledUnits) + amount).toString(),
      version: row.version + 1,
      updatedAt: now,
    })
  }
}

export const readReservation = internalQuery({
  args: { invocationRef: v.string() },
  returns: v.union(v.object({
    reservationRef: v.string(),
    commitmentRef: v.string(),
    decisionAudUnits: v.string(),
    journalTransactionRef: v.string(),
    treasuryReservationRef: v.optional(v.string()),
    state: v.string(),
  }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyCallReservations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
      .unique()
    return row === null ? null : {
      reservationRef: row.reservationRef,
      commitmentRef: row.commitmentRef,
      decisionAudUnits: row.decisionAudUnits,
      journalTransactionRef: row.journalTransactionRef,
      ...(row.treasuryReservationRef === undefined ? {} : { treasuryReservationRef: row.treasuryReservationRef }),
      state: row.state,
    }
  },
})

export const markPossiblySubmitted = internalMutation({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await reservationByInvocation(ctx, args.invocationRef)
    if (row === null) return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    if (row.state === 'possibly_submitted' || row.state === 'outcome_unknown') {
      return { kind: 'accepted' as const, state: row.state, replayed: true }
    }
    if (row.state !== 'reserved') return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    await moveTreasury(ctx, row, 'pending_outflow', args.evidenceDigest, args.now)
    await moveExposure(ctx, row, 'reservedUnits', 'pendingUnits', args.now)
    await ctx.db.patch(row._id, { state: 'possibly_submitted', submittedAt: args.now, updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'possibly_submitted', replayed: false }
  },
})

export const markOutcomeUnknown = internalMutation({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await reservationByInvocation(ctx, args.invocationRef)
    if (row === null) return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    if (row.state === 'outcome_unknown') return { kind: 'accepted' as const, state: row.state, replayed: true }
    if (row.state === 'reserved') {
      await moveTreasury(ctx, row, 'pending_outflow', args.evidenceDigest, args.now)
      await moveExposure(ctx, row, 'reservedUnits', 'pendingUnits', args.now)
    } else if (row.state !== 'possibly_submitted') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    if (row.treasuryReservationRef !== undefined) {
      const treasury = await ctx.db.query('moneyTreasuryReservations')
        .withIndex('by_reservationRef', (q) => q.eq('reservationRef', row.treasuryReservationRef!)).unique()
      if (treasury !== null) await ctx.db.patch(treasury._id, { state: 'outcome_unknown', updatedAt: args.now })
    }
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (q) => q.eq('obligationRef', row.providerObligationRef)).unique()
    if (obligation !== null) await ctx.db.patch(obligation._id, { state: 'held', updatedAt: args.now })
    await ctx.db.patch(row._id, { state: 'outcome_unknown', updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'outcome_unknown', replayed: false }
  },
})

export const settle = internalMutation({
  args: { invocationRef: v.string(), evidenceDigest: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const row = await reservationByInvocation(ctx, args.invocationRef)
    if (row === null) return { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
    if (row.state === 'settled') return { kind: 'accepted' as const, state: row.state, replayed: true }
    if (row.state !== 'possibly_submitted' && row.state !== 'outcome_unknown') {
      return { kind: 'refused' as const, code: 'managed_call_state_conflict' }
    }
    await settleAudJournal(ctx, row, args.evidenceDigest, args.now)
    await settleBudgets(ctx, row, args.now)
    await moveTreasury(ctx, row, 'settled', args.evidenceDigest, args.now)
    await moveExposure(ctx, row, 'pendingUnits', 'settledUnits', args.now)
    const obligation = await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (q) => q.eq('obligationRef', row.providerObligationRef)).unique()
    if (obligation === null) throw new Error('managed_call_obligation_missing')
    await ctx.db.patch(obligation._id, { state: 'settled', settledAt: args.now, updatedAt: args.now })
    await ctx.db.patch(row._id, { state: 'settled', finalizedAt: args.now, updatedAt: args.now })
    return { kind: 'accepted' as const, state: 'settled', replayed: false }
  },
})

export const releaseBeforeSubmission = internalMutation({
  args: { invocationRef: v.string(), now: v.number() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const released = await releaseManagedCallInTransaction(ctx, args.invocationRef, args.now)
    return released.kind === 'not_found'
      ? { kind: 'refused' as const, code: 'managed_call_reservation_not_found' }
      : { kind: 'accepted' as const, state: 'released', replayed: false }
  },
})

export const releaseBeforeSubmissionWithX402Proof = internalMutation({
  args: {
    invocationRef: v.string(),
    attemptRef: v.string(),
    effectGeneration: v.number(),
    operationRef: v.string(),
    inputDigest: v.string(),
    reservationRef: v.string(),
    paymentIdentifier: v.string(),
    challengeDigest: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
    paymentResponseDigest: v.string(),
    transportObservationDigest: v.string(),
    transportRequestDigest: v.string(),
    paymentObservationDigest: v.string(),
    observedAt: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const [reservation, payment] = await Promise.all([
      reservationByInvocation(ctx, args.invocationRef),
      ctx.db.query('moneyX402PaymentAttempts')
        .withIndex('by_attemptRef_and_effectGeneration', (query) => query
          .eq('attemptRef', args.attemptRef)
          .eq('effectGeneration', args.effectGeneration))
        .unique(),
    ])
    if (reservation === null || payment === null) {
      return { kind: 'refused' as const, code: 'managed_call_recovery_identity_not_found' }
    }
    const identityMatches = [
      reservation.invocationRef === args.invocationRef,
      payment.dispatchRef === args.invocationRef,
      payment.operationRef === args.operationRef,
      payment.inputDigest === args.inputDigest,
      payment.reservationRef === args.reservationRef,
      payment.paymentIdentifier === args.paymentIdentifier,
      payment.challengeDigest === args.challengeDigest,
    ].every(Boolean)
    if (!identityMatches || payment.paymentSignatureDigest !== undefined || payment.submissionStartedAt !== undefined) {
      return { kind: 'refused' as const, code: 'managed_call_recovery_identity_mismatch' }
    }
    const exactReplay = reservation.state === 'released'
      && payment.state === 'observed'
      && payment.settlementStatus === 'not_settled'
      && payment.reconciliationEvidenceRef === args.evidenceRef
      && payment.reconciliationEvidenceDigest === args.evidenceDigest
      && payment.paymentResponseDigest === args.paymentResponseDigest
      && payment.transportObservationDigest === args.transportObservationDigest
      && payment.transportRequestDigest === args.transportRequestDigest
      && payment.paymentObservationDigest === args.paymentObservationDigest
    if (exactReplay) {
      return { kind: 'accepted' as const, state: 'released', replayed: true }
    }
    if (
      reservation.state !== 'reserved'
      || (payment.state !== 'prepared' && payment.state !== 'reconciliation_required')
    ) return { kind: 'refused' as const, code: 'managed_call_recovery_state_conflict' }

    await releaseManagedCallInTransaction(ctx, args.invocationRef, args.observedAt)
    await ctx.db.patch(payment._id, {
      state: 'observed',
      settlementStatus: 'not_settled',
      paymentResponseDigest: args.paymentResponseDigest,
      reconciliationEvidenceRef: args.evidenceRef,
      reconciliationEvidenceDigest: args.evidenceDigest,
      transportObservationDigest: args.transportObservationDigest,
      transportRequestDigest: args.transportRequestDigest,
      paymentObservationDigest: args.paymentObservationDigest,
      observedAt: args.observedAt,
    })
    return { kind: 'accepted' as const, state: 'released', replayed: false }
  },
})
