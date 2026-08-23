import {
  normalizeCapabilityPublication,
  type CanonicalCapabilityPublicationDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportRefusal,
} from '../publication-importers'
import type { SchemaDereferencer } from '../admit-provider-schema'
import type { CapabilityPublicationAdmissionSource } from './admit'
import {
  decodeConvexPublicationSource,
  publicationSourceDescriptorJson,
  publicationSourceDigest,
  publicationSourceSelector,
} from './source'

/**
 * Read-only acceptance pre-flight for a capability publication.
 *
 * Mirrors agentic.market `/validate` and CDP `POST /v2/x402/validate`: it runs the SAME
 * deterministic `normalizeCapabilityPublication` the admission path uses and reports
 * whether it *would* be accepted — without admitting, writing to any store, or
 * requiring a `businessId`. It is side-effect-free and idempotent.
 *
 * Authority: ADR-028 admission and ADR-029 publication/readiness boundaries.
 * §8.3(4) (pre-flight validate endpoint) + §7 (named per-rule refusals over the blanket
 * `schema_profile_unsupported`).
 */
export type CapabilityPublicationValidation =
  | Readonly<{
      kind: 'accepted'
      normalized: CanonicalCapabilityPublicationDraft
      /** Same descriptor digest the admission path would record as `sourceDigest`. */
      sourceDigest: string
    }>
  | Readonly<{
      kind: 'refused'
      reason: CapabilityPublicationImportRefusal
      /** Actionable, per-rule fix a human/agent can apply before re-validating. */
      fix: string
    }>

/**
 * Deterministic, side-effect-free acceptance pre-flight. Never writes to a store,
 * never admits/publishes, and never requires a `businessId` or `actor`.
 */
