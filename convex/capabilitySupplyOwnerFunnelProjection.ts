import { v, type Infer } from 'convex/values'

import {
  capabilityPublicationSourceSelectorValue,
  probeRequestDigest,
  publicationLifecycle,
  qualifySuppliedCandidate,
  readCapabilityProbeTarget,
  readinessOutcomeValue,
  pricingConfigValue,
} from '@/modules/capability-supply/public'
import { ownerSupplyAccessPathDescriptor, ownerSupplyAccessPathDescriptorValue, ownerSupplyLiteral, ownerSupplyOptionalNumber, ownerSupplyStringArray } from '@/modules/capability-supply/owner-supply-validators'
import { normalizePricingConfig } from '@/modules/money/public'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

const MAX_READINESS_VALIDITY_MS = 24 * 60 * 60_000
const OWNER_SUPPLY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_REVISIONS_READ_CAP = 100
const OWNER_SUPPLY_ACCESS_PATHS_READ_CAP = 100
const OWNER_SUPPLY_PUBLICATIONS_READ_CAP = 100
const OWNER_SUPPLY_CAPABILITY_OFFERINGS_READ_CAP = 50
const OWNER_SUPPLY_EVENTS_READ_CAP = 50

const ownerSupplyLifecycleReasonValue = v.union(
  v.literal('admission_unproven'),
  v.literal('conformance_unproven'),
  v.literal('credential_readiness_unobserved'),
  v.literal('health_unobserved'),
  v.literal('credential_unavailable'),
  v.literal('health_unhealthy'),
  v.literal('health_stale'),
  v.literal('withdrawn'),
  v.literal('incompatible_revision'),
  v.literal('eligibility_integrity_failure'),
)
const ownerSupplyAuthorityValue = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({ kind: v.literal('provider_connection'), providerRef: v.string() }),
)
const ownerSupplyAuthoritySnapshotValue = v.object({
  providerRef: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
})
const ownerSupplyPublicationValue = v.object({
  state: v.union(
    v.literal('current'),
    v.literal('withdrawn'),
    v.literal('superseded'),
    v.literal('incompatible'),
  ),
  publicationRef: v.string(),
  publicationRevision: v.number(),
  operationRef: v.string(),
  authorityMode: v.union(
    v.literal('provider_owned'),
    v.literal('ae_curated_external'),
    v.literal('third_party_gateway'),
    v.literal('observed_external'),
  ),
  contractRef: v.object({
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
  }),
  source: v.object({
    kind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    selector: capabilityPublicationSourceSelectorValue,
    revision: v.string(),
    digest: v.string(),
  }),
  pricing: v.optional(
    v.object({ config: pricingConfigValue, priceDigest: v.string() }),
  ),
  binding: v.object({
    bindingId: v.string(),
    bindingDigest: v.string(),
    endpointUrl: v.string(),
    adapterId: v.string(),
    admission: v.union(v.literal('not_admitted'), v.literal('admitted')),
    conformance: v.union(v.literal('not_conformant'), v.literal('conformant')),
    authority: ownerSupplyAuthorityValue,
    authoritySnapshot: v.optional(ownerSupplyAuthoritySnapshotValue),
  }),
  lifecycle: v.object({
    state: v.union(
      v.literal('inactive'),
      v.literal('active'),
      v.literal('withdrawn'),
      v.literal('incompatible'),
    ),
    reasons: v.array(ownerSupplyLifecycleReasonValue),
  }),
  readiness: v.object({
    outcome: v.union(v.literal('unobserved'), readinessOutcomeValue),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    targetDigest: v.optional(v.string()),
    requestDigest: v.optional(v.string()),
    responseStatus: v.optional(v.number()),
    responseContentType: v.optional(v.string()),
    responseDigest: v.optional(v.string()),
    evidenceRefs: v.array(v.string()),
  }),
})

