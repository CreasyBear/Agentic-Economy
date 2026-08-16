import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
  env,
} from './_generated/server'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/customer-request/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'
import { isBoundedJsonValue } from '../src/modules/capability-contract/public'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
  type RuntimePublishedOperationDescriptor,
} from '../src/modules/capability-supply/public'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  admitCredentialBudget,
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  legacyPerKeyAccountRef,
  addExactAmounts,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  evaluateLiveMoneyGate,
  exactAmountSchema,
  multiplyExactAmountByBps,
  productionCreditTopupConfig,
  releaseCredentialBudget,
  reverseCredentialBudget,
  rescaleExactAmount,
  settleCredentialBudget,
  subtractExactAmounts,
  transitionPayout,
  STRIPE_CONNECT_RECOVERY_LEASE_MS,
  STRIPE_CONNECT_RECOVERY_WINDOW_MS,
  STRIPE_CREDIT_RECOVERY_WINDOW_MS,
  STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
  transitionPayoutAccount,
  validateChargeAccounts,
  type CredentialBudgetPolicy,
  type CredentialBudgetUsage,
  type ExactAmount,
  type MoneyAccount,
  type MoneyPayout,
} from '../src/modules/money/public'
import {
  decideExternalSpendFinalization,
  decideExternalSpendReconciliation,
  decideExternalSpendReversal,
  externalSpendFinalizationCommandRefusal,
  externalSpendIdentityDigest,
  externalSpendIdentityMaterialValid,
  externalSpendReconciliationCommandRefusal,
  externalSpendReversalCommandRefusal,
  sameExternalSpendIdentity,
  type ExternalSpendFinalizationCommand,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendReservation,
  type ExternalSpendRefusalCode,
} from '../src/modules/money/public'
import type { AgentAccessRatePolicy } from '../src/modules/agent-access/policy'

type MoneyUsageEventInput = Omit<
  Doc<'moneyUsageEvents'>,
  '_id' | '_creationTime'
>
type MoneyLedgerEntryRow = Doc<'moneyLedgerEntries'>

const identifier = v.string()
const serverFunctionAuth = v.object({
  principalId: v.string(),
  ownerId: v.string(),
  credentialId: v.string(),
  scopes: v.array(v.string()),
  authorityMode: v.optional(
    v.union(
      v.literal('inspect_only'),
      v.literal('approve_each'),
      v.literal('bounded_mandate'),
      v.literal('full_yolo'),
    ),
  ),
  issuedAt: v.number(),
  signature: v.string(),
})
const PAYOUT_BINDING_LOOKUP_OPERATION =
  'moneyLedger:readPayoutAccountByStripeId'
const PAYOUT_BINDING_LOOKUP_SCOPE = 'money:payout_binding_read'
const TOPUP_WEBHOOK_LOOKUP_OPERATION =
  'moneyLedger:readCreditTopupWebhookCommand'
const TOPUP_WEBHOOK_LOOKUP_SCOPE = 'money:topup_webhook_read'
const exactAmount = v.object({
  currency: identifier,
  units: identifier,
  exponent: v.number(),
})
const moneyArgs = {
  principalId: identifier,
  currency: identifier,
}
const externalSpendEnvironment = v.union(
  v.literal('sandbox'),
  v.literal('production'),
)
const externalSpendSettlementStatus = v.union(
  v.literal('settled'),
  v.literal('not_settled'),
  v.literal('unknown'),
)
const externalSpendSubmissionStatus = v.union(
  v.literal('not_submitted'),
  v.literal('possibly_submitted'),
  v.literal('observed'),
  v.literal('unknown'),
)
const externalSpendReservationState = v.union(
  v.literal('reserved'),
  v.literal('settled'),
  v.literal('released'),
  v.literal('outcome_unknown'),
  v.literal('reversed'),
)
const externalSpendRefusalCode = v.union(
  v.literal('external_spend_identity_conflict'),
  v.literal('external_spend_grant_invalid'),
  v.literal('external_spend_budget_refused'),
  v.literal('external_spend_payment_response_invalid'),
  v.literal('external_spend_live_money_gate_open'),
  v.literal('external_spend_invalid_amount'),
  v.literal('external_spend_not_found'),
  v.literal('external_spend_state_conflict'),
  v.literal('external_spend_reconciliation_required'),
  v.literal('external_spend_already_reversed'),
)
const externalSpendIdentityArgs = {
  reservationRef: identifier,
  principalId: identifier,
  credentialId: identifier,
  grantRef: identifier,
  grantGeneration: v.number(),
  environment: externalSpendEnvironment,
  invocationRef: identifier,
  attemptRef: identifier,
  effectGeneration: v.number(),
  operationRef: identifier,
  providerRef: identifier,
  paymentIdentifier: identifier,
  challengeDigest: identifier,
  idempotencyDigest: identifier,
  amount: exactAmount,
} as const
const externalSpendReservationValue = v.object({
  reservationRef: identifier,
  principalId: identifier,
  credentialId: identifier,
  grantRef: identifier,
  grantGeneration: v.number(),
  environment: externalSpendEnvironment,
  budgetPolicyRef: identifier,
  budgetDayStart: identifier,
  budgetMonthStart: identifier,
  invocationRef: identifier,
  attemptRef: identifier,
  effectGeneration: v.number(),
  operationRef: identifier,
  providerRef: identifier,
  submissionStatus: v.optional(externalSpendSubmissionStatus),
  paymentIdentifier: identifier,
  challengeDigest: identifier,
  idempotencyDigest: identifier,
  identityDigest: identifier,
  amount: exactAmount,
  state: externalSpendReservationState,
  finalizationDigest: v.optional(identifier),
  paymentResponseDigest: v.optional(identifier),
  providerReceiptDigest: v.optional(identifier),
  evidenceRefs: v.array(v.string()),
  reconciliationDigest: v.optional(identifier),
  reconciliationEvidenceRef: v.optional(identifier),
  reconciliationEvidenceDigest: v.optional(identifier),
  reversalEvidenceRef: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  createdAt: v.number(),
  updatedAt: v.number(),
  finalizedAt: v.optional(v.number()),
  reconciledAt: v.optional(v.number()),
  reversedAt: v.optional(v.number()),
})
const externalSpendMutationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: externalSpendReservationState,
    replayed: v.boolean(),
    reservation: externalSpendReservationValue,
  }),
  v.object({
    kind: v.literal('refused'),
    code: externalSpendRefusalCode,
    retryable: v.boolean(),
  }),
)

function readAmount(value: unknown): ExactAmount | undefined {
  const parsed = exactAmountSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
type ReservedOperationMaterial = Readonly<{
  operation: PublishedOperation
  descriptor: RuntimePublishedOperationDescriptor
}>

function parseReservedOperation(
  operationJson: string,
): ReservedOperationMaterial | undefined {
  try {
    const parsed: unknown = JSON.parse(operationJson)
    if (
      !isRecord(parsed)
      || !isBoundedJsonValue(parsed)
      || parsed.kind !== 'published_operation'
      || parsed.environment !== 'SOURCE-OWNED DEVELOPMENT EVIDENCE'
      || (parsed.runtimeEnvironment !== 'sandbox' && parsed.runtimeEnvironment !== 'production')
      || typeof parsed.operationId !== 'string'
      || typeof parsed.materialDigest !== 'string'
      || !isRecord(parsed.identity)
      || parsed.identity.runtimeEnvironment !== parsed.runtimeEnvironment
      || !isRecord(parsed.contract)
      || !isRecord(parsed.offering)
      || !isRecord(parsed.binding)
      || !isRecord(parsed.transport)
      || !isRecord(parsed.readiness)
    ) return undefined
    const operation = parsed as PublishedOperation
    if (
      canonicalDigest(operation.identity as StableHashValue)
      !== operation.materialDigest
    ) return undefined
    const descriptor = materializeRuntimePublishedOperation(operation)
    return { operation, descriptor }
  } catch {
    return undefined
  }
}

function parseReservedInput(
  inputJson: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(inputJson)
    return isRecord(parsed) && isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function amountFromParts(
  currency: string,
  units: string,
  exponent: number,
): ExactAmount | undefined {
  return readAmount({ currency, units, exponent })
}
function amountAtScale(
  amount: ExactAmount,
  currency: string,
  exponent: number,
): ExactAmount | undefined {
  if (amount.currency !== currency) return undefined
  return rescaleExactAmount(amount, exponent)
}
function zeroAmount(
  currency: string,
  exponent: number,
): ExactAmount | undefined {
  return amountFromParts(currency, '0', exponent)
}
type BudgetGrantResult =
  | Readonly<{
      kind: 'accepted'
      policy: CredentialBudgetPolicy
      environment: 'sandbox' | 'production'
      rate: AgentAccessRatePolicy
      generation: number
      budgetPolicyRef: string
    }>
  | Readonly<{
      kind: 'refused'
      code: 'budget_policy_missing' | 'budget_generation_stale'
    }>

type BudgetRows = Readonly<{
  daily: Doc<'moneyCredentialBudgetStates'>
  monthly: Doc<'moneyCredentialBudgetStates'>
  concurrency: Doc<'moneyCredentialBudgetStates'>
}>

function dayWindowStart(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function monthWindowStart(day: string): string {
  return day.slice(0, 7)
}

function budgetRefusal(code: string): {
  kind: 'refused'
  code: string
  retryable: boolean
} {
  return {
    kind: 'refused',
    code,
    retryable: code === 'budget_concurrency_exhausted',
  }
}
async function readBudgetGrant(
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
  const maximumSpendPerInvocation = readAmount(
    grant.policy.budget.maximumSpendPerInvocation,
  )
  const maximumDailySpend = readAmount(grant.policy.budget.maximumDailySpend)
  const maximumMonthlySpend = readAmount(
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
    rate: {
      ratePolicyRef: grant.policy.rate.ratePolicyRef,
      generation: grant.policy.rate.generation,
      maximumCallsPerMinute: grant.policy.rate.maximumCallsPerMinute,
      maximumCallsPerHour: grant.policy.rate.maximumCallsPerHour,
    },
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

async function readBudgetRows(
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
  const zero = zeroAmount(input.amount.currency, input.amount.exponent)
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

function budgetUsage(rows: BudgetRows): CredentialBudgetUsage | undefined {
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

async function writeBudgetUsage(
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
      ...(rows.concurrency.accountId === undefined ? {} : { accountId: rows.concurrency.accountId }),
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
async function reserveCredentialBudgetInTransaction(
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
  const dayStart = dayWindowStart(input.observedAt)
  const monthStart = monthWindowStart(dayStart)
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
  await writeBudgetUsage(ctx, rows, admission.usage, input.observedAt)
  return {
    kind: 'accepted',
    environment: grantResult.environment,
    budgetPolicyRef: grantResult.budgetPolicyRef,
    dayStart,
    monthStart,
  }
}

async function releaseOrSettleCredentialBudget(
  ctx: Pick<MutationCtx, 'db'>,
  transaction: Doc<'moneyTransactions'>,
  outcome: 'released' | 'not_released',
  now: number,
): Promise<boolean> {
  const hasBudgetMetadata =
    transaction.credentialId !== undefined ||
    transaction.budgetPolicyRef !== undefined ||
    transaction.budgetGeneration !== undefined ||
    transaction.budgetEnvironment !== undefined ||
    transaction.budgetDayStart !== undefined ||
    transaction.budgetMonthStart !== undefined ||
    transaction.budgetState !== undefined
  if (!hasBudgetMetadata) return true
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
    return false
  if (
    transaction.budgetState !== 'reserved' &&
    transaction.budgetState !== 'unknown'
  )
    return true
  const amount = amountFromParts(
    transaction.currency,
    transaction.amountUnits,
    transaction.exponent,
  )
  if (amount === undefined) return false
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
  if (rows === undefined) return false
  const usage = budgetUsage(rows)
  if (usage === undefined) return false
  const transition =
    outcome === 'released'
      ? settleCredentialBudget({ usage, amount })
      : releaseCredentialBudget({ usage, amount })
  if (transition.kind === 'refused') return false
  await writeBudgetUsage(ctx, rows, transition.usage, now)
  await ctx.db.patch(transaction._id, {
    budgetState: outcome === 'released' ? 'settled' : 'released',
    updatedAt: now,
  })
  return true
}

function externalSpendIdentityFromRow(
  row: Doc<'moneyExternalSpendReservations'>,
): ExternalSpendIdentity | undefined {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return undefined
  return {
    reservationRef: row.reservationRef,
    principalId: row.principalId,
    credentialId: row.credentialId,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    environment: row.environment,
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    operationRef: row.operationRef,
    providerRef: row.providerRef,
    paymentIdentifier: row.paymentIdentifier,
    challengeDigest: row.challengeDigest,
    amount,
    idempotencyDigest: row.idempotencyDigest,
  }
}

function externalSpendReservationView(
  row: Doc<'moneyExternalSpendReservations'>,
): ExternalSpendReservation | undefined {
  const identity = externalSpendIdentityFromRow(row)
  if (
    identity === undefined
    || row.identityDigest !== externalSpendIdentityDigest(identity)
  ) return undefined
  return {
    ...identity,
    identityDigest: row.identityDigest,
    budgetPolicyRef: row.budgetPolicyRef,
    budgetDayStart: row.budgetDayStart,
    budgetMonthStart: row.budgetMonthStart,
    state: row.state,
    ...(row.submissionStatus === undefined ? {} : { submissionStatus: row.submissionStatus }),
    ...(row.finalizationDigest === undefined ? {} : { finalizationDigest: row.finalizationDigest }),
    ...(row.paymentResponseDigest === undefined ? {} : { paymentResponseDigest: row.paymentResponseDigest }),
    ...(row.providerReceiptDigest === undefined ? {} : { providerReceiptDigest: row.providerReceiptDigest }),
    evidenceRefs: row.evidenceRefs,
    ...(row.reconciliationDigest === undefined ? {} : { reconciliationDigest: row.reconciliationDigest }),
    ...(row.reconciliationEvidenceRef === undefined ? {} : { reconciliationEvidenceRef: row.reconciliationEvidenceRef }),
    ...(row.reconciliationEvidenceDigest === undefined ? {} : { reconciliationEvidenceDigest: row.reconciliationEvidenceDigest }),
    ...(row.reversalEvidenceRef === undefined ? {} : { reversalEvidenceRef: row.reversalEvidenceRef }),
    ...(row.reversalEvidenceDigest === undefined ? {} : { reversalEvidenceDigest: row.reversalEvidenceDigest }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.finalizedAt === undefined ? {} : { finalizedAt: row.finalizedAt }),
    ...(row.reconciledAt === undefined ? {} : { reconciledAt: row.reconciledAt }),
    ...(row.reversedAt === undefined ? {} : { reversedAt: row.reversedAt }),
  }
}

function externalSpendRefusal(
  code: ExternalSpendRefusalCode,
  retryable = false,
): ExternalSpendMutationResult {
  return { kind: 'refused', code, retryable }
}
async function activeExternalSpendGrant(
  ctx: Pick<MutationCtx, 'db'>,
  input: ExternalSpendIdentity,
  now: number,
): Promise<boolean> {
  const [principal, grant] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', input.principalId))
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
      .unique(),
  ])
  return principal !== null
    && principal.principalId === input.principalId
    && (principal.expiresAt === undefined || principal.expiresAt > now)
    && principal.environment === input.environment
    && principal.lifecycle === 'active'
    && principal.grantGeneration === input.grantGeneration
    && grant !== null
    && grant.grantRef === input.grantRef
    && grant.principalId === input.principalId
    && grant.credentialId === input.credentialId
    && grant.environment === input.environment
    && principal.applicationRef === grant.applicationRef
    && grant.lifecycle === 'active'
    && grant.generation === input.grantGeneration
    && grant.expiresAt > now
    && grant.policy.environment === input.environment
    && grant.policyDigest === principal.policyDigest
    && grant.policy.budget.generation === grant.generation
    && grant.budgetPolicyRef === grant.policy.budget.budgetPolicyRef
}

function externalSpendIdentityMatches(
  row: Doc<'moneyExternalSpendReservations'>,
  identity: ExternalSpendIdentity,
): boolean {
  const stored = externalSpendIdentityFromRow(row)
  return stored !== undefined
    && row.identityDigest === externalSpendIdentityDigest(stored)
    && sameExternalSpendIdentity(stored, identity)
}

async function transitionExternalSpendBudget(
  ctx: Pick<MutationCtx, 'db'>,
  row: Doc<'moneyExternalSpendReservations'>,
  target: 'settled' | 'released' | 'reversed',
  now: number,
): Promise<boolean> {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  if (amount === undefined) return false
  const spendPrincipal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) =>
      query.eq('principalId', row.principalId),
    )
    .unique()
  if (spendPrincipal === null) return false
  const rows = await readBudgetRows(ctx, {
    principalId: row.principalId,
    accountId: spendPrincipal.ownerId,
    credentialId: row.credentialId,
    generation: row.grantGeneration,
    environment: row.environment,
    budgetPolicyRef: row.budgetPolicyRef,
    dayStart: row.budgetDayStart,
    monthStart: row.budgetMonthStart,
    amount,
    now,
  })
  if (
    rows === undefined
    || rows.daily._creationTime === 0
    || rows.monthly._creationTime === 0
    || rows.concurrency._creationTime === 0
  ) return false
  const usage = budgetUsage(rows)
  if (usage === undefined) return false
  const transition =
    target === 'settled'
      ? settleCredentialBudget({ usage, amount })
      : target === 'released'
        ? releaseCredentialBudget({ usage, amount })
        : reverseCredentialBudget({ usage, amount })
  if (transition.kind === 'refused') return false
  await writeBudgetUsage(ctx, rows, transition.usage, now)
  return true
}
function externalSpendAccepted(
  row: Doc<'moneyExternalSpendReservations'>,
  replayed: boolean,
): ExternalSpendMutationResult {
  const reservation = externalSpendReservationView(row)
  return reservation === undefined
    ? externalSpendRefusal('external_spend_state_conflict')
    : {
        kind: 'accepted',
        status: reservation.state,
        replayed,
        reservation,
      }
}
function accountFromRow(row: Doc<'moneyAccounts'>): MoneyAccount | undefined {
  const balance = amountFromParts(row.currency, row.balanceUnits, row.exponent)
  if (balance === undefined) return undefined
  return {
    accountRef: row.accountRef,
    accountKind: row.accountKind,
    ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
    ...(row.businessId === undefined ? {} : { businessId: row.businessId }),
    balance,
    version: row.version,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
type CanonicalMoneyAccountInput =
  | Readonly<{
      accountKind: 'operator_credit'
      accountId: string
      currency: string
      exponent: number
      now: number
    }>
  | Readonly<{
      accountKind: 'provider_earnings'
      businessId: string
      currency: string
      exponent: number
      now: number
    }>
  | Readonly<{
      accountKind: 'ae_rake'
      currency: string
      exponent: number
      now: number
    }>

function canonicalMoneyAccountRef(input: CanonicalMoneyAccountInput): string {
  if (input.accountKind === 'operator_credit')
    return accountRefForOwner(input.accountId, input.currency)
  if (input.accountKind === 'provider_earnings')
    return accountRefForProvider(input.businessId, input.currency)
  return accountRefForRake(input.currency)
}

function canonicalMoneyAccountMatches(
  row: Doc<'moneyAccounts'>,
  input: CanonicalMoneyAccountInput,
  accountRef: string,
): boolean {
  return (
    row.accountRef === accountRef &&
    row.accountKind === input.accountKind &&
    row.currency === input.currency &&
    row.exponent === input.exponent &&
    (input.accountKind === 'operator_credit'
      ? row.accountId === input.accountId && row.businessId === undefined
      : input.accountKind === 'provider_earnings'
        ? row.businessId === input.businessId && row.accountId === undefined
        : row.accountId === undefined && row.businessId === undefined)
  )
}

async function ensureCanonicalMoneyAccount(
  ctx: Pick<MutationCtx, 'db'>,
  input: CanonicalMoneyAccountInput,
): Promise<Doc<'moneyAccounts'> | undefined> {
  const accountRef = canonicalMoneyAccountRef(input)
  const existing = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', accountRef))
    .unique()
  if (existing !== null)
    return canonicalMoneyAccountMatches(existing, input, accountRef)
      ? existing
      : undefined
  const accountId = await ctx.db.insert('moneyAccounts', {
    accountRef,
    accountKind: input.accountKind,
    ...(input.accountKind === 'operator_credit'
      ? { accountId: input.accountId }
      : {}),
    ...(input.accountKind === 'provider_earnings'
      ? { businessId: input.businessId }
      : {}),
    currency: input.currency,
    exponent: input.exponent,
    balanceUnits: '0',
    version: 0,
    state: 'active',
    createdAt: input.now,
    updatedAt: input.now,
  })
  const created = await ctx.db.get(accountId)
  return created === null ? undefined : created
}

function payoutFromRow(row: Doc<'moneyPayouts'>): MoneyPayout | undefined {
  const grossAccrual = amountFromParts(
    row.currency,
    row.grossAccrualUnits,
    row.exponent,
  )
  const rake = amountFromParts(row.currency, row.rakeUnits, row.exponent)
  const providerNet = amountFromParts(
    row.currency,
    row.providerNetUnits,
    row.exponent,
  )
  const minimumPayout = amountFromParts(
    row.currency,
    row.minimumPayoutUnits,
    row.exponent,
  )
  const providerHeldBefore =
    row.providerHeldBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldBeforeUnits, row.exponent)
  const providerHeldAfter =
    row.providerHeldAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldAfterUnits, row.exponent)
  const providerPaidBefore =
    row.providerPaidBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidBeforeUnits, row.exponent)
  const providerPaidAfter =
    row.providerPaidAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidAfterUnits, row.exponent)
  if (
    grossAccrual === undefined ||
    rake === undefined ||
    providerNet === undefined ||
    minimumPayout === undefined ||
    ((row.state === 'paid' || row.state === 'reversed') &&
      (providerHeldBefore === undefined ||
        providerHeldAfter === undefined ||
        providerPaidBefore === undefined ||
        providerPaidAfter === undefined))
  )
    return undefined
  return {
    payoutRef: row.payoutRef,
    businessId: row.businessId,
    grossAccrual,
    rake,
    providerNet,
    minimumPayout,
    state: row.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    ...(row.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: row.stripeTransferId }),
    ...(row.payoutCommandId === undefined
      ? {}
      : { payoutCommandId: row.payoutCommandId }),
    ...(row.inputDigest === undefined ? {} : { inputDigest: row.inputDigest }),
    ...(row.transferRequestDigest === undefined
      ? {}
      : { transferRequestDigest: row.transferRequestDigest }),
    ...(row.transferEvidenceDigest === undefined
      ? {}
      : { transferEvidenceDigest: row.transferEvidenceDigest }),
    ...(row.transferReversalEvidenceDigest === undefined
      ? {}
      : { transferReversalEvidenceDigest: row.transferReversalEvidenceDigest }),
    ...(row.transferObservedAt === undefined
      ? {}
      : { transferObservedAt: row.transferObservedAt }),
    ...(row.transferStatus === undefined
      ? {}
      : { transferStatus: row.transferStatus }),
    ...(providerHeldBefore === undefined ? {} : { providerHeldBefore }),
    ...(providerHeldAfter === undefined ? {} : { providerHeldAfter }),
    ...(providerPaidBefore === undefined ? {} : { providerPaidBefore }),
    ...(providerPaidAfter === undefined ? {} : { providerPaidAfter }),
    idempotencyKey: row.idempotencyKey,
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
function payoutAccountView(row: Doc<'moneyPayoutAccounts'>) {
  return {
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    stripeAccountId: row.stripeAccountId,
    state: row.state,
    detailsSubmitted: row.detailsSubmitted,
    recipientCapabilityActive: row.recipientCapabilityActive,
    requirementsDigest: row.requirementsDigest,
    ...(row.providerObjectDigest === undefined
      ? {}
      : { providerObjectDigest: row.providerObjectDigest }),
    ...(row.lastStripePayloadDigest === undefined
      ? {}
      : { lastStripePayloadDigest: row.lastStripePayloadDigest }),
    ...(row.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: row.providerObjectVersion }),
    ...(row.lastStripeObservedAt === undefined
      ? {}
      : { lastStripeObservedAt: row.lastStripeObservedAt }),
    ...(row.version === undefined ? {} : { version: row.version }),
    ...(row.lastStripeEventId === undefined
      ? {}
      : { lastStripeEventId: row.lastStripeEventId }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function entryAmount(row: MoneyLedgerEntryRow): ExactAmount | undefined {
  return amountFromParts(row.currency, row.amountUnits, row.exponent)
}
type PayoutAccrualAmounts = Readonly<{
  businessId: string
  currency: string
  exponent: number
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}>

function payoutPeriodIdentity(
  businessId: string,
  currency: string,
  now: number,
): Readonly<{
  payoutRef: string
  periodStart: string
  periodEnd: string
}> {
  const date = new Date(now)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const periodStart = new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 10)
  const periodEnd = new Date(Date.UTC(year, month + 1, 0))
    .toISOString()
    .slice(0, 10)
  return {
    payoutRef: canonicalDigest({
      format: 'money-payout-period:v1',
      businessId,
      currency,
      periodStart,
      periodEnd,
    }),
    periodStart,
    periodEnd,
  }
}

async function readPayoutAccrualAmounts(
  ctx: Pick<MutationCtx, 'db'>,
  transactionRef: string,
): Promise<PayoutAccrualAmounts | undefined> {
  const entries = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (query) =>
      query.eq('transactionRef', transactionRef),
    )
    .take(10)
  const charge = entries.find(
    (entry) => entry.entryType === 'charge' && entry.direction === 'debit',
  )
  const provider = entries.find(
    (entry) =>
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'credit' &&
      entry.businessId !== undefined,
  )
  const rake = entries.find(
    (entry) => entry.entryType === 'rake' && entry.direction === 'credit',
  )
  const chargeAmount = charge === undefined ? undefined : entryAmount(charge)
  const providerAmount =
    provider === undefined ? undefined : entryAmount(provider)
  const rakeAmount = rake === undefined ? undefined : entryAmount(rake)
  if (
    charge === undefined ||
    provider === undefined ||
    rake === undefined ||
    chargeAmount === undefined ||
    providerAmount === undefined ||
    rakeAmount === undefined ||
    provider.businessId === undefined ||
    chargeAmount.currency !== providerAmount.currency ||
    rakeAmount.currency !== providerAmount.currency
  )
    return undefined
  const providerAccount = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (query) =>
      query.eq('accountRef', provider.accountRef),
    )
    .unique()
  if (
    providerAccount === null ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.businessId !== provider.businessId ||
    providerAccount.currency !== providerAmount.currency
  )
    return undefined
  const grossAccrual = amountAtScale(
    chargeAmount,
    providerAccount.currency,
    providerAccount.exponent,
  )
  const rakeAtScale = amountAtScale(
    rakeAmount,
    providerAccount.currency,
    providerAccount.exponent,
  )
  const providerNet = amountAtScale(
    providerAmount,
    providerAccount.currency,
    providerAccount.exponent,
  )
  if (
    grossAccrual === undefined ||
    rakeAtScale === undefined ||
    providerNet === undefined
  )
    return undefined
  const expectedGross = addExactAmounts(providerNet, rakeAtScale)
  if (
    expectedGross === undefined ||
    compareExactAmounts(expectedGross, grossAccrual) !== 0
  )
    return undefined
  return {
    businessId: provider.businessId,
    currency: providerAccount.currency,
    exponent: providerAccount.exponent,
    grossAccrual,
    rake: rakeAtScale,
    providerNet,
  }
}

async function updatePayoutPeriod(
  ctx: Pick<MutationCtx, 'db'>,
  accrual: PayoutAccrualAmounts,
  now: number,
  direction: 'credit' | 'debit',
): Promise<boolean> {
  const period = payoutPeriodIdentity(accrual.businessId, accrual.currency, now)
  const currentRow = await ctx.db
    .query('moneyPayouts')
    .withIndex('by_payoutRef', (query) =>
      query.eq('payoutRef', period.payoutRef),
    )
    .unique()
  if (currentRow === null) {
    if (direction === 'debit') return false
    const minimum = zeroAmount(accrual.currency, accrual.exponent)
    if (minimum === undefined) return false
    await ctx.db.insert('moneyPayouts', {
      payoutRef: period.payoutRef,
      businessId: accrual.businessId,
      currency: accrual.currency,
      exponent: accrual.exponent,
      grossAccrualUnits: accrual.grossAccrual.units,
      rakeUnits: accrual.rake.units,
      providerNetUnits: accrual.providerNet.units,
      minimumPayoutUnits: minimum.units,
      state: 'held_threshold',
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      providerAccountRef: accountRefForProvider(
        accrual.businessId,
        accrual.currency,
      ),
      idempotencyKey: period.payoutRef,
      createdAt: now,
      updatedAt: now,
    })
    return true
  }
  const current = payoutFromRow(currentRow)
  if (
    current === undefined ||
    current.businessId !== accrual.businessId ||
    current.periodStart !== period.periodStart ||
    current.periodEnd !== period.periodEnd ||
    current.state === 'paid' ||
    current.state === 'reversed' ||
    current.state === 'transfer_pending' ||
    current.state === 'outcome_unknown'
  )
    return false
  const nextGross =
    direction === 'credit'
      ? addExactAmounts(current.grossAccrual, accrual.grossAccrual)
      : subtractExactAmounts(current.grossAccrual, accrual.grossAccrual)
  const nextRake =
    direction === 'credit'
      ? addExactAmounts(current.rake, accrual.rake)
      : subtractExactAmounts(current.rake, accrual.rake)
  const nextProviderNet =
    direction === 'credit'
      ? addExactAmounts(current.providerNet, accrual.providerNet)
      : subtractExactAmounts(current.providerNet, accrual.providerNet)
  if (
    nextGross === undefined ||
    nextRake === undefined ||
    nextProviderNet === undefined
  )
    return false
  await ctx.db.patch(currentRow._id, {
    grossAccrualUnits: nextGross.units,
    rakeUnits: nextRake.units,
    providerNetUnits: nextProviderNet.units,
    updatedAt: now,
  })
  return true
}

type UsageChargeExpectation = Readonly<{
  usageRef: string
  principalId: string
  credentialId: string
  serviceRef: string
  offeringRef: string
  businessId: string
  invocationRef: string
  attemptRef: string
  operationKey: string
  priceDigest: string
  chargeState: 'free_tier' | 'paid'
  amount: ExactAmount
  transactionRef?: string
}>

function usageMatchesCharge(
  row: Doc<'moneyUsageEvents'>,
  expected: UsageChargeExpectation,
): boolean {
  const amount = amountFromParts(row.currency, row.amountUnits, row.exponent)
  return (
    amount !== undefined &&
    row.usageRef === expected.usageRef &&
    row.principalId === expected.principalId &&
    row.credentialId === expected.credentialId &&
    row.serviceRef === expected.serviceRef &&
    row.offeringRef === expected.offeringRef &&
    row.businessId === expected.businessId &&
    row.invocationRef === expected.invocationRef &&
    row.attemptRef === expected.attemptRef &&
    row.operationKey === expected.operationKey &&
    row.priceDigest === expected.priceDigest &&
    row.chargeState === expected.chargeState &&
    compareExactAmounts(amount, expected.amount) === 0 &&
    (expected.transactionRef === undefined ||
      row.transactionRef === expected.transactionRef)
  )
}

function usageIdentity(
  row: Doc<'moneyUsageEvents'>,
): Readonly<{ usageRef: string; observedAt: number; transactionRef?: string }> {
  return {
    usageRef: row.usageRef,
    observedAt: row.observedAt,
    ...(row.transactionRef === undefined
      ? {}
      : { transactionRef: row.transactionRef }),
  }
}

async function insertMoneyUsageEvent(
  ctx: MutationCtx,
  event: MoneyUsageEventInput,
): Promise<boolean> {
  const existing = await ctx.db
    .query('moneyUsageEvents')
    .withIndex('by_usageRef', (q) => q.eq('usageRef', event.usageRef))
    .unique()
  if (existing !== null) return false
  const eventAmount = amountFromParts(
    event.currency,
    event.amountUnits,
    event.exponent,
  )
  if (eventAmount === undefined) return false
  const summary = await ctx.db
    .query('moneyCredentialUsageSummaries')
    .withIndex('by_principalId_and_credentialId_and_currency', (q) =>
      q
        .eq('principalId', event.principalId)
        .eq('credentialId', event.credentialId)
        .eq('currency', event.currency),
    )
    .unique()
  const states =
    summary === null || summary.states.includes(event.chargeState)
      ? (summary?.states ?? [event.chargeState])
      : [...summary.states, event.chargeState]
  const paidCall = event.chargeState === 'paid' ? 1 : 0
  const freeCall = event.chargeState === 'free_tier' ? 1 : 0
  const spend =
    event.chargeState === 'paid'
      ? eventAmount
      : zeroAmount(event.currency, event.exponent)
  if (spend === undefined) return false
  const nextGrossSpend =
    summary === null
      ? spend
      : (() => {
          const current = amountFromParts(
            summary.currency,
            summary.grossSpendUnits,
            summary.exponent,
          )
          return current === undefined
            ? undefined
            : addExactAmounts(current, spend)
        })()
  if (nextGrossSpend === undefined) return false
  await ctx.db.insert('moneyUsageEvents', event)
  if (summary === null) {
    await ctx.db.insert('moneyCredentialUsageSummaries', {
      principalId: event.principalId,
      credentialId: event.credentialId,
      currency: nextGrossSpend.currency,
      exponent: nextGrossSpend.exponent,
      callCount: 1,
      paidCallCount: paidCall,
      freeCallCount: freeCall,
      grossSpendUnits: nextGrossSpend.units,
      states,
      updatedAt: event.observedAt,
    })
  } else {
    await ctx.db.patch(summary._id, {
      callCount: summary.callCount + 1,
      paidCallCount: summary.paidCallCount + paidCall,
      freeCallCount: summary.freeCallCount + freeCall,
      exponent: nextGrossSpend.exponent,
      grossSpendUnits: nextGrossSpend.units,
      states,
      updatedAt: event.observedAt,
    })
  }
  return true
}

function principalAllowed(
  identity: { tokenIdentifier?: string } | null,
  principalId: string,
): boolean {
  if (identity === null || identity.tokenIdentifier === undefined) return false
  return (
    identity.tokenIdentifier === principalId ||
    `clerk_api_key:${identity.tokenIdentifier}` === principalId
  )
}
async function payoutAuthorityAllowed(
  ctx: Pick<MutationCtx, 'auth' | 'db'>,
  businessId: string,
  principalId: string,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity()
  if (principalAllowed(identity, principalId)) return true
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId))
    .unique()
  if (owner === null) return false
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
    .order('desc')
    .take(20)
  return businesses.some((business) => String(business._id) === businessId)
}

