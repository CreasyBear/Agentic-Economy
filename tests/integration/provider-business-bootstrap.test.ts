import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules, ownerAdmin } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { seedCatalogOffering } from './capability-publication-harness'

describe('supplier business bootstrap', () => {
  it('creates one unpublished programmable-provider workspace and replays safely', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_supplier_bootstrap')

    const first = await owner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Example Data',
      slug: 'Example Data',
      website: 'https://api.example.com',
      providerIdentifier: 'api.example.com',
    })
    expect(first).toMatchObject({ kind: 'created', slug: 'example-data' })
    if (first.kind !== 'created') throw new Error('supplier_business_not_created')
    await expect(owner.query(api.catalog.authorizeProviderBusiness, {
      businessId: first.businessId,
    })).resolves.toBe(true)
    await expect(backend.query(api.catalog.authorizeProviderBusiness, {
      businessId: first.businessId,
    })).resolves.toBe(false)

    const replay = await owner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Ignored Replacement',
      slug: 'ignored-replacement',
      website: 'https://other.example.com',
      providerIdentifier: 'other.example.com',
    })
    expect(replay).toEqual({
      kind: 'existing',
      businessId: first.businessId,
      slug: 'example-data',
    })

    const rows = await backend.run(async (ctx) => ctx.db.query('businesses').take(10))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'Example Data',
      normalizedName: 'example data',
      publicStatus: 'unpublished',
      trustTier: 'claimed',
      businessContext: {
        kind: 'programmable_provider',
        website: 'https://api.example.com/',
        providerIdentifier: 'api.example.com',
      },
    })
  })

  it('refuses anonymous, invalid, and conflicting slug claims without partial rows', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Anonymous',
      slug: 'anonymous',
      website: 'https://anonymous.example',
      providerIdentifier: 'anonymous.example',
    })).resolves.toEqual({ kind: 'refused', code: 'unauthenticated' })

    const firstOwner = await ownerAdmin(backend, 'user_supplier_first')
    const secondOwner = await ownerAdmin(backend, 'user_supplier_second')
    await expect(firstOwner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Shared Name',
      slug: 'shared-name',
      website: 'https://first.example',
      providerIdentifier: 'first.example',
    })).resolves.toMatchObject({ kind: 'created', slug: 'shared-name' })
    await expect(secondOwner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Shared Name',
      slug: 'shared-name',
      website: 'https://second.example',
      providerIdentifier: 'second.example',
    })).resolves.toEqual({ kind: 'refused', code: 'slug_taken' })

    const invalidOwner = await ownerAdmin(backend, 'user_supplier_invalid')
    await expect(invalidOwner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Invalid',
      slug: 'invalid',
      website: 'http://not-secure.example',
      providerIdentifier: 'not-secure.example',
    })).resolves.toEqual({ kind: 'refused', code: 'invalid_business' })

    const rows = await backend.run(async (ctx) => ctx.db.query('businesses').take(10))
    expect(rows).toHaveLength(1)
  })

  it('lets only the owning account correct the display name while preserving supplier identity', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_supplier_rename_owner')
    const sibling = await ownerAdmin(backend, 'user_supplier_rename_sibling')
    const created = await owner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Example Data', slug: 'Example Data', website: 'https://api.example.com', providerIdentifier: 'api.example.com',
    })
    if (created.kind !== 'created') throw new Error('supplier_business_not_created')
    const before = await backend.run(async (ctx) => ctx.db.get(created.businessId))
    const renameCommand = {
      businessId: created.businessId,
      name: '  Example   Intelligence  ',
      operationKey: 'supplier-rename:owner',
      correlationId: 'supplier-rename:owner',
    }

    await expect(owner.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', renameCommand))).resolves.toMatchObject({
      kind: 'updated', name: 'Example Intelligence', slug: 'example-data', businessId: created.businessId,
    })
    const after = await backend.run(async (ctx) => ctx.db.get(created.businessId))
    expect(after).toMatchObject({
      _id: created.businessId,
      owningAccountRef: before?.owningAccountRef,
      slug: before?.slug,
      name: 'Example Intelligence',
      normalizedName: 'example intelligence',
      businessContext: before?.businessContext,
      publicStatus: before?.publicStatus,
      trustTier: before?.trustTier,
    })
    expect(after?.sourceHash).not.toBe(before?.sourceHash)

    await expect(owner.mutation(api.catalog.renameProviderBusiness, {
      ...renameCommand,
      name: 'Unsigned change',
      operationKey: 'supplier-rename:unsigned',
      correlationId: 'supplier-rename:unsigned',
    })).resolves.toEqual({ kind: 'refused', code: 'source_write_refused' })

    await expect(owner.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      ...renameCommand, name: 'Example Intelligence', operationKey: 'supplier-rename:unchanged', correlationId: 'supplier-rename:unchanged',
    }))).resolves.toMatchObject({ kind: 'unchanged', name: 'Example Intelligence' })
    await expect(sibling.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      ...renameCommand, name: 'Hijacked', operationKey: 'supplier-rename:sibling', correlationId: 'supplier-rename:sibling',
    }))).resolves.toEqual({ kind: 'refused', code: 'wrong_owner' })
    await expect(backend.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      ...renameCommand, name: 'Anonymous', operationKey: 'supplier-rename:anonymous', correlationId: 'supplier-rename:anonymous',
    }))).resolves.toEqual({ kind: 'refused', code: 'unauthenticated' })
    await expect(owner.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      ...renameCommand, name: ' '.repeat(4), operationKey: 'supplier-rename:invalid', correlationId: 'supplier-rename:invalid',
    }))).resolves.toEqual({ kind: 'refused', code: 'invalid_name' })
    await expect(backend.run(async (ctx) => ctx.db.get(created.businessId))).resolves.toMatchObject({ name: 'Example Intelligence' })
  })

  it('rolls back the canonical name when an existing public search projection cannot refresh', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_supplier_rename_rollback')
    const created = await owner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Rollback Data', slug: 'Rollback Data', website: 'https://rollback.example.com', providerIdentifier: 'rollback.example.com',
    })
    if (created.kind !== 'created') throw new Error('supplier_business_not_created')
    await backend.run(async (ctx) => {
      await ctx.db.patch(created.businessId, { publicStatus: 'published' })
      await ctx.db.insert('businessOfferings', {
        offeringRef: 'offering:missing', businessId: created.businessId, currentRevision: 1,
        status: 'published', createdAt: 1, updatedAt: 1,
      })
      await ctx.db.insert('registrySearchDocuments', {
        documentId: 'search:rollback-data:missing-offering',
        schemaVersion: 'registry-search-document:v1',
        businessSlug: created.slug,
        offeringRef: 'offering:missing',
        businessName: 'Rollback Data',
        name: 'Missing offering',
        category: 'API services',
        categoryKey: 'api services',
        businessContext: { kind: 'programmable_provider', website: 'https://rollback.example.com/', providerIdentifier: 'rollback.example.com' },
        publicStatus: 'published',
        trustTier: 'claimed',
        firstRequestMode: 'not_available_yet',
        placeKeys: [], keywords: [], searchText: 'rollback data', serviceAreaSummary: '',
        generatedHash: 'sha256:stale', updatedAt: 1,
      })
    })

    await expect(owner.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      businessId: created.businessId,
      name: 'Should Roll Back',
      operationKey: 'supplier-rename:rollback',
      correlationId: 'supplier-rename:rollback',
    }))).rejects.toThrow('provider_rename_projection_failed')
    await expect(backend.run(async (ctx) => ctx.db.get(created.businessId))).resolves.toMatchObject({ name: 'Rollback Data' })
    await expect(backend.run(async (ctx) => ctx.db.query('registrySearchDocuments').withIndex('by_business', (query) => query.eq('businessSlug', created.slug)).unique())).resolves.toMatchObject({ businessName: 'Rollback Data' })
  })

  it('propagates a published rename to public detail and registry search without republishing', async () => {
    const backend = convexTest(schema, modules)
    const owner = await ownerAdmin(backend, 'user_supplier_rename_public')
    const created = await owner.mutation(api.catalog.ensureProviderBusiness, {
      name: 'Old Provider Name', slug: 'Old Provider Name', website: 'https://public-rename.example.com', providerIdentifier: 'public-rename.example.com',
    })
    if (created.kind !== 'created') throw new Error('supplier_business_not_created')
    await seedCatalogOffering(backend, created.businessId, 'rename-public')
    await backend.run(async (ctx) => ctx.db.patch(created.businessId, { publicStatus: 'published' }))

    await expect(owner.mutation(api.catalog.renameProviderBusiness, await withSourceWrite('catalog_publish', {
      businessId: created.businessId,
      name: 'Current Provider Name',
      operationKey: 'supplier-rename-public:rename',
      correlationId: 'supplier-rename-public:rename',
    }))).resolves.toMatchObject({ kind: 'updated', name: 'Current Provider Name' })

    await expect(backend.query(api.registry.getPublicBusinessOfferingSupplyBySlug, { slug: created.slug })).resolves.toMatchObject({
      kind: 'found', business: { businessId: created.businessId, slug: created.slug, name: 'Current Provider Name' },
    })
    await expect(backend.query(api.registry.searchPublicBusinessOfferingSupply, {
      query: 'Current Provider Name', limit: 10,
    })).resolves.toMatchObject({
      kind: 'ok', items: [{ businessId: created.businessId, slug: created.slug, name: 'Current Provider Name' }],
    })
  })
})
