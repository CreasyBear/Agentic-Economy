import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import {
  registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite,
} from '@/modules/capability-supply/internal/binding'
import {
  getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule,
  listEligibleCapabilitySupply as listEligibleCapabilitySupplyFromModule,
  listRouteableCapabilitySupply as listRouteableCapabilitySupplyFromModule,
  setCapabilitySupplyEligibility as setCapabilitySupplyEligibilityWrite,
  type EligibilityInput,
} from '@/modules/capability-supply/internal/eligibility'
import {
  queryCapabilityGraph as queryCapabilityGraphFromModule,
  readCapabilityProbeTarget as readCapabilityProbeTargetFromModule,
  recordCapabilityProbeResult as recordCapabilityProbeResultFromModule,
} from '@/modules/capability-supply/internal/graph'
import {
  contractRefFromRow,
  registerCapabilityOffering as registerCapabilityOfferingWrite,
} from '@/modules/capability-supply/internal/offering'
import {
  registerCapabilityBindingCommand as runRegisterBindingCommand,
  registerCapabilityOfferingCommand as runRegisterOfferingCommand,
  quarantineCapabilityBindingCommand as runQuarantineCommand,
  setCapabilitySupplyEligibilityCommand as runSetEligibilityCommand,
  type OperationLedgerPorts,
} from '@/modules/capability-supply/internal/operation-ledger'
import {
  publicationLifecycle,
  publicationProjection,
  publishCapabilityCommand,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
} from '@/modules/capability-supply/internal/publication'
import {
  bindingObservedRowDigest,
} from '@/modules/capability-supply/internal/quarantine'
import {
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
} from '@/modules/capability-supply/internal/shared'

import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery, mutation, query, action, type ActionCtx, type MutationCtx, type QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './catalogSupplyProjection'
import { runtimeDb } from './source_state'

const contractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})
const evidenceRefsValue = v.array(v.string())
const commercialRelationshipValue = v.object({
  kind: v.union(v.literal('none'), v.literal('direct'), v.literal('affiliate'), v.literal('ownership')),
  summary: v.string(),
  influencesEligibility: v.boolean(),
  influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(),
  evidenceRefs: evidenceRefsValue,
})
const priceValue = v.union(
  v.object({ kind: v.literal('fixed'), currency: v.string(), amountMinor: v.number() }),
  v.object({
    kind: v.literal('range'), currency: v.string(),
    minimumAmountMinor: v.number(), maximumAmountMinor: v.number(),
  }),
  v.object({ kind: v.literal('on_request') }),
)
const presentationValue = v.object({
  label: v.string(),
  summary: v.string(),
  price: priceValue,
  materialTerms: v.array(v.object({ termId: v.string(), label: v.string(), value: v.string() })),
  commercialRelationship: commercialRelationshipValue,
})
const offeringOriginValue = v.union(
  v.object({
    kind: v.literal('catalog_offering'),
    offeringRef: v.string(),
    offeringRevision: v.number(),
    offeringSourceHash: v.string(),
    declaredAccessPathRef: v.optional(v.string()),
    accessPathSourceHash: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('standalone') }),
)
const offeringRegistrationValue = v.object({
  offeringId: v.string(),
  businessId: v.id('businesses'),
  networkId: v.string(),
  contractRef: contractRefValue,
  origin: v.optional(offeringOriginValue),
  presentation: presentationValue,
  searchTerms: v.array(v.string()),
  registrationEvidenceRefs: evidenceRefsValue,
})
const continuationValue = v.object({
  kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const cancellationValue = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const bindingRegistrationValue = v.object({
  bindingId: v.string(),
  offeringId: v.string(),
  networkId: v.string(),
  contractRef: contractRefValue,
  endpointUrl: v.string(),
  credentialRef: v.string(),
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: v.object({ adapterId: v.string(), config: v.any() }), // runtime-validated adapter config boundary
  registrationEvidenceRefs: evidenceRefsValue,
})
const capabilityPublicationOfferingValue = v.object({
  offeringId: v.string(),
  networkId: v.string(),
  origin: v.optional(offeringOriginValue),
  presentation: presentationValue,
  searchTerms: v.array(v.string()),
  registrationEvidenceRefs: evidenceRefsValue,
})
const capabilityPublicationBindingValue = v.object({
  bindingId: v.string(),
  endpointUrl: v.string(),
  credentialRef: v.string(),
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: v.object({ adapterId: v.string(), config: v.any() }), // runtime-validated adapter config boundary
  registrationEvidenceRefs: evidenceRefsValue,
})
const contextFields = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: evidenceRefsValue,
}
const offeringFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('offering_invalid'), v.literal('business_not_registered'),
  v.literal('contract_not_found'), v.literal('contract_not_active'), v.literal('contract_integrity_failure'),
  v.literal('offering_identity_conflict'), v.literal('offering_integrity_failure'),
  v.literal('operation_key_conflict'),
)
const bindingFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('binding_invalid'), v.literal('offering_not_found'), v.literal('business_not_registered'),
  v.literal('offering_binding_mismatch'), v.literal('contract_not_found'), v.literal('contract_not_active'),
  v.literal('contract_integrity_failure'), v.literal('adapter_not_registered'),
  v.literal('adapter_config_invalid'), v.literal('adapter_config_too_large'),
  v.literal('binding_identity_conflict'), v.literal('offering_integrity_failure'),
  v.literal('binding_integrity_failure'), v.literal('operation_key_conflict'),
)
const eligibilityFailureReason = v.union(
  v.literal('authorization_denied'), v.literal('registration_context_invalid'),
  v.literal('offering_not_found'), v.literal('binding_not_found'), v.literal('business_not_registered'),
  v.literal('offering_binding_mismatch'), v.literal('registration_changed'),
  v.literal('contract_not_found'), v.literal('contract_not_active'), v.literal('contract_integrity_failure'),
  v.literal('offering_integrity_failure'), v.literal('binding_integrity_failure'),
  v.literal('operation_key_conflict'),
)
const registerOfferingResultValue = v.union(
  v.object({
    kind: v.literal('registered'), offeringId: v.string(), registrationHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: offeringFailureReason }),
)
const registerBindingResultValue = v.union(
  v.object({
    kind: v.literal('registered'), bindingId: v.string(), registrationHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: bindingFailureReason }),
)
const eligibilityResultValue = v.union(
  v.object({
    kind: v.union(v.literal('eligible'), v.literal('ineligible')),
    offeringId: v.string(), bindingId: v.string(), eligibilityHash: v.string(),
  }),
  v.object({ kind: v.literal('refused'), reason: eligibilityFailureReason }),
)
const quarantineResultValue = v.union(
  v.object({ kind: v.literal('quarantined'), bindingId: v.string(), eligibilityHash: v.string() }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'), v.literal('registration_context_invalid'),
      v.literal('binding_not_found'), v.literal('observed_row_changed'), v.literal('operation_key_conflict'),
    ),
  }),
)
const bindingControlStateValue = v.union(
  v.object({
    kind: v.literal('available'), bindingId: v.string(), observedRowDigest: v.string(),
    admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
    conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
  }),
  v.object({ kind: v.literal('unavailable'), reason: v.literal('binding_not_found') }),
  v.object({ kind: v.literal('refused'), reason: v.literal('authorization_denied') }),
)
const eligibleSupplyValue = v.object({
  offering: v.object({
    offeringId: v.string(), businessId: v.string(), networkId: v.string(),
    capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
    origin: v.optional(offeringOriginValue),
    presentation: presentationValue, status: v.literal('active'), registrationHash: v.string(),
  }),
  binding: v.object({
    bindingId: v.string(), offeringId: v.string(), networkId: v.string(),
    capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
    endpointUrl: v.string(), credentialRef: v.string(), continuation: continuationValue,
    cancellation: cancellationValue, adapterId: v.string(), configJson: v.string(), configDigest: v.string(),
    admission: v.literal('admitted'), conformance: v.literal('conformant'), registrationHash: v.string(),
  }),
  publication: v.optional(v.object({
    publicationRef: v.string(), revision: v.number(), readinessValidUntil: v.number(),
  })),
})
const eligibleSupplyResultValue = v.union(
  v.object({ kind: v.literal('available'), supplies: v.array(eligibleSupplyValue) }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('limit_invalid'), v.literal('eligible_supply_limit_exceeded'),
      v.literal('supply_integrity_failure'), v.literal('contract_integrity_failure'),
    ),
  }),
)
const publicationLifecycleValue = v.object({
  state: v.union(v.literal('inactive'), v.literal('active'), v.literal('withdrawn'), v.literal('incompatible')),
  reasons: v.array(v.union(
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
  )),
})
const capabilityPublicationValue = v.object({
  kind: v.literal('published'),
  publicationRef: v.string(),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  lifecycle: publicationLifecycleValue,
})
const capabilityPublicationResultValue = v.union(
  capabilityPublicationValue,
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('business_not_registered'),
      v.literal('contract_invalid'),
      v.literal('contract_too_large'),
      v.literal('contract_identity_conflict'),
      v.literal('contract_integrity_failure'),
      v.literal('offering_invalid'),
      v.literal('offering_identity_conflict'),
      v.literal('offering_integrity_failure'),
      v.literal('binding_invalid'),
      v.literal('binding_identity_conflict'),
      v.literal('binding_integrity_failure'),
      v.literal('adapter_not_registered'),
      v.literal('adapter_config_invalid'),
      v.literal('adapter_config_too_large'),
      v.literal('registration_context_invalid'),
      v.literal('operation_key_conflict'),
      v.literal('source_invalid'),
    ),
  }),
)
const capabilityGraphNodeValue = v.object({
  publicationRef: v.string(), revision: v.number(), businessId: v.id('businesses'),
  contractRef: contractRefValue, offeringId: v.string(), bindingId: v.string(),
  source: v.object({
    kind: v.union(v.literal('ae_envelope'), v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
    digest: v.string(),
  }),
  semantic: v.object({
    capabilityId: v.string(), name: v.string(), description: v.string(),
    inputSchemaDigest: v.string(), outputSchemaDigest: v.string(),
    customerAnnotations: v.array(v.object({
      annotationId: v.string(), semanticIdentity: v.optional(v.string()),
      document: v.union(v.literal('input'), v.literal('output')),
      pointer: v.string(), label: v.string(),
      role: v.union(
        v.literal('request'), v.literal('constraint'), v.literal('comparison'), v.literal('commitment'),
        v.literal('result'), v.literal('completion_evidence'), v.literal('recovery'),
      ),
      inference: v.optional(v.union(v.literal('allowed'), v.literal('customer_required'))),
    })), searchTerms: v.array(v.string()),
  }),
  policy: v.object({
    effects: v.array(v.object({
      effectId: v.string(),
      class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
      authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
      reversibility: v.union(
        v.literal('not_applicable'), v.literal('reversible'), v.literal('conditional'), v.literal('irreversible'),
      ),
    })),
    dataUse: v.array(v.object({
      effectId: v.string(), inputPointer: v.string(),
      classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
      phase: v.union(v.literal('preparation'), v.literal('execution')),
      recipient: v.union(
        v.object({ kind: v.literal('candidate_binding') }),
        v.object({ kind: v.literal('selected_binding') }),
        v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
      ),
      purposes: v.array(v.string()),
    })),
    lifecycle: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
    }),
  }),
  cost: v.object({ price: priceValue, commercialRelationship: commercialRelationshipValue }),
  trust: v.object({
    tier: v.string(),
    publicStatus: v.literal('published'),
    claimStatus: v.literal('published'),
    suppressed: v.literal(false),
    currentlyPublished: v.literal(true),
  }),
  liveness: v.object({
    credentialState: v.union(v.literal('unobserved'), v.literal('ready'), v.literal('unavailable')),
    healthState: v.union(v.literal('unobserved'), v.literal('healthy'), v.literal('unhealthy')),
    observedAt: v.optional(v.number()), validUntil: v.optional(v.number()), stale: v.boolean(),
  }),
  routability: v.object({ eligible: v.boolean(), reasons: v.array(v.string()) }),
  evidenceRefs: v.array(v.string()),
})
const capabilityGraphResultValue = v.union(
  v.object({
    kind: v.literal('available'), nodes: v.array(capabilityGraphNodeValue),
    edges: v.array(v.object({
      kind: v.union(v.literal('published_by'), v.literal('bound_to'), v.literal('schema_compatible')),
      from: v.string(), to: v.string(),
    })),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('query_invalid'), v.literal('authorization_denied'),
      v.literal('graph_limit_exceeded'), v.literal('graph_integrity_failure'),
    ),
  }),
)

