import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  admitRegisteredTransport,
  createPublicToolRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedTool,
  offeringRegistrationFromRow,
  qualifySuppliedCandidate,
  parseX402FetchTransportConfiguration,
  x402PaymentProfileForEnvironment,
  type SuppliedCandidateQualification,
} from '@/modules/capability-supply/public'

import type { Id } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { getExactRegisteredCapabilityContract } from '../../capabilityContract/documents/reads'
import { toCapabilityOfferingRow } from '../../../capabilitySupplyRowMappers'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import { canonicalPublicationPricing } from './reads'

export const readExactSellerCanaryOperationSnapshotArgs = { publicationRef: v.string(), revision: v.number() }
export const readExactSellerCanaryOperationSnapshotResult = v.union(v.object({
  toolJson: v.string(),
  toolRef: v.string(),
  offeringRef: v.string(),
  offeringRevision: v.number(),
  offeringSourceHash: v.string(),
  accessPathRef: v.string(),
  accessPathSourceHash: v.string(),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  sellerPayTo: v.string(),
  sellerClaimDigest: v.string(),
  readinessDigest: v.string(),
  readinessObservedAt: v.number(),
  readinessValidUntil: v.number(),
}), v.null())

export type SellerCanaryOperationSnapshot = {
  toolJson: string
  toolRef: string
  offeringRef: string
  offeringRevision: number
  offeringSourceHash: string
  accessPathRef: string
  accessPathSourceHash: string
  publicationRef: string
  publicationRevision: number
  sellerPayTo: string
  sellerClaimDigest: string
  readinessDigest: string
  readinessObservedAt: number
  readinessValidUntil: number
}

/**
 * Internal-only exact staging read for one seller-owned x402 canary.
 * It never participates in discovery and only relaxes the business-publication
 * routeability gate; every contract, catalog, binding, claim, pricing, and
 * fresh-readiness anchor remains exact.
 */
