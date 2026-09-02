import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  AUD_EXPONENT,
  applyJournalTransaction,
  prepareBalancedJournalTransaction,
  projectionChecksum,
  type MoneyBalanceProjection,
  type MoneyJournalAccount,
} from '../src/modules/money/public'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'

type ManagedCallReserveInput = Readonly<{
  commitment: Doc<'capabilityOperationCommitments'>
  invocationRef: string
  providerRef: string
  maximumDailySpend: Readonly<{ currency: string; exponent: number; units: string }>
  maximumMonthlySpend: Readonly<{ currency: string; exponent: number; units: string }>
  now: number
}>

export type ManagedCallReserveResult =
  | Readonly<{ kind: 'reserved'; reservationRef: string }>
  | Readonly<{ kind: 'refused'; code: string }>

const customerLedgerRef = (accountRef: string) => `ledger:aud:customer-prepayment:${accountRef}`
const callLedgerRef = (invocationRef: string) => `ledger:aud:call-reservation:${invocationRef}`

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

function checksumMatches(row: Doc<'moneyBalanceProjections'>): boolean {
  return row.checksum === projectionChecksum([projection(row)])
}

function utcWindows(now: number): Readonly<{ day: string; month: string }> {
  const iso = new Date(now).toISOString()
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) }
}

function exactAudLimit(value: Readonly<{ currency: string; exponent: number; units: string }>): bigint | undefined {
  if (value.currency !== 'AUD' || value.exponent !== AUD_EXPONENT || !/^(?:0|[1-9]\d*)$/u.test(value.units)) {
    return undefined
  }
  return BigInt(value.units)
}

async function budgetProjection(
  ctx: MutationCtx,
  commitment: Doc<'capabilityOperationCommitments'>,
  windowKind: 'day' | 'month',
  windowStart: string,
) {
  return await ctx.db.query('moneyAgentBudgetProjections')
    .withIndex('by_principal_and_policy_window', (query) => query
      .eq('principalRef', commitment.principalId)
      .eq('environment', commitment.environment)
      .eq('budgetPolicyRef', commitment.budgetPolicyRef)
      .eq('budgetGeneration', commitment.budgetGeneration)
      .eq('windowKind', windowKind)
      .eq('windowStart', windowStart))
    .unique()
}

