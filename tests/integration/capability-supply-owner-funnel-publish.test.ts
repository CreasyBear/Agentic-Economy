import { convexTest } from 'convex-test'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import schema from '../../convex/schema'
import {
  convexModules as modules,
  convexTestWithWorkers,
} from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  directSource,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  seedPaidX402Publication,
} from './capability-supply-owner-funnel-harness'
import { withSourceWrite } from '../helpers/source-write-admission'
import { ANALYTICS_VERSION } from '../../convex/lib/market/directoryIndex/analytics'

const readinessFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: readinessFetch,
}))

describe('owner capability publication admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    readinessFetch.mockReset()
  })

  it('indexes a canonical Provider publication for Market search after the independent projection runs', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    await backend.run(async (ctx) => {
      await ctx.db.insert('marketExternalRegistryGenerations', {
        generation: 'provider-publication-test', source: 'coinbase', status: 'complete',
        startedAt: 1, completedAt: 1, ingestedCount: 0, pagesFetched: 0,
        observations: 0, duplicateObservations: 0, terminalObserved: true,
        analyticsVersion: ANALYTICS_VERSION, analyticsStatus: 'ready',
      })
      await ctx.db.insert('marketExternalRegistryState', {
        key: 'coinbase', activeGeneration: 'provider-publication-test',
        lastAttemptAt: 1, lastAttemptStatus: 'complete',
      })
    })
    const fixture = await seedPaidX402Publication(backend, 'published-search-proof', {
      publisher: 'agent', environment: 'production',
    })
    const canonical = await backend.run(async ctx => ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', q => q.eq('publicationRef', fixture.published.publicationRef).eq('revision', fixture.published.publicationRevision)).unique())
    expect(canonical?.disposition).toBe('current')
    const result = await backend.query(api.x402DirectoryIndex.searchCompact, {
      query: 'Paid lookup', access: 'ae_callable', paginationOpts: { cursor: null, numItems: 8 },
    })
    expect(result).toMatchObject({ kind: 'ok', page: [{
      source: 'provider', title: 'Owner lookup', toolRef: fixture.published.toolRef,
      choice: { access: 'ae_callable' },
    }] })
  })

  it.each(['owner', 'agent'] as const)(
    'exercises the supported %s sandbox x402 publication and validation boundary',
    async (publisher) => {
      const backend = convexTestWithWorkers({ pauseWorkpool: true })
      const slug = `published-${publisher}`
      vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ])
      const fixture = await seedPaidX402Publication(backend, slug, {
        publisher,
        price: { currency: 'USD', units: '1', exponent: 6 },
        routeAmountExponent: 6,
        assetAmount: '1',
        onPaymentRequired(paymentRequired) {
          if (paymentRequired.x402Version !== 2) {
            throw new Error('x402_payment_required_v2_expected')
          }
          readinessFetch.mockImplementation(async () => new UndiciResponse('', {
            status: 402,
            headers: {
              'Payment-Required': encodePaymentRequiredHeader(
                paymentRequired as Parameters<typeof encodePaymentRequiredHeader>[0],
              ),
            },
          }) as never)
        },
      })
      expect(readinessFetch).toHaveBeenCalled()
      if (publisher === 'agent') {
        expect(fixture.agentPrincipal).toBeDefined()
      }
      const stagedTarget = await backend.query(
        internal.capabilitySupply.readOwnerStagedCapabilityProbeTarget,
        {
          publicationRef: fixture.published.publicationRef,
          expectedRevision: fixture.published.publicationRevision,
          businessId: fixture.businessId,
          now: Date.now(),
        },
      )
      if (stagedTarget.kind !== 'available') {
        throw new Error(`staged_probe_target_unavailable:${stagedTarget.reason}`)
      }
      const expectedPayment = JSON.parse(stagedTarget.target.expectedPaymentJson ?? '{}') as {
        scheme: string
        network: string
        asset: string
        payTo: string
        currency: string
        routeAmountExponent: number
        assetAmountExponent: number
        paidAmount: { currency: string; units: string; exponent: number }
      }
      expect(expectedPayment).toMatchObject({
        network: 'eip155:84532',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        currency: 'USD',
        routeAmountExponent: 6,
        assetAmountExponent: 6,
        paidAmount: { currency: 'USDC', units: '1', exponent: 6 },
      })
    },
  )

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
          authority: { kind: 'public_upstream' },
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
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '1000000',
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.admission).toEqual({ state: 'admitted' })
    expect(readbackOffering.publicationRef).toBe(admitted.publicationRef)
    expect(readbackOffering.publication).toMatchObject({
      state: 'current',
      publicationRef: admitted.publicationRef,
      publicationRevision: admitted.publicationRevision,
      toolRef: admitted.toolRef,
    })
    expect(readbackOffering.publication?.source).toEqual({
      kind: 'openapi_http',
      selector: { path: '/lookup', method: 'post' },
      revision: admitted.sourceRevision,
      digest: admitted.sourceDigest,
    })
    expect(readbackOffering.publication?.pricing).toEqual({
      config: {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '1000000',
      },
      priceDigest: admitted.priceDigest,
    })
    expect(readbackOffering.publication?.binding).toMatchObject({
      bindingId: admitted.bindingId,
      admission: 'admitted',
      conformance: 'conformant',
    })
  })

  it('consumes one owner proof for one exact publication command', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-proof-binding',
    )
    const offeringRef = 'catalog-offering:owner-proof-binding'
    const sourceHash = 'catalog-source:owner-proof-binding:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const origin = {
      kind: 'catalog_offering' as const,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash: sourceHash,
    }
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.proof.binding'),
      'owner-proof-binding:publish',
      origin,
    )
    if (prepared.kind === 'refused')
      throw new Error(`owner_publication_prepare_failed:${prepared.reason}`)
    const {
      proof,
      sourceWrite: _sourceWrite,
      sourceWriteRequest: _sourceWriteRequest,
      ...unsignedWithoutProof
    } = prepared.command
    const withoutProof = await withSourceWrite('catalog_publish', unsignedWithoutProof)
    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, withoutProof),
    ).resolves.toEqual({ kind: 'refused', reason: 'reauthentication_required' })
    await expect(
      backend.run(async (ctx) => ({
        publications: await ctx.db.query('capabilityPublications').collect(),
        proofs: await ctx.db.query('consequenceProofUses').collect(),
      })),
    ).resolves.toEqual({ publications: [], proofs: [] })

    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command),
    ).resolves.toMatchObject({ kind: 'published', publicationRevision: 1 })
    const changed = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('owner.proof.binding'),
      'owner-proof-binding:changed-command',
      origin,
    )
    if (changed.kind === 'refused')
      throw new Error(`owner_publication_changed_prepare_failed:${changed.reason}`)
    const {
      sourceWrite: _changedSourceWrite,
      sourceWriteRequest: _changedSourceWriteRequest,
      ...changedUnsigned
    } = changed.command
    const changedWithReplayedProof = await withSourceWrite('catalog_publish', {
      ...changedUnsigned,
      proof,
    })
    await expect(
      owner.mutation(api.capabilitySupply.publishPreparedCapability, changedWithReplayedProof),
    ).resolves.toEqual({ kind: 'refused', reason: 'command_changed' })
    await expect(
      backend.run(async (ctx) => ({
        publications: await ctx.db.query('capabilityPublications').collect(),
        proofs: await ctx.db.query('consequenceProofUses').collect(),
      })),
    ).resolves.toMatchObject({
      publications: [expect.objectContaining({ revision: 1 })],
      proofs: [expect.objectContaining({ reverificationId: proof.reverificationId })],
    })
  })
})
