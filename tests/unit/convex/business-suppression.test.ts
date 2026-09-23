/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import type { Id } from '../../../convex/_generated/dataModel'
import { convexModules, ownerAdmin, publishedBusinessOwner, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import {
  installTestSourceWriteSecret,
  withSourceWrite,
} from '../../helpers/source-write-admission'

type SuppressionResult =
  | {
      kind: 'ok'
      code: string
      receipt: {
        businessId: string
        publicStatus: string
        suppressedAt: number | null
        updatedAt: number
      }
      auditEvent?: {
        eventType: string
        actorRef: string
        targetRef: string
      }
    }
  | {
      kind: 'error'
      code: string
      retryable: boolean
      reason: string
      auditEvent?: { eventType: string }
    }

const setBusinessSuppression = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  SuppressionResult
>('businesses:setBusinessSuppression')

function command(
  businessId: Id<'businesses'>,
  overrides: Record<string, unknown> = {},
) {
  return {
    businessId,
    intent: 'suppress' as const,
    reasonCode: 'unsafe_or_inaccurate',
    evidenceRefs: ['evidence:moderation:one'],
    operationKey: 'businesses:setBusinessSuppression:suppress:one',
    correlationId: 'business-suppression:one',
    ...overrides,
  }
}

async function seedSearchDocument(backend: ConvexFixtureBackend, slug: string) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('registrySearchDocuments', {
      documentId: `search:${slug}`,
      schemaVersion: 'registry-search-document:v1',
      businessSlug: slug,
      offeringRef: `catalog-offering:${slug}`,
      businessName: slug,
      name: `${slug} offering`,
      category: 'professional services',
      categoryKey: 'professional-services',
      businessContext: {
        kind: 'local_human',
        suburb: 'Perth',
        stateTerritory: 'WA',
      },
      publicStatus: 'published',
      trustTier: 'listed',
      firstRequestMode: 'quote_request_available',
      placeKeys: ['perth-wa'],
      keywords: [slug],
      searchText: slug,
      serviceAreaSummary: 'Perth WA',
      generatedHash: `generated:${slug}`,
      updatedAt: Date.now(),
    })
  })
}

async function searchDocuments(backend: ConvexFixtureBackend, slug: string) {
  return await backend.run((ctx) =>
    ctx.db
      .query('registrySearchDocuments')
      .withIndex('by_business', (query) => query.eq('businessSlug', slug))
      .collect(),
  )
}

async function auditEventsForBusiness(backend: ConvexFixtureBackend, businessId: Id<'businesses'>) {
  return await backend.run((ctx) =>
    ctx.db
      .query('auditEvents')
      .filter((query) => query.eq(query.field('targetRef'), String(businessId)))
      .collect(),
  )
}