type ContractRef = Infer<typeof contractRefValue>

export const publishCapability = mutation({
  args: {
    businessId: v.id('businesses'),
    source: v.any(), // runtime-validated capability publication boundary
    offering: v.optional(capabilityPublicationOfferingValue),
    binding: v.optional(capabilityPublicationBindingValue),
    ...contextFields,
  },
  returns: capabilityPublicationResultValue,
  handler: async (ctx, args) => {
    if (!validRegistrationContext(args)) {
      return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
    }
    if (!await ownsPublishedBusiness(ctx, args.businessId)) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const actor = { kind: 'owner' as const, ref: (await ctx.auth.getUserIdentity())!.subject }
    const result = await publishCapabilityCommand({
      businessId: args.businessId,
      source: args.source,
      offering: args.offering,
      binding: args.binding,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      actor,
      now: Date.now(),
    }, publicationPorts(ctx))
    if (result.kind === 'published') {
      await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, Date.now())
    }
    return result
  },
})

export const readCapabilityPublication = query({
  args: { publicationRef: v.string() },
  returns: v.union(capabilityPublicationValue, v.null()),
  handler: async (ctx, args) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', args.publicationRef)
      )).order('desc').first()
    if (publication === null || !await ownsPublishedBusiness(ctx, publication.businessId)) return null
    if (publication.disposition === 'incompatible') {
      return publicationProjection(
        contractRefFromRow(publication), publication.offeringId, publication.bindingId,
        { state: 'incompatible', reasons: ['incompatible_revision'] },
      )
    }
    const [offering, binding] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', publication.bindingId)).unique(),
    ])
    if (offering === null || binding === null) return null
    return publicationProjection(
      contractRefFromRow(publication), publication.offeringId, publication.bindingId,
      publicationLifecycle(publication, offering, binding, Date.now()),
    )
  },
})

export const observeCapabilityReadiness = internalMutation({
  args: {
    publicationRef: v.string(),
    expectedRevision: v.number(),
    credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
    healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
    validUntil: v.number(),
    ...contextFields,
  },
  returns: v.union(
    v.object({ kind: v.literal('observed'), publicationRef: v.string(), revision: v.number(), lifecycle: publicationLifecycleValue }),
    v.object({ kind: v.literal('refused'), reason: v.union(
      v.literal('authorization_denied'), v.literal('publication_not_found'),
      v.literal('revision_changed'), v.literal('observation_invalid'),
    ) }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    if (!validRegistrationContext(args) || !Number.isSafeInteger(args.expectedRevision)
      || args.validUntil <= now || args.validUntil > now + 86_400_000) {
      return { kind: 'refused' as const, reason: 'observation_invalid' as const }
    }
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)
      )).unique()
    if (publication === null) return { kind: 'refused' as const, reason: 'publication_not_found' as const }
    if (publication.disposition !== 'current') {
      return { kind: 'refused' as const, reason: 'revision_changed' as const }
    }
    await ctx.db.patch(publication._id, {
      credentialState: args.credentialState,
      healthState: args.healthState,
      readinessEvidenceRefs: [...args.evidenceRefs],
      readinessObservedAt: now,
      readinessValidUntil: args.validUntil,
      updatedAt: now,
    })
    const [offering, binding] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', publication.bindingId)).unique(),
    ])
    if (offering === null || binding === null) throw new Error('capability_publication_supply_integrity_failure')
    const result = {
      kind: 'observed' as const,
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: publicationLifecycle({
        ...publication,
        credentialState: args.credentialState,
        healthState: args.healthState,
        readinessValidUntil: args.validUntil,
      }, offering, binding, now),
    }
    await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId, now)
    return result
  },
})

