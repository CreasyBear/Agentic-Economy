import { describe, expect, it } from 'vitest'

import { Route } from '@/routes/for-providers'
import { Route as ClaimRoute } from '@/routes/claim'

describe('provider supply route', () => {
  it('declares the business supply landing route', () => {
    expect(Route).toBeDefined()
  })

  it('starts the provider entry path with programmable-provider identity', () => {
    const validateSearch = ClaimRoute.options.validateSearch as ((search: Record<string, unknown>) => unknown) | undefined
    if (validateSearch === undefined) throw new Error('claim search validation is unavailable')

    expect(validateSearch({ source: 'supply' })).toEqual({
      source: 'supply',
      businessContext: { kind: 'programmable_provider', website: '', providerIdentifier: '' },
    })
    expect(validateSearch({})).toEqual({})
  })
})
