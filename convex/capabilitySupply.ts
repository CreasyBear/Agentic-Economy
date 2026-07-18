import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import {
  bindingIntegrityIsValid,
  registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite,
} from '@/modules/capability-supply/internal/binding'
import {
  bindingEligibilityIsValid,
  getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule,
  listEligibleCapabilitySupply as listEligibleCapabilitySupplyFromModule,
  MAX_ELIGIBLE_SUPPLY,
  offeringEligibilityIsValid,
  setCapabilitySupplyEligibility as setCapabilitySupplyEligibilityWrite,
  type EligibilityInput,
} from '@/modules/capability-supply/internal/eligibility'
import {
  contractRefFromRow,
  offeringIntegrityIsValid,
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
  MAX_CONTEXT_VALUE_LENGTH,
  boundedTrimmed,
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
} from '@/modules/capability-supply/internal/shared'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { type StableHashValue } from '@/modules/common/stable-hash'

import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import {
  getActiveExactCapabilityContract,
  getExactRegisteredCapabilityContract,
} from './capabilityContractDocuments'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'

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
const offeringRegistrationValue = v.object({
  offeringId: v.string(),
  businessId: v.id('businesses'),
  networkId: v.string(),
  contractRef: contractRefValue,
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
    offeringId: v.string(), businessId: v.id('businesses'), networkId: v.string(),
    capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
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
  trust: v.object({ tier: v.string(), publicStatus: v.string() }),
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
    return await publishCapabilityCommand({
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
    return {
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
  },
})

const probeOutcomeValue = v.union(
  v.literal('healthy'), v.literal('credential_unavailable'), v.literal('credential_rejected'),
  v.literal('target_not_public'), v.literal('transport_unreachable'), v.literal('http_redirect'),
  v.literal('http_4xx'), v.literal('http_5xx'), v.literal('response_content_type_invalid'),
  v.literal('response_too_large'), v.literal('response_invalid'),
)

function probeTargetDigest(
  publication: Doc<'capabilityPublications'>,
  offering: Doc<'capabilityOfferings'>,
  binding: Doc<'capabilityTransportBindings'>,
) {
  return canonicalDigest({
    publicationRef: publication.publicationRef, revision: publication.revision,
    bindingId: binding.bindingId, capabilityId: publication.capabilityId,
    endpointUrl: binding.endpointUrl, credentialRef: binding.credentialRef,
    adapterId: binding.adapterId, configDigest: binding.configDigest,
    offeringRegistrationHash: offering.registrationHash, offeringEligibilityHash: offering.eligibilityHash,
    offeringStatus: offering.status, bindingRegistrationHash: binding.registrationHash,
    bindingEligibilityHash: binding.eligibilityHash, bindingAdmission: binding.admission,
    bindingConformance: binding.conformance, businessId: publication.businessId,
    contractDigest: publication.contractDigest,
  })
}

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
  handler: async (ctx, args) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (q) => q.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)).unique()
    if (publication === null || publication.disposition !== 'current') return { kind: 'unavailable' as const }
    const [offering, binding, business, contract] = await Promise.all([
      ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId)).unique(),
      publishedBusiness(ctx.db, publication.businessId),
      getActiveExactCapabilityContract(ctx.db, contractRefFromRow(publication)),
    ])
    if (offering === null || binding === null || business === null || contract.kind !== 'found'
      || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
      || !offeringIntegrityIsValid(offering) || !bindingIntegrityIsValid(binding)
      || offering.offeringId !== publication.offeringId || binding.offeringId !== offering.offeringId) {
      return { kind: 'unavailable' as const }
    }
    return { kind: 'available' as const, target: {
      publicationRef: publication.publicationRef, revision: publication.revision,
      bindingId: binding.bindingId, capabilityId: publication.capabilityId,
      endpointUrl: binding.endpointUrl, credentialRef: binding.credentialRef,
      adapterId: binding.adapterId,
      probeKind: publication.sourceKind === 'mcp' ? 'mcp' as const
        : publication.sourceKind === 'openapi_http' ? 'openapi_http' as const
        : publication.sourceKind === 'x402' ? 'x402' as const : 'ae_quote' as const,
      targetDigest: probeTargetDigest(publication, offering, binding),
    } }
  },
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
      .withIndex('by_publicationRef_and_revision', (q) => q.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)).unique()
    if (publication === null || publication.disposition !== 'current') return { kind: 'refused' as const, reason: 'revision_changed' as const }
    const [binding, offering, business, contract] = await Promise.all([
      ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId)).unique(),
      ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (q) => q.eq('offeringId', publication.offeringId)).unique(),
      publishedBusiness(ctx.db, publication.businessId),
      getActiveExactCapabilityContract(ctx.db, contractRefFromRow(publication)),
    ])
    if (binding === null || offering === null || business === null || contract.kind !== 'found'
      || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
      || !offeringIntegrityIsValid(offering) || !bindingIntegrityIsValid(binding)
      || probeTargetDigest(publication, offering, binding) !== args.targetDigest) {
      return { kind: 'refused' as const, reason: 'target_changed' as const }
    }
    const now = Date.now()
    const healthy = args.outcome === 'healthy'
    const credentialState = args.outcome === 'credential_unavailable' || args.outcome === 'credential_rejected' ? 'unavailable' as const : 'ready' as const
    const healthState = healthy ? 'healthy' as const : 'unhealthy' as const
    const validUntil = now + (healthy ? 5 * 60_000 : 60_000)
    await ctx.db.patch(publication._id, {
      credentialState, healthState, readinessObservedAt: now, readinessValidUntil: validUntil,
      readinessEvidenceRefs: [`probe:${args.outcome}`], updatedAt: now,
    })
    return { kind: 'observed' as const, publicationRef: publication.publicationRef, revision: publication.revision,
      lifecycle: publicationLifecycle({ ...publication, credentialState, healthState, readinessObservedAt: now, readinessValidUntil: validUntil }, offering, binding, now) }
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
    return await withdrawCapabilityCommand({
      publication,
      evidenceRefs: args.evidenceRefs,
      now: Date.now(),
    }, ports)
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
    return await refreshCapabilityCommand({
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
  },
})

