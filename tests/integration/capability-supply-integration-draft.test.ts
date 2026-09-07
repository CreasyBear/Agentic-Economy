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
      kind: 'openapi' as const,
      definitionUrl: 'https://provider.example/openapi.json',
      environment: 'production' as const,
    }
    const selector = { serverUrl: 'https://provider.example/', path: '/lookup', method: 'post' }
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
      sourceRevision: `openapi:${sourceDigest}`,
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
      kind: 'openapi' as const,
      definitionUrl: 'https://provider.example/openapi.json',
      environment: 'production' as const,
    }
    const selector = { serverUrl: 'https://provider.example/', path: '/lookup', method: 'post' }
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
      sourceRevision: `openapi:${sourceDigest}`,
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
        sourceKind: 'openapi',
        sourceDescriptorJson: stableStringify(source),
        sourceDigest,
        sourceRevision: `openapi:${sourceDigest}`,
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
    const directory = await backend.mutation(
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
    const exact = await backend.mutation(
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
      .toMatchObject({ schemaVersion: 'provider_tools:v1', state: 'Draft' })
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
    const restored = await backend.mutation(
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
    const selector = { serverUrl: 'https://provider.example/mcp', toolName: 'lookup', protocolVersion: '2025-06-18' }
    const sourceDigest = canonicalDigest({ source: 'provider-mcp-v1' })
    const base = {
      businessId,
      title: 'Reference lookup',
      description: 'Looks up one public reference.',
      category: 'Research',
      sourceKind: 'mcp' as const,
      sourceDigest,
      sourceRevision: `mcp:${sourceDigest}`,
      candidateRef: canonicalDigest({ sourceDigest, selector }),
      sourceSelectorJson: stableStringify(selector),
      operationKey: 'supply-integration-draft:secrets',
      correlationId: 'supply-integration-draft:secrets',
      agentPrincipal: principal,
    }
    const secretSource = {
      kind: 'mcp' as const,
      serverUrl: 'https://provider.example/mcp?token=secret',
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
      kind: 'mcp' as const,
      serverUrl: 'https://provider.example/mcp',
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
})
