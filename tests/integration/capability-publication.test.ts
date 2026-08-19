import type { FunctionArgs } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'

import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from '../../convex/capabilitySupplyProjection'
import {
  publicationPorts,
  rebuildCapabilityOriginSupplyProjection,
  quarantineCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
} from '../../convex/capabilitySupply'

import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  isPublicOperationRef,
  parseHttpJsonTransportConfiguration,
  refreshCapabilityCommand,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type CapabilityTransportAuthority,
  type EligibilityInput,
  type OperationSearchWireResult,
  type PublishedOperation,
  type RegistrationContext,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  defineCapabilityContract,
  type CapabilityContract,
  type CapabilityContractDocument,
} from '@/modules/capability-contract/public'
import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { capabilityContractV2 } from '../fixtures/capability-contract-v2'
import {
  convexModules as modules,
  ownerAdmin,
  prepareCapabilityPublicationMutation,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'

type PublishPreparedCapabilityArgs = FunctionArgs<
  typeof api.capabilitySupply.publishPreparedCapability
>
type PublicationFixtureInput = Parameters<
  typeof prepareCapabilityPublicationMutation
>[1]

async function preparedPublicationArgs(
  backend: ConvexFixtureBackend,
  input: PublicationFixtureInput,
): Promise<PublishPreparedCapabilityArgs> {
  const args = await prepareCapabilityPublicationMutation(backend, input)
  const origin = args.prepared.offering.origin
  if (origin?.kind !== 'catalog_offering')
    return await withSourceWrite('catalog_publish', args)
  const accessPath = await backend.run(
    async (ctx) =>
      await ctx.db
        .query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_status', (query) =>
          query.eq('offeringRef', args.offeringRef).eq('status', 'published'),
        )
        .unique(),
  )
  if (accessPath === null) return await withSourceWrite('catalog_publish', args)
  const bound = await prepareCapabilityPublicationMutation(backend, {
    ...input,
    offering: {
      ...args.prepared.offering,
      origin: {
        ...origin,
        declaredAccessPathRef: accessPath.accessPathRef,
        accessPathSourceHash: accessPath.sourceHash,
      },
    },
  })
  return await withSourceWrite('catalog_publish', bound)
}

