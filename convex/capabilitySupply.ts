import type { PublicationLifecycle } from '@/modules/capability-supply/public'
import { v, type Infer } from 'convex/values'
import { connectionAuthoritySnapshotValue, dereferenceLocalSchema } from '@/modules/capability-supply/convex'

import { registerCapabilityTransportBinding as registerCapabilityTransportBindingWrite } from '@/modules/capability-supply/public'
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
  decodeConvexPublicationSource,
  preparePublicationDraft,
  publicationLifecycle,
  publicationProjection,
  publishPreparedCapabilityCommand,
  withdrawCapabilityCommand,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type PreparePublicationDraftRefusal,
  type PreparedPublicationMaterial,
  type PublishPreparedCapabilityCommandInput,
  type PublishPreparedCapabilityCommandResult,
  type PublishPreparedCapabilityRefusal,
} from '@/modules/capability-supply/public'
import { bindingObservedRowDigest } from '@/modules/capability-supply/public'
import {
  boundedTrimmed,
  validEvidenceRefs,
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
} from '@/modules/capability-supply/public'
import { registeredOperationMappingValue } from './capabilitySupplyValues'
import { toRegisteredOperationMapping } from './capabilitySupplyRowMappers'
import { getActiveExactCapabilityContract } from './capabilityContractDocuments'
import { isRecord } from '@/modules/common/is-record'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  capabilityPublicationSourceSelectorValue,
  pricingConfigValue,
  readinessOutcomeValue,
} from '@/modules/capability-supply/public'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import { resolveAdminAuthority, resolveBusinessActor } from './authz'
import type { Id } from './_generated/dataModel'
import {
  agentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from './agentAccessPrincipals'
import { eligibleSupplyPorts } from './capabilitySupplyEligiblePorts'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { capabilitySupplyOperationPorts } from './capabilitySupplyOperationPorts'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
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
  kind: v.union(
    v.literal('none'),
    v.literal('direct'),
    v.literal('affiliate'),
    v.literal('ownership'),
  ),
  summary: v.string(),
  influencesEligibility: v.boolean(),
  influencesInclusion: v.boolean(),
  influencesOrder: v.boolean(),
  evidenceRefs: evidenceRefsValue,
})
const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const priceValue = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmountValue }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountValue,
    maximum: exactAmountValue,
  }),
  v.object({ kind: v.literal('on_request') }),
)
const presentationValue = v.object({
  label: v.string(),
  summary: v.string(),
  price: priceValue,
  materialTerms: v.array(
    v.object({ termId: v.string(), label: v.string(), value: v.string() }),
  ),
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
const continuationValue = v.object({
  kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const cancellationValue = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
const keylessAuthorityValue = v.object({ kind: v.literal('keyless') })
const providerConnectionAuthorityValue = v.object({
  kind: v.literal('provider_connection'),
  connectionRef: v.string(),
  providerRef: v.string(),
})
const authorityValue = v.union(
  keylessAuthorityValue,
  providerConnectionAuthorityValue,
)
const capabilityProbeTargetFields = {
  publicationRef: v.string(),
  revision: v.number(),
  bindingId: v.string(),
  capabilityId: v.string(),
  endpointUrl: v.string(),
  adapterId: v.string(),
  probeKind: v.union(
    v.literal('ae_quote'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('x402'),
  ),
  probeQuery: v.array(v.object({ parameter: v.string(), value: v.string() })),
  probeMethod: v.union(v.literal('GET'), v.literal('POST')),
  transportConfigJson: v.string(),
  probeInputJson: v.optional(v.string()),
  outputSchemaJson: v.optional(v.string()),
  expectedPaymentJson: v.optional(v.string()),
  targetDigest: v.string(),
}
const capabilityProbeTargetValue = v.union(
  v.object({
    ...capabilityProbeTargetFields,
    authority: keylessAuthorityValue,
  }),
  v.object({
    ...capabilityProbeTargetFields,
    authority: providerConnectionAuthorityValue,
    connectionAuthority: connectionAuthoritySnapshotValue,
  }),
)
const queryMappingValue = v.array(
  v.object({
    inputPointer: v.string(),
    parameter: v.string(),
  }),
)
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
  authority: authorityValue,
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: adapterValue,
  registrationEvidenceRefs: evidenceRefsValue,
})
const publicationAuthorityModeValue = v.union(
  v.literal('provider_owned'),
  v.literal('ae_curated_external'),
  v.literal('third_party_gateway'),
  v.literal('observed_external'),
)
const contextFields = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: evidenceRefsValue,
}
const bindingControlStateValue = v.union(
  v.object({
    kind: v.literal('available'),
    bindingId: v.string(),
    observedRowDigest: v.string(),
    admission: v.union(v.literal('admitted'), v.literal('not_admitted')),
    conformance: v.union(v.literal('conformant'), v.literal('not_conformant')),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.literal('binding_not_found'),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.literal('authorization_denied'),
  }),
)
const eligibleSupplyValue = v.object({
  offering: v.object({
    offeringId: v.string(),
    businessId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    origin: v.optional(offeringOriginValue),
    presentation: presentationValue,
    status: v.literal('active'),
    registrationHash: v.string(),
    searchTerms: v.optional(v.array(v.string())),
  }),
  binding: v.object({
    bindingId: v.string(),
    offeringId: v.string(),
    networkId: v.string(),
    capabilityId: v.string(),
    version: v.number(),
    contractDigest: v.string(),
    endpointUrl: v.string(),
    authority: authorityValue,
    connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
    continuation: continuationValue,
    cancellation: cancellationValue,
    adapterId: v.string(),
    configJson: v.string(),
    configDigest: v.string(),
    admission: v.literal('admitted'),
    conformance: v.literal('conformant'),
    registrationHash: v.string(),
  }),
  publication: v.optional(
    v.object({
      publicationRef: v.string(),
      revision: v.number(),
      readinessValidUntil: v.number(),
      operationRef: v.string(),
      pricingConfig: pricingConfigValue,
      priceDigest: v.string(),
      connectionAuthority: v.optional(connectionAuthoritySnapshotValue),
      admittedOperation: v.object({
        publicationRef: v.string(),
        publicationRevision: v.number(),
        publisherRef: v.string(),
        sourceRevision: v.string(),
        sourceDigest: v.string(),
        businessId: v.string(),
        offeringId: v.string(),
        catalogOfferingRef: v.string(),
        catalogOfferingRevision: v.number(),
        offeringRegistrationHash: v.string(),
        offeringEligibilityHash: v.string(),
        bindingId: v.string(),
        bindingRegistrationHash: v.string(),
        bindingEligibilityHash: v.string(),
        bindingConfigDigest: v.string(),
        operationId: v.string(),
        contractRef: v.object({
          capabilityId: v.string(),
          version: v.number(),
          contractDigest: v.string(),
        }),
        effectDigest: v.string(),
        commercialDigest: v.string(),
        provenanceDigest: v.string(),
        qualificationDigest: v.string(),
        readinessValidUntil: v.number(),
      }),
    }),
  ),
})
const eligibleSupplyResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    supplies: v.array(eligibleSupplyValue),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('limit_invalid'),
      v.literal('eligible_supply_limit_exceeded'),
      v.literal('supply_integrity_failure'),
      v.literal('contract_integrity_failure'),
    ),
  }),
)
const publicationLifecycleValue = v.object({
  state: v.union(
    v.literal('inactive'),
    v.literal('active'),
    v.literal('withdrawn'),
    v.literal('incompatible'),
  ),
  reasons: v.array(
    v.union(
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
    ),
  ),
})
function convexPublicationLifecycle(
  lifecycle: PublicationLifecycle,
): Infer<typeof publicationLifecycleValue> {
  return { state: lifecycle.state, reasons: [...lifecycle.reasons] }
}
const capabilityPublicationValue = v.object({
  kind: v.literal('published'),
  publicationRef: v.string(),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  lifecycle: publicationLifecycleValue,
})
const capabilityGraphNodeValue = v.object({
  publicationRef: v.string(),
  revision: v.number(),
  businessId: v.id('businesses'),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  source: v.object({
    kind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    digest: v.string(),
  }),
  semantic: v.object({
    capabilityId: v.string(),
    name: v.string(),
    description: v.string(),
    inputSchemaDigest: v.string(),
    outputSchemaDigest: v.string(),
    customerAnnotations: v.array(
      v.object({
        annotationId: v.string(),
        semanticIdentity: v.optional(v.string()),
        document: v.union(v.literal('input'), v.literal('output')),
        pointer: v.string(),
        label: v.string(),
        role: v.union(
          v.literal('request'),
          v.literal('constraint'),
          v.literal('comparison'),
          v.literal('commitment'),
          v.literal('result'),
          v.literal('completion_evidence'),
          v.literal('recovery'),
        ),
        inference: v.optional(
          v.union(v.literal('allowed'), v.literal('customer_required')),
        ),
      }),
    ),
    searchTerms: v.array(v.string()),
  }),
  policy: v.object({
    effects: v.array(
      v.object({
        effectId: v.string(),
        class: v.union(
          v.literal('data_release'),
          v.literal('financial_exposure'),
          v.literal('external_state_change'),
        ),
        authority: v.union(
          v.literal('none'),
          v.literal('explicit'),
          v.literal('mandate_or_explicit'),
        ),
        reversibility: v.union(
          v.literal('not_applicable'),
          v.literal('reversible'),
          v.literal('conditional'),
          v.literal('irreversible'),
        ),
      }),
    ),
    dataUse: v.array(
      v.object({
        effectId: v.string(),
        inputPointer: v.string(),
        classification: v.union(
          v.literal('public'),
          v.literal('personal'),
          v.literal('sensitive'),
          v.literal('credential'),
        ),
        phase: v.union(v.literal('preparation'), v.literal('execution')),
        recipient: v.union(
          v.object({ kind: v.literal('candidate_binding') }),
          v.object({ kind: v.literal('selected_binding') }),
          v.object({
            kind: v.literal('named_recipient'),
            recipientId: v.string(),
          }),
        ),
        purposes: v.array(v.string()),
      }),
    ),
    lifecycle: v.object({
      idempotency: v.union(v.literal('not_applicable'), v.literal('required')),
      recovery: v.union(
        v.literal('retry_safe'),
        v.literal('reconcile_required'),
      ),
    }),
  }),
  cost: v.object({
    price: priceValue,
    commercialRelationship: commercialRelationshipValue,
  }),
  trust: v.object({
    tier: v.string(),
    publicStatus: v.literal('published'),
    claimStatus: v.literal('published'),
    suppressed: v.literal(false),
    currentlyPublished: v.literal(true),
  }),
  liveness: v.object({
    credentialState: v.union(
      v.literal('unobserved'),
      v.literal('ready'),
      v.literal('unavailable'),
    ),
    healthState: v.union(
      v.literal('unobserved'),
      v.literal('healthy'),
      v.literal('unhealthy'),
    ),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    stale: v.boolean(),
  }),
  routability: v.object({
    eligible: v.boolean(),
    reasons: v.array(v.string()),
  }),
  evidenceRefs: v.array(v.string()),
})
const capabilityGraphResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    nodes: v.array(capabilityGraphNodeValue),
    edges: v.array(
      v.object({
        kind: v.union(
          v.literal('published_by'),
          v.literal('bound_to'),
          v.literal('schema_compatible'),
        ),
        from: v.string(),
        to: v.string(),
      }),
    ),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('query_invalid'),
      v.literal('authorization_denied'),
      v.literal('graph_limit_exceeded'),
      v.literal('graph_integrity_failure'),
    ),
  }),
)
const preparedPublicationMaterialValue = v.object({
  sourceKind: v.union(
    v.literal('ae_envelope'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('agent_plugin_mcp'),
    v.literal('x402'),
  ),
  sourceSelector: capabilityPublicationSourceSelectorValue,
  sourceDescriptorJson: v.string(),
  sourceRevision: v.string(),
  sourceDigest: v.string(),
  documentJson: v.string(),
  offering: capabilityPublicationOfferingValue,
  binding: capabilityPublicationBindingValue,
  evidenceRefs: evidenceRefsValue,
  pricingConfigJson: v.string(),
  priceDigest: v.string(),
})
const preparedPublicationRefusalValue = v.union(
  v.literal('authorization_denied'),
  v.literal('registration_context_invalid'),
  v.literal('source_invalid'),
  v.literal('source_too_large'),
  v.literal('source_too_deep'),
  v.literal('source_version_unsupported'),
  v.literal('selector_invalid'),
  v.literal('operation_not_found'),
  v.literal('schema_missing'),
  v.literal('schema_profile_unsupported'),
  v.literal('openapi_query_parameter_definition_unsupported'),
  v.literal('openapi_query_parameter_serialization_unsupported'),
  v.literal('openapi_query_parameter_schema_unsupported'),
  v.literal('openapi_path_parameter_required'),
  v.literal('openapi_path_parameter_serialization_unsupported'),
  v.literal('openapi_header_parameter_unsafe'),
  v.literal('openapi_header_parameter_serialization_unsupported'),
  v.literal('openapi_media_type_unsupported'),
  v.literal('openapi_request_body_parameter_mix_unsupported'),
  v.literal('openapi_response_status_unsupported'),
  v.literal('openapi_operation_unsupported'),
  v.literal('admit_schema_circular_reference'),
  v.literal('admit_schema_reference_unresolvable'),
  v.literal('admit_schema_too_deep'),
  v.literal('admit_schema_deref_unavailable'),
  v.literal('admit_output_no_guaranteed_field'),
  v.literal('transport_unsupported'),
  v.literal('commercial_metadata_inconsistent'),
  v.literal('payment_execution_unsupported'),
  v.literal('payment_required_invalid'),
  v.literal('contract_too_large'),
  v.literal('contract_invalid'),
  v.literal('price_unavailable'),
  v.literal('source_revision_invalid'),
  v.literal('pricing_config_invalid'),
  v.literal('source_draft_missing'),
  v.literal('source_draft_stale'),
  v.literal('source_draft_unprepared'),
  v.literal('catalog_offering_origin_changed'),
  v.literal('contract_identity_conflict'),
  v.literal('contract_integrity_failure'),
  v.literal('offering_identity_conflict'),
  v.literal('offering_integrity_failure'),
  v.literal('binding_identity_conflict'),
  v.literal('binding_integrity_failure'),
  v.literal('offering_invalid'),
  v.literal('binding_invalid'),
  v.literal('adapter_not_registered'),
  v.literal('adapter_config_invalid'),
  v.literal('adapter_config_too_large'),
  v.literal('operation_key_conflict'),
  v.literal('registration_changed'),
  v.literal('connection_authority_stale'),
)
function preparedSourceSelector(
  selector: Infer<typeof capabilityPublicationSourceSelectorValue>,
): PreparedPublicationMaterial['sourceSelector'] {
  if (
    'path' in selector &&
    typeof selector.path === 'string' &&
    (selector.method === 'get' || selector.method === 'post')
  ) {
    return { path: selector.path, method: selector.method }
  }
  if (
    'serverName' in selector &&
    typeof selector.serverName === 'string' &&
    'toolName' in selector &&
    typeof selector.toolName === 'string' &&
    'protocolVersion' in selector &&
    typeof selector.protocolVersion === 'string'
  ) {
    return {
      serverName: selector.serverName,
      toolName: selector.toolName,
      protocolVersion: selector.protocolVersion,
    }
  }
  if (
    'toolName' in selector &&
    typeof selector.toolName === 'string' &&
    'protocolVersion' in selector &&
    typeof selector.protocolVersion === 'string'
  ) {
    return {
      toolName: selector.toolName,
      protocolVersion: selector.protocolVersion,
    }
  }
  if ('resourceUrl' in selector && typeof selector.resourceUrl === 'string') {
    return { resourceUrl: selector.resourceUrl }
  }
  return {}
}

function preparedPublicationMaterialFromConvex(
  material: Infer<typeof preparedPublicationMaterialValue>,
): PreparedPublicationMaterial {
  return {
    sourceKind: material.sourceKind,
    sourceSelector: preparedSourceSelector(material.sourceSelector),
    sourceDescriptorJson: material.sourceDescriptorJson,
    sourceRevision: material.sourceRevision,
    sourceDigest: material.sourceDigest,
    documentJson: material.documentJson,
    offering: material.offering,
    binding: material.binding,
    evidenceRefs: material.evidenceRefs,
    pricingConfigJson: material.pricingConfigJson,
    priceDigest: material.priceDigest,
  }
}
const preparedPublicationResultValue = v.union(
  v.object({
    kind: v.union(v.literal('published'), v.literal('replayed')),
    operationId: v.optional(v.string()),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    operationRef: v.string(),
    contractRef: contractRefValue,
    offeringId: v.string(),
    bindingId: v.string(),
    sourceKind: v.union(
      v.literal('ae_envelope'),
      v.literal('openapi_http'),
      v.literal('mcp'),
      v.literal('agent_plugin_mcp'),
      v.literal('x402'),
    ),
    sourceSelector: capabilityPublicationSourceSelectorValue,
    sourceRevision: v.string(),
    sourceDigest: v.string(),
    priceDigest: v.string(),
    authorityMode: publicationAuthorityModeValue,
    publisherRef: v.string(),
    provenanceDigest: v.string(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: preparedPublicationRefusalValue,
  }),
)
type PreparedPublicationResult = Infer<typeof preparedPublicationResultValue>
function convexPreparedPublicationResult(
  result: PublishPreparedCapabilityCommandResult,
): PreparedPublicationResult {
  if (result.kind === 'refused') return result
  return {
    kind: result.kind,
    ...(result.operationId === undefined
      ? {}
      : { operationId: result.operationId }),
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    operationRef: result.operationRef,
    contractRef: result.contractRef,
    offeringId: result.offeringId,
    bindingId: result.bindingId,
    sourceKind: result.sourceKind,
    sourceSelector: result.sourceSelector,
    sourceRevision: result.sourceRevision,
    sourceDigest: result.sourceDigest,
    priceDigest: result.priceDigest,
    authorityMode: result.authorityMode,
    publisherRef: result.publisherRef,
    provenanceDigest: result.provenanceDigest,
    lifecycle: {
      state: result.lifecycle.state,
      reasons: [...result.lifecycle.reasons],
    },
  }
}
export const publishPreparedCapability = mutation({
  args: {
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    revision: v.number(),
    sourceHash: v.string(),
    sourceDraftRevision: v.number(),
    sourceDigest: v.string(),
    runtimeEnvironment: v.literal('production'),
    prepared: preparedPublicationMaterialValue,
    ...contextFields,
    agentPrincipal: v.optional(agentAccessPrincipalValue),
    ...sourceWriteArgs,
  },
  returns: preparedPublicationResultValue,
  handler: async (
    ctx,
    args,
  ): Promise<Infer<typeof preparedPublicationResultValue>> => {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') {
      return {
        kind: 'refused' as const,
        reason: 'authorization_denied' as const,
      }
    }
    const agentAdmission = args.agentPrincipal === undefined
      ? undefined
      : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    const businessAuthorized = args.agentPrincipal === undefined
      ? await ownsPublishedBusiness(ctx, args.businessId)
      : agentAdmission?.kind === 'allowed'
        && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
    if (!validRegistrationContext(args) || !businessAuthorized) {
      return {
        kind: 'refused' as const,
        reason: 'authorization_denied' as const,
      }
    }
    const business = await publishedBusiness(ctx.db, args.businessId)
    const sourceDraft = await ctx.db
      .query('capabilitySupplySourceDrafts')
      .withIndex('by_businessId_and_offeringRef', (query) =>
        query
          .eq('businessId', args.businessId)
          .eq('offeringRef', args.offeringRef),
      )
      .first()
    if (sourceDraft === null) {
      return {
        kind: 'refused' as const,
        reason: 'source_draft_missing' as const,
      }
    }
    if (
      business === null ||
      sourceDraft.ownerId !== business.ownerId ||
      sourceDraft.businessId !== args.businessId ||
      sourceDraft.offeringRef !== args.offeringRef ||
      sourceDraft.offeringRevision !== args.revision ||
      sourceDraft.revision !== args.sourceDraftRevision ||
      sourceDraft.sourceDigest !== args.sourceDigest ||
      sourceDraft.preflight.draftRevision !== args.sourceDraftRevision ||
      sourceDraft.preflight.sourceDigest !== args.sourceDigest
    ) {
      return {
        kind: 'refused' as const,
        reason: 'source_draft_stale' as const,
      }
    }
    if (
      sourceDraft.preflight.status !== 'prepared' ||
      sourceDraft.preflight.summary === undefined
    ) {
      return {
        kind: 'refused' as const,
        reason: 'source_draft_unprepared' as const,
      }
    }
    const preparedDigest = canonicalDigest(args.prepared)
    if (
      sourceDraft.preflight.summary.sourceKind !== args.prepared.sourceKind ||
      sourceDraft.preflight.summary.sourceRevision !==
        args.prepared.sourceRevision ||
      sourceDraft.preflight.summary.sourceDigest !==
        args.prepared.sourceDigest ||
      sourceDraft.preflight.summary.priceDigest !== args.prepared.priceDigest ||
      sourceDraft.preflight.summary.preparedDigest !== preparedDigest
    ) {
      return {
        kind: 'refused' as const,
        reason: 'source_draft_stale' as const,
      }
    }
    const [catalogOffering, catalogRevision] = await Promise.all([
      ctx.db
        .query('businessOfferings')
        .withIndex('by_offeringRef', (query) =>
          query.eq('offeringRef', args.offeringRef),
        )
        .unique(),
      ctx.db
        .query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (query) =>
          query
            .eq('offeringRef', args.offeringRef)
            .eq('revision', args.revision),
        )
        .unique(),
    ])
    const origin = args.prepared.offering.origin
    if (
      catalogOffering === null ||
      catalogRevision === null ||
      catalogOffering.businessId !== args.businessId ||
      catalogRevision.businessId !== args.businessId ||
      catalogOffering.currentRevision !== args.revision ||
      args.sourceHash !== catalogRevision.sourceHash ||
      origin?.kind !== 'catalog_offering' ||
      origin.offeringRef !== args.offeringRef ||
      origin.offeringRevision !== args.revision ||
      origin.offeringSourceHash !== args.sourceHash
    ) {
      return {
        kind: 'refused' as const,
        reason: 'catalog_offering_origin_changed' as const,
      }
    }
    const identity = args.agentPrincipal === undefined
      ? await ctx.auth.getUserIdentity()
      : null
    if (args.agentPrincipal === undefined && identity === null)
      return {
        kind: 'refused' as const,
        reason: 'authorization_denied' as const,
      }
    const result = await publishPreparedCapabilityCommand(
      {
        businessId: String(args.businessId),
        runtimeEnvironment: args.runtimeEnvironment,
        prepared: args.prepared,
        actor: { kind: 'owner', ref: args.agentPrincipal?.ownerId ?? identity?.subject ?? '' },
        origin,
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
        now: Date.now(),
      },
      publicationPorts(ctx),
    )
    if (result.kind === 'refused')
      return convexPreparedPublicationResult(result)
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      args.businessId,
      Date.now(),
    )
    return convexPreparedPublicationResult(result)
  },
})

