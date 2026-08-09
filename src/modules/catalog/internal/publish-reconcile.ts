import { brandNonEmpty } from '@/modules/common/ids'
import { normalizeSlug } from '@/modules/common/normalize-slug'
import {
  changeOfferingStatusInState,
  createOfferingInState,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
  type OfferingFactsInput,
  type OfferingSourceState,
} from './offering-source'
import type { ValidatedServiceCatalogInput } from './catalog-model'

export type OfferingsReconcileResult =
  | Readonly<{ kind: 'ok'; state: OfferingSourceState }>
  | Readonly<{ kind: 'error'; code: string; reason: string }>

/**
 * Canonical offering-reconciliation core shared by both the Convex production
 * mutation (publishBusinessCatalogCommand -> persistPublishedOfferings) and the
 * deterministic model (applyPublishState).
 *
 * Semantics are the PRODUCTION path's: return-code on error with a human
 * reason, immutable threading of the state (never mutates `source`), and a
 * draft-loop that adds applyPublishState's correct multi-business guard
 * (offerings of other businesses are never force-drafted). Every operationKey
 * string, error code, and error mapping is preserved byte-identical.
 */
export function reconcilePublishedOfferings(
  source: OfferingSourceState,
  opts: {
    businessId: string
    authority: { actorRef?: string; ownerRef: string; businessOwnerRef: string }
    services: readonly ValidatedServiceCatalogInput[]
    operationKey: string
    now: number
  },
): OfferingsReconcileResult {
  const { businessId, authority, services, operationKey, now } = opts
  let state = source
  const offeringRefs = new Set<string>()
  for (const service of services) {
    const slug = normalizeSlug(service.name) || 'offering'
    const offeringRef = `offering:${businessId}:${slug}`
    offeringRefs.add(offeringRef)
    const facts: OfferingFactsInput = {
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceAreaSummary: service.serviceArea,
      availabilitySummary: service.hoursOrUnknown,
    }
    let offering = state.offerings.find((candidate) => candidate.offeringRef === offeringRef)
    if (offering === undefined) {
      const created = createOfferingInState(state, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:create`,
        businessId: brandNonEmpty(businessId, 'BusinessId'),
        offeringRef: brandNonEmpty(offeringRef, 'OfferingRef'),
        facts,
        now,
      })
      if (created.kind === 'error') return { kind: 'error', code: created.code, reason: created.reason }
      state = created.state
      offering = created.value
    } else {
      const revised = reviseOfferingInState(state, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:revise:${offering.currentRevision}`,
        offeringRef: offering.offeringRef,
        expectedRevision: offering.currentRevision,
        facts,
        now,
      })
      if (revised.kind === 'error') return { kind: 'error', code: revised.code, reason: revised.reason }
      state = revised.state
      offering = revised.value
    }
    if (offering.status !== 'published') {
      const published = changeOfferingStatusInState(state, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:publish`,
        offeringRef: offering.offeringRef,
        expectedRevision: offering.currentRevision,
        status: 'published',
        now,
      })
      if (published.kind === 'error') return { kind: 'error', code: published.code, reason: published.reason }
      state = published.state
      offering = published.value
    }

    const humanChannel = service.firstRequest.publicChannel === 'public_business_contact'
      ? 'phone'
      : service.firstRequest.publicChannel === 'ae_status_only'
        ? 'ae_inquiry'
        : undefined
    const existingPaths = state.accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.status !== 'withdrawn')
    if (humanChannel !== undefined && service.firstRequest.mode !== 'not_available_yet') {
      const upserted = upsertAccessPathInState(state, {
        authority,
        operationKey: `${operationKey}:offering:${slug}:access-path`,
        offeringRef: offering.offeringRef,
        accessPathRef: brandNonEmpty(`access:${businessId}:${slug}:human`, 'AccessPathRef'),
        expectedRevision: offering.currentRevision,
        status: 'published',
        descriptor: {
          kind: 'human_request',
          channel: humanChannel,
          disclosure: service.firstRequest.publicDisclosure ?? 'Contact the business to begin.',
        },
        now,
      })
      if (upserted.kind === 'error') return { kind: 'error', code: upserted.code, reason: upserted.reason }
      state = upserted.state
    } else {
      for (const path of existingPaths) {
        const withdrawn = withdrawAccessPathInState(state, {
          authority,
          operationKey: `${operationKey}:offering:${slug}:withdraw:${path.accessPathRef}`,
          accessPathRef: path.accessPathRef,
          expectedRevision: offering.currentRevision,
          now,
        })
        if (withdrawn.kind === 'error') return { kind: 'error', code: withdrawn.code, reason: withdrawn.reason }
        state = withdrawn.state
      }
    }
  }

  for (const offering of state.offerings) {
    if (offering.businessId !== businessId || offeringRefs.has(offering.offeringRef) || offering.status === 'retired') continue
    const drafted = changeOfferingStatusInState(state, {
      authority,
      operationKey: `${operationKey}:offering:${offering.offeringRef}:draft`,
      offeringRef: offering.offeringRef,
      expectedRevision: offering.currentRevision,
      status: 'draft',
      now,
    })
    if (drafted.kind === 'error') return { kind: 'error', code: drafted.code, reason: drafted.reason }
    state = drafted.state
  }
  return { kind: 'ok', state }
}