describe('capability publication', () => {
  it('rebuilds legacy projection rows as strict current rows and remains idempotent', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'legacy-rebuild',
    )
    const legacyIds = await backend.run(async (ctx) => {
      await ctx.db.insert('businessOfferings', {
        offeringRef: 'catalog-offering:legacy-rebuild',
        businessId,
        currentRevision: 1,
        status: 'published',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('businessOfferingRevisions', {
        offeringRef: 'catalog-offering:legacy-rebuild',
        businessId,
        revision: 1,
        name: 'Legacy rebuild lookup',
        category: 'Data',
        summary: 'One exact lookup.',
        sourceHash: 'catalog-source:legacy-rebuild',
        createdAt: 1,
      })
      const accessPathRef = 'access:legacy-rebuild:lookup'
      const descriptor = {
        kind: 'external_operation' as const,
        name: 'Legacy rebuild lookup',
        summary: 'One exact lookup.',
        url: 'https://legacy-rebuild.example.test/lookup',
        method: 'POST' as const,
        provenance: 'business_declared' as const,
      }
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef,
        businessId,
        offeringRef: 'catalog-offering:legacy-rebuild',
        offeringRevision: 1,
        offeringSourceHash: 'catalog-source:legacy-rebuild',
        status: 'published',
        descriptor,
        sourceHash: canonicalDigest({
          accessPathRef,
          offeringSourceHash: 'catalog-source:legacy-rebuild',
          descriptor,
        }),
        createdAt: 1,
        updatedAt: 1,
      })
      const documentId = await ctx.db.insert('registrySearchDocuments', {
        documentId: 'legacy-rebuild__legacy-rebuild',
        schemaVersion: 'registry-search-document:v1',
        businessSlug: 'legacy-rebuild',
        serviceSlug: 'legacy-lookup',
        businessName: 'Legacy rebuild',
        serviceName: 'Legacy lookup',
        serviceCategory: 'Data',
        serviceCategoryKey: 'data',
        suburb: 'Perth',
        stateTerritory: 'WA',
        publicStatus: 'published',
        trustTier: 'listed',
        firstRequestMode: 'not_available_yet',
        placeKeys: ['perth', 'wa'],
        serviceKeywords: ['legacy'],
        searchText: 'legacy rebuild legacy lookup data perth wa',
        serviceArea: 'Perth metro',
        generatedHash: 'legacy:search',
        updatedAt: 1,
      })
      return { documentId }
    })

    const baseInput = capabilityPublicationInput(businessId, 'legacy-rebuild')
    await registerProviderConnection(backend, businessId, 'legacy-rebuild')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, {
        ...baseInput,
        offering: {
          ...baseInput.offering,
          origin: {
            kind: 'catalog_offering' as const,
            offeringRef: 'catalog-offering:legacy-rebuild',
            offeringRevision: 1,
            offeringSourceHash: 'catalog-source:legacy-rebuild',
          },
        },
      }),
    )

    const readRows = () =>
      backend.run(async (ctx) => ({
        searchDocument: await ctx.db
          .query('registrySearchDocuments')
          .withIndex('by_documentId', (query) =>
            query.eq('documentId', 'legacy-rebuild__legacy-rebuild'),
          )
          .unique(),
      }))
    const firstRows = await readRows()
    if (firstRows.searchDocument === null)
      throw new Error('projection_rows_missing')
    expect(firstRows.searchDocument._id).toBe(legacyIds.documentId)
    expect(firstRows.searchDocument).toHaveProperty(
      'offeringRef',
      'catalog-offering:legacy-rebuild',
    )
    for (const legacyField of [
      'serviceSlug',
      'serviceName',
      'serviceCategory',
      'serviceCategoryKey',
      'serviceKeywords',
      'serviceArea',
    ]) {
      expect(firstRows.searchDocument).not.toHaveProperty(legacyField)
    }

    const rebuild = () =>
      backend.run(async (ctx) => {
        const support = await deriveBusinessOfferingSupportFromCapabilitySupply(
          ctx.db,
          businessId,
          1234,
        )
        return rebuildBusinessSupplyProjectionSnapshotCommand({
          db: ctx.db,
          sourceDb: ctx.db,
          businessId,
          support,
          now: 1234,
        })
      })
    await expect(rebuild()).resolves.toMatchObject({ kind: 'ok' })
    const secondRows = await readRows()
    await expect(rebuild()).resolves.toMatchObject({ kind: 'ok' })
    const thirdRows = await readRows()
    expect(thirdRows).toEqual(secondRows)
  })
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

    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
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
    const control = await observer.query(
      api.capabilitySupply.inspectBindingControlState,
      {
        bindingId: published.bindingId,
      },
    )
    if (control.kind !== 'available')
      throw new Error(`binding_control_unavailable:${control.reason}`)
    const quarantined = await runQuarantineThroughCommand(backend, {
      bindingId: published.bindingId,
      expectedObservedRowDigest: control.observedRowDigest,
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

  it('lets the source-bound business owner publish one canonical inactive AE capability', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'independent-one',
    )
    await seedCatalogOffering(backend, businessId, 'independent-one')
    await registerProviderConnection(backend, businessId, 'independent-one')

    const input = {
      businessId,
      source: {
        kind: 'ae_envelope' as const,
        documentJson: JSON.stringify(
          capabilityContractV2({
            capabilityId: 'independent.reference.lookup',
            name: 'Independent reference lookup',
          }),
        ),
      },
      offering: {
        offeringId: 'offering:independent-one:reference-lookup',
        networkId: 'ae:public',
        presentation: {
          label: 'Independent reference lookup',
          summary:
            'Looks up one public reference and returns structured evidence.',
          price: {
            kind: 'fixed' as const,
            amount: { currency: 'AUD', units: '1200', exponent: 2 },
          },
          materialTerms: [
            {
              termId: 'response',
              label: 'Response',
              value: 'One structured response',
            },
          ],
          commercialRelationship: {
            kind: 'none' as const,
            summary: 'No commercial influence.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['business:commercial-neutrality'],
          },
        },
        searchTerms: ['reference', 'lookup'],
        registrationEvidenceRefs: ['business:capability-publication'],
      },
      binding: {
        bindingId: 'binding:independent-one:http',
        endpointUrl:
          'https://independent-one.example.test/capabilities/reference-lookup',
        authority: providerAuthority('independent-one'),
        continuation: {
          kind: 'single_response' as const,
          evidenceRefs: ['business:http-response'],
        },
        cancellation: {
          kind: 'unsupported' as const,
          evidenceRefs: ['business:no-cancellation'],
        },
        adapter: {
          adapterId: 'http-json:v1',
          config: { method: 'POST' as const, requestTimeoutMs: 5_000 },
        },
        registrationEvidenceRefs: ['business:http-binding'],
      },
      ...operationContext('publish'),
    }
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )

    expect(published).toMatchObject({
      kind: 'published',
      publicationRef: 'offering:independent-one:reference-lookup',
      publicationRevision: 1,
      contractRef: {
        capabilityId: 'independent.reference.lookup',
        version: 1,
        contractDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
      offeringId: 'offering:independent-one:reference-lookup',
      bindingId: 'binding:independent-one:http',
      lifecycle: {
        state: 'inactive',
        reasons: [
          'admission_unproven',
          'conformance_unproven',
          'credential_readiness_unobserved',
          'health_unobserved',
        ],
      },
    })
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toEqual({
      kind: 'published',
      publicationRef: published.publicationRef,
      contractRef: published.contractRef,
      offeringId: published.offeringId,
      bindingId: published.bindingId,
      lifecycle: {
        state: 'inactive',
        reasons: ['credential_readiness_unobserved', 'health_unobserved'],
      },
    })

    const persisted = await backend.run(async (ctx) => ({
      contracts: await ctx.db.query('capabilityContractDocuments').collect(),
      offerings: await ctx.db.query('capabilityOfferings').collect(),
      bindings: await ctx.db.query('capabilityTransportBindings').collect(),
    }))
    expect(persisted).toMatchObject({
      contracts: [
        {
          capabilityId: 'independent.reference.lookup',
          version: 1,
          status: 'active',
        },
      ],
      offerings: [
        { offeringId: published.offeringId, businessId, status: 'active' },
      ],
      bindings: [
        {
          bindingId: published.bindingId,
          offeringId: published.offeringId,
          admission: 'admitted',
          conformance: 'conformant',
        },
      ],
    })
  })

  it('fails closed across readiness, stale health, and withdrawal transitions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'lifecycle-one',
    )
    await seedCatalogOffering(backend, businessId, 'lifecycle-one')
    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    const input = capabilityPublicationInput(businessId, 'lifecycle-one')
    await registerProviderConnection(backend, businessId, 'lifecycle-one')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)
    const observed = await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 60_000,
        ...operationContext('observe-ready'),
      },
    )
    expect(observed).toMatchObject({
      kind: 'observed',
      lifecycle: { state: 'inactive' },
    })

    await admitPublication(backend, published, 'lifecycle-one')
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({ lifecycle: { state: 'active', reasons: [] } })
    const operationDetail = await owner.query(
      api.capabilitySupplyOperations.detail,
      {
        operationRef: published.operationRef,
      },
    )
    expect(operationDetail.kind).toBe('found')
    if (operationDetail.kind !== 'found')
      throw new Error(`operation_detail_unavailable:${operationDetail.kind}`)
    expect(operationDetail.operation).toMatchObject({
      callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      paymentLane: 'brokered',
    })
    expect(operationDetail.operation.commercial.priceEvidence).toEqual(
      expect.objectContaining({
        priceDigest: expect.any(String),
      }),
    )
    expect(
      operationDetail.operation.commercial.priceEvidence,
    ).not.toHaveProperty('observedAt')
    expect(
      operationDetail.operation.commercial.priceEvidence,
    ).not.toHaveProperty('validUntil')

    await backend.run(async (ctx) => {
      const publication = await ctx.db
        .query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) =>
          index
            .eq('publicationRef', published.publicationRef)
            .eq('revision', published.publicationRevision),
        )
        .unique()
      if (publication === null) throw new Error('publication_missing')
      await ctx.db.patch(publication._id, {
        readinessValidUntil: Date.now() - 1,
      })
    })
    const staleLifecycle = await owner.query(
      api.capabilitySupply.readCapabilityPublication,
      {
        publicationRef: published.publicationRef,
      },
    )
    expect(staleLifecycle).toMatchObject({ lifecycle: { state: 'inactive' } })
    expect(staleLifecycle?.lifecycle.reasons).toEqual(
      expect.arrayContaining(['health_stale']),
    )

    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'withdraw',
      ),
    )
    expect(withdrawn).toMatchObject({
      kind: 'withdrawn',
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({ lifecycle: { state: 'withdrawn' } })
  })
  it('replays owner maintenance responses and schedules refresh once', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'maintenance-replay',
    )
    await seedCatalogOffering(backend, businessId, 'maintenance-replay')
    await registerProviderConnection(backend, businessId, 'maintenance-replay')
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(businessId, 'maintenance-replay'),
      ),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    const readinessProbeCount = async () =>
      await backend.run(async (ctx) => {
        const db = ctx.db as unknown as {
          system: {
            query: (tableName: string) => {
              take: (limit: number) => Promise<Array<{ name?: string }>>
            }
          }
        }
        const rows = await db.system.query('_scheduled_functions').take(1000)
        return rows.filter(
          (row) => row.name === 'capabilitySupplyReadiness:probe',
        ).length
      })

    const refreshArgs = await ownerMaintenanceArgs(
      backend,
      businessId,
      published.offeringId,
      published.publicationRef,
      published.publicationRevision,
      'maintenance-refresh',
    )
    const scheduledBefore = await readinessProbeCount()
    const refreshed = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      refreshArgs,
    )
    expect(refreshed).toEqual({
      kind: 'refreshed',
      publicationRef: published.publicationRef,
      revision: published.publicationRevision,
      disposition: 'current',
      lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
    })
    const scheduledAfterFirstRefresh = await readinessProbeCount()
    expect(scheduledAfterFirstRefresh).toBeGreaterThan(scheduledBefore)

    const refreshReplay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'maintenance-refresh',
      ),
    )
    expect(refreshReplay).toEqual(refreshed)
    await expect(readinessProbeCount()).resolves.toBe(
      scheduledAfterFirstRefresh,
    )

    const refreshConflict = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.refreshOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...refreshArgs,
        reasonCode: 'changed_payload',
      }),
    )
    expect(refreshConflict).toEqual({
      kind: 'refused',
      reason: 'operation_key_conflict',
    })

    const withdrawArgs = await ownerMaintenanceArgs(
      backend,
      businessId,
      published.offeringId,
      published.publicationRef,
      published.publicationRevision,
      'maintenance-withdraw',
    )
    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      withdrawArgs,
    )
    expect(withdrawn).toEqual({
      kind: 'withdrawn',
      publicationRef: published.publicationRef,
      revision: published.publicationRevision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    const withdrawReplay = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'maintenance-withdraw',
      ),
    )
    expect(withdrawReplay).toEqual(withdrawn)

    const withdrawConflict = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await withSourceWrite('catalog_publish', {
        ...withdrawArgs,
        reasonCode: 'changed_payload',
      }),
    )
    expect(withdrawConflict).toEqual({
      kind: 'refused',
      reason: 'operation_key_conflict',
    })
  })
  it('finds a novel keyless GET after more than 1024 prior publications, executes it, and withdraws it fail closed', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(
      backend,
      'xyz-current-price',
    )
    await seedCatalogOffering(
      backend,
      businessId,
      'xyz-current-price',
      '/price',
      'GET',
    )
    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await backend.run(async (ctx) => {
      for (let index = 0; index < 1025; index += 1) {
        await ctx.db.insert('capabilityPublications', {
          publicationRef: `filler-publication:${index}`,
          operationRef: `filler-operation:${index}`,
          revision: 1,
          businessId,
          networkId: 'ae:public',
          runtimeEnvironment: 'sandbox',
          capabilityId: 'filler.capability',
          version: 1,
          contractDigest: `filler-contract:${index}`,
          sourceKind: 'ae_envelope',
          sourceRevision: `filler-source-revision:${index}`,
          sourceDigest: `filler-source:${index}`,
          publisherRef: 'filler-publisher',
          authorityMode: 'provider_owned',
          provenanceDigest: `filler-provenance:${index}`,
          offeringId: `filler-offering:${index}`,
          bindingId: `filler-binding:${index}`,
          disposition: 'withdrawn',
          credentialState: 'unobserved',
          healthState: 'unobserved',
          readinessEvidenceRefs: [],
          registrationEvidenceRefs: [],
          createdAt: index,
          updatedAt: index,
          withdrawnAt: index,
        })
      }
    })

    const source: KeylessExecutableSourcePort = {
      list: async () => {
        const rows = await backend.query(
          api.capabilitySupplyOperations.listKeylessExecutable,
          {},
        )
        return rows
          .filter((row: (typeof rows)[number]) =>
            isPublicOperationRef(row.operationRef),
          )
          .map(
            ({
              inputSchemaJson,
              inputExamplesJson,
              ...row
            }: (typeof rows)[number]): KeylessExecutableToolDescriptor => {
              const descriptor: KeylessExecutableToolDescriptor = {
                ...row,
                inputSchema: JSON.parse(inputSchemaJson) as Record<
                  string,
                  unknown
                >,
              }
              if (inputExamplesJson === undefined) return descriptor
              return {
                ...descriptor,
                inputExamples: JSON.parse(inputExamplesJson) as NonNullable<
                  KeylessExecutableToolDescriptor['inputExamples']
                >,
              }
            },
          )
      },
      read: async (operationRef) => {
        if (!isPublicOperationRef(operationRef)) return null
        const snapshot = await backend.query(
          internal.capabilitySupplyOperations
            .readCurrentPublishedOperationSnapshot,
          { operationRef },
        )
        if (snapshot === null) return null
        try {
          const operation = JSON.parse(
            snapshot.operationJson,
          ) as PublishedOperation
          const transport = parseHttpJsonTransportConfiguration(
            JSON.parse(operation.transport.configJson),
          )
          if (
            operation.kind !== 'published_operation' ||
            operation.binding.authority.kind !== 'keyless' ||
            operation.binding.adapter.adapterId !== 'http-json:v1' ||
            operation.identity.payment.kind !== 'none' ||
            transport === undefined ||
            transport.method !== 'GET'
          ) {
            return null
          }
          return {
            operationRef,
            capabilityId: operation.contract.ref.capabilityId,
            name: operation.offering.presentation.label,
            endpointUrl: operation.binding.endpointUrl,
            authority: { kind: 'keyless' as const },
            adapterId: operation.binding.adapter.adapterId,
            method: transport.method,
            price: operation.offering.presentation.price,
            effects: operation.contract.effects,
            ...(transport.query === undefined || transport.query.length === 0
              ? {}
              : { query: [...transport.query] }),
            ...(transport.fixedQuery === undefined ||
            transport.fixedQuery.length === 0
              ? {}
              : { fixedQuery: [...transport.fixedQuery] }),
            requestTimeoutMs: transport.requestTimeoutMs,
            inputSchema: operation.contract.inputSchema,
            outputSchema: operation.contract.outputSchema,
            provenance: { publisher: 'ae-internal', sourceKind: 'internal' },
          }
        } catch {
          return null
        }
      },
      search: async (query, descriptors) => {
        if (descriptors.length === 0 || query.trim().length === 0) return []
        const allowed = new Set(
          descriptors.map(({ operationRef }) => operationRef),
        )
        const result: OperationSearchWireResult = await backend.query(
          api.capabilitySupplyOperations.search,
          { query, limit: 10 },
        )
        if (result.kind !== 'ok') return []
        return result.items
          .map(({ operationRef }) => operationRef)
          .filter(
            (operationRef) =>
              isPublicOperationRef(operationRef) && allowed.has(operationRef),
          )
      },
    }

    const input = {
      businessId,
      source: {
        kind: 'ae_envelope' as const,
        documentJson: JSON.stringify(
          capabilityContractV2({
            capabilityId: 'xyz.current-price',
            name: 'XYZ current price',
            description: 'Return the current public price for the XYZ token.',
            inputExamples: [
              { label: 'XYZ current price', input: { request: 'XYZ' } },
            ],
          }),
        ),
      },
      offering: {
        offeringId: 'offering:xyz-current-price',
        networkId: 'ae:public',
        presentation: {
          label: 'XYZ current price',
          summary: 'Returns the current public price for the XYZ token.',
          price: {
            kind: 'fixed' as const,
            amount: { currency: 'AUD', units: '0', exponent: 2 },
          },
          materialTerms: [],
          commercialRelationship: {
            kind: 'none' as const,
            summary: 'No commercial influence.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['business:xyz-neutrality'],
          },
        },
        searchTerms: ['xyz', 'current', 'price', 'token'],
        registrationEvidenceRefs: ['business:xyz-publication'],
      },
      binding: {
        bindingId: 'binding:xyz-current-price:http',
        endpointUrl: 'https://xyz-current-price.example.test/price',
        authority: { kind: 'keyless' as const },
        continuation: {
          kind: 'single_response' as const,
          evidenceRefs: ['business:xyz-response'],
        },
        cancellation: {
          kind: 'unsupported' as const,
          evidenceRefs: ['business:xyz-no-cancellation'],
        },
        adapter: {
          adapterId: 'http-json:v1',
          config: {
            method: 'GET' as const,
            query: [{ inputPointer: '/request', parameter: 'symbol' }],
            requestTimeoutMs: 5_000,
          },
        },
        registrationEvidenceRefs: ['business:xyz-http-binding'],
      },
      ...operationContext('publish-xyz-current-price'),
    }
    const published = await owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(backend, input),
    )
    if ('reason' in published)
      throw new Error(`publication_refused:${published.reason}`)

    await admitPublication(backend, published, 'xyz-current-price')
    const observed = await backend.mutation(
      internal.capabilitySupply.observeCapabilityReadiness,
      {
        publicationRef: published.publicationRef,
        expectedRevision: published.publicationRevision,
        credentialState: 'ready',
        healthState: 'healthy',
        validUntil: Date.now() + 300_000,
        ...operationContext('observe-xyz-current-price'),
      },
    )
    expect(observed).toMatchObject({ kind: 'observed' })
    await expect(
      owner.query(api.capabilitySupply.readCapabilityPublication, {
        publicationRef: published.publicationRef,
      }),
    ).resolves.toMatchObject({
      kind: 'published',
      lifecycle: { state: 'active', reasons: [] },
    })
    const discovered = await backend.query(
      api.capabilitySupplyOperations.search,
      {
        query: 'xyz current price',
        limit: 10,
      },
    )
    expect(discovered.kind).toBe('ok')
    if (discovered.kind !== 'ok')
      throw new Error(`operation_search_unavailable:${discovered.kind}`)
    expect(
      discovered.items.map(
        (item: { operationRef: string }) => item.operationRef,
      ),
    ).toContain(published.operationRef)
    const routeable = await backend.query(
      internal.capabilitySupply.listRouteable,
      {
        networkId: 'ae:public',
        limit: 10,
        now: Date.now(),
      },
    )
    expect(routeable).toMatchObject({
      kind: 'available',
      supplies: [
        expect.objectContaining({
          publication: expect.objectContaining({
            operationRef: published.operationRef,
            readinessValidUntil: expect.any(Number),
          }),
        }),
      ],
    })
    if (routeable.kind !== 'available')
      throw new Error(`routeable_supply_unavailable:${routeable.reason}`)
    expect(routeable.supplies).toHaveLength(1)

    const operationRef = published.operationRef
    const selected = await source.read(operationRef)
    expect(selected).not.toBeNull()
    if (selected === null) {
      throw new Error('xyz_current_price_not_read')
    }
    expect(selected).toMatchObject({
      operationRef,
      capabilityId: 'xyz.current-price',
      endpointUrl: 'https://xyz-current-price.example.test/price',
      authority: { kind: 'keyless' },
      adapterId: 'http-json:v1',
      method: 'GET',
    })
    expect(isPublicOperationRef(selected.operationRef)).toBe(true)
    expect(selected.operationRef).toBe(operationRef)

    const providerFetch = vi.fn(
      async (_input: URL | RequestInfo, _init?: RequestInit) =>
        new Response(JSON.stringify({ result: '123.45' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const isPublicTarget = vi.fn(async (_url: URL) => true)
    const executed = await executeKeylessOperation(
      { operationRef, input: { request: 'XYZ' } },
      source,
      { fetchImpl: providerFetch, isPublicTarget },
    )
    expect(executed).toMatchObject({
      kind: 'ok',
      operationRef,
      capabilityId: 'xyz.current-price',
      output: { result: '123.45' },
    })
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(isPublicTarget).toHaveBeenCalledTimes(1)

    const withdrawn = await owner.mutation(
      api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability,
      await ownerMaintenanceArgs(
        backend,
        businessId,
        published.offeringId,
        published.publicationRef,
        published.publicationRevision,
        'withdraw-xyz-current-price',
      ),
    )
    expect(withdrawn).toMatchObject({
      kind: 'withdrawn',
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })

    providerFetch.mockClear()
    isPublicTarget.mockClear()
    await expect(source.read(operationRef)).resolves.toBeNull()
    const withdrawnRouteable = await backend.query(
      internal.capabilitySupply.listRouteable,
      {
        networkId: 'ae:public',
        limit: 10,
        now: Date.now(),
      },
    )
    expect(withdrawnRouteable).toMatchObject({
      kind: 'available',
      supplies: [],
    })

    const refused = await executeKeylessOperation(
      { operationRef, input: { request: 'XYZ' } },
      source,
      { fetchImpl: providerFetch, isPublicTarget },
    )
    expect(refused).toEqual({
      kind: 'refused',
      operationRef,
      reason: 'operation_not_found',
    })
    expect(providerFetch).not.toHaveBeenCalled()
    expect(isPublicTarget).not.toHaveBeenCalled()
  })

  it('projects two independent publications through one generic graph path', async () => {
    const backend = convexTest(schema, modules)
    const first = await publishedBusinessOwner(backend, 'graph-one')
    const second = await publishedBusinessOwner(backend, 'graph-two')
    await seedCatalogOffering(backend, first.businessId, 'graph-one')
    await seedCatalogOffering(backend, second.businessId, 'graph-two')
    const observer = await ownerAdmin(
      backend,
      'user_capability_publication_observer',
    )
    await registerProviderConnection(backend, first.businessId, 'graph-one')
    await registerProviderConnection(backend, second.businessId, 'graph-two')
    const firstPublished = await first.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(first.businessId, 'graph-one'),
      ),
    )
    const secondPublished = await second.owner.mutation(
      api.capabilitySupply.publishPreparedCapability,
      await preparedPublicationArgs(
        backend,
        capabilityPublicationInput(second.businessId, 'graph-two'),
      ),
    )
    if ('reason' in firstPublished)
      throw new Error('independent_publication_refused')
    if ('reason' in secondPublished)
      throw new Error('independent_publication_refused')

    await admitPublication(backend, firstPublished, 'graph-one')
    await admitPublication(backend, secondPublished, 'graph-two')
    for (const published of [firstPublished, secondPublished]) {
      await backend.mutation(
        internal.capabilitySupply.observeCapabilityReadiness,
        {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
          credentialState: 'ready',
          healthState: 'healthy',
          validUntil: Date.now() + 60_000,
          ...operationContext(`observe-${published.publicationRef}`),
        },
      )
    }
    const graph = await first.owner.query(
      api.capabilitySupply.queryCapabilityGraph,
      {
        networkId: 'ae:public',
        includeInactive: false,
        limit: 10,
      },
    )
    expect(graph).toMatchObject({
      kind: 'available',
      nodes: expect.arrayContaining([
        expect.objectContaining({
          publicationRef: firstPublished.publicationRef,
          businessId: first.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            claimStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
        expect.objectContaining({
          publicationRef: secondPublished.publicationRef,
          businessId: second.businessId,
          trust: expect.objectContaining({
            publicStatus: 'published',
            claimStatus: 'published',
            suppressed: false,
            currentlyPublished: true,
          }),
        }),
      ]),
    })
    if (graph.kind !== 'available')
      throw new Error(`capability_graph_unavailable:${graph.reason}`)
    expect(graph.nodes).toHaveLength(2)
    expect(JSON.stringify(graph)).not.toContain('credentialRef')
    expect(JSON.stringify(graph)).not.toContain('_KEY')
  })

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for an OpenAPI %s operation before network execution',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `openapi-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(backend, businessId, suffix)
      const contractDocument = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.openapi.${effectClass.replaceAll('_', '-')}`,
          name: `OpenAPI ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const { inputSchema, outputSchema } = contractDocument
      const input = {
        businessId,
        source: {
          kind: 'openapi_http' as const,
          document: {
            openapi: '3.1.0',
            servers: [{ url: `https://${suffix}.example.test` }],
            components: {
              securitySchemes: {
                ProviderKey: {
                  type: 'apiKey',
                  in: 'header',
                  name: 'X-Provider-Key',
                },
              },
            },
            paths: {
              '/lookup': {
                post: {
                  security: [{ ProviderKey: [] }],
                  requestBody: {
                    content: { 'application/json': { schema: inputSchema } },
                  },
                  responses: {
                    200: {
                      content: { 'application/json': { schema: outputSchema } },
                    },
                  },
                },
              },
            },
          },
          operation: { path: '/lookup' as const, method: 'post' as const },
          contract: contractMetadata(contractDocument),
          commercial: {
            offering: direct.offering,
            bindingId: direct.binding.bindingId,
            authority: direct.binding.authority,
            registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
            requestTimeoutMs: 5_000,
          },
          evidenceRefs: ['business:openapi-description'],
        },
        ...operationContext(`publish-${suffix}`),
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, input),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        offeringId: direct.offering.offeringId,
        bindingId: direct.binding.bindingId,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')
      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
    },
  )

  it.each(['financial_exposure', 'external_state_change'] as const)(
    'refuses automatic readiness for effectful MCP %s before tools/call',
    async (effectClass) => {
      const backend = convexTest(schema, modules)
      const suffix = `mcp-${effectClass}`
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        suffix,
      )
      await seedCatalogOffering(backend, businessId, suffix)
      const direct = capabilityPublicationInput(businessId, suffix)
      await registerProviderConnection(
        backend,
        businessId,
        suffix,
        'mcp-jsonrpc:v1',
      )
      const document = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.mcp.${effectClass.replaceAll('_', '-')}`,
          name: `MCP ${effectClass}`,
          effects: [
            {
              effectId: 'request_release',
              class: 'data_release',
              authority: 'mandate_or_explicit',
              reversibility: 'irreversible',
            },
            {
              effectId: 'unsafe_effect',
              class: effectClass,
              authority:
                effectClass === 'financial_exposure'
                  ? 'mandate_or_explicit'
                  : 'explicit',
              reversibility: 'conditional',
            },
          ],
          lifecycle: {
            idempotency: 'required',
            recovery: 'reconcile_required',
          },
        }),
      )
      const commercial = {
        offering: direct.offering,
        bindingId: direct.binding.bindingId,
        authority: direct.binding.authority,
        registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
        requestTimeoutMs: 5_000,
      }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, {
          businessId,
          source: {
            kind: 'mcp' as const,
            serverUrl: `https://${suffix}.example.test/rpc`,
            tool: {
              name: 'reference_lookup',
              inputSchema: document.inputSchema,
              outputSchema: document.outputSchema,
            },
            protocolVersion: '2025-06-18',
            contract: contractMetadata(document),
            commercial,
            evidenceRefs: ['business:mcp-description'],
          },
          ...operationContext(`publish-${suffix}`),
        }),
      )
      expect(published).toMatchObject({
        kind: 'published',
        publicationRevision: 1,
        lifecycle: { state: 'inactive' },
      })
      if (published.kind !== 'published')
        throw new Error('publication_not_published')

      await expect(
        backend.action(internal.capabilitySupplyReadiness.probe, {
          publicationRef: published.publicationRef,
          expectedRevision: published.publicationRevision,
        }),
      ).resolves.toEqual({
        kind: 'unavailable',
        reason: 'effectful_probe_unsupported',
        evidenceRefs: ['probe-target:effectful_probe_unsupported'],
      })
    },
  )

  it.each(['mcp', 'x402'] as const)(
    'publishes a generic %s description through the production command',
    async (kind) => {
      const backend = convexTest(schema, modules)
      const { businessId, owner } = await publishedBusinessOwner(
        backend,
        `${kind}-one`,
      )
      await seedCatalogOffering(backend, businessId, `${kind}-one`)
      const direct = capabilityPublicationInput(businessId, `${kind}-one`)
      await registerProviderConnection(
        backend,
        businessId,
        `${kind}-one`,
        kind === 'mcp' ? 'mcp-jsonrpc:v1' : 'x402-fetch:v2',
      )
      const document = defineCapabilityContract(
        capabilityContractV2({
          capabilityId: `independent.${kind}.lookup`,
          name: `${kind} lookup`,
        }),
      )
      const { inputSchema, outputSchema } = document
      const contract = contractMetadata(document)
      const commercial = {
        offering: direct.offering,
        bindingId: direct.binding.bindingId,
        authority: direct.binding.authority,
        registrationEvidenceRefs: direct.binding.registrationEvidenceRefs,
        requestTimeoutMs: 5_000,
      }
      const source =
        kind === 'mcp'
          ? {
              kind,
              serverUrl: 'https://mcp-one.example.test/rpc',
              tool: { name: 'reference_lookup', inputSchema, outputSchema },
              protocolVersion: '2025-06-18',
              contract,
              commercial,
              evidenceRefs: ['business:mcp-description'],
            }
          : {
              kind,
              resource: {
                resourceUrl: 'https://x402-one.example.test/lookup',
                inputSchema,
                outputSchema,
                price: { currency: 'AUD', units: '1200', exponent: 2 },
                scheme: 'exact',
                network: 'eip155:84532',
                asset: '0x0000000000000000000000000000000000000001',
                payTo: '0x0000000000000000000000000000000000000002',
                routeAmountExponent: 2,
                assetAmountExponent: 6,
              },
              contract,
              commercial: {
                ...commercial,
                offering: {
                  ...commercial.offering,
                  presentation: {
                    ...commercial.offering.presentation,
                    price: {
                      kind: 'fixed' as const,
                      amount: { currency: 'AUD', units: '1200', exponent: 2 },
                    },
                  },
                },
              },
              evidenceRefs: ['business:x402-description'],
            }
      const published = await owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        await preparedPublicationArgs(backend, {
          businessId,
          source,
          ...operationContext(`publish-${kind}`),
        }),
      )
    },
  )

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
    await registerProviderConnection(backend, businessId, 'compatible-two')
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
        binding: next.binding,
        evidenceRefs: next.evidenceRefs,
      },
      next.offering,
      next.binding,
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

