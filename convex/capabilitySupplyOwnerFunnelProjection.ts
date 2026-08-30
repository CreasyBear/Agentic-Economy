import {
  probeRequestDigest,
  publicationLifecycle,
  qualifySuppliedCandidate,
  readCapabilityProbeTarget,
} from '@/modules/capability-supply/public'
import { ownerSupplyLiteral, ownerSupplyOptionalNumber, ownerSupplyStringArray } from '@/modules/capability-supply/owner-supply-validators'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { reconstructOwnerSourceMaterial } from './capabilitySupplyOwnerSourceMaterial'

const MAX_READINESS_VALIDITY_MS = 24 * 60 * 60_000
const OWNER_SUPPLY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_REVISIONS_READ_CAP = 100
const OWNER_SUPPLY_ACCESS_PATHS_READ_CAP = 100
const OWNER_SUPPLY_PUBLICATIONS_READ_CAP = 100
const OWNER_SUPPLY_CAPABILITY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_EVENTS_READ_CAP = 50

import type { OwnerSupplyFunnelResult } from './capabilitySupplyOwnerFunnelProjection/contracts'
import {
  everyFact,
  ownerSupplyActionableReason,
  ownerSupplyAuthority,
  ownerSupplyOfferingResult,
  ownerSupplyPricing,
  ownerSupplyPublicationDetails,
  ownerSupplyReadiness,
  ownerSupplyStepProgress,
} from './capabilitySupplyOwnerFunnelProjection/offering_projection'

export {
  ownerSupplyFunnelResultValue,
  type OwnerSupplyFunnelResult,
} from './capabilitySupplyOwnerFunnelProjection/contracts'

type OwnerSupplyAvailable = Extract<
  OwnerSupplyFunnelResult,
  { kind: 'available' }
>
type OwnerSupplyOffering = OwnerSupplyAvailable['offerings'][number]
type OwnerSupplyPublication = NonNullable<OwnerSupplyOffering['publication']>

async function requestedOwnerSourceMaterial(
  db: QueryCtx['db'] | MutationCtx['db'],
  input: Readonly<{
    editorOfferingRef: string | undefined
    offeringRef: string
    publication: Doc<'capabilityPublications'> | undefined
  }>,
): Promise<NonNullable<OwnerSupplyOffering['sourceMaterial']> | undefined> {
  if (
    input.editorOfferingRef !== input.offeringRef
    || input.publication === undefined
  ) return undefined
  const result = await reconstructOwnerSourceMaterial(
    db,
    input.publication,
    input.publication.registrationEvidenceRefs ?? [],
  )
  return result.kind === 'ready'
    ? result.prepared as NonNullable<OwnerSupplyOffering['sourceMaterial']>
    : undefined
}

async function qualifyOwnerSupplyOffering(
  db: QueryCtx['db'],
  input: Readonly<{
    publication: Doc<'capabilityPublications'> | undefined
    binding: Doc<'capabilityTransportBindings'> | undefined
    capabilityOffering: Doc<'capabilityOfferings'> | undefined
    businessId: string
    now: number
  }>,
) {
  const { publication, binding, capabilityOffering, businessId, now } = input
  if (
    publication === undefined
    || binding === undefined
    || capabilityOffering === undefined
  ) return undefined
  return qualifySuppliedCandidate(capabilitySupplyGraphPorts(db), {
    candidate: {
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      networkId: publication.networkId,
      businessId,
      offeringId: capabilityOffering.offeringId,
      bindingId: binding.bindingId,
      contractRef: {
        capabilityId: binding.capabilityId,
        version: binding.version,
        contractDigest: binding.contractDigest,
      },
    },
    now,
  })
}

function ownerSupplyLifecycle(
  input: Readonly<{
    publication: Doc<'capabilityPublications'> | undefined
    binding: Doc<'capabilityTransportBindings'> | undefined
    capabilityOffering: Doc<'capabilityOfferings'> | undefined
    currentConnection: Doc<'capabilityProviderConnections'> | null | undefined
    now: number
  }>,
) {
  const { publication, binding, capabilityOffering, currentConnection, now } = input
  if (
    publication === undefined
    || binding === undefined
    || capabilityOffering === undefined
  ) return undefined
  return publicationLifecycle(
    publication,
    capabilityOffering,
    binding,
    now,
    currentConnection,
  )
}