async function ownerPrincipalAllowed(
  identity: {
    issuer?: string
    subject?: string
    tokenIdentifier?: string
  } | null,
  principalId: string,
  loadPrincipal: () => Promise<Readonly<{
    ownerId: string
    ownerTokenIdentifier?: string
  }> | null>,
): Promise<boolean> {
  if (principalAllowed(identity, principalId)) return true
  if (identity?.subject === undefined) return false
  const principal = await loadPrincipal()
  if (principal === null || principal.ownerId !== identity.subject) return false
  if (principal.ownerTokenIdentifier === undefined) return true
  const identityRefs = [
    identity.tokenIdentifier,
    identity.issuer === undefined
      ? undefined
      : `${identity.issuer}|${identity.subject}`,
  ].filter((value): value is string => value !== undefined)
  return identityRefs.includes(principal.ownerTokenIdentifier)
}

type ReconcileChargeResult =
  | Readonly<{ kind: 'accepted'; transactionRef: string; outcome: 'released' }>
  | Readonly<{ kind: 'accepted'; transactionRef: string; currency: string }>
  | Readonly<{ kind: 'refused'; code: string; retryable: boolean }>

export const readOperatorAccountVersion = internalQuery({
  args: {
    ownerId: identifier,
    currency: identifier,
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) =>
        q.eq(
          'accountRef',
          accountRefForOwner(args.ownerId, args.currency),
        ),
      )
      .unique()
    if (
      account === null ||
      account.accountKind !== 'operator_credit' ||
      account.accountId !== args.ownerId ||
      account.businessId !== undefined ||
      account.currency !== args.currency ||
      account.accountRef !==
        accountRefForOwner(args.ownerId, args.currency)
    )
      return null
    return account.version
  },
})
export const reserveExternalInvocationSpend = internalMutation({
  args: {
    ...externalSpendIdentityArgs,
    observedAt: v.number(),
  },
  returns: externalSpendMutationResultValue,
  handler: async (ctx, args): Promise<ExternalSpendMutationResult> => {
    const amount = readAmount(args.amount)
    if (amount === undefined || !Number.isFinite(args.observedAt)) {
      return externalSpendRefusal('external_spend_invalid_amount')
    }
    const { observedAt, ...rawIdentity } = args
    const identity: ExternalSpendIdentity = {
      ...rawIdentity,
      amount,
    }
    if (!externalSpendIdentityMaterialValid(identity)) {
      return externalSpendRefusal('external_spend_invalid_amount')
    }
    const prior = await ctx.db
      .query('moneyExternalSpendReservations')
      .withIndex('by_reservationRef', (query) =>
        query.eq('reservationRef', identity.reservationRef),
      )
      .unique()
    if (prior !== null) {
      return externalSpendIdentityMatches(prior, identity)
        ? externalSpendAccepted(prior, true)
        : externalSpendRefusal('external_spend_identity_conflict')
    }
    const priorByIdempotency = await ctx.db
      .query('moneyExternalSpendReservations')
      .withIndex('by_idempotencyDigest', (query) =>
        query.eq('idempotencyDigest', identity.idempotencyDigest),
      )
      .unique()
    if (priorByIdempotency !== null) {
      return externalSpendRefusal('external_spend_identity_conflict')
    }
    if (identity.environment === 'production' && identity.amount.units !== '0') {
      const gate = evaluateLiveMoneyGate()
      if (gate.kind === 'refused') {
        return externalSpendRefusal('external_spend_live_money_gate_open')
      }
    }
    if (!await activeExternalSpendGrant(ctx, identity, observedAt)) {
      return externalSpendRefusal('external_spend_grant_invalid')
    }
    const spendPrincipal = await ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) =>
        query.eq('principalId', identity.principalId),
      )
      .unique()
    if (spendPrincipal === null) {
      return externalSpendRefusal('external_spend_grant_invalid')
    }
    const budgetReservation = await reserveCredentialBudgetInTransaction(ctx, {
      principalId: identity.principalId,
      accountId: spendPrincipal.ownerId,
      credentialId: identity.credentialId,
      grantRef: identity.grantRef,
      generation: identity.grantGeneration,
      amount: identity.amount,
      observedAt,
    })
    if (budgetReservation.kind === 'refused') {
      return externalSpendRefusal(
        'external_spend_budget_refused',
        budgetReservation.retryable,
      )
    }
    const identityDigest = externalSpendIdentityDigest(identity)
    await ctx.db.insert('moneyExternalSpendReservations', {
      reservationRef: identity.reservationRef,
      principalId: identity.principalId,
      credentialId: identity.credentialId,
      grantRef: identity.grantRef,
      grantGeneration: identity.grantGeneration,
      environment: identity.environment,
      budgetPolicyRef: budgetReservation.budgetPolicyRef,
      budgetDayStart: budgetReservation.dayStart,
      budgetMonthStart: budgetReservation.monthStart,
      invocationRef: identity.invocationRef,
      attemptRef: identity.attemptRef,
      effectGeneration: identity.effectGeneration,
      operationRef: identity.operationRef,
      providerRef: identity.providerRef,
      paymentIdentifier: identity.paymentIdentifier,
      challengeDigest: identity.challengeDigest,
      idempotencyDigest: identity.idempotencyDigest,
      identityDigest,
      currency: identity.amount.currency,
      amountUnits: identity.amount.units,
      exponent: identity.amount.exponent,
      state: 'reserved',
      evidenceRefs: [],
      createdAt: observedAt,
      updatedAt: observedAt,
    })
    const created = await ctx.db
      .query('moneyExternalSpendReservations')
      .withIndex('by_reservationRef', (query) =>
        query.eq('reservationRef', identity.reservationRef),
      )
      .unique()
    return created === null
      ? externalSpendRefusal('external_spend_state_conflict')
      : externalSpendAccepted(created, false)
  },
})