/** Dev-only: force all current capability publications to ready/healthy so routeable supply
 * exists without reachable sandbox provider endpoints (the readiness probe would mark them
 * unhealthy in local dev). Rebuilds the origin supply projection for each affected business. */
export const seedHealthyPublications = internalMutation({
  args: {},
  returns: v.object({ updated: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const publications = await ctx.db.query('capabilityPublications').take(256)
    let updated = 0
    for (const publication of publications) {
      if (publication.disposition !== 'current') continue
      await ctx.db.patch(publication._id, {
        credentialState: 'ready',
        healthState: 'healthy',
        readinessEvidenceRefs: ['seed:healthy-supply'],
        readinessObservedAt: now,
        readinessValidUntil: now + 3_600_000,
        updatedAt: now,
      })
      await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId, now)
      updated += 1
    }
    return { updated }
  },
})

const probeOutcomeValue = v.union(
  v.literal('healthy'), v.literal('credential_unavailable'), v.literal('credential_rejected'),
  v.literal('target_not_public'), v.literal('transport_unreachable'), v.literal('http_redirect'),
  v.literal('http_4xx'), v.literal('http_5xx'), v.literal('response_content_type_invalid'),
  v.literal('response_too_large'), v.literal('response_invalid'),
)

export const readCapabilityProbeTarget = internalQuery({
  args: { publicationRef: v.string(), expectedRevision: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('unavailable') }),
    v.object({
      kind: v.literal('available'),
      target: v.object({
        publicationRef: v.string(), revision: v.number(), bindingId: v.string(), capabilityId: v.string(),
        endpointUrl: v.string(), credentialRef: v.string(), adapterId: v.string(),
        probeKind: v.union(v.literal('ae_quote'), v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
        targetDigest: v.string(),
      }),
    }),
  ),
  handler: async (ctx, args) => (
    await readCapabilityProbeTargetFromModule(capabilitySupplyGraphPorts(ctx.db), args)
  ),
})

export const recordCapabilityProbeResult = internalMutation({
  args: { publicationRef: v.string(), expectedRevision: v.number(), targetDigest: v.string(), outcome: probeOutcomeValue },
  returns: v.union(
    v.object({ kind: v.literal('observed'), publicationRef: v.string(), revision: v.number(), lifecycle: publicationLifecycleValue }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(v.literal('revision_changed'), v.literal('target_changed')),
    }),
  ),
  handler: async (ctx, args) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)
      )).unique()
    const result = await recordCapabilityProbeResultFromModule(capabilitySupplyGraphPorts(ctx.db), args)
    if (result.kind === 'observed' && publication !== null) {
      await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId as Id<'businesses'>, Date.now())
    }
    return result
  },
})

export const withdrawCapability = mutation({
  args: { publicationRef: v.string(), expectedRevision: v.number(), ...contextFields },
  returns: v.union(
    v.object({ kind: v.literal('withdrawn'), publicationRef: v.string(), revision: v.number(), lifecycle: publicationLifecycleValue }),
    v.object({ kind: v.literal('refused'), reason: v.union(
      v.literal('authorization_denied'), v.literal('publication_not_found'), v.literal('revision_changed'),
    ) }),
  ),
  handler: async (ctx, args) => {
    const ports = publicationPorts(ctx)
    const publication = await ports.loadPublicationAtRevision(
      args.publicationRef,
      args.expectedRevision,
    )
    if (publication === null) {
      return { kind: 'refused' as const, reason: 'publication_not_found' as const }
    }
    if (!await ownsPublishedBusiness(ctx, publication.businessId as Id<'businesses'>)) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const result = await withdrawCapabilityCommand({
      publication,
      evidenceRefs: args.evidenceRefs,
      now: Date.now(),
    }, ports)
    if (result.kind === 'withdrawn') {
      await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId as Id<'businesses'>, Date.now())
    }
    return result
  },
})

export const refreshCapability = mutation({
  args: {
    publicationRef: v.string(),
    expectedRevision: v.number(),
    source: v.any(), // runtime-validated capability publication boundary
    offering: v.optional(capabilityPublicationOfferingValue),
    binding: v.optional(capabilityPublicationBindingValue),
    ...contextFields,
  },
  returns: v.union(
    v.object({
      kind: v.literal('refreshed'), publicationRef: v.string(), revision: v.number(),
      disposition: v.union(v.literal('current'), v.literal('incompatible')),
      lifecycle: publicationLifecycleValue,
    }),
    v.object({ kind: v.literal('refused'), reason: v.union(
      v.literal('authorization_denied'), v.literal('publication_not_found'),
      v.literal('revision_changed'), v.literal('refresh_invalid'),
    ) }),
  ),
  handler: async (ctx, args) => {
    if (!validRegistrationContext(args)) {
      return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
    }
    const ports = publicationPorts(ctx)
    const publication = await ports.loadPublicationAtRevision(
      args.publicationRef,
      args.expectedRevision,
    )
    if (publication === null) {
      return { kind: 'refused' as const, reason: 'publication_not_found' as const }
    }
    if (!await ownsPublishedBusiness(ctx, publication.businessId as Id<'businesses'>)) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const result = await refreshCapabilityCommand({
      publication,
      source: args.source,
      offering: args.offering,
      binding: args.binding,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      now: Date.now(),
    }, ports)
    if (result.kind === 'refreshed') {
      await rebuildCapabilityOriginSupplyProjection(ctx, publication.businessId as Id<'businesses'>, Date.now())
    }
    return result
  },
})

