import { v, type Infer } from 'convex/values'
import {
  capabilityPublicationSourceSelectorValue,
  type PublicationLifecycle,
  type PublishPreparedCapabilityCommandResult,
} from '@/modules/capability-supply/public'
import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../../sourceWriteAdmission'
import { clerkConsequenceProofValue } from '../../authority/consequence/proof'


export const contractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})
export type ContractRef = Infer<typeof contractRefValue>

export const evidenceRefsValue = v.array(v.string())
export const commercialRelationshipValue = v.object({
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
export const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
export const priceValue = v.union(
  v.object({ kind: v.literal('fixed'), amount: exactAmountValue }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountValue,
    maximum: exactAmountValue,
  }),
  v.object({ kind: v.literal('on_request') }),
)
export const presentationValue = v.object({
  label: v.string(),
  summary: v.string(),
  price: v.optional(priceValue),
  materialTerms: v.array(
    v.object({ termId: v.string(), label: v.string(), value: v.string() }),
  ),
  commercialRelationship: commercialRelationshipValue,
})
export const offeringOriginValue = v.union(
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
export const continuationValue = v.object({
  kind: v.union(v.literal('single_response'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
export const cancellationValue = v.object({
  kind: v.union(v.literal('unsupported'), v.literal('adapter_managed')),
  evidenceRefs: evidenceRefsValue,
})
export const publicUpstreamAuthorityValue = v.object({ kind: v.literal('public_upstream') })
export const providerConnectionAuthorityValue = v.object({
  kind: v.literal('provider_connection'),
  connectionRef: v.string(),
  providerRef: v.string(),
})
export const authorityValue = v.union(
  publicUpstreamAuthorityValue,
  providerConnectionAuthorityValue,
)
export const publicationAuthorityModeValue = v.union(
  v.literal('provider_owned'),
  v.literal('ae_curated_external'),
  v.literal('third_party_gateway'),
  v.literal('observed_external'),
)
export const contextFields = {
  operationKey: v.string(),
  correlationId: v.string(),
  reasonCode: v.string(),
  evidenceRefs: evidenceRefsValue,
}
export const publicationLifecycleValue = v.object({
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
      v.literal('provider_authority_unverified'),
    ),
  ),
})

export function convexPublicationLifecycle(
  lifecycle: PublicationLifecycle,
): Infer<typeof publicationLifecycleValue> {
  return { state: lifecycle.state, reasons: [...lifecycle.reasons] }
}
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
export const capabilityPublicationOfferingValue = v.object({
  offeringId: v.string(),
  networkId: v.string(),
  origin: v.optional(offeringOriginValue),
  presentation: presentationValue,
  searchTerms: v.array(v.string()),
  registrationEvidenceRefs: evidenceRefsValue,
})
export const capabilityPublicationBindingValue = v.object({
  bindingId: v.string(),
  endpointUrl: v.string(),
  authority: authorityValue,
  continuation: continuationValue,
  cancellation: cancellationValue,
  adapter: adapterValue,
  registrationEvidenceRefs: evidenceRefsValue,
})
export const preparedPublicationMaterialValue = v.object({
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
  sourceRouteRef: v.string(),
  sourceAuthorityState: v.optional(
    v.union(v.literal('verified'), v.literal('review_required')),
  ),
  documentJson: v.string(),
  offering: capabilityPublicationOfferingValue,
  binding: capabilityPublicationBindingValue,
  evidenceRefs: evidenceRefsValue,
  pricingConfigJson: v.string(),
  priceDigest: v.string(),
})
const preparedPublicationRefusalValue = v.union(
  v.literal('authorization_denied'),
  v.literal('authority_mismatch'),
  v.literal('reauthentication_required'),
  v.literal('proof_stale'),
  v.literal('proof_replayed'),
  v.literal('command_changed'),
  v.literal('rate_limited'),
  v.literal('security_control_unavailable'),
  v.literal('registration_context_invalid'),
  v.literal('source_invalid'),
  v.literal('source_too_large'),
  v.literal('source_too_deep'),
  v.literal('source_version_unsupported'),
  v.literal('selector_invalid'),
  v.literal('tool_not_found'),
  v.literal('schema_missing'),
  v.literal('schema_profile_unsupported'),
  v.literal('opaque_input_without_valid_example'),
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
  v.literal('bazaar_discovery_invalid'),
  v.literal('contract_too_large'),
  v.literal('contract_invalid'),
  v.literal('price_unavailable'),
  v.literal('source_revision_invalid'),
  v.literal('pricing_config_invalid'),
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
  v.literal('source_route_conflict'),
)
export const preparedPublicationResultValue = v.union(
  v.object({
    kind: v.union(v.literal('published'), v.literal('replayed')),
    operationId: v.optional(v.string()),
    publicationRef: v.string(),
    publicationRevision: v.number(),
    toolRef: v.string(),
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
    next: v.optional(v.array(v.object({
      action: v.literal('revise-publication'),
      field: v.string(),
      instruction: v.string(),
    }))),
  }),
)
export const capabilityPublicationValue = v.object({
  kind: v.literal('published'),
  publicationRef: v.string(),
  contractRef: contractRefValue,
  offeringId: v.string(),
  bindingId: v.string(),
  lifecycle: publicationLifecycleValue,
})
type PreparedPublicationResult = Infer<typeof preparedPublicationResultValue>
export function convexPreparedPublicationResult(
  result: PublishPreparedCapabilityCommandResult,
): PreparedPublicationResult {
  if (result.kind === 'refused') {
    const { next, ...refusal } = result
    return next === undefined ? refusal : { ...refusal, next: next.map((action) => ({ ...action })) }
  }
  return {
    kind: result.kind,
    ...(result.operationId === undefined
      ? {}
      : { operationId: result.operationId }),
    publicationRef: result.publicationRef,
    publicationRevision: result.publicationRevision,
    toolRef: result.toolRef,
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

export const publishPreparedCapabilityArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  sourceHash: v.string(),
  runtimeEnvironment: v.union(v.literal('sandbox'), v.literal('production')),
  prepared: preparedPublicationMaterialValue,
  proof: v.optional(clerkConsequenceProofValue),
  ...contextFields,
  agentPrincipal: v.optional(agentAccessPrincipalValue),
  ...sourceWriteArgs,
} as const
export const readCapabilityPublicationArgs = {
  publicationRef: v.string(),
} as const
