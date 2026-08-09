import { v, type Infer } from 'convex/values'

import { mutation, query } from './_generated/server'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
import { resolveBusinessActor } from './authz'
import { ownsPublishedBusiness, publicationPorts, rebuildCapabilityOriginSupplyProjection } from './capabilitySupply'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import { publishCapabilityCommand, validRegistrationContext } from '@/modules/capability-supply/public'
import {
  isOwnerSupplyStep,
  ownerSupplyAccessPathDescriptor,
  ownerSupplyAccessPathDescriptorValue,
  ownerSupplyLiteral,
  ownerSupplyOptionalNumber,
  ownerSupplyResultStepValue,
  ownerSupplyStepValue,
  ownerSupplyStringArray,
  ownerSupplyValue,
  ownerSupplyValueValidator,
} from '@/modules/capability-supply/owner-supply-validators'

/** Bounded owner readback for the six-step publisher and single-player panel. */
const ownerSupplyFunnelResultValue = v.union(
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    businessId: v.string(),
    business: v.object({ name: v.string(), slug: v.string() }),
    offerings: v.array(v.object({
      offeringRef: v.string(),
      revision: v.number(),
      name: v.string(),
      summary: v.string(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      sourceHash: v.optional(v.string()),
      publicationRef: v.optional(v.string()),
      readiness: v.optional(v.object({
        outcome: v.union(v.literal('unobserved'), v.literal('healthy'), v.literal('unhealthy')),
        validUntil: v.optional(v.number()),
        evidenceRefs: v.array(v.string()),
      })),
      accessPaths: v.array(v.object({
        accessPathRef: v.string(),
        status: v.union(v.literal('draft'), v.literal('published'), v.literal('withdrawn')),
        descriptor: ownerSupplyAccessPathDescriptorValue,
      })),
    })),
    callLog: v.array(v.object({
      eventRef: v.string(),
      offeringRef: v.string(),
      publicationRef: v.optional(v.string()),
      observedAt: v.number(),
      outcome: v.union(v.literal('filled'), v.literal('zero')),
      zeroReason: v.optional(v.union(
        v.literal('no_routeable_supply'), v.literal('readiness_unavailable'),
        v.literal('provider_refused'), v.literal('credential_unavailable'),
        v.literal('price_unavailable'), v.literal('insufficient_credit'),
        v.literal('input_invalid'), v.literal('outcome_unknown'),
      )),
      durationMs: v.optional(v.number()),
      evidenceRefs: v.array(v.string()),
      environment: v.union(v.literal('local'), v.literal('development'), v.literal('sandbox'), v.literal('production')),
    })),
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
type OwnerSupplyFunnelResult = Infer<typeof ownerSupplyFunnelResultValue>
type OwnerSupplyAdvanceResult = Infer<typeof ownerSupplyAdvanceResultValue>
type OwnerSupplyPublishResult = Infer<typeof ownerSupplyPublishResultValue>

const ownerSupplyCompletedValue = v.object({
  step: ownerSupplyStepValue,
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
})
const ownerSupplyPendingValue = v.object({
  step: v.literal('publish'),
  state: v.literal('pending_readiness'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
})
const ownerSupplyAdvanceResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({ step: ownerSupplyResultStepValue, state: v.literal('refused'), refusal: v.literal('authorization_denied') }),
)
const ownerSupplyPublishResultValue = v.union(
  ownerSupplyCompletedValue,
  ownerSupplyPendingValue,
  v.object({
    step: v.literal('publish'),
    state: v.literal('refused'),
    refusal: v.union(
      v.literal('authorization_denied'), v.literal('invalid_offering'), v.literal('revision_changed'),
      v.literal('business_not_registered'), v.literal('contract_invalid'),
      v.literal('contract_too_large'), v.literal('contract_identity_conflict'),
      v.literal('contract_integrity_failure'), v.literal('offering_invalid'),
      v.literal('offering_identity_conflict'), v.literal('offering_integrity_failure'),
      v.literal('binding_invalid'), v.literal('binding_identity_conflict'),
      v.literal('binding_integrity_failure'), v.literal('adapter_not_registered'),
      v.literal('adapter_config_invalid'), v.literal('adapter_config_too_large'),
      v.literal('registration_context_invalid'), v.literal('operation_key_conflict'),
      v.literal('source_invalid'),
    ),
  }),
)
const ownerSupplyInput = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  operationKey: v.string(),
  value: ownerSupplyValueValidator,
}
const ownerSupplyPublishInput = {
  ...ownerSupplyInput,
  sourceHash: v.string(),
}

export const readOwnerSupplyFunnel = query({
  args: {},
  returns: ownerSupplyFunnelResultValue,
  handler: async (ctx): Promise<OwnerSupplyFunnelResult> => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const db = ctx.db
    const owner = await db.query('owners').withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId)).unique()
    if (owner === null) return { kind: 'not_found' as const }
    const business = await db.query('businesses')
      .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
      .order('desc')
      .first()
    if (business === null) return { kind: 'not_found' as const }
    // `businessOfferings.status` is draft|published|paused|retired — there is no
    // 'active'. Filtering on it returned nothing for every owner, so the funnel
    // home always read "No services yet" while /owner/offerings listed the same
    // offerings. Same selection rule as `loadOfferingSourceState` in catalog.ts.
    const [offeringRows, revisions, accessPaths, publications, capabilityOfferings, events] = await Promise.all([
      db.query('businessOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id)).take(50),
      db.query('businessOfferingRevisions').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', business._id)).take(100),
      // Access-path status is draft|published|withdrawn; 'active' never matched.
      db.query('offeringAccessPaths').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id)).take(100),
      db.query('capabilityPublications').withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', business._id).eq('disposition', 'current')).take(50),
      // Keep inactive capability offerings in owner readback so a newly published
      // operation remains visibly pending until the shared lifecycle integrates it.
      db.query('capabilityOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id)).take(50),
      db.query('capabilityCallEvents').withIndex('by_businessId_and_observedAt', (q) => q.eq('businessId', business._id)).order('desc').take(50),
    ])
    const offerings = offeringRows.map((offering) => {
      const revision = revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
      const paths = accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.offeringRevision === offering.currentRevision)
      const capabilityOffering = revision === undefined
        ? undefined
        : capabilityOfferings.find((candidate) => {
            const origin = candidate.origin
            return origin?.kind === 'catalog_offering'
              && origin.offeringRef === offering.offeringRef
              && origin.offeringRevision === offering.currentRevision
              && origin.offeringSourceHash === revision.sourceHash
          })
      const publication = capabilityOffering === undefined ? undefined : publications.find((candidate) => candidate.offeringId === capabilityOffering.offeringId)
      const readiness = publication === undefined
        ? undefined
        : {
            outcome: ownerSupplyLiteral(publication.healthState, ['unobserved', 'healthy', 'unhealthy'] as const, 'readiness outcome'),
            ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
            evidenceRefs: ownerSupplyStringArray(publication.readinessEvidenceRefs, 'readiness evidence'),
          }
      const sourceHash = revision?.sourceHash
      return {
        offeringRef: offering.offeringRef,
        revision: offering.currentRevision,
        name: revision?.name ?? offering.offeringRef,
        summary: revision?.summary ?? '',
        status: ownerSupplyLiteral(offering.status, ['draft', 'published', 'paused', 'retired'] as const, 'offering status'),
        ...(sourceHash === undefined ? {} : { sourceHash }),
        ...(publication === undefined ? {} : {
          publicationRef: publication.publicationRef,
          ...(readiness === undefined ? {} : { readiness }),
        }),
        accessPaths: paths.map((path) => ({
          accessPathRef: path.accessPathRef,
          status: ownerSupplyLiteral(path.status, ['draft', 'published', 'withdrawn'] as const, 'access path status'),
          descriptor: ownerSupplyAccessPathDescriptor(path.descriptor),
        })),
      }
    })
    const fillEvents = events.filter((event) => event.eventKind === 'supply_liquidity_fill_observed')
    const durations = events.flatMap((event) => {
      if (event.eventKind !== 'supply_liquidity_first_success_observed') return []
      const durationMs = ownerSupplyOptionalNumber(event.durationMs, 'duration')
      return durationMs === undefined ? [] : [durationMs]
    }).sort((left, right) => left - right)
    const callLog = fillEvents.map((event) => {
      const zeroReason = event.zeroReason === undefined
        ? undefined
        : ownerSupplyLiteral(event.zeroReason, [
            'no_routeable_supply', 'readiness_unavailable', 'provider_refused', 'credential_unavailable',
            'price_unavailable', 'insufficient_credit', 'input_invalid', 'outcome_unknown',
          ] as const, 'zero reason')
      const durationMs = ownerSupplyOptionalNumber(event.durationMs, 'duration')
      return {
        eventRef: event.eventRef,
        offeringRef: event.offeringRef,
        ...(event.publicationRef === undefined ? {} : { publicationRef: event.publicationRef }),
        observedAt: event.observedAt,
        outcome: ownerSupplyLiteral(event.outcome, ['filled', 'zero'] as const, 'event outcome'),
        ...(zeroReason === undefined ? {} : { zeroReason }),
        ...(durationMs === undefined ? {} : { durationMs }),
        evidenceRefs: ownerSupplyStringArray(event.evidenceRefs, 'event evidence'),
        environment: ownerSupplyLiteral(event.environment, ['local', 'development', 'sandbox', 'production'] as const, 'event environment'),
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
      liquidity: {
        fillCount: callLog.filter((event) => event.outcome === 'filled').length,
        zeroCount: callLog.filter((event) => event.outcome === 'zero').length,
        ...(durations.length === 0 ? {} : { firstSuccessP50Ms: durationsP50, firstSuccessP95Ms: durationsP95 }),
        depthSamples: events.filter((event) => event.eventKind === 'supply_liquidity_depth_observed').length,
        environment: 'development',
      },
    }
  },
})