export const finalizeExternalInvocationSpend = internalMutation({
  args: {
    ...externalSpendIdentityArgs,
    settlementStatus: externalSpendSettlementStatus,
    submissionStatus: externalSpendSubmissionStatus,
    paymentResponseDigest: v.optional(identifier),
    providerReceiptDigest: v.optional(identifier),
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  returns: externalSpendMutationResultValue,
  handler: async (ctx, args): Promise<ExternalSpendMutationResult> => {
    const amount = readAmount(args.amount)
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
  },
})

export const reconcileExternalInvocationSpend = internalMutation({
  args: {
    ...externalSpendIdentityArgs,
    settlementStatus: v.union(v.literal('settled'), v.literal('not_settled')),
    paymentResponseDigest: identifier,
    evidenceRef: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  },
  returns: externalSpendMutationResultValue,
  handler: async (ctx, args): Promise<ExternalSpendMutationResult> => {
    const amount = readAmount(args.amount)
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
  },
})

export const reverseExternalInvocationSpend = internalMutation({
  args: {
    ...externalSpendIdentityArgs,
    evidenceRef: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  },
  returns: externalSpendMutationResultValue,
  handler: async (ctx, args): Promise<ExternalSpendMutationResult> => {
    const amount = readAmount(args.amount)
    if (
      amount === undefined
      || !Number.isFinite(args.observedAt)
    ) {
      return externalSpendRefusal('external_spend_invalid_amount')
    }
    const { observedAt, evidenceRef, evidenceDigest, ...rawIdentity } = args
    const identity: ExternalSpendIdentity = {
      ...rawIdentity,
      amount,
    }
    const commandRefusal = externalSpendReversalCommandRefusal(
      identity,
      evidenceRef,
      evidenceDigest,
    )
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
    const decision = decideExternalSpendReversal({
      identity,
      reservation,
      evidenceRef,
      evidenceDigest,
    })
    if (decision.kind === 'refused') {
      return externalSpendRefusal(decision.code)
    }
    if (decision.kind === 'replayed') {
      return externalSpendAccepted(row, true)
    }
    if (!await transitionExternalSpendBudget(ctx, row, 'reversed', observedAt)) {
      return externalSpendRefusal('external_spend_budget_refused')
    }
    await ctx.db.patch(row._id, {
      state: 'reversed',
      reversalEvidenceRef: evidenceRef,
      reversalEvidenceDigest: evidenceDigest,
      reversedAt: observedAt,
      updatedAt: observedAt,
    })
    const updated = await ctx.db.get(row._id)
    return updated === null
      ? externalSpendRefusal('external_spend_state_conflict')
      : externalSpendAccepted(updated, false)
  },
})

export const authorizeInvocationCharge = internalMutation({
  args: {
    principalId: identifier,
    amount: exactAmount,
    operatorAccountRef: identifier,
    providerAccountRef: identifier,
    rakeAccountRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    expectedAccountVersion: v.number(),
    rakeBps: v.number(),
    priceDigest: identifier,
    priceSourceDigest: identifier,
    authorityMaximumSpend: exactAmount,
    credentialId: identifier,
    applicationRef: v.optional(identifier),
    serviceRef: identifier,
    offeringRef: identifier,
    businessId: identifier,
    invocationRef: identifier,
    attemptRef: identifier,
    operationKey: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
    freeTier: v.boolean(),
    credentialBudgetGrantRef: v.optional(identifier),
    credentialBudgetGeneration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requestedAmount = readAmount(args.amount)
    const requestedMaximumSpend = readAmount(args.authorityMaximumSpend)
    if (requestedAmount === undefined || requestedMaximumSpend === undefined)
      return {
        kind: 'refused' as const,
        code: 'price_unavailable' as const,
        retryable: false,
      }
    const invocation = await ctx.db
      .query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) =>
        query.eq('invocationRef', args.invocationRef),
      )
      .unique()
    if (
      invocation === null
      || invocation.operationJson === undefined
      || invocation.inputJson === undefined
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        retryable: false,
      }
    const reserved = parseReservedOperation(invocation.operationJson)
    const persistedInput = parseReservedInput(invocation.inputJson)
    if (
      reserved === undefined
      || persistedInput === undefined
      || canonicalDigest(persistedInput as StableHashValue) !== invocation.inputDigest
      || canonicalDigest({
        operationRef: invocation.operationRef,
        input: persistedInput,
      } as StableHashValue) !== invocation.requestDigest
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const { operation, descriptor } = reserved
    if (
      createPublicOperationRef({
        operationId: operation.operationId,
        publicationRef: operation.identity.publicationRef,
        publicationRevision: operation.identity.publicationRevision,
        contractRef: operation.contract.ref,
      }) !== invocation.operationRef
      || operation.runtimeEnvironment !== invocation.environment
      || operation.identity.businessId.length === 0
      || operation.identity.offeringId.length === 0
      || operation.identity.price.kind !== 'fixed'
      || descriptor.price.kind !== 'fixed'
      || operation.identity.priceDigest !== operation.priceDigest
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const operationAmount = readAmount(operation.identity.price.amount)
    const descriptorAmount = readAmount(descriptor.price.amount)
    const pricingAmount = readAmount(operation.identity.pricingConfig.paidAmount)
    if (
      operationAmount === undefined
      || descriptorAmount === undefined
      || pricingAmount === undefined
      || compareExactAmounts(operationAmount, descriptorAmount) !== 0
      || compareExactAmounts(operationAmount, pricingAmount) !== 0
      || compareExactAmounts(requestedAmount, operationAmount) !== 0
      || compareExactAmounts(requestedMaximumSpend, operationAmount) !== 0
    )
      return {
        kind: 'refused' as const,
        code: 'price_changed' as const,
        retryable: false,
      }
    const expectedPriceDigest = canonicalDigest({
      version: 'pricing:v2',
      unit: 'call',
      paidAmount: operationAmount,
    })
    if (
      operation.priceDigest !== expectedPriceDigest
      || operation.identity.priceDigest !== expectedPriceDigest
      || args.priceDigest !== expectedPriceDigest
      || args.priceSourceDigest !== expectedPriceDigest
      || args.freeTier
      || args.rakeBps !== 1_000
    )
      return {
        kind: 'refused' as const,
        code: 'price_changed' as const,
        retryable: false,
      }
    const offering = await ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (query) =>
        query.eq('offeringId', operation.identity.offeringId),
      )
      .unique()
    if (
      offering === null
      || offering.businessId.toString() !== operation.identity.businessId
      || offering.status !== 'active'
      || offering.presentation.price.kind !== 'fixed'
    )
      return {
        kind: 'refused' as const,
        code: 'price_unavailable' as const,
        retryable: false,
      }
    const publishedPrice = offering.presentation.price
    const publishedAmount = readAmount(publishedPrice.amount)
    if (
      publishedAmount === undefined
      || compareExactAmounts(publishedAmount, operationAmount) !== 0
      || args.offeringRef !== operation.identity.offeringId
      || args.businessId !== operation.identity.businessId
      || args.serviceRef !== operation.operationId
      || args.sourceDigest !== operation.materialDigest
      || canonicalDigest(args.evidenceRefs as StableHashValue)
        !== canonicalDigest(operation.readiness.evidenceRefs as StableHashValue)
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const [principal, grant, canonicalControl] = await Promise.all([
      ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) =>
          query.eq('principalId', invocation.principalId),
        )
        .unique(),
      ctx.db
        .query('agentAccessGrants')
        .withIndex('by_grantRef', (query) =>
          query.eq('grantRef', invocation.grantRef),
        )
        .unique(),
      ctx.db
        .query('actionInvocationControls')
        .withIndex('by_invocationRef', (query) =>
          query.eq('invocationRef', invocation.invocationRef),
        )
        .unique(),
    ])
    if (principal === null || grant === null || canonicalControl === null)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const durableAttemptRef = invocation.attemptRef
    if (
      durableAttemptRef === undefined
      || canonicalControl.currentAttemptRef !== durableAttemptRef
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const canonicalAttempt = await ctx.db
      .query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (query) =>
        query
          .eq('invocationRef', invocation.invocationRef)
          .eq('attemptRef', durableAttemptRef),
      )
      .unique()
    const authority = invocation.authority
    const authorityBinding = canonicalControl.authorityBinding
    const acceptedAuthority = canonicalControl.control.acceptedAuthority
    if (
      authority === undefined
      || authorityBinding === undefined
      || acceptedAuthority === undefined
      || canonicalAttempt === null
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    let authorityDigestMatches = false
    try {
      const authorityExpiresAt = Date.parse(authority.expiresAt)
      const authorityAmount = readAmount(authority.limits.amount)
      const expectedDecisionDigest = canonicalDigest({
        format: 'operation-invoke-authority:v1',
        invocationRef: authority.invocationRef,
        operationRef: authority.operationRef,
        inputDigest: authority.inputDigest,
        grantRef: authority.grantRef,
        grantGeneration: authority.grantGeneration,
        grantDigest: authority.grantDigest,
        reference: authority.reference,
        targetDigest: authority.targetDigest,
        consequence: authority.consequence,
        limits: authority.limits,
        expiresAt: authority.expiresAt,
        acceptedBasis: authority.acceptedBasis,
      } as StableHashValue)
      const authorityBasis = authority.acceptedBasis
      const basisMatches = authorityBasis.kind === 'approve_each'
        ? authority.reference === authorityBasis.authorityRef
        : authorityBasis.kind === 'standing_mandate_use'
          && authorityBasis.mandateRef.length > 0
          && authorityBasis.authorityUseRef.length > 0
          && authorityBasis.grantEvidenceRef.length > 0
          && authorityBasis.mandateGeneration === grant.generation
          && authority.reference === `operation-authority:${invocation.invocationRef}`
          && (principal.authorityMode !== 'full_yolo'
            || (
              authorityBasis.mandateRef === `agent-access-grant:${grant.grantRef}`
              && authorityBasis.mandateVersion === 1
              && authorityBasis.authorityUseRef === `operation-authority-use:${invocation.invocationRef}`
              && authorityBasis.grantEvidenceRef === `agent-access-grant-evidence:${grant.policyDigest}`
            ))
      authorityDigestMatches =
        authorityExpiresAt > args.observedAt
        && authorityExpiresAt <= operation.readiness.validUntil
        && authorityExpiresAt <= grant.expiresAt
        && authority.invocationRef === invocation.invocationRef
        && authority.operationRef === invocation.operationRef
        && authority.inputDigest === invocation.inputDigest
        && authority.grantRef === grant.grantRef
        && authority.grantGeneration === invocation.grantGeneration
        && authority.grantGeneration === grant.generation
        && authority.grantDigest === grant.policyDigest
        && authority.consequence === descriptor.consequenceClass
        && authority.targetDigest === canonicalDigest(operation.identity as StableHashValue)
        && authorityAmount !== undefined
        && compareExactAmounts(authorityAmount, operationAmount) === 0
        && canonicalDigest(authority.limits as StableHashValue)
          === canonicalDigest({ amount: operationAmount } as StableHashValue)
        && authority.decisionDigest === expectedDecisionDigest
        && basisMatches
    } catch {
      authorityDigestMatches = false
    }
    if (!authorityDigestMatches)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const canonicalState = canonicalControl.control.control
    if (
      invocation.invocationRef !== args.invocationRef
      || invocation.principalId !== args.principalId
      || invocation.credentialId !== args.credentialId
      || invocation.applicationRef !== args.applicationRef
      || invocation.ownerId !== principal.ownerId
      || invocation.environment !== principal.environment
      || invocation.ownerId !== grant.ownerId
      || invocation.principalId !== grant.principalId
      || invocation.credentialId !== grant.credentialId
      || invocation.applicationRef !== grant.applicationRef
      || invocation.environment !== grant.environment
      || invocation.grantRef !== grant.grantRef
      || invocation.grantGeneration !== grant.generation
      || invocation.policyDigest !== grant.policyDigest
      || invocation.grantExpiresAt !== grant.expiresAt
      || invocation.attemptRef !== durableAttemptRef
      || canonicalControl.invocationRef !== invocation.invocationRef
      || canonicalControl.sourceRef !== `operation-invocation-source:${invocation.invocationRef}`
      || canonicalControl.preparedMaterialDigest !== invocation.inputDigest
      || canonicalControl.preparedTargetDigest !== authority.targetDigest
      || canonicalControl.consequence !== authority.consequence
      || canonicalControl.currentAttemptRef !== durableAttemptRef
      || grant.policy.budget.generation !== grant.generation
      || canonicalControl.currentEffectGeneration !== canonicalAttempt.effectGeneration
      || canonicalControl.control.invocationRef !== invocation.invocationRef
      || canonicalControl.control.owner.principalRef !== invocation.principalId
      || canonicalControl.control.owner.callerRef !== invocation.credentialId
      || canonicalControl.control.origin.kind !== 'standalone'
      || canonicalControl.control.origin.principalRef !== invocation.principalId
      || canonicalControl.control.origin.callerRef !== invocation.credentialId
      || canonicalControl.control.action.id !== operation.operationId
      || canonicalControl.control.action.contractVersion !== descriptor.version
      || canonicalControl.control.desired.state !== 'invoke'
      || canonicalControl.control.freshness.state !== 'current'
      || canonicalControl.control.authority?.reference !== authority.reference
      || canonicalControl.control.authority?.expiresAt !== authority.expiresAt
      || authorityBinding.invocationRef !== invocation.invocationRef
      || authorityBinding.actor.principalRef !== invocation.principalId
      || authorityBinding.actor.callerRef !== invocation.credentialId
      || authorityBinding.origin.kind !== 'standalone'
      || authorityBinding.origin.principalRef !== invocation.principalId
      || authorityBinding.origin.callerRef !== invocation.credentialId
      || authorityBinding.invocationVersion !== canonicalControl.invocationVersion
      || authorityBinding.actionId !== operation.operationId
      || authorityBinding.contractVersion !== descriptor.version
      || authorityBinding.digest !== authority.decisionDigest
      || authorityBinding.targetDigest !== authority.targetDigest
      || authorityBinding.consequence !== authority.consequence
      || canonicalDigest(authorityBinding.limits as StableHashValue)
        !== canonicalDigest(authority.limits as StableHashValue)
      || authorityBinding.expiresAt !== authority.expiresAt
      || authorityBinding.acceptedBasis === undefined
      || canonicalDigest(authorityBinding.acceptedBasis as StableHashValue)
        !== canonicalDigest(authority.acceptedBasis as StableHashValue)
      || canonicalControl.control.acceptedAuthority === undefined
      || canonicalDigest(canonicalControl.control.acceptedAuthority as StableHashValue)
        !== canonicalDigest(authority.acceptedBasis as StableHashValue)
      || canonicalState.state !== 'leased'
      || canonicalState.attemptRef !== durableAttemptRef
      || canonicalState.release !== 'not_started'
      || canonicalState.effectGeneration !== canonicalAttempt.effectGeneration
      || canonicalAttempt.invocationRef !== invocation.invocationRef
      || canonicalAttempt.attemptRef !== durableAttemptRef
      || canonicalAttempt.actor.principalRef !== invocation.principalId
      || canonicalAttempt.actor.callerRef !== invocation.credentialId
      || canonicalAttempt.effectGeneration !== canonicalControl.currentEffectGeneration
      || canonicalAttempt.idempotency.operationKey !== invocation.operationRef
      || canonicalAttempt.idempotency.materialInputDigest !== invocation.inputDigest
      || canonicalAttempt.idempotency.effectIdentity !== canonicalDigest({
        actionId: operation.operationId,
        operationKey: invocation.operationRef,
        materialInputDigest: invocation.inputDigest,
      } as StableHashValue)
      || canonicalAttempt.lease.owner !== `operation-worker:${invocation.invocationRef}`
      || canonicalAttempt.lease.expiresAt !== authority.expiresAt
      || canonicalAttempt.release.state !== 'not_released'
      || canonicalAttempt.outcome.state !== 'running'
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    if (
      args.credentialBudgetGrantRef === undefined
      || args.credentialBudgetGeneration === undefined
    )
      return {
        kind: 'refused' as const,
        code: 'budget_policy_missing' as const,
        retryable: false,
      }
    const budgetGrant = await readBudgetGrant(ctx, {
      principalId: invocation.principalId,
      credentialId: invocation.credentialId,
      grantRef: args.credentialBudgetGrantRef,
      generation: args.credentialBudgetGeneration,
      now: args.observedAt,
    })
    if (budgetGrant === undefined || budgetGrant.kind === 'refused')
      return budgetRefusal(
        budgetGrant === undefined ? 'budget_policy_missing' : budgetGrant.code,
      )
    const amount = requestedAmount
    const authorityMaximumSpend = requestedMaximumSpend
    const authorityComparison = compareExactAmounts(
      amount,
      authorityMaximumSpend,
    )
    if (authorityComparison === undefined)
      return {
        kind: 'refused' as const,
        code: 'price_changed' as const,
        retryable: false,
      }
    if (amount.units !== '0' && !args.freeTier) {
      const gate = evaluateLiveMoneyGate()
      if (gate.kind === 'refused') return gate
    }
    const durablePrincipalId = invocation.principalId
    const durableBusinessId = operation.identity.businessId
    const durableOfferingRef = operation.identity.offeringId
    const durableServiceRef = operation.operationId
    const durableSourceDigest = operation.materialDigest
    const durableEvidenceRefs = [...operation.readiness.evidenceRefs]
    const currency = amount.currency
    const ownerAccountId = principal.ownerId
    const expectedOperatorRef = accountRefForOwner(
      ownerAccountId,
      currency,
    )
    const expectedProviderRef = accountRefForProvider(durableBusinessId, currency)
    const expectedRakeRef = accountRefForRake(currency)
    if (
      args.operatorAccountRef !== expectedOperatorRef
      || args.providerAccountRef !== expectedProviderRef
      || args.rakeAccountRef !== expectedRakeRef
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const legacyRefusal = await refuseIfLegacyPerKeyBalanceStranded(
      ctx,
      durablePrincipalId,
      currency,
    )
    if (legacyRefusal !== undefined) return legacyRefusal
    const [operatorExisting, providerExisting, rakeExisting] =
      await Promise.all([
        ctx.db
          .query('moneyAccounts')
          .withIndex('by_accountRef', (q) =>
            q.eq('accountRef', expectedOperatorRef),
          )
          .unique(),
        ctx.db
          .query('moneyAccounts')
          .withIndex('by_accountRef', (q) =>
            q.eq('accountRef', expectedProviderRef),
          )
          .unique(),
        ctx.db
          .query('moneyAccounts')
          .withIndex('by_accountRef', (q) =>
            q.eq('accountRef', expectedRakeRef),
          )
          .unique(),
      ])
    const operator =
      operatorExisting ??
      (await ensureCanonicalMoneyAccount(ctx, {
        accountKind: 'operator_credit',
        accountId: ownerAccountId,
        currency,
        exponent: amount.exponent,
        now: args.observedAt,
      }))
    const provider =
      providerExisting ??
      (await ensureCanonicalMoneyAccount(ctx, {
        accountKind: 'provider_earnings',
        businessId: durableBusinessId,
        currency,
        exponent: operator?.exponent ?? amount.exponent,
        now: args.observedAt,
      }))
    const rakeAccount =
      rakeExisting ??
      (await ensureCanonicalMoneyAccount(ctx, {
        accountKind: 'ae_rake',
        currency,
        exponent: operator?.exponent ?? amount.exponent,
        now: args.observedAt,
      }))
    const operatorDomain =
      operator === undefined ? undefined : accountFromRow(operator)
    const providerDomain =
      provider === undefined ? undefined : accountFromRow(provider)
    const rakeDomain =
      rakeAccount === undefined ? undefined : accountFromRow(rakeAccount)
    const accountRefusal = validateChargeAccounts({
      operator: operatorDomain,
      provider: providerDomain,
      rake: rakeDomain,
      operatorAccountRef: expectedOperatorRef,
      providerAccountRef: expectedProviderRef,
      rakeAccountRef: expectedRakeRef,
      accountId: ownerAccountId,
      businessId: durableBusinessId,
      currency,
    })
    if (accountRefusal !== undefined) return accountRefusal
    if (
      operator === undefined ||
      provider === undefined ||
      rakeAccount === undefined ||
      operatorDomain === undefined ||
      providerDomain === undefined ||
      rakeDomain === undefined
    ) {
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        retryable: false,
      }
    }
    if (
      provider.exponent !== operator.exponent ||
      rakeAccount.exponent !== operator.exponent
    )
      return {
        kind: 'refused' as const,
        code: 'currency_mismatch' as const,
        retryable: false,
      }
    const grossAmount = amountAtScale(amount, currency, operator.exponent)
    if (grossAmount === undefined)
      return {
        kind: 'refused' as const,
        code: 'currency_mismatch' as const,
        retryable: false,
      }
    const operatorAmount = grossAmount
    const rake = multiplyExactAmountByBps(grossAmount, args.rakeBps, 'floor')
    const providerNet =
      rake === undefined ? undefined : subtractExactAmounts(grossAmount, rake)
    const providerAmount =
      providerNet === undefined
        ? undefined
        : amountAtScale(providerNet, currency, provider.exponent)
    const rakeAmount =
      rake === undefined
        ? undefined
        : amountAtScale(rake, currency, rakeAccount.exponent)
    if (
      providerAmount === undefined ||
      rakeAmount === undefined ||
      providerNet === undefined
    )
      return {
        kind: 'refused' as const,
        code: 'currency_mismatch' as const,
        retryable: false,
      }
    const providerBalance = addExactAmounts(
      providerDomain.balance,
      providerAmount,
    )
    const rakeBalance = addExactAmounts(rakeDomain.balance, rakeAmount)
    if (providerBalance === undefined || rakeBalance === undefined)
      return {
        kind: 'refused' as const,
        code: 'rake_not_configured' as const,
        retryable: false,
      }
    const expectedTransactionRef =
      `operation-money:${invocation.invocationRef}:${durableAttemptRef}:1`
    if (
      args.operationKey !== invocation.operationRef
      || args.inputDigest !== invocation.inputDigest
      || args.transactionRef !== expectedTransactionRef
      || args.idempotencyKey !== expectedTransactionRef
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_mismatch' as const,
        retryable: false,
      }
    const usageRef = `${invocation.invocationRef}:${durableAttemptRef}:${invocation.operationRef}`
    const prior = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', expectedTransactionRef),
      )
      .unique()
    if (prior !== null) {
      if (
        prior.transactionRef !== expectedTransactionRef
        || prior.idempotencyKey !== expectedTransactionRef
        || prior.inputDigest !== invocation.inputDigest
        || prior.principalId !== invocation.principalId
        || prior.credentialId !== invocation.credentialId
        || prior.currency !== currency
        || prior.exponent !== operatorAmount.exponent
        || prior.expectedAccountVersion !== args.expectedAccountVersion
        || prior.budgetPolicyRef !== budgetGrant.budgetPolicyRef
        || prior.budgetGeneration !== budgetGrant.generation
        || prior.budgetEnvironment !== budgetGrant.environment
        || prior.kind !== 'charge'
      )
        return {
          kind: 'refused' as const,
          code: 'ledger_idempotency_conflict' as const,
          retryable: false,
        }
      if (prior.amountUnits !== operatorAmount.units)
        return {
          kind: 'refused' as const,
          code: 'ledger_idempotency_conflict' as const,
          retryable: false,
        }
      if (prior.amountUnits === '0') {
        const priorUsage = await ctx.db
          .query('moneyUsageEvents')
          .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
          .unique()
        const priorAmount =
          priorUsage === null
            ? undefined
            : amountFromParts(
                priorUsage.currency,
                priorUsage.amountUnits,
                priorUsage.exponent,
              )
        if (
          priorUsage === null ||
          priorAmount === undefined ||
          !usageMatchesCharge(priorUsage, {
            usageRef,
            principalId: durablePrincipalId,
            credentialId: invocation.credentialId,
            serviceRef: durableServiceRef,
            offeringRef: durableOfferingRef,
            businessId: durableBusinessId,
            invocationRef: invocation.invocationRef,
            attemptRef: canonicalAttempt.attemptRef,
            operationKey: invocation.operationRef,
            priceDigest: expectedPriceDigest,
            chargeState: 'free_tier',
            amount: operatorAmount,
            transactionRef: prior.transactionRef,
          })
        )
          return {
            kind: 'refused' as const,
            code: 'charge_reconciliation_required' as const,
            retryable: false,
          }
        return {
          kind: 'accepted' as const,
          chargeState: 'free_tier' as const,
          amount: priorAmount,
          priceDigest: priorUsage.priceDigest,
          ...usageIdentity(priorUsage),
        }
      }
      const priorUsage = await ctx.db
        .query('moneyUsageEvents')
        .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
        .unique()
      const priorAmount =
        priorUsage === null
          ? undefined
          : amountFromParts(
              priorUsage.currency,
              priorUsage.amountUnits,
              priorUsage.exponent,
            )
      if (
        priorUsage === null ||
        priorAmount === undefined ||
        !usageMatchesCharge(priorUsage, {
          usageRef,
          principalId: durablePrincipalId,
          credentialId: invocation.credentialId,
          serviceRef: durableServiceRef,
          offeringRef: durableOfferingRef,
          businessId: durableBusinessId,
          invocationRef: invocation.invocationRef,
          attemptRef: canonicalAttempt.attemptRef,
          operationKey: invocation.operationRef,
          priceDigest: expectedPriceDigest,
          chargeState: 'paid',
          amount: operatorAmount,
          transactionRef: prior.transactionRef,
        })
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      const entries = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', prior.transactionRef),
        )
        .take(3)
      const charge = entries.find(
        (entry) => entry.entryType === 'charge' && entry.direction === 'debit',
      )
      const providerEntry = entries.find(
        (entry) =>
          entry.entryType === 'payout_accrual' && entry.direction === 'credit',
      )
      const rakeEntry = entries.find(
        (entry) => entry.entryType === 'rake' && entry.direction === 'credit',
      )
      const chargeAmount =
        charge === undefined ? undefined : entryAmount(charge)
      const providerEntryAmount =
        providerEntry === undefined ? undefined : entryAmount(providerEntry)
      const rakeEntryAmount =
        rakeEntry === undefined ? undefined : entryAmount(rakeEntry)
      if (
        charge === undefined ||
        providerEntry === undefined ||
        rakeEntry === undefined ||
        chargeAmount === undefined ||
        providerEntryAmount === undefined ||
        rakeEntryAmount === undefined ||
        charge.accountRef !== operator.accountRef ||
        providerEntry.accountRef !== provider.accountRef ||
        rakeEntry.accountRef !== rakeAccount.accountRef
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      const storedCharge = amountAtScale(
        chargeAmount,
        currency,
        operator.exponent,
      )
      const storedProvider = amountAtScale(
        providerEntryAmount,
        currency,
        provider.exponent,
      )
      const storedRake = amountAtScale(
        rakeEntryAmount,
        currency,
        rakeAccount.exponent,
      )
      if (
        storedCharge === undefined ||
        storedProvider === undefined ||
        storedRake === undefined ||
        compareExactAmounts(storedCharge, operatorAmount) !== 0 ||
        compareExactAmounts(storedProvider, providerAmount) !== 0 ||
        compareExactAmounts(storedRake, rakeAmount) !== 0
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      return {
        kind: 'accepted' as const,
        chargeState: 'paid' as const,
        amount: priorAmount,
        priceDigest: priorUsage.priceDigest,
        ...usageIdentity(priorUsage),
        providerNet,
        rake,
      }
    }
    if (grossAmount.units === '0') {
      const existingUsage = await ctx.db
        .query('moneyUsageEvents')
        .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
        .unique()
      if (existingUsage !== null) {
        const existingAmount = amountFromParts(
          existingUsage.currency,
          existingUsage.amountUnits,
          existingUsage.exponent,
        )
        if (
          existingAmount === undefined ||
          !usageMatchesCharge(existingUsage, {
            usageRef,
            principalId: durablePrincipalId,
            credentialId: invocation.credentialId,
            serviceRef: durableServiceRef,
            offeringRef: durableOfferingRef,
            businessId: durableBusinessId,
            invocationRef: invocation.invocationRef,
            attemptRef: canonicalAttempt.attemptRef,
            operationKey: invocation.operationRef,
            priceDigest: expectedPriceDigest,
            chargeState: 'free_tier',
            amount: operatorAmount,
          })
        )
          return {
            kind: 'refused' as const,
            code: 'charge_reconciliation_required' as const,
            retryable: false,
          }
        return {
          kind: 'accepted' as const,
          chargeState: 'free_tier' as const,
          amount: existingAmount,
          priceDigest: existingUsage.priceDigest,
          ...usageIdentity(existingUsage),
        }
      }
      const windowStart = new Date(args.observedAt).toISOString().slice(0, 10)
      const counter = await ctx.db
        .query('moneyFreeTierCounters')
        .withIndex('by_principalId_and_offeringRef_and_windowStart', (q) =>
          q
            .eq('principalId', durablePrincipalId)
            .eq('offeringRef', durableOfferingRef)
            .eq('windowStart', windowStart),
        )
        .unique()
      if (counter !== null && counter.callsUsed >= 1)
        return {
          kind: 'refused' as const,
          code: 'credit_topup_required' as const,
          retryable: false,
          nextAction: 'credit_topup_required' as const,
        }
      const budgetReservation = await reserveCredentialBudgetInTransaction(ctx, {
        principalId: durablePrincipalId,
        accountId: ownerAccountId,
        credentialId: invocation.credentialId,
        grantRef: args.credentialBudgetGrantRef,
        generation: args.credentialBudgetGeneration,
        amount: operatorAmount,
        observedAt: args.observedAt,
      })
      if (budgetReservation.kind === 'refused') return budgetReservation
      if (counter === null)
        await ctx.db.insert('moneyFreeTierCounters', {
          counterRef: `${durablePrincipalId}:${durableOfferingRef}:day:${windowStart}`,
          principalId: durablePrincipalId,
          offeringRef: durableOfferingRef,
          window: 'day',
          windowStart,
          callsUsed: 1,
          version: 1,
          updatedAt: args.observedAt,
        })
      else
        await ctx.db.patch('moneyFreeTierCounters', counter._id, {
          callsUsed: counter.callsUsed + 1,
          version: counter.version + 1,
          updatedAt: args.observedAt,
        })
      const budgetFields = {
        credentialId: invocation.credentialId,
        budgetPolicyRef: budgetReservation.budgetPolicyRef,
        budgetGeneration: budgetGrant.generation,
        budgetEnvironment: budgetReservation.environment,
        budgetDayStart: budgetReservation.dayStart,
        budgetMonthStart: budgetReservation.monthStart,
        budgetState: 'reserved' as const,
      }
      await ctx.db.insert('moneyTransactions', {
        transactionRef: expectedTransactionRef,
        kind: 'charge' as const,
        idempotencyKey: expectedTransactionRef,
        inputDigest: invocation.inputDigest,
        principalId: durablePrincipalId,
        accountId: ownerAccountId,
        currency,
        amountUnits: '0',
        exponent: grossAmount.exponent,
        state: 'applied' as const,
        expectedAccountVersion: operator.version,
        createdAt: args.observedAt,
        updatedAt: args.observedAt,
        ...budgetFields,
      })
      await insertMoneyUsageEvent(ctx, {
        usageRef,
        principalId: durablePrincipalId,
        accountId: ownerAccountId,
        credentialId: invocation.credentialId,
        currency,
        exponent: grossAmount.exponent,
        serviceRef: durableServiceRef,
        offeringRef: durableOfferingRef,
        businessId: durableBusinessId,
        invocationRef: invocation.invocationRef,
        attemptRef: canonicalAttempt.attemptRef,
        operationKey: invocation.operationRef,
        priceDigest: expectedPriceDigest,
        chargeState: 'free_tier',
        amountUnits: '0',
        transactionRef: expectedTransactionRef,
        observedAt: args.observedAt,
      })
      const persistedUsage = await ctx.db
        .query('moneyUsageEvents')
        .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
        .unique()
      const persistedAmount =
        persistedUsage === null
          ? undefined
          : amountFromParts(
              persistedUsage.currency,
              persistedUsage.amountUnits,
              persistedUsage.exponent,
            )
      if (
        persistedUsage === null ||
        persistedAmount === undefined ||
        !usageMatchesCharge(persistedUsage, {
          usageRef,
          principalId: durablePrincipalId,
          credentialId: invocation.credentialId,
          serviceRef: durableServiceRef,
          offeringRef: durableOfferingRef,
          businessId: durableBusinessId,
          invocationRef: invocation.invocationRef,
          attemptRef: canonicalAttempt.attemptRef,
          operationKey: invocation.operationRef,
          priceDigest: expectedPriceDigest,
          chargeState: 'free_tier',
          amount: operatorAmount,
        })
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      return {
        kind: 'accepted' as const,
        chargeState: 'free_tier' as const,
        amount: persistedAmount,
        priceDigest: persistedUsage.priceDigest,
        ...usageIdentity(persistedUsage),
      }
    }
    const balanceComparison = compareExactAmounts(
      operatorDomain.balance,
      operatorAmount,
    )
    if (
      operatorDomain.state !== 'active' ||
      balanceComparison === undefined ||
      balanceComparison === -1
    ) {
      const existingUsage = await ctx.db
        .query('moneyUsageEvents')
        .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
        .unique()
      if (existingUsage === null)
        await insertMoneyUsageEvent(ctx, {
          usageRef,
          principalId: durablePrincipalId,
          accountId: ownerAccountId,
          credentialId: invocation.credentialId,
          currency,
          exponent: grossAmount.exponent,
          serviceRef: durableServiceRef,
          offeringRef: durableOfferingRef,
          businessId: durableBusinessId,
          invocationRef: invocation.invocationRef,
          attemptRef: canonicalAttempt.attemptRef,
          operationKey: invocation.operationRef,
          priceDigest: expectedPriceDigest,
          chargeState: 'insufficient_credit',
          amountUnits: grossAmount.units,
          observedAt: args.observedAt,
        })
      return {
        kind: 'refused' as const,
        code: 'insufficient_credit' as const,
        retryable: false,
        nextAction: 'credit_topup_required' as const,
        requiredAmount: grossAmount,
        availableAmount: operatorDomain.balance,
      }
    }
    const operatorBalance = subtractExactAmounts(
      operatorDomain.balance,
      operatorAmount,
    )
    if (operatorBalance === undefined)
      return {
        kind: 'refused' as const,
        code: 'rake_not_configured' as const,
        retryable: false,
      }
    if (operator.version !== args.expectedAccountVersion)
      return {
        kind: 'refused' as const,
        code: 'ledger_cas_conflict' as const,
        retryable: true,
      }
    const budgetReservation = await reserveCredentialBudgetInTransaction(ctx, {
      principalId: durablePrincipalId,
      accountId: ownerAccountId,
      credentialId: invocation.credentialId,
      grantRef: args.credentialBudgetGrantRef,
      generation: args.credentialBudgetGeneration,
      amount: operatorAmount,
      observedAt: args.observedAt,
    })
    if (budgetReservation.kind === 'refused') return budgetReservation
    const budgetFields = {
      credentialId: invocation.credentialId,
      budgetPolicyRef: budgetReservation.budgetPolicyRef,
      budgetGeneration: budgetGrant.generation,
      budgetEnvironment: budgetReservation.environment,
      budgetDayStart: budgetReservation.dayStart,
      budgetMonthStart: budgetReservation.monthStart,
      budgetState: 'reserved' as const,
    }
    const transaction = {
      transactionRef: expectedTransactionRef,
      kind: 'charge' as const,
      idempotencyKey: expectedTransactionRef,
      inputDigest: invocation.inputDigest,
      principalId: durablePrincipalId,
      accountId: ownerAccountId,
      currency,
      amountUnits: operatorAmount.units,
      exponent: grossAmount.exponent,
      state: 'applied' as const,
      expectedAccountVersion: args.expectedAccountVersion,
      createdAt: args.observedAt,
      updatedAt: args.observedAt,
      ...budgetFields,
    }
    const common = {
      transactionRef: expectedTransactionRef,
      idempotencyKey: expectedTransactionRef,
      sourceDigest: durableSourceDigest,
      evidenceRefs: durableEvidenceRefs,
      createdAt: args.observedAt,
    }
    await ctx.db.insert('moneyLedgerEntries', {
      ...common,
      entryRef: `${expectedTransactionRef}:charge`,
      accountRef: operator.accountRef,
      entryType: 'charge',
      direction: 'debit',
      amountUnits: operatorAmount.units,
      currency: operatorAmount.currency,
      exponent: operatorAmount.exponent,
      principalId: durablePrincipalId,
      invocationRef: invocation.invocationRef,
      attemptRef: canonicalAttempt.attemptRef,
    })
    await ctx.db.insert('moneyLedgerEntries', {
      ...common,
      entryRef: `${expectedTransactionRef}:provider`,
      accountRef: provider.accountRef,
      entryType: 'payout_accrual',
      direction: 'credit',
      amountUnits: providerAmount.units,
      currency: providerAmount.currency,
      exponent: providerAmount.exponent,
      businessId: durableBusinessId,
      invocationRef: invocation.invocationRef,
      attemptRef: canonicalAttempt.attemptRef,
    })
    await ctx.db.insert('moneyLedgerEntries', {
      ...common,
      entryRef: `${expectedTransactionRef}:rake`,
      accountRef: rakeAccount.accountRef,
      entryType: 'rake',
      direction: 'credit',
      amountUnits: rakeAmount.units,
      currency: rakeAmount.currency,
      exponent: rakeAmount.exponent,
      businessId: durableBusinessId,
    })
    await ctx.db.patch('moneyAccounts', operator._id, {
      balanceUnits: operatorBalance.units,
      version: operator.version + 1,
      updatedAt: args.observedAt,
    })
    await ctx.db.patch('moneyAccounts', provider._id, {
      balanceUnits: providerBalance.units,
      version: provider.version + 1,
      updatedAt: args.observedAt,
    })
    await ctx.db.patch('moneyAccounts', rakeAccount._id, {
      balanceUnits: rakeBalance.units,
      version: rakeAccount.version + 1,
      updatedAt: args.observedAt,
    })
    await ctx.db.insert('moneyTransactions', transaction)
    await insertMoneyUsageEvent(ctx, {
      usageRef,
      principalId: durablePrincipalId,
      accountId: ownerAccountId,
      credentialId: invocation.credentialId,
      currency,
      exponent: grossAmount.exponent,
      serviceRef: durableServiceRef,
      offeringRef: durableOfferingRef,
      businessId: durableBusinessId,
      invocationRef: invocation.invocationRef,
      attemptRef: canonicalAttempt.attemptRef,
      operationKey: invocation.operationRef,
      priceDigest: expectedPriceDigest,
      chargeState: 'paid',
      amountUnits: grossAmount.units,
      transactionRef: expectedTransactionRef,
      observedAt: args.observedAt,
    })
    const persistedUsage = await ctx.db
      .query('moneyUsageEvents')
      .withIndex('by_usageRef', (q) => q.eq('usageRef', usageRef))
      .unique()
    const persistedAmount =
      persistedUsage === null
        ? undefined
        : amountFromParts(
            persistedUsage.currency,
            persistedUsage.amountUnits,
            persistedUsage.exponent,
          )
    if (
      persistedUsage === null ||
      persistedAmount === undefined ||
      !usageMatchesCharge(persistedUsage, {
        usageRef,
        principalId: durablePrincipalId,
        credentialId: invocation.credentialId,
        serviceRef: durableServiceRef,
        offeringRef: durableOfferingRef,
        businessId: durableBusinessId,
        invocationRef: invocation.invocationRef,
        attemptRef: canonicalAttempt.attemptRef,
        operationKey: invocation.operationRef,
        priceDigest: expectedPriceDigest,
        chargeState: 'paid',
        amount: operatorAmount,
        transactionRef: expectedTransactionRef,
      })
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    return {
      kind: 'accepted' as const,
      chargeState: 'paid' as const,
      amount: persistedAmount,
      priceDigest: persistedUsage.priceDigest,
      ...usageIdentity(persistedUsage),
      providerNet,
      rake,
    }
  },
})

const topupCommandValue = v.object({
  commandRef: identifier,
  principalId: identifier,
  accountRef: identifier,
  currency: identifier,
  exponent: v.number(),
  amountUnits: identifier,
  processingFeeUnits: identifier,
  chargeAmountUnits: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  providerRecoveryDeadlineAt: v.number(),
  state: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  externalRef: v.optional(identifier),
  providerStatus: v.optional(
    v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('outcome_unknown'),
    ),
  ),
  metadataDigest: v.optional(identifier),
  requestDigest: v.optional(identifier),
  checkoutSessionDigest: v.optional(identifier),
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  appliedStripeEventId: v.optional(identifier),
  appliedPayloadDigest: v.optional(identifier),
  appliedTransactionRef: v.optional(identifier),
  buyerBalanceBefore: v.optional(exactAmount),
  buyerBalanceAfter: v.optional(exactAmount),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const moneyRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
  retryable: v.boolean(),
})
const topupCommandResultValue = v.union(
  v.object({ kind: v.literal('accepted'), command: topupCommandValue }),
  moneyRefusalValue,
)
const topupWebhookResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(
      v.literal('applied'),
      v.literal('replayed'),
      v.literal('ignored'),
    ),
    appliedRef: v.optional(identifier),
  }),
  moneyRefusalValue,
)
const checkoutEventArg = v.object({
  kind: v.literal('checkout'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('checkout.session.completed'),
    v.literal('checkout.session.async_payment_succeeded'),
    v.literal('checkout.session.async_payment_failed'),
    v.literal('checkout.session.expired'),
  ),
  externalRef: identifier,
  sessionId: identifier,
  commandRef: identifier,
  paymentId: v.optional(identifier),
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  status: v.union(v.literal('paid'), v.literal('failed'), v.literal('expired')),
  amount: exactAmount,
  metadataDigest: identifier,
  payloadDigest: identifier,
  observedAt: v.number(),
})
const accountUpdatedEventArg = v.object({
  kind: v.literal('account'),
  stripeEventId: identifier,
  eventType: v.union(
    v.literal('account.updated'),
    v.literal('v2.core.account.created'),
    v.literal('v2.core.account.updated'),
    v.literal('v2.core.account.closed'),
    v.literal('v2.core.account[configuration.recipient].updated'),
    v.literal(
      'v2.core.account[configuration.recipient].capability_status_updated',
    ),
  ),
  externalRef: identifier,
  stripeAccountId: identifier,
  providerObjectDigest: identifier,
  providerObjectVersion: v.optional(v.number()),
  payloadDigest: identifier,
  observedAt: v.number(),
})
const stripeMoneyWebhookEventArg = v.union(
  checkoutEventArg,
  accountUpdatedEventArg,
)
const topupProviderEvidenceArg = v.object({
  externalRef: identifier,
  amount: exactAmount,
  status: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  evidenceRef: identifier,
  requestDigest: identifier,
  metadataDigest: identifier,
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: identifier,
  paymentId: v.optional(identifier),
})
const topupReadInputArg = v.object({
  externalRef: v.optional(identifier),
  commandRef: v.optional(identifier),
  idempotencyKey: identifier,
})
const billingSourceArgs = {
  operationKey: identifier,
  correlationId: identifier,
  ...sourceWriteArgs,
}

