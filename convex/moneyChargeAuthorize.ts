import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  accountRefForOwner,
  addExactAmounts,
  amountFromParts,
  planPaidCharge,
  zeroExactAmount,
  type ExactAmount,
} from '../src/modules/money/public'
import {
  applyPreparedCredentialBudgetReservation,
  prepareCredentialBudgetReservation,
} from './moneyBudgetPersist'
import {
  applyPreparedCanonicalMoneyAccount,
  type PreparedCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'
import {
  admitInvocationCharge,
  type AuthorizeInvocationChargeArgs,
} from './moneyChargeAdmission'
import {
  domainMoneyEntries,
  domainMoneyTransaction,
  domainMoneyUsage,
  persistPaidChargePlan,
  sealPersistedChargeJournal,
  validatePaidChargePlan,
  type ChargePlanBudgetFields,
} from './moneyChargeJournal'

export type { AuthorizeInvocationChargeArgs }

type MoneyUsageEventInput = Omit<
  Doc<'moneyUsageEvents'>,
  '_id' | '_creationTime'
>

type UsageSummaryWrite =
  | Readonly<{
      kind: 'insert'
      value: Omit<
        Doc<'moneyCredentialUsageSummaries'>,
        '_id' | '_creationTime'
      >
    }>
  | Readonly<{
      kind: 'patch'
      row: Doc<'moneyCredentialUsageSummaries'>
      patch: Readonly<{
        callCount: number
        paidCallCount: number
        freeCallCount: number
        exponent: number
        grossSpendUnits: string
        states: Doc<'moneyCredentialUsageSummaries'>['states']
        updatedAt: number
      }>
    }>

type PreparedMoneyUsageEvent =
  | Readonly<{ kind: 'existing'; row: Doc<'moneyUsageEvents'> }>
  | Readonly<{
      kind: 'insert'
      event: MoneyUsageEventInput
      summaryWrite: UsageSummaryWrite
    }>

export async function prepareMoneyUsageEvent(
  ctx: Pick<MutationCtx, 'db'>,
  event: MoneyUsageEventInput,
  existingOverride?: Doc<'moneyUsageEvents'> | null,
): Promise<PreparedMoneyUsageEvent | undefined> {
  const existing = existingOverride === undefined
    ? await ctx.db
        .query('moneyUsageEvents')
        .withIndex('by_usageRef', (query) => query.eq('usageRef', event.usageRef))
        .unique()
    : existingOverride
  if (existing !== null) return { kind: 'existing', row: existing }
  const eventAmount = amountFromParts(event.currency, event.amountUnits, event.exponent)
  if (eventAmount === undefined) return undefined
  const summary = await ctx.db
    .query('moneyCredentialUsageSummaries')
    .withIndex('by_principalId_and_credentialId_and_currency', (query) =>
      query.eq('principalId', event.principalId)
        .eq('credentialId', event.credentialId)
        .eq('currency', event.currency),
    )
    .unique()
  if (
    summary !== null
    && (!Number.isSafeInteger(summary.callCount) || summary.callCount < 0
      || !Number.isSafeInteger(summary.paidCallCount) || summary.paidCallCount < 0
      || !Number.isSafeInteger(summary.freeCallCount) || summary.freeCallCount < 0)
  ) return undefined
  const states = summary === null || summary.states.includes(event.chargeState)
    ? (summary?.states ?? [event.chargeState])
    : [...summary.states, event.chargeState]
  const spend = event.chargeState === 'paid'
    ? eventAmount
    : zeroExactAmount(event.currency, event.exponent)
  if (spend === undefined) return undefined
  const current = summary === null
    ? undefined
    : amountFromParts(summary.currency, summary.grossSpendUnits, summary.exponent)
  const nextGrossSpend = current === undefined
    ? spend
    : addExactAmounts(current, spend)
  if (nextGrossSpend === undefined) return undefined
  return {
    kind: 'insert',
    event,
    summaryWrite: summary === null
      ? {
          kind: 'insert',
          value: {
            principalId: event.principalId,
            credentialId: event.credentialId,
            currency: nextGrossSpend.currency,
            exponent: nextGrossSpend.exponent,
            callCount: 1,
            paidCallCount: event.chargeState === 'paid' ? 1 : 0,
            freeCallCount: event.chargeState === 'free_tier' ? 1 : 0,
            grossSpendUnits: nextGrossSpend.units,
            states,
            updatedAt: event.observedAt,
          },
        }
      : {
          kind: 'patch',
          row: summary,
          patch: {
            callCount: summary.callCount + 1,
            paidCallCount: summary.paidCallCount + (event.chargeState === 'paid' ? 1 : 0),
            freeCallCount: summary.freeCallCount + (event.chargeState === 'free_tier' ? 1 : 0),
            exponent: nextGrossSpend.exponent,
            grossSpendUnits: nextGrossSpend.units,
            states,
            updatedAt: event.observedAt,
          },
        },
  }
}

export async function applyPreparedMoneyUsageEvent(
  ctx: Pick<MutationCtx, 'db'>,
  prepared: PreparedMoneyUsageEvent,
): Promise<void> {
  if (prepared.kind === 'existing') return
  await ctx.db.insert('moneyUsageEvents', prepared.event)
  if (prepared.summaryWrite.kind === 'insert')
    await ctx.db.insert('moneyCredentialUsageSummaries', prepared.summaryWrite.value)
  else await ctx.db.patch(prepared.summaryWrite.row._id, prepared.summaryWrite.patch)
}

export function usageEventInput(
  usage: Readonly<{
    usageRef: string
    principalId: string
    accountId?: string
    credentialId: string
    serviceRef: string
    offeringRef: string
    businessId: string
    invocationRef: string
    attemptRef: string
    operationKey: string
    priceDigest: string
    chargeState: Doc<'moneyUsageEvents'>['chargeState']
    amount: ExactAmount
    transactionRef?: string
    observedAt: number
  }>,
  transactionRef?: string,
): MoneyUsageEventInput {
  const persistedTransactionRef = transactionRef ?? usage.transactionRef
  return {
    usageRef: usage.usageRef,
    principalId: usage.principalId,
    ...(usage.accountId === undefined ? {} : { accountId: usage.accountId }),
    credentialId: usage.credentialId,
    currency: usage.amount.currency,
    exponent: usage.amount.exponent,
    serviceRef: usage.serviceRef,
    offeringRef: usage.offeringRef,
    businessId: usage.businessId,
    invocationRef: usage.invocationRef,
    attemptRef: usage.attemptRef,
    operationKey: usage.operationKey,
    priceDigest: usage.priceDigest,
    chargeState: usage.chargeState,
    amountUnits: usage.amount.units,
    ...(persistedTransactionRef === undefined ? {} : { transactionRef: persistedTransactionRef }),
    observedAt: usage.observedAt,
  }
}

async function persistAuthorizedChargePlan(
  ctx: MutationCtx,
  input: Readonly<{
    plan: ReturnType<typeof planPaidCharge>
    prior: Doc<'moneyTransactions'> | null
    existingUsage: Doc<'moneyUsageEvents'> | null
    operatorPrepared: PreparedCanonicalMoneyAccount
    providerPrepared: PreparedCanonicalMoneyAccount
    rakePrepared: PreparedCanonicalMoneyAccount
    transactionRef: string
    inputDigest: string
    principalId: string
    accountId: string
    credentialId: string
    currency: string
    observedAt: number
    grantRef: string
    generation: number
  }>,
) {
  const { plan } = input
  if (plan.result.kind === 'refused') return plan.result
  if (input.prior !== null) {
    if (plan.usage !== undefined || plan.transaction !== undefined || plan.entries.length > 0)
      return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    if (plan.result.chargeState === 'paid' &&
        (plan.result.providerNet === undefined || plan.result.rake === undefined))
      return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    return plan.result
  }
  if (plan.result.chargeState === 'free_tier') {
    if (plan.usage === undefined) return plan.result
    const budgetReservation = await prepareCredentialBudgetReservation(ctx, {
      principalId: input.principalId,
      accountId: input.accountId,
      credentialId: input.credentialId,
      grantRef: input.grantRef,
      generation: input.generation,
      amount: plan.usage.amount,
      observedAt: input.observedAt,
    })
    if (budgetReservation.kind === 'refused') return budgetReservation
    const usagePlan = await prepareMoneyUsageEvent(
      ctx,
      usageEventInput(plan.usage, input.transactionRef),
      input.existingUsage,
    )
    if (usagePlan === undefined || usagePlan.kind !== 'insert')
      return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
    const budgetFields: ChargePlanBudgetFields = {
      credentialId: input.credentialId,
      budgetPolicyRef: budgetReservation.budgetPolicyRef,
      budgetGeneration: input.generation,
      budgetEnvironment: budgetReservation.environment,
      budgetDayStart: budgetReservation.dayStart,
      budgetMonthStart: budgetReservation.monthStart,
      budgetState: 'reserved',
    }
    const appliedOperator = await applyPreparedCanonicalMoneyAccount(ctx, input.operatorPrepared)
    await applyPreparedCanonicalMoneyAccount(ctx, input.providerPrepared)
    await applyPreparedCanonicalMoneyAccount(ctx, input.rakePrepared)
    await applyPreparedCredentialBudgetReservation(ctx, budgetReservation, input.observedAt)
    await ctx.db.insert('moneyTransactions', {
      transactionRef: input.transactionRef,
      kind: 'charge',
      idempotencyKey: input.transactionRef,
      inputDigest: input.inputDigest,
      principalId: input.principalId,
      accountId: input.accountId,
      currency: input.currency,
      amountUnits: '0',
      exponent: plan.usage.amount.exponent,
      state: 'applied',
      expectedAccountVersion: appliedOperator.version,
      createdAt: input.observedAt,
      updatedAt: input.observedAt,
      credentialId: input.credentialId,
      budgetPolicyRef: budgetFields.budgetPolicyRef,
      budgetGeneration: budgetFields.budgetGeneration,
      budgetEnvironment: budgetFields.budgetEnvironment,
      budgetDayStart: budgetFields.budgetDayStart,
      budgetMonthStart: budgetFields.budgetMonthStart,
      budgetState: budgetFields.budgetState,
    })
    await applyPreparedMoneyUsageEvent(ctx, usagePlan)
    return { ...plan.result, transactionRef: input.transactionRef }
  }
  if (
    plan.usage === undefined || plan.transaction === undefined || plan.accounts === undefined
    || plan.result.providerNet === undefined || plan.result.rake === undefined
    || validatePaidChargePlan(plan) === undefined
  ) return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
  const budgetReservation = await prepareCredentialBudgetReservation(ctx, {
    principalId: input.principalId,
    accountId: input.accountId,
    credentialId: input.credentialId,
    grantRef: input.grantRef,
    generation: input.generation,
    amount: plan.usage.amount,
    observedAt: input.observedAt,
  })
  if (budgetReservation.kind === 'refused') return budgetReservation
  const usagePlan = await prepareMoneyUsageEvent(ctx, usageEventInput(plan.usage), input.existingUsage)
  if (usagePlan === undefined || usagePlan.kind !== 'insert')
    return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
  const budgetFields: ChargePlanBudgetFields = {
    credentialId: input.credentialId,
    budgetPolicyRef: budgetReservation.budgetPolicyRef,
    budgetGeneration: input.generation,
    budgetEnvironment: budgetReservation.environment,
    budgetDayStart: budgetReservation.dayStart,
    budgetMonthStart: budgetReservation.monthStart,
    budgetState: 'reserved',
  }
  const appliedOperator = await applyPreparedCanonicalMoneyAccount(ctx, input.operatorPrepared)
  const appliedProvider = await applyPreparedCanonicalMoneyAccount(ctx, input.providerPrepared)
  const appliedRake = await applyPreparedCanonicalMoneyAccount(ctx, input.rakePrepared)
  await applyPreparedCredentialBudgetReservation(ctx, budgetReservation, input.observedAt)
  const persisted = await persistPaidChargePlan(ctx, plan, {
    operator: appliedOperator,
    provider: appliedProvider,
    rake: appliedRake,
  }, budgetFields)
  if (!persisted)
    return { kind: 'refused' as const, code: 'charge_reconciliation_required' as const, retryable: false }
  await applyPreparedMoneyUsageEvent(ctx, usagePlan)
  await sealPersistedChargeJournal(ctx, input.transactionRef)
  return plan.result
}

export async function readOperatorAccountVersionHandler(
  ctx: QueryCtx,
  args: Readonly<{ ownerId: string; currency: string }>,
) {
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', accountRefForOwner(args.ownerId, args.currency)),
    )
    .unique()
  if (
    account === null || account.accountKind !== 'operator_credit'
    || account.accountId !== args.ownerId || account.businessId !== undefined
    || account.currency !== args.currency
    || account.accountRef !== accountRefForOwner(args.ownerId, args.currency)
  ) return null
  return account.version
}

