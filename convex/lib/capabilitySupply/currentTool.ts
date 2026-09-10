// Shared "current published tool" read helpers for capability supply.
//
// Extracted from ../../capabilitySupplyCurrentTool.ts so that
// ../../catalogOfferingMutations.ts can depend on this logic without
// importing capabilitySupplyCurrentTool.ts directly - that import used to
// close a cycle:
//   capabilitySupplyCurrentTool -> capabilitySupplyProbes ->
//   capabilitySupplyNativeAdmission -> catalogOfferingMutations ->
//   capabilitySupplyCurrentTool
//
// This file holds plain logic only - no Convex function registrations.
import { v } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  admitRegisteredTransport,
  capabilityToolId,
  createPublicToolRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedTool,
  offeringRegistrationFromRow,
  qualifySuppliedCandidate,
  parseX402FetchTransportConfiguration,
  x402PaymentProfileForEnvironment,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import type { SuppliedCandidateQualification } from '@/modules/capability-supply/public'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import type { Doc, Id } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { getExactRegisteredCapabilityContract } from '../../capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from '../../capabilitySupplyGraphPorts'
import { toCapabilityOfferingRow } from '../../capabilitySupplyRowMappers'

export const publishedOperationSnapshotReturns = v.union(
  v.object({ toolJson: v.string() }),
  v.null(),
)

export const sellerCanaryOperationSnapshotReturns = v.union(v.object({
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

export async function readCurrentPublishedToolSnapshotHandler(
  ctx: QueryCtx,
  input: { toolRef: string },
) {
  try {
    const operation = await readCurrentPublishedTool(ctx, input.toolRef, Date.now())
    return operation === undefined ? null : { toolJson: JSON.stringify(operation) }
  } catch {
    return null
  }
}

export async function readCurrentPublishedTool(
  ctx: Pick<QueryCtx, 'db'>,
  toolRef: string,
  now = Date.now(),
): Promise<PublishedTool | undefined> {
  try {
    return await readCurrentPublishedToolUnchecked(ctx, toolRef, now)
  } catch {
    return undefined
  }
}

/**
 * Internal-only exact staging read for one seller-owned Base Sepolia canary.
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
    || publication.runtimeEnvironment !== 'sandbox'
    || publication.sourceKind !== 'x402'
    || publication.readinessObservedAt === undefined
    || publication.readinessValidUntil === undefined
    || publication.readinessValidUntil <= now
  ) return null
  const business = await ctx.db.get(publication.businessId as Id<'businesses'>)
  if (
    business === null
    || business.publicStatus === 'published'
    || business.suppressedAt !== undefined
  ) return null
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
  } catch {
    return null
  }
  if (binding.adapter.adapterId !== 'x402-fetch:v2' || binding.authority.kind !== 'provider_connection') return null
  const connectionRef = binding.authority.connectionRef
  const x402 = parseX402FetchTransportConfiguration(binding.adapter.config)
  const profile = x402PaymentProfileForEnvironment('sandbox')
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
  if (
    !blocked.reasons.includes('business_not_currently_published')
    || !blocked.reasons.includes('seller_canary_admission_required')
    || blocked.reasons.some((reason) => !stagingOnlyReasons.has(reason))
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
  const qualification: SuppliedCandidateQualification = {
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
  } catch {
    return null
  }
}

async function readCurrentPublishedToolUnchecked(
  ctx: Pick<QueryCtx, 'db'>,
  toolRef: string,
  now: number,
): Promise<PublishedTool | undefined> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_toolRef_and_disposition', (query) => (
      query.eq('toolRef', toolRef).eq('disposition', 'current')
    ))
    .unique()
  if (publication === null) return undefined
  const [offeringDoc, bindingDoc] = await Promise.all([
    ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId))
      .unique(),
    ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
      .unique(),
  ])
  if (offeringDoc === null || bindingDoc === null) return undefined
  const contractResult = await getExactRegisteredCapabilityContract(ctx.db, {
    capabilityId: publication.capabilityId,
    version: publication.version,
    contractDigest: publication.contractDigest,
  })
  if (contractResult.kind !== 'found') return undefined
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
  } catch {
    return undefined
  }
  const admittedTransport = admitRegisteredTransport({
    adapterId: binding.adapter.adapterId,
    endpointUrl: binding.endpointUrl,
    authority: binding.authority,
    continuation: binding.continuation,
    cancellation: binding.cancellation,
    config: binding.adapter.config,
  })
  if (admittedTransport.kind !== 'admitted') return undefined
  const pricing = canonicalPublicationPricing(publication)
  if (pricing === undefined) return undefined
  const candidate = {
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    networkId: publication.networkId,
    businessId: publication.businessId,
    offeringId: publication.offeringId,
    bindingId: publication.bindingId,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
  }
  const currentQualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
    candidate,
    now,
  })
  if (currentQualification.status !== 'eligible') return undefined
  // Fresh eligibility is checked at the caller's real `now`, but the strict
  // identity is anchored to persisted readiness observation time.
  // That makes two unchanged reads before expiry byte-identical while still
  // refusing expired readiness or changed authority before materialization.
  const identityObservedAt = publication.readinessObservedAt ?? publication.updatedAt
  const qualification = identityObservedAt === now
    ? currentQualification
    : await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
        candidate,
        now: identityObservedAt,
      })
  if (qualification.status !== 'eligible') return undefined
  try {
    const materialized = materializePublishedTool({
      publication: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        runtimeEnvironment: publication.runtimeEnvironment,
        sourceDigest: publication.sourceDigest,
        pricingConfig: pricing.config,
        priceDigest: pricing.priceDigest,
        ...(publication.readinessObservedAt === undefined ? {} : { readinessObservedAt: publication.readinessObservedAt }),
        ...(publication.readinessValidUntil === undefined ? {} : { readinessValidUntil: publication.readinessValidUntil }),
        readinessEvidenceRefs: publication.readinessEvidenceRefs,
      },
      contract: contractResult.contract,
      offering,
      binding,
      ...(publication.connectionAuthority === undefined
        ? {}
        : { connectionAuthority: publication.connectionAuthority }),
      admittedTransport: admittedTransport.transport,
      qualification,
    })
    const expectedToolRef = createPublicToolRef({
      operationId: capabilityToolId(contractResult.contract.ref.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: contractResult.contract.ref,
    })
    if (expectedToolRef === toolRef) return materialized
  } catch {
    return undefined
  }
  return undefined
}

export function canonicalPublicationPricing(
  publication: Doc<'capabilityPublications'>,
): Readonly<{ config: PricingConfig; priceDigest: string }> | undefined {
  if (publication.pricingConfigJson === undefined || publication.priceDigest === undefined) return undefined
  try {
    const parsed = normalizePricingConfig(JSON.parse(publication.pricingConfigJson))
    if (parsed.kind !== 'valid' || pricingConfigDigest(parsed.config) !== publication.priceDigest) return undefined
    return { config: parsed.config, priceDigest: publication.priceDigest }
  } catch {
    return undefined
  }
}
