import { describe, expect, it } from 'vitest'

import {
  actionMessage,
  expressStatusExplanation,
  payoutAccountLabel,
  payoutStateLabel,
  projectEarningsAccount,
  projectEarningsList,
  ssoFailureNextStep,
} from './earnings-projection'

const exact = { currency: 'USD', units: '5000', exponent: 2 }

function availableAccount(overrides: Record<string, unknown> = {}) {
  return {
    currency: 'USD',
    earnings: {
      kind: 'ok' as const,
      businessId: 'business-1',
      grossAccrual: exact,
      rake: { ...exact, units: '50' },
      providerNet: exact,
      paidOut: { ...exact, units: '0' },
      held: exact,
      recoveryDue: { ...exact, units: '0' },
      truncated: false,
      evidence: 'source' as const,
    },
    payout: {
      kind: 'ok' as const,
      businessId: 'business-1',
      accountState: 'ready' as const,
      payoutState: 'held_threshold' as const,
      payoutRef: 'payout-1',
      payoutRevision: 1,
      accountVersion: 2,
      idempotencyKey: 'idem-1',
      providerNet: exact,
      minimumPayout: { ...exact, units: '1000' },
      evidence: 'source' as const,
      stripeAccountId: 'acct_test1234',
      ...overrides,
    },
  }
}

describe('earnings-projection', () => {
  it('projectEarningsList maps error readback', () => {
    expect(
      projectEarningsList({ kind: 'error', code: 'unauthenticated' }),
    ).toEqual({ kind: 'error', code: 'unauthenticated' })
  })

  it('projectEarningsAccount derives canApprovePayout when threshold met', () => {
    const { display, bindings } = projectEarningsAccount(
      availableAccount() as never,
      undefined,
      'business-1',
    )
    expect(display.canApprovePayout).toBe(true)
    expect(bindings.canApprovePayout).toBe(true)
    expect(display.showReviewPayout).toBe(true)
    expect(display.stripeMaskLabel).toBe('acct_••••1234')
  })

  it('projectEarningsAccount withholds approval below minimum', () => {
    const { display } = projectEarningsAccount(
      availableAccount({
        providerNet: { ...exact, units: '100' },
      }) as never,
      undefined,
      'business-1',
    )
    expect(display.canApprovePayout).toBe(false)
    expect(display.isWaitingForMinimumPayout).toBe(true)
  })

  it('actionMessage maps refusal codes', () => {
    expect(actionMessage('billing_identity_missing')).toContain('Sign in again')
    expect(actionMessage('stripe_setup_required')).toContain('Stripe payout setup')
    expect(actionMessage('other')).toContain('refused')
  })

  it('expressStatusExplanation and labels stay stable', () => {
    expect(expressStatusExplanation('ready')).toContain('Manage bank account')
    expect(payoutAccountLabel('not_started')).toBe('not started')
    expect(payoutStateLabel(undefined)).toBe('No payout recorded')
    expect(ssoFailureNextStep('payout_not_ready')).toContain('verification')
  })
})
