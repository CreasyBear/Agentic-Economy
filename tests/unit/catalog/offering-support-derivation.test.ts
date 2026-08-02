import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { deriveBusinessOfferingSupportFromCapabilitySupply, rebuildBusinessSupplyProjectionSnapshotCommand } from '../../../convex/capabilitySupplyProjection'
import schema from '../../../convex/schema'
import { convexModules as modules, publishedBusinessOwner } from '../../helpers/convex-fixtures'

describe('catalogue support derivation', () => {
  it('removes routeability when current capability readiness or eligibility transitions', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'support-derivation')
    const ids = await backend.run(async (ctx) => {
      const offeringId = await ctx.db.insert('capabilityOfferings', {
        offeringId: 'co:1', businessId, networkId: 'ae:public', capabilityId: 'test.lookup', version: 1,
        contractDigest: 'contract:1',
        origin: { kind: 'catalog_offering', offeringRef: 'offering:1', offeringRevision: 1, offeringSourceHash: 'source:1' },
        presentation: {
          label: 'Lookup', summary: 'Lookup one record.', price: { kind: 'on_request' }, materialTerms: [],
          commercialRelationship: { kind: 'none', summary: 'None.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: [] },
        },
        searchTerms: [], registrationEvidenceRefs: [], registrationHash: 'registration:1', status: 'active',
        admissionEvidenceRefs: [], eligibilityHash: 'eligibility:1', registeredAt: 1, updatedAt: 1,
      })
      const bindingId = await ctx.db.insert('capabilityTransportBindings', {
        bindingId: 'binding:1', offeringId: 'co:1', networkId: 'ae:public', capabilityId: 'test.lookup', version: 1,
        contractDigest: 'contract:1', endpointUrl: 'https://example.test', credentialRef: 'credential:1',
        continuation: { kind: 'single_response', evidenceRefs: [] }, cancellation: { kind: 'unsupported', evidenceRefs: [] },
        adapterId: 'test', configJson: '{}', configDigest: 'config:1', registrationEvidenceRefs: [], registrationHash: 'registration:1',
        admission: 'admitted', conformance: 'conformant', admissionEvidenceRefs: [], conformanceEvidenceRefs: [],
        eligibilityHash: 'eligibility:1', registeredAt: 1, updatedAt: 1,
      })
      const publicationId = await ctx.db.insert('capabilityPublications', {
        publicationRef: 'publication:1', revision: 1, businessId, networkId: 'ae:public', sourceKind: 'ae_envelope',
        sourceDigest: 'source:1', capabilityId: 'test.lookup', version: 1, contractDigest: 'contract:1', offeringId: 'co:1', bindingId: 'binding:1',
        disposition: 'current', credentialState: 'ready', healthState: 'healthy', readinessEvidenceRefs: [], readinessObservedAt: 90,
        readinessValidUntil: 200, registrationEvidenceRefs: [], createdAt: 1, updatedAt: 1,
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

  it('marks the prior snapshot pending when a current Offering revision is missing', async () => {
    const backend = convexTest(schema, modules)
    const { businessId } = await publishedBusinessOwner(backend, 'missing-offering-revision')
    await backend.run(async (ctx) => {
      await ctx.db.insert('businessContexts', {
        businessId, category: 'Data', suburb: 'Perth', stateTerritory: 'WA', sourceRefs: [], sourceHash: 'context:1', approvedAt: 1,
      })
      await ctx.db.insert('businessOfferings', {
        businessId, offeringRef: 'offering:1', currentRevision: 2, status: 'published', createdAt: 1, updatedAt: 2,
      })
      await ctx.db.insert('operatorControls', {
        key: 'offering_public_projection_enabled', enabled: true, changedByAdminRef: 'test', reasonCode: 'test', evidenceRefs: [],
        correlationId: 'correlation:1', operationKey: 'operation:1', updatedAt: 1,
      })
      await ctx.db.insert('businessSupplyProjectionSnapshots', {
        businessId, sourceRevision: 1, sourceDigest: 'projection:old', observedAt: 1, disposition: 'current', status: 'current', updatedAt: 1,
        projection: {
          business: { businessId, slug: 'missing-offering-revision', name: 'missing-offering-revision', category: 'Data', suburb: 'Perth', stateTerritory: 'WA', publicUrl: '/missing-offering-revision', trustTier: 'listed' },
          offerings: [], sourceRevision: 1, sourceDigest: 'projection:old', observedAt: 1, disposition: 'current',
        },
      })
    })

    await expect(backend.run((ctx) => rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db, sourceDb: ctx.db, businessId, support: {}, now: 10,
    }))).resolves.toEqual({ kind: 'error', code: 'offering_revision_missing' })
    const snapshot = await backend.run((ctx) => ctx.db.query('businessSupplyProjectionSnapshots').unique())
    expect(snapshot).toMatchObject({ status: 'projection_pending', disposition: 'stale', lastErrorCode: 'offering_revision_missing' })
  })
})
