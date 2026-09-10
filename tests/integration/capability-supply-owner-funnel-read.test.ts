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
  it('returns the canonical Tool detail through real owner readback and refuses other scopes', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-tool-detail-readback',
    )
    const { owner: foreignOwner } = await createPublishedBusinessOwner(
      backend,
      'owner-tool-detail-readback-foreign',
    )
    const offeringRef = 'catalog-offering:owner-tool-detail-readback'
    const sourceHash = 'catalog-source:owner-tool-detail-readback:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.tool-detail-readback'),
      'owner-supply:owner-tool-detail-readback',
      { kind: 'catalog_offering', offeringRef, offeringRevision: 1, offeringSourceHash: sourceHash },
    )
    if (prepared.kind === 'refused') throw new Error(`tool_detail_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command)
    if (published.kind === 'refused') throw new Error(`tool_detail_publish_failed:${published.reason}`)

    const readback = await owner.query(api.capabilityProviderTools.readOwner, {
      businessId,
      offeringRef,
      now: Date.now(),
    })
    expect(readback).toMatchObject({
      kind: 'available',
      tool: {
        offeringRef,
        name: 'Owner lookup service',
        status: 'published',
      },
    })
    expect(readback).not.toHaveProperty('operation')
    expect(readback.kind === 'available' ? JSON.parse(readback.statusJson) : readback).toMatchObject({
      schemaVersion: 'provider_tools:v1',
      toolRef: published.toolRef,
    })

    await expect(owner.query(api.capabilityProviderTools.readOwner, {
      businessId,
      offeringRef: 'catalog-offering:missing',
      now: Date.now(),
    })).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.query(api.capabilityProviderTools.readOwner, {
      businessId,
      offeringRef,
      now: Date.now(),
    })).resolves.toEqual({ kind: 'not_found' })
    await expect(foreignOwner.query(api.capabilityProviderTools.readOwner, {
      businessId,
      offeringRef,
      now: Date.now(),
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('returns exact Tool-scoped delivery and Qualified Use evidence', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-funnel-operation-evidence',
    )
    const offeringRef = 'catalog-offering:owner-funnel-operation-evidence'
    const sourceHash = 'catalog-source:owner-funnel-operation-evidence:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.operation-evidence'),
      'owner-supply:owner-funnel-operation-evidence',
      { kind: 'catalog_offering', offeringRef, offeringRevision: 1, offeringSourceHash: sourceHash },
    )
    if (prepared.kind === 'refused') throw new Error(`operation_evidence_prepare_failed:${prepared.reason}`)
    const published = await owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command)
    if (published.kind === 'refused') throw new Error(`operation_evidence_publish_failed:${published.reason}`)
    const toolRef = published.toolRef
    const now = Date.now()
    await backend.run(async (ctx) => {
      const baseCall = {
        accountRef: 'account:buyer',
        principalRef: 'principal:buyer',
        credentialRef: 'credential:buyer',
        applicationRef: 'application:buyer',
        toolRef,
        providerRef: String(businessId),
        toolLabel: 'Evidence lookup',
        state: 'completed' as const,
        paymentState: 'settled' as const,
        latencyMs: 20,
        createdAt: now - 1_000,
        updatedAt: now - 500,
      }
      await ctx.db.insert('capabilityCallProjections', {
        ...baseCall,
        callRef: 'call:delivered',
        deliveryState: 'delivered',
      })
      await ctx.db.insert('capabilityCallProjections', {
        ...baseCall,
        callRef: 'call:unknown',
        deliveryState: 'unknown',
      })
      await ctx.db.insert('qualifiedUseReceipts', {
        qualifiedUseRef: 'qualified-use:operation-evidence',
        materialDigest: `sha256:${'1'.repeat(64)}`,
        callRef: 'call:delivered',
        attemptRef: 'attempt:delivered',
        effectGeneration: 1,
        businessId: String(businessId),
        toolRef,
        publicationRef: published.publicationRef,
        publicationRevision: published.publicationRevision,
        contractDigest: `sha256:${'4'.repeat(64)}`,
        bindingDigest: `sha256:${'5'.repeat(64)}`,
        principalClass: 'agent_key',
        requestDigest: `sha256:${'2'.repeat(64)}`,
        responseDigest: `sha256:${'3'.repeat(64)}`,
        evidenceRefs: ['receipt:delivery'],
        environment: 'production',
        qualifiedAt: now - 400,
      })
    })

    const readback = await owner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, { businessId })
    if (readback.kind !== 'available') throw new Error(`operation_evidence_read_failed:${readback.kind}`)
    expect(readback.offerings[0]?.toolEvidence).toMatchObject({
      delivery: {
        kind: 'observed',
        deliveredCount: 1,
        notDeliveredCount: 0,
        unknownCount: 1,
        sampleSize: 2,
        provenance: 'canonical_call_receipts',
      },
      usefulOutcome: {
        kind: 'observed',
        qualifiedUseCount: 1,
        provenance: 'qualified_use_receipts',
      },
    })
  })

  it('does not invent editor source material before an Operation is admitted', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-funnel-unadmitted-editor',
    )
    const offeringRef = 'catalog-offering:owner-funnel-unadmitted-editor'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-funnel-unadmitted-editor:v1',
    )

    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId, editorOfferingRef: offeringRef },
    )
    if (readback.kind !== 'available')
      throw new Error(`owner_funnel_unadmitted_readback:${readback.kind}`)
    expect(readback.offerings).toHaveLength(1)
    expect(readback.offerings[0]).not.toHaveProperty('sourceMaterial')
  })

  it('does not disclose another canonical Account through a legacy owner locator', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await createPublishedBusinessOwner(
      backend,
      'owner-funnel-account-a',
    )
    const { owner: foreignOwner } = await createPublishedBusinessOwner(
      backend,
      'owner-funnel-account-b',
    )

    await expect(
      foreignOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'not_found' })
  })

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
