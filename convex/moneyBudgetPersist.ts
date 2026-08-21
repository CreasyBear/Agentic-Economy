import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import {
  admitCredentialBudget,
  amountFromParts,
  credentialBudgetDayWindowStart,
  credentialBudgetMonthWindowStart,
  readExactAmount,
  releaseCredentialBudget,
  reverseCredentialBudget,
  settleCredentialBudget,
  zeroExactAmount,
  type CredentialBudgetPolicy,
  type CredentialBudgetRefusalCode,
  type CredentialBudgetUsage,
  type ExactAmount,
} from '../src/modules/money/public'

export type BudgetGrantResult =
  | Readonly<{
      kind: 'accepted'
      policy: CredentialBudgetPolicy
      environment: 'sandbox' | 'production'
      generation: number
      budgetPolicyRef: string
    }>
  | Readonly<{
      kind: 'refused'
      code: 'budget_policy_missing' | 'budget_generation_stale'
    }>

export type ConvexBudgetRefusalCode =
  | 'budget_policy_missing'
  | 'budget_generation_stale'
  | CredentialBudgetRefusalCode

type BudgetRows = Readonly<{
  daily: Doc<'moneyCredentialBudgetStates'>
  monthly: Doc<'moneyCredentialBudgetStates'>
  concurrency: Doc<'moneyCredentialBudgetStates'>
}>

export function budgetRefusal(code: ConvexBudgetRefusalCode): {
  kind: 'refused'
  code: ConvexBudgetRefusalCode
  retryable: boolean
} {
  return {
    kind: 'refused',
    code,
    retryable: code === 'budget_concurrency_exhausted',
  }
}

export async function readBudgetGrant(
  ctx: MutationCtx,
  args: Readonly<{
    principalId: string
    credentialId: string
    grantRef?: string
    generation?: number
    now: number
  }>,
): Promise<BudgetGrantResult | undefined> {
  const grantRef = args.grantRef
  const generation = args.generation
  if (grantRef === undefined && generation === undefined) return undefined
  if (grantRef === undefined || generation === undefined)
    return { kind: 'refused', code: 'budget_policy_missing' }
  const grant = await ctx.db
    .query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', grantRef))
    .unique()
  if (
    grant === null ||
    grant.credentialId !== args.credentialId ||
    grant.principalId !== args.principalId ||
    grant.lifecycle !== 'active' ||
    grant.expiresAt <= args.now
  )
    return { kind: 'refused', code: 'budget_policy_missing' }
  if (
    grant.generation !== generation ||
    grant.policy.budget.generation !== grant.generation
  )
    return { kind: 'refused', code: 'budget_generation_stale' }
  const maximumSpendPerInvocation = readExactAmount(
    grant.policy.budget.maximumSpendPerInvocation,
  )
  const maximumDailySpend = readExactAmount(grant.policy.budget.maximumDailySpend)
  const maximumMonthlySpend = readExactAmount(
    grant.policy.budget.maximumMonthlySpend,
  )
  if (
    maximumSpendPerInvocation === undefined ||
    maximumDailySpend === undefined ||
    maximumMonthlySpend === undefined
  ) {
    return { kind: 'refused', code: 'budget_policy_missing' }
  }
  return {
    kind: 'accepted',
    environment: grant.environment,
    generation: grant.generation,
    budgetPolicyRef: grant.budgetPolicyRef,
    policy: {
      budgetPolicyRef: grant.budgetPolicyRef,
      generation: grant.generation,
      maximumSpendPerInvocation,
      maximumDailySpend,
      maximumMonthlySpend,
      maximumConcurrentInvocations:
        grant.policy.budget.maximumConcurrentInvocations,
    },
  }
}