export const queryCapabilityGraph = query({
  args: { networkId: v.string(), includeInactive: v.boolean(), limit: v.number() },
  returns: capabilityGraphResultValue,
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      const authority = await resolveAdminAuthority(
        { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
      )
      if (authority.kind !== 'allowed') {
        return { kind: 'unavailable' as const, reason: 'authorization_denied' as const }
      }
    }
    return await queryCapabilityGraphFromModule(capabilitySupplyGraphPorts(ctx.db), args) as Infer<typeof capabilityGraphResultValue>
  },
})

export const registerOffering = mutation({
  args: { registration: offeringRegistrationValue, ...contextFields },
  returns: registerOfferingResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityOfferingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      registration: args.registration,
      context: args,
    }, Date.now()) as Infer<typeof registerOfferingResultValue>
  },
})

export const registerBinding = mutation({
  args: { registration: bindingRegistrationValue, ...contextFields },
  returns: registerBindingResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      registration: args.registration,
      context: args,
    }, Date.now()) as Infer<typeof registerBindingResultValue>
  },
})

export const setEligibility = mutation({
  args: {
    offeringId: v.string(), bindingId: v.string(), contractRef: contractRefValue,
    decision: v.union(v.literal('admit'), v.literal('revoke')),
    expectedOfferingRegistrationHash: v.string(), expectedBindingRegistrationHash: v.string(),
    admissionEvidenceRefs: evidenceRefsValue, conformanceEvidenceRefs: evidenceRefsValue,
    ...contextFields,
  },
  returns: eligibilityResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const now = Date.now()
    const result = await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      eligibility: args,
      context: args,
    }, now) as Infer<typeof eligibilityResultValue>
    if (result.kind === 'eligible' || result.kind === 'ineligible') {
      await rebuildCapabilityOfferingOriginSupplyProjection(ctx, args.offeringId, now)
    }
    return result
  },
})

export const inspectBindingControlState = query({
  args: { bindingId: v.string() },
  returns: bindingControlStateValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) => index.eq('bindingId', args.bindingId)).unique()
    if (binding === null) return { kind: 'unavailable' as const, reason: 'binding_not_found' as const }
    return {
      kind: 'available' as const, bindingId: binding.bindingId,
      observedRowDigest: bindingObservedRowDigest(binding),
      admission: binding.admission, conformance: binding.conformance,
    }
  },
})

export const quarantineBinding = mutation({
  args: { bindingId: v.string(), expectedObservedRowDigest: v.string(), ...contextFields },
  returns: quarantineResultValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) => index.eq('bindingId', args.bindingId)).unique()
    const now = Date.now()
    const result = await quarantineCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      bindingId: args.bindingId, expectedObservedRowDigest: args.expectedObservedRowDigest,
      context: args,
    }, now)
    if (result.kind === 'quarantined' && binding !== null) {
      await rebuildCapabilityOfferingOriginSupplyProjection(ctx, binding.offeringId, now)
    }
    return result
  },
})

export const listEligible = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) => await listEligibleCapabilitySupply(ctx.db, args) as Infer<typeof eligibleSupplyResultValue>,
})

export const listRouteable = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) => await listRouteableCapabilitySupply(ctx.db, args) as Infer<typeof eligibleSupplyResultValue>,
})

export async function registerCapabilityOfferingCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; registration: unknown; context: RegistrationContext }>,
  now: number,
) {
  return runRegisterOfferingCommand(portsFor(db), command, now)
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; registration: unknown; context: RegistrationContext }>,
  now: number,
) {
  return runRegisterBindingCommand(portsFor(db), command, now)
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  now: number,
) {
  return runSetEligibilityCommand(portsFor(db), command, now)
}

export async function quarantineCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  return runQuarantineCommand(portsFor(db), command, now)
}

export async function registerCapabilityOffering(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  return registerCapabilityOfferingWrite(capabilitySupplyWriterPorts(db), input, registeredAt)
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  return registerCapabilityTransportBindingWrite(capabilitySupplyWriterPorts(db), input, registeredAt)
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  return setCapabilitySupplyEligibilityWrite(capabilitySupplyWriterPorts(db), input, updatedAt)
}

export async function listEligibleCapabilitySupply(
  db: QueryCtx['db'], input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  return listEligibleCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
}

export async function listRouteableCapabilitySupply(
  db: QueryCtx['db'], input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  return listRouteableCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
}

export async function getEligibleExactCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{
    networkId: string; businessId: string; offeringId: string; bindingId: string
    contractRef: ContractRef
    expectedOfferingRegistrationHash: string; expectedBindingRegistrationHash: string
  }>,
) {
  return getEligibleExactCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
}

