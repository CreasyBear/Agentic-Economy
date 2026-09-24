import type { Id } from '../../../_generated/dataModel'
import { type OfferingSupportProjection } from '../../../../src/modules/catalog/public'
import { MAX_ELIGIBLE_SUPPLY, qualifySuppliedCandidate } from '../../../../src/modules/capability-supply/public'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import { directoryListingEligible } from '../../../capabilitySupplyDirectoryEligibility'
import { catalogOfferingOrigin, readCapabilityBinding, readCapabilityOffering, readCapabilityPublication } from './capabilityRows'
import type { CapabilityProjectionReadDb } from './reads'

export async function deriveBusinessOfferingSupportFromCapabilitySupply(
  db: CapabilityProjectionReadDb,
  businessId: Id<'businesses'>,
  now: number,
): Promise<Record<string, OfferingSupportProjection>> {
  const result: Record<string, OfferingSupportProjection> = {}
  const offerings = (await db.query('capabilityOfferings')
    .withIndex('by_businessId_and_status', (q) => q.eq('businessId', businessId).eq('status', 'active'))
    .take(MAX_ELIGIBLE_SUPPLY + 1)).map(readCapabilityOffering)
  if (offerings.length > MAX_ELIGIBLE_SUPPLY) throw new Error('capability_offering_capacity_exceeded')
  const currentPublications = (await db.query('capabilityPublications')
    .withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', businessId).eq('disposition', 'current'))
    .take(MAX_ELIGIBLE_SUPPLY + 1)).map(readCapabilityPublication)
  if (currentPublications.length > MAX_ELIGIBLE_SUPPLY) throw new Error('capability_publication_capacity_exceeded')
  const catalogOfferings = offerings.flatMap((supply) => {
    const origin = catalogOfferingOrigin(supply.origin)
    return origin === undefined ? [] : [{ offeringRef: origin.offeringRef, supply }]
  })
  for (const publication of currentPublications) {
    const offeringRow = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId))
      .unique()
    const offering = offeringRow === null ? null : readCapabilityOffering(offeringRow)
    if (offering === null || offering.businessId !== businessId || offering.status !== 'active') continue
    const origin = catalogOfferingOrigin(offering.origin)
    if (origin === undefined) continue
    const bindingRow = await db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId))
      .unique()
    const binding = bindingRow === null ? null : readCapabilityBinding(bindingRow)
    if (
      binding === null
      || binding.offeringId !== offering.offeringId
      || binding.admission !== 'admitted'
      || binding.conformance !== 'conformant'
    ) continue
    const qualification = await qualifySuppliedCandidate(capabilitySupplyGraphPorts(db), {
      candidate: {
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
      },
      now,
    })
    const readinessObservedAt = publication.readinessObservedAt
    const expiry = publication.readinessValidUntil
    // Same directory quality bar applied to the admitted registry's Tool
    // reads (capabilitySupplyToolShared.ts:directoryListingEligible):
    // reviewed-tier (provider_owned/ae_curated_external) is exempt; a
    // listed-tier publication (third_party_gateway/observed_external) must
    // still clear the directory's eligibility bar to count as routeable
    // here. No catalog_offering-origin publication is listed-tier today
    // (facilitator discovery only ever publishes standalone-origin
    // offerings), so this is currently a no-op guard against that changing
    // silently rather than an active filter.
    const routeable = qualification.status === 'eligible'
      && await directoryListingEligible({ db }, publication.authorityMode, publication.sourceRouteRef)
    const next: OfferingSupportProjection = routeable
      ? {
          integrated: true,
          routeable: true,
          reasons: [],
          ...(readinessObservedAt === undefined ? { observedAt: now } : { observedAt: readinessObservedAt }),
          ...(expiry === undefined ? {} : { validUntil: expiry }),
        }
      : { integrated: true, routeable: false, reasons: ['readiness_unavailable'], observedAt: now }
    if (!result[origin.offeringRef]?.routeable) result[origin.offeringRef] = next
  }
  for (const { offeringRef, supply } of catalogOfferings) {
    if (result[offeringRef] !== undefined) continue
    const binding = await db.query('capabilityTransportBindings')
      .withIndex('by_offeringId_and_admission_and_conformance', (query) => query
        .eq('offeringId', supply.offeringId)
        .eq('admission', 'admitted')
        .eq('conformance', 'conformant'))
      .take(1)
    result[offeringRef] = binding.length > 0
      ? { integrated: true, routeable: false, reasons: ['readiness_unavailable'], observedAt: now }
      : { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: now }
  }
  return result
}

