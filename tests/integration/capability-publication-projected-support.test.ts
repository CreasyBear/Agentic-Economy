import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { readBusinessSupplyProjectionSnapshot } from '../../convex/businessSupplyProjectionSnapshot'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  readLiveBusinessSupplyProjection,
} from '../../convex/capabilitySupplyProjection'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { bindingObservedRowDigest } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  convexModules as modules,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  operationContext,
  ownerMaintenanceArgs,
  preparedPublicationArgs,
  publicationRegistrationHashes,
  registerProviderConnection,
  runEligibilityThroughCommand,
  runQuarantineThroughCommand,
} from './capability-publication-harness'

async function readProjectedSupport(
  backend: ReturnType<typeof convexTest>,
  businessId: Id<'businesses'>,
) {
  return backend.run(async (ctx) => {
    const now = Date.now()
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(
      ctx.db,
      businessId,
      now,
    )
    const live = await readLiveBusinessSupplyProjection({
      db: ctx.db,
      businessId,
      support,
      now,
    })
    if (live === null) throw new Error('projection_snapshot_missing')
    const projection = readBusinessSupplyProjectionSnapshot(
      live,
      'catalog',
      businessId,
    )
    const offering = projection.offerings[0]
    if (offering === undefined) throw new Error('projection_snapshot_missing')
    return offering.support
  })
}

describe('capability publication projected support', () => {
  it('rebuilds capability-owned support after publication and eligibility transitions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'catalog-origin-one',
    )
    await backend.run(async (ctx) => {
      await ctx.db.insert('businessOfferings', {
        offeringRef: 'catalog-offering:catalog-origin-one',
        businessId,
        currentRevision: 1,
        status: 'published',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('businessOfferingRevisions', {
        offeringRef: 'catalog-offering:catalog-origin-one',
        businessId,
        revision: 1,
        name: 'Catalog origin lookup',
        category: 'Data',
        summary: 'One exact lookup.',
        sourceHash: 'catalog-source:v1',
        createdAt: 1,
      })
      const accessPathRef = 'access:catalog-origin-one:lookup'
      const descriptor = {
        kind: 'external_operation' as const,
        name: 'Catalog origin lookup',
        summary: 'One exact lookup.',
        url: 'https://catalog-origin-one.example.test/lookup',
        method: 'POST' as const,
        provenance: 'business_declared' as const,
      }
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef,
        businessId,
        offeringRef: 'catalog-offering:catalog-origin-one',
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:v1',
        status: 'published',
        descriptor,
        sourceHash: canonicalDigest({
          accessPathRef,
          offeringSourceHash: 'catalog-source:v1',
          descriptor,
        }),
        createdAt: 1,
        updatedAt: 1,
      })
    })
    const baseInput = capabilityPublicationInput(
      businessId,
      'catalog-origin-one',
    )
    await registerProviderConnection(backend, businessId, 'catalog-origin-one')
    const input = {
      ...baseInput,
      offering: {
        ...baseInput.offering,
        origin: {
          kind: 'catalog_offering' as const,
          offeringRef: 'catalog-offering:catalog-origin-one',
          offeringRevision: 1,
          offeringSourceHash: 'catalog-source:v1',
        },
      },
    }
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: false,
    })

    const validUntil = Date.now() + 60_000
    await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil,
        ...operationContext('observe-capability-origin'),
      },
    )
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: true,
    })
    await admitPublication(backend, published, 'capability-origin')
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: true,
      validUntil,
    })
    await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'unhealthy',
        validUntil,
        ...operationContext('observe-capability-origin-unhealthy'),
      },
    )
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: false,
    })
    await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil,
        ...operationContext('observe-capability-origin-recovered'),
      },
    )
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: true,
      validUntil,
    })

    const hashes = await publicationRegistrationHashes(backend, published)
    const revoked = await runEligibilityThroughCommand(backend, {
      offeringId: published.offeringId,
      bindingId: published.bindingId,
      contractRef: published.contractRef,
      decision: 'revoke',
      expectedOfferingRegistrationHash: hashes.offering,
      expectedBindingRegistrationHash: hashes.binding,
      admissionEvidenceRefs: ['test:revocation'],
      conformanceEvidenceRefs: ['test:revocation'],
      ...operationContext('revoke-catalog-origin'),
    })
    expect(revoked.kind).toBe('ineligible')
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: false,
      routeable: false,
    })

    await admitPublication(backend, published, 'catalog-origin-readmit')
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: true,
      routeable: true,
    })
    const observedRowDigest = await backend.run(async (ctx) => {
      const binding = await ctx.db
        .query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) =>
          query.eq('bindingId', published.bindingId),
        )
        .unique()
      if (binding === null)
        throw new Error('binding_control_unavailable:binding_not_found')
      return bindingObservedRowDigest(binding)
    })
    const quarantined = await runQuarantineThroughCommand(backend, {
      bindingId: published.bindingId,
      expectedObservedRowDigest: observedRowDigest,
      ...operationContext('quarantine-catalog-origin'),
    })
    expect(quarantined.kind).toBe('quarantined')
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: false,
      routeable: false,
    })

    await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'withdraw-catalog-origin',
      ),
    )
    await expect(
      readProjectedSupport(backend, businessId),
    ).resolves.toMatchObject({
      integrated: false,
      routeable: false,
      reasons: ['not_integrated'],
    })
  })
})