type ContractRef = Infer<typeof contractRefValue>
type RegisteredOperationMappingInput = Infer<
  typeof registeredOperationMappingValue
>

export const readCapabilityPublication = query({
  args: { publicationRef: v.string() },
  returns: v.union(capabilityPublicationValue, v.null()),
  handler: async (ctx, args) => {
    const publication = await ctx.db
      .query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) =>
        index.eq('publicationRef', args.publicationRef),
      )
      .order('desc')
      .first()
    if (
      publication === null ||
      !(await ownsPublishedBusiness(ctx, publication.businessId))
    )
      return null
    if (publication.disposition === 'incompatible') {
      const projection = publicationProjection(
        contractRefFromRow(publication),
        publication.offeringId,
        publication.bindingId,
        { state: 'incompatible', reasons: ['incompatible_revision'] },
      )
      return {
        ...projection,
        lifecycle: convexPublicationLifecycle(projection.lifecycle),
      }
    }
    const [offering, binding] = await Promise.all([
      ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (index) =>
          index.eq('offeringId', publication.offeringId),
        )
        .unique(),
      ctx.db
        .query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) =>
          index.eq('bindingId', publication.bindingId),
        )
        .unique(),
    ])
    if (offering === null || binding === null) return null
    const providerAuthority =
      binding.authority.kind === 'provider_connection'
        ? binding.authority
        : undefined
    const currentConnection =
      providerAuthority === undefined
        ? undefined
        : await ctx.db
            .query('capabilityProviderConnections')
            .withIndex('by_connectionRef', (index) =>
              index.eq('connectionRef', providerAuthority.connectionRef),
            )
            .unique()
    const projection = publicationProjection(
      contractRefFromRow(publication),
      publication.offeringId,
      publication.bindingId,
      publicationLifecycle(
        publication,
        offering,
        binding,
        Date.now(),
        currentConnection,
      ),
    )
    return {
      ...projection,
      lifecycle: convexPublicationLifecycle(projection.lifecycle),
    }
  },
})

