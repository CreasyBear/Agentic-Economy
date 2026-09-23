/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import type { Id } from '../../../convex/_generated/dataModel'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexModules, ownerAdmin, publishedBusinessOwner, supportAdmin, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const setBusinessSuppression = makeFunctionReference<
  'mutation', Record<string, unknown>, AdminCommandReceipt<'set_business_suppression'>
>('businesses:setBusinessSuppression')

type SuppressionCommand = Omit<AdminCommandArgs<'set_business_suppression'>, 'proof'>

function command(businessId: Id<'businesses'>, intent: 'suppress' | 'unsuppress', key: string): SuppressionCommand {
  return {
    action: 'set_business_suppression',
    input: { businessId, intent },
    reasonCode: intent === 'suppress' ? 'policy_violation' : 'suppression_lifted_after_review',
    evidenceRefs: ['evidence:moderation:one'],
    operationKey: key,
    correlationId: `corr:${key}`,
    approval: { kind: 'execute' },
  }
}

async function signed(subject: string, args: SuppressionCommand, nonce: string) {
  const digest = canonicalDigest({
    scope: 'admin_operator', action: args.action, input: args.input,
    reasonCode: args.reasonCode, evidenceRefs: args.evidenceRefs,
  })
  return await withSourceWrite('admin_operator', {
    ...args,
    proof: {
      reverificationId: `test:${canonicalDigest({ subject, digest })}`,
      firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1,
    },
  }, { nonce })
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
      businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
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
  return await backend.run((ctx) => ctx.db.query('registrySearchDocuments')
    .withIndex('by_business', (query) => query.eq('businessSlug', slug)).collect())
}

async function auditEventsForBusiness(backend: ConvexFixtureBackend, businessId: Id<'businesses'>) {
  return await backend.run((ctx) => ctx.db.query('auditEvents')
    .withIndex('by_targetType_and_targetRef_and_createdAt', (query) =>
      query.eq('targetType', 'business').eq('targetRef', String(businessId))).collect())
}

describe('setBusinessSuppression', () => {
  it('suppresses a published business, logs audit, and purges search documents', async () => {
    const backend = convexTest(schema, convexModules)
    const slug = 'suppression-active'
    const { businessId } = await publishedBusinessOwner(backend, slug)
    await seedSearchDocument(backend, slug)
    const subject = 'user_business-suppression-admin'
    const admin = await ownerAdmin(backend, subject)
    const args = command(businessId, 'suppress', 'business:suppress:one')
    const result = await admin.mutation(setBusinessSuppression, await signed(subject, args, 'nonce:business:suppress:one'))
    expect(result).toMatchObject({ kind: 'completed', code: 'business_suppressed', effectRefs: [String(businessId)] })
    expect((await backend.run((ctx) => ctx.db.get(businessId)))?.suppressedAt).toEqual(expect.any(Number))
    expect(await searchDocuments(backend, slug)).toHaveLength(0)
    expect(await auditEventsForBusiness(backend, businessId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'business.suppressed' }),
    ]))
  })

  it('unsuppresses a business and logs business.unsuppressed', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'suppression-clear')
    const subject = 'user_business-unsuppress-admin'
    const admin = await ownerAdmin(backend, subject)
    await admin.mutation(setBusinessSuppression, await signed(subject,
      command(businessId, 'suppress', 'business:clear:suppress'), 'nonce:business:clear:suppress'))
    const result = await admin.mutation(setBusinessSuppression, await signed(subject,
      command(businessId, 'unsuppress', 'business:clear:unsuppress'), 'nonce:business:clear:unsuppress'))
    expect(result).toMatchObject({ kind: 'completed', code: 'business_unsuppressed' })
    expect((await backend.run((ctx) => ctx.db.get(businessId)))?.suppressedAt).toBeUndefined()
    expect(await auditEventsForBusiness(backend, businessId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'business.unsuppressed' }),
    ]))
  })

  it('rejects callers without suppress_business authority', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'suppression-denied')
    const args = command(businessId, 'suppress', 'business:deny:owner')
    const result = await owner.mutation(setBusinessSuppression, await signed('user_denied', args, 'nonce:business:deny:owner'))
    expect(result).toMatchObject({ kind: 'refused', code: 'missing_membership' })
  })

  it('rejects support admins for suppress_business', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'suppression-support-denied')
    const subject = 'user_business-suppression-support'
    const admin = await supportAdmin(backend, subject)
    const result = await admin.mutation(setBusinessSuppression, await signed(subject,
      command(businessId, 'suppress', 'business:deny:support'), 'nonce:business:deny:support'))
    expect(result).toMatchObject({ kind: 'refused', code: 'action_not_allowed' })
  })

  it('rejects missing source-write admission and wrong scope', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'suppression-source-write')
    const subject = 'user_business-suppression-source-write'
    const admin = await ownerAdmin(backend, subject)
    const args = await signed(subject, command(businessId, 'suppress', 'business:deny:source'), 'nonce:business:deny:source')
    const { sourceWrite: _sourceWrite, ...withoutAdmission } = args
    void _sourceWrite
    expect(await admin.mutation(setBusinessSuppression, withoutAdmission))
      .toMatchObject({ kind: 'refused', code: 'missing_source_write_admission' })
    expect(await admin.mutation(setBusinessSuppression,
      await withSourceWrite('catalog_publish', {
        ...command(businessId, 'suppress', 'business:deny:scope'), proof: args.proof,
      }, { nonce: 'nonce:business:deny:scope' })))
      .toMatchObject({ kind: 'refused', code: 'source_write_scope_mismatch' })
  })

  it('replays the same operationKey without duplicating audit rows', async () => {
    const backend = convexTest(schema, convexModules)
    const { businessId } = await publishedBusinessOwner(backend, 'suppression-replay')
    const subject = 'user_business-suppression-replay'
    const admin = await ownerAdmin(backend, subject)
    const args = command(businessId, 'suppress', 'business:replay')
    const first = await admin.mutation(setBusinessSuppression, await signed(subject, args, 'nonce:business:replay:1'))
    const replay = await admin.mutation(setBusinessSuppression, await signed(subject, args, 'nonce:business:replay:2'))
    expect(first).toMatchObject({ kind: 'completed', code: 'business_suppressed' })
    expect(JSON.stringify(replay)).toBe(JSON.stringify(first))
    expect((await auditEventsForBusiness(backend, businessId))
      .filter((event) => event.eventType === 'business.suppressed')).toHaveLength(1)
  })
})
