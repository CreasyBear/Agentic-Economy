import { v } from 'convex/values'

import {
  admitRegisteredTransport,
  capabilityOperationId,
  createPublicOperationRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedOperation,
  offeringRegistrationFromRow,
  qualifySuppliedCandidate,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getExactRegisteredCapabilityContract } from './capabilityContractDocuments'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { toCapabilityOfferingRow } from './capabilitySupplyRowMappers'

export const publishedOperationSnapshotReturns = v.union(
  v.object({ operationJson: v.string() }),
  v.null(),
)

export async function readCurrentPublishedOperationSnapshotHandler(
  ctx: QueryCtx,
  input: { operationRef: string },
) {
  try {
    const operation = await readCurrentPublishedOperation(ctx, input.operationRef, Date.now())
    return operation === undefined ? null : { operationJson: JSON.stringify(operation) }
  } catch {
    return null
  }
}

export async function readCurrentPublishedOperation(
  ctx: Pick<QueryCtx, 'db'>,
  operationRef: string,
  now = Date.now(),
): Promise<PublishedOperation | undefined> {
  try {
    return await readCurrentPublishedOperationUnchecked(ctx, operationRef, now)
  } catch {
    return undefined
  }
}

async function readCurrentPublishedOperationUnchecked(
  ctx: Pick<QueryCtx, 'db'>,
  operationRef: string,
  now: number,
): Promise<PublishedOperation | undefined> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_operationRef_and_disposition', (query) => (
      query.eq('operationRef', operationRef).eq('disposition', 'current')
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
    const materialized = materializePublishedOperation({
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
    const expectedOperationRef = createPublicOperationRef({
      operationId: capabilityOperationId(contractResult.contract.ref.capabilityId),
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      contractRef: contractResult.contract.ref,
    })
    if (expectedOperationRef === operationRef) return materialized
  } catch {
    return undefined
  }
  return undefined
}

function canonicalPublicationPricing(
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
