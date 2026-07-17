import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  capabilitySupplyEligibilityHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  admitRegisteredTransport,
  normalizeCapabilityPublication,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
} from '@/modules/capability-supply/public'
import {
  bindingIntegrityIsValid,
  bindingRegistrationAudit,
  transportAdmissionInput,
} from '@/modules/capability-supply/internal/binding'
import {
  bindingEligibilityIsValid,
  compareStableIdentifier,
  desiredEligibility,
  eligibilityPublicResult,
  eligibilityReplayAudits,
  eligibleBindingProjection,
  eligibleOfferingProjection,
  offeringEligibilityIsValid,
  validEligibilityInput,
  type DesiredEligibility,
  type EligibilityInput,
} from '@/modules/capability-supply/internal/eligibility'
import {
  contractRefFromRow,
  offeringIntegrityIsValid,
  writablePresentation,
} from '@/modules/capability-supply/internal/offering'
import {
  INITIAL_PUBLICATION_LIFECYCLE,
  decodeConvexPublicationSource,
  isDirectPublicationSource,
  publicationLifecycle,
  publicationProjection,
} from '@/modules/capability-supply/internal/publication'
import {
  bindingObservedRowDigest,
  offeringStatusAfterBindingQuarantine,
  quarantineBindingAudit,
  quarantineParentAudit,
  quarantineParentUpdatedDisposition,
  validQuarantineAuditPayload,
  type QuarantineParentDisposition,
} from '@/modules/capability-supply/internal/quarantine'
import {
  MAX_CONTEXT_VALUE_LENGTH,
  boundedTrimmed,
  storedAuditMatches,
  storedSupplyAuditEffectRef,
  supplyAuditEffectRef,
  supplyAuditEventId,
  validCommandEnvelope,
  validRegistrationContext,
  type RegistrationContext,
  type SupplyAuditInput,
  type SupplyCommandActor,
} from '@/modules/capability-supply/internal/shared'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { encodeCapabilityContractDocumentJson } from '@/modules/capability-contract-registry/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import {
  getActiveExactCapabilityContract,
  getExactRegisteredCapabilityContract,
  registerCapabilityContractDocument,
} from './capabilityContractDocuments'