export async function reserveManagedCallInTransaction(
  ctx: MutationCtx,
  input: ManagedCallReserveInput,
): Promise<ManagedCallReserveResult> {
  const { commitment, invocationRef, now } = input
  const amount = BigInt(commitment.decisionAudUnits)
  if (amount === 0n) return { kind: 'reserved', reservationRef: `call-reservation:${invocationRef}:free` }
  if (amount < 0n || commitment.sourceUsdcUnits === undefined) {
    return { kind: 'refused', code: 'managed_call_pricing_invalid' }
  }

  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: commitment.environment,
    now,
    ...(commitment.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused' || policy.policyDigest !== commitment.commercialPolicyDigest) {
    return { kind: 'refused', code: 'commercial_policy_not_current' }
  }

  const customerAccount = await ctx.db.query('moneyLedgerAccounts')
    .withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerLedgerRef(commitment.accountRef)))
    .unique()
  const customerBalance = await ctx.db.query('moneyBalanceProjections')
    .withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerLedgerRef(commitment.accountRef)))
    .unique()
  if (customerAccount === null || customerBalance === null
    || customerAccount.state !== 'active' || customerBalance.state !== 'active'
    || !checksumMatches(customerBalance)
    || BigInt(customerBalance.balanceUnits) < amount) {
    return { kind: 'refused', code: 'account_balance_unavailable' }
  }

  const dailyLimit = exactAudLimit(input.maximumDailySpend)
  const monthlyLimit = exactAudLimit(input.maximumMonthlySpend)
  if (dailyLimit === undefined || monthlyLimit === undefined
    || BigInt(commitment.maximumSpendPerInvocationUnits) < amount) {
    return { kind: 'refused', code: 'agent_budget_invalid' }
  }
  const windows = utcWindows(now)
  const [dayBudget, monthBudget] = await Promise.all([
    budgetProjection(ctx, commitment, 'day', windows.day),
    budgetProjection(ctx, commitment, 'month', windows.month),
  ])
  if (BigInt(dayBudget?.settledUnits ?? '0') + BigInt(dayBudget?.reservedUnits ?? '0') + amount > dailyLimit
    || BigInt(monthBudget?.settledUnits ?? '0') + BigInt(monthBudget?.reservedUnits ?? '0') + amount > monthlyLimit) {
    return { kind: 'refused', code: 'agent_budget_exceeded' }
  }

  if (commitment.treasuryCustodyRef === undefined
    || commitment.treasuryCustodyGeneration === undefined
    || commitment.treasuryEvidenceRef === undefined
    || commitment.treasurySpendableUnits === undefined) {
    return { kind: 'refused', code: 'treasury_commitment_missing' }
  }
  const treasury = await ctx.db.query('moneyTreasuryProjections')
    .withIndex('by_custody', (query) => query
      .eq('environment', commitment.environment)
      .eq('custodyRef', commitment.treasuryCustodyRef!)
      .eq('custodyGeneration', commitment.treasuryCustodyGeneration!))
    .unique()
  const sourceAmount = BigInt(commitment.sourceUsdcUnits)
  if (treasury === null
    || treasury.lastObservationRef !== commitment.treasuryEvidenceRef
    || BigInt(treasury.spendableUnits) < sourceAmount) {
    return { kind: 'refused', code: 'treasury_capacity_unavailable' }
  }

  const reservationRef = `call-reservation:${invocationRef}`
  const existing = await ctx.db.query('moneyCallReservations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (existing !== null) {
    return existing.commitmentRef === commitment.commitmentRef
      ? { kind: 'reserved', reservationRef: existing.reservationRef }
      : { kind: 'refused', code: 'call_reservation_conflict' }
  }

  const callAccount = {
    ledgerAccountRef: callLedgerRef(invocationRef),
    accountRef: `call:${invocationRef}`,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'call_reservation_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const customerDefinition = {
    ledgerAccountRef: customerAccount.ledgerAccountRef,
    accountRef: customerAccount.accountRef,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'customer_prepayment_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const transactionRef = `journal:call-reservation:${invocationRef}`
  const prepared = prepareBalancedJournalTransaction({
    transactionRef,
    idempotencyKey: `call-reservation:${commitment.commitmentRef}`,
    accountRef: commitment.accountRef,
    kind: 'call_reservation',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    postings: [
      { postingRef: `${transactionRef}:customer`, ledgerAccountRef: customerDefinition.ledgerAccountRef, side: 'debit', amountUnits: amount },
      { postingRef: `${transactionRef}:call`, ledgerAccountRef: callAccount.ledgerAccountRef, side: 'credit', amountUnits: amount },
    ],
    evidenceRefs: [commitment.commitmentRef, commitment.evidenceDigest],
    occurredAt: now,
  }, [customerDefinition, callAccount])
  if (prepared.kind === 'refused') return { kind: 'refused', code: prepared.code }
  const nextProjections = applyJournalTransaction(
    [projection(customerBalance)],
    [customerDefinition, callAccount],
    prepared.transaction,
  )

  await ctx.db.insert('moneyLedgerAccounts', {
    ...callAccount,
    state: 'active',
    version: 1,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('moneyLedgerTransactions', {
    transactionRef,
    accountRef: commitment.accountRef,
    kind: 'call_reservation',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    idempotencyKey: prepared.transaction.idempotencyKey,
    inputDigest: commitment.inputDigest,
    journalDigest: prepared.transaction.journalDigest,
    debitUnits: amount.toString(),
    creditUnits: amount.toString(),
    state: 'posted',
    evidenceRefs: [...prepared.transaction.evidenceRefs],
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
  for (const next of nextProjections) {
    const value = {
      accountRef: next.accountRef,
      asset: 'AUD' as const,
      exponent: AUD_EXPONENT,
      balanceUnits: next.balanceUnits.toString(),
      version: next.version,
      checksum: projectionChecksum([next]),
      state: 'active' as const,
      lastTransactionRef: transactionRef,
      updatedAt: now,
    }
    if (next.ledgerAccountRef === customerBalance.ledgerAccountRef) {
      await ctx.db.patch(customerBalance._id, value)
    } else {
      await ctx.db.insert('moneyBalanceProjections', { ledgerAccountRef: next.ledgerAccountRef, ...value })
    }
  }

  for (const window of [
    { kind: 'day' as const, start: windows.day, row: dayBudget },
    { kind: 'month' as const, start: windows.month, row: monthBudget },
  ]) {
    const value = {
      principalRef: commitment.principalId,
      environment: commitment.environment,
      budgetPolicyRef: commitment.budgetPolicyRef,
      budgetGeneration: commitment.budgetGeneration,
      windowKind: window.kind,
      windowStart: window.start,
      asset: 'AUD' as const,
      exponent: AUD_EXPONENT,
      settledUnits: window.row?.settledUnits ?? '0',
      reservedUnits: (BigInt(window.row?.reservedUnits ?? '0') + amount).toString(),
      version: (window.row?.version ?? 0) + 1,
      updatedAt: now,
    }
    if (window.row === null) await ctx.db.insert('moneyAgentBudgetProjections', value)
    else await ctx.db.patch(window.row._id, value)
  }

  const exposure = await ctx.db.query('moneyRegulatoryExposureProjections')
    .withIndex('by_environment_and_asset', (query) => query.eq('environment', commitment.environment).eq('asset', 'AUD'))
    .unique()
  const exposureValue = {
    environment: commitment.environment,
    asset: 'AUD' as const,
    exponent: AUD_EXPONENT,
    reservedUnits: (BigInt(exposure?.reservedUnits ?? '0') + amount).toString(),
    pendingUnits: exposure?.pendingUnits ?? '0',
    settledUnits: exposure?.settledUnits ?? '0',
    version: (exposure?.version ?? 0) + 1,
    updatedAt: now,
  }
  if (exposure === null) await ctx.db.insert('moneyRegulatoryExposureProjections', exposureValue)
  else await ctx.db.patch(exposure._id, exposureValue)

  const treasuryReservationRef = `treasury-reservation:${invocationRef}`
  const treasuryIdentity = {
    environment: commitment.environment,
    custodyRef: treasury.custodyRef,
    custodyGeneration: treasury.custodyGeneration,
    network: treasury.network,
    asset: 'USDC' as const,
    exponent: 6 as const,
    reservationRef: treasuryReservationRef,
    idempotencyKey: `treasury:${commitment.commitmentRef}`,
    commitmentRef: commitment.commitmentRef,
    invocationRef,
    amountUnits: sourceAmount.toString(),
    evidenceDigest: commitment.evidenceDigest,
  }
  await ctx.db.insert('moneyTreasuryReservations', {
    ...treasuryIdentity,
    state: 'committed',
    identityDigest: canonicalDigest({ format: 'ae.treasury-reservation:v1', ...treasuryIdentity }),
    createdAt: now,
    updatedAt: now,
  })
  const treasuryNext = {
    committedUnits: (BigInt(treasury.committedUnits) + sourceAmount).toString(),
    spendableUnits: (BigInt(treasury.spendableUnits) - sourceAmount).toString(),
    version: treasury.version + 1,
    updatedAt: now,
  }
  await ctx.db.patch(treasury._id, treasuryNext)

  const obligationRef = `provider-obligation:${invocationRef}`
  await ctx.db.insert('moneyProviderObligations', {
    obligationRef,
    invocationRef,
    operationRef: commitment.operationRef,
    providerRef: input.providerRef,
    buyerAccountRef: commitment.accountRef,
    buyerAsset: 'AUD',
    buyerExponent: AUD_EXPONENT,
    buyerAmountUnits: amount.toString(),
    providerAsset: 'USDC',
    providerExponent: 6,
    providerAmountUnits: sourceAmount.toString(),
    settlementMethod: 'managed_x402',
    state: 'accrued',
    payoutEligibility: 'ineligible_x402',
    evidenceRefs: [commitment.commitmentRef, commitment.evidenceDigest],
    createdAt: now,
    updatedAt: now,
  })
  const identityDigest = canonicalDigest({
    format: 'ae.managed-call-reservation:v1',
    commitmentRef: commitment.commitmentRef,
    invocationRef,
    providerRef: input.providerRef,
    decisionAudUnits: amount.toString(),
    sourceUsdcUnits: sourceAmount.toString(),
  })
  await ctx.db.insert('moneyCallReservations', {
    reservationRef,
    commitmentRef: commitment.commitmentRef,
    invocationRef,
    accountRef: commitment.accountRef,
    principalRef: commitment.principalId,
    operationRef: commitment.operationRef,
    providerRef: input.providerRef,
    environment: commitment.environment,
    decisionAudUnits: amount.toString(),
    sourceUsdcUnits: sourceAmount.toString(),
    budgetPolicyRef: commitment.budgetPolicyRef,
    budgetGeneration: commitment.budgetGeneration,
    budgetDayStart: windows.day,
    budgetMonthStart: windows.month,
    journalTransactionRef: transactionRef,
    treasuryReservationRef,
    providerObligationRef: obligationRef,
    state: 'reserved',
    identityDigest,
    evidenceRefs: [commitment.commitmentRef, commitment.evidenceDigest],
    createdAt: now,
    updatedAt: now,
  })
  return { kind: 'reserved', reservationRef }
}

export async function releaseManagedCallInTransaction(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<Readonly<{ kind: 'released' | 'not_found' }>> {
  const reservation = await ctx.db.query('moneyCallReservations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (reservation === null) return { kind: 'not_found' }
  if (reservation.state === 'released') return { kind: 'released' }
  if (reservation.state !== 'reserved') throw new Error('managed_call_release_after_submission_refused')

  const amount = BigInt(reservation.decisionAudUnits)
  const customerRef = customerLedgerRef(reservation.accountRef)
  const callRef = callLedgerRef(invocationRef)
  const [customerAccount, callAccount, customerBalance, callBalance] = await Promise.all([
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', customerRef)).unique(),
    ctx.db.query('moneyLedgerAccounts').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', callRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', customerRef)).unique(),
    ctx.db.query('moneyBalanceProjections').withIndex('by_ledgerAccountRef', (q) => q.eq('ledgerAccountRef', callRef)).unique(),
  ])
  if (customerAccount === null || callAccount === null || customerBalance === null || callBalance === null
    || !checksumMatches(customerBalance) || !checksumMatches(callBalance)
    || BigInt(callBalance.balanceUnits) < amount) throw new Error('managed_call_release_journal_unavailable')

  const customerDefinition = {
    ledgerAccountRef: customerAccount.ledgerAccountRef,
    accountRef: customerAccount.accountRef,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'customer_prepayment_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const callDefinition = {
    ledgerAccountRef: callAccount.ledgerAccountRef,
    accountRef: callAccount.accountRef,
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    accountKind: 'call_reservation_liability',
    normalBalance: 'credit',
  } as const satisfies MoneyJournalAccount
  const transactionRef = `journal:call-release:${invocationRef}`
  const prepared = prepareBalancedJournalTransaction({
    transactionRef,
    idempotencyKey: `call-release:${reservation.commitmentRef}`,
    accountRef: reservation.accountRef,
    kind: 'call_release',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    postings: [
      { postingRef: `${transactionRef}:call`, ledgerAccountRef: callRef, side: 'debit', amountUnits: amount },
      { postingRef: `${transactionRef}:customer`, ledgerAccountRef: customerRef, side: 'credit', amountUnits: amount },
    ],
    evidenceRefs: [...reservation.evidenceRefs, reservation.reservationRef],
    occurredAt: now,
  }, [customerDefinition, callDefinition])
  if (prepared.kind === 'refused') throw new Error(prepared.code)
  const next = applyJournalTransaction(
    [projection(customerBalance), projection(callBalance)],
    [customerDefinition, callDefinition],
    prepared.transaction,
  )

  const [dayBudget, monthBudget, exposure, treasuryReservation, obligation] = await Promise.all([
    ctx.db.query('moneyAgentBudgetProjections').withIndex('by_principal_and_policy_window', (q) => q
      .eq('principalRef', reservation.principalRef)
      .eq('environment', reservation.environment)
      .eq('budgetPolicyRef', reservation.budgetPolicyRef)
      .eq('budgetGeneration', reservation.budgetGeneration)
      .eq('windowKind', 'day')
      .eq('windowStart', reservation.budgetDayStart)).unique(),
    ctx.db.query('moneyAgentBudgetProjections').withIndex('by_principal_and_policy_window', (q) => q
      .eq('principalRef', reservation.principalRef)
      .eq('environment', reservation.environment)
      .eq('budgetPolicyRef', reservation.budgetPolicyRef)
      .eq('budgetGeneration', reservation.budgetGeneration)
      .eq('windowKind', 'month')
      .eq('windowStart', reservation.budgetMonthStart)).unique(),
    ctx.db.query('moneyRegulatoryExposureProjections').withIndex('by_environment_and_asset', (q) => q
      .eq('environment', reservation.environment).eq('asset', 'AUD')).unique(),
    reservation.treasuryReservationRef === undefined
      ? null
      : ctx.db.query('moneyTreasuryReservations').withIndex('by_reservationRef', (q) => q
          .eq('reservationRef', reservation.treasuryReservationRef!)).unique(),
    ctx.db.query('moneyProviderObligations').withIndex('by_obligationRef', (q) => q
      .eq('obligationRef', reservation.providerObligationRef)).unique(),
  ])
  if (dayBudget === null || monthBudget === null || exposure === null
    || BigInt(dayBudget.reservedUnits) < amount || BigInt(monthBudget.reservedUnits) < amount
    || BigInt(exposure.reservedUnits) < amount || obligation === null || obligation.state !== 'accrued') {
    throw new Error('managed_call_release_projection_unavailable')
  }
  let treasuryProjection: Doc<'moneyTreasuryProjections'> | null = null
  if (treasuryReservation !== null) {
    if (treasuryReservation.state !== 'committed') throw new Error('managed_call_release_after_submission_refused')
    treasuryProjection = await ctx.db.query('moneyTreasuryProjections').withIndex('by_custody', (q) => q
      .eq('environment', treasuryReservation.environment)
      .eq('custodyRef', treasuryReservation.custodyRef)
      .eq('custodyGeneration', treasuryReservation.custodyGeneration)).unique()
    if (treasuryProjection === null
      || BigInt(treasuryProjection.committedUnits) < BigInt(treasuryReservation.amountUnits)) {
      throw new Error('managed_call_release_treasury_unavailable')
    }
  }

  await ctx.db.insert('moneyLedgerTransactions', {
    transactionRef,
    accountRef: reservation.accountRef,
    kind: 'call_release',
    asset: 'AUD',
    exponent: AUD_EXPONENT,
    idempotencyKey: prepared.transaction.idempotencyKey,
    inputDigest: reservation.identityDigest,
    journalDigest: prepared.transaction.journalDigest,
    debitUnits: amount.toString(),
    creditUnits: amount.toString(),
    state: 'posted',
    evidenceRefs: [...prepared.transaction.evidenceRefs],
    reversalOf: reservation.journalTransactionRef,
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
    const row = value.ledgerAccountRef === customerRef ? customerBalance : callBalance
    await ctx.db.patch(row._id, {
      balanceUnits: value.balanceUnits.toString(),
      version: value.version,
      checksum: projectionChecksum([value]),
      lastTransactionRef: transactionRef,
      updatedAt: now,
    })
  }
  for (const row of [dayBudget, monthBudget]) {
    await ctx.db.patch(row._id, {
      reservedUnits: (BigInt(row.reservedUnits) - amount).toString(),
      version: row.version + 1,
      updatedAt: now,
    })
  }
  await ctx.db.patch(exposure._id, {
    reservedUnits: (BigInt(exposure.reservedUnits) - amount).toString(),
    version: exposure.version + 1,
    updatedAt: now,
  })
  if (treasuryReservation !== null && treasuryProjection !== null) {
    const treasuryAmount = BigInt(treasuryReservation.amountUnits)
    await ctx.db.patch(treasuryProjection._id, {
      committedUnits: (BigInt(treasuryProjection.committedUnits) - treasuryAmount).toString(),
      spendableUnits: (BigInt(treasuryProjection.spendableUnits) + treasuryAmount).toString(),
      version: treasuryProjection.version + 1,
      updatedAt: now,
    })
    await ctx.db.patch(treasuryReservation._id, {
      state: 'released',
      finalEvidenceDigest: reservation.identityDigest,
      finalizedAt: now,
      updatedAt: now,
    })
  }
  await ctx.db.patch(obligation._id, { state: 'reversed', updatedAt: now })
  await ctx.db.patch(reservation._id, { state: 'released', finalizedAt: now, updatedAt: now })
  return { kind: 'released' }
}