/** Fixture/curated-seed helper. Production owner readiness uses probe → record. */
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
    v.object({
      kind: v.literal('observed'),
      publicationRef: v.string(),
      revision: v.number(),
      lifecycle: publicationLifecycleValue,
    }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(
        v.literal('authorization_denied'),
        v.literal('publication_not_found'),
        v.literal('revision_changed'),
        v.literal('observation_invalid'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now()
    if (
      !validRegistrationContext(args) ||
      !Number.isSafeInteger(args.expectedRevision) ||
      args.validUntil <= now ||
      args.validUntil > now + 86_400_000
    ) {
      return {
        kind: 'refused' as const,
        reason: 'observation_invalid' as const,
      }
    }
    const publication = await ctx.db
      .query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) =>
        index
          .eq('publicationRef', args.publicationRef)
          .eq('revision', args.expectedRevision),
      )
      .unique()
    if (publication === null)
      return {
        kind: 'refused' as const,
        reason: 'publication_not_found' as const,
      }
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
      ctx.db
        .query('capabilityOfferings')
        .withIndex('by_offeringId', (index) =>
          index.eq('offeringId', publication.offeringId),
        )
        .unique(),
      ctx.db
        .query('capabilityTransportBindings')
        .withIndex('by_bindingId', (index) =>
          index.eq('bindingId', publication.bindingId),
        )
        .unique(),
    ])
    if (offering === null || binding === null)
      throw new Error('capability_publication_supply_integrity_failure')
    const result = {
      kind: 'observed' as const,
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: convexPublicationLifecycle(
        publicationLifecycle(
          {
            ...publication,
            credentialState: args.credentialState,
            healthState: args.healthState,
            readinessObservedAt: now,
            readinessValidUntil: args.validUntil,
          },
          offering,
          binding,
          now,
        ),
      ),
    }
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId,
      now,
    )
    return result
  },
})

