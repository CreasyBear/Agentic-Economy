import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FixtureMarket, AUDIT_REF } from '../../../experiments/chat-trial/fixture-market'
import { toolQuoteResultSchema } from '@/modules/capability-execution/quote'

function quote(market: FixtureMarket, requestId: string) {
  const result = toolQuoteResultSchema.parse(market.execute('test', 'tool.quote',
    { toolRef: AUDIT_REF, input: { url: 'https://example.com' } }, requestId))
  if (result.kind !== 'committed') throw new Error('fixture_quote_missing')
  return result
}

describe('synthetic market preserves the purchase invariants being compared', () => {
  it('rejects one idempotency identity used for different Quotes', () => {
    const market = new FixtureMarket(); market.create({ id: 'test', mode: 'active' })
    const first = quote(market, 'first'), second = quote(market, 'second')
    const key = 'same-client-command'
    expect(market.execute('test', 'tool.call', { quoteRef: first.quoteRef, idempotencyKey: key })).toMatchObject({ kind: 'completed' })
    expect(market.execute('test', 'tool.call', { quoteRef: second.quoteRef, idempotencyKey: key }))
      .toMatchObject({ kind: 'refused', code: 'idempotency_conflict' })
    expect(market.inspect('test').dispatches).toBe(1)
  })

  it('retains an uncertain Call until the simulated Provider explicitly completes it', () => {
    const market = new FixtureMarket(); market.create({ id: 'test', mode: 'held_uncertain' })
    const selected = quote(market, 'first')
    const first = z.object({ kind: z.literal('outcome_unknown'), callRef: z.string() })
      .parse(market.execute('test', 'tool.call', selected.continuation.args))
    expect(market.execute('test', 'call.status', { callRef: first.callRef })).toMatchObject(first)
    expect(market.execute('test', 'tool.call', selected.continuation.args)).toMatchObject(first)
    expect(market.inspect('test').dispatches).toBe(1)
    market.complete('test')
    expect(market.execute('test', 'call.status', { callRef: first.callRef }))
      .toMatchObject({ kind: 'completed', callRef: first.callRef })
  })

  it('refuses an expired Quote before dispatch', () => {
    const market = new FixtureMarket(); market.create({ id: 'test', mode: 'active' })
    const selected = quote(market, 'first')
    market.expireQuotes('test')
    const expired = market.inspect('test').quotes[0]
    expect(quote(market, 'first').expiresAt).toBe(expired?.expiresAt)
    expect(market.execute('test', 'tool.call', selected.continuation.args))
      .toMatchObject({ kind: 'refused', code: 'price_changed' })
    expect(market.inspect('test').dispatches).toBe(0)
  })
})
