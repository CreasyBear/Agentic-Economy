import { describe, expect, it } from 'vitest'

import { evaluateAutoRechargeDecision } from '@/modules/money/internal/auto-recharge-decision'

const THRESHOLD_UNITS = 20_000_000
const COOLDOWN_MS = 5 * 60_000

function baseTriggerInput(
  overrides: Partial<Parameters<typeof evaluateAutoRechargeDecision>[0]> = {},
) {
  return {
    enabled: true,
    balanceUnits: 19_999_999,
    thresholdUnits: THRESHOLD_UNITS,
    mandateState: 'ready' as const,
    now: 1_000_000,
    chargesOnUtcDate: 0,
    utcDateKey: '2026-09-18',
    ...overrides,
  }
}

describe('evaluateAutoRechargeDecision (W-21)', () => {
  it('D1: enabled false returns skip disabled', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      enabled: false,
    })).toEqual({ kind: 'skip', code: 'disabled' })
  })

  it('D2: balance equal to threshold returns skip above_threshold (strict less-than)', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      balanceUnits: THRESHOLD_UNITS,
    })).toEqual({ kind: 'skip', code: 'above_threshold' })
  })

  it('D3: balance below threshold with ready mandate and no blockers returns trigger', () => {
    expect(evaluateAutoRechargeDecision(baseTriggerInput())).toEqual({ kind: 'trigger' })
  })

  it('D4: pendingTopup present returns skip pending_topup', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      pendingTopup: { commandRef: 'auto-recharge:pending-one' },
    })).toEqual({ kind: 'skip', code: 'pending_topup' })
  })

  it('D5: inFlightCommandRef set returns skip in_flight', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      inFlightCommandRef: 'auto-recharge:in-flight-one',
    })).toEqual({ kind: 'skip', code: 'in_flight' })
  })

  it('D6: within cooldown window returns skip cooldown', () => {
    const now = 2_000_000
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      now,
      lastTriggeredAt: now - (COOLDOWN_MS - 1),
    })).toEqual({ kind: 'skip', code: 'cooldown' })
  })

  it('D7: three charges on the same UTC date returns skip daily_charge_cap', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      chargesOnUtcDate: 3,
      utcDateKey: '2026-09-18',
    })).toEqual({ kind: 'skip', code: 'daily_charge_cap' })
  })

  it('D8: new UTC date with zero charges today returns trigger even if prior day hit cap', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      chargesOnUtcDate: 0,
      utcDateKey: '2026-09-19',
    })).toEqual({ kind: 'trigger' })
  })

  it('D9: mandate missing returns skip mandate_missing', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      mandateState: 'missing',
    })).toEqual({ kind: 'skip', code: 'mandate_missing' })
  })

  it('D10: mandate authentication_required returns skip mandate_authentication_required', () => {
    expect(evaluateAutoRechargeDecision({
      ...baseTriggerInput(),
      mandateState: 'authentication_required',
    })).toEqual({ kind: 'skip', code: 'mandate_authentication_required' })
  })
})