const READINESS_REFRESH_LEAD_MS = 90_000
const MAX_READINESS_REFRESH_BATCH = 20

const probeTargetUnavailableReasonValue = v.union(
  v.literal('publication_missing'),
  v.literal('publication_stale'),
  v.literal('offering_invalid'),
  v.literal('binding_invalid'),
  v.literal('contract_missing'),
  v.literal('input_unrepresentable'),
  v.literal('effectful_probe_unsupported'),
  v.literal('mcp_tool_missing'),
  v.literal('authority_stale'),
  v.literal('target_not_public'),
)

export const readCapabilityProbeTarget = internalQuery({
  args: { publicationRef: v.string(), expectedRevision: v.number() },
  returns: v.union(
    v.object({
      kind: v.literal('unavailable'),
      reason: probeTargetUnavailableReasonValue,
      evidenceRefs: v.array(v.string()),
    }),
    v.object({
      kind: v.literal('available'),
      target: capabilityProbeTargetValue,
    }),
  ),
  handler: async (ctx, args) => {
    const result = await readCapabilityProbeTargetFromModule(
      capabilitySupplyGraphPorts(ctx.db),
      args,
    )
    if (result.kind === 'unavailable') {
      return {
        kind: 'unavailable' as const,
        reason: result.reason,
        evidenceRefs: [...result.evidenceRefs],
      }
    }

    const { target } = result
    const targetFields = {
      publicationRef: target.publicationRef,
      revision: target.revision,
      bindingId: target.bindingId,
      capabilityId: target.capabilityId,
      endpointUrl: target.endpointUrl,
      adapterId: target.adapterId,
      probeKind: target.probeKind,
      probeQuery: target.probeQuery,
      probeMethod: target.probeMethod,
      transportConfigJson: target.transportConfigJson,
      ...(target.probeInputJson === undefined
        ? {}
        : { probeInputJson: target.probeInputJson }),
      ...(target.outputSchemaJson === undefined
        ? {}
        : { outputSchemaJson: target.outputSchemaJson }),
      ...(target.expectedPaymentJson === undefined
        ? {}
        : { expectedPaymentJson: target.expectedPaymentJson }),
      targetDigest: target.targetDigest,
    }
    if (target.authority.kind === 'provider_connection') {
      if (!('connectionAuthority' in target)) {
        return {
          kind: 'unavailable' as const,
          reason: 'authority_stale' as const,
          evidenceRefs: ['probe-target:authority-stale'],
        }
      }
      return {
        kind: 'available' as const,
        target: {
          ...targetFields,
          authority: {
            kind: 'provider_connection' as const,
            connectionRef: target.authority.connectionRef,
            providerRef: target.authority.providerRef,
          },
          connectionAuthority: {
            connectionRef: target.connectionAuthority.connectionRef,
            providerRef: target.connectionAuthority.providerRef,
            adapterId: target.connectionAuthority.adapterId,
            authorityGeneration: target.connectionAuthority.authorityGeneration,
            authorityDigest: target.connectionAuthority.authorityDigest,
            operationRef: target.connectionAuthority.operationRef,
            grantedScopes: target.connectionAuthority.grantedScopes,
            grantedResources: target.connectionAuthority.grantedResources,
          },
        },
      }
    }
    return {
      kind: 'available' as const,
      target: {
        ...targetFields,
        authority: { kind: 'keyless' as const },
      },
    }
  },
})