export async function readOwnerSupplyFunnelProjection(
  ctx: QueryCtx | MutationCtx,
  args: { businessId: Id<'businesses'>; editorOfferingRef?: string },
  business: Doc<'businesses'>,
): Promise<OwnerSupplyFunnelResult> {
    const db = ctx.db
    // `businessOfferings.status` is draft|published|paused|retired — there is no
    // 'active'. Filtering on it returned nothing for every owner, so the funnel
    // home always read "No services yet" while /owner/offerings listed the same
    // offerings. Same selection rule as `loadOfferingSourceState` in catalog.ts.
    const [
      offeringRows,
      revisions,
      accessPaths,
      publications,
      capabilityOfferings,
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
    const now = Date.now()
    const offerings: OwnerSupplyAvailable['offerings'] = await Promise.all(
      offeringRows.map(async (offering): Promise<OwnerSupplyOffering> => {
        const join = offeringJoins.get(offering.offeringRef)
        const revision = join?.revision
        const capabilityOffering = join?.capabilityOffering
        const paths = accessPaths.filter(
          (path) =>
            path.offeringRef === offering.offeringRef &&
            path.offeringRevision === offering.currentRevision,
        )
        const publication = join?.publication
        const binding =
          publication === undefined
            ? undefined
            : (bindingByPublicationRef.get(publication.publicationRef) ??
              undefined)
        const currentConnection =
          publication === undefined
            ? undefined
            : providerConnectionByPublicationRef.get(publication.publicationRef)
        const qualification = await qualifyOwnerSupplyOffering(db, {
          publication,
          binding,
          capabilityOffering,
          businessId: String(business._id),
          now,
        })
        const lifecycle = ownerSupplyLifecycle({
          publication,
          binding,
          capabilityOffering,
          currentConnection,
          now,
        })
        const pricing = ownerSupplyPricing(publication)
        const readiness = ownerSupplyReadiness(publication)
        const lifecycleValue = lifecycle ?? {
          state: 'inactive' as const,
          reasons: ['admission_unproven' as const],
        }
        const lifecycleForWire: {
          state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
          reasons: OwnerSupplyPublication['lifecycle']['reasons']
        } = {
          state: lifecycleValue.state,
          reasons: [...lifecycleValue.reasons],
        }
        const readinessValue = readiness ?? {
          outcome: 'unobserved' as const,
          evidenceRefs: [] as string[],
        }
        const publicationDetails = ownerSupplyPublicationDetails({
          publication,
          binding,
          pricing,
          lifecycle: lifecycleForWire,
          readiness: readinessValue,
        })
        const readyNow = everyFact([
          lifecycleValue.state === 'active',
          readinessValue.outcome === 'healthy',
          readinessValue.observedAt !== undefined,
          readinessValue.validUntil !== undefined,
          (readinessValue.validUntil ?? 0) > now,
          (readinessValue.validUntil ?? Number.POSITIVE_INFINITY)
            <= now + MAX_READINESS_VALIDITY_MS,
        ])
        const qualificationRouteable = qualification?.status === 'eligible'
        const testObserved = everyFact([
          publication !== undefined,
          publication?.disposition === 'current',
          publication === undefined
            ? false
            : testObservedPublicationRefs.has(publication.publicationRef),
        ])
        const x402ProbeTarget =
          publicationDetails?.source.kind !== 'x402' ||
          publication === undefined
            ? undefined
            : await readCapabilityProbeTarget(
                capabilitySupplyGraphPorts(db),
                {
                  publicationRef: publication.publicationRef,
                  expectedRevision: publication.revision,
                },
              )
        const availableX402Target =
          x402ProbeTarget?.kind === 'available' ? x402ProbeTarget : undefined
        const x402ChallengeObserved = everyFact([
          publicationDetails?.state === 'current',
          publicationDetails?.source.kind === 'x402',
          publicationDetails?.binding.adapterId === 'x402-fetch:v2',
          publicationDetails?.binding.admission === 'admitted',
          publicationDetails?.binding.conformance === 'conformant',
          readyNow,
          availableX402Target !== undefined,
          readinessValue.targetDigest === availableX402Target?.target.targetDigest,
          readinessValue.requestDigest ===
            (availableX402Target === undefined
              ? undefined
              : probeRequestDigest(availableX402Target.target)),
          readinessValue.responseStatus === 402,
          readinessValue.evidenceRefs.includes(
            'probe:x402_payment_required_valid',
          ),
        ])
        const testCompleted =
          publicationDetails?.source.kind === 'x402'
            ? x402ChallengeObserved
            : testObserved
        const { currentStep, stepStates } = ownerSupplyStepProgress({
          hasRevision: revision !== undefined,
          hasPublication: publication !== undefined,
          readyNow,
          readinessOutcome: readinessValue.outcome,
          testCompleted,
        })
        const actionableReason = ownerSupplyActionableReason({
          hasPublication: publication !== undefined,
          qualificationRouteable,
          qualificationReasons: qualification?.reasons,
          lifecycleReasons: lifecycleValue.reasons,
          readinessOutcome: readinessValue.outcome,
        })
        const sourceMaterial = await requestedOwnerSourceMaterial(db, {
          editorOfferingRef: args.editorOfferingRef,
          offeringRef: offering.offeringRef,
          publication,
        })
        return ownerSupplyOfferingResult({
          offering,
          revision,
          paths,
          binding,
          pricing,
          authority: ownerSupplyAuthority(publicationDetails),
          publication,
          publicationDetails,
          lifecycle: lifecycleForWire,
          readiness: readinessValue,
          qualificationRouteable,
          currentStep,
          stepStates,
          actionableReason,
          sourceMaterial,
        })
      }),
    )
    const fillEvents = events.filter(
      (event) => event.eventKind === 'supply_liquidity_fill_observed',
    )
    const durations = events
      .flatMap((event) => {
        if (event.eventKind !== 'supply_liquidity_first_success_observed')
          return []
        const durationMs = ownerSupplyOptionalNumber(
          event.durationMs,
          'duration',
        )
        return durationMs === undefined ? [] : [durationMs]
      })
      .sort((left, right) => left - right)
    const callLog = fillEvents.map((event) => {
      const zeroReason =
        event.zeroReason === undefined
          ? undefined
          : ownerSupplyLiteral(
              event.zeroReason,
              [
                'no_routeable_supply',
                'readiness_unavailable',
                'provider_refused',
                'credential_unavailable',
                'price_unavailable',
                'insufficient_credit',
                'input_invalid',
                'outcome_unknown',
              ] as const,
              'zero reason',
            )
      const durationMs = ownerSupplyOptionalNumber(event.durationMs, 'duration')
      return {
        eventRef: event.eventRef,
        offeringRef: event.offeringRef,
        ...(event.publicationRef === undefined
          ? {}
          : { publicationRef: event.publicationRef }),
        observedAt: event.observedAt,
        outcome: ownerSupplyLiteral(
          event.outcome,
          ['filled', 'zero'] as const,
          'event outcome',
        ),
        ...(zeroReason === undefined ? {} : { zeroReason }),
        ...(durationMs === undefined ? {} : { durationMs }),
        evidenceRefs: ownerSupplyStringArray(
          event.evidenceRefs,
          'event evidence',
        ),
        environment: ownerSupplyLiteral(
          event.environment,
          ['local', 'development', 'sandbox', 'production'] as const,
          'event environment',
        ),
      }
    })
    const durationsP50 = durations[Math.floor((durations.length - 1) * 0.5)]
    const durationsP95 = durations[Math.floor((durations.length - 1) * 0.95)]
    return {
      kind: 'available',
      businessId: business._id,
      business: { name: business.name, slug: business.slug },
      offerings,
      callLog,
      activityTruncated,
      liquidity: {
        fillCount: callLog.filter((event) => event.outcome === 'filled').length,
        zeroCount: callLog.filter((event) => event.outcome === 'zero').length,
        ...(durations.length === 0
          ? {}
          : {
              firstSuccessP50Ms: durationsP50,
              firstSuccessP95Ms: durationsP95,
            }),
        depthSamples: events.filter(
          (event) => event.eventKind === 'supply_liquidity_depth_observed',
        ).length,
        environment: 'development',
      },
    }
}
