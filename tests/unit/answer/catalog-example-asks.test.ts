import { describe, expect, it } from 'vitest'

import { HOME } from '@/content/brand-copy'
import { AE_CATALOG_EXAMPLE_ASKS } from '@/modules/answer/catalog-example-asks'

describe('catalog example asks', () => {
  it('keeps home furniture queries identical to the catalog chip queries', () => {
    expect([...HOME.exampleAsks]).toEqual(AE_CATALOG_EXAMPLE_ASKS.map((ask) => ask.query))
  })
})