function topupCommandView(row: Doc<'moneyTopupCommands'>) {
  const buyerBalanceBefore =
    row.buyerBalanceBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceBeforeUnits, row.exponent)
  const buyerBalanceAfter =
    row.buyerBalanceAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceAfterUnits, row.exponent)
  return {
    commandRef: row.commandRef,
    principalId: row.principalId,
    accountRef: row.accountRef,
    currency: row.currency,
    exponent: row.exponent,
    amountUnits: row.amountUnits,
    processingFeeUnits: row.processingFeeUnits,
    chargeAmountUnits: row.chargeAmountUnits,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    successReturnRef: row.successReturnRef,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    state: row.state,
    ...(row.externalRef === undefined ? {} : { externalRef: row.externalRef }),
    ...(row.paymentId === undefined ? {} : { paymentId: row.paymentId }),
    ...(row.providerStatus === undefined
      ? {}
      : { providerStatus: row.providerStatus }),
    ...(row.metadataDigest === undefined
      ? {}
      : { metadataDigest: row.metadataDigest }),
    ...(row.requestDigest === undefined
      ? {}
      : { requestDigest: row.requestDigest }),
    ...(row.checkoutSessionDigest === undefined
      ? {}
      : { checkoutSessionDigest: row.checkoutSessionDigest }),
    ...(row.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: row.paymentIntentDigest }),
    ...(row.evidenceDigest === undefined
      ? {}
      : { evidenceDigest: row.evidenceDigest }),
    ...(row.providerEvidenceRef === undefined
      ? {}
      : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.appliedStripeEventId === undefined
      ? {}
      : { appliedStripeEventId: row.appliedStripeEventId }),
    ...(row.appliedPayloadDigest === undefined
      ? {}
      : { appliedPayloadDigest: row.appliedPayloadDigest }),
    ...(row.appliedTransactionRef === undefined
      ? {}
      : { appliedTransactionRef: row.appliedTransactionRef }),
    ...(buyerBalanceBefore === undefined ? {} : { buyerBalanceBefore }),
    ...(buyerBalanceAfter === undefined ? {} : { buyerBalanceAfter }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function refusedTopup(
  code: string,
  retryable: boolean,
): Infer<typeof moneyRefusalValue> {
  return { kind: 'refused', code, retryable }
}

async function refuseIfLegacyPerKeyBalanceStranded(
  ctx: Pick<MutationCtx, 'db'>,
  principalId: string,
  currency: string,
): Promise<
  | Readonly<{
      kind: 'refused'
      code: 'billing_identity_mismatch'
      retryable: false
    }>
  | undefined
> {
  const legacyRow = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) =>
      q.eq('accountRef', legacyPerKeyAccountRef(principalId, currency)),
    )
    .unique()
  if (legacyRow === null) return undefined
  const balance = amountFromParts(
    legacyRow.currency,
    legacyRow.balanceUnits,
    legacyRow.exponent,
  )
  if (balance !== undefined && balance.units !== '0') {
    return {
      kind: 'refused' as const,
      code: 'billing_identity_mismatch' as const,
      retryable: false,
    }
  }
  return undefined
}

async function requireBillingSourceWrite(
  ctx: MutationCtx,
  args: {
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
  },
): Promise<void> {
  const result = await requireSourceWrite(ctx, args, 'billing')
  if (result.kind === 'rejected') {
    throw new Error(`money_billing_source_write_rejected:${result.reason}`)
  }
}

function eventRowMatches(
  row: Doc<'moneyStripeEvents'>,
  event: Infer<typeof stripeMoneyWebhookEventArg>,
): boolean {
  if (
    row.eventType !== event.eventType ||
    row.payloadDigest !== event.payloadDigest ||
    row.providerObjectId !== event.externalRef
  )
    return false
  if (event.kind === 'account') {
    return (
      row.commandRef === undefined &&
      row.sessionId === undefined &&
      row.paymentId === undefined &&
      row.checkoutStatus === undefined &&
      row.providerObjectDigest === event.providerObjectDigest &&
      row.providerObjectVersion === event.providerObjectVersion
    )
  }
  const rowAmount =
    row.amountUnits === undefined ||
    row.currency === undefined ||
    row.exponent === undefined
      ? undefined
      : amountFromParts(row.currency, row.amountUnits, row.exponent)
  return (
    row.commandRef === event.commandRef &&
    row.sessionId === event.sessionId &&
    row.paymentId === event.paymentId &&
    row.providerObjectDigest === event.checkoutSessionDigest &&
    row.paymentIntentDigest === event.paymentIntentDigest &&
    row.checkoutStatus === event.status &&
    row.metadataDigest === event.metadataDigest &&
    rowAmount !== undefined &&
    compareExactAmounts(rowAmount, event.amount) === 0
  )
}

function eventRowFields(event: Infer<typeof stripeMoneyWebhookEventArg>) {
  return {
    stripeEventId: event.stripeEventId,
    eventType: event.eventType,
    payloadDigest: event.payloadDigest,
    providerObjectId: event.externalRef,
    receivedAt: event.observedAt,
    ...(event.kind === 'account'
      ? {
          providerObjectDigest: event.providerObjectDigest,
          ...(event.providerObjectVersion === undefined
            ? {}
            : { providerObjectVersion: event.providerObjectVersion }),
        }
      : {
          commandRef: event.commandRef,
          sessionId: event.sessionId,
          ...(event.paymentId === undefined
            ? {}
            : { paymentId: event.paymentId }),
          providerObjectDigest: event.checkoutSessionDigest,
          ...(event.paymentIntentDigest === undefined
            ? {}
            : { paymentIntentDigest: event.paymentIntentDigest }),
          checkoutStatus: event.status,
          currency: event.amount.currency,
          amountUnits: event.amount.units,
          exponent: event.amount.exponent,
          metadataDigest: event.metadataDigest,
        }),
  }
}
export const reserveCreditTopup = mutation({
  args: {
    principalId: identifier,
    accountRef: identifier,
    amount: exactAmount,
    commandRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    successReturnRef: identifier,
    ...billingSourceArgs,
  },
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    await requireBillingSourceWrite(ctx, args)
    const prior = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (prior !== null) {
      if (
        prior.inputDigest !== args.inputDigest ||
        prior.commandRef !== args.commandRef ||
        prior.principalId !== args.principalId ||
        prior.accountRef !== args.accountRef
      )
        return refusedTopup('ledger_idempotency_conflict', false)
      return { kind: 'accepted' as const, command: topupCommandView(prior) }
    }
    const identity = await ctx.auth.getUserIdentity()
    const ownerAllowed = await ownerPrincipalAllowed(
      identity,
      args.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', args.principalId),
          )
          .unique(),
    )
    if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
    const principal = await ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (q) =>
        q.eq('principalId', args.principalId),
      )
      .unique()
    if (principal === null) return refusedTopup('billing_identity_missing', false)
    const requestedAmount = readAmount(args.amount)
    if (requestedAmount === undefined)
      return refusedTopup('credit_topup_amount_invalid', false)
    const expectedAccountRef = accountRefForOwner(
      principal.ownerId,
      requestedAmount.currency,
    )
    if (args.accountRef !== expectedAccountRef)
      return refusedTopup('billing_identity_mismatch', false)
    const legacyRefusal = await refuseIfLegacyPerKeyBalanceStranded(
      ctx,
      args.principalId,
      requestedAmount.currency,
    )
    if (legacyRefusal !== undefined)
      return refusedTopup(legacyRefusal.code, legacyRefusal.retryable)
    const existing = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', expectedAccountRef))
      .unique()
    if (
      existing !== null &&
      !canonicalMoneyAccountMatches(
        existing,
        {
          accountKind: 'operator_credit',
          accountId: principal.ownerId,
          currency: existing.currency,
          exponent: existing.exponent,
          now: 0,
        },
        expectedAccountRef,
      )
    )
      return refusedTopup('billing_identity_mismatch', false)
    const financials = calculateCreditTopupFinancials({
      amount: requestedAmount,
      accountCurrency: existing?.currency ?? requestedAmount.currency,
      accountExponent: existing?.exponent ?? requestedAmount.exponent,
      config: productionCreditTopupConfig(),
    })
    if (financials === undefined)
      return refusedTopup('credit_topup_amount_invalid', false)
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return refusedTopup(gate.code, false)
    const now = Date.now()
    const account =
      existing ??
      (await ensureCanonicalMoneyAccount(ctx, {
        accountKind: 'operator_credit',
        accountId: principal.ownerId,
        currency: financials.amount.currency,
        exponent: financials.amount.exponent,
        now,
      }))
    if (account === undefined)
      return refusedTopup('billing_identity_mismatch', false)
    const metadataDigest = canonicalDigest({ ae_command_ref: args.commandRef })
    const row = {
      commandRef: args.commandRef,
      principalId: args.principalId,
      accountRef: args.accountRef,
      currency: financials.amount.currency,
      exponent: financials.amount.exponent,
      amountUnits: financials.amount.units,
      processingFeeUnits: financials.processingFee.units,
      chargeAmountUnits: financials.chargeAmount.units,
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      successReturnRef: args.successReturnRef,
      providerRecoveryDeadlineAt: now + STRIPE_CREDIT_RECOVERY_WINDOW_MS,
      state: 'pending' as const,
      providerStatus: 'pending' as const,
      metadataDigest,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('moneyTopupCommands', row)
    return { kind: 'accepted' as const, command: row }
  },
})
export const markCreditTopupOutcomeUnknown = mutation({
  args: {
    commandRef: identifier,
    principalId: identifier,
    accountRef: identifier,
    amount: exactAmount,
    idempotencyKey: identifier,
    inputDigest: identifier,
    successReturnRef: identifier,
    providerRecoveryDeadlineAt: v.number(),
    externalRef: v.optional(identifier),
    ...billingSourceArgs,
  },
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    await requireBillingSourceWrite(ctx, args)
    const identity = await ctx.auth.getUserIdentity()
    const ownerAllowed = await ownerPrincipalAllowed(
      identity,
      args.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', args.principalId),
          )
          .unique(),
    )
    if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
    const command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
      .unique()
    if (command === null) return refusedTopup('credit_topup_pending', true)
    const requestedAmount = readAmount(args.amount)
    const commandAmount = amountFromParts(
      command.currency,
      command.amountUnits,
      command.exponent,
    )
    if (
      requestedAmount === undefined ||
      commandAmount === undefined ||
      compareExactAmounts(requestedAmount, commandAmount) !== 0 ||
      command.commandRef !== args.commandRef ||
      command.principalId !== args.principalId ||
      command.accountRef !== args.accountRef ||
      command.idempotencyKey !== args.idempotencyKey ||
      command.inputDigest !== args.inputDigest ||
      command.successReturnRef !== args.successReturnRef ||
      command.providerRecoveryDeadlineAt !== args.providerRecoveryDeadlineAt ||
      command.externalRef !== args.externalRef
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (command.state === 'failed')
      return refusedTopup('ledger_idempotency_conflict', false)
    if (command.state === 'succeeded' || command.state === 'outcome_unknown') {
      return { kind: 'accepted' as const, command: topupCommandView(command) }
    }
    const now = Date.now()
    await ctx.db.patch('moneyTopupCommands', command._id, {
      state: 'outcome_unknown',
      providerStatus: 'outcome_unknown',
      updatedAt: now,
    })
    const updated = await ctx.db.get(command._id)
    return updated === null
      ? refusedTopup('credit_topup_outcome_unknown', true)
      : { kind: 'accepted' as const, command: topupCommandView(updated) }
  },
})

export const bindCreditPaymentSession = mutation({
  args: {
    commandRef: identifier,
    evidence: topupProviderEvidenceArg,
    ...billingSourceArgs,
  },
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    await requireBillingSourceWrite(ctx, args)
    const command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
      .unique()
    if (command === null) return refusedTopup('credit_topup_pending', true)
    const evidenceAmount = readAmount(args.evidence.amount)
    const chargeAmount = amountFromParts(
      command.currency,
      command.chargeAmountUnits,
      command.exponent,
    )
    if (
      evidenceAmount === undefined ||
      chargeAmount === undefined ||
      compareExactAmounts(evidenceAmount, chargeAmount) !== 0
    )
      return refusedTopup('credit_topup_outcome_unknown', true)
    if (
      command.externalRef !== undefined &&
      command.externalRef !== args.evidence.externalRef
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.metadataDigest !== undefined &&
      command.metadataDigest !== args.evidence.metadataDigest
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.requestDigest !== undefined &&
      command.requestDigest !== args.evidence.requestDigest
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.paymentId !== undefined &&
      command.paymentId !== args.evidence.paymentId
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.checkoutSessionDigest !== undefined &&
      command.checkoutSessionDigest !== args.evidence.checkoutSessionDigest
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.paymentIntentDigest !== undefined &&
      command.paymentIntentDigest !== args.evidence.paymentIntentDigest
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (command.state === 'succeeded') {
      if (
        command.providerStatus !== 'succeeded' ||
        command.evidenceDigest !== args.evidence.evidenceDigest ||
        args.evidence.status !== 'succeeded'
      ) {
        return refusedTopup('ledger_idempotency_conflict', false)
      }
      return { kind: 'accepted' as const, command: topupCommandView(command) }
    }
    const now = Date.now()
    const patch = {
      externalRef: args.evidence.externalRef,
      providerStatus: args.evidence.status,
      providerEvidenceRef: args.evidence.evidenceRef,
      requestDigest: args.evidence.requestDigest,
      metadataDigest: args.evidence.metadataDigest,
      ...(args.evidence.paymentId === undefined
        ? {}
        : { paymentId: args.evidence.paymentId }),
      checkoutSessionDigest: args.evidence.checkoutSessionDigest,
      ...(args.evidence.paymentIntentDigest === undefined
        ? {}
        : { paymentIntentDigest: args.evidence.paymentIntentDigest }),
      evidenceDigest: args.evidence.evidenceDigest,
      updatedAt: now,
      ...(args.evidence.status === 'failed'
        ? { state: 'failed' as const }
        : args.evidence.status === 'outcome_unknown'
          ? { state: 'outcome_unknown' as const }
          : {}),
    }
    await ctx.db.patch('moneyTopupCommands', command._id, patch)
    const updated = await ctx.db.get(command._id)
    return updated === null
      ? refusedTopup('credit_topup_outcome_unknown', true)
      : { kind: 'accepted' as const, command: topupCommandView(updated) }
  },
})
export const readCreditTopupCommand = query({
  args: topupReadInputArg,
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    if ((args.externalRef === undefined) === (args.commandRef === undefined)) {
      return refusedTopup('payment_binding_invalid', false)
    }
    let command: Doc<'moneyTopupCommands'> | null
    if (args.externalRef !== undefined) {
      const externalRef = args.externalRef
      command = await ctx.db
        .query('moneyTopupCommands')
        .withIndex('by_externalRef', (q) => q.eq('externalRef', externalRef))
        .unique()
    } else {
      const commandRef = args.commandRef
      if (commandRef === undefined)
        return refusedTopup('payment_binding_invalid', false)
      command = await ctx.db
        .query('moneyTopupCommands')
        .withIndex('by_commandRef', (q) => q.eq('commandRef', commandRef))
        .unique()
    }
    if (command === null || command.idempotencyKey !== args.idempotencyKey)
      return refusedTopup('credit_topup_pending', true)
    const identity = await ctx.auth.getUserIdentity()
    const ownerAllowed = await ownerPrincipalAllowed(
      identity,
      command.principalId,
      async () =>
        await ctx.db
          .query('agentAccessPrincipals')
          .withIndex('by_principalId', (q) =>
            q.eq('principalId', command.principalId),
          )
          .unique(),
    )
    if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
    if (
      command.state === 'succeeded' &&
      (command.buyerBalanceBeforeUnits === undefined ||
        command.buyerBalanceAfterUnits === undefined)
    )
      return refusedTopup('credit_topup_outcome_unknown', false)
    return { kind: 'accepted' as const, command: topupCommandView(command) }
  },
})
async function topupWebhookLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion,
  commandRef: string,
  externalRef: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    key === undefined ||
    key.length < 32 ||
    !serviceAuth.scopes.includes(TOPUP_WEBHOOK_LOOKUP_SCOPE)
  )
    return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: TOPUP_WEBHOOK_LOOKUP_OPERATION,
    command: { commandRef, externalRef },
    assertion: serviceAuth,
  })
}

