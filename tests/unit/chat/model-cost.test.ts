import { describe, expect, it } from 'vitest'
import { isChatModelCostModel, parseModelCostUsd, sumModelCostUsd } from '@/modules/chat/model-cost'

describe('reported model USD amounts', () => {
  it.each([
    [0, '0'], [0.1, '0.1'], ['000.1000', '0.1'], ['1e-7', '0.0000001'],
    ['999999999999999999.999999999999999999999999999999', '999999999999999999.999999999999999999999999999999'],
    ['0.000000000000000000000000000001', '0.000000000000000000000000000001'],
  ])('keeps exact finite nonnegative reported %j', (input, expected) => {
    expect(parseModelCostUsd(input)).toBe(expected)
  })

  it.each([undefined, null, {}, '', 'NaN', Infinity, Number.NaN, -1, '-0.01', '1e18', '1e-31', '1e999', '1 USD'])('refuses absent, malformed or out-of-bound amount %j', value => {
      expect(parseModelCostUsd(value)).toBeUndefined()
    })

  it('sums tiny and large actual costs without binary rounding or Decimal precision loss', () => {
    expect(sumModelCostUsd(['0.1', '0.2', '0.000000000000000000000000000001']))
      .toBe('0.300000000000000000000000000001')
    expect(sumModelCostUsd(Array.from({ length: 256 }, () => '999999999999999999.999999999999999999999999999999')))
      .toBe('255999999999999999999.999999999999999999999999999744')
    expect(() => sumModelCostUsd(Array.from({ length: 257 }, () => '0'))).toThrow('model_cost_limit_exceeded')
    expect(() => sumModelCostUsd(['unavailable'])).toThrow('model_cost_amount_invalid')
  })

  it('preserves the actual Jev model identifier and rejects arbitrary metadata', () => {
    expect(isChatModelCostModel('~typesafe/jev-latest')).toBe(true)
    expect(isChatModelCostModel('anthropic/claude-sonnet-4')).toBe(true)
    expect(isChatModelCostModel('model with prompt text')).toBe(false)
    expect(isChatModelCostModel('x'.repeat(201))).toBe(false)
  })
})
