import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'

const OWNER_SUPPLY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_REVISIONS_READ_CAP = 100
const OWNER_SUPPLY_ACCESS_PATHS_READ_CAP = 100
const OWNER_SUPPLY_PUBLICATIONS_READ_CAP = 100
const OWNER_SUPPLY_CAPABILITY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_EVENTS_READ_CAP = 50
const PROVIDER_EVIDENCE_READ_CAP = 10_000

export async function readOwnerSupplyRows(
  db: QueryCtx['db'] | MutationCtx['db'],
  business: Doc<'businesses'>,
  evidenceWindowStartAt: number,
) {
    // `businessOfferings.status` is draft|published|paused|retired — there is no
    // 'active'. Filtering on it returned nothing for every owner, so the funnel
    // home always read "No services yet" while /owner/operations listed the same
    // offerings. Same selection rule as `loadOfferingSourceState` in catalog.ts.
    const [
      offeringRows,
      revisions,
      accessPaths,
      publications,
      capabilityOfferings,
      providerCallRows,
    ] = await Promise.all([
      db
        .query('businessOfferings')
        .withIndex('by_businessId_and_status', (q) =>
          q.eq('businessId', business._id),
        )
        .take(OWNER_SUPPLY_OFFERINGS_READ_CAP + 1),
      db
        .query('businessOfferingRevisions')
        .withIndex('by_businessId_and_createdAt', (q) =>
          q.eq('businessId', business._id),
        )
        .take(OWNER_SUPPLY_REVISIONS_READ_CAP + 1),
      // Access-path status is draft|published|withdrawn; 'active' never matched.
      db
        .query('offeringAccessPaths')
        .withIndex('by_businessId_and_status', (q) =>
          q.eq('businessId', business._id),
        )
        .take(OWNER_SUPPLY_ACCESS_PATHS_READ_CAP + 1),
      db
        .query('capabilityPublications')
        .withIndex('by_businessId_and_disposition', (q) =>
          q.eq('businessId', business._id),
        )
        .take(OWNER_SUPPLY_PUBLICATIONS_READ_CAP + 1),
      // Keep inactive capability offerings in owner readback so a newly published
      // operation remains visibly pending until the shared lifecycle integrates it.
      db
        .query('capabilityOfferings')
        .withIndex('by_businessId_and_status', (q) =>
          q.eq('businessId', business._id),
        )
        .take(OWNER_SUPPLY_CAPABILITY_OFFERINGS_READ_CAP + 1),
      db
        .query('capabilityCallProjections')
        .withIndex('by_providerRef_and_createdAt', (q) =>
          q.eq('providerRef', String(business._id)).gte('createdAt', evidenceWindowStartAt),
        )
        .take(PROVIDER_EVIDENCE_READ_CAP + 1),
    ])
    if (
      offeringRows.length > OWNER_SUPPLY_OFFERINGS_READ_CAP
      || revisions.length > OWNER_SUPPLY_REVISIONS_READ_CAP
      || accessPaths.length > OWNER_SUPPLY_ACCESS_PATHS_READ_CAP
      || publications.length > OWNER_SUPPLY_PUBLICATIONS_READ_CAP
      || capabilityOfferings.length > OWNER_SUPPLY_CAPABILITY_OFFERINGS_READ_CAP
    ) {
      return { kind: 'incomplete' as const }
    }
    const resolveOfferingJoin = (
      offering: (typeof offeringRows)[number],
    ) => {
      const revision = revisions.find(
        (candidate) =>
          candidate.offeringRef === offering.offeringRef &&
          candidate.revision === offering.currentRevision,
      )
      const capabilityOffering =
        revision === undefined
          ? undefined
          : capabilityOfferings.find((candidate) => {
              const origin = candidate.origin
              return (
                origin?.kind === 'catalog_offering' &&
                origin.offeringRef === offering.offeringRef &&
                origin.offeringRevision === offering.currentRevision &&
                origin.offeringSourceHash === revision.sourceHash
              )
            })
      const publicationCandidates =
        capabilityOffering === undefined
          ? []
          : publications
              .filter(
                (candidate) =>
                  candidate.offeringId === capabilityOffering.offeringId,
              )
              .sort((left, right) => right.revision - left.revision)
      return {
        revision,
        capabilityOffering,
        publication:
          publicationCandidates.find(
            (candidate) => candidate.disposition === 'current',
          ) ?? publicationCandidates[0],
      }
    }
    const offeringJoins = new Map(
      offeringRows.map((offering) => [
        offering.offeringRef,
        resolveOfferingJoin(offering),
      ]),
    )

    const testObservedEventRows: Array<Array<{ publicationRef?: string }>> = []
    const activityRows: Array<{
      eventKind: string
      durationMs?: number
      zeroReason?: string
      eventRef: string
      offeringRef: string
      publicationRef?: string
      observedAt: number
      outcome?: string
      evidenceRefs: readonly string[]
      environment?: string
    }> = []
    const testObservedPublicationRefs = new Set(
      testObservedEventRows.flatMap((rows) =>
        rows.flatMap((event) =>
          event.publicationRef === undefined ? [] : [event.publicationRef],
        ),
      ),
    )
    const activityTruncated = activityRows.length > OWNER_SUPPLY_EVENTS_READ_CAP
    const events = activityRows.slice(0, OWNER_SUPPLY_EVENTS_READ_CAP)
    const [providerConnections, publicationBindings] = await Promise.all([
      Promise.all(
        publications.map(async (publication) => {
          const connectionRef = publication.connectionAuthority?.connectionRef
          if (connectionRef === undefined) return null
          return db
            .query('capabilityProviderConnections')
            .withIndex('by_connectionRef', (q) =>
              q.eq('connectionRef', connectionRef),
            )
            .unique()
        }),
      ),
      Promise.all(
        publications.map((publication) =>
          db
            .query('capabilityTransportBindings')
            .withIndex('by_bindingId', (q) =>
              q.eq('bindingId', publication.bindingId),
            )
            .unique(),
        ),
      ),
    ])
    const providerConnectionByPublicationRef = new Map(
      publications.map((publication, index) => [
        publication.publicationRef,
        providerConnections[index],
      ]),
    )
    const bindingByPublicationRef = new Map(
      publications.map((publication, index) => [
        publication.publicationRef,
        publicationBindings[index],
      ]),
    )
    const providerCallsOverflow = providerCallRows.length > PROVIDER_EVIDENCE_READ_CAP
    const boundedProviderCalls = providerCallRows.slice(0, PROVIDER_EVIDENCE_READ_CAP)
    return {
      kind: 'available' as const,
      offeringRows,
      accessPaths,
      offeringJoins,
      testObservedPublicationRefs,
      activityTruncated,
      events,
      providerConnectionByPublicationRef,
      bindingByPublicationRef,
      providerCallsOverflow,
      boundedProviderCalls,
    }
}
