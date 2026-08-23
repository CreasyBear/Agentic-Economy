import { z } from 'zod'

import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import { identifier, jsonValueSchema, type CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

declare const operationRefBrand: unique symbol
declare const mappingRefBrand: unique symbol

export type PublicOperationRef = string & Readonly<{ [operationRefBrand]: true }>
export type RegisteredOperationMappingRef = string & Readonly<{ [mappingRefBrand]: true }>
export type RegisteredOperationMappingContractBinding = Readonly<{
  sourceContractRef: CapabilityContractRef
  targetContractRef: CapabilityContractRef
  sourceSchemaIdentity: string
  targetSchemaIdentity: string
}>

type RegisteredOperationMappingBase = RegisteredOperationMappingContractBinding & Readonly<{
  mappingRef: RegisteredOperationMappingRef
  authority: 'registered_contract_semantics'
}>

export type RegisteredOperationMapping = RegisteredOperationMappingBase & (
  | Readonly<{
      kind: 'identity' | 'field'
      sourceOutputPointer: string
      targetInputPointer: string
    }>
  | Readonly<{
      kind: 'array_project'
      sourceArrayPointer: string
      sourceItemPointer: string
      targetArrayPointer: string
      minItems: number
      maxItems: number
    }>
  | Readonly<{
      kind: 'registered_transform'
      transformRef: string
      transformVersion: number
      sourceOutputPointer: string
      targetInputPointer: string
      inputCardinalityMax: number
      outputCardinalityMax: number
    }>
)

export function createPublicOperationRef(input: Readonly<{
  operationId: string
  publicationRef: string
  publicationRevision: number
  contractRef: CapabilityContractRef
}>): PublicOperationRef {
  const material = {
    operationId: input.operationId,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractRef: input.contractRef,
  } as StableHashValue
  return `operation:v1:${canonicalDigest(material).slice(7)}` as PublicOperationRef
}
export function capabilityOperationId(capabilityId: string): string {
  return `capability:${capabilityId}`
}

export function isPublicOperationRef(value: unknown): value is PublicOperationRef {
  return typeof value === 'string' && /^operation:v1:[0-9a-f]{64}$/.test(value)
}

export type AnonymousKeylessOperationEffect = Readonly<{
  class: 'data_release' | 'financial_exposure' | 'external_state_change'
  authority: 'none' | 'explicit' | 'mandate_or_explicit'
}>

export function isAnonymousKeylessOperationEligible(input: Readonly<{
  authority: Readonly<{ kind: string }>
  adapterId: string
  method: string
  sourceKind: string
  price: CapabilityOfferingRegistration['presentation']['price']
  effects: readonly AnonymousKeylessOperationEffect[]
}>): boolean {
  if (!Array.isArray(input.effects)) return false
  const hasExactZeroPrice = input.price.kind === 'fixed'
    && exactAmountSchema.safeParse(input.price.amount).success
    && input.price.amount.units === '0'
  const hasNoConsequentialEffect = input.effects.every((effect) => (
    effect.class !== 'financial_exposure' && effect.class !== 'external_state_change'
  ))
  return hasExactZeroPrice
    && input.authority.kind === 'keyless'
    && input.adapterId === 'http-json:v1'
    && (input.method === 'GET' || input.method === 'POST')
    && input.sourceKind !== 'x402'
    && hasNoConsequentialEffect
}

export function isRegisteredOperationMappingRef(value: unknown): value is RegisteredOperationMappingRef {
  return typeof value === 'string' && /^mapping:v1:[0-9a-f]{64}$/.test(value)
}

type RegisteredOperationMappingMaterial<Mapping = RegisteredOperationMapping> =
  Mapping extends Readonly<{ mappingRef: RegisteredOperationMappingRef }> ? Omit<Mapping, 'mappingRef'> : never

export function createRegisteredOperationMappingRef(
  mapping: RegisteredOperationMappingMaterial,
): RegisteredOperationMappingRef {
  return `mapping:v1:${canonicalDigest(mapping as StableHashValue).slice(7)}` as RegisteredOperationMappingRef
}

export function resolveRegisteredOperationMappingRef(
  mapping: RegisteredOperationMapping,
): RegisteredOperationMappingRef {
  const { mappingRef: _mappingRef, ...material } = mapping
  const expected = createRegisteredOperationMappingRef(material)
  if (mapping.mappingRef !== expected) throw new Error('registered_operation_mapping_ref_mismatch')
  return expected
}
export type AdmittedOperationRef = Readonly<{
  operationId: string
  publisherRef: string
  provenanceDigest: string
  businessId: string
  publicationRef: string
  publicationRevision: number
  sourceRevision: string
  sourceDigest: string
  contractRef: CapabilityContractRef
  catalogOfferingRef: string
  catalogOfferingRevision: number
  offeringId: string
  offeringRegistrationHash: string
  offeringEligibilityHash: string
  bindingId: string
  bindingRegistrationHash: string
  bindingEligibilityHash: string
  bindingConfigDigest: string
  qualificationDigest: string
  readinessValidUntil: number
  commercialDigest: string
  effectDigest: string
}>

export function createAdmittedOperationRef(input: AdmittedOperationRef): AdmittedOperationRef {
  if (
    input.operationId.trim().length === 0
    || input.publisherRef.trim().length === 0
    || input.businessId.trim().length === 0
    || input.publicationRef.trim().length === 0
    || input.sourceRevision.trim().length === 0
    || input.sourceDigest.trim().length === 0
    || input.catalogOfferingRef.trim().length === 0
    || input.offeringId.trim().length === 0
    || input.bindingId.trim().length === 0
    || input.readinessValidUntil <= 0
    || !Number.isSafeInteger(input.publicationRevision)
    || !Number.isSafeInteger(input.catalogOfferingRevision)
  ) throw new Error('admitted_operation_ref_invalid')
  return Object.freeze({
    ...input,
    contractRef: Object.freeze({ ...input.contractRef }),
  })
}

export function validateAdmittedOperationRef(input: unknown): input is AdmittedOperationRef {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const value = input as Partial<AdmittedOperationRef>
  return typeof value.operationId === 'string'
    && typeof value.publisherRef === 'string'
    && typeof value.provenanceDigest === 'string'
    && typeof value.businessId === 'string'
    && typeof value.publicationRef === 'string'
    && Number.isSafeInteger(value.publicationRevision)
    && typeof value.sourceRevision === 'string'
    && typeof value.sourceDigest === 'string'
    && typeof value.contractRef === 'object'
    && value.contractRef !== null
    && typeof value.catalogOfferingRef === 'string'
    && Number.isSafeInteger(value.catalogOfferingRevision)
    && typeof value.offeringId === 'string'
    && typeof value.offeringRegistrationHash === 'string'
    && typeof value.offeringEligibilityHash === 'string'
    && typeof value.bindingId === 'string'
    && typeof value.bindingRegistrationHash === 'string'
    && typeof value.bindingEligibilityHash === 'string'
    && typeof value.bindingConfigDigest === 'string'
    && typeof value.qualificationDigest === 'string'
    && typeof value.readinessValidUntil === 'number'
    && value.readinessValidUntil > 0
    && typeof value.commercialDigest === 'string'
    && typeof value.effectDigest === 'string'
}

export {
  PublicOperationRegistrySchemaVersion,
  operationCompareInputSchema,
  operationCompareOutputSchema,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
  operationSearchInputSchema,
  operationSearchOutputSchema,
  publicOperationAuthenticationSchema,
  publicOperationParameterSchema,
  searchCapabilityOperations,
  detailCapabilityOperation,
  compareCapabilityOperations,
  inspectCapabilityOperationPlan,
  projectCapabilityOperation,
  rankOperationSearchText,
  serializeOperationDescriptor,
  deserializeOperationDescriptor,
  serializeOperationSearchResult,
  deserializeOperationSearchResult,
  serializeOperationDetailResult,
  deserializeOperationDetailResult,
  serializeOperationCompareResult,
  deserializeOperationCompareResult,
  serializeInspectPlanResult,
  deserializeInspectPlanResult,
} from './operation-projection'
export type {
  CapabilityOperationSourcePort,
  CapabilityOperationSourceRecord,
  CatalogOfferingOperationMapEntry,
  InspectPlanInput,
  InspectPlanResult,
  InspectPlanWireResult,
  OperationCompareInput,
  OperationCompareResult,
  OperationComparisonFact,
  OperationComparisonValue,
  OperationCompareWireResult,
  OperationDetailInput,
  OperationDetailResult,
  OperationDetailWireResult,
  OperationSearchFilters,
  OperationSearchInput,
  OperationSearchRanking,
  OperationSearchTextCandidate,
  OperationSearchResult,
  OperationSearchWireResult,
  OperationSurfaceWireResult,
  OperationSurfaceWireDescriptor,
  PublicCapabilityUnavailableReason,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicOperationAuthentication,
  PublicOperationAvailability,
  PublicOperationBusinessRef,
  PublicOperationCatalogPrice,
  PublicOperationDescriptor,
  PublicOperationOfferingRef,
  PublicOperationParameter,
  PublicOperationParameterMapping,
  PublicOperationPrice,
  PublicOperationPriceEvidence,
  PublicOperationReadiness,
  PublicOperationNavigationRelation,
  PublicOperationTransport,
  PublicRecoveryPolicy,
} from './operation-projection'
export {
  admitRegisteredTransport,
  injectHttpJsonCredential,
  parseAdmittedTransportCatalogMetadata,
  parseAdmittedX402CatalogPayment,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseX402FetchTransportConfiguration,
  readHttpJsonProbeConfiguration,
  validPublicHttpsEndpoint,
} from './internal/transport-adapters'
export type {
  AdmittedTransportCatalogMetadata,
  HttpJsonCredential,
  HttpJsonFixedQueryParameter,
  HttpJsonHeaderParameterMapping,
  HttpJsonPathParameterMapping,
  HttpJsonProbeConfiguration,
  HttpJsonQueryParameterMapping,
  HttpJsonTransportConfiguration,
  McpJsonRpcTransportConfiguration,
  TransportAdmissionInput,
  TransportAdmissionResult,
  X402CatalogPayment,
  X402FetchTransportConfiguration,
} from './internal/transport-adapters'
export {
  importAgentPluginMcpCapability,
  importMcpCapability,
  importOpenApiHttpCapability,
  importX402Capability,
  normalizeCapabilityPublication,
  preflightOpenApiHttpDocument,
} from './internal/publication-importers'
export { admitProviderSchema } from './internal/admit-provider-schema'
export type {
  AdmitCredentialSpec,
  AdmitProviderSchemaInput,
  AdmitProviderSchemaNormalized,
  AdmitProviderSchemaRefusal,
  AdmitProviderSchemaResult,
} from './internal/admit-provider-schema'
export type {
  CanonicalCapabilityPublicationDraft,
  CapabilityContractMetadata,
  CapabilityImporterCommercialInput,
  CapabilityPublicationBindingDraft,
  CapabilityPublicationImport,
  CapabilityPublicationImportRefusal,
  CapabilityPublicationImportResult,
  CapabilityPublicationOfferingDraft,
  CapabilityPublicationSource,
  CapabilityPublicationSourceSelector,
  OpenApiDocumentPreflightResult,
  OpenApiOperationPreflightOutcome,
} from './internal/publication-importers'
export {
  capabilityPublicationSourceSelectorValue,
  pricingConfigValue,
  readinessOutcomeValue,
} from './internal/convex-schema'
export type {
  CapabilityProbeObservation,
  CapabilityProbeOutcome,
  CapabilityProbeTarget,
} from './internal/readiness-probe'
export {
  materializePublishedOperation,
  materializeRuntimePublishedOperation,
  parsePublishedOperationSnapshot,
  publishedOperationMaterialMatches,
} from './published-operation'
export {
  recordCapabilityCallObservation,
  recordCapabilityDepthObservation,
} from './internal/liquidity'
export type {
  CapabilityCallEvent,
  CapabilityCallEventKind,
  CapabilityCallObservationInput,
  CapabilityDepthObservationInput,
  CapabilityLiquidityWritePort,
  LiquidityEnvironment,
  LiquidityOutcome,
  LiquidityZeroReason,
} from './internal/liquidity'
export type {
  PublishedOperation,
  PublishedOperationUsageObservation,
  RuntimePublishedOperationDescriptor,
} from './published-operation'
export {
  bindingObservedRowDigest,
} from './internal/quarantine'
export {
  registerCapabilityTransportBinding,
  rotateCapabilityTransportBindingAuthority,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotIsValid,
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  type BindingInsertRow,
  type BindingWritePorts,
  type CapabilityBindingRow,
  type CapabilityConnectionAuthoritySnapshot,
} from './internal/binding'
export {
  MAX_ELIGIBLE_SUPPLY,
  getEligibleExactCapabilitySupply,
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  setCapabilitySupplyEligibility,
  type EligiblePublicationRow,
  type EligiblePublishedBusiness,
  type EligibleSupplyPorts,
  type EligibilityInput,
  type EligibilityWritePorts,
} from './internal/eligibility'
export {
  exactCurrentCatalogOperationIsRouteable,
  qualifySuppliedCandidate,
  queryCapabilityGraph,
  readCapabilityProbeTarget,
  recordCapabilityProbeResult,
  probeRequestDigest,
  probeTargetDigest,
  type CapabilityGraphPorts,
  type GraphCatalogAccessPath,
  type CapabilityProbeTargetUnavailableReason,
  type GraphPublicationRow,
  type GraphPublishedBusiness,
  type ReadCapabilityProbeTargetResult,
  type SuppliedCandidateRef,
} from './internal/graph'
export {
  contractRefFromRow,
  offeringRegistrationFromRow,
  registerCapabilityOffering,
  type CapabilityOfferingRow,
  type OfferingInsertRow,
  type OfferingWritePorts,
} from './internal/offering'
export {
  beginOperation,
  failOperation,
  replayOperationResult,
  succeedOperation,
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  quarantineCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
  type OperationKeyRecord,
  type OperationLedgerPorts,
  type OperationBeginResult,
} from './internal/operation-ledger'
export {
  decodeConvexPublicationSource,
  isDirectPublicationSource,
  publicationLifecycle,
  publicationMaterialContainsCredential,
  publicationProjection,
  publishPreparedCapabilityCommand,
  republishPreparedCapabilityCommand,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
  type PublicationCommandPorts,
  type PublicationCommandRow,
  type PublicationLifecycle,
  type PublishPreparedCapabilityCommandInput,
  type PublishPreparedCapabilityCommandResult,
  type PublishPreparedCapabilityRefusal,
} from './internal/publication'
export {
  admitPublicationDraft,
  preparePublicationDraft,
  type AdmittedPublicationDraft,
  type AdmitPublicationDraftRefusal,
  type PreparePublicationDraftRefusal,
  type PreparedPublicationDraft,
  type PreparedPublicationMaterial,
} from './internal/publication'
export {
  CAPABILITY_PUBLICATION_AUTHORITY_MODES,
  capabilityPublicationProvenanceDigest,
  defineCapabilityPublicationProvenance,
  validCapabilityPublicationAuthority,
  validCapabilityPublicationSourceRevision,
  type CapabilityPublicationAuthorityMode,
  type CapabilityPublicationProvenance,
  type CapabilityPublicationSourceIdentity,
} from './internal/publication'
export {
  admitCapabilityPublicationCommand,
  type AdmitCapabilityPublicationInput,
  type AdmitCapabilityPublicationResult,
  type CapabilityPublicationAdmissionRefusal,
  type CapabilityPublicationAdmissionSource,
} from './internal/publication'
export {
  boundedTrimmed,
  validEvidenceRefs,
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
  type SupplyAuditEventRow,
} from './internal/shared'
export { defaultSupplyPricingConfig } from './internal/supply-funnel/pricing-port'
export { transportObservationDigest } from './internal/x402-invocation-policy'

const MAX_OPAQUE_CONFIG_BYTES = 65_536
const encoder = new TextEncoder()
const evidenceRefs = z.array(identifier).min(1).max(64)
const contractRefSchema = z.strictObject({
  capabilityId: identifier,
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contractDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
})
const commercialRelationshipSchema = z.strictObject({
  kind: z.enum(['none', 'direct', 'affiliate', 'ownership']),
  summary: z.string().trim().min(1).max(1_000),
  influencesEligibility: z.boolean(),
  influencesInclusion: z.boolean(),
  influencesOrder: z.boolean(),
  evidenceRefs,
})
function exactAmountsOrdered(minimum: ExactAmount, maximum: ExactAmount): boolean {
  const comparison = compareExactAmounts(minimum, maximum)
  return comparison !== undefined && comparison <= 0
}
const priceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('fixed'),
    amount: exactAmountSchema,
  }),
  z.strictObject({
    kind: z.literal('range'),
    minimum: exactAmountSchema,
    maximum: exactAmountSchema,
  }),
  z.strictObject({ kind: z.literal('on_request') }),
]).refine((value) => value.kind !== 'range' || exactAmountsOrdered(value.minimum, value.maximum))
const offeringOriginSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('catalog_offering'),
    offeringRef: identifier,
    offeringRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    offeringSourceHash: identifier,
    declaredAccessPathRef: identifier.optional(),
    accessPathSourceHash: identifier.optional(),
  }).superRefine((origin, context) => {
    if ((origin.declaredAccessPathRef === undefined) !== (origin.accessPathSourceHash === undefined)) {
      context.addIssue({ code: 'custom', message: 'capability_offering_origin_access_path_incomplete' })
    }
  }),
  z.strictObject({ kind: z.literal('standalone') }),
])
const offeringSchema = z.strictObject({
  offeringId: identifier,
  businessId: identifier,
  networkId: identifier,
  contractRef: contractRefSchema,
  origin: offeringOriginSchema.optional(),
  presentation: z.strictObject({
    label: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(2_000),
    price: priceSchema,
    materialTerms: z.array(z.strictObject({
      termId: identifier,
      label: z.string().trim().min(1).max(160),
      value: z.string().trim().min(1).max(1_000),
    })).max(64),
    commercialRelationship: commercialRelationshipSchema,
  }),
  searchTerms: z.array(z.string().trim().min(1).max(120)).min(1).max(64),
  registrationEvidenceRefs: evidenceRefs,
})
const continuationSchema = z.strictObject({
  kind: z.enum(['single_response', 'adapter_managed']),
  evidenceRefs,
})
const cancellationSchema = z.strictObject({
  kind: z.enum(['unsupported', 'adapter_managed']),
  evidenceRefs,
})
const authoritySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('keyless') }),
  z.strictObject({
    kind: z.literal('provider_connection'),
    connectionRef: identifier,
    providerRef: identifier,
  }),
])
const bindingSchema = z.strictObject({
  bindingId: identifier,
  offeringId: identifier,
  networkId: identifier,
  contractRef: contractRefSchema,
  endpointUrl: z.string().trim().min(1).max(2_000),
  authority: authoritySchema,
  continuation: continuationSchema,
  cancellation: cancellationSchema,
  adapter: z.strictObject({ adapterId: identifier, config: jsonValueSchema }),
  registrationEvidenceRefs: evidenceRefs,
})

