import { describe, expect, it } from 'vitest'

import { draftPriceLabel } from '../../../convex/lib/capabilitySupply/providerTools/ownerReads'

describe('draftPriceLabel', () => {
  it('shows a saved Free price instead of an unrecorded status', () => {
    expect(draftPriceLabel({
      pricingKind: 'free',
      price: '',
    })).toBe('Free')
  })

  it('shows a saved fixed AUD amount', () => {
    expect(draftPriceLabel({
      pricingKind: 'fixed_aud',
      price: '12.50',
    })).toBe('A$12.50')
  })

  it('leaves an unsaved draft without a price label', () => {
    expect(draftPriceLabel(undefined)).toBeUndefined()
  })
})