const MAX_ELIGIBLE_SUPPLY = 256
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
    let importInput: Parameters<typeof normalizeCapabilityPublication>[0]
    if (isDirectPublicationSource(args.source)) {
      if (args.offering === undefined || args.binding === undefined) {
        return { kind: 'refused' as const, reason: 'source_invalid' as const }
      }
      importInput = {
        kind: 'ae_envelope', documentJson: args.source.documentJson,
        offering: args.offering, binding: args.binding, evidenceRefs: args.evidenceRefs,
      }
    } else {
      importInput = decodeConvexPublicationSource(args.source) as Parameters<typeof normalizeCapabilityPublication>[0]
    }
    let normalized
    try {
      normalized = normalizeCapabilityPublication(importInput)
    } catch {
      return { kind: 'refused' as const, reason: 'source_invalid' as const }
    }
    if (normalized === undefined || normalized.kind === 'refused') {
      return { kind: 'refused' as const, reason: 'source_invalid' as const }
    }
    const draft = normalized.draft
    let encoded
    try {
      encoded = encodeCapabilityContractDocumentJson(draft.documentJson)
    } catch (error) {
      return {
        kind: 'refused' as const,
        reason: error instanceof Error && error.message === 'capability_contract_too_large'
          ? 'contract_too_large' as const
          : 'contract_invalid' as const,
      }
    }
    const offering = {
      ...draft.offering,
      businessId: args.businessId,
      contractRef: encoded.contract.ref,
    }
    const binding = {
      ...draft.binding,
      offeringId: draft.offering.offeringId,
      networkId: draft.offering.networkId,
      contractRef: encoded.contract.ref,
    }
    try {
      defineCapabilityOfferingRegistration(offering)
    } catch {
      return { kind: 'refused' as const, reason: 'offering_invalid' as const }
    }
    let admittedTransport: ReturnType<typeof admitRegisteredTransport>
    try {
      const definedBinding = defineCapabilityTransportBindingRegistration(binding)
      admittedTransport = admitRegisteredTransport(transportAdmissionInput(definedBinding))
      if (admittedTransport.kind === 'refused') return admittedTransport
    } catch {
      return { kind: 'refused' as const, reason: 'binding_invalid' as const }
    }

    const now = Date.now()
    const existingContract = await ctx.db.query('capabilityContractDocuments')
      .withIndex('by_capabilityId_and_version', (index) => (
        index.eq('capabilityId', encoded.contract.ref.capabilityId).eq('version', encoded.contract.ref.version)
      )).unique()
    if (existingContract !== null && existingContract.contractDigest !== encoded.contract.ref.contractDigest) {
      return { kind: 'refused' as const, reason: 'contract_identity_conflict' as const }
    }
    const definedOffering = defineCapabilityOfferingRegistration(offering)
    const offeringHash = capabilityOfferingRegistrationHash(definedOffering)
    const existingOffering = await ctx.db.query('capabilityOfferings')
      .withIndex('by_offeringId', (index) => index.eq('offeringId', definedOffering.offeringId)).unique()
    if (existingOffering !== null) {
      if (!offeringIntegrityIsValid(existingOffering)) {
        return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
      }
      if (existingOffering.registrationHash !== offeringHash) {
        return { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
      }
    }
    const definedBinding = defineCapabilityTransportBindingRegistration(binding)
    if (admittedTransport.kind !== 'admitted') throw new Error('capability_publication_admission_invariant')
    const bindingHash = capabilityBindingRegistrationHash(definedBinding, admittedTransport.transport)
    const existingBinding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) => index.eq('bindingId', definedBinding.bindingId)).unique()
    if (existingBinding !== null) {
      if (!bindingIntegrityIsValid(existingBinding)) {
        return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
      }
      if (existingBinding.registrationHash !== bindingHash) {
        return { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
      }
    }
    const existingPublication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', draft.offering.offeringId).eq('revision', 1)
      )).unique()
    if (existingPublication !== null && (
      existingPublication.sourceDigest !== draft.source.descriptorDigest
      || existingPublication.offeringId !== draft.offering.offeringId
      || existingPublication.bindingId !== draft.binding.bindingId
    )) {
      return { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
    }
    const expected = publicationProjection(encoded.contract.ref, draft.offering.offeringId, draft.binding.bindingId)
    const actor = { kind: 'owner' as const, ref: (await ctx.auth.getUserIdentity())!.subject }
    const operation = await beginOperation(
      ctx.db,
      actor,
      'publishCapability',
      args,
      { businessId: args.businessId, source: draft.source, offering: draft.offering, binding: draft.binding },
      now,
    )
    if (operation.kind === 'conflict') {
      return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
    }
    if (operation.kind === 'replay') return replayOperationResult(operation, expected)
    const contractResult = await registerCapabilityContractDocument(ctx.db, encoded.documentJson, now)
    if (contractResult.kind === 'refused') throw new Error(`capability_publication_contract_${contractResult.reason}`)
    const offeringResult = await registerCapabilityOffering(ctx.db, offering, now)
    if (offeringResult.kind === 'refused') throw new Error(`capability_publication_offering_${offeringResult.reason}`)
    const bindingResult = await registerCapabilityTransportBinding(ctx.db, binding, now)
    if (bindingResult.kind === 'refused') throw new Error(`capability_publication_binding_${bindingResult.reason}`)
    if (existingPublication === null) {
      await ctx.db.insert('capabilityPublications', {
        publicationRef: draft.offering.offeringId,
        revision: 1,
        businessId: args.businessId,
        networkId: draft.offering.networkId,
        sourceKind: draft.source.kind,
        sourceDigest: draft.source.descriptorDigest,
        ...encoded.contract.ref,
        offeringId: draft.offering.offeringId,
        bindingId: draft.binding.bindingId,
        disposition: 'current',
        credentialState: 'unobserved',
        healthState: 'unobserved',
        readinessEvidenceRefs: [],
        registrationEvidenceRefs: [...args.evidenceRefs],
        createdAt: now,
        updatedAt: now,
      })
    }
    const auditId = await ensureSupplyAudit(ctx.db, {
      eventType: 'capability_publication.published',
      action: 'publish_capability',
      targetType: 'capability_publication',
      targetRef: draft.offering.offeringId,
      actor,
      context: args,
      payload: {
        businessId: args.businessId,
        sourceKind: draft.source.kind,
        sourceDigest: draft.source.descriptorDigest,
        contractRef: encoded.contract.ref,
        offeringId: draft.offering.offeringId,
        bindingId: draft.binding.bindingId,
      },
      beforeState: 'absent',
      afterState: 'inactive',
      createdAt: now,
    })
    await succeedOperation(ctx.db, operation.operationId, expected, [auditId], now)
    await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
      publicationRef: draft.offering.offeringId, expectedRevision: 1,
    })
    return expected
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
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)
      )).unique()
    if (publication === null) return { kind: 'refused' as const, reason: 'publication_not_found' as const }
    if (!await ownsPublishedBusiness(ctx, publication.businessId)) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    if (publication.disposition !== 'current') {
      return { kind: 'refused' as const, reason: 'revision_changed' as const }
    }
    const [offering, binding] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', publication.bindingId)).unique(),
    ])
    if (offering === null || binding === null) throw new Error('capability_publication_supply_integrity_failure')
    const revoked = await setCapabilitySupplyEligibility(ctx.db, {
      offeringId: offering.offeringId,
      bindingId: binding.bindingId,
      contractRef: contractRefFromRow(publication),
      decision: 'revoke',
      expectedOfferingRegistrationHash: offering.registrationHash,
      expectedBindingRegistrationHash: binding.registrationHash,
      admissionEvidenceRefs: args.evidenceRefs,
      conformanceEvidenceRefs: args.evidenceRefs,
    }, Date.now())
    if (revoked.kind === 'refused') throw new Error(`capability_publication_withdraw_${revoked.reason}`)
    const now = Date.now()
    await ctx.db.patch(publication._id, { disposition: 'withdrawn', withdrawnAt: now, updatedAt: now })
    return {
      kind: 'withdrawn' as const,
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: { state: 'withdrawn' as const, reasons: ['withdrawn' as const] },
    }
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
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) => (
        index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)
      )).unique()
    if (publication === null) return { kind: 'refused' as const, reason: 'publication_not_found' as const }
    if (!await ownsPublishedBusiness(ctx, publication.businessId)) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    if (publication.disposition !== 'current') {
      return { kind: 'refused' as const, reason: 'revision_changed' as const }
    }
    let importInput: Parameters<typeof normalizeCapabilityPublication>[0]
    if (isDirectPublicationSource(args.source)) {
      if (args.offering === undefined || args.binding === undefined) {
        return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
      }
      importInput = {
        kind: 'ae_envelope', documentJson: args.source.documentJson,
        offering: args.offering, binding: args.binding, evidenceRefs: args.evidenceRefs,
      }
    } else {
      importInput = decodeConvexPublicationSource(args.source) as Parameters<typeof normalizeCapabilityPublication>[0]
    }
    let normalized
    try {
      normalized = normalizeCapabilityPublication(importInput)
    } catch {
      return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
    }
    if (normalized === undefined || normalized.kind === 'refused') {
      return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
    }
    const draft = normalized.draft
    let encoded
    try {
      encoded = encodeCapabilityContractDocumentJson(draft.documentJson)
    } catch {
      return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
    }
    const repeatsExactContract = encoded.contract.ref.version === publication.version
      && encoded.contract.ref.contractDigest === publication.contractDigest
    if (encoded.contract.ref.capabilityId !== publication.capabilityId
      || encoded.contract.ref.version < publication.version
      || (encoded.contract.ref.version === publication.version && !repeatsExactContract)) {
      return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
    }
    const previousContract = await getExactRegisteredCapabilityContract(ctx.db, contractRefFromRow(publication))
    if (previousContract.kind !== 'found') throw new Error('capability_publication_contract_integrity_failure')
    const compatible = canonicalDigest({
      inputSchema: previousContract.contract.inputSchema,
      outputSchema: previousContract.contract.outputSchema,
      customerAnnotations: previousContract.contract.customerAnnotations,
      dataUse: previousContract.contract.dataUse,
      effects: previousContract.contract.effects,
      evidence: previousContract.contract.evidence,
      lifecycle: previousContract.contract.lifecycle,
    } as StableHashValue) === canonicalDigest({
      inputSchema: encoded.contract.inputSchema,
      outputSchema: encoded.contract.outputSchema,
      customerAnnotations: encoded.contract.customerAnnotations,
      dataUse: encoded.contract.dataUse,
      effects: encoded.contract.effects,
      evidence: encoded.contract.evidence,
      lifecycle: encoded.contract.lifecycle,
    } as StableHashValue)
    const now = Date.now()
    const revision = publication.revision + 1
    const [currentOffering, currentBinding] = await Promise.all([
      ctx.db.query('capabilityOfferings')
        .withIndex('by_offeringId', (index) => index.eq('offeringId', publication.offeringId)).unique(),
      ctx.db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) => index.eq('bindingId', publication.bindingId)).unique(),
    ])
    if (currentOffering === null || currentBinding === null) {
      throw new Error('capability_publication_supply_integrity_failure')
    }
    const revoked = await setCapabilitySupplyEligibility(ctx.db, {
      offeringId: currentOffering.offeringId,
      bindingId: currentBinding.bindingId,
      contractRef: contractRefFromRow(publication),
      decision: 'revoke',
      expectedOfferingRegistrationHash: currentOffering.registrationHash,
      expectedBindingRegistrationHash: currentBinding.registrationHash,
      admissionEvidenceRefs: args.evidenceRefs,
      conformanceEvidenceRefs: args.evidenceRefs,
    }, now)
    if (revoked.kind === 'refused') throw new Error(`capability_publication_refresh_${revoked.reason}`)
    await ctx.db.patch(publication._id, { disposition: 'superseded', updatedAt: now })
    if (!compatible) {
      await ctx.db.insert('capabilityPublications', {
        publicationRef: publication.publicationRef, revision, businessId: publication.businessId,
        networkId: draft.offering.networkId, sourceKind: draft.source.kind,
        sourceDigest: draft.source.descriptorDigest, ...encoded.contract.ref,
        offeringId: draft.offering.offeringId, bindingId: draft.binding.bindingId,
        disposition: 'incompatible', supersedesRevision: publication.revision,
        credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
        registrationEvidenceRefs: [...args.evidenceRefs], createdAt: now, updatedAt: now,
      })
      return {
        kind: 'refreshed' as const, publicationRef: publication.publicationRef, revision,
        disposition: 'incompatible' as const,
        lifecycle: { state: 'incompatible' as const, reasons: ['incompatible_revision' as const] },
      }
    }
    const contractResult = await registerCapabilityContractDocument(ctx.db, encoded.documentJson, now)
    if (contractResult.kind === 'refused') throw new Error(`capability_publication_refresh_${contractResult.reason}`)
    const nextOffering = {
      ...draft.offering, businessId: publication.businessId, contractRef: encoded.contract.ref,
    }
    const nextBinding = {
      ...draft.binding, offeringId: draft.offering.offeringId,
      networkId: draft.offering.networkId, contractRef: encoded.contract.ref,
    }
    const offeringResult = await registerCapabilityOffering(ctx.db, nextOffering, now)
    if (offeringResult.kind === 'refused') throw new Error(`capability_publication_refresh_${offeringResult.reason}`)
    const bindingResult = await registerCapabilityTransportBinding(ctx.db, nextBinding, now)
    if (bindingResult.kind === 'refused') throw new Error(`capability_publication_refresh_${bindingResult.reason}`)
    await ctx.db.insert('capabilityPublications', {
      publicationRef: publication.publicationRef, revision, businessId: publication.businessId,
      networkId: draft.offering.networkId, sourceKind: draft.source.kind,
      sourceDigest: draft.source.descriptorDigest, ...encoded.contract.ref,
      offeringId: draft.offering.offeringId, bindingId: draft.binding.bindingId,
      disposition: 'current', supersedesRevision: publication.revision,
      credentialState: 'unobserved', healthState: 'unobserved', readinessEvidenceRefs: [],
      registrationEvidenceRefs: [...args.evidenceRefs], createdAt: now, updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
      publicationRef: publication.publicationRef, expectedRevision: revision,
    })
    return {
      kind: 'refreshed' as const, publicationRef: publication.publicationRef, revision,
      disposition: 'current' as const,
      lifecycle: INITIAL_PUBLICATION_LIFECYCLE,
    }
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
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const expectedResult = {
    kind: 'registered' as const,
    offeringId: registration.offeringId,
    registrationHash: capabilityOfferingRegistrationHash(registration),
  }
  const audit = {
    eventType: 'capability_offering.registered' as const,
    action: 'register_offering' as const,
    targetType: 'capability_offering' as const,
    targetRef: expectedResult.offeringId,
    actor: command.actor,
    context: command.context,
    payload: { offeringId: expectedResult.offeringId, registrationHash: expectedResult.registrationHash },
    beforeState: 'absent',
    afterState: 'inactive',
    createdAt: now,
  }
  const operation = await beginOperation(
    db, command.actor, 'registerCapabilityOffering', command.context, { registration }, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    await verifyReplayAudits(db, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return await recoverOfferingReplay(db, registration, operation)
  }
  const result = await registerCapabilityOffering(db, registration, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(db, audit)
  await succeedOperation(db, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; registration: unknown; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(command.registration)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const operation = await beginOperation(db, command.actor, 'registerCapabilityTransportBinding', command.context, {
    registration,
  }, now)
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const recovered = await recoverBindingReplay(db, registration, operation)
    const audit = bindingRegistrationAudit(command.actor, command.context, registration.offeringId, recovered, now)
    await verifyReplayAudits(db, operation, [{ audit, allowedBeforeStates: ['absent'] }])
    return recovered
  }
  const admitted = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admitted.kind === 'refused') {
    await failOperation(db, operation.operationId, admitted.reason, now)
    return admitted
  }
  const expectedResult = {
    kind: 'registered' as const,
    bindingId: registration.bindingId,
    registrationHash: capabilityBindingRegistrationHash(registration, admitted.transport),
  }
  const result = await registerCapabilityTransportBinding(db, registration, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const auditId = await ensureSupplyAudit(db, bindingRegistrationAudit(
    command.actor, command.context, registration.offeringId, expectedResult, now,
  ))
  await succeedOperation(db, operation.operationId, expectedResult, [auditId], now)
  return expectedResult
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
  now: number,
) {
  if (!validCommandEnvelope(command.actor, command.context) || !validEligibilityInput(command.eligibility)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(
    db, command.actor, 'setCapabilitySupplyEligibility', command.context,
    command.eligibility as StableHashValue, now,
  )
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') {
    const desired = await recoverEligibilityReplayDesired(db, operation, command)
    const expectedResult = eligibilityPublicResult(command.eligibility, desired)
    await verifyReplayAudits(db, operation, eligibilityReplayAudits(command, desired, now))
    return replayOperationResult(operation, expectedResult)
  }
  const result = await setCapabilitySupplyEligibility(db, command.eligibility, now)
  if (result.kind === 'refused') {
    await failOperation(db, operation.operationId, result.reason, now)
    return result
  }
  const desired = desiredEligibility(command.eligibility.decision, result.transition.offeringAfter)
  const expectedResult = eligibilityPublicResult(command.eligibility, desired)
  const offeringAuditId = await ensureSupplyAudit(db, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: result.offeringId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      registrationHash: command.eligibility.expectedOfferingRegistrationHash,
      eligibilityHash: result.offeringEligibilityHash,
    },
    beforeState: result.transition.offeringBefore,
    afterState: result.transition.offeringAfter,
    createdAt: now,
  })
  const bindingAuditId = await ensureSupplyAudit(db, {
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_binding',
    action: 'set_eligibility',
    targetRef: result.bindingId, actor: command.actor, context: command.context,
    payload: {
      offeringId: result.offeringId,
      bindingId: result.bindingId,
      registrationHash: command.eligibility.expectedBindingRegistrationHash,
      eligibilityHash: result.bindingEligibilityHash,
    },
    beforeState: result.transition.bindingBefore,
    afterState: result.transition.bindingAfter,
    createdAt: now,
  })
  await succeedOperation(db, operation.operationId, expectedResult, [offeringAuditId, bindingAuditId], now)
  return expectedResult
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
  if (
    !validCommandEnvelope(command.actor, command.context)
    || !boundedTrimmed(command.bindingId, MAX_CONTEXT_VALUE_LENGTH)
    || !isCanonicalDigest(command.expectedObservedRowDigest)
  ) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const operation = await beginOperation(db, command.actor, 'quarantineCapabilityBinding', command.context, {
    bindingId: command.bindingId, expectedObservedRowDigest: command.expectedObservedRowDigest,
  }, now)
  if (operation.kind === 'conflict') return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
  if (operation.kind === 'replay') return await replayQuarantineBinding(db, operation, command, now)
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (index) => index.eq('bindingId', command.bindingId)).unique()
  if (binding === null) {
    if (operation.kind === 'ready') await failOperation(db, operation.operationId, 'binding_not_found', now)
    return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  }
  if (bindingObservedRowDigest(binding) !== command.expectedObservedRowDigest) {
    await failOperation(db, operation.operationId, 'observed_row_changed', now)
    return { kind: 'refused' as const, reason: 'observed_row_changed' as const }
  }
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: command.context.evidenceRefs,
    conformanceEvidenceRefs: command.context.evidenceRefs,
  })
  const parent = await trustedQuarantineParent(db, binding)
  let parentAuditId: string | undefined
  let parentDisposition: QuarantineParentDisposition = { kind: 'unresolved' }
  if (parent !== null) {
    const siblings = await db.query('capabilityTransportBindings')
      .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
        index.eq('offeringId', parent.offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
      )).take(2)
    const status = offeringStatusAfterBindingQuarantine(
      siblings.some((candidate) => candidate.bindingId !== binding.bindingId),
    )
    const parentEligibilityHash = capabilityOfferingEligibilityHash({
      offeringId: parent.offeringId, registrationHash: parent.registrationHash,
      status, admissionEvidenceRefs: command.context.evidenceRefs,
    })
    await db.patch(parent._id, {
      status, admissionEvidenceRefs: [...command.context.evidenceRefs],
      eligibilityHash: parentEligibilityHash, updatedAt: now,
    })
    parentDisposition = quarantineParentUpdatedDisposition(parent, status, parentEligibilityHash)
    parentAuditId = await ensureSupplyAudit(db, quarantineParentAudit(
      command, parent, parentDisposition, now,
    ))
  }
  await db.patch(binding._id, {
    admission: 'not_admitted', conformance: 'not_conformant',
    admissionEvidenceRefs: [...command.context.evidenceRefs],
    conformanceEvidenceRefs: [...command.context.evidenceRefs], eligibilityHash, updatedAt: now,
  })
  const result = { kind: 'quarantined' as const, bindingId: binding.bindingId, eligibilityHash }
  const auditId = await ensureSupplyAudit(db, quarantineBindingAudit(
    command, binding, eligibilityHash, parentDisposition, now,
  ))
  await succeedOperation(db, operation.operationId, result, [auditId, ...(parentAuditId === undefined ? [] : [parentAuditId])], now)
  return result
}

