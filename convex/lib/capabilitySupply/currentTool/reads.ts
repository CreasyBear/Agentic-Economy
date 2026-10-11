import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'

import {
  admitRegisteredTransport,
  capabilityToolId,
  createPublicToolRef,
  defineCapabilityTransportBindingRegistration,
  materializePublishedTool,
  offeringRegistrationFromRow,
  qualifySuppliedCandidate,
  type PublishedTool,
} from '@/modules/capability-supply/public'
import { normalizePricingConfig, pricingConfigDigest, type PricingConfig } from '@/modules/money/public'

import type { Doc } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { getExactRegisteredCapabilityContract } from '../../capabilityContract/documents/reads'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import { toCapabilityOfferingRow } from '../../../capabilitySupplyRowMappers'

export const publishedOperationSnapshotReturns = v.union(
  v.object({ toolJson: v.string() }),
  v.null(),
)


export async function readCurrentPublishedToolSnapshotHandler(
  ctx: QueryCtx,
  input: { toolRef: string },
) {
  try {
    const operation = await readCurrentPublishedTool(ctx, input.toolRef, Date.now())
    return operation === undefined ? null : { toolJson: JSON.stringify(operation) }
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'readCurrentPublishedToolSnapshotHandler', reason: 'invalid_response' })
  }
}

export async function readCurrentPublishedTool(
  ctx: Pick<QueryCtx, 'db'>,
  toolRef: string,
  now = Date.now(),
): Promise<PublishedTool | undefined> {
  try {
    return await readCurrentPublishedToolUnchecked(ctx, toolRef, now)
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readCurrentPublishedTool', reason: 'invalid_response' })
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
  if (!await publicationOwnerOpen(ctx, publication.businessId)) return undefined
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readCurrentPublishedToolUnchecked', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'readCurrentPublishedToolUnchecked', reason: 'invalid_response' })
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
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'canonicalPublicationPricing', reason: 'invalid_response' })
  }
}

/** Closed account or retired owner: the Tool stops resolving, so listing, quoting and routing close together. */
async function publicationOwnerOpen(ctx: Pick<QueryCtx, 'db'>, businessId: Doc<'capabilityPublications'>['businessId']): Promise<boolean> {
  const business = await ctx.db.get(businessId)
  if (business === null) return true
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', business.owningAccountRef)).unique()
  if (account === null) return true
  if (account.lifecycle === 'closed') return false
  const ownerships = await ctx.db.query('accountOwnerships')
    .withIndex('by_accountRef_and_lifecycle', (q) => q.eq('accountRef', account.accountRef).eq('lifecycle', 'active'))
    .take(8)
  if (ownerships.length === 0) return true
  const owners = await Promise.all(ownerships.map((o) => ctx.db.query('principals')
    .withIndex('by_principalRef', (q) => q.eq('principalRef', o.ownerPrincipalRef)).unique()))
  // Closed only when every owner row exists and none is active; missing rows fail open.
  return !owners.every((owner) => owner !== null && owner.lifecycle !== 'active')
}
