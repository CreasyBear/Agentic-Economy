import { describe, expect, it, vi } from 'vitest'
import { api, internal } from '../../convex/_generated/api'
import { makeFunctionReference } from 'convex/server'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { prepareSupplyPublicationV2 } from '@/modules/capability-supply/supply-publication-v2'
import { previewSupplySource } from '@/modules/capability-supply/source-preview'
import {
  assessSupplySource,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  encodeX402PaymentRequiredHeader,
  inspectX402SellerEndpoint,
  type X402PaymentRequired,
} from '@/modules/capability-supply/server'
import { createX402ProviderConnection } from '@/modules/capability-supply/provider-connection'
import { toRow } from '../../convex/lib/capabilitySupply/providerConnections/codecs'
import { declareDiscoveryExtension, bazaarResourceServerExtension, type DiscoveryExtension } from '@x402/extensions/bazaar'
import { z } from 'zod'
import { convexTestWithMarketComponents, ownerAdmin, testConsequenceProof } from '../helpers/convex-fixtures'
import { withSourceWrite, withoutSourceWrite } from '../helpers/source-write-admission'
import { createPublishedBusinessOwner } from './capability-supply-owner-funnel-harness'
const verifySourceAuthority = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  AdminCommandReceipt<'verify_capability_source_authority'>
>('capabilitySupply:verifyCapabilitySourceAuthority')


function paymentChallenge(): X402PaymentRequired {
  const declared = declareDiscoveryExtension({
    bodyType: 'json',
    input: { value: 'validation' },
    inputSchema: z.toJSONSchema(z.object({ value: z.string().describe('A quasar reference.') })),
    output: {
      example: { value: 'validation' },
      schema: z.toJSONSchema(z.object({ value: z.string().describe('The matching reference.') })),
    },
  })
  const enriched = bazaarResourceServerExtension.enrichDeclaration?.(declared.bazaar, {
    method: 'POST',
    routePattern: '/paid',
    adapter: { getPath: () => '/paid' },
  } as never) as DiscoveryExtension | undefined
  if (enriched === undefined) throw new Error('expected Bazaar enrichment')
  return {
    x402Version: 2,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: '1000',
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }],
    extensions: { bazaar: enriched },
  } as X402PaymentRequired
}