type CapabilityContractAnnotation = Omit<
  CapabilityContractDocument['customerAnnotations'][number],
  'semanticIdentity' | 'prompt' | 'inference'
> & {
  semanticIdentity?: string
  prompt?: string
  inference?: 'allowed' | 'customer_required'
}

type CapabilityContractMetadata = Omit<
  CapabilityContractDocument,
  'contractFormat' | 'inputSchema' | 'outputSchema' | 'customerAnnotations'
> & {
  customerAnnotations: CapabilityContractAnnotation[]
}

function contractMetadata(
  document: CapabilityContract,
): CapabilityContractMetadata {
  return {
    capabilityId: document.capabilityId,
    version: document.version,
    name: document.name,
    description: document.description,
    customerAnnotations: document.customerAnnotations.map(
      (annotation): CapabilityContractAnnotation => ({
        annotationId: annotation.annotationId,
        document: annotation.document,
        pointer: annotation.pointer,
        label: annotation.label,
        role: annotation.role,
        ...(annotation.semanticIdentity === undefined
          ? {}
          : { semanticIdentity: annotation.semanticIdentity }),
        ...(annotation.prompt === undefined
          ? {}
          : { prompt: annotation.prompt }),
        ...(annotation.inference === undefined
          ? {}
          : { inference: annotation.inference }),
      }),
    ),
    dataUse: document.dataUse.map((declaration) => ({
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient,
      purposes: declaration.purposes,
    })),
    effects: document.effects.map((effect) => ({
      effectId: effect.effectId,
      class: effect.class,
      authority: effect.authority,
      reversibility: effect.reversibility,
    })),
    evidence: document.evidence.map((item) => ({
      evidenceId: item.evidenceId,
      outputPointer: item.outputPointer,
      purpose: item.purpose,
    })),
    lifecycle: {
      idempotency: document.lifecycle.idempotency,
      recovery: document.lifecycle.recovery,
    },
  }
}