async function ownsPublishedBusiness(
  ctx: Pick<MutationCtx | QueryCtx, 'auth' | 'db'>,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return false
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false
  const owner = await ctx.db.get(business.ownerId)
  return owner !== null && owner.clerkUserId === identity.subject
}

async function publishedBusiness(db: QueryCtx['db'], businessId: string | Id<'businesses'>) {
  const business = await db.get(businessId as Id<'businesses'>)
  return business !== null
    && business.publicStatus === 'published'
    && business.claimStatus === 'published'
    && business.suppressedAt === undefined
    ? business
    : null
}

function portsFor(db: MutationCtx['db']): OperationLedgerPorts {
  return capabilitySupplyOperationPorts(db, {
    registerOffering: (registration, now) => registerCapabilityOffering(db, registration, now),
    registerBinding: (registration, now) => registerCapabilityTransportBinding(db, registration, now),
    setEligibility: (eligibility, now) => setCapabilitySupplyEligibility(db, eligibility, now),
  })
}

async function rebuildCapabilityOriginSupplyProjection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  now: number,
): Promise<void> {
  const db = runtimeDb(ctx.db)
  const supportByOfferingRef = await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand(
    db,
    businessId,
    supportByOfferingRef,
    now,
  )
}

async function rebuildCapabilityOfferingOriginSupplyProjection(
  ctx: MutationCtx,
  offeringId: string,
  now: number,
): Promise<void> {
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', offeringId)).unique()
  if (offering?.origin?.kind !== 'catalog_offering') return
  await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId as Id<'businesses'>, now)
}
/** Bounded owner readback for the six-step publisher and single-player panel. */
export const readOwnerSupplyFunnel = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'error' as const, code: 'unauthenticated' as const }
    const db = ctx.db
    const owner = await db.query('owners').withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', actor.clerkUserId)).unique()
    if (owner === null) return { kind: 'not_found' as const }
    const business = (await db.query('businesses').withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id)).order('desc').take(1))[0]
    if (business === undefined) return { kind: 'not_found' as const }
    const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id).eq('status', 'active')).take(50)
    const [revisions, accessPaths, publications, capabilityOfferings, events] = await Promise.all([
      db.query('businessOfferingRevisions').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', business._id)).take(100),
      db.query('offeringAccessPaths').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id).eq('status', 'active')).take(100),
      db.query('capabilityPublications').withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', business._id).eq('disposition', 'current')).take(50),
      db.query('capabilityOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id).eq('status', 'active')).take(50),
      db.query('capabilityCallEvents').withIndex('by_businessId_and_observedAt', (q) => q.eq('businessId', business._id)).order('desc').take(50),
    ])
    const offerings = offeringRows.map((offering) => {
      const revision = revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
      const paths = accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.offeringRevision === offering.currentRevision)
      const capabilityOffering = capabilityOfferings.find((candidate) => candidate.origin?.kind === 'catalog_offering' && candidate.origin.offeringRef === offering.offeringRef)
      const publication = capabilityOffering === undefined ? undefined : publications.find((candidate) => candidate.offeringId === capabilityOffering.offeringId)
      return {
        offeringRef: offering.offeringRef, revision: offering.currentRevision, name: revision?.name ?? offering.offeringRef,
        summary: revision?.summary ?? '', status: offering.status,
        ...(revision?.sourceHash === undefined ? {} : { sourceHash: revision.sourceHash }),
        ...(publication === undefined ? {} : { publicationRef: publication.publicationRef, readiness: { outcome: publication.healthState, ...(publication.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }), evidenceRefs: publication.readinessEvidenceRefs } }),
        accessPaths: paths.map((path) => ({ accessPathRef: path.accessPathRef, status: path.status, descriptor: path.descriptor })),
      }
    })
    const fillEvents = events.filter((event) => event.eventKind === 'supply_liquidity_fill_observed')
    const durations = events.flatMap((event) => event.eventKind === 'supply_liquidity_first_success_observed' && event.durationMs !== undefined ? [event.durationMs] : []).sort((left, right) => left - right)
    return {
      kind: 'available' as const,
      businessId: business._id,
      business: { name: business.name, slug: business.slug },
      offerings,
      callLog: fillEvents.map((event) => ({ eventRef: event.eventRef, offeringRef: event.offeringRef, ...(event.publicationRef === undefined ? {} : { publicationRef: event.publicationRef }), observedAt: event.observedAt, outcome: event.outcome, ...(event.zeroReason === undefined ? {} : { zeroReason: event.zeroReason }), ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }), evidenceRefs: event.evidenceRefs, environment: event.environment })),
      liquidity: { fillCount: fillEvents.filter((event) => event.outcome === 'filled').length, zeroCount: fillEvents.filter((event) => event.outcome === 'zero').length, ...(durations.length === 0 ? {} : { firstSuccessP50Ms: durations[Math.floor((durations.length - 1) * 0.5)], firstSuccessP95Ms: durations[Math.floor((durations.length - 1) * 0.95)] }), depthSamples: events.filter((event) => event.eventKind === 'supply_liquidity_depth_observed').length, environment: 'development' as const },
    }
  },
})