function ownerSupplyPricing(value: unknown): ExactAmount | undefined {
  const pricing = ownerSupplyValue(ownerSupplyValue(value).pricing)
  if (pricing.version !== 'pricing:v2' || pricing.unit !== 'call') return undefined
  const amount = exactAmountSchema.safeParse(pricing.paidAmount)
  return amount.success ? amount.data : undefined
}

export const advanceOwnerSupplyStep = mutation({
  args: ownerSupplyInput,
  returns: ownerSupplyAdvanceResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyAdvanceResult> => {
    if (!validRegistrationContext({
      operationKey: args.operationKey,
      correlationId: `owner-supply:${args.offeringRef}`,
      reasonCode: 'owner_supply_funnel',
      evidenceRefs: ['owner-supply:funnel'],
    }) || !await ownsPublishedBusiness(ctx, args.businessId)) {
      return { step: 'unknown', state: 'refused', refusal: 'authorization_denied' }
    }
    const value = ownerSupplyValue(args.value)
    const step = isOwnerSupplyStep(value.step) ? value.step : 'endpoint'
    return { step, state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'Step completed.' }
  },
})


/**
 * OWNER PATH IS A DEMO BOUNDARY: this publishes the `ae-demo-services.quote`
 * AE-envelope template (inputs service|postcode|timeout). It does NOT run the
 * curated capability-admission normalizer; real OpenAPI/MCP/x402 admission is
 * the curated/admin admit path. Keep this honest — the owner surface must not
 * imply a bespoke provider integration.
 */