type PublicationOperationContext = Readonly<{
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
}>

function operationContext(suffix: string): PublicationOperationContext {
  return {
    operationKey: `op:capability-publication:${suffix}`,
    correlationId: `corr:capability-publication:${suffix}`,
    reasonCode: 'business_capability_publication',
    evidenceRefs: ['test:capability-publication'],
  }
}

async function runEligibilityThroughCommand(
  backend: ConvexFixtureBackend,
  args: EligibilityInput & RegistrationContext,
  actorRef = 'user_capability_publication_observer',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await setCapabilitySupplyEligibilityCommand(
      ctx.db,
      {
        actor: { kind: 'admin', ref: actorRef },
        eligibility: args,
        context: args,
      },
      now,
    )
    if (result.kind === 'eligible' || result.kind === 'ineligible') {
      const offering = await ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (index) =>
          index.eq('offeringId', args.offeringId),
        )
        .unique()
      if (offering !== null)
        await rebuildCapabilityOriginSupplyProjection(
          ctx,
          offering.businessId,
          now,
        )
    }
    return result
  })
}

async function runQuarantineThroughCommand(
  backend: ConvexFixtureBackend,
  args: RegistrationContext &
    Readonly<{
      bindingId: string
      expectedObservedRowDigest: string
    }>,
  actorRef = 'user_capability_publication_observer',
) {
  return await backend.run(async (ctx) => {
    const now = Date.now()
    const result = await quarantineCapabilityBindingCommand(
      ctx.db,
      {
        actor: { kind: 'admin', ref: actorRef },
        bindingId: args.bindingId,
        expectedObservedRowDigest: args.expectedObservedRowDigest,
        context: args,
      },
      now,
    )
    if (result.kind === 'quarantined') {
      const binding = await ctx.db
        .query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) =>
          index.eq('bindingId', args.bindingId),
        )
        .unique()
      if (binding !== null) {
        const offering = await ctx.db
          .query('capabilityOfferings')
          .withIndex('by_offeringId', (index) =>
            index.eq('offeringId', binding.offeringId),
          )
          .unique()
        if (offering !== null)
          await rebuildCapabilityOriginSupplyProjection(
            ctx,
            offering.businessId,
            now,
          )
      }
    }
    return result
  })
}