export const queryCapabilityGraph = query({
  args: { networkId: v.string(), includeInactive: v.boolean(), limit: v.number() },
  returns: capabilityGraphResultValue,
  handler: async (ctx, args) => {
    if (!boundedTrimmed(args.networkId, MAX_CONTEXT_VALUE_LENGTH)
      || !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > MAX_ELIGIBLE_SUPPLY) {
      return { kind: 'unavailable' as const, reason: 'query_invalid' as const }
    }
    if (args.includeInactive) {
      const authority = await resolveAdminAuthority(
        { db: ctx.db as never, auth: ctx.auth }, 'register_capability_supply',
      )
      if (authority.kind !== 'allowed') {
        return { kind: 'unavailable' as const, reason: 'authorization_denied' as const }
      }
    }
    const publications = await ctx.db.query('capabilityPublications')
      .withIndex('by_networkId_and_disposition', (index) => (
        index.eq('networkId', args.networkId).eq('disposition', 'current')
      )).take(args.limit + 1)
    if (publications.length > args.limit) {
      return { kind: 'unavailable' as const, reason: 'graph_limit_exceeded' as const }
    }
    const nodes = []
    for (const publication of publications.sort((left, right) => left.publicationRef.localeCompare(right.publicationRef))) {
      const offering = await ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId)).unique()
      const binding = await ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', publication.bindingId)).unique()
      const business = await publishedBusiness(ctx.db, publication.businessId)
      const contract = await getExactRegisteredCapabilityContract(ctx.db, contractRefFromRow(publication))
      if (offering === null || binding === null || business === null || contract.kind !== 'found'
        || !offeringIntegrityIsValid(offering) || !bindingIntegrityIsValid(binding)
        || !offeringEligibilityIsValid(offering) || !bindingEligibilityIsValid(binding)) {
        return { kind: 'unavailable' as const, reason: 'graph_integrity_failure' as const }
      }
      const lifecycle = publicationLifecycle(publication, offering, binding, Date.now())
      if (!args.includeInactive && lifecycle.state !== 'active') continue
      nodes.push({
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        businessId: publication.businessId,
        contractRef: contractRefFromRow(publication),
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        source: { kind: publication.sourceKind, digest: publication.sourceDigest },
        semantic: {
          capabilityId: contract.contract.capabilityId,
          name: contract.contract.name,
          description: contract.contract.description,
          inputSchemaDigest: canonicalDigest(contract.contract.inputSchema as StableHashValue),
          outputSchemaDigest: canonicalDigest(contract.contract.outputSchema as StableHashValue),
          customerAnnotations: contract.contract.customerAnnotations.map((annotation) => ({
            annotationId: annotation.annotationId,
            document: annotation.document,
            pointer: annotation.pointer,
            label: annotation.label,
            role: annotation.role,
            ...(annotation.semanticIdentity === undefined ? {} : { semanticIdentity: annotation.semanticIdentity }),
            ...(annotation.inference === undefined ? {} : { inference: annotation.inference }),
          })),
          searchTerms: offering.searchTerms,
        },
        policy: {
          effects: contract.contract.effects,
          dataUse: contract.contract.dataUse,
          lifecycle: contract.contract.lifecycle,
        },
        cost: {
          price: offering.presentation.price,
          commercialRelationship: offering.presentation.commercialRelationship,
        },
        trust: { tier: business.trustTier, publicStatus: business.publicStatus },
        liveness: {
          credentialState: publication.credentialState,
          healthState: publication.healthState,
          ...(publication.readinessObservedAt === undefined
            ? {} : { observedAt: publication.readinessObservedAt }),
          ...(publication.readinessValidUntil === undefined
            ? {} : { validUntil: publication.readinessValidUntil }),
          stale: publication.readinessValidUntil !== undefined && publication.readinessValidUntil < Date.now(),
        },
        routability: { eligible: lifecycle.state === 'active', reasons: lifecycle.reasons },
        evidenceRefs: [...new Set([
          ...publication.registrationEvidenceRefs,
          ...publication.readinessEvidenceRefs,
          ...offering.registrationEvidenceRefs,
          ...binding.registrationEvidenceRefs,
        ])].sort(),
      })
    }
    const edges: Array<{
      kind: 'published_by' | 'bound_to' | 'schema_compatible'
      from: string
      to: string
    }> = nodes.flatMap((node) => [
      { kind: 'published_by' as const, from: node.publicationRef, to: `business:${node.businessId}` },
      { kind: 'bound_to' as const, from: node.publicationRef, to: node.bindingId },
    ])
    for (const upstream of nodes) {
      for (const downstream of nodes) {
        if (upstream.publicationRef !== downstream.publicationRef
          && upstream.semantic.outputSchemaDigest === downstream.semantic.inputSchemaDigest) {
          edges.push({ kind: 'schema_compatible' as const, from: upstream.publicationRef, to: downstream.publicationRef })
        }
      }
    }
    return { kind: 'available' as const, nodes, edges }
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
    }, Date.now())
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
    }, Date.now())
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
    return await setCapabilitySupplyEligibilityCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      eligibility: args,
      context: args,
    }, Date.now())
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
    return await quarantineCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      bindingId: args.bindingId, expectedObservedRowDigest: args.expectedObservedRowDigest,
      context: args,
    }, Date.now())
  },
})

export const listEligible = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: v.union(
    v.object({ kind: v.literal('available'), supplies: v.array(eligibleSupplyValue) }),
    v.object({
      kind: v.literal('unavailable'),
      reason: v.union(
        v.literal('limit_invalid'), v.literal('eligible_supply_limit_exceeded'),
        v.literal('supply_integrity_failure'), v.literal('contract_integrity_failure'),
      ),
    }),
  ),
  handler: async (ctx, args) => await listEligibleCapabilitySupply(ctx.db, args),
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

function publicationPorts(ctx: MutationCtx) {
  return capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (registration, now) => registerCapabilityOffering(ctx.db, registration, now),
    registerBinding: (registration, now) => registerCapabilityTransportBinding(ctx.db, registration, now),
    setEligibility: (eligibility, now) => setCapabilitySupplyEligibility(ctx.db, eligibility, now),
  })
}
