import { describe, expect, it } from 'vitest'

import {
  parseSupplyCompatibilityIntent,
  parseSupplyCompatibilityIntentFromUrl,
} from '@/lib/operator/supply-compatibility'

describe('legacy supplier intent parser', () => {
  it('retains only the four supported compatibility intents', () => {
    expect(parseSupplyCompatibilityIntent({}, 'earnings')).toEqual({ search: {}, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ connect: 'return' }, '')).toEqual({ search: { connect: 'return' }, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ connect: 'refresh' }, '')).toEqual({ search: { connect: 'refresh' }, hash: 'earnings' })
    expect(parseSupplyCompatibilityIntent({ rebind: 'offering:one' }, 'provider-connection-connection:one')).toEqual({ search: { rebind: 'offering:one' }, hash: 'provider-connection-connection:one' })
  })

  it.each([
    [{ next: 'https://evil.example' }, ''],
    [{ redirect: '/admin' }, ''],
    [{ slug: 'foreign' }, ''],
    [{ businessId: 'biz_other' }, ''],
    [{ connect: 'return', credential: 'secret' }, ''],
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
  })
})