export async function readBudgetRows(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
    principalId: string
    accountId: string
    credentialId: string
    environment: 'sandbox' | 'production'
    generation: number
    budgetPolicyRef: string
    dayStart: string
    monthStart: string
    amount: ExactAmount
    now: number
  }>,
): Promise<BudgetRows | undefined> {
  const index = 'by_principal_credential_env_generation_window' as const
  const [daily, monthly, concurrency] = await Promise.all([
    ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex(index, (query) =>
        query
          .eq('principalId', input.principalId)
          .eq('credentialId', input.credentialId)
          .eq('environment', input.environment)
          .eq('generation', input.generation)
          .eq('windowKind', 'day')
          .eq('windowStart', input.dayStart),
      )
      .unique(),
    ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex(index, (query) =>
        query
          .eq('principalId', input.principalId)
          .eq('credentialId', input.credentialId)
          .eq('environment', input.environment)
          .eq('generation', input.generation)
          .eq('windowKind', 'month')
          .eq('windowStart', input.monthStart),
      )
      .unique(),
    ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex(index, (query) =>
        query
          .eq('principalId', input.principalId)
          .eq('credentialId', input.credentialId)
          .eq('environment', input.environment)
          .eq('generation', input.generation)
          .eq('windowKind', 'concurrency')
          .eq('windowStart', 'all'),
      )
      .unique(),
  ])
  const zero = zeroExactAmount(input.amount.currency, input.amount.exponent)
  if (zero === undefined) return undefined
  const rows = [daily, monthly, concurrency]
  if (
    rows.some(
      (row) =>
        row !== null &&
        (row.budgetPolicyRef !== input.budgetPolicyRef ||
          row.currency !== input.amount.currency ||
          row.exponent !== input.amount.exponent),
    )
  )
    return undefined
  const make = (
    row: Doc<'moneyCredentialBudgetStates'> | null,
    kind: 'day' | 'month' | 'concurrency',
    windowStart: string,
  ): Doc<'moneyCredentialBudgetStates'> =>
    row ?? {
      _id: '' as Doc<'moneyCredentialBudgetStates'>['_id'],
      _creationTime: 0,
      principalId: input.principalId,
      accountId: input.accountId,
      credentialId: input.credentialId,
      budgetPolicyRef: input.budgetPolicyRef,
      environment: input.environment,
      generation: input.generation,
      windowKind: kind,
      windowStart,
      currency: input.amount.currency,
      exponent: input.amount.exponent,
      settledUnits: zero.units,
      reservedUnits: zero.units,
      reservedCount: 0,
      version: 0,
      updatedAt: input.now,
    }
  return {
    daily: make(daily, 'day', input.dayStart),
    monthly: make(monthly, 'month', input.monthStart),
    concurrency: make(concurrency, 'concurrency', 'all'),
  }
}

export function budgetUsage(rows: BudgetRows): CredentialBudgetUsage | undefined {
  const dailySettled = amountFromParts(
    rows.daily.currency,
    rows.daily.settledUnits,
    rows.daily.exponent,
  )
  const dailyReserved = amountFromParts(
    rows.daily.currency,
    rows.daily.reservedUnits,
    rows.daily.exponent,
  )
  const monthlySettled = amountFromParts(
    rows.monthly.currency,
    rows.monthly.settledUnits,
    rows.monthly.exponent,
  )
  const monthlyReserved = amountFromParts(
    rows.monthly.currency,
    rows.monthly.reservedUnits,
    rows.monthly.exponent,
  )
  if (
    dailySettled === undefined ||
    dailyReserved === undefined ||
    monthlySettled === undefined ||
    monthlyReserved === undefined
  )
    return undefined
  return {
    daily: { settledSpend: dailySettled, reservedSpend: dailyReserved },
    monthly: { settledSpend: monthlySettled, reservedSpend: monthlyReserved },
    reservedConcurrency: rows.concurrency.reservedCount,
  }
}

