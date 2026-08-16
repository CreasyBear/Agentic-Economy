import { RateLimiter } from '@convex-dev/rate-limiter'
import { describe, expect, it, vi } from 'vitest'

import { assertAgentAccessRateAdmission } from '../../../convex/lib/rateLimit'
import {
  admitCredentialBudget,
  credentialBudgetReservationDigest,
  reverseCredentialBudget,
  releaseCredentialBudget,
  settleCredentialBudget,
  type CredentialBudgetPolicy,
  type CredentialBudgetReservation,
  type CredentialBudgetUsage,
} from '../../../src/modules/money/internal/credential-budget'
import type { ExactAmount } from '../../../src/modules/money/public'

const amount = (units: string): ExactAmount => ({ currency: 'USD', units, exponent: 2 })
const policy: CredentialBudgetPolicy = {
  budgetPolicyRef: 'budget-1',
  generation: 1,
  maximumSpendPerInvocation: amount('500'),
  maximumDailySpend: amount('1000'),
  maximumMonthlySpend: amount('2000'),
  maximumConcurrentInvocations: 1,
}
const emptyUsage = (): CredentialBudgetUsage => ({
  daily: { settledSpend: amount('0'), reservedSpend: amount('0') },
  monthly: { settledSpend: amount('0'), reservedSpend: amount('0') },
  reservedConcurrency: 0,
})

function reserve(usage: CredentialBudgetUsage, units = '500') {
  return admitCredentialBudget({ policy, usage, amount: amount(units) })
}

describe('credential budget admission', () => {
  it('reserves concurrency for zero/free work and releases it only at terminal no-send', () => {
    const reserved = admitCredentialBudget({ policy, usage: emptyUsage(), amount: amount('0') })
    expect(reserved).toMatchObject({ kind: 'accepted', usage: { reservedConcurrency: 1 } })
    if (reserved.kind === 'refused') return
    expect(admitCredentialBudget({ policy, usage: reserved.usage, amount: amount('0') })).toEqual({ kind: 'refused', code: 'budget_concurrency_exhausted' })
    const released = releaseCredentialBudget({ usage: reserved.usage, amount: amount('0') })
    expect(released).toMatchObject({ kind: 'accepted', usage: { reservedConcurrency: 0 } })
  })

  it('enforces per-call, daily, monthly, and concurrent limits', () => {
    expect(reserve(emptyUsage(), '501')).toEqual({ kind: 'refused', code: 'budget_invocation_limit_exceeded' })
    const dailyLimited = { ...emptyUsage(), daily: { settledSpend: amount('501'), reservedSpend: amount('0') } }
    expect(reserve(dailyLimited)).toEqual({ kind: 'refused', code: 'budget_daily_limit_exceeded' })
    const monthlyLimited = { ...emptyUsage(), monthly: { settledSpend: amount('1501'), reservedSpend: amount('0') } }
    expect(reserve(monthlyLimited)).toEqual({ kind: 'refused', code: 'budget_monthly_limit_exceeded' })
    expect(reserve({ ...emptyUsage(), reservedConcurrency: 1 })).toEqual({ kind: 'refused', code: 'budget_concurrency_exhausted' })
  })

  it('keeps an unknown reservation exposed until reconciliation settles or releases it', () => {
    const reserved = reserve(emptyUsage())
    expect(reserved.kind).toBe('accepted')
    if (reserved.kind === 'refused') return
    expect(reserve(reserved.usage)).toEqual({ kind: 'refused', code: 'budget_concurrency_exhausted' })
    const settled = settleCredentialBudget({ usage: reserved.usage, amount: amount('500') })
    expect(settled).toMatchObject({ kind: 'accepted', usage: { reservedConcurrency: 0 } })
    if (settled.kind === 'refused') return
    expect(settled.usage.daily).toEqual({ settledSpend: amount('500'), reservedSpend: amount('0') })
  })

  it('keeps replay identity stable and isolates distinct credentials', () => {
    const reservation: Omit<CredentialBudgetReservation, 'state' | 'updatedAt'> = {
      reservationRef: 'reservation-1',
      transactionRef: 'transaction-1',
      principalId: 'principal-1',
      credentialId: 'credential-1',
      budgetPolicyRef: 'budget-1',
      generation: 1,
      amount: amount('500'),
      dayStart: '2026-08-09',
      monthStart: '2026-08',
      createdAt: 1,
    }
    expect(credentialBudgetReservationDigest(reservation)).toBe(credentialBudgetReservationDigest(reservation))
    expect(credentialBudgetReservationDigest({ ...reservation, credentialId: 'credential-2' })).not.toBe(credentialBudgetReservationDigest(reservation))
    expect(reserve(emptyUsage())).toMatchObject({ kind: 'accepted' })
    expect(reserve(emptyUsage())).toMatchObject({ kind: 'accepted' })
  })
  it('reverses settled spend without restoring concurrency or touching reserved spend', () => {
    const reversed = reverseCredentialBudget({
      usage: {
        daily: { settledSpend: amount('500'), reservedSpend: amount('0') },
        monthly: { settledSpend: amount('500'), reservedSpend: amount('0') },
        reservedConcurrency: 0,
      },
      amount: amount('500'),
    })
    expect(reversed).toEqual({
      kind: 'accepted',
      usage: {
        daily: { settledSpend: amount('0'), reservedSpend: amount('0') },
        monthly: { settledSpend: amount('0'), reservedSpend: amount('0') },
        reservedConcurrency: 0,
      },
    })
    expect(reverseCredentialBudget({
      usage: emptyUsage(),
      amount: amount('500'),
    })).toEqual({ kind: 'refused', code: 'budget_reservation_conflict' })
  })
  it('rate-admits through the canonical application credential key', async () => {
    const limit = vi.spyOn(RateLimiter.prototype, 'limit').mockResolvedValue({ ok: true })
    try {
      await expect(assertAgentAccessRateAdmission({} as never, {
        applicationRef: 'app-1',
        credentialId: 'credential-1',
        maximumCallsPerMinute: 30,
        maximumCallsPerHour: 300,
      })).resolves.toEqual({ ok: true })
      expect(limit).toHaveBeenCalledTimes(2)
      expect(limit.mock.calls[0]?.[2]).toMatchObject({ key: 'agent-access:app-1:credential-1' })
      expect(limit.mock.calls[1]?.[2]).toMatchObject({ key: 'agent-access:app-1:credential-1' })
    } finally {
      limit.mockRestore()
    }
  })
})