/** Bounded owner readback for the admitted source and single-player panel. */
export const ownerSupplyFunnelResultValue = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('incomplete') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    business: v.object({ name: v.string(), slug: v.string() }),
    offerings: v.array(
      v.object({
        offeringRef: v.string(),
        revision: v.number(),
        name: v.string(),
        summary: v.string(),
        status: v.union(
          v.literal('draft'),
          v.literal('published'),
          v.literal('paused'),
          v.literal('retired'),
        ),
        sourceHash: v.optional(v.string()),
        source: v.optional(
          v.object({
            kind: v.union(
              v.literal('ae_envelope'),
              v.literal('openapi_http'),
              v.literal('mcp'),
              v.literal('agent_plugin_mcp'),
              v.literal('x402'),
            ),
            selector: capabilityPublicationSourceSelectorValue,
            revision: v.string(),
            digest: v.string(),
          }),
        ),
        endpointUrl: v.optional(v.string()),
        pricing: v.optional(
          v.object({ config: pricingConfigValue, priceDigest: v.string() }),
        ),
        authority: v.optional(
          v.object({
            mode: v.union(
              v.literal('provider_owned'),
              v.literal('ae_curated_external'),
              v.literal('third_party_gateway'),
              v.literal('observed_external'),
            ),
            kind: v.union(
              v.literal('keyless'),
              v.literal('provider_connection'),
            ),
            providerRef: v.optional(v.string()),
            authorityGeneration: v.optional(v.number()),
            authorityDigest: v.optional(v.string()),
          }),
        ),
        admission: v.object({
          state: v.union(v.literal('not_admitted'), v.literal('admitted')),
          reason: v.optional(v.string()),
        }),
        operationRef: v.optional(v.string()),
        publicationRef: v.optional(v.string()),
        publication: v.optional(ownerSupplyPublicationValue),
        lifecycle: v.object({
          state: v.union(
            v.literal('inactive'),
            v.literal('active'),
            v.literal('withdrawn'),
            v.literal('incompatible'),
          ),
          reasons: v.array(v.string()),
        }),
        readiness: v.object({
          outcome: v.union(v.literal('unobserved'), readinessOutcomeValue),
          observedAt: v.optional(v.number()),
          validUntil: v.optional(v.number()),
          evidenceRefs: v.array(v.string()),
        }),
        live: v.object({
          available: v.boolean(),
          reason: v.optional(v.string()),
        }),
        currentStep: v.union(
          v.literal('describe'),
          v.literal('admission'),
          v.literal('readiness'),
          v.literal('test'),
        ),
        stepStates: v.object({
          describe: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          admission: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          readiness: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
          test: v.union(
            v.literal('not_started'),
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('refused'),
            v.literal('stale'),
          ),
        }),
        actionableReason: v.optional(v.string()),
        accessPaths: v.array(
          v.object({
            accessPathRef: v.string(),
            offeringSourceHash: v.string(),
            sourceHash: v.string(),
            status: v.union(
              v.literal('draft'),
              v.literal('published'),
              v.literal('withdrawn'),
            ),
            descriptor: ownerSupplyAccessPathDescriptorValue,
          }),
        ),
      }),
    ),
    callLog: v.array(
      v.object({
        eventRef: v.string(),
        offeringRef: v.string(),
        publicationRef: v.optional(v.string()),
        observedAt: v.number(),
        outcome: v.union(v.literal('filled'), v.literal('zero')),
        zeroReason: v.optional(
          v.union(
            v.literal('no_routeable_supply'),
            v.literal('readiness_unavailable'),
            v.literal('provider_refused'),
            v.literal('credential_unavailable'),
            v.literal('price_unavailable'),
            v.literal('insufficient_credit'),
            v.literal('input_invalid'),
            v.literal('outcome_unknown'),
          ),
        ),
        durationMs: v.optional(v.number()),
        evidenceRefs: v.array(v.string()),
        environment: v.union(
          v.literal('local'),
          v.literal('development'),
          v.literal('sandbox'),
          v.literal('production'),
        ),
      }),
    ),
    activityTruncated: v.boolean(),
    liquidity: v.object({
      fillCount: v.number(),
      zeroCount: v.number(),
      firstSuccessP50Ms: v.optional(v.number()),
      firstSuccessP95Ms: v.optional(v.number()),
      depthSamples: v.number(),
      environment: v.literal('development'),
    }),
  }),
)
export type OwnerSupplyFunnelResult = Infer<typeof ownerSupplyFunnelResultValue>
type OwnerSupplyAvailable = Extract<
  OwnerSupplyFunnelResult,
  { kind: 'available' }
