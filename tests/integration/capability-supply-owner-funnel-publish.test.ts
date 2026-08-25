import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  directSource,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
} from './capability-supply-owner-funnel-harness'

describe('owner capability publication admission', () => {
  it('refuses anonymous and wrong-owner admission without publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await createPublishedBusinessOwner(
      backend,
      'owner-auth',
    )
    const { businessId: wrongBusinessId, owner: wrongOwner } =
      await createPublishedBusinessOwner(backend, 'other-owner')
    const offeringRef = 'catalog-offering:owner-auth'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-auth:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-auth:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-auth:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      backend.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      wrongOwner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'authorization_denied',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    await expect(
      backend.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId,
      }),
    ).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
    await expect(
      wrongOwner.query(api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel, {
        businessId: wrongBusinessId,
      }),
    ).resolves.toMatchObject({
      kind: 'available',
      businessId: wrongBusinessId,
      offerings: [],
    })
  })

  it('refuses a stale catalog revision before publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-revision',
    )
    const offeringRef = 'catalog-offering:owner-stale-revision'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      2,
      1,
      'catalog-source:owner-stale-revision:v1',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-revision:v1',
      openApiSource(),
      `owner-supply:${offeringRef}:1`,
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:owner-stale-revision:v1',
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses an ae envelope whose catalog source hash is stale', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-stale-hash',
    )
    const offeringRef = 'catalog-offering:owner-stale-hash'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      'catalog-source:owner-stale-hash:v2',
    )
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      'catalog-source:owner-stale-hash:v2',
      directSource('catalog-source:owner-stale-hash:v1'),
      'owner-supply:owner-stale-hash',
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    await expect(
      owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      reason: 'catalog_offering_origin_changed',
    })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)
  })

  it('refuses malformed source and admits a valid OpenAPI source through the canonical command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-valid',
    )
    const offeringRef = 'catalog-offering:owner-valid'
    const sourceHash = 'catalog-source:owner-valid:v1'
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      sourceHash,
    )

    const malformed = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      { ...openApiSource(), document: '{' },
      'owner-supply:owner-valid:malformed',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    expect(malformed).toEqual({ kind: 'refused', reason: 'source_invalid' })
    await expect(
      backend.run(async (ctx) =>
        ctx.db.query('capabilityPublications').take(10),
      ),
    ).resolves.toHaveLength(0)

    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.valid'),
      'owner-supply:owner-valid:admit',
      {
        kind: 'catalog_offering',
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash: sourceHash,
      },
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)

    // Owner readback must resolve its publication binding by identity, not a global first-page scan.
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('capabilityTransportBindings', {
          bindingId: `binding:unrelated:${index}`,
          offeringId: `offering:unrelated:${index}`,
          networkId: 'ae:public',
          capabilityId: `unrelated.${index}`,
          version: 1,
          contractDigest: `sha256:${'0'.repeat(64)}`,
          endpointUrl: 'https://unrelated.example.test',
          authority: { kind: 'keyless' },
          continuation: { kind: 'single_response', evidenceRefs: [] },
          cancellation: { kind: 'unsupported', evidenceRefs: [] },
          adapterId: 'http-json:v1',
          configJson: '{}',
          configDigest: `sha256:${'1'.repeat(64)}`,
          registrationEvidenceRefs: [],
          registrationHash: `sha256:${'2'.repeat(64)}`,
          admission: 'not_admitted',
          conformance: 'not_conformant',
          admissionEvidenceRefs: [],
          conformanceEvidenceRefs: [],
          eligibilityHash: `sha256:${'3'.repeat(64)}`,
          registeredAt: index,
          updatedAt: index,
        })
      }
    })

    const admitted = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      prepared.command,
    )
    if (admitted.kind === 'refused')
      throw new Error(`owner_publication_failed:${admitted.reason}`)
    expect(admitted).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:owner:lookup',
      publicationRevision: 1,
      authorityMode: 'provider_owned',
      sourceKind: 'openapi_http',
      sourceRevision: 'owner-api/2026-08-09',
      priceDigest: expect.stringMatching(/^sha256:/),
    })
    const rows = await backend.run(async (ctx) => ({
      publications: await ctx.db.query('capabilityPublications').take(10),
      offerings: await ctx.db.query('capabilityOfferings').take(10),
    }))
    expect(rows.publications).toHaveLength(1)
    expect(rows.offerings[0]?.origin).toEqual({
      kind: 'catalog_offering',
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
    })

    const readback = await owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel,
      { businessId },
    )
    if (readback.kind !== 'available')
      throw new Error(`owner_readback_kind:${readback.kind}`)
    expect(readback.businessId).toBe(businessId)
    const readbackOffering = readback.offerings[0]
    if (readbackOffering === undefined)
      throw new Error('owner_readback_offering_missing')
    expect(readbackOffering).toMatchObject({ offeringRef, revision: 1 })
    expect(readbackOffering.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.pricing).toEqual({
      config: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.admission).toEqual({ state: 'admitted' })
    expect(readbackOffering.publicationRef).toBe(admitted.publicationRef)
    expect(readbackOffering.publication).toMatchObject({
      state: 'current',
      publicationRef: admitted.publicationRef,
      publicationRevision: admitted.publicationRevision,
      operationRef: admitted.operationRef,
    })
    expect(readbackOffering.publication?.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.publication?.pricing).toEqual({
      config: {
        version: 'pricing:v2',
        unit: 'call',
        paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.publication?.binding).toMatchObject({
      bindingId: admitted.bindingId,
      admission: 'admitted',
      conformance: 'conformant',
    })
  })
})