export const recordCapabilityProbeResult = internalMutation({
  args: {
    publicationRef: v.string(),
    expectedRevision: v.number(),
    targetDigest: v.string(),
    requestDigest: v.string(),
    responseStatus: v.optional(v.number()),
    responseContentType: v.optional(v.string()),
    responseDigest: v.optional(v.string()),
    outcome: readinessOutcomeValue,
    credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
    healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
    observedAt: v.number(),
    validUntil: v.number(),
    evidenceRefs: v.array(v.string()),
  },
  returns: v.union(
    v.object({
      kind: v.literal('observed'),
      publicationRef: v.string(),
      revision: v.number(),
      lifecycle: publicationLifecycleValue,
    }),
    v.object({
      kind: v.literal('refused'),
      reason: v.union(
        v.literal('revision_changed'),
        v.literal('target_changed'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const [publication, result] = await Promise.all([
      ctx.db
        .query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) =>
          index
            .eq('publicationRef', args.publicationRef)
            .eq('revision', args.expectedRevision),
        )
        .unique(),
      recordCapabilityProbeResultFromModule(
        capabilitySupplyGraphPorts(ctx.db),
        {
          ...args,
          now: Date.now(),
        },
      ),
    ])
    if (result.kind === 'observed' && publication !== null) {
      await rebuildCapabilityOriginSupplyProjection(
        ctx,
        publication.businessId as Id<'businesses'>,
        Date.now(),
      )
    }
    return result.kind === 'observed'
      ? { ...result, lifecycle: convexPublicationLifecycle(result.lifecycle) }
      : result
  },
})
export const scheduleDueCapabilityProbes = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const due = await ctx.db
      .query('capabilityPublications')
      .withIndex('by_disposition_and_readinessValidUntil', (index) =>
        index
          .eq('disposition', 'current')
          .lt('readinessValidUntil', Date.now() + READINESS_REFRESH_LEAD_MS),
      )
      .take(MAX_READINESS_REFRESH_BATCH)
    await Promise.all(
      due.map((publication) =>
        ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
          publicationRef: publication.publicationRef,
          expectedRevision: publication.revision,
        }),
      ),
    )
    return due.length
  },
})

