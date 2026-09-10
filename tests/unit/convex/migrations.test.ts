/// <reference types="vite/client" />
import { register as registerMigrations } from '@convex-dev/migrations/test'
import { describe, expect, it } from 'vitest'

import { convexTest } from 'convex-test'

import { internal } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexModules, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import type { Id } from '../../../convex/_generated/dataModel'

async function insertOffering(
  backend: ReturnType<typeof convexTest>,
  businessId: Id<'businesses'>,
  offeringId: string,
  price: { kind: 'on_request' } | undefined,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityOfferings', {
      offeringId,
      businessId,
      networkId: 'ae:public',
      capabilityId: 'cap:price-migration-test',
      version: 1,
      contractDigest: canonicalDigest({ offeringId, part: 'contract' }),
      presentation: {
        label: 'Test offering',
        summary: 'Test offering summary',
        price,
        materialTerms: [],
        commercialRelationship: {
          kind: 'none',
          summary: 'No commercial relationship.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: [],
        },
      },
      searchTerms: [],
      registrationEvidenceRefs: [],
      registrationHash: canonicalDigest({ offeringId, part: 'registration' }),
      status: 'active',
      admissionEvidenceRefs: [],
      eligibilityHash: canonicalDigest({ offeringId, part: 'eligibility' }),
      registeredAt: 1,
      updatedAt: 1,
    })
  })
}

// Runs one batch of the migration directly against the mutation handler, the
// same "oneBatchOnly" shape the mounted migrations component uses internally
// when it schedules a batch (see @convex-dev/migrations' define()).
function runOneBatch(backend: ReturnType<typeof convexTest>) {
  return backend.mutation(internal.migrations.removeOfferingPrice, {
    cursor: null,
    dryRun: false,
    oneBatchOnly: true,
  })
}

describe('migrations.removeOfferingPrice', () => {
  it('unsets presentation.price on every capabilityOffering and skips docs already migrated', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const { businessId } = await publishedBusinessOwner(backend, 'price-migration')
    await insertOffering(backend, businessId, 'offering:priced', { kind: 'on_request' })
    await insertOffering(backend, businessId, 'offering:already-unset', undefined)

    const status = await runOneBatch(backend)
    expect(status.isDone).toBe(true)
    expect(status.processed).toBe(2)

    const offerings = await backend.run((ctx) => ctx.db.query('capabilityOfferings').collect())
    expect(offerings).toHaveLength(2)
    for (const offering of offerings) {
      expect(offering.presentation.price).toBeUndefined()
      expect(Object.keys(offering.presentation)).not.toContain('price')
    }
  })

  it('is idempotent on a second run', async () => {
    const backend = convexTest(schema, convexModules)
    registerMigrations(backend)
    const { businessId } = await publishedBusinessOwner(backend, 'price-migration-rerun')
    await insertOffering(backend, businessId, 'offering:rerun', { kind: 'on_request' })

    await runOneBatch(backend)
    const second = await runOneBatch(backend)
    expect(second.isDone).toBe(true)

    const offering = await backend.run((ctx) =>
      ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (q) => q.eq('offeringId', 'offering:rerun'))
        .unique(),
    )
    expect(offering?.presentation.price).toBeUndefined()
  })
})
