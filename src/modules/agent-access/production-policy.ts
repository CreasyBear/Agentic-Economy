import { z } from 'zod'

import {
  compareExactAmounts,
  currencySchema,
  exactAmountSchema,
  type ExactAmount,
} from '@/modules/money/public'

import {
  agentAccessPolicySchema,
  buildAgentAccessPolicy,
  type AgentAccessPolicy,
} from './policy'

const productionCeilingSchema = z.strictObject({
  currency: currencySchema,
  exponent: z.number().int().min(0).max(18),
  maximumSpendPerInvocation: exactAmountSchema,
  maximumDailySpend: exactAmountSchema,
  maximumMonthlySpend: exactAmountSchema,
}).superRefine((value, context) => {
  const amounts = [
    value.maximumSpendPerInvocation,
    value.maximumDailySpend,
    value.maximumMonthlySpend,
  ]

  for (const [index, amount] of amounts.entries()) {
    if (amount.currency !== value.currency || amount.exponent !== value.exponent) {
      context.addIssue({
        code: 'custom',
        message: 'production_budget_currency_mismatch',
        path: [index === 0 ? 'maximumSpendPerInvocation' : index === 1 ? 'maximumDailySpend' : 'maximumMonthlySpend'],
      })
    }
    if (amount.units === '0') {
      context.addIssue({
        code: 'custom',
        message: 'production_budget_must_be_positive',
        path: [index === 0 ? 'maximumSpendPerInvocation' : index === 1 ? 'maximumDailySpend' : 'maximumMonthlySpend'],
      })
    }
  }

  if (compareExactAmounts(value.maximumSpendPerInvocation, value.maximumDailySpend) === 1) {
    context.addIssue({
      code: 'custom',
      message: 'production_per_invocation_exceeds_daily',
      path: ['maximumSpendPerInvocation'],
    })
  }
  if (compareExactAmounts(value.maximumDailySpend, value.maximumMonthlySpend) === 1) {
    context.addIssue({
      code: 'custom',
      message: 'production_daily_exceeds_monthly',
      path: ['maximumDailySpend'],
    })
  }
})

export type ProductionAgentAccessPolicyInput = Readonly<{
  currency: string
  exponent: number
  maximumSpendPerInvocation: ExactAmount
  maximumDailySpend: ExactAmount
  maximumMonthlySpend: ExactAmount
}>

export function defaultProductionAgentAccessPolicy(input: Readonly<{
  currency: string
  exponent: number
}>): AgentAccessPolicy {
  const zero: ExactAmount = { currency: input.currency, units: '0', exponent: input.exponent }
  return buildAgentAccessPolicy({
    environment: 'production',
    currency: input.currency,
    exponent: input.exponent,
    maximumSpendPerInvocation: zero,
    maximumDailySpend: zero,
    maximumMonthlySpend: zero,
  })
}

/** Build an explicitly bounded production policy. The zero default above is intentionally fail-safe. */
export function buildProductionAgentAccessPolicy(input: ProductionAgentAccessPolicyInput): AgentAccessPolicy {
  const parsed = productionCeilingSchema.parse(input)
  return agentAccessPolicySchema.parse(buildAgentAccessPolicy({
    environment: 'production',
    currency: parsed.currency,
    exponent: parsed.exponent,
    maximumSpendPerInvocation: parsed.maximumSpendPerInvocation,
    maximumDailySpend: parsed.maximumDailySpend,
    maximumMonthlySpend: parsed.maximumMonthlySpend,
  }))
}
