import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  addExactAmounts,
  compareExactAmounts,
  exactAmountSchema,
  subtractExactAmounts,
  type ExactAmount,
} from './exact-amount'

export type CredentialBudgetPolicy = Readonly<{
  budgetPolicyRef: string
  generation: number
  maximumSpendPerInvocation: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
  maximumConcurrentInvocations: number
}>

export type CredentialBudgetWindowUsage = Readonly<{
  settledSpend: ExactAmount
  reservedSpend: ExactAmount
}>

export type CredentialBudgetUsage = Readonly<{
  daily: CredentialBudgetWindowUsage
  monthly: CredentialBudgetWindowUsage
  reservedConcurrency: number
}>

export type CredentialBudgetReservationState = 'reserved' | 'settled' | 'released' | 'unknown'

export type CredentialBudgetReservation = Readonly<{
  reservationRef: string
  transactionRef: string
  principalId: string
  credentialId: string
  budgetPolicyRef: string
  generation: number
  amount: ExactAmount
  dayStart: string
  monthStart: string
  state: CredentialBudgetReservationState
  createdAt: number
  updatedAt: number
}>

export type CredentialBudgetRefusalCode =
  | 'budget_policy_invalid'
  | 'budget_currency_mismatch'
  | 'budget_invocation_limit_exceeded'
  | 'budget_daily_limit_exceeded'
  | 'budget_monthly_limit_exceeded'
  | 'budget_concurrency_exhausted'
  | 'budget_reservation_not_found'
  | 'budget_reservation_conflict'

export type CredentialBudgetAdmission =
  | Readonly<{ kind: 'accepted'; usage: CredentialBudgetUsage }>
  | Readonly<{ kind: 'refused'; code: CredentialBudgetRefusalCode }>

function validPolicy(policy: CredentialBudgetPolicy): boolean {
  return policy.budgetPolicyRef.trim().length > 0
    && Number.isSafeInteger(policy.generation)
    && policy.generation > 0
    && Number.isSafeInteger(policy.maximumConcurrentInvocations)
    && policy.maximumConcurrentInvocations > 0
    && exactAmountSchema.safeParse(policy.maximumSpendPerInvocation).success
    && exactAmountSchema.safeParse(policy.maximumDailySpend).success
    && exactAmountSchema.safeParse(policy.maximumMonthlySpend).success
    && policy.maximumSpendPerInvocation.currency === policy.maximumDailySpend.currency
    && policy.maximumSpendPerInvocation.currency === policy.maximumMonthlySpend.currency
    && policy.maximumSpendPerInvocation.exponent === policy.maximumDailySpend.exponent
    && policy.maximumSpendPerInvocation.exponent === policy.maximumMonthlySpend.exponent
}

function validUsage(input: CredentialBudgetUsage, policy: CredentialBudgetPolicy): boolean {
  return exactAmountSchema.safeParse(input.daily.settledSpend).success
    && exactAmountSchema.safeParse(input.daily.reservedSpend).success
    && exactAmountSchema.safeParse(input.monthly.settledSpend).success
    && exactAmountSchema.safeParse(input.monthly.reservedSpend).success
    && input.daily.settledSpend.currency === policy.maximumDailySpend.currency
    && input.daily.reservedSpend.currency === policy.maximumDailySpend.currency
    && input.monthly.settledSpend.currency === policy.maximumMonthlySpend.currency
    && input.monthly.reservedSpend.currency === policy.maximumMonthlySpend.currency
    && input.daily.settledSpend.exponent === policy.maximumDailySpend.exponent
    && input.daily.reservedSpend.exponent === policy.maximumDailySpend.exponent
    && input.monthly.settledSpend.exponent === policy.maximumMonthlySpend.exponent
    && input.monthly.reservedSpend.exponent === policy.maximumMonthlySpend.exponent
    && Number.isSafeInteger(input.reservedConcurrency)
    && input.reservedConcurrency >= 0
}

function total(window: CredentialBudgetWindowUsage): ExactAmount | undefined {
  return addExactAmounts(window.settledSpend, window.reservedSpend)
}

function reserveWindow(window: CredentialBudgetWindowUsage, amount: ExactAmount): CredentialBudgetWindowUsage | undefined {
  const reserved = addExactAmounts(window.reservedSpend, amount)
  return reserved === undefined ? undefined : { ...window, reservedSpend: reserved }
}

function settleWindow(window: CredentialBudgetWindowUsage, amount: ExactAmount): CredentialBudgetWindowUsage | undefined {
  const reserved = subtractExactAmounts(window.reservedSpend, amount)
  const settled = addExactAmounts(window.settledSpend, amount)
  return reserved === undefined || settled === undefined ? undefined : { settledSpend: settled, reservedSpend: reserved }
}