export type CapabilityTransportAuthority = Readonly<z.infer<typeof authoritySchema>>
export type CapabilityTransportBindingRegistration = Readonly<z.infer<typeof bindingSchema>>

export type CapabilityOfferingRegistration = Readonly<z.infer<typeof offeringSchema>>
export type CapabilityOfferingOrigin = Readonly<z.infer<typeof offeringOriginSchema>>
export type CapabilityContinuation = Readonly<z.infer<typeof continuationSchema>>
export type CapabilityCancellation = Readonly<z.infer<typeof cancellationSchema>>
export type AdmittedTransportMaterial = Readonly<{
  configJson: string
  configDigest: string
}>

export function defineCapabilityOfferingRegistration(input: unknown): CapabilityOfferingRegistration {
  const parsed = offeringSchema.safeParse(input)
  if (!parsed.success) throw new Error('capability_offering_invalid')
  return parsed.data
}

export function defineCapabilityTransportBindingRegistration(input: unknown): CapabilityTransportBindingRegistration {
  const parsed = bindingSchema.safeParse(input)
  if (!parsed.success) throw new Error('capability_binding_invalid')
  if (encoder.encode(stableStringify(parsed.data.adapter.config as StableHashValue)).byteLength > MAX_OPAQUE_CONFIG_BYTES) {
    throw new Error('capability_binding_invalid')
  }
  return parsed.data
}