export const publishOwnerCapability = mutation({
  args: ownerSupplyPublishInput,
  returns: ownerSupplyPublishResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyPublishResult> => {
    if (!await ownsPublishedBusiness(ctx, args.businessId)) {
      return { step: 'publish', state: 'refused', refusal: 'authorization_denied' }
    }
    const value = ownerSupplyValue(args.value)
    const endpointConfig = ownerSupplyValue(value.endpoint)
    const endpointUrl = typeof endpointConfig.endpointUrl === 'string' ? endpointConfig.endpointUrl : ''
    const pricing = ownerSupplyPricing(value)
    const [offeringRow, revisionRow] = await Promise.all([
      ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (q) => q.eq('offeringRef', args.offeringRef)).unique(),
      ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', args.offeringRef).eq('revision', args.revision)).unique(),
    ])
    if (offeringRow === null) {
      return { step: 'publish', state: 'refused', refusal: 'invalid_offering' }
    }
    if (offeringRow.businessId !== args.businessId) {
      return { step: 'publish', state: 'refused', refusal: 'invalid_offering' }
    }
    if (offeringRow.currentRevision !== args.revision) {
      return { step: 'publish', state: 'refused', refusal: 'revision_changed' }
    }
    if (revisionRow === null || revisionRow.businessId !== args.businessId) {
      return { step: 'publish', state: 'refused', refusal: 'invalid_offering' }
    }
    if (revisionRow.sourceHash !== args.sourceHash) {
      return { step: 'publish', state: 'refused', refusal: 'revision_changed' }
    }
    if (endpointUrl.length === 0 || pricing === undefined) {
      return { step: 'publish', state: 'refused', refusal: 'invalid_offering' }
    }
    const offeringId = `capability-offering:${args.businessId}:${args.offeringRef}:${args.revision}`
    const bindingId = `capability-binding:${args.businessId}:${args.offeringRef}:${args.revision}`
    const documentJson = JSON.stringify({
      contractFormat: 'ae.capability-contract:v2', capabilityId: 'ae-demo-services.quote', version: 1,
      name: 'AE Demo Services quote', description: 'A bounded quote for a home-office video-call setup.',
      inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { service: { type: 'string' }, postcode: { type: 'string' }, timeout: { type: 'number' } }, required: ['service', 'postcode'], additionalProperties: false },
      outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { kind: { const: 'quoted' }, expectedCost: { type: 'object' }, maximumCost: { type: 'object' }, expectedLatencyMs: { type: 'number' }, dataFields: { type: 'array' }, disclosures: { type: 'array' } }, required: ['kind', 'expectedCost', 'maximumCost', 'expectedLatencyMs', 'dataFields', 'disclosures'], additionalProperties: true },
      customerAnnotations: [{ annotationId: 'service', document: 'input', pointer: '/service', label: 'Service', role: 'request' }, { annotationId: 'postcode', document: 'input', pointer: '/postcode', label: 'Postcode', role: 'request' }, { annotationId: 'quote', document: 'output', pointer: '/expectedLatencyMs', label: 'Expected latency', role: 'completion_evidence' }],
      dataUse: [
        { effectId: 'quote_request', inputPointer: '/service', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_bounded_quote'] },
        { effectId: 'quote_request', inputPointer: '/postcode', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_bounded_quote'] },
        { effectId: 'quote_request', inputPointer: '/timeout', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_bounded_quote'] },
      ],
      effects: [{ effectId: 'quote_request', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
      evidence: [{ evidenceId: 'quote', outputPointer: '/expectedLatencyMs', purpose: 'completion' }],
      lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
    })
    const origin = { kind: 'catalog_offering' as const, offeringRef: args.offeringRef, offeringRevision: args.revision, offeringSourceHash: revisionRow.sourceHash }
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { step: 'publish', state: 'refused', refusal: 'authorization_denied' as const }
    const result = await publishCapabilityCommand({
      businessId: args.businessId, source: { kind: 'ae_envelope', documentJson },
      offering: {
        offeringId, networkId: 'ae-demo-services', origin,
        presentation: { label: 'AE Demo Services', summary: revisionRow.summary, price: { kind: 'fixed', amount: pricing }, materialTerms: [], commercialRelationship: { kind: 'none', summary: 'Direct demo endpoint.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['owner-supply:funnel'] } },
        searchTerms: ['home office', 'video calls', 'quote'], registrationEvidenceRefs: ['owner-supply:funnel'],
      },
      binding: { bindingId, endpointUrl, authority: { kind: 'keyless' }, continuation: { kind: 'single_response', evidenceRefs: ['owner-supply:funnel'] }, cancellation: { kind: 'unsupported', evidenceRefs: ['owner-supply:funnel'] }, adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 10_000 } }, registrationEvidenceRefs: ['owner-supply:funnel'] },

      operationKey: args.operationKey, correlationId: `owner-supply:${args.offeringRef}`, reasonCode: 'owner_supply_funnel', evidenceRefs: ['owner-supply:funnel'], actor: { kind: 'owner', ref: identity.subject }, now: Date.now(),
    }, publicationPorts(ctx))
    if (result.kind === 'refused') return { step: 'publish', state: 'refused', refusal: result.reason }
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, Date.now())
    let integratedAndRouteable = false
    const snapshot = await ctx.db.query('businessSupplyProjectionSnapshots')
      .withIndex('by_businessId', (q) => q.eq('businessId', args.businessId))
      .unique()
    if (snapshot?.status === 'current') {
      try {
        const projection = readBusinessSupplyProjectionSnapshot(
          'projection' in snapshot ? snapshot.projection : snapshot.projectionJson,
          'catalog',
          String(args.businessId),
        )
        const projectedOffering = projection.offerings.find((entry) => (
          entry.offering.offeringRef === args.offeringRef
          && entry.offering.revision === args.revision
        ))
        integratedAndRouteable = projectedOffering?.support.integrated === true
          && projectedOffering?.support.routeable === true
      } catch {
        integratedAndRouteable = false
      }
    }
    if (!integratedAndRouteable) {
      return {
        step: 'publish',
        state: 'pending_readiness',
        offeringRef: args.offeringRef,
        revision: args.revision,
        message: 'Publication saved; admission and readiness must complete before it is live.',
        publicationRef: result.publicationRef,
      }
    }
    return { step: 'publish', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'Your service is live.', publicationRef: result.publicationRef }
  },
})
