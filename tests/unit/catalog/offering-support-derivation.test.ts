import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { deriveBusinessOfferingSupportFromCapabilitySupply, rebuildBusinessSupplyProjectionSnapshotCommand } from '../../../convex/capabilitySupplyProjection'
import schema from '../../../convex/schema'
import { defineCapabilityContract } from '../../../src/modules/capability-contract/public'
import { encodeCapabilityContractDocument } from '../../../src/modules/capability-contract-registry/public'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  capabilityOperationId,
  connectionAuthoritySnapshotFromProviderConnection,
  createPublicOperationRef,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
} from '../../../src/modules/capability-supply/public'
import { createProviderConnection } from '../../../src/modules/capability-supply/provider-connection'
import { pricingConfigDigest } from '../../../src/modules/money/public'
import { convexModules as modules, publishedBusinessOwner } from '../../helpers/convex-fixtures'
const contractDocument = capabilityContractV2({ capabilityId: 'test.lookup' })
const contract = defineCapabilityContract(contractDocument)
const durableContract = encodeCapabilityContractDocument(contractDocument)
const exactPrice = { currency: 'AUD', units: '100', exponent: 2 } as const
const pricingConfig = { version: 'pricing:v2' as const, unit: 'call' as const, paidAmount: exactPrice }
const priceDigest = pricingConfigDigest(pricingConfig)
const catalogOfferingSourceHash = canonicalDigest({ offeringRef: 'offering:1', revision: 1 })
const catalogAccessPathSourceHash = canonicalDigest({ accessPathRef: 'access:1', revision: 1 })
const catalogOrigin = {
  kind: 'catalog_offering' as const,
  offeringRef: 'offering:1',
  offeringRevision: 1,
  offeringSourceHash: catalogOfferingSourceHash,
  declaredAccessPathRef: 'access:1',
  accessPathSourceHash: catalogAccessPathSourceHash,
}
const operationRef = createPublicOperationRef({
  operationId: capabilityOperationId(contract.ref.capabilityId),
  publicationRef: 'publication:1',
  publicationRevision: 1,
  contractRef: contract.ref,
})


