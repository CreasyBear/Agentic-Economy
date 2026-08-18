import { describe, expect, it } from 'vitest'

import { runDailySupplierSettlement } from '../../../convex/moneyLedger'
import { evaluateLiveMoneyGate } from '../../../src/modules/money/public'

type Handler = (
  ctx: unknown,
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }

const dailySettle = (runDailySupplierSettlement as unknown as HandlerExport)
  ._handler

describe('daily supplier settlement skip-at-gate', () => {
  it('returns a named skip when the live-money gate is open and does not throw on replay', async () => {
    const gate = evaluateLiveMoneyGate()
    if (gate.kind !== 'refused') {
      throw new Error('expected_live_money_gate_open')
    }
    const ctx = {
      db: null,
      auth: { getUserIdentity: async () => null },
    }
    const first = await dailySettle(ctx, {})
    const replay = await dailySettle(ctx, {})
    expect(first).toEqual({ kind: 'skipped', code: gate.code })
    expect(replay).toEqual(first)
  })
})