async function ownerMaintenanceArgs(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringId: string,
  publicationRef: string,
  publicationRevision: number,
  suffix: string,
) {
  const catalog = await backend.run(async (ctx) => {
    const capabilityOffering = await ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId))
      .unique()
    if (capabilityOffering === null)
      throw new Error('owner_maintenance_offering_missing')
    const origin = capabilityOffering.origin
    if (origin?.kind !== 'catalog_offering') {
      throw new Error('owner_maintenance_catalog_origin_missing')
    }
    const revision = await ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) =>
        query
          .eq('offeringRef', origin.offeringRef)
          .eq('revision', origin.offeringRevision),
      )
      .unique()
    if (revision === null)
      throw new Error('owner_maintenance_catalog_revision_missing')
    return {
      offeringRef: origin.offeringRef,
      offeringRevision: origin.offeringRevision,
      offeringSourceHash: revision.sourceHash,
    }
  })
  return await withSourceWrite('catalog_publish', {
    businessId,
    ...catalog,
    publicationRef,
    publicationRevision,
    ...operationContext(suffix),
  })
}

async function refreshCapabilityThroughTestSeam(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  publicationRef: string,
  expectedRevision: number,
  source: CapabilityPublicationImport,
  offering: CapabilityPublicationOfferingDraft | undefined,
  binding: CapabilityPublicationBindingDraft | undefined,
  context: PublicationOperationContext,
) {
  return await backend.run(async (ctx) => {
    const ports = publicationPorts(ctx)
    const publication = await ports.loadPublicationAtRevision(
      publicationRef,
      expectedRevision,
    )
    if (publication === null)
      throw new Error('refresh_test_publication_missing')
    const result = await refreshCapabilityCommand(
      {
        publication,
        source,
        offering,
        binding,
        ...context,
        now: Date.now(),
      },
      ports,
    )
    if (result.kind === 'refreshed') {
      if (publication.businessId !== businessId)
        throw new Error('refresh_test_business_mismatch')
      await rebuildCapabilityOriginSupplyProjection(ctx, businessId, Date.now())
    }
    return result
  })
}