export async function writeBudgetUsage(
  ctx: Pick<MutationCtx, 'db'>,
  rows: BudgetRows,
  usage: CredentialBudgetUsage,
  now: number,
): Promise<void> {
  const updates = [
    [rows.daily, usage.daily],
    [rows.monthly, usage.monthly],
  ] as const
  for (const [row, window] of updates) {
    const patch = {
      settledUnits: window.settledSpend.units,
      reservedUnits: window.reservedSpend.units,
      version: row.version + 1,
      updatedAt: now,
    }
    if (row._creationTime === 0)
      await ctx.db.insert('moneyCredentialBudgetStates', {
        principalId: row.principalId,
        ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
        credentialId: row.credentialId,
        budgetPolicyRef: row.budgetPolicyRef,
        environment: row.environment,
        generation: row.generation,
        windowKind: row.windowKind,
        windowStart: row.windowStart,
        currency: row.currency,
        exponent: row.exponent,
        ...patch,
        reservedCount: row.reservedCount,
      })
    else await ctx.db.patch(row._id, patch)
  }
  const concurrencyPatch = {
    settledUnits: rows.concurrency.settledUnits,
    reservedUnits: rows.concurrency.reservedUnits,
    reservedCount: usage.reservedConcurrency,
    version: rows.concurrency.version + 1,
    updatedAt: now,
  }
  if (rows.concurrency._creationTime === 0)
    await ctx.db.insert('moneyCredentialBudgetStates', {
      principalId: rows.concurrency.principalId,
      ...(rows.concurrency.accountId === undefined
        ? {}
        : { accountId: rows.concurrency.accountId }),
      credentialId: rows.concurrency.credentialId,
      budgetPolicyRef: rows.concurrency.budgetPolicyRef,
      environment: rows.concurrency.environment,
      generation: rows.concurrency.generation,
      windowKind: rows.concurrency.windowKind,
      windowStart: rows.concurrency.windowStart,
      currency: rows.concurrency.currency,
      exponent: rows.concurrency.exponent,
      ...concurrencyPatch,
    })
  else await ctx.db.patch(rows.concurrency._id, concurrencyPatch)
}

export type PreparedCredentialBudgetReservation = Readonly<{
  kind: 'accepted'
  environment: 'sandbox' | 'production'
  budgetPolicyRef: string
  dayStart: string
  monthStart: string
  rows: BudgetRows
  usage: CredentialBudgetUsage
}>

export async function prepareCredentialBudgetReservation(
  ctx: MutationCtx,
  input: Readonly<{
    principalId: string
    accountId: string
    credentialId: string
    grantRef: string
    generation: number
    amount: ExactAmount
    observedAt: number
  }>,
): Promise<
  | PreparedCredentialBudgetReservation
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>
> {
  const grantResult = await readBudgetGrant(ctx, {
    principalId: input.principalId,
    credentialId: input.credentialId,
    grantRef: input.grantRef,
    generation: input.generation,
    now: input.observedAt,
  })
  if (grantResult === undefined || grantResult.kind === 'refused')
    return grantResult === undefined
      ? budgetRefusal('budget_policy_missing')
      : budgetRefusal(grantResult.code)
  const dayStart = credentialBudgetDayWindowStart(input.observedAt)
  const monthStart = credentialBudgetMonthWindowStart(dayStart)
  const rows = await readBudgetRows(ctx, {
    ...input,
    environment: grantResult.environment,
    budgetPolicyRef: grantResult.budgetPolicyRef,
    dayStart,
    monthStart,
    now: input.observedAt,
  })
  if (rows === undefined) return budgetRefusal('budget_policy_missing')
  const usage = budgetUsage(rows)
  if (usage === undefined) return budgetRefusal('budget_policy_missing')
  const admission = admitCredentialBudget({
    policy: grantResult.policy,
    usage,
    amount: input.amount,
  })
  if (admission.kind === 'refused') return budgetRefusal(admission.code)
  return {
    kind: 'accepted',
    environment: grantResult.environment,
    budgetPolicyRef: grantResult.budgetPolicyRef,
    dayStart,
    monthStart,
    rows,
    usage: admission.usage,
  }
}

export async function applyPreparedCredentialBudgetReservation(
  ctx: Pick<MutationCtx, 'db'>,
  prepared: PreparedCredentialBudgetReservation,
  now: number,
): Promise<void> {
  await writeBudgetUsage(ctx, prepared.rows, prepared.usage, now)
}

export async function reserveCredentialBudgetInTransaction(
  ctx: MutationCtx,
  input: Readonly<{
    principalId: string
    accountId: string
    credentialId: string
    grantRef: string
    generation: number
    amount: ExactAmount
    observedAt: number
  }>,
): Promise<
  | Readonly<{
      kind: 'accepted'
      environment: 'sandbox' | 'production'
      budgetPolicyRef: string
      dayStart: string
      monthStart: string
    }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>
> {
  const prepared = await prepareCredentialBudgetReservation(ctx, input)
  if (prepared.kind === 'refused') return prepared
  await applyPreparedCredentialBudgetReservation(ctx, prepared, input.observedAt)
  return {
    kind: 'accepted',
    environment: prepared.environment,
    budgetPolicyRef: prepared.budgetPolicyRef,
    dayStart: prepared.dayStart,
    monthStart: prepared.monthStart,
  }
}