export const recordCapabilityCallEvent = internalMutation({
  args: {
    eventRef: v.string(),
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    publicationRef: v.optional(v.string()),
    taskDigest: v.string(),
    eventKind: v.union(v.literal('supply_liquidity_fill_observed'), v.literal('supply_liquidity_first_success_observed'), v.literal('supply_liquidity_depth_observed')),
    outcome: v.union(v.literal('filled'), v.literal('zero')),
    zeroReason: v.optional(v.union(v.literal('no_routeable_supply'), v.literal('readiness_unavailable'), v.literal('provider_refused'), v.literal('credential_unavailable'), v.literal('price_unavailable'), v.literal('insufficient_credit'), v.literal('input_invalid'), v.literal('outcome_unknown'))),
    taskStartedAt: v.optional(v.number()),
    successfulAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    eligibleDepth: v.optional(v.number()),
    observedAt: v.number(),
    evidenceRefs: v.array(v.string()),
    environment: v.union(v.literal('local'), v.literal('development'), v.literal('sandbox'), v.literal('production')),
  },
  returns: v.union(v.object({ kind: v.literal('recorded') }), v.object({ kind: v.literal('replayed') })),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('capabilityCallEvents').withIndex('by_eventRef', (index) => index.eq('eventRef', args.eventRef)).unique()
    if (existing !== null) return { kind: 'replayed' as const }
    await ctx.db.insert('capabilityCallEvents', args)
    return { kind: 'recorded' as const }
  },
})

function publicationPorts(ctx: MutationCtx) {
  return capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (registration, now) => registerCapabilityOffering(ctx.db, registration, now),
    registerBinding: (registration, now) => registerCapabilityTransportBinding(ctx.db, registration, now),
    setEligibility: (eligibility, now) => setCapabilitySupplyEligibility(ctx.db, eligibility, now),
  })
}
const ownerSupplyInput = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  operationKey: v.string(),
  value: v.any(),
}
export const authorizeOwnerSupplyAction = internalQuery({
  args: { businessId: v.id('businesses') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    return actor.kind === 'authenticated_owner' && await ownsPublishedBusiness(ctx, args.businessId)
  },
})

async function isOwnerSupplyActionAuthorized(ctx: ActionCtx, businessId: Id<'businesses'>): Promise<boolean> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return false
  return await ctx.runQuery(internal.capabilitySupply.authorizeOwnerSupplyAction, { businessId })
}

function ownerSupplyValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function ownerSupplyEndpoint(value: unknown): { kind: 'available'; url: URL } | { kind: 'refused'; refusal: 'target_not_public' } {
  const endpoint = ownerSupplyValue(ownerSupplyValue(value).endpoint)
  const endpointUrl = typeof endpoint.endpointUrl === 'string' ? endpoint.endpointUrl : ''
  try {
    const url = new URL(endpointUrl)
    if (url.protocol !== 'https:' || !isPublicOwnerTarget(url.hostname)) return { kind: 'refused', refusal: 'target_not_public' }
    return { kind: 'available', url }
  } catch {
    return { kind: 'refused', refusal: 'target_not_public' }
  }
}

function isPublicOwnerTarget(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === 'local' || host.endsWith('.local') || host.endsWith('.internal')) return false
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [first = -1, second = -1] = parts
  return first !== 0 && first !== 10 && first !== 127 && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31) && !(first === 192 && second === 168)
}

function ownerSupplyPricing(value: unknown): { currency: string; amountMinor: number } | undefined {
  const pricing = ownerSupplyValue(ownerSupplyValue(value).pricing)
  const currency = typeof pricing.currency === 'string' ? pricing.currency : ''
  const amountMinor = pricing.paidAmountMinor
  return currency.length > 0 && typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor >= 0
    ? { currency, amountMinor }
    : undefined
}
function ownerSupplyHttpRefusal(status: number): 'http_redirect' | 'http_4xx' | 'http_5xx' {
  if (status >= 300 && status < 400) return 'http_redirect'
  return status >= 500 ? 'http_5xx' : 'http_4xx'
}

export const advanceOwnerSupplyStep = mutation({
  args: ownerSupplyInput,
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!validRegistrationContext({
      operationKey: args.operationKey,
      correlationId: `owner-supply:${args.offeringRef}`,
      reasonCode: 'owner_supply_funnel',
      evidenceRefs: ['owner-supply:funnel'],
    }) || !await ownsPublishedBusiness(ctx, args.businessId)) {
      return { step: 'unknown', state: 'refused', refusal: 'authorization_denied' }
    }
    const value = typeof args.value === 'object' && args.value !== null ? args.value as Record<string, unknown> : {}
    const step = typeof value.step === 'string' ? value.step : 'endpoint'
    return { step, state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'Step completed.' }
  },
})

export const runOwnerSupplyReadiness = action({
  args: ownerSupplyInput,
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'readiness', state: 'refused', refusal: 'authorization_denied' }
    }
    const endpoint = ownerSupplyEndpoint(args.value)
    if (endpoint.kind === 'refused') return { step: 'readiness', state: 'refused', refusal: endpoint.refusal }
    try {
      const response = await fetch(endpoint.url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      if (response.status < 200 || response.status >= 300) {
        return { step: 'readiness', state: 'refused', refusal: ownerSupplyHttpRefusal(response.status) }
      }
      return { step: 'readiness', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'The public endpoint responded successfully.' }
    } catch {
      return { step: 'readiness', state: 'refused', refusal: 'transport_unreachable' }
    }
  },
})