export async function validateCapabilityPublication(
  source: CapabilityPublicationAdmissionSource,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationValidation> {
  const { ...serializedSource } = source
  const importSource = decodeConvexPublicationSource(serializedSource)
  let normalized
  try {
    normalized = await normalizeCapabilityPublication(importSource as CapabilityPublicationImport, derefSchema)
  } catch {
    return {
      kind: 'refused',
      reason: 'source_invalid',
      fix: 'The publication source could not be parsed or normalized. Check that it is valid, self-contained input.',
    }
  }
  if (normalized.kind === 'refused') {
    return {
      kind: 'refused',
      reason: normalized.reason,
      fix: publicationValidationFix(normalized.reason),
    }
  }
  try {
    const descriptorJson = publicationSourceDescriptorJson(importSource as CapabilityPublicationImport)
    return {
      kind: 'accepted',
      normalized: normalized.draft,
      sourceDigest: publicationSourceDigest({
        sourceKind: normalized.draft.source.kind,
        selector: publicationSourceSelector(normalized.draft),
        descriptorJson,
      }),
    }
  } catch {
    return {
      kind: 'refused',
      reason: 'source_invalid',
      fix: publicationValidationFix('source_invalid'),
    }
  }
}

/**
 * Maps each named refusal to an actionable, per-rule fix. This is the counterpart of the
 * design's named refusals (design §4.2.5): a precise reason instead of a blanket
 * `schema_profile_unsupported`, so a human or agent knows exactly what to change.
 */
export function publicationValidationFix(reason: CapabilityPublicationImportRefusal): string {
  switch (reason) {
    case 'source_invalid':
      return 'The source is malformed, empty, or not a recognized import kind. Provide a valid openapi_http / mcp / x402 / ae_envelope source.'
    case 'source_too_large':
      return 'The source exceeds the byte budget. Reduce its size (e.g. drop unused schema definitions) and re-validate.'
    case 'source_too_deep':
      return 'The source nests too deeply. Flatten the nested schema/document structure and re-validate.'
    case 'source_version_unsupported':
      return 'The source declares an unsupported protocol/schema version. Use an OpenAPI 3.1.x document or the expected protocol version and re-validate.'
    case 'selector_invalid':
      return 'The operation selector is invalid or incomplete. Point at an existing path + HTTP method (GET/POST), or a well-formed MCP tool / x402 resource selector.'
    case 'operation_not_found':
      return 'The selected operation does not exist in the source. Choose a path + method the document actually defines.'
    case 'schema_missing':
      return 'The operation has no resolvable input and/or output JSON schema, or no unique 2xx response. Provide a single 2xx response with a JSON content schema.'
    case 'openapi_query_parameter_definition_unsupported':
      return 'The OpenAPI query parameter definition is unsupported. Use a query parameter with a direct schema and omit Parameter.content.'
    case 'openapi_query_parameter_serialization_unsupported':
      return 'The OpenAPI query parameter serialization is unsupported. Use style=form with a boolean explode value and set allowReserved=false.'
    case 'openapi_query_parameter_schema_unsupported':
      return 'The OpenAPI query parameter schema is unsupported. Use a scalar or a one-dimensional scalar array with supported form serialization.'
    case 'openapi_path_parameter_required':
      return 'Every OpenAPI path parameter must be declared with required=true and have a matching {name} path template.'
    case 'openapi_path_parameter_serialization_unsupported':
      return 'The OpenAPI path parameter uses an unsupported style or schema. Use a scalar/simple or one-dimensional scalar path value.'
    case 'openapi_header_parameter_unsafe':
      return 'The OpenAPI header is reserved for credentials or AE transport identity. Remove it or declare a supported security scheme.'
    case 'openapi_header_parameter_serialization_unsupported':
      return 'The OpenAPI header uses an unsupported content or serialization shape. Use a non-secret simple scalar or scalar array header.'
    case 'openapi_media_type_unsupported':
      return 'Use application/json or an application +json request/response media type so the guarded JSON adapter can preserve and validate it.'
    case 'openapi_request_body_parameter_mix_unsupported':
      return 'Separate the JSON request body from query, path, or header parameters. The guarded adapter supports a JSON POST body or parameter mappings, not a composite body-plus-parameter request.'
    case 'openapi_response_status_unsupported':
      return 'Declare exactly one explicit 2xx response with a JSON content schema so the adapter has one unambiguous success shape.'
    case 'openapi_operation_unsupported':
      return 'This OpenAPI operation uses a shape outside the guarded adapter. Select a GET query/path/header operation or a JSON POST body.'
    case 'schema_profile_unsupported':
      return 'The schema uses constructs the deterministic normalizer cannot handle (unsupported reference shape or a non-canonical output pointer). Resolve supported references through the admission dereferencer and wrap dynamic-keyed outputs under a guaranteed required key.'
    case 'admit_schema_circular_reference':
      return 'The schema has a circular $ref chain. Break the cycle: inline the definition once without referring back to itself.'
    case 'admit_schema_reference_unresolvable':
      return 'A schema $ref points at a node that does not exist (or is a non-local reference). Resolve it to a local definition or add the referenced component.'
    case 'admit_schema_too_deep':
      return 'The schema inlines too deeply (over the bounded depth). Flatten nested references/composition and re-validate.'
    case 'admit_schema_deref_unavailable':
      return 'The schema needs reference expansion that this runtime cannot perform. Submit an already-dereferenced (self-contained) schema, or use the owner supply funnel which runs the dereferencer.'
    case 'admit_output_no_guaranteed_field':
      return 'The output schema has no guaranteed (always-present required) field to serve as completion evidence. Restructure the output under a required key that is always present.'
    case 'transport_unsupported':
      return 'The transport is unsupported or the endpoint is invalid. Use a single public https endpoint for the operation.'
    case 'commercial_metadata_inconsistent':
      return 'The commercial metadata is inconsistent (offering, binding, credential, evidence, or timeout fields are invalid or conflicting). Fix the commercial block and re-validate.'
    case 'payment_execution_unsupported':
      return 'The declared payment execution path is not supported for this profile. Drop or re-specify the payment/execution metadata and re-validate.'
    case 'payment_required_invalid':
      return 'The x402 submission carries a malformed PaymentRequired (402 challenge) document. Supply a valid payment-requirements claim and re-validate.'
    case 'bazaar_discovery_invalid':
      return 'The x402 Bazaar discovery extension is malformed. Provide a valid Bazaar discovery object and re-validate.'
  }
}