describe('first native Tool admission', () => {
  it.each(['accepted', 'rejected'] as const)('keeps publication and discovery consistent when the Provider suggestion is %s', async (reviewDecision) => {
    const backend = convexTestWithMarketComponents()
    const { businessId, owner } = await createPublishedBusinessOwner(backend, 'native-admission')
    const { owner: otherOwner } = await createPublishedBusinessOwner(backend, 'native-foreign')
    await backend.run(ctx => ctx.db.patch(businessId, { publicStatus: 'unpublished' }))
    const source = { kind: 'x402' as const, resourceUrl: 'https://provider.example/paid', method: 'POST' as const, environment: 'sandbox' as const }
    const observation = await inspectX402SellerEndpoint({
      endpointUrl: source.resourceUrl,
      method: source.method,
      deriveAeEnvironment: true,
    }, {
      now: () => 1_000,
      validatePublicTarget: async () => true,
      send: async () => new Response(null, {
        status: 402,
        headers: { 'payment-required': encodeX402PaymentRequiredHeader(paymentChallenge()) },
      }),
    })
    if (observation.kind !== 'observed') throw new Error(observation.reason)
    const preview = await previewSupplySource(source, { inspectX402: async () => observation })
    if (preview.kind !== 'ready' || preview.candidates[0] === undefined) throw new Error('source_preview_not_ready')
    const sourceDigest = preview.sourceDigest
    const candidateRef = preview.candidates[0].candidateRef
    const createdConnection = createX402ProviderConnection({
      commandId: 'command:native-x402',
      connectionRef: 'connection:x402',
      businessId: String(businessId),
      providerRef: 'provider:x402',
      providerAccountRef: 'account:x402',
      resourceUrl: 'https://example.com/paid',
      method: 'POST',
      payee: '0x0000000000000000000000000000000000000002',
      evidenceRefs: ['evidence:x402'],
      owningAccountRef: `acc_${'1'.repeat(32)}`,
      installedByPrincipalRef: `prn_${'2'.repeat(32)}`,
      authorityGrantRef: `grt_${'3'.repeat(32)}`,
      authorityGrantGeneration: 1,
    }, 1_700_000_000_000)
    if (createdConnection.kind !== 'applied') throw new Error(createdConnection.code)
    await backend.run((ctx) => ctx.db.insert('capabilityProviderConnections', toRow(
      createdConnection.connection,
      createdConnection.connection.lastCommandId ?? createdConnection.commandDigest,
      createdConnection.commandDigest,
    )))
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ model: 'jev-test', answers: {
      summary: { type: 'choice', choice: 'excerpt_0', confidence: 0.9 },
      input: { type: 'choice', choice: 'excerpt_1', confidence: 0.9 },
      output: { type: 'choice', choice: 'excerpt_2', confidence: 0.9 },
    } }))
    const suggestion = await assessSupplySource(preview, candidateRef, { typesafeApiKey: 'ts-test', fetchImpl })
    if (suggestion.kind !== 'suggested') throw new Error(`source_suggestion_${suggestion.kind}`)
    expect(suggestion.description).toBe('Paid POST Tool discovered from the live x402 payment challenge.\nInput: value — A quasar reference.\nOutput: value — The matching reference.')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const acceptedDescription = reviewDecision === 'accepted' ? suggestion.description : 'Returns the supplied value.'
    const publicSummary = reviewDecision === 'accepted'
      ? 'Paid POST Tool discovered from the live x402 payment challenge. Input: value — A quasar reference. Output: value — The matching reference.'
      : 'Returns the supplied value.'
    const preparation = await prepareSupplyPublicationV2({
      businessRef: businessId,
      source,
      candidateRef, expectedSourceDigest: sourceDigest,
      presentation: { name: 'Echo', description: acceptedDescription, category: 'Developer tools' },
      consequences: {
        effects: [{ class: 'data_release', authority: 'explicit', reversibility: 'not_applicable' }],
        dataUse: [{ inputPointer: '/value', classification: 'public', phase: 'execution', purposes: ['Echo input'] }],
        evidence: [{ outputPointer: '', purpose: 'completion' }],
      },
      pricing: { kind: 'source_x402' }, validationInput: { value: 'validation' }, environment: 'sandbox', idempotencyKey: 'native-publication',
      attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
      connectionRef: 'connection:x402',
    }, {
      inspectX402: async () => observation,
      providerAuthority: { kind: 'provider_connection', connectionRef: 'connection:x402', providerRef: 'provider:x402' },
    })
    if (preparation.kind !== 'prepared') throw new Error(preparation.reason)
    if (preparation.validationInputJson === undefined) throw new Error('native_validation_input_missing')
    const draft = await owner.mutation(api.capabilitySupplyOwnerFunnel.saveOwnerSupplyIntegrationDraft, await withSourceWrite('catalog_publish', {
      businessId, title: 'Echo', description: acceptedDescription, category: 'Developer tools', sourceKind: 'x402' as const,
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
    await expect(owner.mutation(api.capabilitySupply.publishPreparedCapability,
      await withSourceWrite('catalog_publish', withoutSourceWrite(command))))
      .resolves.toMatchObject({ kind: 'replayed', publicationRef: publication.publicationRef })
    expect(await backend.run(ctx => ctx.db.query('capabilityPublications').collect())).toHaveLength(1)
    expect(await backend.query(api.capabilitySupplyTools.search, { query: 'quasar' }))
      .toMatchObject({ kind: 'no_candidates' })
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
    expect(await recordProbe(true, async () => {
      await backend.run(async ctx => {
        const offering = await ctx.db.query('businessOfferings').withIndex('by_offeringRef', q =>
          q.eq('offeringRef', origin.offeringRef)).unique()
        if (offering === null) throw new Error('offering_missing')
        await ctx.db.patch(offering._id, { currentRevision: 2 })
      })
    })).toEqual({ kind: 'refused', reason: 'target_changed' })
    await backend.run(async ctx => {
      const offering = await ctx.db.query('businessOfferings').withIndex('by_offeringRef', q =>
        q.eq('offeringRef', origin.offeringRef)).unique()
      if (offering === null) throw new Error('offering_missing')
      await ctx.db.patch(offering._id, { currentRevision: 1 })
    })
    expect(await status()).toEqual({ business: 'unpublished', offering: 'draft', path: 'draft' })
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'active' } })
    expect(await status()).toEqual({ business: 'published', offering: 'published', path: 'published' })
    const input = {
      publicationRef: publication.publicationRef, expectedRevision: publication.publicationRevision,
      expectedSourceDigest: publication.sourceDigest,
    }
    const evidenceRefs = ['test:verified-provider-control']
    const action = 'verify_capability_source_authority'
    const reasonCode = 'evidence_verified'
    const digest = canonicalDigest({ scope: 'admin_operator', action, input, reasonCode, evidenceRefs })
    const sourceReviewCommand = (subject: string): AdminCommandArgs<'verify_capability_source_authority'> => ({
      action, input, reasonCode, evidenceRefs,
      operationKey: 'native:review', correlationId: 'native:review',
      approval: { kind: 'execute' }, proof: testConsequenceProof({ subject }, digest),
    })
    await expect(owner.mutation(verifySourceAuthority,
      await withSourceWrite('admin_operator', sourceReviewCommand('user_native_owner'))))
      .resolves.toMatchObject({ kind: 'refused' })
    const adminSubject = 'user_native_admin'
    const admin = await ownerAdmin(backend, adminSubject)
    await expect(admin.mutation(verifySourceAuthority,
      await withSourceWrite('admin_operator', sourceReviewCommand(adminSubject))))
      .resolves.toMatchObject({ kind: 'refused', code: 'source_authority_not_reviewable' })
    expect(await recordProbe(false)).toMatchObject({ kind: 'observed', lifecycle: { state: 'inactive' } })
    expect(await status()).toEqual({ business: 'published', offering: 'published', path: 'published' })
    expect(await recordProbe(true, async () => {
      await backend.run(ctx => ctx.db.patch(businessId, { suppressedAt: Date.now() }))
    })).toEqual({ kind: 'refused', reason: 'target_changed' })
    expect(await status()).toEqual({ business: 'published', offering: 'published', path: 'published' })
    await backend.run(ctx => ctx.db.patch(businessId, { suppressedAt: undefined }))
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'active' } })
    expect(await status()).toEqual({ business: 'published', offering: 'published', path: 'published' })
    expect(await recordProbe(true)).toMatchObject({ kind: 'observed', lifecycle: { state: 'active' } })
    const detail = await backend.query(api.capabilitySupplyTools.detail, { toolRef: publication.toolRef })
    expect(detail).toMatchObject({ kind: 'found', tool: { summary: publicSummary,
      transport: { method: 'POST', pathTemplate: '/paid' },
      parameters: [{ name: 'value', required: true, type: 'string' }],
    } })
    const discovery = await backend.query(api.capabilitySupplyTools.search, { query: 'quasar' })
    if (reviewDecision === 'accepted') {
      expect(discovery).toMatchObject({ kind: 'ok', items: [{ toolRef: publication.toolRef, summary: publicSummary }] })
    } else {
      expect(discovery).toMatchObject({ kind: 'no_candidates' })
    }
    await expect(owner.mutation(api.capabilitySupplyOwnerFunnel.withdrawOwnerCapability, await withSourceWrite('catalog_publish', {
      businessId, offeringRef: origin.offeringRef, offeringRevision: 1, offeringSourceHash: origin.offeringSourceHash,
      publicationRef: publication.publicationRef, publicationRevision: publication.publicationRevision,
      reasonCode: 'owner_withdrawal', evidenceRefs: ['test:withdrawal'], operationKey: 'native:withdraw', correlationId: 'native:withdraw',
    }))).resolves.toMatchObject({ kind: 'withdrawn' })
    expect(await backend.query(api.capabilitySupplyTools.search, { query: 'quasar' })).toMatchObject({ kind: 'no_candidates' })
  })
})