export const readCreditTopupWebhookCommand = query({
  args: {
    commandRef: identifier,
    externalRef: identifier,
    serviceAuth: serverFunctionAuth,
  },
  returns: topupCommandResultValue,
  handler: async (ctx, args) => {
    if (
      !(await topupWebhookLookupAuthorized(
        args.serviceAuth,
        args.commandRef,
        args.externalRef,
      ))
    )
      return refusedTopup('billing_identity_missing', false)
    const command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
      .unique()
    if (command === null) return refusedTopup('credit_topup_pending', true)
    if (
      command.externalRef !== undefined &&
      command.externalRef !== args.externalRef
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    return { kind: 'accepted' as const, command: topupCommandView(command) }
  },
})

export const applyCreditTopup = internalMutation({
  args: {
    event: stripeMoneyWebhookEventArg,
    readback: topupProviderEvidenceArg,
    ...billingSourceArgs,
  },
  returns: topupWebhookResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return refusedTopup(gate.code, false)
    await requireBillingSourceWrite(ctx, args)
    const event = args.event
    const priorEvent = await ctx.db
      .query('moneyStripeEvents')
      .withIndex('by_stripeEventId', (q) =>
        q.eq('stripeEventId', event.stripeEventId),
      )
      .unique()
    if (priorEvent !== null && !eventRowMatches(priorEvent, event))
      return refusedTopup('ledger_idempotency_conflict', false)
    if (event.kind === 'account') {
      if (priorEvent === null)
        await ctx.db.insert('moneyStripeEvents', {
          ...eventRowFields(event),
          status: 'ignored',
        })
      return {
        kind: 'accepted' as const,
        status:
          priorEvent === null ? ('ignored' as const) : ('replayed' as const),
      }
    }
    if (
      event.externalRef !== event.sessionId ||
      (event.eventType === 'checkout.session.expired' &&
        event.status !== 'expired') ||
      (event.eventType === 'checkout.session.async_payment_failed' &&
        event.status !== 'failed') ||
      (event.eventType === 'checkout.session.async_payment_succeeded' &&
        event.status !== 'paid') ||
      (event.eventType === 'checkout.session.completed' &&
        event.status !== 'paid' &&
        event.status !== 'failed')
    )
      return refusedTopup('payment_binding_invalid', false)
    const command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', event.commandRef))
      .unique()
    if (command === null) return refusedTopup('credit_topup_pending', true)
    const readbackStatusValid =
      event.status === 'paid'
        ? args.readback.status === 'succeeded'
        : event.status === 'expired'
          ? args.readback.status === 'failed'
          : args.readback.status !== 'succeeded'
    const commandPaymentIdMatches =
      command.paymentId === undefined ||
      command.paymentId === args.readback.paymentId
    const commandPaymentDigestMatches =
      command.paymentIntentDigest === undefined ||
      command.paymentIntentDigest === args.readback.paymentIntentDigest
    const commandRequestDigestMatches =
      command.requestDigest === undefined ||
      command.requestDigest === args.readback.requestDigest
    const commandCheckoutSessionDigestMatches =
      command.checkoutSessionDigest === undefined ||
      command.checkoutSessionDigest === args.readback.checkoutSessionDigest
    const frozenTerminalMatches =
      command.state !== 'succeeded' ||
      (command.providerStatus === 'succeeded' &&
        command.evidenceDigest === args.readback.evidenceDigest &&
        args.readback.status === 'succeeded')
    if (
      !readbackStatusValid ||
      args.readback.externalRef !== event.sessionId ||
      compareExactAmounts(args.readback.amount, event.amount) !== 0 ||
      args.readback.paymentId !== event.paymentId ||
      args.readback.checkoutSessionDigest !== event.checkoutSessionDigest ||
      args.readback.paymentIntentDigest !== event.paymentIntentDigest ||
      args.readback.metadataDigest !== event.metadataDigest ||
      !frozenTerminalMatches
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      !commandRequestDigestMatches ||
      command.metadataDigest !== args.readback.metadataDigest ||
      !commandCheckoutSessionDigestMatches ||
      !commandPaymentDigestMatches ||
      !commandPaymentIdMatches
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (
      command.externalRef !== undefined &&
      command.externalRef !== event.externalRef
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    const commandAmount = amountFromParts(
      command.currency,
      command.amountUnits,
      command.exponent,
    )
    const chargeAmount = amountFromParts(
      command.currency,
      command.chargeAmountUnits,
      command.exponent,
    )
    if (
      commandAmount === undefined ||
      chargeAmount === undefined ||
      compareExactAmounts(chargeAmount, event.amount) !== 0 ||
      event.amount.currency !== command.currency ||
      command.metadataDigest !== event.metadataDigest
    ) {
      return refusedTopup('payment_binding_invalid', false)
    }
    if (priorEvent?.status === 'applied') {
      if (
        command.buyerBalanceBeforeUnits === undefined ||
        command.buyerBalanceAfterUnits === undefined
      )
        return refusedTopup('credit_topup_outcome_unknown', false)
      return {
        kind: 'accepted' as const,
        status: 'replayed' as const,
        ...(priorEvent.appliedRef === undefined
          ? {}
          : { appliedRef: priorEvent.appliedRef }),
      }
    }
    if (priorEvent?.status === 'ignored')
      return { kind: 'accepted' as const, status: 'replayed' as const }
    const boundPatch = {
      externalRef: event.externalRef,
      providerStatus:
        event.status === 'paid' ? ('succeeded' as const) : ('failed' as const),
      providerEvidenceRef: args.readback.evidenceRef,
      requestDigest: args.readback.requestDigest,
      metadataDigest: event.metadataDigest,
      checkoutSessionDigest: args.readback.checkoutSessionDigest,
      evidenceDigest: args.readback.evidenceDigest,
      ...(args.readback.paymentId === undefined
        ? {}
        : { paymentId: args.readback.paymentId }),
      ...(args.readback.paymentIntentDigest === undefined
        ? {}
        : { paymentIntentDigest: args.readback.paymentIntentDigest }),
      updatedAt: event.observedAt,
    }
    if (event.status !== 'paid') {
      if (command.state !== 'succeeded')
        await ctx.db.patch('moneyTopupCommands', command._id, {
          ...boundPatch,
          state: 'failed' as const,
        })
      if (priorEvent === null)
        await ctx.db.insert('moneyStripeEvents', {
          ...eventRowFields(event),
          status: 'ignored',
        })
      else
        await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
          status: 'ignored',
        })
      return { kind: 'accepted' as const, status: 'ignored' as const }
    }
    const priorTransaction = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', command.idempotencyKey),
      )
      .unique()
    if (priorTransaction !== null) {
      const priorEntry = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', priorTransaction.transactionRef),
        )
        .unique()
      const priorAmount =
        priorEntry === null ? undefined : entryAmount(priorEntry)
      if (
        priorTransaction.kind !== 'topup' ||
        priorTransaction.inputDigest !== command.inputDigest ||
        priorTransaction.principalId !== command.principalId ||
        priorEntry === null ||
        priorEntry.accountRef !== command.accountRef ||
        priorAmount === undefined ||
        compareExactAmounts(priorAmount, commandAmount) !== 0 ||
        command.buyerBalanceBeforeUnits === undefined ||
        command.buyerBalanceAfterUnits === undefined
      )
        return refusedTopup('credit_topup_outcome_unknown', false)
      if (command.state === 'succeeded') {
        if (
          command.appliedTransactionRef !== priorTransaction.transactionRef ||
          command.appliedStripeEventId === undefined ||
          command.appliedPayloadDigest === undefined
        )
          return refusedTopup('credit_topup_outcome_unknown', false)
        if (priorEvent === null)
          await ctx.db.insert('moneyStripeEvents', {
            ...eventRowFields(event),
            status: 'applied',
            appliedRef: priorTransaction.transactionRef,
            appliedAt: event.observedAt,
          })
        return {
          kind: 'accepted' as const,
          status: 'replayed' as const,
          appliedRef: priorTransaction.transactionRef,
        }
      }
      await ctx.db.patch('moneyTopupCommands', command._id, {
        ...boundPatch,
        state: 'succeeded',
        buyerBalanceBeforeUnits: command.buyerBalanceBeforeUnits,
        buyerBalanceAfterUnits: command.buyerBalanceAfterUnits,
        appliedStripeEventId: event.stripeEventId,
        appliedPayloadDigest: event.payloadDigest,
        appliedTransactionRef: priorTransaction.transactionRef,
      })
      if (priorEvent === null)
        await ctx.db.insert('moneyStripeEvents', {
          ...eventRowFields(event),
          status: 'applied',
          appliedRef: priorTransaction.transactionRef,
          appliedAt: event.observedAt,
        })
      else
        await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
          status: 'applied',
          appliedRef: priorTransaction.transactionRef,
          appliedAt: event.observedAt,
        })
      return {
        kind: 'accepted' as const,
        status: 'replayed' as const,
        appliedRef: priorTransaction.transactionRef,
      }
    }
    const account = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', command.accountRef))
      .unique()
    const accountDomain = account === null ? undefined : accountFromRow(account)
    const accountAmount =
      account === null || accountDomain === undefined
        ? undefined
        : amountAtScale(commandAmount, account.currency, account.exponent)
    if (
      account === null ||
      accountDomain === undefined ||
      accountAmount === undefined ||
      account.accountKind !== 'operator_credit' ||
      account.accountId === undefined ||
      account.currency !== command.currency
    )
      return refusedTopup('currency_mismatch', false)
    const principal = await ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (q) =>
        q.eq('principalId', command.principalId),
      )
      .unique()
    if (principal === null || principal.ownerId !== account.accountId)
      return refusedTopup('billing_identity_mismatch', false)
    const nextBalance = addExactAmounts(accountDomain.balance, accountAmount)
    if (nextBalance === undefined)
      return refusedTopup('credit_topup_amount_invalid', false)
    const transactionRef = canonicalDigest({
      format: 'money-topup-transaction:v1',
      commandRef: command.commandRef,
    })
    const transaction = {
      transactionRef,
      kind: 'topup' as const,
      idempotencyKey: command.idempotencyKey,
      inputDigest: command.inputDigest,
      principalId: command.principalId,
      accountId: account.accountId,
      currency: accountAmount.currency,
      amountUnits: accountAmount.units,
      exponent: accountAmount.exponent,
      state: 'applied' as const,
      expectedAccountVersion: account.version,
      externalRef: event.externalRef,
      createdAt: event.observedAt,
      updatedAt: event.observedAt,
    }
    await ctx.db.insert('moneyLedgerEntries', {
      entryRef: `${transactionRef}:topup`,
      accountRef: account.accountRef,
      entryType: 'topup',
      direction: 'credit',
      amountUnits: accountAmount.units,
      currency: accountAmount.currency,
      exponent: accountAmount.exponent,
      transactionRef,
      idempotencyKey: command.idempotencyKey,
      principalId: command.principalId,
      sourceDigest: event.payloadDigest,
      evidenceRefs: [
        `stripe:event:${event.stripeEventId}`,
        `stripe:session:${event.sessionId}`,
        `stripe:metadata:${event.metadataDigest}`,
      ],
      createdAt: event.observedAt,
    })
    await ctx.db.patch('moneyAccounts', account._id, {
      balanceUnits: nextBalance.units,
      version: account.version + 1,
      updatedAt: event.observedAt,
    })
    await ctx.db.insert('moneyTransactions', transaction)
    await ctx.db.patch('moneyTopupCommands', command._id, {
      ...boundPatch,
      state: 'succeeded',
      buyerBalanceBeforeUnits: account.balanceUnits,
      buyerBalanceAfterUnits: nextBalance.units,
      appliedStripeEventId: event.stripeEventId,
      appliedPayloadDigest: event.payloadDigest,
      appliedTransactionRef: transactionRef,
    })
    if (priorEvent === null)
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'applied',
        appliedRef: transactionRef,
        appliedAt: event.observedAt,
      })
    else
      await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
        status: 'applied',
        appliedRef: transactionRef,
        appliedAt: event.observedAt,
      })
    return {
      kind: 'accepted' as const,
      status: 'applied' as const,
      appliedRef: transactionRef,
    }
  },
})

export const applyVerifiedStripeEvent = action({
  args: {
    event: stripeMoneyWebhookEventArg,
    readback: topupProviderEvidenceArg,
    ...billingSourceArgs,
  },
  returns: topupWebhookResultValue,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof topupWebhookResultValue>> => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return refusedTopup(gate.code, false)
    return await ctx.runMutation(internal.moneyLedger.applyCreditTopup, args)
  },
})
const connectAccountViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  state: v.union(
    v.literal('not_started'),
    v.literal('onboarding_started'),
    v.literal('submitted'),
    v.literal('restricted'),
    v.literal('ready'),
  ),
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: v.optional(identifier),
  lastStripePayloadDigest: v.optional(identifier),
  providerObjectVersion: v.optional(v.number()),
  lastStripeObservedAt: v.optional(v.number()),
  version: v.optional(v.number()),
  lastStripeEventId: v.optional(identifier),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const payoutBindingViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  lastStripeEventId: v.optional(identifier),
  version: v.optional(v.number()),
})
const connectAccountResultValue = v.union(
  v.object({ kind: v.literal('accepted'), account: connectAccountViewValue }),
  moneyRefusalValue,
)
const connectAccountCommandValue = v.object({
  commandRef: identifier,
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  providerRecoveryDeadlineAt: v.number(),
  recoveryLeaseGeneration: v.number(),
  recoveryLeaseOwner: v.optional(identifier),
  recoveryLeaseExpiresAt: v.optional(v.number()),
  state: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  stripeAccountId: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  failureCode: v.optional(identifier),
  failureRetryable: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const connectAccountReservationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    command: connectAccountCommandValue,
    execute: v.boolean(),
  }),
  moneyRefusalValue,
)
const connectAccountFinalizeOutcomeArg = v.union(
  v.object({
    state: v.literal('succeeded'),
    stripeAccountId: identifier,
    providerEvidenceRef: identifier,
  }),
  v.object({
    state: v.union(v.literal('failed'), v.literal('outcome_unknown')),
    failureCode: identifier,
    failureRetryable: v.boolean(),
  }),
)
const connectAccountReadbackArg = v.object({
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  restricted: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: identifier,
  providerObjectVersion: v.optional(v.number()),
  observedAt: v.number(),
})
const payoutTransferEvidenceArg = v.union(
  v.object({
    provider: v.literal('stripe'),
    transferId: identifier,
    destinationAccountId: identifier,
    amount: exactAmount,
    status: v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
    requestDigest: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  }),
  v.object({
    provider: v.literal('stripe'),
    resolution: v.literal('not_released'),
    destinationAccountId: identifier,
    amount: exactAmount,
    status: v.literal('failed'),
    requestDigest: identifier,
    evidenceDigest: identifier,
    observedAt: v.number(),
  }),
)
const payoutTransferStateValue = v.union(
  v.literal('review'),
  v.literal('held_kyc'),
  v.literal('held_threshold'),
  v.literal('transfer_pending'),
  v.literal('paid'),
  v.literal('reversed'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
const payoutTransferValue = v.object({
  payoutCommandId: identifier,
  state: payoutTransferStateValue,
  idempotencyKey: identifier,
  inputDigest: identifier,
  amount: exactAmount,
  destinationAccountId: identifier,
  stripeTransferId: v.optional(identifier),
  transferStatus: v.optional(
    v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
  ),
  requestDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  providerRecoveryDeadlineAt: v.optional(v.number()),
  providerHeldBefore: v.optional(exactAmount),
  providerHeldAfter: v.optional(exactAmount),
  providerPaidBefore: v.optional(exactAmount),
  providerPaidAfter: v.optional(exactAmount),
})
const payoutTransferResultValue = v.union(
  v.object({ kind: v.literal('accepted'), transfer: payoutTransferValue }),
  moneyRefusalValue,
)
function payoutAccountDomain(row: Doc<'moneyPayoutAccounts'>) {
  return {
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    stripeAccountId: row.stripeAccountId,
    state: row.state,
    detailsSubmitted: row.detailsSubmitted,
    recipientCapabilityActive: row.recipientCapabilityActive,
    requirementsDigest: row.requirementsDigest,
    ...(row.providerObjectDigest === undefined
      ? {}
      : { providerObjectDigest: row.providerObjectDigest }),
    ...(row.lastStripePayloadDigest === undefined
      ? {}
      : { lastStripePayloadDigest: row.lastStripePayloadDigest }),
    ...(row.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: row.providerObjectVersion }),
    ...(row.lastStripeObservedAt === undefined
      ? {}
      : { lastStripeObservedAt: row.lastStripeObservedAt }),
    ...(row.version === undefined ? {} : { version: row.version }),
    ...(row.lastStripeEventId === undefined
      ? {}
      : { lastStripeEventId: row.lastStripeEventId }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
function connectAccountCommandView(row: Doc<'moneyConnectAccountCommands'>) {
  return {
    commandRef: row.commandRef,
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    providerRequestDigest: row.providerRequestDigest,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    recoveryLeaseGeneration: row.recoveryLeaseGeneration,
    ...(row.recoveryLeaseOwner === undefined
      ? {}
      : { recoveryLeaseOwner: row.recoveryLeaseOwner }),
    ...(row.recoveryLeaseExpiresAt === undefined
      ? {}
      : { recoveryLeaseExpiresAt: row.recoveryLeaseExpiresAt }),
    state: row.state,
    ...(row.stripeAccountId === undefined
      ? {}
      : { stripeAccountId: row.stripeAccountId }),
    ...(row.providerEvidenceRef === undefined
      ? {}
      : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    ...(row.failureRetryable === undefined
      ? {}
      : { failureRetryable: row.failureRetryable }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const reserveConnectAccount = mutation({
  args: {
    businessId: identifier,
    currency: identifier,
    exponent: v.number(),
    idempotencyKey: identifier,
    commandRef: identifier,
    inputDigest: identifier,
    providerRequestDigest: identifier,
    recoveryLeaseOwner: identifier,
    ...billingSourceArgs,
  },
  returns: connectAccountReservationResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    const now = Date.now()
    const [binding, commands, sameKey] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .unique(),
      ctx.db
        .query('moneyConnectAccountCommands')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .take(21),
      ctx.db
        .query('moneyConnectAccountCommands')
        .withIndex('by_businessId_and_currency_and_idempotencyKey', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', args.currency)
            .eq('idempotencyKey', args.idempotencyKey),
        )
        .unique(),
    ])
    if (
      sameKey !== null &&
      (sameKey.commandRef !== args.commandRef ||
        sameKey.inputDigest !== args.inputDigest ||
        sameKey.providerRequestDigest !== args.providerRequestDigest ||
        sameKey.exponent !== args.exponent)
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (binding !== null) {
      if (
        sameKey !== null &&
        sameKey.state === 'succeeded' &&
        sameKey.stripeAccountId === binding.stripeAccountId
      ) {
        return {
          kind: 'accepted' as const,
          command: connectAccountCommandView(sameKey),
          execute: false,
        }
      }
      return refusedTopup('payment_binding_invalid', false)
    }
    const leaseExpiresAt = now + STRIPE_CONNECT_RECOVERY_LEASE_MS
    if (sameKey !== null) {
      if (sameKey.state === 'succeeded') {
        return {
          kind: 'accepted' as const,
          command: connectAccountCommandView(sameKey),
          execute: false,
        }
      }
      if (sameKey.state === 'failed') {
        const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
        await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
          state: 'pending',
          recoveryLeaseOwner: args.recoveryLeaseOwner,
          recoveryLeaseGeneration,
          recoveryLeaseExpiresAt: leaseExpiresAt,
          failureCode: undefined,
          failureRetryable: undefined,
          updatedAt: now,
        })
        const updated = await ctx.db.get(sameKey._id)
        return updated === null
          ? refusedTopup('payout_reconciliation_required', false)
          : {
              kind: 'accepted' as const,
              command: connectAccountCommandView(updated),
              execute: true,
            }
      }
      if (now >= sameKey.providerRecoveryDeadlineAt) {
        if (
          sameKey.state !== 'outcome_unknown' ||
          sameKey.failureCode !== 'payout_reconciliation_required' ||
          sameKey.failureRetryable !== false ||
          sameKey.recoveryLeaseOwner !== undefined ||
          sameKey.recoveryLeaseExpiresAt !== undefined
        ) {
          await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
            state: 'outcome_unknown',
            failureCode: 'payout_reconciliation_required',
            failureRetryable: false,
            recoveryLeaseOwner: undefined,
            recoveryLeaseExpiresAt: undefined,
            updatedAt: now,
          })
        }
        const updated = await ctx.db.get(sameKey._id)
        return updated === null
          ? refusedTopup('payout_reconciliation_required', false)
          : {
              kind: 'accepted' as const,
              command: connectAccountCommandView(updated),
              execute: false,
            }
      }
      if (
        sameKey.recoveryLeaseOwner !== undefined &&
        sameKey.recoveryLeaseExpiresAt !== undefined &&
        sameKey.recoveryLeaseExpiresAt > now
      ) {
        return {
          kind: 'accepted' as const,
          command: connectAccountCommandView(sameKey),
          execute: false,
        }
      }
      const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
      await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
        state: 'pending',
        recoveryLeaseOwner: args.recoveryLeaseOwner,
        recoveryLeaseGeneration,
        recoveryLeaseExpiresAt: leaseExpiresAt,
        failureCode: undefined,
        failureRetryable: undefined,
        updatedAt: now,
      })
      const updated = await ctx.db.get(sameKey._id)
      return updated === null
        ? refusedTopup('payout_reconciliation_required', false)
        : {
            kind: 'accepted' as const,
            command: connectAccountCommandView(updated),
            execute: true,
          }
    }
    if (
      commands.length > 20 ||
      commands.some((command) => command.state !== 'failed')
    ) {
      return refusedTopup('payout_reconciliation_required', false)
    }
    const row = {
      commandRef: args.commandRef,
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      providerRequestDigest: args.providerRequestDigest,
      providerRecoveryDeadlineAt: now + STRIPE_CONNECT_RECOVERY_WINDOW_MS,
      recoveryLeaseGeneration: 1,
      recoveryLeaseOwner: args.recoveryLeaseOwner,
      recoveryLeaseExpiresAt: leaseExpiresAt,
      state: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('moneyConnectAccountCommands', row)
    return { kind: 'accepted' as const, command: row, execute: true }
  },
})

export const finalizeConnectAccount = mutation({
  args: {
    businessId: identifier,
    currency: identifier,
    exponent: v.number(),
    idempotencyKey: identifier,
    commandRef: identifier,
    inputDigest: identifier,
    providerRequestDigest: identifier,
    recoveryLeaseOwner: identifier,
    recoveryLeaseGeneration: v.number(),
    outcome: connectAccountFinalizeOutcomeArg,
    ...billingSourceArgs,
  },
  returns: connectAccountReservationResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    const command = await ctx.db
      .query('moneyConnectAccountCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
      .unique()
    if (
      command === null ||
      command.businessId !== args.businessId ||
      command.currency !== args.currency ||
      command.exponent !== args.exponent ||
      command.idempotencyKey !== args.idempotencyKey ||
      command.inputDigest !== args.inputDigest ||
      command.providerRequestDigest !== args.providerRequestDigest
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    const outcome = args.outcome
    if (command.state !== 'pending') {
      const sameOutcome =
        outcome.state === 'succeeded'
          ? command.state === 'succeeded' &&
            command.stripeAccountId === outcome.stripeAccountId &&
            command.providerEvidenceRef === outcome.providerEvidenceRef
          : command.state === outcome.state &&
            command.failureCode === outcome.failureCode &&
            command.failureRetryable === outcome.failureRetryable
      return sameOutcome
        ? {
            kind: 'accepted' as const,
            command: connectAccountCommandView(command),
            execute: false,
          }
        : refusedTopup('ledger_idempotency_conflict', false)
    }
    const now = Date.now()
    const outcomeStripeAccountId =
      outcome.state === 'succeeded' ? outcome.stripeAccountId : undefined
    const outcomeProviderEvidenceRef =
      outcome.state === 'succeeded' ? outcome.providerEvidenceRef : undefined
    const retainUnboundProviderOutcome = async () => {
      await ctx.db.patch('moneyConnectAccountCommands', command._id, {
        state: 'outcome_unknown',
        stripeAccountId: outcomeStripeAccountId ?? command.stripeAccountId,
        providerEvidenceRef:
          outcomeProviderEvidenceRef ?? command.providerEvidenceRef,
        failureCode: 'payout_reconciliation_required',
        failureRetryable: false,
        recoveryLeaseOwner: undefined,
        recoveryLeaseExpiresAt: undefined,
        updatedAt: now,
      })
      return refusedTopup('payout_reconciliation_required', false)
    }
    if (
      command.recoveryLeaseOwner !== args.recoveryLeaseOwner ||
      command.recoveryLeaseGeneration !== args.recoveryLeaseGeneration ||
      command.recoveryLeaseExpiresAt === undefined ||
      now >= command.recoveryLeaseExpiresAt
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    if (now >= command.providerRecoveryDeadlineAt)
      return refusedTopup('payout_reconciliation_required', false)
    if (outcome.state === 'succeeded') {
      const stripeAccountId = outcome.stripeAccountId
      const providerEvidenceRef = outcome.providerEvidenceRef
      const [current, stripeBindings] = await Promise.all([
        ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q.eq('businessId', args.businessId).eq('currency', args.currency),
          )
          .unique(),
        ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_stripeAccountId', (q) =>
            q.eq('stripeAccountId', stripeAccountId),
          )
          .take(2),
      ])
      if (
        stripeBindings.some(
          (binding) =>
            binding.businessId !== args.businessId ||
            binding.currency !== args.currency,
        ) ||
        stripeBindings.length > 1 ||
        (current !== null && current.stripeAccountId !== stripeAccountId)
      )
        return await retainUnboundProviderOutcome()
      const transition = transitionPayoutAccount({
        ...(current === null ? {} : { current: payoutAccountDomain(current) }),
        businessId: args.businessId,
        currency: args.currency,
        exponent: args.exponent,
        stripeAccountId,
        event: { kind: 'onboarding_started', observedAt: now },
      })
      if (transition.kind === 'refused')
        return await retainUnboundProviderOutcome()
      if (current === null)
        await ctx.db.insert('moneyPayoutAccounts', transition.value)
      else
        await ctx.db.patch('moneyPayoutAccounts', current._id, transition.value)
      await ctx.db.patch('moneyConnectAccountCommands', command._id, {
        state: 'succeeded',
        stripeAccountId,
        providerEvidenceRef,
        failureCode: undefined,
        failureRetryable: undefined,
        recoveryLeaseOwner: undefined,
        recoveryLeaseExpiresAt: undefined,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch('moneyConnectAccountCommands', command._id, {
        state: outcome.state,
        failureCode: outcome.failureCode,
        failureRetryable: outcome.failureRetryable,
        recoveryLeaseOwner: undefined,
        recoveryLeaseExpiresAt: undefined,
        updatedAt: now,
      })
    }
    const updated = await ctx.db.get(command._id)
    return updated === null
      ? refusedTopup('payout_reconciliation_required', false)
      : {
          kind: 'accepted' as const,
          command: connectAccountCommandView(updated),
          execute: false,
        }
  },
})

export const bindConnectAccount = mutation({
  args: {
    businessId: identifier,
    currency: identifier,
    exponent: v.number(),
    stripeAccountId: identifier,
    observedAt: v.number(),
    ...billingSourceArgs,
  },
  returns: connectAccountResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    const [current, stripeBindings] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_stripeAccountId', (q) =>
          q.eq('stripeAccountId', args.stripeAccountId),
        )
        .take(2),
    ])
    if (
      stripeBindings.some(
        (binding) =>
          binding.businessId !== args.businessId ||
          binding.currency !== args.currency,
      ) ||
      stripeBindings.length > 1
    )
      return refusedTopup('payment_binding_invalid', false)
    if (current !== null && current.stripeAccountId !== args.stripeAccountId)
      return refusedTopup('payment_binding_invalid', false)
    const transition = transitionPayoutAccount({
      ...(current === null ? {} : { current: payoutAccountDomain(current) }),
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      stripeAccountId: args.stripeAccountId,
      event: { kind: 'onboarding_started', observedAt: args.observedAt },
    })
    if (transition.kind === 'refused') return transition
    const value = transition.value
    if (current === null) {
      await ctx.db.insert('moneyPayoutAccounts', value)
    } else {
      await ctx.db.patch('moneyPayoutAccounts', current._id, value)
    }
    const updated =
      current === null
        ? await ctx.db
            .query('moneyPayoutAccounts')
            .withIndex('by_businessId_and_currency', (q) =>
              q.eq('businessId', args.businessId).eq('currency', args.currency),
            )
            .unique()
        : await ctx.db.get(current._id)
    return updated === null
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, account: payoutAccountView(updated) }
  },
})

async function payoutBindingLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  stripeAccountId: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    serviceAuth === undefined ||
    key === undefined ||
    key.length < 32 ||
    !serviceAuth.scopes.includes(PAYOUT_BINDING_LOOKUP_SCOPE)
  )
    return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: PAYOUT_BINDING_LOOKUP_OPERATION,
    command: { stripeAccountId },
    assertion: serviceAuth,
  })
}

