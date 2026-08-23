import { describe, expect, it } from 'vitest'

import { HOME } from '@/content/brand-copy'
describe('catalog example asks', () => {
  it('keeps homepage searches literal and market-oriented', () => {
    expect(HOME.exampleAsks).toEqual([
      'weather forecast',
      'financial market data',
      'extract data from documents',
    ])
    expect(HOME.exampleAsks.every((query) => !query.includes('?'))).toBe(true)
  })
})
