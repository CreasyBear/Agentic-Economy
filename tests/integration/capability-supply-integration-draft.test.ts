import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import { supplyIntegrationDraftRefs } from '@/modules/capability-supply/integration-draft'
import { convexModules as modules } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  seedSupplyAgentPrincipal,
} from './capability-supply-owner-funnel-harness'

describe('Provider source integration draft', () => {
  it('lets the authenticated Business owner save the same source-first draft without an Agent credential', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-browser-owner',
    )
    const { owner: foreignOwner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-browser-foreign',
    )
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://provider.example/lookup',
      method: 'POST' as const,
      environment: 'production' as const,
    }
    const selector = { resourceUrl: 'https://provider.example/lookup', method: 'POST' }
    const sourceDigest = canonicalDigest({ source: 'provider-openapi-browser-v1' })
    const candidateRef = canonicalDigest({ sourceDigest, selector })
    const command = {
      businessId,
      title: 'Reference lookup',
      description: 'Looks up one public reference.',
      category: 'Research',
      sourceKind: source.kind,
      sourceDescriptorJson: stableStringify(source),
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      candidateRef,
      sourceSelectorJson: stableStringify(selector),
      operationKey: 'supply-integration-draft:browser-owner',
      correlationId: 'supply-integration-draft:browser-owner',
    }

    await expect(owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toMatchObject({ kind: 'saved', candidateRef, sourceDigest })
    await expect(owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toMatchObject({ kind: 'replayed', candidateRef, sourceDigest })
    await expect(foreignOwner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
  })

  it('persists private terms by exact candidate with material-scoped retries and no saved attestation', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'draft-terms-owner')
    const { owner: foreignOwner } = await createPublishedBusinessOwner(backend, 'draft-terms-foreign')
    const source = { kind: 'x402' as const, resourceUrl: 'https://provider.example/lookup', method: 'POST' as const, environment: 'production' as const }
    const selector = { resourceUrl: 'https://provider.example/lookup', method: 'POST' }
    const sourceDigest = canonicalDigest({ source: 'terms-v1' })
    const candidateRef = canonicalDigest({ sourceDigest, selector })
    const terms = {
      name: 'My lookup', description: 'Owner-entered description', category: 'Data',
      serviceArea: 'Australia', availability: 'Weekdays',
      pricingKind: 'fixed_aud' as const, price: '12.50',
      externalEffect: true, dataRelease: true, financialExposure: false,
      dataClassification: 'personal' as const,
    }
    const command = {
      businessId, title: terms.name, description: terms.description, category: terms.category,
      sourceKind: source.kind, sourceDescriptorJson: stableStringify(source), sourceDigest,
      sourceRevision: `x402:${sourceDigest}`, candidateRef, sourceSelectorJson: stableStringify(selector),
      terms, operationKey: canonicalDigest({ candidateRef, terms }), correlationId: 'owner-terms',
    }
    await expect(owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command))).resolves.toMatchObject({ kind: 'saved' })
    await expect(owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command))).resolves.toMatchObject({ kind: 'replayed' })
    const saved = await owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft, { businessId, candidateRef })
    expect(saved).toMatchObject({ kind: 'available', draft: { candidateRef, terms } })
    expect(JSON.stringify(saved)).not.toContain('attestation')
    const ownerFunnel = await owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, { businessId })
    expect(JSON.stringify(ownerFunnel)).not.toContain('"terms"')
    expect(JSON.stringify(ownerFunnel)).not.toContain('"price":"12.50"')
    await expect(foreignOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef })).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef })).resolves.toEqual({ kind: 'not_found' })
    const updatedTerms = { ...terms, category: 'Research', price: '21.00' }
    await expect(owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', {
        ...command, category: updatedTerms.category, terms: updatedTerms,
        operationKey: canonicalDigest({ candidateRef, terms: updatedTerms }),
      }))).resolves.toMatchObject({ kind: 'saved' })
    await expect(owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef })).resolves.toMatchObject({
      kind: 'available', draft: { terms: updatedTerms },
    })
  })

  it('persists the existing owner-bound x402 draft with its source digest and candidate reference', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-x402-owner',
    )
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://seller.example/paid',
      method: 'POST' as const,
      environment: 'sandbox' as const,
    }
    const selector = { resourceUrl: source.resourceUrl, method: source.method }
    const sourceDigest = canonicalDigest({ source: 'provider-x402-browser-v1' })
    const candidateRef = canonicalDigest({ sourceDigest, selector })
    const command = {
      businessId,
      title: 'Paid lookup',
      description: 'Looks up one paid reference.',
      category: 'Research',
      sourceKind: source.kind,
      sourceDescriptorJson: stableStringify(source),
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      candidateRef,
      sourceSelectorJson: stableStringify(selector),
      operationKey: 'supply-integration-draft:x402-owner',
      correlationId: 'supply-integration-draft:x402-owner',
    }

    await expect(owner.mutation(
      api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toMatchObject({ kind: 'saved', candidateRef, sourceDigest })

    await expect(owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef },
    )).resolves.toMatchObject({
      kind: 'available',
      draft: {
        sourceKind: 'x402',
        sourceDescriptorJson: stableStringify(source),
        sourceDigest,
        sourceRevision: `x402:${sourceDigest}`,
        candidateRef,
        sourceSelectorJson: stableStringify(selector),
      },
    })
  })

  it('persists one credential-free candidate on the existing Offering boundary and resumes only for its owner', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, canonicalAccountRef, owner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-owner',
    )
    const { owner: foreignOwner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-foreign-owner',
    )
    const principal = await seedSupplyAgentPrincipal(backend, canonicalAccountRef, 'integration-draft')
    const source = {
      kind: 'x402' as const,
      resourceUrl: 'https://provider.example/lookup',
      method: 'POST' as const,
      environment: 'production' as const,
    }
    const selector = { resourceUrl: 'https://provider.example/lookup', method: 'POST' }
    const sourceDigest = canonicalDigest({ source: 'provider-openapi-v1' })
    const candidateRef = canonicalDigest({ sourceDigest, selector })
    const command = {
      businessId,
      title: 'Reference lookup',
      description: 'Looks up one public reference.',
      category: 'Research',
      sourceKind: source.kind,
      sourceDescriptorJson: stableStringify(source),
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      candidateRef,
      sourceSelectorJson: stableStringify(selector),
      operationKey: 'supply-integration-draft:one',
      correlationId: 'supply-integration-draft:one',
      agentPrincipal: principal,
    }

    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toMatchObject({ kind: 'saved', candidateRef, sourceDigest })
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', command),
    )).resolves.toMatchObject({ kind: 'replayed', candidateRef, sourceDigest })

    const resumed = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef },
    )
    expect(resumed).toMatchObject({
      kind: 'available',
      draft: {
        sourceKind: 'x402',
        sourceDescriptorJson: stableStringify(source),
        sourceDigest,
        sourceRevision: `x402:${sourceDigest}`,
        candidateRef,
        sourceSelectorJson: stableStringify(selector),
      },
    })
    if (resumed.kind !== 'available') throw new Error('integration_draft_not_available')
    const directoryCommand = {
      businessId,
      paginationOpts: { numItems: 50, cursor: null },
      agentPrincipal: principal,
      operationKey: 'supplier-operations:list:one',
      correlationId: 'supplier-operations:list:one',
    }
    const directory = await backend.query(
      api.capabilityProviderTools.listAgent,
      await withSourceWrite('catalog_publish', directoryCommand),
    )
    expect(directory).toMatchObject({ kind: 'available', isDone: true })
    if (directory.kind !== 'available') throw new Error('supplier_operation_directory_unavailable')
    expect(directory.page.map(({ statusJson }) => JSON.parse(statusJson))).toMatchObject([{
      schemaVersion: 'provider_tools:v1',
      businessRef: String(businessId),
      toolRef: resumed.offeringRef,
      state: 'Draft',
    }])
    const exact = await backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId,
        toolRef: resumed.offeringRef,
        agentPrincipal: principal,
        operationKey: 'supplier-operations:read:one',
        correlationId: 'supplier-operations:read:one',
      }),
    )
    expect(exact.kind === 'available' ? JSON.parse(exact.statusJson) : exact).toMatchObject({
      schemaVersion: 'provider_tools:v1',
      toolRef: resumed.offeringRef,
      state: 'Draft',
    })
    const ownerExact = await owner.query(
      api.capabilityProviderTools.readOwner,
      { businessId, offeringRef: resumed.offeringRef, now: 1_000 },
    )
    expect(ownerExact.kind === 'available' ? JSON.parse(ownerExact.statusJson) : ownerExact).toMatchObject({
      schemaVersion: 'provider_tools:v1',
      toolRef: resumed.offeringRef,
      state: 'Draft',
      source: {
        kind: 'x402',
        revision: `x402:${sourceDigest}`,
        digest: sourceDigest,
      },
      health: {
        connection: 'not_required',
        freshness: 'current',
        publication: 'not_published',
      },
    })
    expect(ownerExact).toMatchObject({ kind: 'available', resumeCandidateRef: candidateRef })
    const ownerDirectory = await owner.query(
      api.capabilityProviderTools.listOwner,
      { businessId, now: 1_000, paginationOpts: { numItems: 50, cursor: null } },
    )
    expect(ownerDirectory).toMatchObject({
      kind: 'available',
      isDone: true,
      page: [{
        offeringRef: resumed.offeringRef,
        name: 'Reference lookup',
        status: 'draft',
      }],
    })
    expect(ownerDirectory.kind === 'available' ? JSON.parse(ownerDirectory.page[0]!.statusJson) : ownerDirectory)
      .toMatchObject({ schemaVersion: 'provider_tools:v1', state: 'Draft', source: { kind: 'x402' } })
    await expect(foreignOwner.query(
      api.capabilityProviderTools.readOwner,
      { businessId, offeringRef: resumed.offeringRef, now: 1_000 },
    )).resolves.toEqual({ kind: 'not_found' })
    await expect(foreignOwner.query(
      api.capabilityProviderTools.listOwner,
      { businessId, now: 1_000, paginationOpts: { numItems: 50, cursor: null } },
    )).resolves.toEqual({ kind: 'not_found' })
    await backend.run(async (ctx) => {
      const rows = await ctx.db.query('capabilityProviderToolProjections').take(10)
      await Promise.all(rows.map((row) => ctx.db.delete(row._id)))
    })
    await expect(backend.mutation(
      internal.capabilityProviderTools.backfillDraftPage,
      { paginationOpts: { numItems: 100, cursor: null } },
    )).resolves.toMatchObject({ processed: 1, isDone: true })
    const restored = await backend.query(
      api.capabilityProviderTools.listAgent,
      await withSourceWrite('catalog_publish', { ...directoryCommand, operationKey: 'supplier-operations:list:restored' }),
    )
    expect(restored.kind === 'available' ? restored.page : []).toHaveLength(1)
    await expect(foreignOwner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef },
    )).resolves.toEqual({ kind: 'not_found' })

    const ownerFunnel = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    expect(ownerFunnel.kind).toBe('available')
    if (ownerFunnel.kind === 'available') {
      expect(ownerFunnel.offerings[0]?.accessPaths[0]?.descriptor.url).toBe('https://provider.example/lookup')
      expect(ownerFunnel.offerings[0]?.accessPaths[0]).not.toHaveProperty('integrationDraft')
    }
  })

  it('rejects credential material and changed replay input before creating a second draft', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, canonicalAccountRef } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-secrets',
    )
    const principal = await seedSupplyAgentPrincipal(backend, canonicalAccountRef, 'integration-draft-secrets')
    const selector = { resourceUrl: 'https://provider.example/paid', method: 'POST' }
    const sourceDigest = canonicalDigest({ source: 'provider-x402-v1' })
    const base = {
      businessId,
      title: 'Reference lookup',
      description: 'Looks up one public reference.',
      category: 'Research',
      sourceKind: 'x402' as const,
      sourceDigest,
      sourceRevision: `x402:${sourceDigest}`,
      candidateRef: canonicalDigest({ sourceDigest, selector }),
      sourceSelectorJson: stableStringify(selector),
      operationKey: 'supply-integration-draft:secrets',
      correlationId: 'supply-integration-draft:secrets',
      agentPrincipal: principal,
    }
    const secretSource = {
      kind: 'x402' as const,
      resourceUrl: 'https://provider.example/paid?token=secret',
      method: 'POST' as const,
      environment: 'production' as const,
    }
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', {
        ...base,
        sourceDescriptorJson: stableStringify(secretSource),
      }),
    )).resolves.toEqual({ kind: 'refused', reason: 'source_contains_credential' })

    const cleanSource = {
      kind: 'x402' as const,
      resourceUrl: 'https://provider.example/paid',
      method: 'POST' as const,
      environment: 'production' as const,
    }
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', {
        ...base,
        sourceDescriptorJson: stableStringify(cleanSource),
      }),
    )).resolves.toMatchObject({ kind: 'saved' })
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', {
        ...base,
        description: 'Changed material under the same command key.',
        sourceDescriptorJson: stableStringify(cleanSource),
      }),
    )).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    const drafts = await backend.run(async (ctx) => (
      await ctx.db.query('offeringAccessPaths').collect()
    ).filter((row) => row.integrationDraft !== undefined))
    expect(drafts).toHaveLength(1)
    expect(JSON.stringify(drafts)).not.toContain('secret')
  })

  it('resumes an exact Provider draft without a fixed Business-wide read cap', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'integration-draft-many',
    )
    let exactCandidateRef = ''
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        const source = {
          kind: 'openapi' as const,
          definitionUrl: `https://provider.example/openapi-${index}.json`,
          environment: 'production' as const,
        }
        const selector = {
          serverUrl: 'https://provider.example/',
          path: `/lookup-${index}`,
          method: 'post',
        }
        const sourceDigest = canonicalDigest({ source: `provider-openapi-${index}` })
        const candidateRef = canonicalDigest({ sourceDigest, selector })
        const refs = supplyIntegrationDraftRefs(String(businessId), candidateRef)
        if (index === 0) exactCandidateRef = candidateRef
        const updatedAt = index + 1
        await ctx.db.insert('offeringAccessPaths', {
          accessPathRef: refs.accessPathRef,
          businessId,
          offeringRef: refs.offeringRef,
          offeringRevision: 1,
          offeringSourceHash: `source:${index}`,
          status: 'draft',
          descriptor: {
            kind: 'external_operation',
            name: `Reference lookup ${index}`,
            summary: 'Looks up one public reference.',
            url: `https://provider.example/lookup-${index}`,
            method: 'POST',
            provenance: 'business_declared',
          },
          integrationDraft: {
            sourceKind: 'openapi',
            sourceDescriptorJson: stableStringify(source),
            sourceDigest,
            sourceRevision: `openapi:${sourceDigest}`,
            candidateRef,
            sourceSelectorJson: stableStringify(selector),
            updatedAt,
          },
          integrationDraftUpdatedAt: updatedAt,
          sourceHash: `path-source:${index}`,
          createdAt: updatedAt,
          updatedAt,
        })
      }
    })

    await expect(owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId, candidateRef: exactCandidateRef },
    )).resolves.toMatchObject({
      kind: 'available',
      draft: { candidateRef: exactCandidateRef },
    })
  })

  it('keeps a 10,000-Operation Provider directory bounded to one native page', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'supplier-operation-directory-capacity',
    )

    for (let batchStart = 0; batchStart < 10_000; batchStart += 500) {
      await backend.run(async (ctx) => {
        for (let index = batchStart; index < batchStart + 500; index += 1) {
          const offeringRef = `offering:supplier-capacity:${index}`
          await ctx.db.insert('capabilityProviderToolProjections', {
            businessId,
            providerRef: 'provider:supplier-capacity',
            toolRef: `operation:supplier-capacity:${index}`,
            offeringRef,
            offeringRevision: 1,
            updatedAt: index,
          })
          if (index < 9_950) continue
          await ctx.db.insert('businessOfferings', {
            offeringRef,
            businessId,
            currentRevision: 1,
            status: 'draft',
            createdAt: index,
            updatedAt: index,
          })
          await ctx.db.insert('businessOfferingRevisions', {
            offeringRef,
            businessId,
            revision: 1,
            name: `Capacity Operation ${index}`,
            category: 'Capacity proof',
            summary: 'Proves the Provider directory hydrates only the requested native page.',
            sourceHash: `source:supplier-capacity:${index}`,
            createdAt: index,
          })
        }
      })
    }

    const firstPage = await owner.query(
      api.capabilityProviderTools.listOwner,
      { businessId, now: 10_000, paginationOpts: { numItems: 50, cursor: null } },
    )
    expect(firstPage).toMatchObject({ kind: 'available', isDone: false })
    if (firstPage.kind !== 'available') throw new Error('supplier_operation_directory_unavailable')
    expect(firstPage.page).toHaveLength(50)
    expect(firstPage.continueCursor).not.toBe('')
    expect(firstPage.page[0]).toMatchObject({
      offeringRef: 'offering:supplier-capacity:9999',
      name: 'Capacity Operation 9999',
    })
    expect(firstPage.page.at(-1)).toMatchObject({
      offeringRef: 'offering:supplier-capacity:9950',
      name: 'Capacity Operation 9950',
    })
  })

  it('queries the owner inventory before pagination and refuses unindexed legacy records', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'inventory-query-owner')
    const foreign = await createPublishedBusinessOwner(backend, 'inventory-query-foreign')
    const rows = await backend.run(async ({ db }) => {
      const ids = []
      for (let index = 0; index < 51; index += 1) {
        const offeringRef = `offering:inventory-query:${index}`
        const name = index === 0 ? 'Aardvark needleproof' : `Zulu ${String(index).padStart(2, '0')}`
        await db.insert('businessOfferings', { offeringRef, businessId, currentRevision: 1, status: 'draft', createdAt: index, updatedAt: index })
        await db.insert('businessOfferingRevisions', { offeringRef, businessId, revision: 1, name, category: 'Research', summary: 'Recorded source inventory.', sourceHash: `source:${index}`, createdAt: index })
        ids.push(await db.insert('capabilityProviderToolProjections', { businessId, providerRef: String(businessId), toolRef: `tool:inventory-query:${index}`, offeringRef, offeringRevision: 1, inventoryName: name.toLowerCase(), inventoryText: `${name} Recorded source inventory. Research`, updatedAt: index }))
      }
      // A foreign text match must never enter this owner's result.
      await db.insert('capabilityProviderToolProjections', { businessId: foreign.businessId, providerRef: String(foreign.businessId), toolRef: 'tool:foreign-needle', offeringRef: 'offering:foreign-needle', offeringRevision: 1, inventoryName: 'needleproof', inventoryText: 'needleproof', updatedAt: 999 })
      return ids
    })
    const base = { businessId, now: 100, paginationOpts: { numItems: 50, cursor: null } }
    const recent = await owner.query(api.capabilityProviderTools.listOwner, base)
    expect(recent.kind === 'available' ? recent.page.map(row => row.offeringRef) : []).not.toContain('offering:inventory-query:0')
    const textMatch = await owner.query(api.capabilityProviderTools.listOwner, { ...base, search: 'needleproof' })
    expect(textMatch).toMatchObject({ kind: 'available', isDone: true, page: [{ offeringRef: 'offering:inventory-query:0' }] })
    const alphabetical = await owner.query(api.capabilityProviderTools.listOwner, { ...base, sort: 'name_asc' })
    expect(alphabetical.kind === 'available' ? alphabetical.page[0]?.offeringRef : null).toBe('offering:inventory-query:0')
    expect(alphabetical).toMatchObject({ isDone: false })
    if (alphabetical.kind !== 'available') throw new Error('inventory_not_available')
    const next = await owner.query(api.capabilityProviderTools.listOwner, { ...base, sort: 'name_asc', paginationOpts: { numItems: 50, cursor: alphabetical.continueCursor } })
    expect(next).toMatchObject({ kind: 'available', isDone: true, page: [{ offeringRef: 'offering:inventory-query:50' }] })
    await expect(foreign.owner.query(api.capabilityProviderTools.listOwner, { ...base, search: 'needleproof' })).resolves.toEqual({ kind: 'not_found' })
    await backend.run(async ({ db }) => {
      const id = rows[0]
      if (id === undefined) throw new Error('fixture_missing')
      await db.patch(id, { inventoryName: undefined, inventoryText: undefined })
    })
    await expect(owner.query(api.capabilityProviderTools.listOwner, { ...base, search: 'needleproof' })).resolves.toEqual({ kind: 'index_pending' })
    expect(await owner.query(api.capabilityProviderTools.listOwner, base)).toMatchObject({ kind: 'available' })
    const backfill = await backend.mutation(internal.capabilityProviderTools.backfillInventoryPage, { paginationOpts: { numItems: 1, cursor: null } })
    expect(backfill).toMatchObject({ processed: 1, skipped: 0, isDone: false })
    await expect(owner.query(api.capabilityProviderTools.listOwner, { ...base, search: 'needleproof' })).resolves.toMatchObject({ kind: 'available', page: [{ offeringRef: 'offering:inventory-query:0' }] })
    const preserved = await backend.run(async ({ db }) => rows[0] === undefined ? null : db.get(rows[0]))
    expect(preserved).toMatchObject({ toolRef: 'tool:inventory-query:0', offeringRevision: 1, updatedAt: 0 })
    await expect(owner.query(api.capabilityProviderTools.listOwner, { ...base, paginationOpts: { numItems: 51, cursor: null } })).rejects.toThrow('provider_inventory_page_size_invalid')
  })
})
