import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { persistOfferingSourceState } from '../../../convex/catalog'
import type { OfferingSourceState } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import schema from '../../../convex/schema'
import { convexModules as modules, publishedBusinessOwner } from '../../helpers/convex-fixtures'

const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }

describe('Offering persistence tenancy', () => {
  it('refuses an Offering ref owned by another business before any write', async () => {
    const backend = convexTest(schema, modules)
    const mine = await publishedBusinessOwner(backend, 'offering-tenant-mine')
    const other = await publishedBusinessOwner(backend, 'offering-tenant-other')
    await backend.run((ctx) => ctx.db.insert('businessOfferings', {
      offeringRef: 'offering:shared', businessId: other.businessId, currentRevision: 1, status: 'draft', createdAt: 1, updatedAt: 1,
    }))

    const result = await backend.run((ctx) => persistOfferingSourceState(ctx.db, mine.businessId, empty, {
      ...empty,
      offerings: [{
        offeringRef: brandNonEmpty('offering:shared', 'OfferingRef'),
        businessId: brandNonEmpty(mine.businessId, 'BusinessId'),
        currentRevision: 1,
        status: 'draft',
        createdAt: 1,
        updatedAt: 1,
      }],
    }))
    expect(result).toMatchObject({ kind: 'error', code: 'operation_conflict' })
    await expect(backend.run((ctx) => ctx.db.query('businessOfferings').collect())).resolves.toHaveLength(1)
  })

  it('refuses an access-path ref owned by another business before any write', async () => {
    const backend = convexTest(schema, modules)
    const mine = await publishedBusinessOwner(backend, 'access-tenant-mine')
    const other = await publishedBusinessOwner(backend, 'access-tenant-other')
    await backend.run((ctx) => ctx.db.insert('offeringAccessPaths', {
      accessPathRef: 'access:shared', businessId: other.businessId, offeringRef: 'offering:other', offeringRevision: 1,
      offeringSourceHash: canonicalDigest('other-offering'), status: 'draft',
      descriptor: { kind: 'human_request', channel: 'phone', disclosure: 'Call' },
      sourceHash: canonicalDigest('other-access'), createdAt: 1, updatedAt: 1,
    }))

    const result = await backend.run((ctx) => persistOfferingSourceState(ctx.db, mine.businessId, empty, {
      ...empty,
      accessPaths: [{
        accessPathRef: brandNonEmpty('access:shared', 'AccessPathRef'),
        businessId: brandNonEmpty(mine.businessId, 'BusinessId'),
        offeringRef: brandNonEmpty('offering:mine', 'OfferingRef'),
        offeringRevision: 1,
        offeringSourceHash: canonicalDigest('o'),
        status: 'draft',
        descriptor: { kind: 'human_request', channel: 'phone', disclosure: 'Call' },
        sourceHash: canonicalDigest('a'),
        createdAt: 1,
        updatedAt: 1,
      }],
    }))
    expect(result).toMatchObject({ kind: 'error', code: 'operation_conflict' })
    await expect(backend.run((ctx) => ctx.db.query('offeringAccessPaths').collect())).resolves.toHaveLength(1)
  })
})