export const queryCapabilityGraph = query({
  args: {
    networkId: v.string(),
    includeInactive: v.boolean(),
    limit: v.number(),
  },
  returns: capabilityGraphResultValue,
  handler: async (ctx, args) => {
    if (args.includeInactive) {
      const authority = await resolveAdminAuthority(
        { db: ctx.db, auth: ctx.auth },
        'register_capability_supply',
      )
      if (authority.kind !== 'allowed') {
        return {
          kind: 'unavailable' as const,
          reason: 'authorization_denied' as const,
        }
      }
    }
    return (await queryCapabilityGraphFromModule(
      capabilitySupplyGraphPorts(ctx.db),
      args,
    )) as Infer<typeof capabilityGraphResultValue>
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
  const existingMapping = await db
    .query('registeredOperationMappings')
    .withIndex('by_networkId_and_mappingRef', (query) =>
      query.eq('networkId', input.networkId).eq('mappingRef', mappingRef),
    )
    .unique()
  if (
    existingMapping !== null &&
    toRegisteredOperationMapping(existingMapping) === null
  ) {
    return {
      kind: 'refused' as const,
      reason: 'mapping_integrity_failure' as const,
    }
  }
  const requestHash = canonicalDigest({
    networkId: input.networkId,
    mapping,
    authorityMode: input.authorityMode,
  })
  const existingOperation = await db
    .query('operationKeys')
    .withIndex('by_actor_operation_key', (query) =>
      query
        .eq('actorRef', input.publisherRef)
        .eq('operationName', 'registerMapping')
        .eq('key', mappingRef),
    )
    .unique()
  if (existingOperation !== null) {
    if (
      existingOperation.requestHash !== requestHash ||
      existingOperation.status !== 'succeeded'
    ) {
      return {
        kind: 'refused' as const,
        reason: 'operation_key_conflict' as const,
      }
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
  if (
    !boundedTrimmed(input.networkId, 200) ||
    !validEvidenceRefs(input.registrationEvidenceRefs)
  ) {
    return {
      kind: 'refused' as const,
      reason: 'registration_context_invalid' as const,
    }
  }
  return await registerMappingCommand(ctx.db, {
    ...input,
    authorityMode: 'ae_curated_external',
    actorKind: 'system',
    publisherRef: 'system:curated-provider-bootstrap',
  })
}

export const inspectBindingControlState = query({
  args: { bindingId: v.string() },
  returns: bindingControlStateValue,
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'register_capability_supply',
    )
    if (authority.kind !== 'allowed')
      return {
        kind: 'refused' as const,
        reason: 'authorization_denied' as const,
      }
    const binding = await ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) =>
        index.eq('bindingId', args.bindingId),
      )
      .unique()
    if (binding === null)
      return {
        kind: 'unavailable' as const,
        reason: 'binding_not_found' as const,
      }
    return {
      kind: 'available' as const,
      bindingId: binding.bindingId,
      observedRowDigest: bindingObservedRowDigest(binding),
      admission: binding.admission,
      conformance: binding.conformance,
    }
  },
})

export const listIntegrated = internalQuery({
  args: { networkId: v.string(), limit: v.number(), now: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) =>
    (await listIntegratedCapabilitySupply(ctx.db, args)) as Infer<
      typeof eligibleSupplyResultValue
    >,
})

export const listRouteable = internalQuery({
  args: { networkId: v.string(), limit: v.number(), now: v.number() },
  returns: eligibleSupplyResultValue,
  handler: async (ctx, args) =>
    (await listRouteableCapabilitySupply(ctx.db, args)) as Infer<
      typeof eligibleSupplyResultValue
    >,
})
export const listMappings = internalQuery({
  args: { networkId: v.string(), limit: v.number() },
  returns: v.array(registeredOperationMappingValue),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('registeredOperationMappings')
      .withIndex('by_networkId_and_mappingRef', (query) =>
        query.eq('networkId', args.networkId),
      )
      .take(args.limit)
    return rows.flatMap((row) => {
      const mapping = toRegisteredOperationMapping(row)
      return mapping === null ? [] : [mapping]
    })
  },
})

export async function registerCapabilityOfferingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterOfferingCommand(portsFor(db), command, now)
}

export async function registerCapabilityBindingCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    registration: unknown
    context: RegistrationContext
  }>,
  now: number,
) {
  return runRegisterBindingCommand(portsFor(db), command, now)
}

export async function setCapabilitySupplyEligibilityCommand(
  db: MutationCtx['db'],
  command: Readonly<{
    actor: SupplyCommandActor
    eligibility: EligibilityInput
    context: RegistrationContext
  }>,
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
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
) {
  return registerCapabilityOfferingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
  )
}

export async function registerCapabilityTransportBinding(
  db: MutationCtx['db'],
  input: unknown,
  registeredAt: number,
  expectedOperationRef?: string,
) {
  return registerCapabilityTransportBindingWrite(
    capabilitySupplyWriterPorts(db),
    input,
    registeredAt,
    expectedOperationRef,
  )
}

export async function setCapabilitySupplyEligibility(
  db: MutationCtx['db'],
  input: EligibilityInput,
  updatedAt: number,
) {
  return setCapabilitySupplyEligibilityWrite(
    capabilitySupplyWriterPorts(db),
    input,
    updatedAt,
  )
}

export async function listIntegratedCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listIntegratedCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function listRouteableCapabilitySupply(
  db: QueryCtx['db'],
  input: Readonly<{ networkId: string; limit: number; now: number }>,
) {
  return listRouteableCapabilitySupplyFromModule(eligibleSupplyPorts(db), input)
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
    now: number
  }>,
) {
  return getEligibleExactCapabilitySupplyFromModule(
    eligibleSupplyPorts(db),
    input,
  )
}