function releaseWindow(window: CredentialBudgetWindowUsage, amount: ExactAmount): CredentialBudgetWindowUsage | undefined {
  const reserved = subtractExactAmounts(window.reservedSpend, amount)
  return reserved === undefined ? undefined : { ...window, reservedSpend: reserved }
}

export function admitCredentialBudget(input: Readonly<{
  policy: CredentialBudgetPolicy
  usage: CredentialBudgetUsage
  amount: ExactAmount
}>): CredentialBudgetAdmission {
  const { policy, usage, amount } = input
  if (!validPolicy(policy) || !validUsage(usage, policy) || !exactAmountSchema.safeParse(amount).success) return { kind: 'refused', code: 'budget_policy_invalid' }
  if (amount.currency !== policy.maximumSpendPerInvocation.currency
    || amount.exponent !== policy.maximumSpendPerInvocation.exponent) return { kind: 'refused', code: 'budget_currency_mismatch' }
  if (compareExactAmounts(amount, policy.maximumSpendPerInvocation) === undefined) return { kind: 'refused', code: 'budget_currency_mismatch' }
  if (compareExactAmounts(amount, policy.maximumSpendPerInvocation) === 1) return { kind: 'refused', code: 'budget_invocation_limit_exceeded' }
  if (usage.reservedConcurrency >= policy.maximumConcurrentInvocations) return { kind: 'refused', code: 'budget_concurrency_exhausted' }
  const nextDaily = reserveWindow(usage.daily, amount)
  const nextMonthly = reserveWindow(usage.monthly, amount)
  if (nextDaily === undefined || nextMonthly === undefined) return { kind: 'refused', code: 'budget_policy_invalid' }
  const dailyTotal = total(nextDaily)
  if (dailyTotal === undefined || compareExactAmounts(dailyTotal, policy.maximumDailySpend) === undefined) return { kind: 'refused', code: 'budget_currency_mismatch' }
  if (compareExactAmounts(dailyTotal, policy.maximumDailySpend) === 1) return { kind: 'refused', code: 'budget_daily_limit_exceeded' }
  const monthlyTotal = total(nextMonthly)
  if (monthlyTotal === undefined || compareExactAmounts(monthlyTotal, policy.maximumMonthlySpend) === undefined) return { kind: 'refused', code: 'budget_currency_mismatch' }
  if (compareExactAmounts(monthlyTotal, policy.maximumMonthlySpend) === 1) return { kind: 'refused', code: 'budget_monthly_limit_exceeded' }
  return {
    kind: 'accepted',
    usage: {
      daily: nextDaily,
      monthly: nextMonthly,
      reservedConcurrency: usage.reservedConcurrency + 1,
    },
  }
}

export function settleCredentialBudget(input: Readonly<{
  usage: CredentialBudgetUsage
  amount: ExactAmount
}>): CredentialBudgetAdmission {
  const daily = settleWindow(input.usage.daily, input.amount)
  const monthly = settleWindow(input.usage.monthly, input.amount)
  if (daily === undefined || monthly === undefined || input.usage.reservedConcurrency <= 0) return { kind: 'refused', code: 'budget_reservation_conflict' }
  return {
    kind: 'accepted',
    usage: { daily, monthly, reservedConcurrency: input.usage.reservedConcurrency - 1 },
  }
}

export function releaseCredentialBudget(input: Readonly<{
  usage: CredentialBudgetUsage
  amount: ExactAmount
}>): CredentialBudgetAdmission {
  const daily = releaseWindow(input.usage.daily, input.amount)
  const monthly = releaseWindow(input.usage.monthly, input.amount)
  if (daily === undefined || monthly === undefined || input.usage.reservedConcurrency <= 0) return { kind: 'refused', code: 'budget_reservation_conflict' }
  return {
    kind: 'accepted',
    usage: { daily, monthly, reservedConcurrency: input.usage.reservedConcurrency - 1 },
  }
}
export function reverseCredentialBudget(input: Readonly<{
  usage: CredentialBudgetUsage
  amount: ExactAmount
}>): CredentialBudgetAdmission {
  const dailySettled = subtractExactAmounts(input.usage.daily.settledSpend, input.amount)
  const monthlySettled = subtractExactAmounts(input.usage.monthly.settledSpend, input.amount)
  if (dailySettled === undefined || monthlySettled === undefined) {
    return { kind: 'refused', code: 'budget_reservation_conflict' }
  }
  return {
    kind: 'accepted',
    usage: {
      daily: { settledSpend: dailySettled, reservedSpend: input.usage.daily.reservedSpend },
      monthly: { settledSpend: monthlySettled, reservedSpend: input.usage.monthly.reservedSpend },
      reservedConcurrency: input.usage.reservedConcurrency,
    },
  }
}

export function credentialBudgetReservationDigest(reservation: Omit<CredentialBudgetReservation, 'state' | 'updatedAt'>): string {
  return canonicalDigest({ contract: 'ae.money-credential-budget-reservation:v1', ...reservation })
}