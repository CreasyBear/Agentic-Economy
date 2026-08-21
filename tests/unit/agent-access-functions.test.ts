import { describe, expect, it } from 'vitest'

import { buildOwnerAgentAccessPolicy } from '@/modules/agent-access/agent-access.functions'

const amount = (units: string) => ({ currency: 'USD', units, exponent: 2 })

describe('owner agent-access issuance policy', () => {
  it('builds explicit bounded production spend, rate, and concurrency limits', () => {
    const policy = buildOwnerAgentAccessPolicy({
      environment: 'production',
      maximumSpendPerInvocation: amount('100'),
      maximumDailySpend: amount('500'),
      maximumMonthlySpend: amount('2000'),
      maximumConcurrentInvocations: 2,
      maximumCallsPerMinute: 10,
      maximumCallsPerHour: 100,
    })
    expect(policy.environment).toBe('production')
    expect(policy.budget.maximumSpendPerInvocation).toEqual(amount('100'))
    expect(policy.budget.maximumDailySpend).toEqual(amount('500'))
    expect(policy.budget.maximumMonthlySpend).toEqual(amount('2000'))
    expect(policy.budget.maximumConcurrentInvocations).toBe(2)
    expect(policy.rate.maximumCallsPerMinute).toBe(10)
    expect(policy.rate.maximumCallsPerHour).toBe(100)
  })

  it('keeps the production default fail-safe when no explicit budgets are supplied', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'production' })
    expect(policy.budget.maximumSpendPerInvocation).toEqual(amount('0'))
    expect(policy.budget.maximumDailySpend).toEqual(amount('0'))
    expect(policy.budget.maximumMonthlySpend).toEqual(amount('0'))
  })

  it('does not replace sandbox policy limits with production zero defaults', () => {
    const policy = buildOwnerAgentAccessPolicy({ environment: 'sandbox' })
    expect(policy.budget.maximumSpendPerInvocation.units).not.toBe('0')
  })
})