export async function ownsPublishedBusiness(
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
export async function ownsPublishedBusinessForOwnerId(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
  ownerId: string,
): Promise<boolean> {
  const business = await publishedBusiness(ctx.db, businessId)
  if (business === null) return false
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', ownerId))
    .unique()
  return owner !== null && business.ownerId === owner._id
}
type MappingAuthorityResult =
  | Readonly<{
      kind: 'allowed'
      actorKind: 'owner' | 'admin'
      publisherRef: string
    }>
  | Readonly<{
      kind: 'refused'
      reason: 'authorization_denied' | 'network_not_owned'
    }>

async function validateMappingContracts(
  db: MutationCtx['db'],
  mapping: RegisteredOperationMappingInput,
): Promise<
  | Readonly<{ kind: 'ok' }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'contract_not_found'
        | 'contract_not_active'
        | 'contract_integrity_failure'
    }>
> {
  const [source, target] = await Promise.all([
    getActiveExactCapabilityContract(db, mapping.sourceContractRef),
    getActiveExactCapabilityContract(db, mapping.targetContractRef),
  ])
  const failure = [source, target].find(
    (result) => result.kind === 'unavailable',
  )
  if (failure?.kind === 'unavailable') {
    return {
      kind: 'refused',
      reason:
        failure.reason === 'not_found'
          ? 'contract_not_found'
          : failure.reason === 'not_active'
            ? 'contract_not_active'
            : 'contract_integrity_failure',
    }
  }
  return { kind: 'ok' }
}

async function publishedBusiness(
  db: QueryCtx['db'],
  businessId: string | Id<'businesses'>,
) {
  const business = await db.get(businessId as Id<'businesses'>)
  return business !== null &&
    business.publicStatus === 'published' &&
    business.claimStatus === 'published' &&
    business.suppressedAt === undefined
    ? business
    : null
}

function portsFor(db: MutationCtx['db']): OperationLedgerPorts {
  return capabilitySupplyOperationPorts(db, {
    registerOffering: (registration, now) =>
      registerCapabilityOffering(db, registration, now),
    registerBinding: (registration, now, expectedOperationRef) =>
      registerCapabilityTransportBinding(
        db,
        registration,
        now,
        expectedOperationRef,
      ),
    setEligibility: (eligibility, now) =>
      setCapabilitySupplyEligibility(db, eligibility, now),
  })
}

export async function rebuildCapabilityOriginSupplyProjection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  now: number,
): Promise<void> {
  const db = ctx.db
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(
    db,
    businessId,
    now,
  )
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
  const offering = await ctx.db
    .query('capabilityOfferings')
    .withIndex('by_offeringId', (index) => index.eq('offeringId', offeringId))
    .unique()
  if (offering?.origin?.kind !== 'catalog_offering') return
  await rebuildCapabilityOriginSupplyProjection(ctx, offering.businessId, now)
}

export function publicationPorts(ctx: MutationCtx) {
  return capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (registration, now) =>
      registerCapabilityOffering(ctx.db, registration, now),
    registerBinding: (registration, now, expectedOperationRef) =>
      registerCapabilityTransportBinding(
        ctx.db,
        registration,
        now,
        expectedOperationRef,
      ),
    setEligibility: (eligibility, now) =>
      setCapabilitySupplyEligibility(ctx.db, eligibility, now),
  })
}
type BootstrapPreparedCapabilityInput = Omit<
  PublishPreparedCapabilityCommandInput,
  'actor'
>
type BootstrapRawCapabilityInput = Omit<
  PublishPreparedCapabilityCommandInput,
  'actor' | 'prepared'
> &
  Readonly<{
    source: unknown
    sourceRevision?: string
    pricingConfig?: unknown
    offering?: CapabilityPublicationOfferingDraft
    binding?: CapabilityPublicationBindingDraft
  }>
type BootstrapCapabilityInput =
  BootstrapPreparedCapabilityInput | BootstrapRawCapabilityInput

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  )
}

