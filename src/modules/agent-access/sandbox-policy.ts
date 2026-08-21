import { rescaleExactAmount, type ExactAmount } from '@/modules/money/public'

import { buildAgentAccessPolicy, type AgentAccessPolicy } from './policy'

/** $1 / call, $5 / day, $20 / month. Connect and labelled-local invoke use this file. */
const SANDBOX_SPEND_AT_CENTS = {
  perInvocation: { units: '100', exponent: 2 },
  daily: { units: '500', exponent: 2 },
  monthly: { units: '2000', exponent: 2 },
} as const

function sandboxSpend(currency: string, exponent: number, units: string): ExactAmount {
  const amount = rescaleExactAmount({ currency, units, exponent: SANDBOX_SPEND_AT_CENTS.perInvocation.exponent }, exponent)
  if (amount === undefined) {
    throw new Error('sandbox_spend_unrepresentable')
  }
  return amount
}

export function defaultSandboxAgentAccessPolicy(input: Readonly<{
  currency: string
  exponent: number
}>): AgentAccessPolicy {
  return buildAgentAccessPolicy({
    environment: 'sandbox',
    currency: input.currency,
    exponent: input.exponent,
    maximumSpendPerInvocation: sandboxSpend(input.currency, input.exponent, SANDBOX_SPEND_AT_CENTS.perInvocation.units),
    maximumDailySpend: sandboxSpend(input.currency, input.exponent, SANDBOX_SPEND_AT_CENTS.daily.units),
    maximumMonthlySpend: sandboxSpend(input.currency, input.exponent, SANDBOX_SPEND_AT_CENTS.monthly.units),
  })
}