describe('catalogue support derivation', () => {
  it('removes routeability when current capability readiness or eligibility transitions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'support-derivation')
    const ids = await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityContractDocuments', {
        capabilityId: contract.ref.capabilityId,
        version: contract.ref.version,
        contractDigest: contract.ref.contractDigest,
        documentJson: durableContract.documentJson,
        status: 'active',
        registeredAt: 1,
      })
      await ctx.db.insert('businessOfferings', {
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        currentRevision: catalogOrigin.offeringRevision,
        status: 'published',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('businessOfferingRevisions', {
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        revision: catalogOrigin.offeringRevision,
        name: 'Lookup',
        category: 'Data',
        summary: 'Lookup one record.',
        price: { kind: 'fixed', amount: exactPrice, taxTreatment: 'inclusive' },
        sourceHash: catalogOrigin.offeringSourceHash,
        createdAt: 1,
      })
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef: catalogOrigin.declaredAccessPathRef,
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        offeringRevision: catalogOrigin.offeringRevision,
        offeringSourceHash: catalogOrigin.offeringSourceHash,
        status: 'published',
        descriptor: {
          kind: 'external_operation',
          name: 'Lookup',
          summary: 'Lookup one record.',
          url: 'https://example.test',
          method: 'GET',
          provenance: 'business_declared',
        },
        sourceHash: catalogOrigin.accessPathSourceHash,
        createdAt: 1,
        updatedAt: 1,
      })
      const offeringRegistration = defineCapabilityOfferingRegistration({
        offeringId: 'co:1',
        businessId,
        networkId: 'ae:public',
        contractRef: contract.ref,
        origin: catalogOrigin,
        presentation: {
          label: 'Lookup',
          summary: 'Lookup one record.',
          price: { kind: 'fixed', amount: exactPrice },
          materialTerms: [{ termId: 'term:scope', label: 'Scope', value: 'One lookup' }],
          commercialRelationship: {
            kind: 'none',
            summary: 'None.',
            influencesEligibility: false,
            influencesInclusion: false,
            influencesOrder: false,
            evidenceRefs: ['relationship:none'],
          },
        },
        searchTerms: ['lookup'],
        registrationEvidenceRefs: ['registration:offering'],
      })
      const offeringRegistrationHash = capabilityOfferingRegistrationHash(offeringRegistration)
      const offeringAdmissionEvidenceRefs = ['admission:offering']
      const connectionResult = createProviderConnection({
        commandId: 'command:create:connection:test',
        connectionRef: 'connection:test',
        businessId: String(businessId),
        providerRef: 'provider:test',
        providerAccountRef: 'account:test',
        adapterId: 'http-json:v1',
        credentialRef: 'env:TEST_PROVIDER_SECRET',
        requestedScopes: [],
        grantedScopes: [],
        requestedResources: [],
        grantedResources: [],
        evidenceRefs: ['evidence:connection'],
      }, 1)
      if (connectionResult.kind !== 'applied') throw new Error(`connection_fixture_${connectionResult.kind}`)
      const connection = connectionResult.connection
      const connectionAuthority = connectionAuthoritySnapshotFromProviderConnection(connection, operationRef)
      const persistedConnectionAuthority = {
        ...connectionAuthority,
        grantedScopes: [...connectionAuthority.grantedScopes],
        grantedResources: [...connectionAuthority.grantedResources],
      }
      const bindingRegistration = defineCapabilityTransportBindingRegistration({
        bindingId: 'binding:1',
        offeringId: 'co:1',
        networkId: 'ae:public',
        contractRef: contract.ref,
        endpointUrl: 'https://example.test',
        authority: { kind: 'provider_connection', connectionRef: 'connection:test', providerRef: 'provider:test' },
        continuation: { kind: 'single_response', evidenceRefs: ['continuation:single'] },
        cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:unsupported'] },
        adapter: { adapterId: 'http-json:v1', config: null },
        registrationEvidenceRefs: ['registration:binding'],
      })
      const transportConfig = {
        method: 'GET',
        fixedQuery: [{ parameter: 'id', value: '1' }],
        requestTimeoutMs: 1_000,
      } as const
      const transport = {
        configJson: JSON.stringify(transportConfig),
        configDigest: canonicalDigest(transportConfig),
      }
      const bindingRegistrationHash = capabilityBindingRegistrationHash(bindingRegistration, transport)
      const bindingAdmissionEvidenceRefs = ['admission:binding']
      const bindingConformanceEvidenceRefs = ['conformance:binding']
      const offeringId = await ctx.db.insert('capabilityOfferings', {
        offeringId: 'co:1',
        businessId,
        networkId: 'ae:public',
        capabilityId: contract.ref.capabilityId,
        version: contract.ref.version,
        contractDigest: contract.ref.contractDigest,
        origin: catalogOrigin,
        presentation: offeringRegistration.presentation,
        searchTerms: [...offeringRegistration.searchTerms],
        registrationEvidenceRefs: [...offeringRegistration.registrationEvidenceRefs],
        registrationHash: offeringRegistrationHash,
        status: 'active',
        admissionEvidenceRefs: offeringAdmissionEvidenceRefs,
        eligibilityHash: capabilityOfferingEligibilityHash({
          offeringId: 'co:1',
          registrationHash: offeringRegistrationHash,
          status: 'active',
          admissionEvidenceRefs: offeringAdmissionEvidenceRefs,
        }),
        registeredAt: 1,
        updatedAt: 1,
      })
      const bindingId = await ctx.db.insert('capabilityTransportBindings', {
        bindingId: 'binding:1',
        offeringId: 'co:1',
        networkId: 'ae:public',
        capabilityId: contract.ref.capabilityId,
        version: contract.ref.version,
        contractDigest: contract.ref.contractDigest,
        endpointUrl: 'https://example.test',
        authority: bindingRegistration.authority,
        connectionAuthority: persistedConnectionAuthority,
        continuation: bindingRegistration.continuation,
        cancellation: bindingRegistration.cancellation,
        adapterId: bindingRegistration.adapter.adapterId,
        configJson: transport.configJson,
        configDigest: transport.configDigest,
        registrationEvidenceRefs: [...bindingRegistration.registrationEvidenceRefs],
        registrationHash: bindingRegistrationHash,
        admission: 'admitted',
        conformance: 'conformant',
        admissionEvidenceRefs: bindingAdmissionEvidenceRefs,
        conformanceEvidenceRefs: bindingConformanceEvidenceRefs,
        eligibilityHash: capabilityBindingEligibilityHash({
          bindingId: 'binding:1',
          registrationHash: bindingRegistrationHash,
          admission: 'admitted',
          conformance: 'conformant',
          admissionEvidenceRefs: bindingAdmissionEvidenceRefs,
          conformanceEvidenceRefs: bindingConformanceEvidenceRefs,
        }),
        registeredAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('capabilityProviderConnections', {
        connectionRef: connection.connectionRef,
        businessId,
        providerRef: connection.providerRef,
        providerAccountRef: connection.providerAccountRef,
        adapterId: connection.adapterId,
        credentialRef: connection.credentialRef,
        grantedScopes: [...connection.grantedScopes],
        grantedResources: [...connection.grantedResources],
        authorityGeneration: connection.authorityGeneration,
        authorityDigest: connection.authorityDigest,
        lifecycle: connection.lifecycle,
        observedAt: connection.observedAt,
        ...(connection.expiresAt === undefined ? {} : { expiresAt: connection.expiresAt }),
        ...(connection.revokedAt === undefined ? {} : { revokedAt: connection.revokedAt }),
        ...(connection.reasonCode === undefined ? {} : { reasonCode: connection.reasonCode }),
        evidenceRefs: [...connection.evidenceRefs],
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
        lastCommandId: connection.lastCommandId ?? 'command:create:connection:test',
        lastCommandDigest: connection.lastCommandDigest ?? connectionResult.commandDigest,
      })
      const publicationId = await ctx.db.insert('capabilityPublications', {
        operationRef,
        publicationRef: 'publication:1',
        revision: 1,
        businessId,
        networkId: 'ae:public',
        runtimeEnvironment: 'production',
        sourceKind: 'openapi_http',
        sourceRevision: 'source-revision:1',
        sourceDigest: canonicalDigest({ publicationRef: 'publication:1', revision: 1 }),
        pricingConfigJson: JSON.stringify(pricingConfig),
        priceDigest,
        publisherRef: 'owner:test',
        authorityMode: 'provider_owned',
        provenanceDigest: canonicalDigest({ publicationRef: 'publication:1', revision: 1, publisherRef: 'owner:test' }),
        capabilityId: contract.ref.capabilityId,
        version: contract.ref.version,
        contractDigest: contract.ref.contractDigest,
        offeringId: 'co:1',
        bindingId: 'binding:1',
        disposition: 'current',
        connectionAuthority: persistedConnectionAuthority,
        credentialState: 'ready',
        healthState: 'healthy',
        readinessTargetDigest: canonicalDigest({ endpointUrl: 'https://example.test', method: 'GET' }),
        readinessRequestDigest: canonicalDigest({ method: 'GET' }),
        readinessObservedAt: 90,
        readinessValidUntil: 200,
        readinessResponseStatus: 200,
        readinessResponseContentType: 'application/json',
        readinessResponseDigest: canonicalDigest('{}'),
        readinessOutcome: 'healthy',
        readinessEvidenceRefs: ['readiness:1'],
        registrationEvidenceRefs: ['registration:publication'],
        createdAt: 1,
        updatedAt: 1,
      })
      return { offeringId, bindingId, publicationId }
    })

    const derive = (now: number) => backend.run((ctx) => deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, businessId, now))
    await expect(derive(100)).resolves.toMatchObject({ 'offering:1': { integrated: true, routeable: true, validUntil: 200 } })
    await expect(derive(201)).resolves.toMatchObject({ 'offering:1': { integrated: true, routeable: false } })

    await backend.run((ctx) => ctx.db.patch(ids.publicationId, { disposition: 'withdrawn' }))
    await expect(derive(100)).resolves.toMatchObject({ 'offering:1': { integrated: true, routeable: false } })

    await backend.run(async (ctx) => {
      await ctx.db.patch(ids.publicationId, { disposition: 'current' })
      await ctx.db.patch(ids.bindingId, { admission: 'not_admitted' })
    })
    await expect(derive(100)).resolves.toEqual({ 'offering:1': { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: 100 } })

    await backend.run(async (ctx) => {
      await ctx.db.patch(ids.bindingId, { admission: 'admitted', conformance: 'not_conformant' })
    })
    await expect(derive(100)).resolves.toEqual({ 'offering:1': { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: 100 } })

    await backend.run(async (ctx) => {
      await ctx.db.patch(ids.bindingId, { conformance: 'conformant' })
      await ctx.db.patch(ids.offeringId, { status: 'inactive' })
    })
    await expect(derive(100)).resolves.toEqual({})

    await backend.run(async (ctx) => {
      await ctx.db.patch(ids.offeringId, { status: 'active' })
      await ctx.db.patch(ids.publicationId, { healthState: 'unhealthy' })
    })
    await expect(derive(100)).resolves.toMatchObject({ 'offering:1': { integrated: true, routeable: false } })
  })

  it('refuses the canonical public-business boundary when a current Offering revision is missing', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'missing-offering-revision')
    await backend.run(async (ctx) => {
      await ctx.db.insert('businessOfferings', {
        businessId, offeringRef: 'offering:1', currentRevision: 2, status: 'published',         createdAt: 1, updatedAt: 2,
      })
    })

    await expect(backend.run((ctx) => rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db, sourceDb: ctx.db, businessId, support: {}, now: 10,
    }))).resolves.toEqual({ kind: 'error', code: 'business_not_public' })
    const snapshot = await backend.run(async () => null)
    expect(snapshot).toBeNull()
  })

  it('does not replace an unchanged registry search document when only observedAt moved', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'search-doc-noop')
    await backend.run(async (ctx) => {
      await ctx.db.insert('businessOfferings', {
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        currentRevision: catalogOrigin.offeringRevision,
        status: 'published',
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.insert('businessOfferingRevisions', {
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        revision: catalogOrigin.offeringRevision,
        name: 'Lookup',
        category: 'Data',
        summary: 'Lookup one record.',
        price: { kind: 'fixed', amount: exactPrice, taxTreatment: 'inclusive' },
        sourceHash: catalogOrigin.offeringSourceHash,
        createdAt: 1,
      })
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef: catalogOrigin.declaredAccessPathRef,
        businessId,
        offeringRef: catalogOrigin.offeringRef,
        offeringRevision: catalogOrigin.offeringRevision,
        offeringSourceHash: catalogOrigin.offeringSourceHash,
        status: 'published',
        descriptor: {
          kind: 'external_operation',
          name: 'Lookup',
          summary: 'Lookup one record.',
          url: 'https://example.test',
          method: 'GET',
          provenance: 'business_declared',
        },
        sourceHash: catalogOrigin.accessPathSourceHash,
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await expect(backend.run((ctx) => rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db, sourceDb: ctx.db, businessId, support: {}, now: 10,
    }))).resolves.toMatchObject({ kind: 'ok' })
    const first = await backend.run(async (ctx) => {
      const documents = await ctx.db.query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', 'search-doc-noop'))
        .take(2)
      return documents[0]
    })
    expect(first).toBeDefined()

    await expect(backend.run((ctx) => rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db, sourceDb: ctx.db, businessId, support: {}, now: 20,
    }))).resolves.toMatchObject({ kind: 'ok' })
    const second = await backend.run(async (ctx) => {
      const documents = await ctx.db.query('registrySearchDocuments')
        .withIndex('by_business', (query) => query.eq('businessSlug', 'search-doc-noop'))
        .take(2)
      return documents[0]
    })
    expect(second?._id).toBe(first?._id)
    expect(second?.updatedAt).toBe(first?.updatedAt)
    expect(second?.sourceHash).toBe(first?.sourceHash)
  })
})