export async function registerCapabilityOffering(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  let registration: CapabilityOfferingRegistration
  try {
    registration = defineCapabilityOfferingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'offering_invalid' as const }
  }
  const business = await publishedBusiness(db, registration.businessId)
  if (business === null) return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  const contract = await resolveExactContract(db, registration.contractRef)
  if (contract.kind === 'refused') return contract
  const registrationHash = capabilityOfferingRegistrationHash(registration)
  const existing = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (existing !== null) {
    if (!offeringIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'offering_identity_conflict' as const }
  }
  const status = 'inactive' as const
  const admissionEvidenceRefs: string[] = []
  const eligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: registration.offeringId, registrationHash, status, admissionEvidenceRefs,
  })
  await db.insert('capabilityOfferings', {
    offeringId: registration.offeringId,
    businessId: business._id,
    networkId: registration.networkId,
    ...registration.contractRef,
    presentation: writablePresentation(registration.presentation),
    searchTerms: [...registration.searchTerms],
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    status,
    admissionEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, offeringId: registration.offeringId, registrationHash, created: true }
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'], input: unknown, registeredAt: number,
) {
  let registration: CapabilityTransportBindingRegistration
  try {
    registration = defineCapabilityTransportBindingRegistration(input)
  } catch {
    return { kind: 'refused' as const, reason: 'binding_invalid' as const }
  }
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  if (!offeringIntegrityIsValid(offering)) {
    return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
  }
  if (
    offering.networkId !== registration.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), registration.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (await publishedBusiness(db, offering.businessId) === null) {
    return { kind: 'refused' as const, reason: 'business_not_registered' as const }
  }
  const contract = await resolveExactContract(db, registration.contractRef)
  if (contract.kind === 'refused') return contract
  const admission = admitRegisteredTransport(transportAdmissionInput(registration))
  if (admission.kind === 'refused') return admission
  const registrationHash = capabilityBindingRegistrationHash(registration, admission.transport)
  const existing = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', registration.bindingId)).unique()
  if (existing !== null) {
    if (!bindingIntegrityIsValid(existing)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    return existing.registrationHash === registrationHash
      ? { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: false }
      : { kind: 'refused' as const, reason: 'binding_identity_conflict' as const }
  }
  const initialAdmission = 'not_admitted' as const
  const conformance = 'not_conformant' as const
  const admissionEvidenceRefs: string[] = []
  const conformanceEvidenceRefs: string[] = []
  const eligibilityHash = capabilityBindingEligibilityHash({
    bindingId: registration.bindingId, registrationHash, admission: initialAdmission, conformance,
    admissionEvidenceRefs, conformanceEvidenceRefs,
  })
  await db.insert('capabilityTransportBindings', {
    bindingId: registration.bindingId,
    offeringId: registration.offeringId,
    networkId: registration.networkId,
    ...registration.contractRef,
    endpointUrl: registration.endpointUrl,
    credentialRef: registration.credentialRef,
    continuation: { ...registration.continuation, evidenceRefs: [...registration.continuation.evidenceRefs] },
    cancellation: { ...registration.cancellation, evidenceRefs: [...registration.cancellation.evidenceRefs] },
    adapterId: admission.transport.adapterId,
    configJson: admission.transport.configJson,
    configDigest: admission.transport.configDigest,
    registrationEvidenceRefs: [...registration.registrationEvidenceRefs],
    registrationHash,
    admission: initialAdmission,
    conformance,
    admissionEvidenceRefs,
    conformanceEvidenceRefs,
    eligibilityHash,
    registeredAt,
    updatedAt: registeredAt,
  })
  return { kind: 'registered' as const, bindingId: registration.bindingId, registrationHash, created: true }
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  if (!validEligibilityInput(input)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', input.offeringId)).unique()
  if (offering === null) return { kind: 'refused' as const, reason: 'offering_not_found' as const }
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique()
  if (binding === null) return { kind: 'refused' as const, reason: 'binding_not_found' as const }
  if (
    offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
  ) {
    return { kind: 'refused' as const, reason: 'registration_changed' as const }
  }
  if (
    binding.offeringId !== offering.offeringId
    || binding.networkId !== offering.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
  ) {
    return { kind: 'refused' as const, reason: 'offering_binding_mismatch' as const }
  }
  if (input.decision === 'admit') {
    if (!offeringIntegrityIsValid(offering)) {
      return { kind: 'refused' as const, reason: 'offering_integrity_failure' as const }
    }
    if (!bindingIntegrityIsValid(binding)) {
      return { kind: 'refused' as const, reason: 'binding_integrity_failure' as const }
    }
    const contract = await resolveExactContract(db, input.contractRef)
    if (contract.kind === 'refused') return contract
    if (await publishedBusiness(db, offering.businessId) === null) {
      return { kind: 'refused' as const, reason: 'business_not_registered' as const }
    }
  }
  const eligibleSiblings = input.decision === 'revoke'
    ? await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (query) => (
          query.eq('offeringId', offering.offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        ))
        .take(2)
    : []
  const hasOtherEligibleBinding = eligibleSiblings.some((candidate) => candidate.bindingId !== binding.bindingId)
  const desired = desiredEligibility(input.decision, hasOtherEligibleBinding ? 'active' : 'inactive')
  const offeringEligibilityHash = capabilityOfferingEligibilityHash({
    offeringId: offering.offeringId, registrationHash: offering.registrationHash,
    status: desired.offeringStatus, admissionEvidenceRefs: input.admissionEvidenceRefs,
  })
  const bindingEligibilityHash = capabilityBindingEligibilityHash({
    bindingId: binding.bindingId, registrationHash: binding.registrationHash,
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: input.admissionEvidenceRefs,
    conformanceEvidenceRefs: input.conformanceEvidenceRefs,
  })
  await db.patch(offering._id, {
    status: desired.offeringStatus, admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    eligibilityHash: offeringEligibilityHash, updatedAt,
  })
  await db.patch(binding._id, {
    admission: desired.bindingAdmission, conformance: desired.bindingConformance,
    admissionEvidenceRefs: [...input.admissionEvidenceRefs],
    conformanceEvidenceRefs: [...input.conformanceEvidenceRefs],
    eligibilityHash: bindingEligibilityHash, updatedAt,
  })
  return {
    kind: input.decision === 'admit' ? 'eligible' as const : 'ineligible' as const,
    offeringId: offering.offeringId,
    bindingId: binding.bindingId,
    eligibilityHash: capabilitySupplyEligibilityHash({
      offeringId: offering.offeringId, bindingId: binding.bindingId,
      offeringRegistrationHash: offering.registrationHash, bindingRegistrationHash: binding.registrationHash,
      offeringStatus: desired.offeringStatus,
      bindingAdmission: desired.bindingAdmission,
      bindingConformance: desired.bindingConformance,
      admissionEvidenceRefs: input.admissionEvidenceRefs,
      conformanceEvidenceRefs: input.conformanceEvidenceRefs,
    }),
    offeringEligibilityHash,
    bindingEligibilityHash,
    transition: {
      offeringBefore: offering.status,
      offeringAfter: desired.offeringStatus,
      bindingBefore: `${binding.admission}:${binding.conformance}`,
      bindingAfter: `${desired.bindingAdmission}:${desired.bindingConformance}`,
    },
  }
}

export async function listEligibleCapabilitySupply(
  db: QueryCtx['db'], input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_ELIGIBLE_SUPPLY) {
    return { kind: 'unavailable' as const, reason: 'limit_invalid' as const }
  }
  const bindings = await db.query('capabilityTransportBindings')
    .withIndex('by_networkId_admission_conformance', (query) => (
      query.eq('networkId', input.networkId).eq('admission', 'admitted').eq('conformance', 'conformant')
    ))
    .take(input.limit + 1)
  if (bindings.length > input.limit) {
    return { kind: 'unavailable' as const, reason: 'eligible_supply_limit_exceeded' as const }
  }
  const supplies: Array<{
    offering: ReturnType<typeof eligibleOfferingProjection<Doc<'capabilityOfferings'>>>
    binding: ReturnType<typeof eligibleBindingProjection<Doc<'capabilityTransportBindings'>>>
    publication?: Readonly<{ publicationRef: string; revision: number; readinessValidUntil: number }>
  }> = []
  const now = input.now ?? Date.now()
  for (const binding of bindings) {
    if (!bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    const offering = await db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', binding.offeringId)).unique()
    if (offering === null || offering.status !== 'active') continue
    if (!offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)) {
      return { kind: 'unavailable' as const, reason: 'supply_integrity_failure' as const }
    }
    if (
      offering.networkId !== binding.networkId
      || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
    ) continue
    if (await publishedBusiness(db, offering.businessId) === null) continue
    const contract = await getActiveExactCapabilityContract(db, contractRefFromRow(binding))
    if (contract.kind === 'unavailable') {
      if (contract.reason === 'integrity_failure') {
        return { kind: 'unavailable' as const, reason: 'contract_integrity_failure' as const }
      }
      continue
    }
    const publication = await db.query('capabilityPublications')
      .withIndex('by_bindingId_and_disposition', (query) => (
        query.eq('bindingId', binding.bindingId).eq('disposition', 'current')
      )).unique()
    const activePublication = publication !== null
      && publication.readinessValidUntil !== undefined
      && publicationLifecycle(publication, offering, binding, now).state === 'active'
      ? {
          publicationRef: publication.publicationRef, revision: publication.revision,
          readinessValidUntil: publication.readinessValidUntil,
        }
      : undefined
    supplies.push({
      offering: eligibleOfferingProjection(offering), binding: eligibleBindingProjection(binding),
      ...(activePublication === undefined ? {} : { publication: activePublication }),
    })
  }
  supplies.sort((left, right) => (
    compareStableIdentifier(left.offering.offeringId, right.offering.offeringId)
    || compareStableIdentifier(left.binding.bindingId, right.binding.bindingId)
  ))
  return { kind: 'available' as const, supplies }
}

export async function getEligibleExactCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{
    networkId: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: ContractRef
    expectedOfferingRegistrationHash: string
    expectedBindingRegistrationHash: string
  }>,
) {
  const [offering, binding] = await Promise.all([
    db.query('capabilityOfferings')
      .withIndex('by_offeringId', (query) => query.eq('offeringId', input.offeringId)).unique(),
    db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', input.bindingId)).unique(),
  ])
  if (offering === null || binding === null
    || String(offering.businessId) !== input.businessId
    || offering.networkId !== input.networkId || binding.networkId !== input.networkId
    || binding.offeringId !== offering.offeringId
    || offering.registrationHash !== input.expectedOfferingRegistrationHash
    || binding.registrationHash !== input.expectedBindingRegistrationHash
    || offering.status !== 'active' || binding.admission !== 'admitted' || binding.conformance !== 'conformant'
    || !sameCapabilityContractRef(contractRefFromRow(offering), input.contractRef)
    || !sameCapabilityContractRef(contractRefFromRow(binding), input.contractRef)
    || !offeringIntegrityIsValid(offering) || !offeringEligibilityIsValid(offering)
    || !bindingIntegrityIsValid(binding) || !bindingEligibilityIsValid(binding)) {
    return { kind: 'unavailable' as const }
  }
  const business = await publishedBusiness(db, offering.businessId)
  if (business === null) return { kind: 'unavailable' as const }
  const contract = await getActiveExactCapabilityContract(db, input.contractRef)
  if (contract.kind !== 'found') return { kind: 'unavailable' as const }
  return { kind: 'available' as const, offering, binding, business, contract }
}

