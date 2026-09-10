import { describe, expect, it } from 'vitest'

import {
  parseOwnerToolsCompatibilitySearch,
  parseSupplyCompatibilityIntent,
  parseSupplyCompatibilityIntentFromUrl,
} from '@/lib/operator/supply-compatibility'

describe('legacy supplier intent parser', () => {
  it('returns the complete typed x402 handoff search', () => {
    expect(parseOwnerToolsCompatibilitySearch({
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST',
      environment: 'sandbox',
    })).toEqual({
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST',
      environment: 'sandbox',
    })
  })

  it('retains the supported compatibility intents and the bounded x402 handoff', () => {
    expect(parseSupplyCompatibilityIntent({}, 'earnings')).toEqual({ search: {}, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ connect: 'return' }, '')).toEqual({ search: { connect: 'return' }, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ connect: 'refresh' }, '')).toEqual({ search: { connect: 'refresh' }, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ rebind: 'offering:one' }, 'provider-connection-connection:one')).toEqual({ search: { rebind: 'offering:one' }, hash: 'provider-connection-connection:one' })
    expect(parseSupplyCompatibilityIntent({
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST',
      environment: 'sandbox',
    }, '')).toEqual({ search: {
      connect: 'x402',
      draft: `sha256:${'a'.repeat(64)}`,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST',
      environment: 'sandbox',
    } })
  })

  it.each([
    [{ next: 'https://evil.example' }, ''],
    [{ redirect: '/admin' }, ''],
    [{ slug: 'foreign' }, ''],
    [{ businessId: 'biz_other' }, ''],
    [{ connect: 'return', credential: 'secret' }, ''],
    [{ connect: 'x402', draft: `sha256:${'a'.repeat(64)}`, resourceUrl: 'https://seller.example/paid', method: 'POST', environment: 'sandbox', extra: 'ignored' }, ''],
    [{ connect: 'x402', draft: 'foreign', resourceUrl: 'https://seller.example/paid', method: 'POST', environment: 'sandbox' }, ''],
    [{ connect: 'x402', draft: `sha256:${'a'.repeat(64)}`, resourceUrl: 'http://seller.example/paid', method: 'POST', environment: 'sandbox' }, ''],
    [{ rebind: 'offering:one' }, 'provider-connection-https://evil.example'],
    [{ rebind: '' }, 'provider-connection-connection:one'],
  ])('drops arbitrary input %#', (search, hash) => {
    expect(parseSupplyCompatibilityIntent(search, hash)).toEqual({ search: {} })
  })

  it('uses the raw URL search so extra and duplicate keys cannot be hidden by route validation', () => {
    expect(parseSupplyCompatibilityIntentFromUrl('?rebind=offering%3Aone', 'provider-connection-connection:one'))
      .toEqual({ search: { rebind: 'offering:one' }, hash: 'provider-connection-connection:one' })
    expect(parseSupplyCompatibilityIntentFromUrl('?rebind=offering%3Aone', ''))
      .toEqual({ search: { rebind: 'offering:one' } })
    expect(parseSupplyCompatibilityIntentFromUrl('?rebind=offering%3Aone&businessId=foreign', 'provider-connection-connection:one'))
      .toEqual({ search: {} })
    expect(parseSupplyCompatibilityIntentFromUrl('?connect=return&connect=return', ''))
      .toEqual({ search: {} })
    expect(parseSupplyCompatibilityIntentFromUrl(`?connect=x402&draft=sha256%3A${'a'.repeat(64)}&resourceUrl=https%3A%2F%2Fseller.example%2Fpaid&method=POST&environment=sandbox`, ''))
      .toEqual({ search: {
        connect: 'x402',
        draft: `sha256:${'a'.repeat(64)}`,
        resourceUrl: 'https://seller.example/paid',
        method: 'POST',
        environment: 'sandbox',
      } })
  })
})