export const runOwnerSupplyTest = action({
  args: ownerSupplyInput,
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!await isOwnerSupplyActionAuthorized(ctx, args.businessId)) {
      return { step: 'test', state: 'refused', refusal: 'authorization_denied' }
    }
    const endpoint = ownerSupplyEndpoint(args.value)
    if (endpoint.kind === 'refused') return { step: 'test', state: 'refused', refusal: endpoint.refusal }
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ service: 'home-office-video-setup', postcode: '5003', timeout: 30 }),
        redirect: 'manual', signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return { step: 'test', state: 'refused', refusal: ownerSupplyHttpRefusal(response.status) }
      const body = await response.json() as { kind?: string }
      if (body.kind !== 'quoted') return { step: 'test', state: 'refused', refusal: 'response_invalid' }
      return { step: 'test', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'A real quote was returned by your endpoint.' }
    } catch {
      return { step: 'test', state: 'refused', refusal: 'transport_unreachable' }
    }
  },
})

export const publishOwnerCapability = mutation({
  args: ownerSupplyInput,
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!await ownsPublishedBusiness(ctx, args.businessId)) {
      return { step: 'publish', state: 'refused', refusal: 'authorization_denied' }
    }
    const value = ownerSupplyValue(args.value)
    const endpointConfig = ownerSupplyValue(value.endpoint)
    const endpointUrl = typeof endpointConfig.endpointUrl === 'string' ? endpointConfig.endpointUrl : ''
    const pricing = ownerSupplyPricing(value)
    const offeringRow = await ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (q) => q.eq('offeringRef', args.offeringRef)).unique()
    const revisionRow = await ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (q) => q.eq('offeringRef', args.offeringRef).eq('revision', args.revision)).unique()
    if (offeringRow === null || offeringRow.businessId !== args.businessId || revisionRow === null || revisionRow.businessId !== args.businessId || endpointUrl.length === 0 || pricing === undefined) {
      return { step: 'publish', state: 'refused', refusal: 'invalid_offering' }
    }
    const offeringId = `capability-offering:${args.businessId}:${args.offeringRef}:${args.revision}`
    const bindingId = `capability-binding:${args.businessId}:${args.offeringRef}:${args.revision}`
    const documentJson = JSON.stringify({
      contractFormat: 'ae.capability-contract:v2', capabilityId: 'ae-demo-services.quote', version: 1,
      name: 'AE Demo Services quote', description: 'A bounded quote for a home-office video-call setup.',
      inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { service: { type: 'string' }, postcode: { type: 'string' }, timeout: { type: 'number' } }, required: ['service', 'postcode'], additionalProperties: false },
      outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { kind: { const: 'quoted' }, expectedCost: { type: 'object' }, maximumCost: { type: 'object' }, expectedLatencyMs: { type: 'number' }, dataFields: { type: 'array' }, disclosures: { type: 'array' } }, required: ['kind', 'expectedCost', 'maximumCost', 'expectedLatencyMs', 'dataFields', 'disclosures'], additionalProperties: true },
      customerAnnotations: [{ annotationId: 'service', document: 'input', pointer: '/service', label: 'Service', role: 'request' }, { annotationId: 'quote', document: 'output', pointer: '/', label: 'Quote', role: 'completion_evidence' }],
      dataUse: [{ effectId: 'quote_request', inputPointer: '/service', classification: 'public', phase: 'execution', recipient: { kind: 'selected_binding' }, purposes: ['return_bounded_quote'] }],
      effects: [{ effectId: 'quote_request', class: 'data_release', authority: 'explicit', reversibility: 'irreversible' }],
      evidence: [{ evidenceId: 'quote', outputPointer: '/', purpose: 'completion' }],
      lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
    })
    const origin = { kind: 'catalog_offering' as const, offeringRef: args.offeringRef, offeringRevision: args.revision, offeringSourceHash: revisionRow.sourceHash }
    const result = await publishCapabilityCommand({
      businessId: args.businessId, source: { kind: 'ae_envelope', documentJson },
      offering: {
        offeringId, networkId: 'ae-demo-services', origin,
        presentation: { label: 'AE Demo Services', summary: revisionRow.summary, price: { kind: 'fixed', currency: pricing.currency, amountMinor: pricing.amountMinor }, materialTerms: [], commercialRelationship: { kind: 'none', summary: 'Direct demo endpoint.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['owner-supply:funnel'] } },
        searchTerms: ['home office', 'video calls', 'quote'], registrationEvidenceRefs: ['owner-supply:funnel'],
      },
      binding: { bindingId, endpointUrl, credentialRef: 'none', continuation: { kind: 'single_response', evidenceRefs: ['owner-supply:funnel'] }, cancellation: { kind: 'unsupported', evidenceRefs: ['owner-supply:funnel'] }, adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 10_000 } }, registrationEvidenceRefs: ['owner-supply:funnel'] },
      operationKey: args.operationKey, correlationId: `owner-supply:${args.offeringRef}`, reasonCode: 'owner_supply_funnel', evidenceRefs: ['owner-supply:funnel'], actor: { kind: 'owner', ref: (await ctx.auth.getUserIdentity())!.subject }, now: Date.now(),
    }, publicationPorts(ctx))
    if (result.kind === 'refused') return { step: 'publish', state: 'refused', refusal: result.reason }
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, Date.now())
    return { step: 'publish', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'Your service is live.', publicationRef: result.publicationRef }
  },
})
