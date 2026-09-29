import { probeRequestDigest, readCapabilityProbeTarget } from '@/modules/capability-supply/public'
import { ownerSupplyLiteral, ownerSupplyOptionalNumber, ownerSupplyStringArray } from '@/modules/capability-supply/owner-supply-validators'
import { capabilitySupplyGraphPorts } from '../graphPorts/ports'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Doc, Id } from '../../../_generated/dataModel'
import { reconstructOwnerSourceMaterial } from '../../../capabilitySupplyOwnerSourceMaterial'
import { projectToolEvidence, providerTestCompleted } from './evidence'
import type { OwnerSupplyAvailable, OwnerSupplyFunnelResult, OwnerSupplyOffering, OwnerSupplyPublication } from './contracts'
import { everyFact, ownerSupplyActionableReason, ownerSupplyAuthority, ownerSupplyOfferingResult, ownerSupplyPricing, ownerSupplyPublicationDetails, ownerSupplyReadiness, ownerSupplyStepProgress } from './offeringProjection'
import { ownerSupplyLifecycle, qualifyOwnerSupplyOffering } from './qualification'
import { readOwnerSupplyRows } from './sourceRows'

const MAX_READINESS_VALIDITY_MS = 24 * 60 * 60_000
const PROVIDER_EVIDENCE_WINDOW_MS = 30 * 24 * 60 * 60_000

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
    input.publication.registrationEvidenceRefs,
  )
  return result.kind === 'ready'
    ? result.prepared as NonNullable<OwnerSupplyOffering['sourceMaterial']>
    : undefined
}

export async function readOwnerSupplyFunnelProjection(
  ctx: QueryCtx | MutationCtx,
  args: { businessId: Id<'businesses'>; editorOfferingRef?: string },
  business: Doc<'businesses'>,
): Promise<OwnerSupplyFunnelResult> {
    const db = ctx.db
    const now = Date.now()
    const evidenceWindowStartAt = now - PROVIDER_EVIDENCE_WINDOW_MS
    const rows = await readOwnerSupplyRows(db, business, evidenceWindowStartAt)
    if (rows.kind === 'incomplete') return rows
    const {
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
    } = rows
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
        const testCompleted = providerTestCompleted(
          publicationDetails?.source.kind,
          x402ChallengeObserved,
          testObserved,
        )
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
        const baseOffering = ownerSupplyOfferingResult({
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
          now,
        })
        const toolRef = publication?.toolRef
        if (toolRef === undefined) return baseOffering
        return {
          ...baseOffering,
          toolEvidence: projectToolEvidence({
            toolRef,
            windowStartAt: evidenceWindowStartAt,
            windowEndAt: now,
            callsOverflow: providerCallsOverflow,
            calls: boundedProviderCalls,
          }),
        }
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