export type PreparedCredentialBudgetTransition =
  | Readonly<{ kind: 'no_op' }>
  | Readonly<{
      kind: 'apply'
      rows: BudgetRows
      usage: CredentialBudgetUsage
      transaction: Doc<'moneyTransactions'>
      budgetState: 'settled' | 'released'
      now: number
    }>

export async function prepareCredentialBudgetTransition(
  ctx: Pick<MutationCtx, 'db'>,
  transaction: Doc<'moneyTransactions'>,
  outcome: 'released' | 'not_released',
  now: number,
): Promise<PreparedCredentialBudgetTransition | undefined> {
  const hasBudgetMetadata =
    transaction.credentialId !== undefined ||
    transaction.budgetPolicyRef !== undefined ||
    transaction.budgetGeneration !== undefined ||
    transaction.budgetEnvironment !== undefined ||
    transaction.budgetDayStart !== undefined ||
    transaction.budgetMonthStart !== undefined ||
    transaction.budgetState !== undefined
  if (!hasBudgetMetadata) return { kind: 'no_op' }
  if (
    transaction.credentialId === undefined ||
    transaction.budgetPolicyRef === undefined ||
    transaction.budgetGeneration === undefined ||
    transaction.budgetEnvironment === undefined ||
    transaction.budgetDayStart === undefined ||
    transaction.budgetMonthStart === undefined ||
    transaction.budgetState === undefined ||
    transaction.amountUnits === undefined
  )
    return undefined
  if (transaction.budgetState === 'released') return { kind: 'no_op' }
  if (transaction.budgetState === 'settled' && outcome === 'released')
    return { kind: 'no_op' }
  if (
    transaction.budgetState !== 'reserved' &&
    transaction.budgetState !== 'unknown' &&
    transaction.budgetState !== 'settled'
  )
    return undefined
  const amount = amountFromParts(
    transaction.currency,
    transaction.amountUnits,
    transaction.exponent,
  )
  if (amount === undefined) return undefined
  const rows = await readBudgetRows(ctx, {
    principalId: transaction.principalId,
    accountId: transaction.accountId ?? transaction.principalId,
    credentialId: transaction.credentialId,
    generation: transaction.budgetGeneration,
    environment: transaction.budgetEnvironment,
    budgetPolicyRef: transaction.budgetPolicyRef,
    dayStart: transaction.budgetDayStart,
    monthStart: transaction.budgetMonthStart,
    amount,
    now,
  })
  if (
    rows === undefined ||
    (transaction.budgetState === 'settled' &&
      (rows.daily._creationTime === 0 ||
        rows.monthly._creationTime === 0 ||
        rows.concurrency._creationTime === 0))
  )
    return undefined
  const usage = budgetUsage(rows)
  if (usage === undefined) return undefined
  const transition =
    outcome === 'released'
      ? settleCredentialBudget({ usage, amount })
      : transaction.budgetState === 'settled'
        ? reverseCredentialBudget({ usage, amount })
        : releaseCredentialBudget({ usage, amount })
  if (transition.kind === 'refused') return undefined
  return {
    kind: 'apply',
    rows,
    usage: transition.usage,
    transaction,
    budgetState: outcome === 'released' ? 'settled' : 'released',
    now,
  }
}

export async function applyPreparedCredentialBudgetTransition(
  ctx: Pick<MutationCtx, 'db'>,
  prepared: PreparedCredentialBudgetTransition,
): Promise<void> {
  if (prepared.kind === 'no_op') return
  await writeBudgetUsage(ctx, prepared.rows, prepared.usage, prepared.now)
  await ctx.db.patch(prepared.transaction._id, {
    budgetState: prepared.budgetState,
    updatedAt: prepared.now,
  })
}

type CustodyDailyBudgetRefusalCode =
  | 'external_spend_custody_policy_invalid'
  | 'external_spend_custody_daily_limit_exceeded'

type CustodyDailyBudgetResult =
  | Readonly<{
      kind: 'accepted'
      budgetPolicyRef: string
      dayStart: string
    }>
  | Readonly<{
      kind: 'refused'
      code: CustodyDailyBudgetRefusalCode
      retryable: false
    }>

const custodyBudgetIndex = 'by_principal_credential_env_generation_window' as const