export async function readInvocationChargeExpectedAccountVersionHandler(
  ctx: QueryCtx,
  args: Readonly<{ transactionRef: string }>,
) {
  const rows = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_transactionRef', (query) =>
      query.eq('transactionRef', args.transactionRef),
    )
    .take(2)
  if (rows.length !== 1) return null
  const transaction = rows[0]
  if (
    transaction === undefined
    || transaction.kind !== 'charge'
    || transaction.idempotencyKey !== args.transactionRef
  ) return null
  return transaction.expectedAccountVersion
}

export async function authorizeInvocationChargeHandler(
  ctx: MutationCtx,
  args: AuthorizeInvocationChargeArgs,
) {
  const admitted = await admitInvocationCharge(ctx, args)
  if (admitted.kind === 'refused') return admitted
  const priorUsage = admitted.existingUsage === null
    ? undefined
    : domainMoneyUsage(admitted.existingUsage)
  const plan = planPaidCharge({
    transaction: {
      transactionRef: admitted.transactionRef,
      kind: 'charge',
      idempotencyKey: admitted.transactionRef,
      inputDigest: admitted.inputDigest,
      principalId: admitted.principalId,
      accountId: admitted.accountId,
      currency: admitted.currency,
      expectedAccountVersion: args.expectedAccountVersion,
      now: args.observedAt,
    },
    operatorAccountRef: admitted.operatorAccountRef,
    providerAccountRef: admitted.providerAccountRef,
    rakeAccountRef: admitted.rakeAccountRef,
    grossAmount: admitted.amount,
    rakeConfig: { rakeBps: args.rakeBps },
    priceDigest: admitted.priceDigest,
    principalId: admitted.principalId,
    accountId: admitted.accountId,
    credentialId: admitted.credentialId,
    serviceRef: admitted.serviceRef,
    offeringRef: admitted.offeringRef,
    businessId: admitted.businessId,
    invocationRef: admitted.invocationRef,
    attemptRef: admitted.attemptRef,
    operationKey: admitted.operationKey,
    sourceDigest: admitted.sourceDigest,
    evidenceRefs: admitted.evidenceRefs,
    observedAt: args.observedAt,
    freeTier: args.freeTier,
    operator: admitted.operator,
    provider: admitted.provider,
    rake: admitted.rake,
    ...(admitted.providerAmount === undefined ? {} : { providerAmount: admitted.providerAmount }),
    ...(admitted.platformFee === undefined ? {} : { platformFee: admitted.platformFee }),
    ...(admitted.prior === null ? {} : { priorTransaction: domainMoneyTransaction(admitted.prior) }),
    ...(priorUsage === undefined ? {} : { priorUsage }),
    priorEntries: domainMoneyEntries(admitted.priorEntryRows) ?? [],
  })
  return await persistAuthorizedChargePlan(ctx, {
    plan,
    prior: admitted.prior,
    existingUsage: admitted.existingUsage,
    operatorPrepared: admitted.operatorPrepared,
    providerPrepared: admitted.providerPrepared,
    rakePrepared: admitted.rakePrepared,
    transactionRef: admitted.transactionRef,
    inputDigest: admitted.inputDigest,
    principalId: admitted.principalId,
    accountId: admitted.accountId,
    credentialId: admitted.credentialId,
    currency: admitted.currency,
    observedAt: args.observedAt,
    grantRef: admitted.grantRef,
    generation: admitted.generation,
  })
}
