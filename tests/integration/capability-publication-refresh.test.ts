import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexModules as modules,
  ownerAdmin,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  capabilityPublicationInput,
  operationContext,
  preparedPublicationArgs,
  providerAuthority,
  refreshCapabilityThroughTestSeam,
  registerProviderConnection,
  seedCatalogOffering,
  admitPublication,
} from './capability-publication-harness'

describe('capability publication refresh', () => {
  it('keeps an incompatible refresh observable and fail closed', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'refresh-one',
    )
    await seedCatalogOffering(backend, businessId, 'refresh-one')
    await registerProviderConnection(backend, businessId, 'refresh-one')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(businessId, 'refresh-one'),
      ),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)
    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await admitPublication(backend, published, 'refresh-one')
    await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 60_000,
        ...operationContext('observe-refresh-one'),
      },
    )
    const next = capabilityPublicationInput(businessId, 'refresh-two')
    await registerProviderConnection(backend, businessId, 'refresh-two')
    const incompatibleDocument = capabilityContractV2({
      capabilityId: published.contractRef.capabilityId,
      version: 2,
      name: 'Refresh two lookup',
      outputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { changed: { type: 'number' } },
        required: ['changed'],
        additionalProperties: false,
      },
      customerAnnotations: [
        {
          annotationId: 'request',
          document: 'input',
          pointer: '/request',
          label: 'Request',
          role: 'request',
        },
        {
          annotationId: 'changed',
          document: 'output',
          pointer: '/changed',
          label: 'Changed',
          role: 'completion_evidence',
        },
      ],
      evidence: [
        {
          evidenceId: 'changed',
          outputPointer: '/changed',
          purpose: 'completion',
        },
      ],
    })
    const refreshed = await refreshCapabilityThroughTestSeam(
      backend,
      businessId,
      published.publicationRef,
      published.publicationRevision,
      {
        kind: 'ae_envelope',
        documentJson: JSON.stringify(incompatibleDocument),
        offering: next.offering,
        binding: next.binding,
        evidenceRefs: next.evidenceRefs,
      },
      next.offering,
      next.binding,
      operationContext('refresh-incompatible'),
    )
    expect(refreshed).toMatchObject({
      kind: 'refreshed',
      revision: 2,
      disposition: 'incompatible',
      lifecycle: { state: 'incompatible', reasons: ['incompatible_revision'] },
    })
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({ lifecycle: { state: 'incompatible' } })
    const revisions = await backend.run(
      async (ctx) =>
        await ctx.db
          .query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (index) =>
            index.eq('publicationRef', published.publicationRef),
          )
          .collect(),
    )
    expect(
      revisions.map(({ revision, disposition }) => ({ revision, disposition })),
    ).toEqual([
      { revision: 1, disposition: 'superseded' },
      { revision: 2, disposition: 'incompatible' },
    ])
    await expect(
      backend.run(
        async (ctx) =>
          await ctx.db.query('capabilityContractDocuments').collect(),
      ),
    ).resolves.toHaveLength(1)
    const graph = await owner.query(api.capabilitySupply.queryCapabilityGraph, {
      networkId: 'ae:public',
      includeInactive: false,
      limit: 10,
    })
    expect(graph).toMatchObject({ kind: 'available', nodes: [] })
    await expect(
      backend.query(internal.capabilitySupply.listIntegrated, {
        networkId: 'ae:public',
        limit: 10,
        now: Date.now(),
      }),
    ).resolves.toMatchObject({ kind: 'available', supplies: [] })
  })

  it('preserves lineage when a validated compatible revision replaces current supply', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'compatible-one',
    )
    await seedCatalogOffering(backend, businessId, 'compatible-one')
    const firstInput = capabilityPublicationInput(businessId, 'compatible-one')
    await registerProviderConnection(backend, businessId, 'compatible-one')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, firstInput),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)
    const next = capabilityPublicationInput(businessId, 'compatible-two')
    const nextBinding = {
      ...next.binding,
      authority: providerAuthority('compatible-one'),
    }
    const compatibleDocument = capabilityContractV2({
      capabilityId: published.contractRef.capabilityId,
      version: 2,
      name: 'Compatible lookup revision',
    })
    const refreshed = await refreshCapabilityThroughTestSeam(
      backend,
      businessId,
      published.publicationRef,
      published.publicationRevision,
      {
        kind: 'ae_envelope',
        documentJson: JSON.stringify(compatibleDocument),
        offering: next.offering,
        binding: nextBinding,
        evidenceRefs: next.evidenceRefs,
      },
      next.offering,
      nextBinding,
      operationContext('refresh-compatible'),
    )
    expect(refreshed).toMatchObject({
      kind: 'refreshed',
      revision: 2,
      disposition: 'current',
      lifecycle: { state: 'inactive' },
    })
    const revisions = await backend.run(
      async (ctx) =>
        await ctx.db
          .query('capabilityPublications')
          .withIndex('by_publicationRef_and_revision', (index) =>
            index.eq('publicationRef', published.publicationRef),
          )
          .collect(),
    )
    expect(
      revisions.map(({ revision, disposition, supersedesRevision }) => ({
        revision,
        disposition,
        supersedesRevision,
      })),
    ).toEqual([
      { revision: 1, disposition: 'superseded', supersedesRevision: undefined },
      { revision: 2, disposition: 'current', supersedesRevision: 1 },
    ])
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({
      offeringId: next.offering.offeringId,
      lifecycle: { state: 'inactive' },
    })
  })
})