async function readProjectedSupport(
  _backend: ReturnType<typeof convexTest>,
  _businessId: Id<'businesses'>,
) {
  throw new Error('projection_snapshot_missing')
}

function providerAuthority(
  name: string,
): Extract<CapabilityTransportAuthority, { kind: 'provider_connection' }> {
  return {
    kind: 'provider_connection',
    connectionRef: `connection:capability-publication:${name}`,
    providerRef: `provider:capability-publication:${name}`,
  }
}
async function registerProviderConnection(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  adapterId = 'http-json:v1',
) {
  const { connectionRef, providerRef } = providerAuthority(suffix)
  const result = await backend.mutation(
    internal.capabilityProviderConnections.create,
    {
      commandId: `command:create:capability-publication:${suffix}`,
      connectionRef,
      businessId,
      providerRef,
      providerAccountRef: `account:capability-publication:${suffix}`,
      adapterId,
      credentialRef: null,
      requestedScopes: [`capability:capability-publication:${suffix}`],
      grantedScopes: [`capability:capability-publication:${suffix}`],
      requestedResources: [`resource:capability-publication:${suffix}`],
      grantedResources: [`resource:capability-publication:${suffix}`],
      evidenceRefs: [`test:provider-connection:${suffix}`],
      now: 1,
    },
  )
  if (result.kind !== 'applied') {
    throw new Error(`provider_connection_fixture_${result.kind}`)
  }
  return result.connection
}