function custodyDailyBudgetRefusal(
  code: CustodyDailyBudgetRefusalCode,
): Readonly<{
  kind: 'refused'
  code: CustodyDailyBudgetRefusalCode
  retryable: false
}> {
  return { kind: 'refused', code, retryable: false }
}

function custodyDayStart(observedAt: number): string | undefined {
  if (!Number.isFinite(observedAt)) return undefined
  try {
    return credentialBudgetDayWindowStart(observedAt)
  } catch {
    return undefined
  }
}

function custodyDailyBudgetIdentity(
  custodyRef: string,
  dayStart: string,
): Readonly<{
  principalId: string
  credentialId: string
  budgetPolicyRef: string
  environment: 'production'
  generation: 1
  windowKind: 'day'
  windowStart: string
}> {
  const identity = `custody:${custodyRef}`
  return {
    principalId: identity,
    credentialId: identity,
    budgetPolicyRef: `custody-daily:${custodyRef}`,
    environment: 'production',
    generation: 1,
    windowKind: 'day',
    windowStart: dayStart,
  }
}

async function readCustodyDailyBudgetState(
  ctx: Pick<MutationCtx, 'db'>,
  identity: ReturnType<typeof custodyDailyBudgetIdentity>,
): Promise<Doc<'moneyCredentialBudgetStates'> | null> {
  return await ctx.db
    .query('moneyCredentialBudgetStates')
    .withIndex(custodyBudgetIndex, (query) =>
      query
        .eq('principalId', identity.principalId)
        .eq('credentialId', identity.credentialId)
        .eq('environment', identity.environment)
        .eq('generation', identity.generation)
        .eq('windowKind', identity.windowKind)
        .eq('windowStart', identity.windowStart),
    )
    .unique()
}

function custodyDailyBudgetRowMatches(
  row: Doc<'moneyCredentialBudgetStates'>,
  identity: ReturnType<typeof custodyDailyBudgetIdentity>,
): boolean {
  return row.accountId === undefined
    && row.principalId === identity.principalId
    && row.credentialId === identity.credentialId
    && row.budgetPolicyRef === identity.budgetPolicyRef
    && row.environment === identity.environment
    && row.generation === identity.generation
    && row.windowKind === identity.windowKind
    && row.windowStart === identity.windowStart
    && Number.isSafeInteger(row.version)
    && row.version >= 0
}

function custodyDailyBudgetUsage(
  row: Doc<'moneyCredentialBudgetStates'>,
): CredentialBudgetUsage | undefined {
  const settledSpend = readExactAmount({
    currency: row.currency,
    units: row.settledUnits,
    exponent: row.exponent,
  })
  const reservedSpend = readExactAmount({
    currency: row.currency,
    units: row.reservedUnits,
    exponent: row.exponent,
  })
  if (
    settledSpend === undefined
    || reservedSpend === undefined
    || !Number.isSafeInteger(row.reservedCount)
    || row.reservedCount < 0
  ) return undefined
  return {
    daily: { settledSpend, reservedSpend },
    monthly: { settledSpend, reservedSpend },
    reservedConcurrency: row.reservedCount,
  }
}

function custodyDailyBudgetPolicy(
  budgetPolicyRef: string,
  maximumDailySpend: unknown,
): CredentialBudgetPolicy | undefined {
  const amount = readExactAmount(maximumDailySpend)
  if (amount === undefined) return undefined
  return {
    budgetPolicyRef,
    generation: 1,
    maximumSpendPerInvocation: amount,
    maximumDailySpend: amount,
    maximumMonthlySpend: amount,
    maximumConcurrentInvocations: Number.MAX_SAFE_INTEGER,
  }
}

function custodyAdmissionRefusal(
  code: string,
): Readonly<{
  kind: 'refused'
  code: CustodyDailyBudgetRefusalCode
  retryable: false
}> {
  return custodyDailyBudgetRefusal(
    code === 'budget_invocation_limit_exceeded'
      || code === 'budget_daily_limit_exceeded'
      ? 'external_spend_custody_daily_limit_exceeded'
      : 'external_spend_custody_policy_invalid',
  )
}