>
type OwnerSupplyOffering = OwnerSupplyAvailable['offerings'][number]
type OwnerSupplyPublication = NonNullable<OwnerSupplyOffering['publication']>

export async function readOwnerSupplyFunnelProjection(
  ctx: QueryCtx | MutationCtx,
  args: { businessId: Id<'businesses'> },
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
        const qualification =
          publication === undefined ||
          binding === undefined ||
          capabilityOffering === undefined
            ? undefined
            : await qualifySuppliedCandidate(capabilitySupplyGraphPorts(db), {
                candidate: {
                  publicationRef: publication.publicationRef,
                  revision: publication.revision,
                  networkId: publication.networkId,
                  businessId: String(business._id),
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
        const lifecycle =
          publication === undefined ||
          binding === undefined ||
          capabilityOffering === undefined
            ? undefined
            : publicationLifecycle(
                publication,
                capabilityOffering,
                binding,
                now,
                currentConnection,
              )
        const pricing =
          publication?.pricingConfigJson === undefined
            ? undefined
            : (() => {
                try {
                  const parsed = normalizePricingConfig(
                    JSON.parse(publication.pricingConfigJson),
                  )
                  if (
                    parsed.kind !== 'valid' ||
                    publication.priceDigest === undefined
                  )
                    return undefined
                  const config =
                    parsed.config.freeTier === undefined
                      ? {
                          version: parsed.config.version,
                          unit: parsed.config.unit,
                          paidAmount: parsed.config.paidAmount,
                        }
                      : { ...parsed.config, freeTier: parsed.config.freeTier }
                  return { config, priceDigest: publication.priceDigest }
                } catch {
                  return undefined
                }
              })()
        const readiness =
          publication === undefined
            ? undefined
            : {
                outcome:
                  publication.readinessOutcome ??
                  (publication.healthState === 'healthy'
                    ? ('healthy' as const)
                    : publication.healthState === 'unhealthy'
                      ? ('response_invalid' as const)
                      : ('unobserved' as const)),
                ...(publication.readinessObservedAt === undefined
                  ? {}
                  : { observedAt: publication.readinessObservedAt }),
                ...(publication.readinessValidUntil === undefined
                  ? {}
                  : { validUntil: publication.readinessValidUntil }),
                ...(publication.readinessTargetDigest === undefined
                  ? {}
                  : { targetDigest: publication.readinessTargetDigest }),
                ...(publication.readinessRequestDigest === undefined
                  ? {}
                  : { requestDigest: publication.readinessRequestDigest }),
                ...(publication.readinessResponseStatus === undefined
                  ? {}
                  : { responseStatus: publication.readinessResponseStatus }),
                ...(publication.readinessResponseContentType === undefined
                  ? {}
                  : {
                      responseContentType:
                        publication.readinessResponseContentType,
                    }),
                ...(publication.readinessResponseDigest === undefined
                  ? {}
                  : { responseDigest: publication.readinessResponseDigest }),
                evidenceRefs: ownerSupplyStringArray(
                  publication.readinessEvidenceRefs,
                  'readiness evidence',
                ),
              }
        const sourceHash = revision?.sourceHash
        const lifecycleValue = lifecycle ?? {
          state: 'inactive' as const,
          reasons: ['admission_unproven' as const],
        }
        const lifecycleForWire: {
          state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
          reasons: Array<Infer<typeof ownerSupplyLifecycleReasonValue>>
        } = {
          state: lifecycleValue.state,
          reasons: [...lifecycleValue.reasons],
        }
        const readinessValue = readiness ?? {
          outcome: 'unobserved' as const,
          evidenceRefs: [] as string[],
        }
        const publicationDetails: OwnerSupplyPublication | undefined =
          publication === undefined || binding === undefined
            ? undefined
            : {
                state: ownerSupplyLiteral(
                  publication.disposition,
                  [
                    'current',
                    'withdrawn',
                    'superseded',
                    'incompatible',
                  ] as const,
                  'publication state',
                ),
                publicationRef: publication.publicationRef,
                publicationRevision: publication.revision,
                operationRef: publication.operationRef,
                authorityMode: ownerSupplyLiteral(
                  publication.authorityMode,
                  [
                    'provider_owned',
                    'ae_curated_external',
                    'third_party_gateway',
                    'observed_external',
                  ] as const,
                  'publication authority',
                ),
                contractRef: {
                  capabilityId: publication.capabilityId,
                  version: publication.version,
                  contractDigest: publication.contractDigest,
                },
                source: {
                  kind: publication.sourceKind,
                  selector: publication.sourceSelector ?? {},
                  revision: publication.sourceRevision,
                  digest: publication.sourceDigest,
                },
                ...(pricing === undefined ? {} : { pricing }),
                binding: {
                  bindingId: binding.bindingId,
                  bindingDigest: binding.registrationHash,
                  endpointUrl: binding.endpointUrl,
                  adapterId: binding.adapterId,
                  admission: binding.admission,
                  conformance: binding.conformance,
                  authority:
                    binding.authority.kind === 'keyless'
                      ? { kind: 'keyless' as const }
                      : {
                          kind: 'provider_connection' as const,
                          providerRef: binding.authority.providerRef,
                        },
                  ...(publication.connectionAuthority === undefined
                    ? {}
                    : {
                        authoritySnapshot: {
                          providerRef:
                            publication.connectionAuthority.providerRef,
                          authorityGeneration:
                            publication.connectionAuthority.authorityGeneration,
                          authorityDigest:
                            publication.connectionAuthority.authorityDigest,
                        },
                      }),
                },
                lifecycle: lifecycleForWire,
                readiness: readinessValue,
              }
        const readyNow =
          lifecycleValue.state === 'active' &&
          readinessValue.outcome === 'healthy' &&
          readinessValue.observedAt !== undefined &&
          readinessValue.validUntil !== undefined &&
          readinessValue.validUntil > now &&
          readinessValue.validUntil <= now + MAX_READINESS_VALIDITY_MS
        const qualificationRouteable = qualification?.status === 'eligible'
        const testObserved =
          publication !== undefined &&
          publication.disposition === 'current' &&
          testObservedPublicationRefs.has(publication.publicationRef)
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
        const x402ChallengeObserved =
          publicationDetails?.state === 'current' &&
          publicationDetails.source.kind === 'x402' &&
          publicationDetails.binding.adapterId === 'x402-fetch:v2' &&
          publicationDetails.binding.admission === 'admitted' &&
          publicationDetails.binding.conformance === 'conformant' &&
          readyNow &&
          x402ProbeTarget?.kind === 'available' &&
          readinessValue.targetDigest ===
            x402ProbeTarget.target.targetDigest &&
          readinessValue.requestDigest ===
            probeRequestDigest(x402ProbeTarget.target) &&
          readinessValue.responseStatus === 402 &&
          readinessValue.evidenceRefs.includes(
            'probe:x402_payment_required_valid',
          )
        const testCompleted =
          publicationDetails?.source.kind === 'x402'
            ? x402ChallengeObserved
            : testObserved
        const stepStates = {
          describe:
            revision === undefined
              ? ('in_progress' as const)
              : ('completed' as const),
          admission:
            publication === undefined
              ? revision === undefined
                ? ('not_started' as const)
                : ('in_progress' as const)
              : ('completed' as const),
          readiness:
            publication === undefined
              ? ('not_started' as const)
              : readyNow
                ? ('completed' as const)
                : readinessValue.outcome === 'unobserved'
                  ? ('in_progress' as const)
                  : ('refused' as const),
          test:
            publication === undefined || !readyNow
              ? ('not_started' as const)
              : testCompleted
                ? ('completed' as const)
                : ('in_progress' as const),
        }
        const currentStep =
          stepStates.describe !== 'completed'
            ? ('describe' as const)
            : stepStates.admission !== 'completed'
              ? ('admission' as const)
              : stepStates.readiness !== 'completed'
                ? ('readiness' as const)
                : ('test' as const)
        const actionableReason =
          publication === undefined
            ? 'admission_unproven'
            : !qualificationRouteable
              ? (qualification?.reasons[0] ??
                lifecycleValue.reasons[0] ??
                'eligibility_integrity_failure')
              : (lifecycleValue.reasons[0] ??
                (readinessValue.outcome === 'unobserved'
                  ? 'health_unobserved'
                  : undefined))
        const source = publicationDetails?.source
        const authority =
          publicationDetails === undefined
            ? undefined
            : {
                mode: publicationDetails.authorityMode,
                kind: publicationDetails.binding.authority.kind,
                ...(publicationDetails.binding.authority.kind ===
                'provider_connection'
                  ? {
                      providerRef:
                        publicationDetails.binding.authority.providerRef,
                      ...(publicationDetails.binding.authoritySnapshot ===
                      undefined
                        ? {}
                        : {
                            authorityGeneration:
                              publicationDetails.binding.authoritySnapshot
                                .authorityGeneration,
                            authorityDigest:
                              publicationDetails.binding.authoritySnapshot
                                .authorityDigest,
                          }),
                    }
                  : {}),
              }
        return {
          offeringRef: offering.offeringRef,
          revision: offering.currentRevision,
          name: revision?.name ?? offering.offeringRef,
          summary: revision?.summary ?? '',
          status: ownerSupplyLiteral(
            offering.status,
            ['draft', 'published', 'paused', 'retired'] as const,
            'offering status',
          ),
          ...(sourceHash === undefined ? {} : { sourceHash }),
          ...(source === undefined ? {} : { source }),
          ...(binding === undefined
            ? {}
            : { endpointUrl: binding.endpointUrl }),
          ...(pricing === undefined ? {} : { pricing }),
          ...(authority === undefined ? {} : { authority }),
          admission: {
            state: binding?.admission ?? 'not_admitted',
            ...(binding?.admission === 'admitted' ||
            actionableReason === undefined
              ? {}
              : { reason: actionableReason }),
          },
          ...(publication === undefined
            ? {}
            : {
                operationRef: publication.operationRef,
                publicationRef: publication.publicationRef,
              }),
          ...(publicationDetails === undefined
            ? {}
            : { publication: publicationDetails }),
          lifecycle: lifecycleForWire,
          readiness: {
            outcome: readinessValue.outcome,
            ...(readinessValue.observedAt === undefined
              ? {}
              : { observedAt: readinessValue.observedAt }),
            ...(readinessValue.validUntil === undefined
              ? {}
              : { validUntil: readinessValue.validUntil }),
            evidenceRefs: readinessValue.evidenceRefs,
          },
          live: {
            available: qualificationRouteable,
            ...(qualificationRouteable
              ? {}
              : {
                  reason: actionableReason ?? 'readiness_unavailable',
                }),
          },
          currentStep,
          stepStates,
          ...(actionableReason === undefined ? {} : { actionableReason }),
          accessPaths: paths.map((path) => ({
            accessPathRef: path.accessPathRef,
            offeringSourceHash: path.offeringSourceHash,
            sourceHash: path.sourceHash,
            status: ownerSupplyLiteral(
              path.status,
              ['draft', 'published', 'withdrawn'] as const,
              'access path status',
            ),
            descriptor: ownerSupplyAccessPathDescriptor(path.descriptor),
          })),
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