describe('setBusinessSuppression', () => {
  it('suppresses a published business, logs audit, and purges search documents', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-active'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    await seedSearchDocument(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-suppression-admin')

    const args = command(businessId)
    const result = await admin.mutation(
      setBusinessSuppression,
      await withSourceWrite('admin_operator', args),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      code: 'business_suppressed',
      receipt: {
        businessId: String(businessId),
        publicStatus: 'published',
        suppressedAt: expect.any(Number),
      },
      auditEvent: {
        eventType: 'business.suppressed',
        targetRef: String(businessId),
      },
    })

    const row = await backend.run((ctx) => ctx.db.get(businessId))
    expect(row?.suppressedAt).toEqual(result.kind === 'ok' ? result.receipt.suppressedAt : undefined)
    expect(await searchDocuments(backend, slug)).toHaveLength(0)
    expect(await auditEventsForBusiness(backend, businessId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'business.suppressed' }),
      ]),
    )
  })

  it('unsuppresses a business and logs business.unsuppressed', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-clear'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-unsuppress-admin')

    await admin.mutation(
      setBusinessSuppression,
      await withSourceWrite('admin_operator', command(businessId, {
        operationKey: 'businesses:setBusinessSuppression:suppress:clear',
        correlationId: 'business-suppression:clear:suppress',
      })),
    )

    const result = await admin.mutation(
      setBusinessSuppression,
      await withSourceWrite('admin_operator', command(businessId, {
        intent: 'unsuppress',
        operationKey: 'businesses:setBusinessSuppression:unsuppress:clear',
        correlationId: 'business-suppression:clear:unsuppress',
      })),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      code: 'business_unsuppressed',
      receipt: {
        businessId: String(businessId),
        suppressedAt: null,
      },
      auditEvent: { eventType: 'business.unsuppressed' },
    })

    const row = await backend.run((ctx) => ctx.db.get(businessId))
    expect(row?.suppressedAt).toBeUndefined()
  })

  it('rejects callers without suppress_business authority', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-denied'
    const { businessId, owner } = await publishedBusinessOwner(backend, slug)
    const args = command(businessId, {
      operationKey: 'businesses:setBusinessSuppression:deny:owner',
      correlationId: 'business-suppression:deny:owner',
    })

    await expect(owner.mutation(
      setBusinessSuppression,
      await withSourceWrite('admin_operator', args),
    )).resolves.toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'missing_membership',
      auditEvent: { eventType: 'admin.action_denied' },
    })
  })

  it('rejects support admins for suppress_business', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-support-denied'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-suppression-support')
    await backend.run(async (ctx) => {
      const membership = await ctx.db
        .query('adminMemberships')
        .withIndex('by_tokenIdentifier_and_state', (query) =>
          query.eq('tokenIdentifier', 'token_business-suppression-support').eq('state', 'active'),
        )
        .unique()
      if (membership === null) throw new Error('support_fixture_missing_membership')
      await ctx.db.patch(membership._id, { role: 'support' })
    })

    await expect(admin.mutation(
      setBusinessSuppression,
      await withSourceWrite('admin_operator', command(businessId, {
        operationKey: 'businesses:setBusinessSuppression:deny:support',
        correlationId: 'business-suppression:deny:support',
      })),
    )).resolves.toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'action_not_allowed',
    })
  })

  it('rejects missing source-write admission', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-source-write'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-suppression-source-write')
    await expect(admin.mutation(setBusinessSuppression, {
      ...command(businessId, {
        operationKey: 'businesses:setBusinessSuppression:deny:source-write',
        correlationId: 'business-suppression:deny:source-write',
      }),
    })).resolves.toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'missing_source_write_admission',
    })
  })

  it('rejects source-write admission from the wrong scope', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-wrong-scope'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-suppression-wrong-scope')
    const args = command(businessId, {
      operationKey: 'businesses:setBusinessSuppression:deny:wrong-scope',
      correlationId: 'business-suppression:deny:wrong-scope',
    })

    await expect(admin.mutation(
      setBusinessSuppression,
      await withSourceWrite('catalog_publish', args),
    )).resolves.toMatchObject({
      kind: 'error',
      code: 'admin_action_denied',
      reason: 'source_write_scope_mismatch',
    })
  })

  it('replays the same operationKey without duplicating audit rows', async () => {
    installTestSourceWriteSecret()
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-replay'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    const admin = await ownerAdmin(backend, 'user_business-suppression-replay')
    const args = command(businessId, {
      operationKey: 'businesses:setBusinessSuppression:replay',
      correlationId: 'business-suppression:replay',
    })
    const signedFirst = await withSourceWrite('admin_operator', args, { nonce: 'nonce:suppression:replay:1' })
    const signedReplay = await withSourceWrite('admin_operator', args, { nonce: 'nonce:suppression:replay:2' })

    await expect(admin.mutation(setBusinessSuppression, signedFirst)).resolves.toMatchObject({
      kind: 'ok',
      code: 'business_suppressed',
    })
    await expect(admin.mutation(setBusinessSuppression, signedReplay)).resolves.toMatchObject({
      kind: 'ok',
      code: 'business_suppression_replayed',
    })

    const audits = await auditEventsForBusiness(backend, businessId)
    expect(audits.filter((event) => event.eventType === 'business.suppressed')).toHaveLength(1)
  })
})
