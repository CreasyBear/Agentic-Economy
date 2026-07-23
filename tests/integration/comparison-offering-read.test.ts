import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'

const discoveredModules = import.meta.glob('../../convex/**/*.{ts,js}')
const modules = Object.fromEntries(
  Object.entries(discoveredModules).map(([path, load]) => [
    path.replace('../../convex/', './'),
    load,
  ]),
)
const readReference = makeFunctionReference<
  'query',
  { businessId: string; offeringRef: string; revision: number },
  unknown
>('catalog:readPublicComparisonOfferingReference')

describe('public exact Offering comparison read', () => {
  it('returns revision 1 facts and only reports revision 2 as the current reference', async () => {
    const backend = convexTest(schema, modules)
    const businessId = await seedOfferingHistory(backend)

    const result = await backend.query(readReference, {
      businessId,
      offeringRef: 'offering:studio',
      revision: 1,
    })

    expect(result).toMatchObject({
      kind: 'resolved',
      business: { businessId, slug: 'studio', name: 'Studio' },
      offering: {
        offeringRef: 'offering:studio',
        revision: 1,
        name: 'Original service',
      },
      publication: {
        publishedAt: 10,
        safeDisplayDisposition: 'retain_safe_history',
      },
      currentReference: {
        businessId,
        offeringRef: 'offering:studio',
        offeringRevision: 2,
      },
    })
    expect(JSON.stringify(result)).not.toContain('sourceHash')
    expect(JSON.stringify(result)).not.toContain('sha256:')
  })

  it.each([
    ['unsafe business id', { businessId: '../business', offeringRef: 'offering:studio', revision: 1 }, 'business_mismatch'],
    ['zero revision', { businessId: 'unused', offeringRef: 'offering:studio', revision: 0 }, 'revision_unavailable'],
    ['fractional revision', { businessId: 'unused', offeringRef: 'offering:studio', revision: 1.5 }, 'revision_unavailable'],
  ] as const)('returns an ordinary refusal for %s', async (_label, args, reason) => {
    const backend = convexTest(schema, modules)
    const businessId = await seedOfferingHistory(backend)
    const result = await backend.query(readReference, {
      ...args,
      ...(args.businessId === 'unused' ? { businessId } : {}),
    })
    expect(result).toEqual({ kind: 'unavailable', reason })
  })

  it('refuses absent, hidden, wrong-lineage and ambiguous history without current substitution', async () => {
    const absent = convexTest(schema, modules)
    const absentBusinessId = await seedOfferingHistory(absent)
    await expect(absent.query(readReference, {
      businessId: absentBusinessId,
      offeringRef: 'offering:studio',
      revision: 9,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'never_public' })

    const hidden = convexTest(schema, modules)
    const hiddenBusinessId = await seedOfferingHistory(hidden, { disposition: 'hidden_privacy' })
    await expect(hidden.query(readReference, {
      businessId: hiddenBusinessId,
      offeringRef: 'offering:studio',
      revision: 1,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'privacy_withdrawn' })

    const wrong = convexTest(schema, modules)
    const wrongBusinessId = await seedOfferingHistory(wrong, { wrongOfferingOwner: true })
    await expect(wrong.query(readReference, {
      businessId: wrongBusinessId,
      offeringRef: 'offering:studio',
      revision: 1,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'business_mismatch' })

    const duplicate = convexTest(schema, modules)
    const duplicateBusinessId = await seedOfferingHistory(duplicate, { duplicateHistory: true })
    await expect(duplicate.query(readReference, {
      businessId: duplicateBusinessId,
      offeringRef: 'offering:studio',
      revision: 1,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'ambiguous_history' })
  })

  it('checks live suppression before ambiguous history can be observed', async () => {
    const backend = convexTest(schema, modules)
    const businessId = await seedOfferingHistory(backend, {
      duplicateHistory: true,
      suppressed: true,
    })

    await expect(backend.query(readReference, {
      businessId,
      offeringRef: 'offering:studio',
      revision: 1,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'business_suppressed' })
  })
})

type Backend = ReturnType<typeof convexTest>

async function seedOfferingHistory(
  backend: Backend,
  options: Readonly<{
    disposition?: 'retain_safe_history' | 'hidden_privacy' | 'hidden_safety'
    duplicateHistory?: boolean
    wrongOfferingOwner?: boolean
    suppressed?: boolean
  }> = {},
) {
  return backend.run(async (ctx) => {
    const ownerId = await ctx.db.insert('owners', {
      clerkUserId: 'owner:studio',
      createdAt: 1,
      updatedAt: 1,
    })
    const businessId = await ctx.db.insert('businesses', {
      ownerId,
      slug: 'studio',
      name: 'Studio',
      normalizedName: 'studio',
      category: 'Professional services',
      suburb: 'Perth',
      stateTerritory: 'WA',
      publicStatus: 'published',
      trustTier: 'listed',
      claimStatus: 'published',
      sourceHash: 'sha256:business',
      createdAt: 1,
      updatedAt: 2,
    })
    const offeringBusinessId = options.wrongOfferingOwner
      ? await ctx.db.insert('businesses', {
          ownerId,
          slug: 'other',
          name: 'Other',
          normalizedName: 'other',
          category: 'Professional services',
          suburb: 'Perth',
          stateTerritory: 'WA',
          publicStatus: 'published',
          trustTier: 'listed',
          claimStatus: 'published',
          sourceHash: 'sha256:other',
          createdAt: 1,
          updatedAt: 2,
        })
      : businessId
    await ctx.db.insert('businessOfferings', {
      businessId: offeringBusinessId,
      offeringRef: 'offering:studio',
      currentRevision: 2,
      status: 'published',
      createdAt: 1,
      updatedAt: 20,
    })
    await ctx.db.insert('businessOfferingRevisions', revision(offeringBusinessId, 1))
    await ctx.db.insert('businessOfferingRevisions', revision(offeringBusinessId, 2))
    const history = {
      businessId,
      offeringRef: 'offering:studio',
      revision: 1,
      offeringSourceHash: 'sha256:revision:1',
      publishedAt: 10,
      safeDisplayDisposition: options.disposition ?? 'retain_safe_history',
    } as const
    await ctx.db.insert('offeringPublicRevisionHistory', history)
    if (options.duplicateHistory) {
      await ctx.db.insert('offeringPublicRevisionHistory', history)
    }
    if (options.suppressed) {
      await ctx.db.insert('suppressionRules', {
        targetType: 'business',
        targetRef: businessId,
        status: 'active',
        reasonCode: 'privacy_request',
        evidenceRefs: ['case:1'],
        createdByAdminRef: 'admin:1',
        createdAt: 30,
        beforePublicStatus: 'published',
        beforeClaimStatus: 'published',
      })
    }
    return businessId
  })
}

function revision(businessId: string, revisionNumber: number) {
  return {
    businessId: businessId as never,
    offeringRef: 'offering:studio',
    revision: revisionNumber,
    name: revisionNumber === 1 ? 'Original service' : 'Current service',
    category: 'Professional service',
    summary: `Revision ${revisionNumber}`,
    comparison: {
      schemaVersion: 'offering-comparison:v1' as const,
      profile: {
        profileId: 'professional_service:v1' as const,
        scopeBasis: known(`Scope ${revisionNumber}`),
        priceBasis: { kind: 'not_supplied' as const, source: { kind: 'business_supplied' as const }, observedAt: 10 },
        timingBasis: known('Four weeks'),
        serviceArea: known('Perth'),
      },
    },
    sourceHash: `sha256:revision:${revisionNumber}`,
    createdAt: revisionNumber * 10,
  }
}

function known(value: string) {
  return {
    kind: 'known' as const,
    value,
    source: { kind: 'business_supplied' as const },
    observedAt: 10,
  }
}