function capabilityPublicationInput(
  businessId: Id<'businesses'>,
  suffix: string,
) {
  return {
    businessId,
    source: {
      kind: 'ae_envelope' as const,
      documentJson: JSON.stringify(
        capabilityContractV2({
          capabilityId: `independent.${suffix}.lookup`,
          name: `${suffix} lookup`,
        }),
      ),
    },
    offering: {
      offeringId: `offering:${suffix}:lookup`,
      networkId: 'ae:public',
      presentation: {
        label: `${suffix} lookup`,
        summary: 'Returns one structured result.',
        price: {
          kind: 'fixed' as const,
          amount: { currency: 'AUD' as const, units: '1200', exponent: 2 },
        },
        materialTerms: [],
        commercialRelationship: {
          kind: 'none' as const,
          summary: 'No commercial influence.',
          influencesEligibility: false,
          influencesInclusion: false,
          influencesOrder: false,
          evidenceRefs: ['business:neutral'],
        },
      },
      searchTerms: ['lookup'],
      registrationEvidenceRefs: ['business:publication'],
    },
    binding: {
      bindingId: `binding:${suffix}:http`,
      endpointUrl: `https://${suffix}.example.test/lookup`,
      authority: providerAuthority(suffix),
      continuation: {
        kind: 'single_response' as const,
        evidenceRefs: ['business:response'],
      },
      cancellation: {
        kind: 'unsupported' as const,
        evidenceRefs: ['business:no-cancellation'],
      },
      adapter: {
        adapterId: 'http-json:v1',
        config: { method: 'POST' as const, requestTimeoutMs: 5_000 },
      },
      registrationEvidenceRefs: ['business:binding'],
    },
    ...operationContext(`publish-${suffix}`),
  }
}
async function seedCatalogOffering(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  suffix: string,
  endpointPath = '/lookup',
  endpointMethod: 'GET' | 'POST' = 'POST',
): Promise<void> {
  await backend.run(async (ctx) => {
    const offeringRef = `catalog-offering:${suffix}`
    const offeringSourceHash = `catalog-source:${suffix}`
    const accessPathRef = `access:${suffix}:lookup`
    const descriptor = {
      kind: 'external_operation' as const,
      name: `${suffix} lookup`,
      summary: 'Returns one structured result.',
      url: `https://${suffix}.example.test${endpointPath}`,
      method: endpointMethod,
      provenance: 'business_declared' as const,
    }
    await ctx.db.insert('businessOfferings', {
      offeringRef,
      businessId,
      currentRevision: 1,
      status: 'published',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef,
      businessId,
      revision: 1,
      name: `${suffix} lookup`,
      category: 'Data',
      summary: 'Returns one structured result.',
      sourceHash: offeringSourceHash,
      createdAt: 1,
    })
    await ctx.db.insert('offeringAccessPaths', {
      accessPathRef,
      businessId,
      offeringRef,
      offeringRevision: 1,
      offeringSourceHash,
      status: 'published',
      descriptor,
      sourceHash: canonicalDigest({
        accessPathRef,
        offeringSourceHash,
        descriptor,
      }),
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

async function admitPublication(
  backend: ReturnType<typeof convexTest>,
  publication: Readonly<{
    offeringId: string
    bindingId: string
    contractRef: {
      capabilityId: string
      version: number
      contractDigest: string
    }
  }>,
  suffix: string,
) {
  const hashes = await publicationRegistrationHashes(backend, publication)
  const admitted = await runEligibilityThroughCommand(backend, {
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    contractRef: publication.contractRef,
    decision: 'admit',
    expectedOfferingRegistrationHash: hashes.offering,
    expectedBindingRegistrationHash: hashes.binding,
    admissionEvidenceRefs: [`test:admission:${suffix}`],
    conformanceEvidenceRefs: [`test:conformance:${suffix}`],
    ...operationContext(`admit-${suffix}`),
  })
  expect(admitted.kind).toBe('eligible')
}

async function publicationRegistrationHashes(
  backend: ReturnType<typeof convexTest>,
  publication: Readonly<{ offeringId: string; bindingId: string }>,
) {
  return backend.run(async (ctx) => {
    const offering =
      (await ctx.db.query('capabilityOfferings').collect()).find(
        (row) => row.offeringId === publication.offeringId,
      ) ?? null
    const binding =
      (await ctx.db.query('capabilityTransportBindings').collect()).find(
        (row) => row.bindingId === publication.bindingId,
      ) ?? null
    if (offering === null || binding === null)
      throw new Error('publication_supply_missing')
    return {
      offering: offering.registrationHash,
      binding: binding.registrationHash,
    }
  })
}
