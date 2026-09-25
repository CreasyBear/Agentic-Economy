import { describe, expect, it } from 'vitest'

import { BASE_FACILITATOR_ADDRESSES } from '@/modules/market/base-facilitator-set'
import {
  buildFlowDaySql, buildFlowPayeeWindowSql, daysToIngest, formatUsdcAtomic, parseFlowPayeeWindow, parseFlowSqlResult, rollupRecipientFlow,
} from '@/modules/market/flow-tape'

const DAY = '2026-08-01'
const FACILITATOR = BASE_FACILITATOR_ADDRESSES[0]
const RECIPIENT = '0xabababababababababababababababababababab'
const NOW = Date.parse('2026-09-23T12:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    recipient: RECIPIENT,
    facilitator: FACILITATOR,
    amount_atomic: '1000000',
    transfer_count: 1,
    unique_buyers: 1,
    latest_at: 1,
    day: DAY,
    ...overrides,
  }
}

describe('flow day sql', () => {
  it('asks CDP for one closed UTC day of Base USDC through the checked facilitator set', () => {
    const sql = buildFlowDaySql(DAY)
    expect(sql).toContain("event_signature = 'Transfer(address,address,uint256)'")
    expect(sql).toContain('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
    expect(sql).toContain(`${DAY} 00:00:00`)
    expect(sql).toContain('2026-08-02 00:00:00')
    expect(sql).toContain(FACILITATOR)
    expect(sql).toContain('0x8f5cb67b49555e614892b7233cfddebfb746e531')
  })

  it('asks for the shown payees across the closed 30-day window', () => {
    const sql = buildFlowPayeeWindowSql([RECIPIENT, RECIPIENT.toUpperCase()], NOW)
    expect(sql).toContain('2026-08-24 00:00:00')
    expect(sql).toContain('2026-09-23 00:00:00')
    expect(sql).toContain(RECIPIENT)
    expect(sql.split(RECIPIENT)).toHaveLength(2)
    expect(sql).toContain(FACILITATOR)
    expect(() => buildFlowPayeeWindowSql(['not-an-address'], NOW)).toThrow('payee_not_address')
    expect(parseFlowPayeeWindow([{ recipient: RECIPIENT, amount_atomic: '1500000' }], new Set([RECIPIENT]))).toEqual({
      ok: true, rows: [{ recipient: RECIPIENT, amountAtomic: '1500000' }],
    })
    expect(parseFlowPayeeWindow([{ recipient: RECIPIENT, amount_atomic: '1.5' }], new Set([RECIPIENT])).ok).toBe(false)
    expect(parseFlowPayeeWindow([{ recipient: '0x1111111111111111111111111111111111111111', amount_atomic: '1' }], new Set([RECIPIENT])).ok).toBe(false)
  })

  it('walks the previous 30 closed days, then only the days still missing', () => {
    const first = daysToIngest(undefined, NOW)
    expect(first).toHaveLength(30)
    expect(first[0]).toBe('2026-08-24')
    expect(first.at(-1)).toBe('2026-09-22')
    expect(daysToIngest('2026-09-22', NOW)).toEqual([])
    expect(daysToIngest('2026-09-21', NOW)).toEqual(['2026-09-22'])
  })
})

describe('parseFlowSqlResult', () => {
  it('rejects a non-integer amount, a recipient that is not an address, and a day outside the requested window', () => {
    expect(parseFlowSqlResult([row({ amount_atomic: '1.5' })], DAY)).toEqual({ ok: false, reason: 'amount_not_integer' })
    expect(parseFlowSqlResult([row({ recipient: 'not-an-address' })], DAY)).toEqual({ ok: false, reason: 'recipient_not_address' })
    expect(parseFlowSqlResult([row({ day: '2026-08-02' })], DAY)).toEqual({ ok: false, reason: 'day_mismatch' })
    expect(parseFlowSqlResult([row()], DAY).ok).toBe(true)
    expect(parseFlowSqlResult([], DAY)).toEqual({ ok: true, rows: [] })
  })
})

describe('rollupRecipientFlow', () => {
  it('sums atomic strings without floating point, and does not double a recipient total when two Tools pay it', () => {
    const facilitator = FACILITATOR ?? RECIPIENT
    const rolled = rollupRecipientFlow([
      { recipient: RECIPIENT, facilitator, day: '2026-08-01', amountAtomic: '9007199254740993', transferCount: 2, uniqueBuyers: 1 },
      { recipient: RECIPIENT, facilitator, day: '2026-08-02', amountAtomic: '1', transferCount: 1, uniqueBuyers: 1 },
    ], new Map([[RECIPIENT, 2]]))
    expect(rolled).toEqual([{
      recipient: RECIPIENT,
      amountAtomic: '9007199254740994',
      transferCount: 3,
      uniqueBuyers: 2,
      toolCount: 2,
    }])
    expect(formatUsdcAtomic('1500000')).toBe('1.5 USDC')
    expect(formatUsdcAtomic('1000000')).toBe('1 USDC')
  })
})
