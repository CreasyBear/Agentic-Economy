import { describe, expect, it } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { prepareSupplyPublicationV2 } from '@/modules/capability-supply/supply-publication-v2'
import { convexTestWithMarketComponents, ownerAdmin } from '../helpers/convex-fixtures'
import { withSourceWrite, withoutSourceWrite } from '../helpers/source-write-admission'
import { createPublishedBusinessOwner } from './capability-supply-owner-funnel-harness'

describe('first native Tool admission', () => {
  it('keeps a new Provider private until a current live validation and source authority review both pass', async () => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'native-admission')
    const { owner: otherOwner } = await createPublishedBusinessOwner(backend, 'native-foreign')
    await backend.run(ctx => ctx.db.patch(businessId, { publicStatus: 'unpublished' }))
    const document = {
      openapi: '3.0.3', info: { title: 'Echo', version: '1' }, servers: [{ url: 'https://provider.example' }],
      paths: { '/echo': { post: {
        operationId: 'echo', summary: 'Echo',
        requestBody: { required: true, content: { 'application/json': {
          schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
          example: { value: 'validation' },
        } } },
        responses: { '200': { description: 'Echo', content: { 'application/json': {
          schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
        } } } },
      } } },
    }
    const sourceDigest = canonicalDigest(document)
    const sourceSelector = { serverUrl: 'https://provider.example/', path: '/echo', method: 'post' }
    const candidateRef = canonicalDigest({ sourceDigest, selector: sourceSelector })
    const preparation = await prepareSupplyPublicationV2({
      businessRef: businessId,
      source: { kind: 'openapi', definitionUrl: 'https://provider.example/openapi.json', environment: 'sandbox' },
      candidateRef, expectedSourceDigest: sourceDigest,
      presentation: { name: 'Echo', description: 'Returns the supplied value.', category: 'Developer tools' },
      consequences: {
        effects: [{ class: 'data_release', authority: 'explicit', reversibility: 'not_applicable' }],
        dataUse: [{ inputPointer: '/value', classification: 'public', phase: 'execution', purposes: ['Echo input'] }],
        evidence: [{ outputPointer: '', purpose: 'completion' }],
      },
      pricing: { kind: 'free' }, environment: 'sandbox', idempotencyKey: 'native-publication',
      attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
    }, { loadOpenApi: async () => document })
    if (preparation.kind !== 'prepared') throw new Error(preparation.reason)
    if (preparation.validationInputJson === undefined) throw new Error('native_validation_input_missing')
    const draft = await owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft, await withSourceWrite('catalog_publish', {
      businessId, title: 'Echo', description: 'Returns the supplied value.', category: 'Developer tools', sourceKind: 'openapi' as const,
      sourceDescriptorJson: preparation.sourceDescriptorJson, sourceDigest, sourceRevision: preparation.sourceRevision,
      candidateRef, sourceSelectorJson: preparation.sourceSelectorJson, validationInputJson: preparation.validationInputJson,
      operationKey: 'native:draft', correlationId: 'native:draft',
    }))
    if (draft.kind === 'refused') throw new Error(draft.reason)
    const origin = await backend.run(async ctx => {
      const revision = await ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', q =>
        q.eq('offeringRef', draft.offeringRef).eq('revision', 1)).unique()
      const path = await ctx.db.query('offeringAccessPaths').withIndex('by_accessPathRef', q =>
        q.eq('accessPathRef', draft.accessPathRef)).unique()
      if (revision === null || path === null) throw new Error('draft_missing')
      return { kind: 'catalog_offering' as const, offeringRef: draft.offeringRef, offeringRevision: 1,
        offeringSourceHash: revision.sourceHash, declaredAccessPathRef: path.accessPathRef, accessPathSourceHash: path.sourceHash }
    })
    const reservation = await withSourceWrite('catalog_publish', {
      businessId, offeringRef: origin.offeringRef, offeringRevision: 1, offeringSourceHash: origin.offeringSourceHash,
      materialDigest: canonicalDigest(preparation.prepared.documentJson), operationKey: 'native:reserve', correlationId: 'native:reserve',
      reasonCode: 'supply.publish', evidenceRefs: [sourceDigest],
    })
    await expect(otherOwner.mutation(api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication, reservation))
      .resolves.toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
    await expect(owner.mutation(api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
      await withSourceWrite('catalog_publish', withoutSourceWrite(reservation))))
      .resolves.toMatchObject({ kind: 'reserved' })
    const command = await withSourceWrite('catalog_publish', {
      businessId, offeringRef: origin.offeringRef, revision: 1, sourceHash: origin.offeringSourceHash,
      runtimeEnvironment: 'sandbox' as const,
      prepared: JSON.parse(JSON.stringify({ ...preparation.prepared.prepared,
        sourceAuthorityState: preparation.sourceAuthorityState,
        offering: { ...preparation.prepared.prepared.offering, origin },
      })),
      proof: { reverificationId: 'test:native-publication', firstFactorAgeMinutes: 0, secondFactorAgeMinutes: -1 },
      operationKey: 'native:publish', correlationId: 'native:publish', reasonCode: 'supply.publish', evidenceRefs: [sourceDigest],
    })
    await expect(otherOwner.mutation(api.capabilitySupply.publishPreparedCapability, command))
      .resolves.toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
    const publication = await owner.mutation(api.capabilitySupply.publishPreparedCapability,
      await withSourceWrite('catalog_publish', withoutSourceWrite(command)))
    if (publication.kind === 'refused') throw new Error(publication.reason)
    const status = () => backend.run(async ctx => ({
      business: (await ctx.db.get(businessId))?.publicStatus,
      offering: (await ctx.db.query('businessOfferings').withIndex('by_offeringRef', q => q.eq('offeringRef', origin.offeringRef)).unique())?.status,
      path: (await ctx.db.query('offeringAccessPaths').withIndex('by_accessPathRef', q => q.eq('accessPathRef', draft.accessPathRef)).unique())?.status,
    }))
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    const recordProbe = async (healthy: boolean, afterRead?: () => Promise<void>) => {
      const target = await backend.query(internal.capabilitySupply.readCapabilityProbeTarget, {
        publicationRef: publication.publicationRef, expectedRevision: publication.publicationRevision, now: Date.now(),
      })
      if (target.kind !== 'available') throw new Error(target.reason)
      expect(JSON.parse(target.target.probeInputJson!)).toEqual({ value: 'validation' })
      await afterRead?.()
      return await backend.mutation(internal.capabilitySupply.recordCapabilityProbeResult, {
        publicationRef: publication.publicationRef, expectedRevision: publication.publicationRevision,
        targetDigest: target.target.targetDigest, resourceAuthority: target.target.resourceAuthority,
        requestDigest: canonicalDigest({ value: 'validation' }), responseDigest: canonicalDigest({ value: 'validation' }),
        responseStatus: healthy ? 200 : 500, responseContentType: 'application/json',
        outcome: healthy ? 'healthy' : 'http_5xx', credentialState: 'ready', healthState: healthy ? 'healthy' : 'unhealthy',
        observedAt: Date.now(), validUntil: Date.now() + 60_000, evidenceRefs: ['test:provider-response'],
      })
    }
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'inactive' } })
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    const review = await withSourceWrite('admin_operator', {
      publicationRef: publication.publicationRef, expectedRevision: publication.publicationRevision,
      expectedSourceDigest: publication.sourceDigest, evidenceRefs: ['test:verified-provider-control'],
      operationKey: 'native:review', correlationId: 'native:review',
    })
    await expect(owner.mutation(api.capabilitySupply.verifyCapabilitySourceAuthority, review))
      .resolves.toMatchObject({ kind: 'refused', reason: 'authorization_denied' })
    const admin = await ownerAdmin(backend, 'user_native_admin')
    await expect(admin.mutation(api.capabilitySupply.verifyCapabilitySourceAuthority,
      await withSourceWrite('admin_operator', withoutSourceWrite(review)))).resolves.toMatchObject({ kind: 'verified' })
    expect(await recordProbe(false)).toMatchObject({ kind: 'observed', lifecycle: { state: 'inactive' } })
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    expect(await recordProbe(true, async () => {
      await backend.run(ctx => ctx.db.patch(businessId, { suppressedAt: Date.now() }))
    })).toEqual({ kind: 'refused', reason: 'target_changed' })
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    await backend.run(ctx => ctx.db.patch(businessId, { suppressedAt: undefined }))
    expect(await recordProbe(true, async () => {
      await backend.run(async ctx => {
        const offering = await ctx.db.query('businessOfferings').withIndex('by_offeringRef', q =>
          q.eq('offeringRef', origin.offeringRef)).unique()
        if (offering === null) throw new Error('offering_missing')
        await ctx.db.patch(offering._id, { currentRevision: 2 })
      })
    })).toEqual({ kind: 'refused', reason: 'target_changed' })
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    await backend.run(async ctx => {
      const offering = await ctx.db.query('businessOfferings').withIndex('by_offeringRef', q =>
        q.eq('offeringRef', origin.offeringRef)).unique()
      if (offering === null) throw new Error('offering_missing')
      await ctx.db.patch(offering._id, { currentRevision: 1 })
    })
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'active' } })
    expect(await status()).toEqual({ business: 'published', offering: 'published', path: 'published' })
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'active' } })
    expect(await backend.query(api.capabilitySupplyTools.detail, { toolRef: publication.toolRef })).toMatchObject({ kind: 'found' })
  })
})
