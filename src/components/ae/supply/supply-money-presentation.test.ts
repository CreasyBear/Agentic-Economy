import { describe, expect, it } from 'vitest'

import { publicationPriceSummary } from './supply-source-native-start-presentation'

describe('supply money presentation', () => {
  it('shows the endpoint challenge as the listing price', () => {
    expect(publicationPriceSummary({ kind: 'source_x402' })).toBe('Provider source payment')
    expect(publicationPriceSummary({ kind: 'fixed_aud' })).toBe('Price comes from the endpoint challenge')
  })
})
