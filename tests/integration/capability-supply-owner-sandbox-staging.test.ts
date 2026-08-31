import { validatePaymentRequired } from '@x402/core/schemas'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { toRow as providerConnectionRow } from '../../convex/lib/providerConnections/codecs'
import {
  createX402ProviderConnection,
  reauthorizeProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  x402SellerClaimDigest,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { withSourceWrite } from '../helpers/source-write-admission'
import { convexModules as modules } from '../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
  x402Source,
} from './capability-supply-owner-funnel-harness'

const ENDPOINT = 'https://provider.example/paid-lookup'
const PAYEE = '0xbA667287B8Ef89565F8fD7AcD4d22Ce98E0f39cd'
const CONNECTION_REF = 'connection:x402:owner-sandbox-staging'
const PROVIDER_REF = 'provider:x402:provider.example'
const ACCESS_PATH_REF = 'access-path:owner-sandbox-staging'
const ACCESS_PATH_SOURCE_HASH = 'access-path-source:owner-sandbox-staging:v1'

function sandboxX402Source(
  offeringRef: string,
  offeringSourceHash: string,
) {
  const base = x402Source()
  if (!isRecord(base.resource)) throw new Error('sandbox_x402_base_resource_invalid')
  const price = { currency: 'USD', units: '1', exponent: 2 }
  const paymentRequired = validatePaymentRequired({
    x402Version: 2,
    resource: { url: ENDPOINT },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: '10000',
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: PAYEE,
      maxTimeoutSeconds: 60,
      extra: {
        name: 'USD Coin',
        version: '2',
        assetTransferMethod: 'eip3009',
      },
    }],
  })
  return {
    ...base,
    resource: {
      ...base.resource,
      price,
      network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo: PAYEE,
      paymentRequired,
    },
    commercial: {
      ...base.commercial,
      offering: {
        ...base.commercial.offering,
        origin: {
          kind: 'catalog_offering' as const,
          offeringRef,
          offeringRevision: 1,
          offeringSourceHash,
          declaredAccessPathRef: ACCESS_PATH_REF,
          accessPathSourceHash: ACCESS_PATH_SOURCE_HASH,
        },
        presentation: {
          ...base.commercial.offering.presentation,
          price: { kind: 'fixed' as const, amount: price },
        },
      },
      authority: {
        kind: 'provider_connection' as const,
        connectionRef: CONNECTION_REF,
        providerRef: PROVIDER_REF,
      },
    },
  }
}

