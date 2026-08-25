import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
} from './capability-supply-owner-funnel-harness'

describe('owner supply funnel read', () => {
  it('returns a typed incomplete readback before capped joins instead of a false unadmitted operation', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-capability-overflow',
    )
    const offeringRef = 'catalog-offering:owner-capability-overflow'
    const sourceHash = 'catalog-source:owner-capability-overflow:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )
    await backend.run(async (ctx) => {
      for (let index = 0; index < 50; index += 1) {
        await ctx.db.insert('capabilityOfferings', {
          offeringId: `offering:overflow:${index}`,
          businessId,
          networkId: 'ae:public',
          capabilityId: `overflow.${index}`,
          version: 1,
          contractDigest: `sha256:${'0'.repeat(64)}`,
          presentation: {
            label: `Overflow ${index}`,
            summary: 'An unrelated capability.',
            price: {
              kind: 'fixed',
              amount: { currency: 'AUD', units: '0', exponent: 2 },
            },
            materialTerms: [],
            commercialRelationship: {
              kind: 'none',
              summary: 'No commercial influence.',
              influencesEligibility: false,
              influencesInclusion: false,
              influencesOrder: false,
              evidenceRefs: [],
            },
          },
          searchTerms: [],
          registrationEvidenceRefs: [],
          registrationHash: `sha256:${'1'.repeat(64)}`,
          status: 'active',
          admissionEvidenceRefs: [],
          eligibilityHash: `sha256:${'2'.repeat(64)}`,
          registeredAt: index + 1,
          updatedAt: index + 1,
        })
      }
    })
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.capability-overflow'),
      'owner-supply:owner-capability-overflow',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_capability_overflow_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (published.kind === 'refused')
      throw new Error(`owner_capability_overflow_publish_failed:${published.reason}`)
    expect(published.kind).toBe('published')
    await expect(
      owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'incomplete' })
  })
})