export async function reserveCustodyDailyBudgetInTransaction(
  ctx: MutationCtx,
  args: Readonly<{
    custodyRef: string
    maximumDailySpend: ExactAmount
    amount: ExactAmount
    observedAt: number
  }>,
): Promise<CustodyDailyBudgetResult> {
  if (args.custodyRef.trim().length === 0 || !Number.isFinite(args.observedAt)) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const dayStart = custodyDayStart(args.observedAt)
  if (dayStart === undefined) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const maximumDailySpend = readExactAmount(args.maximumDailySpend)
  const amount = readExactAmount(args.amount)
  if (maximumDailySpend === undefined || amount === undefined) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const identity = custodyDailyBudgetIdentity(args.custodyRef, dayStart)
  const row = await readCustodyDailyBudgetState(ctx, identity)
  if (row !== null && !custodyDailyBudgetRowMatches(row, identity)) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const policy = custodyDailyBudgetPolicy(identity.budgetPolicyRef, maximumDailySpend)
  if (policy === undefined) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const usage = row === null
    ? (() => {
        const zero = zeroExactAmount(maximumDailySpend.currency, maximumDailySpend.exponent)
        return zero === undefined
          ? undefined
          : {
              daily: { settledSpend: zero, reservedSpend: zero },
              monthly: { settledSpend: zero, reservedSpend: zero },
              reservedConcurrency: 0,
            }
      })()
    : custodyDailyBudgetUsage(row)
  if (usage === undefined) {
    return custodyDailyBudgetRefusal('external_spend_custody_policy_invalid')
  }
  const admission = admitCredentialBudget({ policy, usage, amount })
  if (admission.kind === 'refused') return custodyAdmissionRefusal(admission.code)
  const nextDaily = admission.usage.daily
  if (row === null) {
    await ctx.db.insert('moneyCredentialBudgetStates', {
      principalId: identity.principalId,
      credentialId: identity.credentialId,
      budgetPolicyRef: identity.budgetPolicyRef,
      environment: identity.environment,
      generation: identity.generation,
      windowKind: identity.windowKind,
      windowStart: identity.windowStart,
      currency: nextDaily.settledSpend.currency,
      exponent: nextDaily.settledSpend.exponent,
      settledUnits: nextDaily.settledSpend.units,
      reservedUnits: nextDaily.reservedSpend.units,
      reservedCount: admission.usage.reservedConcurrency,
      version: 0,
      updatedAt: args.observedAt,
    })
  } else {
    await ctx.db.patch(row._id, {
      settledUnits: nextDaily.settledSpend.units,
      reservedUnits: nextDaily.reservedSpend.units,
      reservedCount: admission.usage.reservedConcurrency,
      version: row.version + 1,
      updatedAt: args.observedAt,
    })
  }
  return {
    kind: 'accepted',
    budgetPolicyRef: identity.budgetPolicyRef,
    dayStart,
  }
}

export async function transitionCustodyDailyBudgetInTransaction(
  ctx: Pick<MutationCtx, 'db'>,
  args: Readonly<{
    custodyRef: string
    budgetPolicyRef: string
    dayStart: string
    amount: ExactAmount
    target: 'settled' | 'released'
    observedAt: number
  }>,
): Promise<boolean> {
  if (
    args.custodyRef.trim().length === 0
    || args.budgetPolicyRef.trim().length === 0
    || args.dayStart.trim().length === 0
    || !Number.isFinite(args.observedAt)
    || (args.target !== 'settled' && args.target !== 'released')
  ) return false
  const amount = readExactAmount(args.amount)
  if (amount === undefined) return false
  const identity = custodyDailyBudgetIdentity(args.custodyRef, args.dayStart)
  if (args.budgetPolicyRef !== identity.budgetPolicyRef) return false
  const row = await readCustodyDailyBudgetState(ctx, identity)
  if (
    row === null
    || !custodyDailyBudgetRowMatches(row, identity)
    || amount.currency !== row.currency
    || amount.exponent !== row.exponent
  ) return false
  const usage = custodyDailyBudgetUsage(row)
  if (usage === undefined) return false
  const transition = args.target === 'settled'
    ? settleCredentialBudget({ usage, amount })
    : releaseCredentialBudget({ usage, amount })
  if (transition.kind === 'refused') return false
  const nextDaily = transition.usage.daily
  await ctx.db.patch(row._id, {
    settledUnits: nextDaily.settledSpend.units,
    reservedUnits: nextDaily.reservedSpend.units,
    reservedCount: transition.usage.reservedConcurrency,
    version: row.version + 1,
    updatedAt: args.observedAt,
  })
  return true
}