export const readPayoutAccountByStripeId = query({
  args: {
    stripeAccountId: identifier,
    serviceAuth: v.optional(serverFunctionAuth),
  },
  returns: v.array(payoutBindingViewValue),
  handler: async (ctx, args) => {
    if (
      !(await payoutBindingLookupAuthorized(
        args.serviceAuth,
        args.stripeAccountId,
      ))
    )
      return []
    return (
      await ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_stripeAccountId', (q) =>
          q.eq('stripeAccountId', args.stripeAccountId),
        )
        .take(20)
    ).map(
      ({
        businessId,
        currency,
        exponent,
        stripeAccountId,
        lastStripeEventId,
        version,
      }) => ({
        businessId,
        currency,
        exponent,
        stripeAccountId,
        ...(lastStripeEventId === undefined ? {} : { lastStripeEventId }),
        ...(version === undefined ? {} : { version }),
      }),
    )
  },
})
export const readOwnerPayoutAccount = query({
  args: { businessId: identifier, currency: identifier },
  returns: v.union(connectAccountViewValue, v.null()),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const owner = await ctx.db
      .query('owners')
      .withIndex('by_clerkUserId', (q) =>
        q.eq('clerkUserId', actor.clerkUserId),
      )
      .unique()
    if (owner === null) return null
    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .take(20)
    if (
      !businesses.some((business) => String(business._id) === args.businessId)
    )
      return null
    const account = await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique()
    return account === null ? null : payoutAccountView(account)
  },
})
export const readOwnerPayoutTransfer = query({
  args: {
    businessId: identifier,
    currency: identifier,
    payoutRef: identifier,
    idempotencyKey: identifier,
  },
  returns: payoutTransferResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner')
      return refusedTopup('billing_identity_missing', false)
    const owner = await ctx.db
      .query('owners')
      .withIndex('by_clerkUserId', (q) =>
        q.eq('clerkUserId', actor.clerkUserId),
      )
      .unique()
    if (owner === null) return refusedTopup('billing_identity_missing', false)
    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .take(20)
    if (
      !businesses.some((business) => String(business._id) === args.businessId)
    )
      return refusedTopup('billing_identity_missing', false)
    const payout = await ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
      .unique()
    if (
      payout === null ||
      payout.businessId !== args.businessId ||
      payout.currency !== args.currency ||
      payout.idempotencyKey !== args.idempotencyKey
    )
      return refusedTopup('payout_not_ready', false)
    const transfer = payoutTransferView(payout)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  },
})

export const recordConnectAccountEvent = mutation({
  args: {
    businessId: identifier,
    currency: identifier,
    exponent: v.number(),
    event: accountUpdatedEventArg,
    readback: connectAccountReadbackArg,
    expectedVersion: v.optional(v.number()),
    ...billingSourceArgs,
  },
  returns: connectAccountResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    const event = args.event
    if (event.externalRef !== event.stripeAccountId)
      return refusedTopup('payment_binding_invalid', false)
    if (
      event.providerObjectVersion !== undefined &&
      args.readback.providerObjectVersion !== undefined &&
      event.providerObjectVersion !== args.readback.providerObjectVersion
    )
      return refusedTopup('payout_reconciliation_required', false)
    const priorEvent = await ctx.db
      .query('moneyStripeEvents')
      .withIndex('by_stripeEventId', (q) =>
        q.eq('stripeEventId', event.stripeEventId),
      )
      .unique()
    if (priorEvent !== null && !eventRowMatches(priorEvent, event))
      return refusedTopup('ledger_idempotency_conflict', false)
    const [account, stripeBindings] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_stripeAccountId', (q) =>
          q.eq('stripeAccountId', event.stripeAccountId),
        )
        .take(2),
    ])
    if (
      stripeBindings.some(
        (binding) =>
          binding.businessId !== args.businessId ||
          binding.currency !== args.currency,
      ) ||
      stripeBindings.length > 1
    )
      return refusedTopup('payment_binding_invalid', false)
    if (account !== null && account.stripeAccountId !== event.stripeAccountId)
      return refusedTopup('payment_binding_invalid', false)
    if (
      account !== null &&
      account.lastStripeEventId === event.stripeEventId &&
      account.lastStripePayloadDigest === event.payloadDigest &&
      account.providerObjectDigest === args.readback.providerObjectDigest
    )
      return { kind: 'accepted' as const, account: payoutAccountView(account) }
    const currentVersion = account?.version ?? 0
    if (
      args.expectedVersion !== undefined &&
      args.expectedVersion !== currentVersion
    )
      return refusedTopup('payout_reconciliation_required', false)
    if (account !== null) {
      if (
        account.providerObjectVersion !== undefined &&
        event.providerObjectVersion !== undefined &&
        event.providerObjectVersion < account.providerObjectVersion
      )
        return refusedTopup('payout_reconciliation_required', false)
      if (
        account.lastStripeObservedAt !== undefined &&
        event.observedAt <= account.lastStripeObservedAt
      )
        return refusedTopup('payout_reconciliation_required', false)
    }
    const transition = transitionPayoutAccount({
      ...(account === null ? {} : { current: payoutAccountDomain(account) }),
      businessId: args.businessId,
      currency: args.currency,
      exponent: account?.exponent ?? args.exponent,
      stripeAccountId: event.stripeAccountId,
      event: {
        kind: 'status',
        detailsSubmitted: args.readback.detailsSubmitted,
        recipientCapabilityActive: args.readback.recipientCapabilityActive,
        restricted: args.readback.restricted,
        requirementsDigest: args.readback.requirementsDigest,
        stripeEventId: event.stripeEventId,
        payloadDigest: event.payloadDigest,
        providerObjectDigest: args.readback.providerObjectDigest,
        observedAt: event.observedAt,
      },
    })
    if (transition.kind === 'refused') return transition
    const value = transition.value
    const nextRow = {
      ...value,
      ...(event.providerObjectVersion === undefined
        ? {}
        : { providerObjectVersion: event.providerObjectVersion }),
    }
    if (account === null) await ctx.db.insert('moneyPayoutAccounts', nextRow)
    else await ctx.db.patch('moneyPayoutAccounts', account._id, nextRow)
    const appliedRef = canonicalDigest({
      format: 'money-connect-account-binding:v1',
      businessId: args.businessId,
      currency: args.currency,
      stripeAccountId: event.stripeAccountId,
    })
    if (priorEvent === null)
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'applied',
        appliedRef,
        appliedAt: event.observedAt,
      })
    else
      await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
        status: 'applied',
        appliedRef,
        appliedAt: event.observedAt,
      })
    const updated =
      account === null
        ? await ctx.db
            .query('moneyPayoutAccounts')
            .withIndex('by_businessId_and_currency', (q) =>
              q.eq('businessId', args.businessId).eq('currency', args.currency),
            )
            .unique()
        : await ctx.db.get(account._id)
    return updated === null
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, account: payoutAccountView(updated) }
  },
})
type PayoutTransferRowInput = Readonly<{
  providerAccountRef: string
  destinationAccountId: string
  commandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  state:
    | 'review'
    | 'held_kyc'
    | 'held_threshold'
    | 'transfer_pending'
    | 'paid'
    | 'reversed'
    | 'failed'
    | 'outcome_unknown'
  transferStatus:
    'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
  stripeTransferId?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  observedAt?: number
  providerRecoveryDeadlineAt?: number
  failureCode?: string
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}>

function payoutTransferView(row: Doc<'moneyPayouts'>) {
  const amount = amountFromParts(
    row.currency,
    row.providerNetUnits,
    row.exponent,
  )
  const providerHeldBefore =
    row.providerHeldBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldBeforeUnits, row.exponent)
  const providerHeldAfter =
    row.providerHeldAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerHeldAfterUnits, row.exponent)
  const providerPaidBefore =
    row.providerPaidBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidBeforeUnits, row.exponent)
  const providerPaidAfter =
    row.providerPaidAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.providerPaidAfterUnits, row.exponent)
  if (
    amount === undefined ||
    row.payoutCommandId === undefined ||
    row.inputDigest === undefined ||
    row.destinationAccountId === undefined ||
    ((row.state === 'paid' || row.state === 'reversed') &&
      (providerHeldBefore === undefined ||
        providerHeldAfter === undefined ||
        providerPaidBefore === undefined ||
        providerPaidAfter === undefined))
  )
    return undefined
  return {
    payoutRef: row.payoutRef,
    payoutCommandId: row.payoutCommandId,
    state: row.state,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    amount,
    destinationAccountId: row.destinationAccountId,
    ...(row.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: row.stripeTransferId }),
    ...(row.transferStatus === undefined
      ? {}
      : { transferStatus: row.transferStatus }),
    ...(row.transferRequestDigest === undefined
      ? {}
      : { requestDigest: row.transferRequestDigest }),
    ...((row.transferReversalEvidenceDigest ?? row.transferEvidenceDigest) ===
    undefined
      ? {}
      : {
          evidenceDigest:
            row.transferReversalEvidenceDigest ?? row.transferEvidenceDigest,
        }),
    ...(row.transferReversalEvidenceDigest === undefined
      ? {}
      : { reversalEvidenceDigest: row.transferReversalEvidenceDigest }),
    ...(row.providerRecoveryDeadlineAt === undefined
      ? {}
      : { providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt }),
    ...(providerHeldBefore === undefined ? {} : { providerHeldBefore }),
    ...(providerHeldAfter === undefined ? {} : { providerHeldAfter }),
    ...(providerPaidBefore === undefined ? {} : { providerPaidBefore }),
    ...(providerPaidAfter === undefined ? {} : { providerPaidAfter }),
  }
}

function payoutTransferRow(
  row: Doc<'moneyPayouts'>,
  input: PayoutTransferRowInput,
) {
  return {
    payoutRef: row.payoutRef,
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    grossAccrualUnits: row.grossAccrualUnits,
    rakeUnits: row.rakeUnits,
    providerNetUnits: row.providerNetUnits,
    minimumPayoutUnits: row.minimumPayoutUnits,
    state: input.state,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    providerAccountRef: input.providerAccountRef,
    destinationAccountId: input.destinationAccountId,
    payoutCommandId: input.commandId,
    inputDigest: input.inputDigest,
    transferRequestDigest: input.requestDigest,
    ...(input.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: input.stripeTransferId }),
    ...(input.evidenceDigest === undefined
      ? {}
      : { transferEvidenceDigest: input.evidenceDigest }),
    ...(input.reversalEvidenceDigest === undefined
      ? {}
      : { transferReversalEvidenceDigest: input.reversalEvidenceDigest }),
    ...(input.observedAt === undefined
      ? {}
      : { transferObservedAt: input.observedAt }),
    ...((input.providerRecoveryDeadlineAt ?? row.providerRecoveryDeadlineAt) ===
    undefined
      ? {}
      : {
          providerRecoveryDeadlineAt:
            input.providerRecoveryDeadlineAt ?? row.providerRecoveryDeadlineAt,
        }),
    transferStatus: input.transferStatus,
    ...(input.providerHeldBefore === undefined
      ? {}
      : { providerHeldBeforeUnits: input.providerHeldBefore.units }),
    ...(input.providerHeldAfter === undefined
      ? {}
      : { providerHeldAfterUnits: input.providerHeldAfter.units }),
    ...(input.providerPaidBefore === undefined
      ? {}
      : { providerPaidBeforeUnits: input.providerPaidBefore.units }),
    ...(input.providerPaidAfter === undefined
      ? {}
      : { providerPaidAfterUnits: input.providerPaidAfter.units }),
    idempotencyKey: input.idempotencyKey,
    ...(input.failureCode === undefined
      ? {}
      : { failureCode: input.failureCode }),
    createdAt: row.createdAt,
    updatedAt: input.observedAt ?? row.updatedAt,
  }
}

const payoutBeginArgs = {
  authority: v.object({ principalId: identifier }),
  businessId: identifier,
  amount: exactAmount,
  providerAccountRef: identifier,
  destinationAccountId: identifier,
  payoutRef: identifier,
  commandId: identifier,
  inputDigest: identifier,
  requestDigest: identifier,
  idempotencyKey: identifier,
  providerRecoveryDeadlineAt: v.number(),
  observedAt: v.number(),
  ...billingSourceArgs,
}

export const beginPayoutTransfer = mutation({
  args: payoutBeginArgs,
  returns: payoutTransferResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    if (
      !(await payoutAuthorityAllowed(
        ctx,
        args.businessId,
        args.authority.principalId,
      ))
    )
      return refusedTopup('billing_identity_missing', false)
    const requested = readAmount(args.amount)
    if (
      requested === undefined ||
      requested.units === '0' ||
      args.commandId.length === 0 ||
      args.requestDigest.length === 0 ||
      args.inputDigest.length === 0 ||
      args.idempotencyKey.length === 0 ||
      args.providerRecoveryDeadlineAt <= args.observedAt ||
      args.providerRecoveryDeadlineAt >
        args.observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS
    )
      return refusedTopup('payout_not_ready', false)
    const [providerAccount, payoutAccount, payout, priorByIdempotency] =
      await Promise.all([
        ctx.db
          .query('moneyAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q
              .eq('businessId', args.businessId)
              .eq('currency', requested.currency),
          )
          .unique(),
        ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q
              .eq('businessId', args.businessId)
              .eq('currency', requested.currency),
          )
          .unique(),
        ctx.db
          .query('moneyPayouts')
          .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
          .unique(),
        ctx.db
          .query('moneyTransactions')
          .withIndex('by_idempotencyKey', (q) =>
            q.eq('idempotencyKey', args.idempotencyKey),
          )
          .unique(),
      ])
    if (
      payout === null ||
      payout.businessId !== args.businessId ||
      payout.currency !== requested.currency ||
      payoutAccount === null ||
      providerAccount === null ||
      providerAccount.accountKind !== 'provider_earnings' ||
      providerAccount.accountRef !== args.providerAccountRef
    )
      return refusedTopup('payout_not_ready', false)
    const current = payoutFromRow(payout)
    const provider = accountFromRow(providerAccount)
    if (
      current === undefined ||
      provider === undefined ||
      payoutAccount.stripeAccountId !== args.destinationAccountId ||
      payoutAccount.state !== 'ready' ||
      !payoutAccount.detailsSubmitted ||
      !payoutAccount.recipientCapabilityActive
    )
      return refusedTopup('payout_not_ready', false)
    const amount = amountAtScale(
      requested,
      requested.currency,
      providerAccount.exponent,
    )
    const providerNet = amountAtScale(
      current.providerNet,
      current.providerNet.currency,
      providerAccount.exponent,
    )
    if (
      amount === undefined ||
      providerNet === undefined ||
      compareExactAmounts(amount, providerNet) !== 0
    )
      return refusedTopup('payout_not_ready', false)
    if (priorByIdempotency !== null) {
      const priorEntry = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', priorByIdempotency.transactionRef),
        )
        .unique()
      const priorAmount =
        priorEntry === null ? undefined : entryAmount(priorEntry)
      if (
        priorByIdempotency.kind !== 'payout_accrual' ||
        priorByIdempotency.inputDigest !== args.inputDigest ||
        priorByIdempotency.externalRef !== args.payoutRef ||
        priorEntry === null ||
        priorEntry.accountRef !== providerAccount.accountRef ||
        priorAmount === undefined ||
        compareExactAmounts(priorAmount, amount) !== 0
      )
        return refusedTopup('ledger_idempotency_conflict', false)
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedTopup('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    const sameIdentity =
      payout.payoutCommandId === args.commandId &&
      payout.inputDigest === args.inputDigest &&
      payout.transferRequestDigest === args.requestDigest &&
      payout.idempotencyKey === args.idempotencyKey &&
      payout.destinationAccountId === args.destinationAccountId
    if (
      (payout.state === 'transfer_pending' || payout.state === 'paid') &&
      sameIdentity
    ) {
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedTopup('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    if (payout.state === 'outcome_unknown')
      return refusedTopup('payout_reconciliation_required', false)
    if (compareExactAmounts(provider.balance, amount) === -1)
      return refusedTopup('payout_below_threshold', false)
    if (
      payout.payoutCommandId !== undefined &&
      payout.state === 'transfer_pending'
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'begin_transfer',
        payoutCommandId: args.commandId,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
      },
      account: {
        state: payoutAccount.state,
        detailsSubmitted: payoutAccount.detailsSubmitted,
        recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
      },
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'pending',
        providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
        observedAt: args.observedAt,
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  },
})

export const markPayoutTransferOutcomeUnknown = mutation({
  args: {
    ...payoutBeginArgs,
    failureCode: identifier,
  },
  returns: payoutTransferResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    if (
      !(await payoutAuthorityAllowed(
        ctx,
        args.businessId,
        args.authority.principalId,
      ))
    )
      return refusedTopup('billing_identity_missing', false)
    const [payoutAccount, payout] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q
            .eq('businessId', args.businessId)
            .eq('currency', args.amount.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayouts')
        .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
        .unique(),
    ])
    const current = payout === null ? undefined : payoutFromRow(payout)
    if (
      payout === null ||
      payoutAccount === null ||
      current === undefined ||
      payout.businessId !== args.businessId ||
      payout.currency !== args.amount.currency ||
      payout.providerAccountRef !== args.providerAccountRef ||
      payout.destinationAccountId !== args.destinationAccountId ||
      payout.payoutCommandId !== args.commandId ||
      payout.inputDigest !== args.inputDigest ||
      payout.transferRequestDigest !== args.requestDigest ||
      payout.idempotencyKey !== args.idempotencyKey ||
      payout.providerRecoveryDeadlineAt !== args.providerRecoveryDeadlineAt ||
      payout.stripeTransferId !== undefined
    )
      return refusedTopup('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_unknown',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
      },
      account: {
        state: payoutAccount.state,
        detailsSubmitted: payoutAccount.detailsSubmitted,
        recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
      },
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'outcome_unknown',
        providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
        failureCode: args.failureCode,
        observedAt: args.observedAt,
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  },
})

type PayoutCompletionInput = Readonly<{
  authority: { principalId: string }
  businessId: string
  amount: Infer<typeof exactAmount>
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  idempotencyKey: string
  transactionRef: string
  evidence: Infer<typeof payoutTransferEvidenceArg>
  sourceDigest: string
  evidenceRefs: string[]
  observedAt: number
  failureCode?: string
}>
const PAYOUT_SNAPSHOT_READ_LIMIT = 2

async function readLatestCompletedPayoutPaidAfter(
  ctx: Pick<MutationCtx, 'db'>,
  businessId: string,
  expectedAmount: ExactAmount,
  currentPayoutId: string,
): Promise<ExactAmount | null | undefined> {
  const [paidRows, reversedRows] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'paid'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
    ctx.db
      .query('moneyPayouts')
      .withIndex(
        'by_businessId_and_currency_and_state_and_updatedAt',
        (q) =>
          q
            .eq('businessId', businessId)
            .eq('currency', expectedAmount.currency)
            .eq('state', 'reversed'),
      )
      .order('desc')
      .take(PAYOUT_SNAPSHOT_READ_LIMIT),
  ])
  const candidates = [paidRows, reversedRows].flatMap((rows) => {
    const eligible = rows.filter((row) => row._id !== currentPayoutId)
    if (
      eligible.length > 1 &&
      eligible[0]?.updatedAt === eligible[1]?.updatedAt
    )
      return [undefined]
    return eligible[0] === undefined ? [] : [eligible[0]]
  })
  if (candidates.some((candidate) => candidate === undefined))
    return undefined
  const latestCandidates = candidates.filter(
    (candidate): candidate is Doc<'moneyPayouts'> =>
      candidate !== undefined,
  )
  if (latestCandidates.length === 0) return null
  const latest = latestCandidates.reduce((current, candidate) =>
    candidate.updatedAt > current.updatedAt ? candidate : current,
  )
  if (
    latestCandidates.some(
      (candidate) =>
        candidate !== latest && candidate.updatedAt === latest.updatedAt,
    )
  )
    return undefined
  const payout = payoutFromRow(latest)
  if (
    payout === undefined ||
    latest.currency !== expectedAmount.currency ||
    latest.exponent !== expectedAmount.exponent ||
    payout.providerPaidAfter === undefined ||
    payout.providerPaidAfter.currency !== expectedAmount.currency ||
    payout.providerPaidAfter.exponent !== expectedAmount.exponent
  )
    return undefined
  return payout.providerPaidAfter
}