export async function readExactSellerCanaryOperationSnapshotHandler(
  ctx: Pick<QueryCtx, 'db'>,
  input: { publicationRef: string; revision: number },
): Promise<SellerCanaryOperationSnapshot | null> {
  const now = Date.now()
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', input.publicationRef).eq('revision', input.revision)
    ))
    .unique()
  if (
    publication === null
    || publication.disposition !== 'current'
    || (publication.runtimeEnvironment !== 'sandbox' && publication.runtimeEnvironment !== 'production')
    || publication.sourceKind !== 'x402'
    || publication.readinessObservedAt === undefined
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil <= now
  ) return null
  const business = await ctx.db.get(publication.businessId as Id<'businesses'>)
  if (business === null || business.suppressedAt !== undefined) return null
  const unpublished = business.publicStatus !== 'published'
  const [offeringDoc, bindingDoc] = await Promise.all([
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
      .unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
      .unique(),
  ])
  if (offeringDoc === null || bindingDoc === null) return null
  const origin = offeringDoc.origin
  if (
    origin?.kind !== 'catalog_offering'
    || origin.declaredAccessPathRef === undefined
    || origin.accessPathSourceHash === undefined
  ) return null
  const contractResult = await getExactRegisteredCapabilityContract(ctx.db, {
    capabilityId: publication.capabilityId,
    version: publication.version,
    contractDigest: publication.contractDigest,
  })
  if (contractResult.kind !== 'found') return null
  const offering = offeringRegistrationFromRow(toCapabilityOfferingRow(offeringDoc))
  let binding
  try {
    const config = JSON.parse(bindingDoc.configJson) as unknown
    binding = defineCapabilityTransportBindingRegistration({
      bindingId: bindingDoc.bindingId,
      offeringId: bindingDoc.offeringId,
      networkId: bindingDoc.networkId,
      contractRef: {
        capabilityId: bindingDoc.capabilityId,
        version: bindingDoc.version,
        contractDigest: bindingDoc.contractDigest,
      },
      endpointUrl: bindingDoc.endpointUrl,
      authority: bindingDoc.authority,
      continuation: bindingDoc.continuation,
      cancellation: bindingDoc.cancellation,
      adapter: { adapterId: bindingDoc.adapterId, config },
      registrationEvidenceRefs: bindingDoc.registrationEvidenceRefs,
    })
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'readExactSellerCanaryOperationSnapshotHandler', reason: 'invalid_response' })
  }
  if (binding.adapter.adapterId !== 'x402-fetch:v2' || binding.authority.kind !== 'provider_connection') return null
  const connectionRef = binding.authority.connectionRef
  const x402 = parseX402FetchTransportConfiguration(binding.adapter.config)
  const profile = x402PaymentProfileForEnvironment(publication.runtimeEnvironment)
  if (
    x402 === undefined
    || profile === undefined
    || x402.network !== profile.network
    || x402.asset.toLowerCase() !== profile.asset.toLowerCase()
    || x402.scheme !== profile.scheme
  ) return null
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef))
    .unique()
  const claimEvidence = connection?.evidenceRefs.filter((ref) => ref.startsWith('x402-payee-claim:')) ?? []
  if (
    connection === null
    || connection === undefined
    || connection.lifecycle !== 'active'
    || String(connection.businessId) !== publication.businessId
    || claimEvidence.length !== 1
  ) return null
  const sellerClaimDigest = claimEvidence[0]!.slice('x402-payee-claim:'.length)
  const admittedTransport = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admittedTransport.kind !== 'admitted') return null
  const pricing = canonicalPublicationPricing(publication)
  if (pricing === undefined) return null
  const candidate = {
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    networkId: publication.networkId,
    businessId: publication.businessId,
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    contractRef: contractResult.contract.ref,
  }
  const blocked = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), { candidate, now })
  const stagingOnlyReasons = new Set([
    'business_not_currently_published',
    'seller_canary_admission_required',
  ])
  const publishedCanaryReasons = new Set([
    'seller_canary_admission_required',
  ])
  if (unpublished) {
    if (
      !blocked.reasons.includes('business_not_currently_published')
      || !blocked.reasons.includes('seller_canary_admission_required')
      || blocked.reasons.some((reason) => !stagingOnlyReasons.has(reason))
    ) return null
  } else if (
    !blocked.reasons.includes('seller_canary_admission_required')
    || blocked.reasons.some((reason) => !publishedCanaryReasons.has(reason))
  ) return null
  const futurePublishedBusiness = {
    businessId: String(business._id),
    trustTier: business.trustTier,
    publicStatus: 'published' as const,
    suppressed: false as const,
    currentlyPublished: true as const,
  }
  const futureSources = [
    ...blocked.sources,
    {
      kind: 'business' as const,
      ref: `business:${String(business._id)}`,
      digest: canonicalDigest(futurePublishedBusiness),
      evidenceRefs: [] as string[],
    },
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref))
  const qualification: SuppliedCandidateQualification = unpublished
    ? {
        ...blocked,
        status: 'eligible',
        reasons: [],
        qualificationDigest: canonicalDigest({
          purpose: 'seller_onboarding_canary_staging:v1',
          candidate,
          observedAt: blocked.observedAt,
          validUntil: blocked.validUntil ?? null,
          sources: futureSources,
        }),
        sources: futureSources,
      }
    : {
        ...blocked,
        status: 'eligible',
        reasons: [],
      }
  try {
    const operation = materializePublishedTool({
      publication: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        runtimeEnvironment: publication.runtimeEnvironment,
        sourceDigest: publication.sourceDigest,
        pricingConfig: pricing.config,
        priceDigest: pricing.priceDigest,
        readinessObservedAt: publication.readinessObservedAt,
        readinessValidUntil: publication.readinessValidUntil,
        ...(publication.readinessLastHealthyAt === undefined
          ? {}
          : { readinessLastHealthyAt: publication.readinessLastHealthyAt }),
        readinessEvidenceRefs: publication.readinessEvidenceRefs,
      },
      contract: contractResult.contract,
      offering,
      binding,
      ...(publication.connectionAuthority === undefined ? {} : { connectionAuthority: publication.connectionAuthority }),
      admittedTransport: admittedTransport.transport,
      qualification,
    })
    const toolRef = createPublicToolRef({
      operationId: operation.operationId,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: contractResult.contract.ref,
    })
    const readinessSource = qualification.sources.find((source) => source.kind === 'readiness')
    if (
      readinessSource === undefined
      || operation.identity.payment.kind !== 'x402'
      || operation.identity.payment.payTo.toLowerCase() !== x402.payTo.toLowerCase()
    ) return null
    return {
      toolJson: JSON.stringify(operation),
      toolRef,
      offeringRef: origin.offeringRef,
      offeringRevision: origin.offeringRevision,
      offeringSourceHash: origin.offeringSourceHash,
      accessPathRef: origin.declaredAccessPathRef,
      accessPathSourceHash: origin.accessPathSourceHash,
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      sellerPayTo: x402.payTo,
      sellerClaimDigest,
      readinessDigest: readinessSource.digest,
      readinessObservedAt: publication.readinessObservedAt,
      readinessValidUntil: publication.readinessValidUntil,
    }
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'readExactSellerCanaryOperationSnapshotHandler', reason: 'invalid_response' })
  }
}