function isDecodedPublicationImport(
  value: unknown,
): value is CapabilityPublicationImport {
  const parsed = jsonValueSchema.safeParse(value)
  if (
    !parsed.success ||
    !isRecord(parsed.data) ||
    typeof parsed.data.kind !== 'string'
  )
    return false
  const source = parsed.data
  if (
    !isStringArray(source.evidenceRefs) ||
    !validEvidenceRefs(source.evidenceRefs)
  )
    return false
  switch (source.kind) {
    case 'ae_envelope':
      return (
        typeof source.documentJson === 'string' &&
        isRecord(source.offering) &&
        isRecord(source.binding)
      )
    case 'openapi_http':
      return (
        isRecord(source.document) &&
        isRecord(source.operation) &&
        typeof source.operation.path === 'string' &&
        (source.operation.method === 'get' ||
          source.operation.method === 'post') &&
        (source.fixedQuery === undefined ||
          (Array.isArray(source.fixedQuery) &&
            source.fixedQuery.every(
              (entry) =>
                isRecord(entry) &&
                typeof entry.parameter === 'string' &&
                typeof entry.value === 'string',
            ))) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'mcp':
      return (
        typeof source.serverUrl === 'string' &&
        typeof source.protocolVersion === 'string' &&
        isRecord(source.tool) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'agent_plugin_mcp':
      return (
        typeof source.serverName === 'string' &&
        typeof source.protocolVersion === 'string' &&
        isRecord(source.manifest) &&
        isRecord(source.tool) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    case 'x402':
      return (
        isRecord(source.resource) &&
        isRecord(source.contract) &&
        isRecord(source.commercial)
      )
    default:
      return false
  }
}

function decodeBootstrapPublicationSource(
  source: unknown,
  offering: CapabilityPublicationOfferingDraft | undefined,
  binding: CapabilityPublicationBindingDraft | undefined,
  evidenceRefs: readonly string[],
): CapabilityPublicationImport | undefined {
  let decoded: unknown
  try {
    decoded = decodeConvexPublicationSource(source)
  } catch {
    return undefined
  }
  if (!isRecord(decoded) || typeof decoded.kind !== 'string') return undefined
  if (decoded.kind === 'ae_envelope') {
    if (typeof decoded.documentJson !== 'string') return undefined
    const envelopeOffering = decoded.offering ?? offering
    const envelopeBinding = decoded.binding ?? binding
    if (!isRecord(envelopeOffering) || !isRecord(envelopeBinding))
      return undefined
    const envelopeEvidenceRefs = decoded.evidenceRefs
    const candidate = {
      kind: 'ae_envelope' as const,
      documentJson: decoded.documentJson,
      offering: envelopeOffering,
      binding: envelopeBinding,
      evidenceRefs: isStringArray(envelopeEvidenceRefs)
        ? envelopeEvidenceRefs
        : evidenceRefs,
    }
    return isDecodedPublicationImport(candidate) ? candidate : undefined
  }
  return isDecodedPublicationImport(decoded) ? decoded : undefined
}

function pricingConfigForBootstrapSource(
  source: CapabilityPublicationImport,
  offering: CapabilityPublicationOfferingDraft | undefined,
): unknown | undefined {
  const sourceOffering =
    offering ??
    (source.kind === 'ae_envelope'
      ? source.offering
      : source.commercial.offering)
  const price = sourceOffering.presentation.price
  return price.kind === 'fixed'
    ? { version: 'pricing:v2', unit: 'call', paidAmount: price.amount }
    : undefined
}

function bootstrapSourceRevision(
  sourceValue: unknown,
  source: CapabilityPublicationImport,
  operationKey: string,
): string {
  const sourceRecord = isRecord(sourceValue) ? sourceValue : undefined
  const embeddedRevision = sourceRecord?.sourceRevision
  if (typeof embeddedRevision === 'string') return embeddedRevision
  try {
    return `seed:bootstrap:${canonicalDigest(source)}`
  } catch {
    const safeOperationKey = operationKey
      .replace(/[^A-Za-z0-9._:/-]/gu, '-')
      .slice(0, 180)
    return `seed:bootstrap:${safeOperationKey || 'publication'}`
  }
}

function mapBootstrapPreparationRefusal(
  reason: PreparePublicationDraftRefusal,
): PublishPreparedCapabilityRefusal {
  return reason
}

async function publishBootstrapCapability(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
  actor: SupplyCommandActor,
) {
  const ports = publicationPorts(ctx)
  if ('prepared' in input) {
    return publishPreparedCapabilityCommand({ ...input, actor }, ports)
  }

  const source = decodeBootstrapPublicationSource(
    input.source,
    input.offering,
    input.binding,
    input.evidenceRefs,
  )
  if (source === undefined)
    return { kind: 'refused' as const, reason: 'source_invalid' as const }
  let pricingConfig: unknown
  try {
    pricingConfig =
      input.pricingConfig ??
      pricingConfigForBootstrapSource(source, input.offering)
  } catch {
    return { kind: 'refused' as const, reason: 'source_invalid' as const }
  }
  if (pricingConfig === undefined)
    return { kind: 'refused' as const, reason: 'price_unavailable' as const }
  const prepared = await preparePublicationDraft({
    source,
    sourceRevision:
      input.sourceRevision ??
      bootstrapSourceRevision(input.source, source, input.operationKey),
    pricingConfig,
    offering: input.offering,
    binding: input.binding,
    origin: input.origin,
    evidenceRefs: input.evidenceRefs,
    derefSchema: dereferenceLocalSchema,
  })
  if (prepared.kind === 'refused') {
    return {
      kind: 'refused' as const,
      reason: mapBootstrapPreparationRefusal(prepared.reason),
    }
  }
  return publishPreparedCapabilityCommand(
    {
      businessId: input.businessId,
      runtimeEnvironment: input.runtimeEnvironment,
      prepared: prepared.prepared,
      operationKey: input.operationKey,
      correlationId: input.correlationId,
      reasonCode: input.reasonCode,
      evidenceRefs: input.evidenceRefs,
      now: input.now,
      actor,
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.publicationMetadata === undefined
        ? {}
        : { publicationMetadata: input.publicationMetadata }),
    },
    ports,
  )
}

export async function publishCapabilityForSeed(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: 'system:dev-seed',
  })
}

export async function publishCuratedCapability(
  ctx: MutationCtx,
  input: BootstrapCapabilityInput,
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: 'system:curated-provider-bootstrap',
  })
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
    return {
      kind: 'refused' as const,
      reason: 'publication_not_found' as const,
    }
  }
  // Only curated admin classes are withdrawable via the curated path.
  // provider_owned is owner-managed and observed_external is never withdrawable
  // until it is promoted out of the observed (inert) state.
  if (
    publication.publisherRef !== 'system:curated-provider-bootstrap' ||
    (publication.authorityMode !== 'ae_curated_external' &&
      publication.authorityMode !== 'third_party_gateway')
  ) {
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  }
  const result = await withdrawCapabilityCommand(
    {
      publication,
      evidenceRefs: input.evidenceRefs,
      now: input.now,
    },
    ports,
  )
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
    return (
      actor.kind === 'authenticated_owner' &&
      (await ownsPublishedBusiness(ctx, args.businessId))
    )
  },
})

export const recordCapabilityCallEvent = internalMutation({
  args: {
    eventRef: v.string(),
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    publicationRef: v.optional(v.string()),
    publicationRevision: v.optional(v.number()),
    operationRef: v.optional(v.string()),
    taskDigest: v.string(),
    eventKind: v.union(
      v.literal('supply_liquidity_fill_observed'),
      v.literal('supply_liquidity_first_success_observed'),
      v.literal('supply_liquidity_depth_observed'),
      v.literal('supply_owner_test_observed'),
    ),
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
    taskStartedAt: v.optional(v.number()),
    successfulAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    eligibleDepth: v.optional(v.number()),
    observedAt: v.number(),
    evidenceRefs: v.array(v.string()),
    environment: v.union(
      v.literal('local'),
      v.literal('development'),
      v.literal('sandbox'),
      v.literal('production'),
    ),
  },
  returns: v.union(
    v.object({ kind: v.literal('recorded') }),
    v.object({ kind: v.literal('replayed') }),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('capabilityCallEvents')
      .withIndex('by_eventRef', (index) => index.eq('eventRef', args.eventRef))
      .unique()
    if (existing !== null) return { kind: 'replayed' as const }
    if (args.eventKind === 'supply_owner_test_observed') {
      if (
        args.publicationRef === undefined ||
        args.publicationRevision === undefined ||
        args.operationRef === undefined
      ) {
        throw new Error('owner_test_event_identity_required')
      }
      const publicationRef = args.publicationRef
      const publicationRevision = args.publicationRevision
      const publication = await ctx.db
        .query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (index) =>
          index
            .eq('publicationRef', publicationRef)
            .eq('revision', publicationRevision),
        )
        .unique()
      if (
        publication === null ||
        publication.businessId !== args.businessId ||
        publication.disposition !== 'current' ||
        publication.operationRef !== args.operationRef
      ) {
        throw new Error('owner_test_event_identity_changed')
      }
    }
    await ctx.db.insert('capabilityCallEvents', args)
    return { kind: 'recorded' as const }
  },
})
