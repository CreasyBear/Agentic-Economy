import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import {
  registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite,
} from '@/modules/capability-supply/public'
import {
  isRegisteredOperationMappingRef,
  resolveRegisteredOperationMappingRef,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'
import {
  getEligibleExactCapabilitySupply as getEligibleExactCapabilitySupplyFromModule,
  listIntegratedCapabilitySupply as listIntegratedCapabilitySupplyFromModule,
  listRouteableCapabilitySupply as listRouteableCapabilitySupplyFromModule,
  setCapabilitySupplyEligibility as setCapabilitySupplyEligibilityWrite,
  type EligibilityInput,
} from '@/modules/capability-supply/public'
import {
  queryCapabilityGraph as queryCapabilityGraphFromModule,
  readCapabilityProbeTarget as readCapabilityProbeTargetFromModule,
  recordCapabilityProbeResult as recordCapabilityProbeResultFromModule,
} from '@/modules/capability-supply/public'
import {
  contractRefFromRow,
  registerCapabilityOffering as registerCapabilityOfferingWrite,
} from '@/modules/capability-supply/public'
import {
  registerCapabilityBindingCommand as runRegisterBindingCommand,
  registerCapabilityOfferingCommand as runRegisterOfferingCommand,
  quarantineCapabilityBindingCommand as runQuarantineCommand,
  setCapabilitySupplyEligibilityCommand as runSetEligibilityCommand,
  type OperationLedgerPorts,
} from '@/modules/capability-supply/public'
import {
  admitCapabilityPublicationCommand,
  decodeConvexPublicationSource,
  publicationLifecycle,
  publicationProjection,
  publishCapabilityCommand,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
} from '@/modules/capability-supply/public'
import {
  bindingObservedRowDigest,
} from '@/modules/capability-supply/public'
import {
  boundedTrimmed,
  validEvidenceRefs,
  validRegistrationContext,
  type RegistrationContext,
  type CapabilityPublicationAdmissionSource,
  type SupplyCommandActor,
} from '@/modules/capability-supply/public'
import { registeredOperationMappingValue } from './capabilitySupplyValues'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { internal } from './_generated/api'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import type { Id } from './_generated/dataModel'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import {
  deriveBusinessOfferingSupportFromCapabilitySupply,
  rebuildBusinessSupplyProjectionSnapshotCommand,
} from './capabilitySupplyProjection'

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

const queryMappingValue = v.array(v.object({
  inputPointer: v.string(),
  parameter: v.string(),
}))
const fixedQueryValue = v.array(v.object({
  parameter: v.string(),
  value: v.string(),
}))
const adapterConfigScalarValue = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
)
const adapterConfigObjectValue = v.record(v.string(), adapterConfigScalarValue)
const adapterConfigValue = v.record(
  v.string(),
  v.union(
    adapterConfigScalarValue,
    v.array(adapterConfigScalarValue),
    adapterConfigObjectValue,
    v.array(adapterConfigObjectValue),
  ),
)
const adapterValue = v.object({
  adapterId: v.string(),
  config: v.union(v.null(), adapterConfigValue),
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
  adapter: adapterValue,
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
  adapter: adapterValue,
  registrationEvidenceRefs: evidenceRefsValue,
})
const capabilityContractMetadataValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  name: v.string(),
  description: v.string(),
  customerAnnotations: v.array(v.object({
    annotationId: v.string(),
    semanticIdentity: v.optional(v.string()),
    document: v.union(v.literal('input'), v.literal('output')),
    pointer: v.string(),
    label: v.string(),
    prompt: v.optional(v.string()),
    role: v.union(
      v.literal('request'),
      v.literal('constraint'),
      v.literal('comparison'),
      v.literal('commitment'),
      v.literal('result'),
      v.literal('completion_evidence'),
      v.literal('recovery'),
    ),
    inference: v.optional(v.union(v.literal('allowed'), v.literal('customer_required'))),
  })),
  dataUse: v.array(v.object({
    effectId: v.string(),
    inputPointer: v.string(),
    classification: v.union(v.literal('public'), v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
    phase: v.union(v.literal('preparation'), v.literal('execution')),
    recipient: v.union(
      v.object({ kind: v.literal('candidate_binding') }),
      v.object({ kind: v.literal('selected_binding') }),
      v.object({ kind: v.literal('named_recipient'), recipientId: v.string() }),
    ),
    purposes: v.array(v.string()),
  })),
  effects: v.array(v.object({
    effectId: v.string(),
    class: v.union(v.literal('data_release'), v.literal('financial_exposure'), v.literal('external_state_change')),
    authority: v.union(v.literal('none'), v.literal('explicit'), v.literal('mandate_or_explicit')),
    reversibility: v.union(
      v.literal('not_applicable'),
      v.literal('reversible'),
      v.literal('conditional'),
      v.literal('irreversible'),
    ),
  })),
  evidence: v.array(v.object({
    evidenceId: v.string(),
    outputPointer: v.string(),
    purpose: v.union(v.literal('comparison'), v.literal('completion'), v.literal('recovery')),
  })),
  lifecycle: v.object({
    idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
    recovery: v.union(v.literal('retry_safe'), v.literal('reconcile_required')),
  }),
})
const capabilityImporterCommercialValue = v.object({
  offering: capabilityPublicationOfferingValue,
  bindingId: v.string(),
  credentialRef: v.string(),
  registrationEvidenceRefs: evidenceRefsValue,
  requestTimeoutMs: v.number(),
})
const capabilityPublicationSourceValue = v.union(
  v.object({
    kind: v.literal('ae_envelope'),
    documentJson: v.string(),
  }),
  v.object({
    kind: v.literal('openapi_http'),
    documentJson: v.string(),
    'operation': v.object({ path: v.string(), method: v.union(v.literal('get'), v.literal('post')) }),
    fixedQuery: v.optional(fixedQueryValue),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
  v.object({
    kind: v.literal('mcp'),
    serverUrl: v.string(),
    toolJson: v.string(),
    protocolVersion: v.string(),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
  v.object({
    kind: v.literal('x402'),
    resourceJson: v.string(),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
)
const publicationAuthorityModeValue = v.union(
  v.literal('provider_owned'),
  v.literal('ae_curated_external'),
)
const capabilityPublicationAdmissionSourceValue = v.union(
  v.object({
    kind: v.literal('ae_envelope'),
    sourceRevision: v.string(),
    documentJson: v.string(),
    offering: capabilityPublicationOfferingValue,
    binding: capabilityPublicationBindingValue,
    evidenceRefs: evidenceRefsValue,
  }),
  v.object({
    kind: v.literal('openapi_http'),
    sourceRevision: v.string(),
    documentJson: v.string(),
    fixedQuery: v.optional(fixedQueryValue),
    operation: v.object({ path: v.string(), method: v.union(v.literal('get'), v.literal('post')) }),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
  v.object({
    kind: v.literal('mcp'),
    serverUrl: v.string(),
    toolJson: v.string(),
    protocolVersion: v.string(),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
  v.object({
    kind: v.literal('x402'),
    sourceRevision: v.string(),
    resourceJson: v.string(),
    contract: capabilityContractMetadataValue,
    commercial: capabilityImporterCommercialValue,
    evidenceRefs: evidenceRefsValue,
  }),
)
const mappingFailureReason = v.union(
  v.literal('authorization_denied'),
  v.literal('registration_context_invalid'),
  v.literal('mapping_invalid'),
  v.literal('mapping_integrity_failure'),
  v.literal('contract_not_found'),
  v.literal('contract_not_active'),
  v.literal('contract_integrity_failure'),
  v.literal('network_not_owned'),
  v.literal('operation_key_conflict'),
)
const registerMappingResultValue = v.union(
  v.object({ kind: v.literal('registered'), mappingRef: v.string() }),
  v.object({ kind: v.literal('refused'), reason: mappingFailureReason }),
)
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
    operationRef: v.string(),
    admittedOperation: v.object({
      publicationRef: v.string(), publicationRevision: v.number(),
      publisherRef: v.string(), sourceRevision: v.string(), sourceDigest: v.string(),
      businessId: v.string(), offeringId: v.string(),
      catalogOfferingRef: v.string(), catalogOfferingRevision: v.number(),
      offeringRegistrationHash: v.string(), offeringEligibilityHash: v.string(),
      bindingId: v.string(), bindingRegistrationHash: v.string(),
      bindingEligibilityHash: v.string(), bindingConfigDigest: v.string(),
      operationId: v.string(),
      contractRef: v.object({
        capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
      }),
      effectDigest: v.string(), commercialDigest: v.string(),
      provenanceDigest: v.string(), qualificationDigest: v.string(),
      readinessValidUntil: v.number(),
    }),
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
const capabilityPublicationAdmissionResultValue = v.union(
  v.object({
    kind: v.union(v.literal('published'), v.literal('replayed')),
    operationId: v.string(),
    operationName: v.literal('publishCapability'),
    publisherRef: v.string(),
    provenanceDigest: v.string(),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    contractRef: contractRefValue,
    catalogOfferingRef: v.string(),
    catalogOfferingRevision: v.number(),
    offeringId: v.string(),
    bindingId: v.string(),
    sourceRevision: v.string(),
    sourceDigest: v.string(),
    authorityMode: publicationAuthorityModeValue,
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('registration_context_invalid'),
      v.literal('source_revision_invalid'),
      v.literal('catalog_offering_invalid'),
      v.literal('provenance_invalid'),
      v.literal('source_invalid'),
      v.literal('source_too_large'),
      v.literal('source_too_deep'),
      v.literal('source_version_unsupported'),
      v.literal('selector_invalid'),
      v.literal('operation_not_found'),
      v.literal('schema_missing'),
      v.literal('schema_profile_unsupported'),
      v.literal('transport_unsupported'),
      v.literal('commercial_metadata_inconsistent'),
      v.literal('payment_execution_unsupported'),
      v.literal('contract_too_large'),
      v.literal('contract_invalid'),
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
      v.literal('operation_key_conflict'),
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
type RegisteredOperationMappingInput = Infer<typeof registeredOperationMappingValue>

export const publishCapability = mutation({
  args: {
    businessId: v.id('businesses'),
    source: capabilityPublicationSourceValue,
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
    const ports = publicationPorts(ctx)
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const actor = { kind: 'owner' as const, ref: identity.subject }
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
    }, ports)
    if (result.kind !== 'refused') {
      const projected = publicationProjection(
        result.contractRef,
        result.offeringId,
        result.bindingId,
        result.lifecycle,
      )
      if (result.kind === 'published') {
        await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, Date.now())
      }
      return projected
    }
    return result
  },
})
export const admitCapabilityPublication = mutation({
  args: {
    businessId: v.id('businesses'),
    catalogOfferingRef: v.string(),
    catalogOfferingRevision: v.number(),
    source: capabilityPublicationAdmissionSourceValue,
    authorityMode: publicationAuthorityModeValue,
    ...contextFields,
  },
  returns: capabilityPublicationAdmissionResultValue,
  handler: async (ctx, args): Promise<Infer<typeof capabilityPublicationAdmissionResultValue>> => {
    if (!validRegistrationContext(args)) {
      return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
    }
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    let actor: SupplyCommandActor
    if (args.authorityMode === 'provider_owned') {
      if (!await ownsPublishedBusiness(ctx, args.businessId)) {
        return { kind: 'refused' as const, reason: 'authorization_denied' as const }
      }
      actor = { kind: 'owner', ref: identity.subject }
    } else {
      const authority = await resolveAdminAuthority(
        { db: ctx.db, auth: ctx.auth },
        'register_capability_supply',
      )
      if (authority.kind !== 'allowed') {
        return { kind: 'refused' as const, reason: 'authorization_denied' as const }
      }
      actor = { kind: 'admin', ref: authority.membership.clerkUserId }
    }
    const result = await admitCapabilityPublicationCommand({
      businessId: args.businessId,
      catalogOfferingRef: args.catalogOfferingRef,
      catalogOfferingRevision: args.catalogOfferingRevision,
      source: decodeConvexPublicationSource(args.source) as CapabilityPublicationAdmissionSource,
      authorityMode: args.authorityMode,
      actor,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
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


const READINESS_REFRESH_LEAD_MS = 90_000
const MAX_READINESS_REFRESH_BATCH = 20

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
        probeQuery: v.array(v.object({ parameter: v.string(), value: v.string() })),
        probeMethod: v.union(v.literal('GET'), v.literal('HEAD')),
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

export const scheduleDueCapabilityProbes = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const due = await ctx.db.query('capabilityPublications')
      .withIndex('by_disposition_and_readinessValidUntil', (index) => (
        index.eq('disposition', 'current')
          .lt('readinessValidUntil', Date.now() + READINESS_REFRESH_LEAD_MS)
      ))
      .take(MAX_READINESS_REFRESH_BATCH)
    await Promise.all(due.map((publication) => ctx.scheduler.runAfter(
      0,
      internal.capabilitySupplyReadiness.probe,
      {
        publicationRef: publication.publicationRef,
        expectedRevision: publication.revision,
      },
    )))
    return due.length
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
    source: capabilityPublicationSourceValue,
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
        { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
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
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
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
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
    )
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityBindingCommand(ctx.db, {
      actor: { kind: 'admin', ref: authority.membership.clerkUserId },
      registration: args.registration,
      context: args,
    }, Date.now()) as Infer<typeof registerBindingResultValue>
  },
})
export const registerMapping = mutation({
  args: {
    networkId: v.string(),
    mapping: registeredOperationMappingValue,
    authorityMode: publicationAuthorityModeValue,
    registrationEvidenceRefs: evidenceRefsValue,
  },
  returns: registerMappingResultValue,
  handler: async (ctx, args) => {
    if (!boundedTrimmed(args.networkId, 200) || !validEvidenceRefs(args.registrationEvidenceRefs)) {
      return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
    }
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    const authority = await resolveMappingAuthority(ctx, args.networkId, args.mapping, args.authorityMode, identity.subject)
    if (authority.kind === 'refused') return authority
    return await registerMappingCommand(ctx.db, { ...args, ...authority })
  },
})

type MappingCommandInput = Readonly<{
  networkId: string
  mapping: RegisteredOperationMappingInput
  authorityMode: Infer<typeof publicationAuthorityModeValue>
  registrationEvidenceRefs: readonly string[]
  actorKind: 'owner' | 'admin' | 'system'
  publisherRef: string
}>

async function registerMappingCommand(
  db: MutationCtx['db'],
  input: MappingCommandInput,
) {
  let mapping: RegisteredOperationMapping
  try {
    if (!isRegisteredOperationMappingRef(input.mapping.mappingRef)) {
      return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
    }
    mapping = { ...input.mapping, mappingRef: input.mapping.mappingRef }
    if (resolveRegisteredOperationMappingRef(mapping) !== mapping.mappingRef) {
      return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
    }
  } catch {
    return { kind: 'refused' as const, reason: 'mapping_invalid' as const }
  }
  const mappingRef = mapping.mappingRef
  const contracts = await validateMappingContracts(db, mapping)
  if (contracts.kind === 'refused') return contracts
  const existingMapping = await db.query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) => (
      query.eq('networkId', input.networkId).eq('mappingRef', mappingRef)
    ))
    .unique()
  if (existingMapping !== null && toRegisteredOperationMapping(existingMapping) === null) {
    return { kind: 'refused' as const, reason: 'mapping_integrity_failure' as const }
  }
  const requestHash = canonicalDigest({
    networkId: input.networkId,
    mapping,
    authorityMode: input.authorityMode,
  })
  const existingOperation = await db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => (
      query.eq('actorRef', input.publisherRef)
        .eq('operationName', 'registerMapping')
        .eq('key', mappingRef)
    ))
    .unique()
  if (existingOperation !== null) {
    if (existingOperation.requestHash !== requestHash || existingOperation.status !== 'succeeded') {
      return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
    }
    return { kind: 'registered' as const, mappingRef }
  }
  const now = Date.now()
  const operationId = await db.insert('operationKeys', {
    scope: 'capability_supply',
    actorKind: input.actorKind,
    actorRef: input.publisherRef,
    operationName: 'registerMapping',
    key: mappingRef,
    requestHash,
    status: 'in_progress',
    effectRefs: [],
    createdAt: now,
    updatedAt: now,
  })
  if (existingMapping === null) {
    const { mappingRef: storedMappingRef, ...material } = mapping
    await db.insert('registeredOperationMappings', {
      networkId: input.networkId,
      mappingRef: storedMappingRef,
      material,
      publisherRef: input.publisherRef,
      authorityMode: input.authorityMode,
      registrationEvidenceRefs: [...input.registrationEvidenceRefs],
      registeredAt: now,
      updatedAt: now,
    })
  }
  await db.patch(operationId, {
    status: 'succeeded',
    resultHash: canonicalDigest({ mappingRef }),
    updatedAt: now,
  })
  return { kind: 'registered' as const, mappingRef }
}

export async function registerCuratedMapping(
  ctx: MutationCtx,
  input: Readonly<{
    networkId: string
    mapping: RegisteredOperationMappingInput
    registrationEvidenceRefs: readonly string[]
  }>,
) {
  if (!boundedTrimmed(input.networkId, 200) || !validEvidenceRefs(input.registrationEvidenceRefs)) {
    return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
  }
  return await registerMappingCommand(ctx.db, {
    ...input,
    authorityMode: 'ae_curated_external',
    actorKind: 'system',
    publisherRef: 'system:curated-provider-bootstrap',
  })
}

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
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
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
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
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
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
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

export const listIntegrated = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) => await listIntegratedCapabilitySupply(ctx.db, args) as Infer<typeof eligibleSupplyResultValue>,
})

export const listRouteable = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) => await listRouteableCapabilitySupply(ctx.db, args) as Infer<typeof eligibleSupplyResultValue>,
})
export const listMappings = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: v.array(registeredOperationMappingValue),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('registeredOperationMappings')
      .withIndex('by_networkId_and_mappingRef', (query) => query.eq('networkId', args.networkId))
      .take(args.limit)
    return rows.flatMap((row) => {
      const mapping = toRegisteredOperationMapping(row)
      return mapping === null ? [] : [mapping]
    })
  },
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

export async function listIntegratedCapabilitySupply(
  db: QueryCtx['db'], input: Readonly<{ networkId: string; limit: number; now?: number }>,
) {
  return listIntegratedCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
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
type MappingAuthorityResult =
  | Readonly<{ kind: 'allowed'; actorKind: 'owner' | 'admin'; publisherRef: string }>
  | Readonly<{ kind: 'refused'; reason: 'authorization_denied' | 'network_not_owned' }>

async function resolveMappingAuthority(
  ctx: MutationCtx,
  networkId: string,
  mapping: RegisteredOperationMappingInput,
  authorityMode: 'provider_owned' | 'ae_curated_external',
  principalId: string,
): Promise<MappingAuthorityResult> {
  const current = await ctx.db.query('capabilityPublications')
    .withIndex('by_networkId_and_disposition', (query) => (
      query.eq('networkId', networkId).eq('disposition', 'current')
    ))
    .take(128)
  const source = current.filter((publication) => (
    publication.capabilityId === mapping.sourceContractRef.capabilityId
      && publication.version === mapping.sourceContractRef.version
      && publication.contractDigest === mapping.sourceContractRef.contractDigest
  ))
  const target = current.filter((publication) => (
    publication.capabilityId === mapping.targetContractRef.capabilityId
      && publication.version === mapping.targetContractRef.version
      && publication.contractDigest === mapping.targetContractRef.contractDigest
  ))
  if (source.length === 0 || target.length === 0) {
    return { kind: 'refused', reason: 'network_not_owned' }
  }
  if (authorityMode === 'ae_curated_external') {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth }, 'register_capability_supply',
    )
    return authority.kind === 'allowed'
      ? { kind: 'allowed', actorKind: 'admin', publisherRef: authority.membership.clerkUserId }
      : { kind: 'refused', reason: 'authorization_denied' }
  }
  for (const publication of source) {
    const business = await publishedBusiness(ctx.db, publication.businessId)
    if (business === null) continue
    const owner = await ctx.db.get(business.ownerId)
    if (owner?.clerkUserId === principalId) {
      return { kind: 'allowed', actorKind: 'owner', publisherRef: principalId }
    }
  }
  return { kind: 'refused', reason: 'network_not_owned' }
}

async function validateMappingContracts(
  db: MutationCtx['db'],
  mapping: RegisteredOperationMappingInput,
): Promise<
  | Readonly<{ kind: 'ok' }>
  | Readonly<{ kind: 'refused'; reason: 'contract_not_found' | 'contract_not_active' | 'contract_integrity_failure' }>
> {
  const [source, target] = await Promise.all([
    getActiveExactCapabilityContract(db, mapping.sourceContractRef),
    getActiveExactCapabilityContract(db, mapping.targetContractRef),
  ])
  const failure = [source, target].find((result) => result.kind === 'unavailable')
  if (failure?.kind === 'unavailable') {
    return {
      kind: 'refused',
      reason: failure.reason === 'not_found'
        ? 'contract_not_found'
        : failure.reason === 'not_active'
          ? 'contract_not_active'
          : 'contract_integrity_failure',
    }
  }
  return { kind: 'ok' }
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
  const db = ctx.db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(db, businessId, now)
  await rebuildBusinessSupplyProjectionSnapshotCommand({
    db,
    sourceDb: db,
    businessId,
    support,
    now,
  })
}

async function rebuildCapabilityOfferingOriginSupplyProjection(
  ctx: MutationCtx,
  offeringId: string,
  now: number,
): Promise<void> {
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', offeringId)).unique()
  if (offering?.origin?.kind !== 'catalog_offering') return
  await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId, now)
}
/** Bounded owner readback for the six-step publisher and single-player panel. */
const ownerSupplyAccessPathDescriptorValue = v.union(
  v.object({
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)
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
type OwnerSupplyAccessPathDescriptor = Infer<typeof ownerSupplyAccessPathDescriptorValue>
type OwnerSupplyAdvanceResult = Infer<typeof ownerSupplyAdvanceResultValue>
type OwnerSupplyPublishResult = Infer<typeof ownerSupplyPublishResultValue>

function ownerSupplyLiteral<const Values extends readonly string[]>(value: unknown, values: Values, label: string): Values[number] {
  if (typeof value === 'string' && values.some((candidate) => candidate === value)) return value as Values[number]
  throw new Error(`Invalid owner supply ${label}`)
}

function ownerSupplyOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  throw new Error(`Invalid owner supply ${label}`)
}

function ownerSupplyOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  throw new Error(`Invalid owner supply ${label}`)
}

function ownerSupplyStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid owner supply ${label}`)
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`Invalid owner supply ${label}`)
    strings.push(item)
  }
  return strings
}

function ownerSupplyAccessPathDescriptor(value: unknown): OwnerSupplyAccessPathDescriptor {
  if (!isOwnerSupplyRecord(value)) throw new Error('Invalid owner supply access path descriptor')
  if (value.kind === 'human_request') {
    const channel = ownerSupplyLiteral(value.channel, ['phone', 'website', 'ae_inquiry'] as const, 'access channel')
    const disclosure = typeof value.disclosure === 'string' ? value.disclosure : (() => { throw new Error('Invalid owner supply disclosure') })()
    const url = ownerSupplyOptionalString(value.url, 'access URL')
    return { kind: 'human_request', channel, disclosure, ...(url === undefined ? {} : { url }) }
  }
  if (value.kind === 'external_operation') {
    const name = typeof value.name === 'string' ? value.name : (() => { throw new Error('Invalid owner supply operation name') })()
    const summary = typeof value.summary === 'string' ? value.summary : (() => { throw new Error('Invalid owner supply operation summary') })()
    const url = typeof value.url === 'string' ? value.url : (() => { throw new Error('Invalid owner supply operation URL') })()
    const method = ownerSupplyOptionalString(value.method, 'operation method')
    const documentationUrl = ownerSupplyOptionalString(value.documentationUrl, 'operation documentation URL')
    const authenticationSummary = ownerSupplyOptionalString(value.authenticationSummary, 'operation authentication summary')
    const pricingSummary = ownerSupplyOptionalString(value.pricingSummary, 'operation pricing summary')
    const provenance = ownerSupplyLiteral(value.provenance, ['business_declared', 'publicly_observed'] as const, 'operation provenance')
    let interfaceDescription: { format: string; url?: string } | undefined
    if (value.interfaceDescription !== undefined) {
      if (!isOwnerSupplyRecord(value.interfaceDescription) || typeof value.interfaceDescription.format !== 'string') {
        throw new Error('Invalid owner supply interface description')
      }
      const interfaceUrl = ownerSupplyOptionalString(value.interfaceDescription.url, 'interface description URL')
      interfaceDescription = { format: value.interfaceDescription.format, ...(interfaceUrl === undefined ? {} : { url: interfaceUrl }) }
    }
    return {
      kind: 'external_operation',
      name,
      summary,
      url,
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance,
    }
  }
  throw new Error('Invalid owner supply access path descriptor kind')
}
const ownerSupplyStepValue = v.union(
  v.literal('describe'),
  v.literal('endpoint'),
  v.literal('readiness'),
  v.literal('pricing'),
  v.literal('test'),
  v.literal('publish'),
)
const ownerSupplyResultStepValue = v.union(ownerSupplyStepValue, v.literal('unknown'))
type OwnerSupplyStep = Infer<typeof ownerSupplyStepValue>
function isOwnerSupplyStep(value: unknown): value is OwnerSupplyStep {
  return value === 'describe'
    || value === 'endpoint'
    || value === 'readiness'
    || value === 'pricing'
    || value === 'test'
    || value === 'publish'
}


const ownerSupplyEndpointValue = v.object({
  sourceKind: v.union(v.literal('openapi_http'), v.literal('mcp'), v.literal('x402')),
  descriptor: v.string(),
  selector: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  queryMapping: v.string(),
  protocolVersion: v.string(),
  toolName: v.string(),
  requestTimeoutMs: v.number(),
  credentialRef: v.string(),
})
const ownerSupplyPricingValue = v.object({
  version: v.literal('pricing:v1'),
  unit: v.literal('call'),
  currency: v.string(),
  paidAmountMinor: v.number(),
  freeTier: v.optional(v.object({ maxCalls: v.number(), window: v.union(v.literal('day'), v.literal('month')) })),
})
const ownerSupplyValueValidator = v.object({
  step: v.optional(ownerSupplyResultStepValue),
  endpoint: v.optional(ownerSupplyEndpointValue),
  pricing: v.optional(ownerSupplyPricingValue),
  sourceKind: v.optional(v.union(v.literal('openapi_http'), v.literal('mcp'), v.literal('x402'))),
  descriptor: v.optional(v.string()),
  selector: v.optional(v.string()),
  endpointUrl: v.optional(v.string()),
  method: v.optional(v.union(v.literal('GET'), v.literal('POST'))),
  queryMapping: v.optional(v.string()),
  protocolVersion: v.optional(v.string()),
  toolName: v.optional(v.string()),
  requestTimeoutMs: v.optional(v.number()),
  credentialRef: v.optional(v.string()),
  version: v.optional(v.literal('pricing:v1')),
  unit: v.optional(v.literal('call')),
  currency: v.optional(v.string()),
  paidAmountMinor: v.optional(v.number()),
  freeTier: v.optional(v.object({ maxCalls: v.number(), window: v.union(v.literal('day'), v.literal('month')) })),
})
const ownerSupplyCompletedValue = v.object({
  step: ownerSupplyStepValue,
  state: v.literal('completed'),
  offeringRef: v.string(),
  revision: v.number(),
  message: v.string(),
  publicationRef: v.optional(v.string()),
})
const ownerSupplyAdvanceResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({ step: ownerSupplyResultStepValue, state: v.literal('refused'), refusal: v.literal('authorization_denied') }),
)
const ownerSupplyActionResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({
    step: v.union(v.literal('readiness'), v.literal('test')),
    state: v.literal('refused'),
    refusal: v.union(
      v.literal('authorization_denied'), v.literal('target_not_public'),
      v.literal('transport_unreachable'), v.literal('http_redirect'),
      v.literal('http_4xx'), v.literal('http_5xx'), v.literal('response_invalid'),
    ),
  }),
)
const ownerSupplyPublishResultValue = v.union(
  ownerSupplyCompletedValue,
  v.object({
    step: v.literal('publish'),
    state: v.literal('refused'),
    refusal: v.union(
      v.literal('authorization_denied'), v.literal('invalid_offering'),
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
    const offeringRows = await db.query('businessOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id)).take(50)
    const [revisions, accessPaths, publications, capabilityOfferings, events] = await Promise.all([
      db.query('businessOfferingRevisions').withIndex('by_businessId_and_createdAt', (q) => q.eq('businessId', business._id)).take(100),
      // Access-path status is draft|published|withdrawn; 'active' never matched.
      db.query('offeringAccessPaths').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id)).take(100),
      db.query('capabilityPublications').withIndex('by_businessId_and_disposition', (q) => q.eq('businessId', business._id).eq('disposition', 'current')).take(50),
      db.query('capabilityOfferings').withIndex('by_businessId_and_status', (q) => q.eq('businessId', business._id).eq('status', 'active')).take(50),
      db.query('capabilityCallEvents').withIndex('by_businessId_and_observedAt', (q) => q.eq('businessId', business._id)).order('desc').take(50),
    ])
    const offerings = offeringRows.map((offering) => {
      const revision = revisions.find((candidate) => candidate.offeringRef === offering.offeringRef && candidate.revision === offering.currentRevision)
      const paths = accessPaths.filter((path) => path.offeringRef === offering.offeringRef && path.offeringRevision === offering.currentRevision)
      const capabilityOffering = capabilityOfferings.find((candidate) => candidate.origin?.kind === 'catalog_offering' && candidate.origin.offeringRef === offering.offeringRef)
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
export async function publishCapabilityForSeed(
  ctx: MutationCtx,
  input: Omit<Parameters<typeof publishCapabilityCommand>[0], 'actor'>,
) {
  return publishCapabilityCommand({
    ...input,
    actor: { kind: 'system', ref: 'system:dev-seed' },
  }, publicationPorts(ctx))
}
export async function publishCuratedCapability(
  ctx: MutationCtx,
  input: Omit<Parameters<typeof publishCapabilityCommand>[0], 'actor'>,
) {
  return publishCapabilityCommand({
    ...input,
    actor: { kind: 'system', ref: 'system:curated-provider-bootstrap' },
  }, publicationPorts(ctx))
}
export async function withdrawCuratedCapability(
  ctx: MutationCtx,
  input: Readonly<{
    publicationRef: string
    expectedRevision: number
    evidenceRefs: readonly string[]
    now: number
  }>,
) {
  const ports = publicationPorts(ctx)
  const publication = await ports.loadPublicationAtRevision(
    input.publicationRef,
    input.expectedRevision,
  )
  if (publication === null) {
    return { kind: 'refused' as const, reason: 'publication_not_found' as const }
  }
  if (
    publication.publisherRef !== 'system:curated-provider-bootstrap'
    || publication.authorityMode !== 'ae_curated_external'
  ) {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  const result = await withdrawCapabilityCommand({
    publication,
    evidenceRefs: input.evidenceRefs,
    now: input.now,
  }, ports)
  if (result.kind === 'withdrawn') {
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId as Id<'businesses'>,
      input.now,
    )
  }
  return result
}
export const authorizeOwnerSupplyAction = internalQuery({
  args: { businessId: v.id('businesses') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    return actor.kind === 'authenticated_owner' && await ownsPublishedBusiness(ctx, args.businessId)
  },
})


function isOwnerSupplyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownerSupplyValue(value: unknown): Record<string, unknown> {
  return isOwnerSupplyRecord(value) ? value : {}
}

function ownerSupplyPricing(value: unknown): { currency: string; amountMinor: number } | undefined {
  const pricing = ownerSupplyValue(ownerSupplyValue(value).pricing)
  const currency = typeof pricing.currency === 'string' ? pricing.currency : ''
  const amountMinor = pricing.paidAmountMinor
  return currency.length > 0 && typeof amountMinor === 'number' && Number.isSafeInteger(amountMinor) && amountMinor >= 0
    ? { currency, amountMinor }
    : undefined
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


export const publishOwnerCapability = mutation({
  args: ownerSupplyInput,
  returns: ownerSupplyPublishResultValue,
  handler: async (ctx, args): Promise<OwnerSupplyPublishResult> => {
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
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { step: 'publish', state: 'refused', refusal: 'authorization_denied' as const }
    const result = await publishCapabilityCommand({
      businessId: args.businessId, source: { kind: 'ae_envelope', documentJson },
      offering: {
        offeringId, networkId: 'ae-demo-services', origin,
        presentation: { label: 'AE Demo Services', summary: revisionRow.summary, price: { kind: 'fixed', currency: pricing.currency, amountMinor: pricing.amountMinor }, materialTerms: [], commercialRelationship: { kind: 'none', summary: 'Direct demo endpoint.', influencesEligibility: false, influencesInclusion: false, influencesOrder: false, evidenceRefs: ['owner-supply:funnel'] } },
        searchTerms: ['home office', 'video calls', 'quote'], registrationEvidenceRefs: ['owner-supply:funnel'],
      },
      binding: { bindingId, endpointUrl, credentialRef: 'none', continuation: { kind: 'single_response', evidenceRefs: ['owner-supply:funnel'] }, cancellation: { kind: 'unsupported', evidenceRefs: ['owner-supply:funnel'] }, adapter: { adapterId: 'http-json:v1', config: { method: 'POST', requestTimeoutMs: 10_000 } }, registrationEvidenceRefs: ['owner-supply:funnel'] },

      operationKey: args.operationKey, correlationId: `owner-supply:${args.offeringRef}`, reasonCode: 'owner_supply_funnel', evidenceRefs: ['owner-supply:funnel'], actor: { kind: 'owner', ref: identity.subject }, now: Date.now(),
    }, publicationPorts(ctx))
    if (result.kind === 'refused') return { step: 'publish', state: 'refused', refusal: result.reason }
    await rebuildCapabilityOriginSupplyProjection(ctx, args.businessId, Date.now())
    return { step: 'publish', state: 'completed', offeringRef: args.offeringRef, revision: args.revision, message: 'Your service is live.', publicationRef: result.publicationRef }
  },
})
