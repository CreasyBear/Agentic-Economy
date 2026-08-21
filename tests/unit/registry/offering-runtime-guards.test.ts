import { describe, expect, it } from 'vitest'
import {
  readOfferingSupplyForBusiness,
  type OfferingSupplyReadPort,
  type OfferingSupplySnapshot,
} from '../../../convex/registry'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { BusinessSupplyProjection } from '@/modules/catalog/public'

type Business = Parameters<typeof readOfferingSupplyForBusiness>[1]

describe('Offering registry runtime guards', () => {
  it('hydrates a current native Offering snapshot through the shared read seam', async () => {
    const db = new NativeReader()
    const business = businessRow('native')

    const item = await readOfferingSupplyForBusiness(db, business)

    expect(item).toMatchObject({
      slug: 'native',
      offerings: [{ name: 'Native advisory' }],
    })
  })
})

function businessRow(slug: string): Business {
  return {
    _id: 'business:1',
    slug,
    publicStatus: 'published',
  }
}

class NativeReader implements OfferingSupplyReadPort {
  readBusinessSupplyProjectionSnapshot(_businessId: string): Promise<OfferingSupplySnapshot | null> {
    return Promise.resolve({
      status: 'current',
      projection: nativeProjection(),
    })
  }
}

function nativeProjection(): BusinessSupplyProjection {
  const businessId = brandNonEmpty('business:1', 'BusinessId')
  const offeringRef = brandNonEmpty('offering:1', 'OfferingRef')
  const sourceDigest = canonicalDigest('projection')
  return {
    business: {
      businessId,
      slug: 'native',
      name: 'Native Co',
      category: 'Advisory',
      businessContext: {
        kind: 'local_human',
        suburb: 'Perth',
        stateTerritory: 'WA',
      },
      publicUrl: '/native',
      trustTier: 'claimed',
    },
    offerings: [{
      offering: {
        offeringRef,
        revision: 1,
        name: 'Native advisory',
        category: 'Advisory',
        summary: 'Native Offering.',
      },
      accessPaths: [],
      support: { integrated: false, routeable: false, reasons: ['not_integrated'] },
    }],
    sourceRevision: 1,
    sourceDigest,
    observedAt: 1,
    disposition: 'current',
  }
}
