import { describe, expect, it } from 'vitest'

import { Route as OwnerSupplyRoute } from '@/routes/_operator/owner.supply'
import { Route as OwnerSupplyDetailRoute } from '@/routes/_operator/owner.supply.$offeringRef'

describe('owner supply routes', () => {
  it('exports both authenticated publisher hosts', () => {
    expect(OwnerSupplyRoute).toBeDefined()
    expect(OwnerSupplyDetailRoute).toBeDefined()
  })
})