describe('owner Base Sepolia staging publication', () => {
  it.each(['unpublished', 'published'] as const)(
    'stages exact signed x402 material without making a %s seller routeable',
    async (publicStatus) => {
    const backend = convexTest(schema, modules)
    const identity = await createPublishedBusinessOwner(
      backend,
      'owner-sandbox-staging',
    )
    const { businessId, owner, canonicalPrincipalRef, canonicalAccountRef } = identity
    const offeringRef = 'catalog-offering:owner-sandbox-staging'
    const offeringSourceHash = 'catalog-source:owner-sandbox-staging:v1'
    if (publicStatus === 'unpublished') {
      await backend.run(async (ctx) => {
        await ctx.db.patch(businessId, {
          publicStatus,
          updatedAt: Date.now(),
        })
      })
    }
    await seedCatalogOffering(
      backend,
      businessId,
      offeringRef,
      1,
      1,
      offeringSourceHash,
    )
    await backend.run(async (ctx) => {
      await ctx.db.insert('offeringAccessPaths', {
        accessPathRef: ACCESS_PATH_REF,
        businessId,
        offeringRef,
        offeringRevision: 1,
        offeringSourceHash,
        status: 'published',
        descriptor: {
          kind: 'external_operation',
          name: 'Paid lookup',
          summary: 'Returns one paid lookup result.',
          url: ENDPOINT,
          method: 'POST',
          provenance: 'business_declared',
        },
        sourceHash: ACCESS_PATH_SOURCE_HASH,
        createdAt: 1,
        updatedAt: 1,
      })
    })

    const now = Date.now()
    const sellerClaim = {
      businessId: String(businessId),
      endpointUrl: ENDPOINT,
      method: 'POST' as const,
      observationDigest: canonicalDigest({
        kind: 'official-x402-v2-unpaid-inspection',
        endpoint: ENDPOINT,
        network: BASE_SEPOLIA_NETWORK,
        payTo: PAYEE,
      }),
      payTo: PAYEE,
      expiresAt: now + 5 * 60_000,
    }
    const claimEvidence = `x402-payee-claim:${x402SellerClaimDigest(sellerClaim)}`
    const inspectionEvidence = `x402-endpoint-inspection:${sellerClaim.observationDigest}`
    const createdConnection = createX402ProviderConnection({
      commandId: 'connect-owner-sandbox-staging',
      connectionRef: CONNECTION_REF,
      businessId: String(businessId),
      providerRef: PROVIDER_REF,
      providerAccountRef: `x402:${ENDPOINT}`,
      resourceUrl: ENDPOINT,
      evidenceRefs: [claimEvidence, inspectionEvidence],
      owningAccountRef: canonicalAccountRef,
      installedByPrincipalRef: canonicalPrincipalRef,
      authorityGrantRef: 'grant:owner-sandbox-staging',
      authorityGrantGeneration: 1,
    }, now)
    if (createdConnection.kind !== 'applied') {
      throw new Error(`sandbox_staging_connection_failed:${createdConnection.kind}`)
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert(
        'capabilityProviderConnections',
        providerConnectionRow(
          createdConnection.connection,
          createdConnection.connection.lastCommandId ?? '',
          createdConnection.commandDigest,
        ),
      )
    })

    const source = sandboxX402Source(offeringRef, offeringSourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      offeringSourceHash,
      source,
      'owner-supply:stage:sandbox-x402',
      source.commercial.offering.origin,
    )
    if (prepared.kind === 'refused') {
      throw new Error(`sandbox_staging_prepare_failed:${prepared.reason}`)
    }
    if (publicStatus === 'unpublished') {
      await expect(owner.mutation(
        api.capabilitySupply.publishPreparedCapability,
        prepared.command,
      )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    }
    const {
      runtimeEnvironment: _runtimeEnvironment,
      sourceWrite: _oldSourceWrite,
      sourceWriteRequest: _oldSourceWriteRequest,
      ...unsignedCommand
    } = prepared.command
    await expect(owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      {
        ...unsignedCommand,
        sellerClaim,
        evidenceRefs: [claimEvidence, inspectionEvidence],
      },
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    const wrongObservationClaim = {
      ...sellerClaim,
      observationDigest: canonicalDigest({ observation: 'different' }),
    }
    const wrongClaimEvidence = `x402-payee-claim:${x402SellerClaimDigest(wrongObservationClaim)}`
    const wrongInspectionEvidence = `x402-endpoint-inspection:${wrongObservationClaim.observationDigest}`
    const wrongEvidenceCommand = await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      operationKey: 'owner-supply:stage:sandbox-x402:wrong-evidence',
      sellerClaim: wrongObservationClaim,
      evidenceRefs: [wrongClaimEvidence, wrongInspectionEvidence],
    })
    await expect(owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      wrongEvidenceCommand,
    )).resolves.toEqual({ kind: 'refused', reason: 'connection_authority_stale' })
    const staleRevisionCommand = await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      revision: 2,
      operationKey: 'owner-supply:stage:sandbox-x402:stale-revision',
      sellerClaim,
      evidenceRefs: [claimEvidence, inspectionEvidence],
    })
    await expect(owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      staleRevisionCommand,
    )).resolves.toEqual({ kind: 'refused', reason: 'catalog_offering_origin_changed' })
    const anonymousCommand = await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      operationKey: 'owner-supply:stage:sandbox-x402:anonymous',
      sellerClaim,
      evidenceRefs: [claimEvidence, inspectionEvidence],
    })
    await expect(backend.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      anonymousCommand,
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    const { businessId: wrongBusinessId, owner: wrongOwner } = await createPublishedBusinessOwner(
      backend,
      'owner-sandbox-staging-wrong-owner',
    )
    const wrongOwnerCommand = await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      operationKey: 'owner-supply:stage:sandbox-x402:wrong-owner',
      sellerClaim,
      evidenceRefs: [claimEvidence, inspectionEvidence],
    })
    await expect(wrongOwner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      wrongOwnerCommand,
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    await expect(backend.run(async (ctx) => (
      await ctx.db.query('capabilityPublications').collect()
    ))).resolves.toEqual([])

    const command = await withSourceWrite('catalog_publish', {
      ...unsignedCommand,
      sellerClaim,
      evidenceRefs: [claimEvidence, inspectionEvidence],
    })
    const staged = await owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      command,
    )
    expect(staged).toMatchObject({
      kind: 'published',
      sourceKind: 'x402',
      lifecycle: { state: 'inactive' },
    })
    if (staged.kind === 'refused') throw new Error('sandbox_staging_refused')

    const persisted = await backend.run(async (ctx) => ({
      business: await ctx.db.get(businessId),
      offering: await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', staged.offeringId))
        .unique(),
      binding: await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', staged.bindingId))
        .unique(),
      publication: await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', staged.publicationRef)
            .eq('revision', staged.publicationRevision)
        ))
        .unique(),
    }))
    expect(persisted.business?.publicStatus).toBe(publicStatus)
    expect(persisted.publication).toMatchObject({
      runtimeEnvironment: 'sandbox',
      disposition: 'current',
      registrationEvidenceRefs: [
        claimEvidence,
        inspectionEvidence,
        X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
      ],
    })
    const genericProbeTarget = await backend.query(
      internal.capabilitySupply.readCapabilityProbeTarget,
      {
        publicationRef: staged.publicationRef,
        expectedRevision: staged.publicationRevision,
        now: Date.now(),
      },
    )
    const ownerStagedProbeTarget = await backend.query(
      internal.capabilitySupply.readOwnerStagedCapabilityProbeTarget,
      {
        publicationRef: staged.publicationRef,
        expectedRevision: staged.publicationRevision,
        businessId,
        now: Date.now(),
      },
    )
    if (publicStatus === 'unpublished') {
      expect(genericProbeTarget).toEqual({
        kind: 'unavailable',
        reason: 'target_not_public',
        evidenceRefs: ['probe-target:target_not_public'],
      })
    } else {
      expect(genericProbeTarget).toMatchObject({ kind: 'available' })
    }
    expect(ownerStagedProbeTarget).toMatchObject({
      kind: 'available',
      target: {
        publicationRef: staged.publicationRef,
        revision: staged.publicationRevision,
        probeKind: 'x402',
      },
    })
    await expect(backend.query(
      internal.capabilitySupply.readOwnerStagedCapabilityProbeTarget,
      {
        publicationRef: staged.publicationRef,
        expectedRevision: staged.publicationRevision,
        businessId: wrongBusinessId,
        now: Date.now(),
      },
    )).resolves.toEqual({
      kind: 'unavailable',
      reason: 'target_not_public',
      evidenceRefs: ['probe-target:target_not_public'],
    })
    const ownerPublication = await owner.query(api.capabilitySupply.readCapabilityPublication, {
      publicationRef: staged.publicationRef,
    })
    if (publicStatus === 'unpublished') expect(ownerPublication).toBeNull()
    else expect(ownerPublication).toMatchObject({ lifecycle: { state: 'inactive' } })
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef: staged.operationRef },
    )).resolves.toBeNull()
    const publicSearch = await backend.query(api.capabilitySupplyOperations.search, {
      query: 'paid lookup',
      limit: 20,
    })
    if (publicStatus === 'unpublished') {
      expect(publicSearch.kind).toBe('no_candidates')
    } else {
      expect(publicSearch).toMatchObject({
        kind: 'ok',
        items: [{
          operationRef: staged.operationRef,
          availability: { posture: 'integrated' },
        }],
      })
    }
    const publicDetail = await backend.query(api.capabilitySupplyOperations.detail, {
      operationRef: staged.operationRef,
    })
    if (publicStatus === 'unpublished') expect(publicDetail.kind).toBe('not_found')
    else expect(publicDetail).toMatchObject({
      kind: 'found',
      operation: {
        availability: { posture: 'integrated' },
      },
    })

    const refreshedClaim = {
      ...sellerClaim,
      observationDigest: canonicalDigest({ observation: 'repeat-live-inspection' }),
      expiresAt: sellerClaim.expiresAt + 1_000,
    }
    const refreshedClaimEvidence = `x402-payee-claim:${x402SellerClaimDigest(refreshedClaim)}`
    const refreshedInspectionEvidence = `x402-endpoint-inspection:${refreshedClaim.observationDigest}`
    const refreshedConnection = reauthorizeProviderConnection({
      ...createdConnection.connection,
      evidenceRefs: [],
    }, {
      ...createdConnection.connection,
      commandId: 'connect-owner-sandbox-staging:refresh',
      expectedAuthorityGeneration: createdConnection.connection.authorityGeneration,
      expectedAuthorityDigest: createdConnection.connection.authorityDigest,
      requestedScopes: [],
      grantedScopes: [],
      requestedResources: [ENDPOINT],
      grantedResources: [ENDPOINT],
      evidenceRefs: [refreshedClaimEvidence, refreshedInspectionEvidence],
    }, now + 1)
    if (refreshedConnection.kind !== 'applied') {
      throw new Error(`sandbox_staging_refresh_failed:${refreshedConnection.kind}`)
    }
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('capabilityProviderConnections')
        .withIndex('by_connectionRef', (query) => query.eq('connectionRef', CONNECTION_REF))
        .unique()
      if (row === null) throw new Error('sandbox_staging_connection_missing')
      await ctx.db.replace(row._id, providerConnectionRow(
        refreshedConnection.connection,
        refreshedConnection.connection.lastCommandId ?? '',
        refreshedConnection.commandDigest,
      ))
    })

    const bazaarEvidence = `x402-bazaar-contract:${canonicalDigest({ contract: 'same-functional-target' })}`
    const repeatedSource = {
      ...source,
      commercial: {
        ...source.commercial,
        offering: {
          ...source.commercial.offering,
          registrationEvidenceRefs: [refreshedInspectionEvidence, bazaarEvidence],
        },
        registrationEvidenceRefs: [refreshedInspectionEvidence, bazaarEvidence],
      },
      evidenceRefs: [refreshedInspectionEvidence, bazaarEvidence],
    }
    const repeatedPrepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      offeringSourceHash,
      repeatedSource,
      'owner-supply:stage:sandbox-x402:repeat',
      repeatedSource.commercial.offering.origin,
    )
    if (repeatedPrepared.kind === 'refused') {
      throw new Error(`sandbox_staging_repeat_prepare_failed:${repeatedPrepared.reason}`)
    }
    const {
      runtimeEnvironment: _repeatRuntimeEnvironment,
      sourceWrite: _repeatSourceWrite,
      sourceWriteRequest: _repeatSourceWriteRequest,
      ...repeatUnsignedCommand
    } = repeatedPrepared.command
    const repeated = await owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      await withSourceWrite('catalog_publish', {
        ...repeatUnsignedCommand,
        sellerClaim: refreshedClaim,
        evidenceRefs: [refreshedClaimEvidence, refreshedInspectionEvidence],
      }),
    )
    if (repeated.kind === 'refused') {
      throw new Error(`sandbox_staging_repeat_refused:${repeated.reason}`)
    }
    expect(repeated).toMatchObject({
      kind: 'replayed',
      publicationRef: staged.publicationRef,
      publicationRevision: staged.publicationRevision,
      operationRef: staged.operationRef,
    })
    const rebound = await backend.run(async (ctx) => ({
      offering: await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', staged.offeringId))
        .unique(),
      binding: await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', staged.bindingId))
        .unique(),
      publication: await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => (
          query.eq('publicationRef', staged.publicationRef).eq('revision', staged.publicationRevision)
        ))
        .unique(),
    }))
    expect(rebound.offering?.registrationHash).toBe(persisted.offering?.registrationHash)
    expect(rebound.binding?.registrationHash).toBe(persisted.binding?.registrationHash)
    expect(rebound.binding?.connectionAuthority?.authorityGeneration).toBe(2)
    expect(rebound.publication?.connectionAuthority).toEqual(rebound.binding?.connectionAuthority)
    expect(rebound.publication).toMatchObject({
      sourceDigest: persisted.publication?.sourceDigest,
      credentialState: 'unobserved',
      healthState: 'unobserved',
      readinessEvidenceRefs: [],
    })
    },
  )

  it('rejects a staged payee that does not match the stored signed claim before writing', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'owner-sandbox-payee-mismatch',
    )
    await backend.run(async (ctx) => {
      await ctx.db.patch(businessId, { publicStatus: 'unpublished' })
    })
    const command = await withSourceWrite('catalog_publish', {
      businessId,
      offeringRef: 'missing-offering',
      revision: 1,
      sourceHash: 'missing-source',
      prepared: {
        sourceKind: 'x402' as const,
        sourceSelector: { resourceUrl: ENDPOINT },
        sourceDescriptorJson: '{}',
        sourceRevision: 'source:missing',
        sourceDigest: canonicalDigest({ missing: 'source' }),
        documentJson: '{}',
        offering: {
          offeringId: 'missing-offering',
          networkId: 'ae:public',
          presentation: {
            label: 'Missing',
            summary: 'Missing',
            price: { kind: 'fixed' as const, amount: { currency: 'USD', units: '1', exponent: 2 } },
            materialTerms: [],
            commercialRelationship: {
              kind: 'none' as const,
              summary: 'None',
              influencesEligibility: false,
              influencesInclusion: false,
              influencesOrder: false,
              evidenceRefs: ['none'],
            },
          },
          searchTerms: ['missing'],
          registrationEvidenceRefs: ['missing'],
        },
        binding: {
          bindingId: 'missing-binding',
          endpointUrl: ENDPOINT,
          authority: { kind: 'provider_connection' as const, connectionRef: CONNECTION_REF, providerRef: PROVIDER_REF },
          continuation: { kind: 'single_response' as const, evidenceRefs: ['missing'] },
          cancellation: { kind: 'unsupported' as const, evidenceRefs: ['missing'] },
          adapter: { adapterId: 'x402-fetch:v2', config: null },
          registrationEvidenceRefs: ['missing'],
        },
        evidenceRefs: ['missing'],
        pricingConfigJson: '{}',
        priceDigest: canonicalDigest({ missing: 'price' }),
      },
      sellerClaim: {
        businessId: String(businessId),
        endpointUrl: ENDPOINT,
        method: 'POST' as const,
        observationDigest: canonicalDigest({ observation: 'missing' }),
        payTo: '0x0000000000000000000000000000000000000001',
        expiresAt: Date.now() + 60_000,
      },
      operationKey: 'owner-supply:stage:payee-mismatch',
      correlationId: 'owner-supply:stage:payee-mismatch',
      reasonCode: 'owner_supply_staging',
      evidenceRefs: ['missing'],
    })
    await expect(owner.mutation(
      api.capabilitySupply.stageOwnerX402Capability,
      command,
    )).resolves.toEqual({ kind: 'refused', reason: 'payment_required_invalid' })
    await expect(backend.run(async (ctx) => (
      await ctx.db.query('capabilityPublications').collect()
    ))).resolves.toEqual([])
  })
})