async function completePayoutBody(
  ctx: MutationCtx,
  args: PayoutCompletionInput,
  reconciliation: boolean,
): Promise<Infer<typeof payoutTransferResultValue>> {
  if (
    !(await payoutAuthorityAllowed(
      ctx,
      args.businessId,
      args.authority.principalId,
    ))
  )
    return refusedTopup('billing_identity_missing', false)
  const gate = evaluateLiveMoneyGate()
  if (gate.kind === 'refused') return gate
  if (args.evidenceRefs.length === 0 || args.sourceDigest.length === 0)
    return refusedTopup('payout_reconciliation_required', false)
  const transferId =
    'transferId' in args.evidence ? args.evidence.transferId : undefined
  if ('resolution' in args.evidence && !reconciliation)
    return refusedTopup('payout_reconciliation_required', false)
  const [providerAccount, payoutAccount, payout] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.amount.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.amount.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
      .unique(),
  ])
  if (
    providerAccount === null ||
    payoutAccount === null ||
    payout === null ||
    payout.businessId !== args.businessId ||
    payout.currency !== args.amount.currency ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.accountRef !== args.providerAccountRef ||
    payoutAccount.stripeAccountId !== args.destinationAccountId
  )
    return refusedTopup('payout_reconciliation_required', false)
  const current = payoutFromRow(payout)
  const provider = accountFromRow(providerAccount)
  if (
    current === undefined ||
    provider === undefined ||
    payout.payoutCommandId !== args.commandId ||
    payout.inputDigest !== args.inputDigest ||
    payout.idempotencyKey !== args.idempotencyKey ||
    payout.destinationAccountId !== args.destinationAccountId ||
    payout.transferRequestDigest !== args.evidence.requestDigest ||
    (transferId !== undefined && transferId.length === 0) ||
    args.evidence.requestDigest.length === 0 ||
    args.evidence.evidenceDigest.length === 0
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  const expectedAmount = amountAtScale(
    args.amount,
    payout.currency,
    payout.exponent,
  )
  const evidenceAmount = readAmount(args.evidence.amount)
  if (
    expectedAmount === undefined ||
    evidenceAmount === undefined ||
    compareExactAmounts(expectedAmount, evidenceAmount) !== 0 ||
    compareExactAmounts(current.providerNet, expectedAmount) !== 0 ||
    args.evidence.destinationAccountId !== args.destinationAccountId
  )
    return refusedTopup('payout_reconciliation_required', false)
  if (
    payout.stripeTransferId !== undefined &&
    transferId !== undefined &&
    payout.stripeTransferId !== transferId
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    args.evidence.status !== 'reversed' &&
    payout.transferEvidenceDigest !== undefined &&
    payout.transferEvidenceDigest !== args.evidence.evidenceDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    args.evidence.status === 'reversed' &&
    payout.transferReversalEvidenceDigest !== undefined &&
    payout.transferReversalEvidenceDigest !== args.evidence.evidenceDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  const accountState = {
    state: payoutAccount.state,
    detailsSubmitted: payoutAccount.detailsSubmitted,
    recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
  }
  const failedReplay =
    args.evidence.status === 'failed' &&
    payout.transferStatus === 'failed' &&
    payout.transferEvidenceDigest === args.evidence.evidenceDigest &&
    (payout.state === 'held_kyc' ||
      payout.state === 'held_threshold' ||
      payout.state === 'failed')
  if (failedReplay) {
    const transfer = payoutTransferView(payout)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  }
  if (reconciliation) {
    if (
      (payout.state !== 'outcome_unknown' &&
        payout.state !== 'transfer_pending') ||
      args.evidence.status !== 'failed'
    )
      return refusedTopup('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'reconcile',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        outcome: 'not_released',
        ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
        evidenceDigest: args.evidence.evidenceDigest,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'failed',
        ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.observedAt,
        failureCode: args.failureCode ?? 'not_released',
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  }
  if (transferId === undefined)
    return refusedTopup('payout_reconciliation_required', false)
  if (args.evidence.status === 'reversed') {
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_reversed',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        stripeTransferId: transferId,
        requestDigest: args.evidence.requestDigest,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    const prior = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_idempotencyKey', (q) =>
        q.eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (
      prior === null ||
      prior.kind !== 'payout_accrual' ||
      prior.externalRef !== args.payoutRef ||
      prior.inputDigest !== args.inputDigest ||
      prior.principalId !== `business:${args.businessId}` ||
      (prior.state !== 'applied' && prior.state !== 'reversed')
    )
      return refusedTopup('payout_reconciliation_required', false)
    const originalEntry = await ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', prior.transactionRef),
      )
      .unique()
    const originalAmount =
      originalEntry === null ? undefined : entryAmount(originalEntry)
    if (
      originalEntry === null ||
      originalEntry.accountRef !== providerAccount.accountRef ||
      originalEntry.entryType !== 'payout_accrual' ||
      originalEntry.direction !== 'debit' ||
      originalAmount === undefined ||
      compareExactAmounts(originalAmount, expectedAmount) !== 0
    )
      return refusedTopup('payout_reconciliation_required', false)
    const reversalTransactionRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      originalTransactionRef: prior.transactionRef,
      transferId,
      evidenceDigest: args.evidence.evidenceDigest,
    })
    const reversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      originalIdempotencyKey: args.idempotencyKey,
      reversalTransactionRef,
    })
    const priorReversals = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_reversalOf', (q) =>
        q.eq('reversalOf', prior.transactionRef),
      )
      .take(2)
    if (priorReversals.length > 1)
      return refusedTopup('ledger_idempotency_conflict', false)
    const existingReversal = priorReversals[0]
    if (existingReversal !== undefined) {
      const reversalEntry = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', existingReversal.transactionRef),
        )
        .unique()
      const evidenceRefsMatch =
        reversalEntry !== null &&
        reversalEntry.evidenceRefs.length === args.evidenceRefs.length &&
        reversalEntry.evidenceRefs.every(
          (ref, index) => ref === args.evidenceRefs[index],
        )
      if (
        payout.state !== 'reversed' ||
        prior.state !== 'reversed' ||
        existingReversal.transactionRef !== reversalTransactionRef ||
        existingReversal.kind !== 'payout_accrual' ||
        existingReversal.state !== 'reversed' ||
        existingReversal.idempotencyKey !== reversalIdempotencyKey ||
        existingReversal.inputDigest !== args.inputDigest ||
        existingReversal.externalRef !== args.payoutRef ||
        existingReversal.reversalOf !== prior.transactionRef ||
        existingReversal.currency !== expectedAmount.currency ||
        existingReversal.amountUnits !== expectedAmount.units ||
        existingReversal.exponent !== expectedAmount.exponent ||
        reversalEntry === null ||
        reversalEntry.accountRef !== providerAccount.accountRef ||
        reversalEntry.entryType !== 'payout_accrual' ||
        reversalEntry.direction !== 'credit' ||
        reversalEntry.transactionRef !== reversalTransactionRef ||
        reversalEntry.idempotencyKey !== reversalIdempotencyKey ||
        reversalEntry.amountUnits !== expectedAmount.units ||
        reversalEntry.currency !== expectedAmount.currency ||
        reversalEntry.exponent !== expectedAmount.exponent ||
        reversalEntry.reversalOf !== prior.transactionRef ||
        reversalEntry.sourceDigest !== args.sourceDigest ||
        !evidenceRefsMatch
      )
        return refusedTopup('ledger_idempotency_conflict', false)
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedTopup('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    if (payout.state !== 'paid' || prior.state !== 'applied')
      return refusedTopup('payout_reconciliation_required', false)
    const providerHeldBefore =
      payout.providerHeldBeforeUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerHeldBeforeUnits,
            payout.exponent,
          )
    const providerHeldAfter =
      payout.providerHeldAfterUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerHeldAfterUnits,
            payout.exponent,
          )
    const providerPaidBefore =
      payout.providerPaidBeforeUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerPaidBeforeUnits,
            payout.exponent,
          )
    const providerPaidAfter =
      payout.providerPaidAfterUnits === undefined
        ? undefined
        : amountFromParts(
            payout.currency,
            payout.providerPaidAfterUnits,
            payout.exponent,
          )
    if (
      providerHeldBefore === undefined ||
      providerHeldAfter === undefined ||
      providerPaidBefore === undefined ||
      providerPaidAfter === undefined
    )
      return refusedTopup('payout_reconciliation_required', false)
    if (compareExactAmounts(provider.balance, providerHeldAfter) !== 0)
      return refusedTopup('payout_reconciliation_required', false)
    const restoredBalance = addExactAmounts(provider.balance, expectedAmount)
    const restoredPaid = subtractExactAmounts(providerPaidAfter, expectedAmount)
    if (
      restoredBalance === undefined ||
      restoredPaid === undefined ||
      compareExactAmounts(restoredBalance, providerHeldBefore) !== 0 ||
      compareExactAmounts(restoredPaid, providerPaidBefore) !== 0
    )
      return refusedTopup('payout_reconciliation_required', false)
    await ctx.db.insert('moneyLedgerEntries', {
      entryRef: `${reversalTransactionRef}:payout-reversal`,
      accountRef: providerAccount.accountRef,
      entryType: 'payout_accrual',
      direction: 'credit',
      amountUnits: expectedAmount.units,
      currency: expectedAmount.currency,
      exponent: expectedAmount.exponent,
      transactionRef: reversalTransactionRef,
      idempotencyKey: reversalIdempotencyKey,
      businessId: args.businessId,
      sourceDigest: args.sourceDigest,
      evidenceRefs: [...args.evidenceRefs],
      reversalOf: prior.transactionRef,
      createdAt: args.evidence.observedAt,
    })
    await ctx.db.patch('moneyAccounts', providerAccount._id, {
      balanceUnits: restoredBalance.units,
      version: providerAccount.version + 1,
      updatedAt: args.observedAt,
    })
    await ctx.db.insert('moneyTransactions', {
      transactionRef: reversalTransactionRef,
      kind: 'payout_accrual',
      idempotencyKey: reversalIdempotencyKey,
      inputDigest: args.inputDigest,
      principalId: `business:${args.businessId}`,
      currency: expectedAmount.currency,
      amountUnits: expectedAmount.units,
      exponent: expectedAmount.exponent,
      state: 'reversed',
      expectedAccountVersion: providerAccount.version,
      externalRef: args.payoutRef,
      reversalOf: prior.transactionRef,
      createdAt: args.evidence.observedAt,
      updatedAt: args.observedAt,
    })
    await ctx.db.patch('moneyTransactions', prior._id, {
      state: 'reversed',
      updatedAt: args.observedAt,
    })
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'reversed',
        stripeTransferId: transferId,
        ...(payout.transferEvidenceDigest === undefined
          ? {}
          : { evidenceDigest: payout.transferEvidenceDigest }),
        reversalEvidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
        providerHeldBefore: provider.balance,
        providerHeldAfter: restoredBalance,
        providerPaidBefore: providerPaidAfter,
        providerPaidAfter: restoredPaid,
      }),
    )
    const updated = await ctx.db.get(payout._id)
    const transfer = updated === null ? undefined : payoutTransferView(updated)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  }
  if (payout.state === 'paid') {
    if (
      args.evidence.status !== 'succeeded' ||
      payout.transferStatus !== 'succeeded' ||
      payout.transferEvidenceDigest !== args.evidence.evidenceDigest
    )
      return refusedTopup('payout_reconciliation_required', false)
    const transfer = payoutTransferView(payout)
    return transfer === undefined
      ? refusedTopup('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  }
  if (args.evidence.status === 'pending') {
    if (
      payout.state !== 'transfer_pending' &&
      payout.state !== 'outcome_unknown'
    )
      return refusedTopup('payout_reconciliation_required', false)
    if (payout.state === 'outcome_unknown')
      return refusedTopup('payout_reconciliation_required', false)
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: 'transfer_pending',
        transferStatus: 'pending',
        stripeTransferId: transferId,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.observedAt,
      }),
    )
  } else if (args.evidence.status === 'outcome_unknown') {
    if (
      payout.state !== 'transfer_pending' &&
      payout.state !== 'outcome_unknown'
    )
      return refusedTopup('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_unknown',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        stripeTransferId: transferId,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'outcome_unknown',
        stripeTransferId: transferId,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.observedAt,
      }),
    )
  } else if (args.evidence.status === 'failed') {
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_failed',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        failureCode: args.failureCode ?? 'provider_transfer_failed',
        stripeTransferId: transferId,
        requestDigest: args.evidence.requestDigest,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'failed',
        stripeTransferId: transferId,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.observedAt,
        failureCode: args.failureCode ?? 'provider_transfer_failed',
      }),
    )
  } else {
    if (
      payout.state !== 'transfer_pending' &&
      payout.state !== 'outcome_unknown'
    )
      return refusedTopup('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_succeeded',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        stripeTransferId: transferId,
        requestDigest: args.evidence.requestDigest,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    const [priorByIdempotency, priorByPayout, priorByTransactionRef] =
      await Promise.all([
        ctx.db
          .query('moneyTransactions')
          .withIndex('by_idempotencyKey', (q) =>
            q.eq('idempotencyKey', args.idempotencyKey),
          )
          .unique(),
        ctx.db
          .query('moneyTransactions')
          .withIndex('by_externalRef', (q) =>
            q.eq('externalRef', args.payoutRef),
          )
          .take(2),
        ctx.db
          .query('moneyTransactions')
          .withIndex('by_transactionRef', (q) =>
            q.eq('transactionRef', args.transactionRef),
          )
          .unique(),
      ])
    const prior =
      priorByIdempotency ??
      priorByPayout.find((row) => row.kind === 'payout_accrual')
    let payoutSnapshots:
      | Readonly<{
          providerHeldBefore: ExactAmount
          providerHeldAfter: ExactAmount
          providerPaidBefore: ExactAmount
          providerPaidAfter: ExactAmount
        }>
      | undefined
    if (prior !== null && prior !== undefined) {
      const priorEntry = await ctx.db
        .query('moneyLedgerEntries')
        .withIndex('by_transactionRef', (q) =>
          q.eq('transactionRef', prior.transactionRef),
        )
        .unique()
      const priorAmount =
        priorEntry === null ? undefined : entryAmount(priorEntry)
      if (
        prior.state !== 'applied' ||
        prior.kind !== 'payout_accrual' ||
        prior.inputDigest !== args.inputDigest ||
        prior.externalRef !== args.payoutRef ||
        priorEntry === null ||
        priorEntry.accountRef !== providerAccount.accountRef ||
        priorAmount === undefined ||
        compareExactAmounts(priorAmount, expectedAmount) !== 0
      )
        return refusedTopup('payout_reconciliation_required', false)
      const providerHeldBefore =
        payout.providerHeldBeforeUnits === undefined
          ? undefined
          : amountFromParts(
              payout.currency,
              payout.providerHeldBeforeUnits,
              payout.exponent,
            )
      const providerHeldAfter =
        payout.providerHeldAfterUnits === undefined
          ? undefined
          : amountFromParts(
              payout.currency,
              payout.providerHeldAfterUnits,
              payout.exponent,
            )
      const providerPaidBefore =
        payout.providerPaidBeforeUnits === undefined
          ? undefined
          : amountFromParts(
              payout.currency,
              payout.providerPaidBeforeUnits,
              payout.exponent,
            )
      const providerPaidAfter =
        payout.providerPaidAfterUnits === undefined
          ? undefined
          : amountFromParts(
              payout.currency,
              payout.providerPaidAfterUnits,
              payout.exponent,
            )
      if (
        providerHeldBefore === undefined ||
        providerHeldAfter === undefined ||
        providerPaidBefore === undefined ||
        providerPaidAfter === undefined
      )
        return refusedTopup('payout_reconciliation_required', false)
      payoutSnapshots = {
        providerHeldBefore,
        providerHeldAfter,
        providerPaidBefore,
        providerPaidAfter,
      }
    } else {
      const balanceComparison = compareExactAmounts(
        provider.balance,
        expectedAmount,
      )
      if (balanceComparison === undefined || balanceComparison === -1)
        return refusedTopup('payout_reconciliation_required', false)
      const nextBalance = subtractExactAmounts(provider.balance, expectedAmount)
      const zeroPaid = amountFromParts(
        expectedAmount.currency,
        '0',
        expectedAmount.exponent,
      )
      if (nextBalance === undefined || zeroPaid === undefined)
        return refusedTopup('payout_reconciliation_required', false)
      const priorPaid = await readLatestCompletedPayoutPaidAfter(
        ctx,
        args.businessId,
        expectedAmount,
        payout._id,
      )
      if (priorPaid === undefined)
        return refusedTopup('payout_reconciliation_required', false)
      const providerPaidBefore = priorPaid ?? zeroPaid
      const providerPaidAfter = addExactAmounts(
        providerPaidBefore,
        expectedAmount,
      )
      if (providerPaidAfter === undefined)
        return refusedTopup('payout_reconciliation_required', false)
      payoutSnapshots = {
        providerHeldBefore: provider.balance,
        providerHeldAfter: nextBalance,
        providerPaidBefore,
        providerPaidAfter,
      }
      await ctx.db.insert('moneyLedgerEntries', {
        entryRef: `${args.transactionRef}:payout`,
        accountRef: providerAccount.accountRef,
        entryType: 'payout_accrual',
        direction: 'debit',
        amountUnits: expectedAmount.units,
        currency: expectedAmount.currency,
        exponent: expectedAmount.exponent,
        transactionRef: args.transactionRef,
        idempotencyKey: args.idempotencyKey,
        businessId: args.businessId,
        sourceDigest: args.sourceDigest,
        evidenceRefs: args.evidenceRefs,
        createdAt: args.evidence.observedAt,
      })
      await ctx.db.patch('moneyAccounts', providerAccount._id, {
        balanceUnits: nextBalance.units,
        version: providerAccount.version + 1,
        updatedAt: args.observedAt,
      })
      await ctx.db.insert('moneyTransactions', {
        transactionRef: args.transactionRef,
        kind: 'payout_accrual',
        idempotencyKey: args.idempotencyKey,
        inputDigest: args.inputDigest,
        principalId: `business:${args.businessId}`,
        currency: expectedAmount.currency,
        amountUnits: expectedAmount.units,
        exponent: expectedAmount.exponent,
        state: 'applied',
        expectedAccountVersion: providerAccount.version,
        externalRef: args.payoutRef,
        createdAt: args.evidence.observedAt,
        updatedAt: args.observedAt,
      })
    }
    if (payoutSnapshots === undefined)
      return refusedTopup('payout_reconciliation_required', false)
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'succeeded',
        stripeTransferId: transferId,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
        ...payoutSnapshots,
      }),
    )
  }
  const updated = await ctx.db.get(payout._id)
  const transfer = updated === null ? undefined : payoutTransferView(updated)
  return transfer === undefined
    ? refusedTopup('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, transfer }
}

const payoutCompleteArgs = {
  authority: v.object({ principalId: identifier }),
  businessId: identifier,
  amount: exactAmount,
  providerAccountRef: identifier,
  destinationAccountId: identifier,
  payoutRef: identifier,
  commandId: identifier,
  inputDigest: identifier,
  idempotencyKey: identifier,
  transactionRef: identifier,
  evidence: payoutTransferEvidenceArg,
  sourceDigest: identifier,
  evidenceRefs: v.array(identifier),
  observedAt: v.number(),
  failureCode: v.optional(identifier),
  ...billingSourceArgs,
}

export const completePayoutTransfer = mutation({
  args: payoutCompleteArgs,
  returns: payoutTransferResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    return await completePayoutBody(ctx, args, false)
  },
})

export const reconcilePayoutTransfer = mutation({
  args: {
    ...payoutCompleteArgs,
    outcome: v.union(v.literal('not_released'), v.literal('failed')),
  },
  returns: payoutTransferResultValue,
  handler: async (ctx, args) => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind === 'refused') return gate
    await requireBillingSourceWrite(ctx, args)
    if (args.outcome !== 'not_released' && args.outcome !== 'failed')
      return refusedTopup('payout_reconciliation_required', false)
    return await completePayoutBody(ctx, args, true)
  },
})

type AppendRefundInput = Readonly<{
  principalId: string
  originalTransactionRef: string
  transactionRef: string
  idempotencyKey: string
  inputDigest: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

async function appendRefundBody(
  ctx: MutationCtx,
  args: AppendRefundInput,
  suppliedOriginal?: Doc<'moneyTransactions'>,
): Promise<ReconcileChargeResult> {
  const original =
    suppliedOriginal ??
    (await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', args.originalTransactionRef),
      )
      .unique())
  if (
    original === null ||
    original.kind !== 'charge' ||
    original.principalId !== args.principalId
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  if (args.evidenceRefs.length === 0)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const prior = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_idempotencyKey', (q) =>
      q.eq('idempotencyKey', args.idempotencyKey),
    )
    .unique()
  if (prior !== null) {
    if (
      prior.inputDigest !== args.inputDigest ||
      prior.kind !== 'refund' ||
      prior.reversalOf !== args.originalTransactionRef ||
      prior.principalId !== args.principalId
    )
      return {
        kind: 'refused' as const,
        code: 'ledger_idempotency_conflict' as const,
        retryable: false,
      }
    return {
      kind: 'accepted' as const,
      transactionRef: prior.transactionRef,
      currency: original.currency,
    }
  }
  if (original.state !== 'applied' && original.state !== 'outcome_unknown')
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const existingReversal = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_reversalOf', (q) =>
      q.eq('reversalOf', args.originalTransactionRef),
    )
    .take(1)
  if (existingReversal.length > 0)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const entries = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', args.originalTransactionRef),
    )
    .take(4)
  const charge = entries.find(
    (entry) => entry.entryType === 'charge' && entry.direction === 'debit',
  )
  const provider = entries.find(
    (entry) =>
      entry.entryType === 'payout_accrual' && entry.direction === 'credit',
  )
  const rake = entries.find(
    (entry) => entry.entryType === 'rake' && entry.direction === 'credit',
  )
  const chargeAmount = charge === undefined ? undefined : entryAmount(charge)
  const providerAmount =
    provider === undefined ? undefined : entryAmount(provider)
  const rakeAmount = rake === undefined ? undefined : entryAmount(rake)
  if (
    charge === undefined ||
    provider === undefined ||
    rake === undefined ||
    chargeAmount === undefined ||
    providerAmount === undefined ||
    rakeAmount === undefined ||
    chargeAmount.currency !== original.currency ||
    providerAmount.currency !== original.currency ||
    rakeAmount.currency !== original.currency ||
    chargeAmount.exponent !== original.exponent ||
    providerAmount.exponent !== original.exponent ||
    rakeAmount.exponent !== original.exponent
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const payoutAccrual =
    original.settledAt === undefined
      ? undefined
      : await readPayoutAccrualAmounts(ctx, args.originalTransactionRef)
  if (original.settledAt !== undefined && payoutAccrual === undefined)
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const [operatorAccount, providerAccount, rakeAccount] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', charge.accountRef))
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) =>
        q.eq('accountRef', provider.accountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', rake.accountRef))
      .unique(),
  ])
  const operatorDomain =
    operatorAccount === null ? undefined : accountFromRow(operatorAccount)
  const providerDomain =
    providerAccount === null ? undefined : accountFromRow(providerAccount)
  const rakeDomain =
    rakeAccount === null ? undefined : accountFromRow(rakeAccount)
  if (
    operatorAccount === null ||
    providerAccount === null ||
    rakeAccount === null ||
    operatorDomain === undefined ||
    providerDomain === undefined ||
    rakeDomain === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const operatorRefund = amountAtScale(
    chargeAmount,
    operatorAccount.currency,
    operatorAccount.exponent,
  )
  const providerRefund = amountAtScale(
    providerAmount,
    providerAccount.currency,
    providerAccount.exponent,
  )
  const rakeRefund = amountAtScale(
    rakeAmount,
    rakeAccount.currency,
    rakeAccount.exponent,
  )
  if (
    operatorRefund === undefined ||
    providerRefund === undefined ||
    rakeRefund === undefined ||
    compareExactAmounts(providerDomain.balance, providerRefund) === -1 ||
    compareExactAmounts(rakeDomain.balance, rakeRefund) === -1
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const nextOperatorBalance = addExactAmounts(
    operatorDomain.balance,
    operatorRefund,
  )
  const nextProviderBalance = subtractExactAmounts(
    providerDomain.balance,
    providerRefund,
  )
  const nextRakeBalance = subtractExactAmounts(rakeDomain.balance, rakeRefund)
  if (
    nextOperatorBalance === undefined ||
    nextProviderBalance === undefined ||
    nextRakeBalance === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  if (
    !(await releaseOrSettleCredentialBudget(
      ctx,
      original,
      'not_released',
      args.observedAt,
    ))
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  if (
    payoutAccrual !== undefined &&
    original.settledAt !== undefined &&
    !(await updatePayoutPeriod(ctx, payoutAccrual, original.settledAt, 'debit'))
  )
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  const common = {
    transactionRef: args.transactionRef,
    idempotencyKey: args.idempotencyKey,
    sourceDigest: args.sourceDigest,
    evidenceRefs: [...args.evidenceRefs],
    createdAt: args.observedAt,
  }
  await ctx.db.insert('moneyLedgerEntries', {
    ...common,
    entryRef: `${args.transactionRef}:operator`,
    accountRef: operatorAccount.accountRef,
    entryType: 'refund',
    direction: 'credit',
    amountUnits: operatorRefund.units,
    currency: operatorRefund.currency,
    exponent: operatorRefund.exponent,
    principalId: args.principalId,
    reversalOf: args.originalTransactionRef,
  })
  await ctx.db.insert('moneyLedgerEntries', {
    ...common,
    entryRef: `${args.transactionRef}:provider`,
    accountRef: providerAccount.accountRef,
    entryType: 'refund',
    direction: 'debit',
    amountUnits: providerRefund.units,
    currency: providerRefund.currency,
    exponent: providerRefund.exponent,
    ...(provider.businessId === undefined
      ? {}
      : { businessId: provider.businessId }),
    reversalOf: args.originalTransactionRef,
  })
  await ctx.db.insert('moneyLedgerEntries', {
    ...common,
    entryRef: `${args.transactionRef}:rake`,
    accountRef: rakeAccount.accountRef,
    entryType: 'refund',
    direction: 'debit',
    amountUnits: rakeRefund.units,
    currency: rakeRefund.currency,
    exponent: rakeRefund.exponent,
    ...(rake.businessId === undefined ? {} : { businessId: rake.businessId }),
    reversalOf: args.originalTransactionRef,
  })
  await ctx.db.patch('moneyAccounts', operatorAccount._id, {
    balanceUnits: nextOperatorBalance.units,
    version: operatorAccount.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch('moneyAccounts', providerAccount._id, {
    balanceUnits: nextProviderBalance.units,
    version: providerAccount.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch('moneyAccounts', rakeAccount._id, {
    balanceUnits: nextRakeBalance.units,
    version: rakeAccount.version + 1,
    updatedAt: args.observedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: args.transactionRef,
    kind: 'refund' as const,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    principalId: args.principalId,
    currency: original.currency,
    exponent: original.exponent,
    state: 'reversed' as const,
    expectedAccountVersion: operatorAccount.version,
    reversalOf: args.originalTransactionRef,
    createdAt: args.observedAt,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch('moneyTransactions', original._id, {
    state: 'reversed',
    updatedAt: args.observedAt,
  })
  return {
    kind: 'accepted' as const,
    transactionRef: args.transactionRef,
    currency: original.currency,
  }
}

export const appendRefund = internalMutation({
  args: {
    principalId: identifier,
    originalTransactionRef: identifier,
    transactionRef: identifier,
    idempotencyKey: identifier,
    inputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId))
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        retryable: false,
      }
    return await appendRefundBody(ctx, args)
  },
})

type ReconcileChargeInput = Readonly<{
  principalId: string
  transactionRef: string
  outcome: 'not_released' | 'released'
  refundTransactionRef: string
  refundIdempotencyKey: string
  refundInputDigest: string
  sourceDigest: string
  evidenceRefs: readonly string[]
  observedAt: number
}>

async function reconcileChargeBody(
  ctx: MutationCtx,
  args: ReconcileChargeInput,
  transaction: Doc<'moneyTransactions'>,
): Promise<ReconcileChargeResult> {
  if (args.outcome === 'released') {
    if (transaction.state === 'reversed')
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    if (
      transaction.amountUnits !== '0' &&
      transaction.settledAt === undefined
    ) {
      const payoutAccrual = await readPayoutAccrualAmounts(
        ctx,
        transaction.transactionRef,
      )
      if (payoutAccrual === undefined)
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      if (
        !(await updatePayoutPeriod(
          ctx,
          payoutAccrual,
          args.observedAt,
          'credit',
        ))
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      if (
        !(await releaseOrSettleCredentialBudget(
          ctx,
          transaction,
          'released',
          args.observedAt,
        ))
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      await ctx.db.patch(transaction._id, {
        state: 'applied',
        settledAt: args.observedAt,
        updatedAt: args.observedAt,
      })
    } else if (
      transaction.state === 'outcome_unknown' ||
      transaction.budgetState === 'reserved' ||
      transaction.budgetState === 'unknown'
    ) {
      if (
        !(await releaseOrSettleCredentialBudget(
          ctx,
          transaction,
          'released',
          args.observedAt,
        ))
      )
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          retryable: false,
        }
      await ctx.db.patch(transaction._id, {
        state: 'applied',
        updatedAt: args.observedAt,
      })
    }
    return {
      kind: 'accepted' as const,
      transactionRef: args.transactionRef,
      outcome: 'released' as const,
    }
  }
  if (transaction.amountUnits === '0') {
    if (transaction.state === 'reversed')
      return {
        kind: 'accepted' as const,
        transactionRef: args.transactionRef,
        currency: transaction.currency,
      }
    if (
      !(await releaseOrSettleCredentialBudget(
        ctx,
        transaction,
        'not_released',
        args.observedAt,
      ))
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    await ctx.db.patch(transaction._id, {
      state: 'reversed',
      updatedAt: args.observedAt,
    })
    return {
      kind: 'accepted' as const,
      transactionRef: args.transactionRef,
      currency: transaction.currency,
    }
  }
  return await appendRefundBody(
    ctx,
    {
      principalId: args.principalId,
      originalTransactionRef: args.transactionRef,
      transactionRef: args.refundTransactionRef,
      idempotencyKey: args.refundIdempotencyKey,
      inputDigest: args.refundInputDigest,
      sourceDigest: args.sourceDigest,
      evidenceRefs: args.evidenceRefs,
      observedAt: args.observedAt,
    },
    transaction,
  )
}

export const reconcileCharge = internalMutation({
  args: {
    principalId: identifier,
    transactionRef: identifier,
    outcome: v.union(v.literal('not_released'), v.literal('released')),
    refundTransactionRef: identifier,
    refundIdempotencyKey: identifier,
    refundInputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  handler: async (ctx, args): Promise<ReconcileChargeResult> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId))
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        retryable: false as const,
      }
    const transaction = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', args.transactionRef),
      )
      .unique()
    if (
      transaction === null ||
      transaction.principalId !== args.principalId ||
      transaction.kind !== 'charge'
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false as const,
      }
    return await reconcileChargeBody(ctx, args, transaction)
  },
})

const invocationChargeReconciliationResult = v.union(
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('settled') }),
  v.object({ kind: v.literal('reconciliation_required') }),
)

export const reconcileInvocationCharge = internalMutation({
  args: {
    invocationRef: identifier,
    principalId: identifier,
    credentialId: identifier,
    attemptRef: identifier,
    transactionRef: identifier,
    inputDigest: identifier,
    outcome: v.union(v.literal('not_released'), v.literal('released')),
    refundTransactionRef: identifier,
    refundIdempotencyKey: identifier,
    refundInputDigest: identifier,
    sourceDigest: identifier,
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  returns: invocationChargeReconciliationResult,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof invocationChargeReconciliationResult>> => {
    const expectedTransactionRef = `operation-money:${args.invocationRef}:${args.attemptRef}:1`
    const expectedRefundTransactionRef = `operation-money-refund:${args.invocationRef}:${args.attemptRef}:1`
    const expectedRefundInputDigest = canonicalDigest({
      format: 'operation-money-refund:v1',
      invocationRef: args.invocationRef,
      attemptRef: args.attemptRef,
      inputDigest: args.inputDigest,
      transactionRef: args.transactionRef,
      outcome: args.outcome,
    } as never)
    if (
      args.transactionRef !== expectedTransactionRef ||
      args.refundTransactionRef !== expectedRefundTransactionRef ||
      args.refundIdempotencyKey !== expectedRefundTransactionRef ||
      args.refundInputDigest !== expectedRefundInputDigest ||
      args.evidenceRefs.length === 0 ||
      args.sourceDigest.length === 0
    )
      return { kind: 'reconciliation_required' as const }
    const usageRows = await ctx.db
      .query('moneyUsageEvents')
      .withIndex('by_invocationRef', (q) =>
        q.eq('invocationRef', args.invocationRef),
      )
      .take(20)
    const transaction = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', args.transactionRef),
      )
      .unique()
    if (usageRows.length === 0)
      return transaction === null
        ? { kind: 'none' as const }
        : { kind: 'reconciliation_required' as const }
    const matchingRows = usageRows.filter(
      (usage) =>
        usage.invocationRef === args.invocationRef &&
        usage.attemptRef === args.attemptRef &&
        usage.principalId === args.principalId &&
        usage.credentialId === args.credentialId,
    )
    if (matchingRows.length === 0)
      return { kind: 'reconciliation_required' as const }
    const usage = matchingRows.find(
      (candidate) => candidate.transactionRef === args.transactionRef,
    )
    if (usage === undefined) {
      return transaction !== null ||
        !matchingRows.every(
          (candidate) =>
            candidate.transactionRef === undefined &&
            candidate.chargeState !== 'paid' &&
            candidate.chargeState !== 'outcome_unknown',
        )
        ? { kind: 'reconciliation_required' as const }
        : { kind: 'none' as const }
    }
    if (
      matchingRows.filter(
        (candidate) => candidate.transactionRef === args.transactionRef,
      ).length !== 1
    )
      return { kind: 'reconciliation_required' as const }
    if (
      transaction === null ||
      transaction.kind !== 'charge' ||
      transaction.principalId !== args.principalId ||
      transaction.credentialId !== args.credentialId ||
      transaction.inputDigest !== args.inputDigest
    )
      return { kind: 'reconciliation_required' as const }
    const result = await reconcileChargeBody(
      ctx,
      {
        principalId: args.principalId,
        transactionRef: args.transactionRef,
        outcome: args.outcome,
        refundTransactionRef: args.refundTransactionRef,
        refundIdempotencyKey: args.refundIdempotencyKey,
        refundInputDigest: args.refundInputDigest,
        sourceDigest: args.sourceDigest,
        evidenceRefs: args.evidenceRefs,
        observedAt: args.observedAt,
      },
      transaction,
    )
    return result.kind === 'accepted'
      ? { kind: 'settled' as const }
      : { kind: 'reconciliation_required' as const }
  },
})

export const markChargeOutcomeUnknown = internalMutation({
  args: {
    transactionRef: identifier,
    principalId: identifier,
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!principalAllowed(identity, args.principalId))
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        retryable: false,
      }
    const transaction = await ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', args.transactionRef),
      )
      .unique()
    if (
      transaction === null ||
      transaction.principalId !== args.principalId ||
      transaction.kind !== 'charge'
    )
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required' as const,
        retryable: false,
      }
    await ctx.db.patch('moneyTransactions', transaction._id, {
      state: 'outcome_unknown',
      ...(transaction.budgetState === 'reserved'
        ? { budgetState: 'unknown' as const }
        : {}),
      updatedAt: args.now,
    })
    return {
      kind: 'refused' as const,
      code: 'charge_reconciliation_required' as const,
      retryable: false,
    }
  },
})