async function recoverBindingReplay(
  db: QueryCtx['db'], registration: CapabilityTransportBindingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const binding = await db.query('capabilityTransportBindings')
    .withIndex('by_bindingId', (query) => query.eq('bindingId', registration.bindingId)).unique()
  if (binding === null || !bindingIntegrityIsValid(binding)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    bindingId: binding.bindingId,
    registrationHash: binding.registrationHash,
  })
}

async function recoverOfferingReplay(
  db: QueryCtx['db'], registration: CapabilityOfferingRegistration,
  replay: Readonly<{ resultHash: string | undefined }>,
) {
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', registration.offeringId)).unique()
  if (offering === null || !offeringIntegrityIsValid(offering)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return replayOperationResult(replay, {
    kind: 'registered' as const,
    offeringId: offering.offeringId,
    registrationHash: offering.registrationHash,
  })
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

async function resolveExactContract(db: QueryCtx['db'], ref: ContractRef) {
  const result = await getActiveExactCapabilityContract(db, ref)
  if (result.kind === 'found') return result
  return {
    kind: 'refused' as const,
    reason: result.reason === 'not_found'
      ? 'contract_not_found' as const
      : result.reason === 'not_active'
        ? 'contract_not_active' as const
        : 'contract_integrity_failure' as const,
  }
}

async function beginOperation(
  db: MutationCtx['db'], actor: SupplyCommandActor, operationName: string,
  context: RegistrationContext, requestMaterial: StableHashValue, now: number,
) {
  const requestHash = canonicalDigest({
    requestMaterial, correlationId: context.correlationId,
    reasonCode: context.reasonCode, evidenceRefs: context.evidenceRefs,
  })
  const existing = await db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => (
      query.eq('actorRef', actor.ref).eq('operationName', operationName).eq('key', context.operationKey)
    )).unique()
  if (existing !== null) {
    if (existing.requestHash !== requestHash || existing.status === 'in_progress') return { kind: 'conflict' as const }
    if (existing.status === 'succeeded') {
      return { kind: 'replay' as const, resultHash: existing.resultHash, effectRefs: existing.effectRefs }
    }
    if (existing.status === 'failed_terminal') {
      await db.patch(existing._id, { status: 'in_progress', updatedAt: now })
    }
    return { kind: 'ready' as const, operationId: existing._id }
  }
  const operationId = await db.insert('operationKeys', {
    scope: 'capability_supply', actorKind: actor.kind, actorRef: actor.ref, operationName,
    key: context.operationKey, requestHash, status: 'in_progress', effectRefs: [],
    createdAt: now, updatedAt: now,
  })
  return { kind: 'ready' as const, operationId }
}

function replayOperationResult<T extends StableHashValue>(
  replay: Readonly<{ resultHash: string | undefined }>, expected: T,
): T {
  if (replay.resultHash !== canonicalDigest(expected)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return expected
}

async function failOperation(
  db: MutationCtx['db'], operationId: Id<'operationKeys'>, reason: string, now: number,
) {
  await db.patch(operationId, {
    status: 'failed_terminal', resultHash: canonicalDigest({ reason }), updatedAt: now,
  })
}

async function succeedOperation(
  db: MutationCtx['db'], operationId: Id<'operationKeys'>,
  result: StableHashValue, effectRefs: readonly string[], now: number,
) {
  await db.patch(operationId, {
    status: 'succeeded', resultHash: canonicalDigest(result), effectRefs: [...effectRefs], updatedAt: now,
  })
}

async function trustedQuarantineParent(
  db: QueryCtx['db'], binding: Doc<'capabilityTransportBindings'>,
): Promise<Doc<'capabilityOfferings'> | null> {
  const offering = await db.query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', binding.offeringId)).unique()
  if (
    offering === null
    || !offeringIntegrityIsValid(offering)
    || offering.networkId !== binding.networkId
    || !sameCapabilityContractRef(contractRefFromRow(offering), contractRefFromRow(binding))
  ) return null
  return offering
}

async function replayQuarantineBinding(
  db: QueryCtx['db'],
  replay: Readonly<{ resultHash: string | undefined; effectRefs: readonly string[] }>,
  command: Readonly<{
    actor: SupplyCommandActor
    bindingId: string
    expectedObservedRowDigest: string
    context: RegistrationContext
  }>,
  now: number,
) {
  const eventId = supplyAuditEventId({
    eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
    action: 'quarantine_binding',
    targetRef: command.bindingId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const stored = await db.query('auditEvents').withIndex('by_eventId', (index) => index.eq('eventId', eventId)).unique()
  if (stored === null) throw new Error('capability_supply_operation_integrity_failure')
  let payload: unknown
  try {
    payload = JSON.parse(stored.redactedPayloadJson ?? '')
  } catch {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (!validQuarantineAuditPayload(payload, command)) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  const result = { kind: 'quarantined' as const, bindingId: command.bindingId, eligibilityHash: payload.eligibilityHash }
  const expectations: Array<Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>> = [{
    audit: {
      eventType: 'capability_binding.quarantined', targetType: 'capability_binding',
      action: 'quarantine_binding',
      targetRef: command.bindingId, actor: command.actor, context: command.context,
      payload: {
        bindingId: payload.bindingId,
        observedRowDigest: payload.observedRowDigest,
        eligibilityHash: payload.eligibilityHash,
        parent: payload.parent,
      }, beforeState: '',
      afterState: 'not_admitted:not_conformant', createdAt: now,
    },
    allowedBeforeStates: [
      'admitted:conformant', 'admitted:not_conformant', 'not_admitted:conformant', 'not_admitted:not_conformant',
    ],
  }]
  if (payload.parent.kind === 'updated') {
    expectations.push({
      audit: {
        eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
        action: 'quarantine_binding',
        targetRef: payload.parent.offeringId, actor: command.actor, context: command.context,
        payload: {
          offeringId: payload.parent.offeringId, registrationHash: payload.parent.registrationHash,
          eligibilityHash: payload.parent.eligibilityHash,
        },
        beforeState: '', afterState: payload.parent.status, createdAt: now,
      },
      allowedBeforeStates: ['active', 'inactive'],
    })
  }
  await verifyReplayAudits(db, replay, expectations)
  return replayOperationResult(replay, result)
}

async function recoverEligibilityReplayDesired(
  db: QueryCtx['db'],
  replay: Readonly<{ effectRefs: readonly string[] }>,
  command: Readonly<{ actor: SupplyCommandActor; eligibility: EligibilityInput; context: RegistrationContext }>,
): Promise<DesiredEligibility> {
  if (replay.effectRefs.length !== 2) throw new Error('capability_supply_operation_integrity_failure')
  const eventId = supplyAuditEventId({
    eventType: 'capability_supply.eligibility_changed', targetType: 'capability_offering',
    action: 'set_eligibility',
    targetRef: command.eligibility.offeringId, actor: command.actor, context: command.context,
    payload: {}, beforeState: '', afterState: '', createdAt: 0,
  })
  const audit = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (audit === null || (audit.afterState !== 'active' && audit.afterState !== 'inactive')) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  if (command.eligibility.decision === 'admit' && audit.afterState !== 'active') {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  return desiredEligibility(command.eligibility.decision, audit.afterState)
}

async function verifyReplayAudits(
  db: QueryCtx['db'],
  replay: Readonly<{ effectRefs: readonly string[] }>,
  expectations: readonly Readonly<{ audit: SupplyAuditInput; allowedBeforeStates: readonly string[] }>[],
): Promise<void> {
  if (replay.effectRefs.length !== expectations.length) {
    throw new Error('capability_supply_operation_integrity_failure')
  }
  for (const [index, expectation] of expectations.entries()) {
    const eventId = supplyAuditEventId(expectation.audit)
    const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
    if (
      existing === null
      || replay.effectRefs[index] !== storedSupplyAuditEffectRef(existing)
      || !storedAuditMatches(existing, expectation.audit, expectation.allowedBeforeStates)
    ) {
      throw new Error('capability_supply_operation_integrity_failure')
    }
  }
}

async function ensureSupplyAudit(
  db: MutationCtx['db'],
  input: SupplyAuditInput,
): Promise<string> {
  const eventId = supplyAuditEventId(input)
  const redactedPayloadJson = stableStringify(input.payload)
  const payloadHash = canonicalDigest(input.payload)
  const existing = await db.query('auditEvents').withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
  if (existing !== null) {
    if (!storedAuditMatches(existing, input, [input.beforeState])) {
      throw new Error('capability_supply_audit_integrity_failure')
    }
    return storedSupplyAuditEffectRef(existing)
  }
  await db.insert('auditEvents', {
    eventId, eventType: input.eventType, actorKind: input.actor.kind, actorRef: input.actor.ref,
    targetType: input.targetType, targetRef: input.targetRef,
    beforeState: input.beforeState, afterState: input.afterState,
    idempotencyKey: input.context.operationKey, correlationId: input.context.correlationId,
    reasonCode: input.context.reasonCode, evidenceRefs: [...input.context.evidenceRefs],
    redactedPayloadJson, payloadHash, createdAt: input.createdAt,
  })
  return supplyAuditEffectRef(input)
}