export function capabilityOfferingRegistrationHash(registration: CapabilityOfferingRegistration): string {
  return canonicalDigest(registration as StableHashValue)
}

export function capabilityBindingRegistrationHash(
  registration: CapabilityTransportBindingRegistration,
  transport: AdmittedTransportMaterial,
): string {
  const { adapter, ...binding } = registration
  return canonicalDigest({
    ...binding,
    adapter: {
      adapterId: adapter.adapterId,
      configJson: transport.configJson,
      configDigest: transport.configDigest,
    },
  } as StableHashValue)
}

export function capabilitySupplyEligibilityHash(input: Readonly<{
  offeringId: string
  bindingId: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  offeringStatus: 'active' | 'inactive'
  bindingAdmission: 'admitted' | 'not_admitted'
  bindingConformance: 'conformant' | 'not_conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
}>): string {
  return canonicalDigest(input as StableHashValue)
}

export function capabilityOfferingEligibilityHash(input: Readonly<{
  offeringId: string
  registrationHash: string
  status: 'active' | 'inactive'
  admissionEvidenceRefs: readonly string[]
}>): string {
  return canonicalDigest(input as StableHashValue)
}

export function capabilityBindingEligibilityHash(input: Readonly<{
  bindingId: string
  registrationHash: string
  admission: 'admitted' | 'not_admitted'
  conformance: 'conformant' | 'not_conformant'
  admissionEvidenceRefs: readonly string[]
  conformanceEvidenceRefs: readonly string[]
}>): string {
  return canonicalDigest(input as StableHashValue)
}