export const readCreditAccount = query({
  args: { ...moneyArgs },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (
      !(await ownerPrincipalAllowed(
        identity,
        args.principalId,
        async () =>
          await ctx.db
            .query('agentAccessPrincipals')
            .withIndex('by_principalId', (q) =>
              q.eq('principalId', args.principalId),
            )
            .unique(),
      ))
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
      }
    const principal = await ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (q) =>
        q.eq('principalId', args.principalId),
      )
      .unique()
    if (principal === null)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
      }
    const account = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountId_and_currency', (q) =>
        q.eq('accountId', principal.ownerId).eq('currency', args.currency),
      )
      .unique()
    const accountDomain = account === null ? undefined : accountFromRow(account)
    if (account === null || accountDomain === undefined)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
      }
    const threshold = zeroAmount(account.currency, account.exponent)
    if (threshold === undefined)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
      }
    return {
      kind: 'ok' as const,
      principalId: args.principalId,
      accountId: principal.ownerId,
      balance: accountDomain.balance,
      autoRecharge: { enabled: false, threshold, rechargeAmount: threshold },
      evidence: 'source' as const,
    }
  },
})

export const listCreditActivity = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (
      !(await ownerPrincipalAllowed(
        identity,
        args.principalId,
        async () =>
          await ctx.db
            .query('agentAccessPrincipals')
            .withIndex('by_principalId', (q) =>
              q.eq('principalId', args.principalId),
            )
            .unique(),
      ))
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing' as const,
        items: [] as const,
      }
    const page = await ctx.db
      .query('moneyUsageEvents')
      .withIndex(
        'by_principalId_and_credentialId_and_currency_and_observedAt',
        (q) =>
          q
            .eq('principalId', args.principalId)
            .eq('credentialId', args.credentialId)
            .eq('currency', args.currency),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    const items = []
    for (const row of page.page) {
      const grossAmount = amountFromParts(
        row.currency,
        row.amountUnits,
        row.exponent,
      )
      if (grossAmount === undefined)
        return {
          kind: 'refused' as const,
          code: 'charge_reconciliation_required' as const,
          items: [] as const,
        }
      items.push({
        activityRef: row.usageRef,
        credentialId: row.credentialId,
        serviceRef: row.serviceRef,
        offeringRef: row.offeringRef,
        businessId: row.businessId,
        operationKey: row.operationKey,
        invocationRef: row.invocationRef,
        attemptRef: row.attemptRef,
        grossAmount,
        chargeState: row.chargeState,
        priceDigest: row.priceDigest,
        observedAt: row.observedAt,
        ...(row.transactionRef === undefined
          ? {}
          : { transactionRef: row.transactionRef }),
      })
    }
    return {
      kind: 'ok' as const,
      page: items,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

export const readKeyUsage = query({
  args: {
    principalId: identifier,
    credentialId: identifier,
    currency: identifier,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (
      !(await ownerPrincipalAllowed(
        identity,
        args.principalId,
        async () =>
          await ctx.db
            .query('agentAccessPrincipals')
            .withIndex('by_principalId', (q) =>
              q.eq('principalId', args.principalId),
            )
            .unique(),
      ))
    )
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing',
        items: [] as const,
      }
    const principal = await ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (q) =>
        q.eq('principalId', args.principalId),
      )
      .unique()
    const summary = await ctx.db
      .query('moneyCredentialUsageSummaries')
      .withIndex('by_principalId_and_credentialId_and_currency', (q) =>
        q
          .eq('principalId', args.principalId)
          .eq('credentialId', args.credentialId)
          .eq('currency', args.currency),
      )
      .unique()
    const account =
      principal === null
        ? null
        : await ctx.db
            .query('moneyAccounts')
            .withIndex('by_accountId_and_currency', (q) =>
              q.eq('accountId', principal.ownerId).eq('currency', args.currency),
            )
            .unique()
    const exponent = summary?.exponent ?? account?.exponent
    if (exponent === undefined)
      return {
        kind: 'refused' as const,
        code: 'billing_identity_missing',
        items: [] as const,
      }
    const grossSpend =
      summary === null
        ? zeroAmount(args.currency, exponent)
        : amountFromParts(
            summary.currency,
            summary.grossSpendUnits,
            summary.exponent,
          )
    if (grossSpend === undefined)
      return {
        kind: 'refused' as const,
        code: 'charge_reconciliation_required',
        items: [] as const,
      }
    return {
      kind: 'ok' as const,
      credentialId: args.credentialId,
      callCount: summary?.callCount ?? 0,
      paidCallCount: summary?.paidCallCount ?? 0,
      freeCallCount: summary?.freeCallCount ?? 0,
      grossSpend,
      states: summary?.states ?? [],
    }
  },
})

function sumEntries(
  rows: readonly MoneyLedgerEntryRow[],
  zero: ExactAmount,
  predicate: (entry: MoneyLedgerEntryRow) => boolean,
): ExactAmount | undefined {
  let total = zero
  for (const row of rows) {
    if (!predicate(row)) continue
    const amount = entryAmount(row)
    if (amount === undefined) return undefined
    const next = addExactAmounts(total, amount)
    if (next === undefined) return undefined
    total = next
  }
  return total
}

async function readTransactionRefs(
  ctx: MoneyQueryCtx,
  rows: readonly MoneyLedgerEntryRow[],
): Promise<ReadonlyMap<string, Doc<'moneyTransactions'>>> {
  const refs = new Set<string>()
  for (const row of rows) {
    refs.add(row.transactionRef)
    if (row.reversalOf !== undefined) refs.add(row.reversalOf)
  }
  const transactions = await Promise.all(
    [...refs].map(
      async (transactionRef) =>
        await ctx.db
          .query('moneyTransactions')
          .withIndex('by_transactionRef', (query) =>
            query.eq('transactionRef', transactionRef),
          )
          .unique(),
    ),
  )
  return new Map(
    transactions
      .filter((row): row is Doc<'moneyTransactions'> => row !== null)
      .map((row) => [row.transactionRef, row]),
  )
}

function isSettledCharge(
  transactions: ReadonlyMap<string, Doc<'moneyTransactions'>>,
  transactionRef: string,
): boolean {
  const transaction = transactions.get(transactionRef)
  return (
    transaction?.kind === 'charge' &&
    (transaction.settledAt !== undefined ||
      transaction.budgetState === 'settled')
  )
}

type MoneyQueryCtx = Pick<QueryCtx, 'db'>
type ProviderEarningsReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      grossAccrual: ExactAmount
      rake: ExactAmount
      providerNet: ExactAmount
      paidOut: ExactAmount
      held: ExactAmount
      truncated: boolean
      evidence: 'source'
    }>
  | Readonly<{
      kind: 'refused'
      code: 'payout_not_ready' | 'payout_reconciliation_required'
    }>
type PayoutStatusReadResult =
  | Readonly<{
      kind: 'ok'
      businessId: string
      accountState:
        | 'missing'
        | 'not_started'
        | 'onboarding_started'
        | 'submitted'
        | 'restricted'
        | 'ready'
      payoutState?:
        | 'review'
        | 'held_kyc'
        | 'held_threshold'
        | 'transfer_pending'
        | 'paid'
        | 'reversed'
        | 'failed'
        | 'outcome_unknown'
      destinationAccountId?: string
      requestDigest?: string
      evidenceDigest?: string
      reversalEvidenceDigest?: string
      providerHeldBefore?: ExactAmount
      providerHeldAfter?: ExactAmount
      providerPaidBefore?: ExactAmount
      providerPaidAfter?: ExactAmount
      stripeAccountId?: string
      payoutRef?: string
      payoutCommandId?: string
      idempotencyKey?: string
      stripeTransferId?: string
      transferStatus?:
        'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
      providerRecoveryDeadlineAt?: number
      recoveryState?: 'provider_id' | 'idempotency_key' | 'admin_intervention'
      accountVersion?: number
      lastStripeEventId?: string
      lastStripePayloadDigest?: string
      providerObjectDigest?: string
      providerNet: ExactAmount
      minimumPayout: ExactAmount
      evidence: 'source'
    }>
  | Readonly<{
      kind: 'refused'
      code: 'payout_not_ready' | 'payout_reconciliation_required'
    }>

async function readProviderEarningsForAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyAccounts'> | null,
): Promise<ProviderEarningsReadResult> {
  const accountDomain = account === null ? undefined : accountFromRow(account)
  if (
    account === null ||
    accountDomain === undefined ||
    account.accountKind !== 'provider_earnings'
  )
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const rows = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_businessId_and_createdAt', (q) =>
      q.eq('businessId', businessId),
    )
    .order('desc')
    .take(101)
  if (rows.length > 100)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  const zero = zeroAmount(account.currency, account.exponent)
  if (zero === undefined)
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  const transactions = await readTransactionRefs(ctx, rows)
  const providerCredits = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === account.accountRef &&
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'credit' &&
      entry.invocationRef !== undefined &&
      isSettledCharge(transactions, entry.transactionRef),
  )
  const rakeCredits = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === accountRefForRake(currency) &&
      entry.entryType === 'rake' &&
      entry.direction === 'credit' &&
      isSettledCharge(transactions, entry.transactionRef),
  )
  const payoutDebits = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === account.accountRef &&
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'debit',
  )
  const payoutReversals = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === account.accountRef &&
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'credit' &&
      entry.reversalOf !== undefined,
  )
  const paidOut =
    payoutDebits === undefined || payoutReversals === undefined
      ? undefined
      : subtractExactAmounts(payoutDebits, payoutReversals)
  const providerRefunds = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === account.accountRef &&
      entry.entryType === 'refund' &&
      entry.direction === 'debit' &&
      entry.reversalOf !== undefined &&
      isSettledCharge(transactions, entry.reversalOf),
  )
  const rakeRefunds = sumEntries(
    rows,
    zero,
    (entry) =>
      entry.currency === currency &&
      entry.accountRef === accountRefForRake(currency) &&
      entry.entryType === 'refund' &&
      entry.direction === 'debit' &&
      entry.reversalOf !== undefined &&
      isSettledCharge(transactions, entry.reversalOf),
  )
  const providerNet =
    providerCredits === undefined || providerRefunds === undefined
      ? undefined
      : subtractExactAmounts(providerCredits, providerRefunds)
  const rake =
    rakeCredits === undefined || rakeRefunds === undefined
      ? undefined
      : subtractExactAmounts(rakeCredits, rakeRefunds)
  const grossAccrual =
    providerNet === undefined || rake === undefined
      ? undefined
      : addExactAmounts(providerNet, rake)
  if (
    grossAccrual === undefined ||
    rake === undefined ||
    providerNet === undefined ||
    paidOut === undefined
  )
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  return {
    kind: 'ok' as const,
    businessId,
    grossAccrual,
    rake,
    providerNet,
    paidOut,
    held: accountDomain.balance,
    truncated: false,
    evidence: 'source' as const,
  }
}

async function readProviderEarningsForBusiness(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
): Promise<ProviderEarningsReadResult> {
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', businessId).eq('currency', currency),
    )
    .unique()
  return await readProviderEarningsForAccount(
    ctx,
    businessId,
    currency,
    account,
  )
}

async function readPayoutStatusForRows(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  account: Doc<'moneyPayoutAccounts'> | null,
  providerAccount: Doc<'moneyAccounts'> | null,
): Promise<PayoutStatusReadResult> {
  if (account === null) {
    const provider =
      providerAccount === null ? undefined : accountFromRow(providerAccount)
    if (
      provider === undefined ||
      provider.accountKind !== 'provider_earnings'
    ) {
      return { kind: 'refused' as const, code: 'payout_not_ready' as const }
    }
    const zero = zeroAmount(
      provider.balance.currency,
      provider.balance.exponent,
    )
    return zero === undefined
      ? { kind: 'refused' as const, code: 'payout_not_ready' as const }
      : {
          kind: 'ok' as const,
          businessId,
          accountState: 'missing' as const,
          providerNet: zero,
          minimumPayout: zero,
          evidence: 'source' as const,
        }
  }
  const current = (
    await ctx.db
      .query('moneyPayouts')
      .withIndex('by_businessId_and_currency_and_updatedAt', (q) =>
        q.eq('businessId', businessId).eq('currency', currency),
      )
      .order('desc')
      .take(1)
  )[0]
  const zero = zeroAmount(account.currency, account.exponent)
  if (zero === undefined)
    return { kind: 'refused' as const, code: 'payout_not_ready' as const }
  if (current === undefined)
    return {
      kind: 'ok' as const,
      businessId,
      accountState: account.state,
      stripeAccountId: account.stripeAccountId,
      ...(account.version === undefined
        ? {}
        : { accountVersion: account.version }),
      ...(account.lastStripeEventId === undefined
        ? {}
        : { lastStripeEventId: account.lastStripeEventId }),
      ...(account.lastStripePayloadDigest === undefined
        ? {}
        : { lastStripePayloadDigest: account.lastStripePayloadDigest }),
      ...(account.providerObjectDigest === undefined
        ? {}
        : { providerObjectDigest: account.providerObjectDigest }),
      providerNet: zero,
      minimumPayout: zero,
      evidence: 'source' as const,
    }
  const payout = payoutFromRow(current)
  if (payout === undefined)
    return {
      kind: 'refused' as const,
      code: 'payout_reconciliation_required' as const,
    }
  return {
    kind: 'ok' as const,
    businessId,
    accountState: account.state,
    payoutState: current.state,
    payoutRef: current.payoutRef,
    ...(current.payoutCommandId === undefined
      ? {}
      : { payoutCommandId: current.payoutCommandId }),
    ...(current.idempotencyKey.length === 0
      ? {}
      : { idempotencyKey: current.idempotencyKey }),
    ...(current.stripeTransferId === undefined
      ? {}
      : { stripeTransferId: current.stripeTransferId }),
    ...(current.transferStatus === undefined
      ? {}
      : { transferStatus: current.transferStatus }),
    ...(current.providerRecoveryDeadlineAt === undefined
      ? {}
      : { providerRecoveryDeadlineAt: current.providerRecoveryDeadlineAt }),
    ...(current.state !== 'transfer_pending' &&
    current.state !== 'outcome_unknown'
      ? {}
      : current.stripeTransferId !== undefined
        ? { recoveryState: 'provider_id' as const }
        : current.providerRecoveryDeadlineAt !== undefined &&
            Date.now() < current.providerRecoveryDeadlineAt
          ? { recoveryState: 'idempotency_key' as const }
          : { recoveryState: 'admin_intervention' as const }),
    ...(current.destinationAccountId === undefined
      ? {}
      : { destinationAccountId: current.destinationAccountId }),
    ...(current.transferRequestDigest === undefined
      ? {}
      : { requestDigest: current.transferRequestDigest }),
    ...((current.transferReversalEvidenceDigest ??
      current.transferEvidenceDigest) === undefined
      ? {}
      : {
          evidenceDigest:
            current.transferReversalEvidenceDigest ??
            current.transferEvidenceDigest,
        }),
    ...(current.transferReversalEvidenceDigest === undefined
      ? {}
      : { reversalEvidenceDigest: current.transferReversalEvidenceDigest }),
    ...(payout.providerHeldBefore === undefined
      ? {}
      : { providerHeldBefore: payout.providerHeldBefore }),
    ...(payout.providerHeldAfter === undefined
      ? {}
      : { providerHeldAfter: payout.providerHeldAfter }),
    ...(payout.providerPaidBefore === undefined
      ? {}
      : { providerPaidBefore: payout.providerPaidBefore }),
    ...(payout.providerPaidAfter === undefined
      ? {}
      : { providerPaidAfter: payout.providerPaidAfter }),
    stripeAccountId: account.stripeAccountId,
    ...(account.version === undefined
      ? {}
      : { accountVersion: account.version }),
    ...(account.lastStripeEventId === undefined
      ? {}
      : { lastStripeEventId: account.lastStripeEventId }),
    ...(account.lastStripePayloadDigest === undefined
      ? {}
      : { lastStripePayloadDigest: account.lastStripePayloadDigest }),
    ...(account.providerObjectDigest === undefined
      ? {}
      : { providerObjectDigest: account.providerObjectDigest }),
    providerNet: payout.providerNet,
    minimumPayout: payout.minimumPayout,
    evidence: 'source' as const,
  }
}

async function readPayoutStatusForProviderAccount(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
  providerAccount: Doc<'moneyAccounts'>,
): Promise<PayoutStatusReadResult> {
  const account = await ctx.db
    .query('moneyPayoutAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', businessId).eq('currency', currency),
    )
    .unique()
  return await readPayoutStatusForRows(
    ctx,
    businessId,
    currency,
    account,
    providerAccount,
  )
}

async function readPayoutStatusForBusiness(
  ctx: MoneyQueryCtx,
  businessId: string,
  currency: string,
): Promise<PayoutStatusReadResult> {
  const [account, providerAccount] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', businessId).eq('currency', currency),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', businessId).eq('currency', currency),
      )
      .unique(),
  ])
  return await readPayoutStatusForRows(
    ctx,
    businessId,
    currency,
    account,
    providerAccount,
  )
}

const payoutAccountStateValue = v.union(
  v.literal('missing'),
  v.literal('not_started'),
  v.literal('onboarding_started'),
  v.literal('submitted'),
  v.literal('restricted'),
  v.literal('ready'),
)
const payoutStateValue = v.union(
  v.literal('review'),
  v.literal('held_kyc'),
  v.literal('held_threshold'),
  v.literal('transfer_pending'),
  v.literal('paid'),
  v.literal('reversed'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
const providerEarningsViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  grossAccrual: exactAmount,
  rake: exactAmount,
  providerNet: exactAmount,
  paidOut: exactAmount,
  held: exactAmount,
  truncated: v.boolean(),
  evidence: v.literal('source'),
})
const payoutStatusViewValue = v.object({
  kind: v.literal('ok'),
  businessId: identifier,
  accountState: payoutAccountStateValue,
  payoutState: v.optional(payoutStateValue),
  payoutRef: v.optional(identifier),
  payoutCommandId: v.optional(identifier),
  idempotencyKey: v.optional(identifier),
  stripeTransferId: v.optional(identifier),
  transferStatus: v.optional(
    v.union(
      v.literal('pending'),
      v.literal('succeeded'),
      v.literal('failed'),
      v.literal('reversed'),
      v.literal('outcome_unknown'),
    ),
  ),
  providerRecoveryDeadlineAt: v.optional(v.number()),
  recoveryState: v.optional(
    v.union(
      v.literal('provider_id'),
      v.literal('idempotency_key'),
      v.literal('admin_intervention'),
    ),
  ),
  stripeAccountId: v.optional(identifier),
  accountVersion: v.optional(v.number()),
  lastStripeEventId: v.optional(identifier),
  lastStripePayloadDigest: v.optional(identifier),
  providerObjectDigest: v.optional(identifier),
  providerNet: exactAmount,
  destinationAccountId: v.optional(identifier),
  requestDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  reversalEvidenceDigest: v.optional(identifier),
  providerHeldBefore: v.optional(exactAmount),
  providerHeldAfter: v.optional(exactAmount),
  providerPaidBefore: v.optional(exactAmount),
  providerPaidAfter: v.optional(exactAmount),
  minimumPayout: exactAmount,
  evidence: v.literal('source'),
})
const ownerProviderEarningsResultValue = v.union(
  v.object({
    kind: v.literal('error'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('source_unavailable'),
    ),
  }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: identifier,
    accounts: v.array(
      v.object({
        currency: identifier,
        earnings: providerEarningsViewValue,
        payout: payoutStatusViewValue,
      }),
    ),
    accountsTruncated: v.boolean(),
  }),
)

export const readOwnerProviderEarnings = query({
  args: {},
  returns: ownerProviderEarningsResultValue,
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner')
      return { kind: 'error' as const, code: 'unauthenticated' as const }
    const owner = await ctx.db
      .query('owners')
      .withIndex('by_clerkUserId', (q) =>
        q.eq('clerkUserId', actor.clerkUserId),
      )
      .unique()
    if (owner === null) return { kind: 'not_found' as const }
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .first()
    if (business === null) return { kind: 'not_found' as const }
    const businessId = String(business._id)
    const accountRows = await ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', businessId),
      )
      .take(11)
    const providerAccountRows = accountRows.filter(
      (account) => account.accountKind === 'provider_earnings',
    )
    const providerAccounts = providerAccountRows.slice(0, 10)
    const accountResults = await Promise.all(
      providerAccounts.map(async (providerAccount) => {
        const [earnings, payout] = await Promise.all([
          readProviderEarningsForAccount(
            ctx,
            businessId,
            providerAccount.currency,
            providerAccount,
          ),
          readPayoutStatusForProviderAccount(
            ctx,
            businessId,
            providerAccount.currency,
            providerAccount,
          ),
        ])
        return earnings.kind === 'ok' && payout.kind === 'ok'
          ? { currency: providerAccount.currency, earnings, payout }
          : undefined
      }),
    )
    if (accountResults.some((account) => account === undefined)) {
      return { kind: 'error' as const, code: 'source_unavailable' as const }
    }
    return {
      kind: 'available' as const,
      businessId,
      accounts: accountResults.filter((account) => account !== undefined),
      accountsTruncated: providerAccountRows.length > 10,
    }
  },
})

export const readProviderEarnings = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) =>
    await readProviderEarningsForBusiness(ctx, args.businessId, args.currency),
})

export const readPayoutStatus = internalQuery({
  args: { businessId: identifier, currency: identifier },
  handler: async (ctx, args) =>
    await readPayoutStatusForBusiness(ctx, args.businessId, args.currency),
})
