import { z } from 'zod'

import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import { identifier, jsonValueSchema, type CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  isPublicToolRef,
  type PublicToolRef,
} from '@/modules/common/tool-ref'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import {
  authoritySchema,
  cancellationSchema,
  continuationSchema,
  type CapabilityCancellation,
  type CapabilityContinuation,
  type CapabilityTransportAuthority,
} from './internal/transport-terms-schema'

export type { CapabilityCancellation, CapabilityContinuation, CapabilityTransportAuthority }

declare const mappingRefBrand: unique symbol

export { isPublicToolRef }
export type { PublicToolRef }
export type RegisteredToolMappingRef = string & Readonly<{ [mappingRefBrand]: true }>
export type RegisteredToolMappingContractBinding = Readonly<{
  sourceContractRef: CapabilityContractRef
  targetContractRef: CapabilityContractRef
  sourceSchemaIdentity: string
  targetSchemaIdentity: string
}>

type RegisteredToolMappingBase = RegisteredToolMappingContractBinding & Readonly<{
  mappingRef: RegisteredToolMappingRef
  authority: 'registered_contract_semantics'
}>

export type RegisteredToolMapping = RegisteredToolMappingBase & (
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

export function createPublicToolRef(input: Readonly<{
  operationId: string
  publicationRef: string
  publicationRevision: number
  contractRef: CapabilityContractRef
}>): PublicToolRef {
  const material = {
    operationId: input.operationId,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractRef: input.contractRef,
  } as StableHashValue
  return `operation:v1:${canonicalDigest(material).slice(7)}` as PublicToolRef
}
export function capabilityToolId(capabilityId: string): string {
  return `capability:${capabilityId}`
}

export type AnonymousKeylessToolEffect = Readonly<{
  class: 'data_release' | 'financial_exposure' | 'external_state_change'
  authority: 'none' | 'explicit' | 'mandate_or_explicit'
}>

export function isAnonymousKeylessToolEligible(input: Readonly<{
  authority: Readonly<{ kind: string }>
  adapterId: string
  method: string
  sourceKind: string
  price: CapabilityOfferingRegistration['presentation']['price']
  effects: readonly AnonymousKeylessToolEffect[]
}>): boolean {
  if (!Array.isArray(input.effects)) return false
  const hasExactZeroPrice = input.price?.kind === 'fixed'
    && exactAmountSchema.safeParse(input.price.amount).success
    && input.price.amount.units === '0'
  const hasNoConsequentialEffect = input.effects.every((effect) => (
    effect.class !== 'financial_exposure' && effect.class !== 'external_state_change'
  ))
  return hasExactZeroPrice
    && input.authority.kind === 'public_upstream'
    && input.adapterId === 'http-json:v1'
    && (input.method === 'GET' || input.method === 'POST')
    && input.sourceKind !== 'x402'
    && hasNoConsequentialEffect
}

export function isRegisteredToolMappingRef(value: unknown): value is RegisteredToolMappingRef {
  return typeof value === 'string' && /^mapping:v1:[0-9a-f]{64}$/.test(value)
}

type RegisteredToolMappingMaterial<Mapping = RegisteredToolMapping> =
  Mapping extends Readonly<{ mappingRef: RegisteredToolMappingRef }> ? Omit<Mapping, 'mappingRef'> : never

export function createRegisteredToolMappingRef(
  mapping: RegisteredToolMappingMaterial,
): RegisteredToolMappingRef {
  return `mapping:v1:${canonicalDigest(mapping as StableHashValue).slice(7)}` as RegisteredToolMappingRef
}

export function resolveRegisteredToolMappingRef(
  mapping: RegisteredToolMapping,
): RegisteredToolMappingRef {
  const { mappingRef: _mappingRef, ...material } = mapping
  const expected = createRegisteredToolMappingRef(material)
  if (mapping.mappingRef !== expected) throw new Error('registered_operation_mapping_ref_mismatch')
  return expected
}
export type AdmittedToolRef = Readonly<{
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

export function createAdmittedToolRef(input: AdmittedToolRef): AdmittedToolRef {
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

export function validateAdmittedToolRef(input: unknown): input is AdmittedToolRef {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const value = input as Partial<AdmittedToolRef>
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
  CURRENT_TOOL_CALL_VIA,
  PublicToolRegistrySchemaVersion,
  toolCompareInputSchema,
  toolCompareOutputSchema,
  toolDetailInputSchema,
  toolDetailOutputSchema,
  toolSearchInputSchema,
  toolSearchOutputSchema,
  publicToolAuthenticationSchema,
  publicToolParameterSchema,
  searchCapabilityTools,
  detailCapabilityTool,
  compareCapabilityTools,
  projectCapabilityTool,
  noToolNavigation,
  projectCapabilityToolCatalogPrice,
  projectCapabilityToolParameters,
  rankToolSearchText,
  matchesToolFilters,
  normalizeToolSearchInput,
  serializeToolDescriptor,
  deserializeToolDescriptor,
  serializeToolSearchResult,
  deserializeToolSearchResult,
  serializeToolDetailResult,
  deserializeToolDetailResult,
  serializeToolCompareResult,
  deserializeToolCompareResult,
} from './tool-projection'
export type {
  CapabilityToolSourcePort,
  ToolProjectionNavigationContract,
  CapabilityToolSourceRecord,
  CatalogOfferingToolMapEntry,
  ToolCompareInput,
  ToolCompareResult,
  ToolComparisonFact,
  ToolComparisonValue,
  ToolCompareWireResult,
  ToolDetailInput,
  ToolDetailResult,
  ToolDetailWireResult,
  ToolSearchFilters,
  ToolSearchInput,
  ToolSearchRanking,
  ToolSearchTextCandidate,
  ToolSearchResult,
  ToolSearchWireResult,
  ToolSurfaceWireResult,
  ToolSurfaceWireDescriptor,
  PublicCapabilityUnavailableReason,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicToolAuthentication,
  PublicToolAvailability,
  PublicToolBusinessRef,
  PublicToolCanonical,
  PublicToolCatalogPrice,
  PublicToolDescriptor,
  PublicToolListingRef,
  PublicToolParameter,
  PublicToolParameterMapping,
  PublicToolPayment,
  PublicToolPrice,
  PublicToolPriceEvidence,
  PublicToolReadiness,
  PublicToolNavigationRelation,
  PublicToolTransport,
  PublicRecoveryPolicy,
} from './tool-projection'
export {
  admitRegisteredTransport,
  injectHttpJsonCredential,
  parseAdmittedTransportCatalogMetadata,
  parseAdmittedX402CatalogPayment,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parsePinnedX402PaymentRequiredJson,
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
export { validateOpenApiDocument } from './internal/openapi-import/validation'
// Route identity: the same stable digest capabilityPublications.sourceRouteRef
// stores, so a cross-module consumer (e.g. the x402 directory index) can join
// on it without duplicating the computation.
export { sourceRouteRef } from './internal/source-route-identity'
export { admitProviderSchema } from './internal/admit-provider-schema'
export type {
  AdmitCredentialSpec,
  AdmitProviderSchemaInput,
  AdmitProviderSchemaNormalized,
  AdmitProviderSchemaRefusal,
  AdmitProviderSchemaResult,
  SchemaDereferencer,
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
  materializePublishedTool,
  materializeRuntimePublishedTool,
  parsePublishedToolSnapshot,
  publishedToolIdentityDigest,
  publishedToolMaterialMatches,
} from './published-tool'
export {
  createMemoryCapabilityLiquidityPort,
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
export {
  availability,
} from './internal/availability'
export type {
  CapabilityAvailabilityInput,
} from './internal/availability'
export type {
  PublishedTool,
  PublishedToolUsageObservation,
  RuntimePublishedToolDescriptor,
} from './published-tool'
export {
  bindingObservedRowDigest,
  offeringStatusAfterBindingQuarantine,
  quarantineBindingAudit,
  quarantineParentAudit,
  quarantineParentUpdatedDisposition,
  validQuarantineAuditPayload,
  type QuarantineParentDisposition,
} from './internal/quarantine'
export {
  registerCapabilityTransportBinding,
  rotateCapabilityTransportBindingAuthority,
  connectionAuthoritySnapshotFromProviderConnection,
  connectionAuthoritySnapshotIsValid,
  connectionAuthoritySnapshotMatches,
  connectionAuthoritySnapshotsEqual,
  bindingIntegrityIsValid,
  bindingRegistrationAudit,
  bindingRegistrationFromRow,
  transportAdmissionInput,
  type BindingInsertRow,
  type BindingWritePorts,
  type CapabilityBindingRow,
  type CapabilityConnectionAuthoritySnapshot,
} from './internal/binding'
export { dereferenceOpenApiSchema } from './internal/schema-deref'
export type { RotateCapabilityTransportBindingAuthorityPatch } from './internal/binding/write'
export type {
  CdpX402PaymentSignerDependencies,
  CdpX402PaymentSigningIntent,
  CdpX402RequestFingerprintContext,
} from './internal/cdp-x402-payment-signer'
export { default as timezonePaymentRequired20260819Fixture } from './internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'
export { default as syntheticPostPaymentRequiredFixture } from './internal/x402-bazaar-fixtures/synthetic-post-payment-required.json'
export { default as onesourcePathRequest20260908Fixture } from './internal/x402-bazaar-fixtures/onesource-path-request-2026-09-08.json'
export { default as onesourceUnionRequest20260908Fixture } from './internal/x402-bazaar-fixtures/onesource-union-request-2026-09-08.json'
export {
  decideFacilitatorDiscoveryItem,
  FACILITATOR_DISCOVERY_URLS,
  isAllowlistedFacilitatorDiscoveryUrl,
  parseFacilitatorDiscoveryPage,
  paymentRequiredFromDiscoveryItem,
} from './internal/facilitator-discovery-ingest'
export {
  MAX_ELIGIBLE_SUPPLY,
  compareStableIdentifier,
  desiredEligibility,
  eligibilityPublicResult,
  eligibilityReplayAudits,
  eligibleBindingProjection,
  eligibleOfferingProjection,
  getEligibleExactCapabilitySupply,
  listIntegratedCapabilitySupply,
  listRouteableCapabilitySupply,
  setCapabilitySupplyEligibility,
  validEligibilityInput,
  type EligiblePublicationRow,
  type EligiblePublishedBusiness,
  type EligibleSupplyPorts,
  type EligibilityInput,
  type EligibilityWritePorts,
} from './internal/eligibility'
export {
  exactCurrentCatalogToolIsRouteable,
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
  type SuppliedCandidateQualification,
  type SuppliedCandidateRef,
} from './internal/graph'
export type {
  ProbeDigestBinding,
  ProbeDigestOffering,
  ProbeDigestPublication,
} from './internal/graph/probe-digest'
export {
  contractRefFromRow,
  offeringIntegrityIsValid,
  offeringRegistrationFromRow,
  registerCapabilityOffering,
  writablePresentation,
  type CapabilityOfferingRow,
  type OfferingInsertRow,
  type OfferingWritePorts,
} from './internal/offering'
export {
  beginOperation,
  ensureSupplyAudit,
  failOperation,
  isTrustedQuarantineParent,
  replayOperationResult,
  succeedOperation,
  registerCapabilityBindingCommand,
  registerCapabilityOfferingCommand,
  quarantineCapabilityBindingCommand,
  setCapabilitySupplyEligibilityCommand,
  type OperationKeyRecord,
  type OperationLedgerPorts,
  type OperationBeginResult,
} from './internal/tool-ledger'
export {
  INITIAL_PUBLICATION_LIFECYCLE,
  decodeConvexPublicationSource,
  isDirectPublicationSource,
  publicationLifecycle,
  publicationMaterialContainsCredential,
  publicationProjection,
  publicationValidationFix,
  publishPreparedCapabilityCommand,
  republishPreparedCapabilityCommand,
  refreshCapabilityCommand,
  validateCapabilityPublication,
  withdrawCapabilityCommand,
  type PublicationCommandPorts,
  type PublicationCommandRow,
  type PublicationLifecycle,
  type PublishPreparedCapabilityCommandInput,
  type PublishPreparedCapabilityCommandResult,
  type PublishPreparedCapabilityRefusal,
  type RepublishPreparedCapabilityCommandInput,
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
export { listingTier } from './internal/publication/provenance'
export {
  admitCapabilityPublicationCommand,
  type AdmitCapabilityPublicationInput,
  type AdmitCapabilityPublicationResult,
  type CapabilityPublicationAdmissionRefusal,
  type CapabilityPublicationAdmissionSource,
} from './internal/publication'
export {
  publicationSourceDescriptorJson,
  publicationSourceDigest,
} from './internal/publication/source'
export {
  boundedTrimmed,
  storedSupplyAuditEffectRef,
  supplyAuditEffectRef,
  validEvidenceRefs,
  validRegistrationContext,
  type RegistrationContext,
  type SupplyCommandActor,
  type SupplyAuditEventRow,
} from './internal/shared'
export {
  paymentLaneAdmission,
  transportObservationDigest,
} from './internal/x402-call-policy'
export type {
  EconomicRail,
  PaymentLaneAdmission,
} from './internal/x402-call-policy'
export {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  isX402PaymentRequirementForProfile,
  normalizeX402PaymentRequirement,
  x402PaymentProfileForEnvironment,
} from './internal/x402-payment-profile'
export type {
  X402AeEnvironment,
  X402PaymentProfile,
} from './internal/x402-payment-profile'
export {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from './internal/x402-seller-claim'
export type { X402SellerClaim } from './internal/x402-seller-claim'
export {
  canonicalEvmAddress,
  evmAddressEquals,
  isEvmAddress,
  isNonzeroEvmAddress,
  utf8ToHex,
  verifyEip191Message,
  type EvmAddress,
  type Hex,
} from './internal/x402-evm-protocol'
export {
  X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
  x402SellerCanaryAdmissionEvidenceRef,
  x402SellerCanaryAdmissionIsSatisfied,
} from './internal/x402-seller-onboarding/admission'

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
    price: priceSchema.optional(),
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

export type CapabilityTransportBindingRegistration = Readonly<z.infer<typeof bindingSchema>>

export type CapabilityOfferingRegistration = Readonly<z.infer<typeof offeringSchema>>
export type CapabilityOfferingOrigin = Readonly<z.infer<typeof offeringOriginSchema>>
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

export {
  SELLER_ONBOARDING_CANARY_PURPOSE,
  createSellerOnboardingCanaryCommitment,
  createX402SellerOnboarding,
  evaluateX402SellerPromotion,
  projectSellerOnboardingCanaryStatus,
  sellerCanaryCompletionEvidenceMatches,
  sellerOnboardingCanaryExecutionEnvelope,
  transitionX402SellerOnboarding,
  validX402SellerIdentity,
  x402SellerIdentityDigest,
} from './internal/x402-seller-onboarding'
export type {
  CreateSellerOnboardingCanaryInput,
  CreateX402SellerOnboardingCommand,
  CurrentSellerCanaryQuote,
  EvaluateX402SellerPromotionInput,
  OperationExecutionPurpose,
  SellerCanaryOutputEvidenceRequirement,
  SellerOnboardingCanaryCommitment,
  SellerOnboardingCanaryExecutionEnvelope,
  SellerOnboardingCanaryInvocationObservation,
  SellerOnboardingCanaryPromotionEvidence,
  SellerOnboardingCanaryStatus,
  X402CanaryEvidence,
  X402CanaryPaymentOutcome,
  X402SellerIdentity,
  X402SellerOnboarding,
  X402SellerOnboardingCommand,
  X402SellerOnboardingRefusal,
  X402SellerOnboardingResult,
  X402SellerOnboardingState,
  X402SellerPromotionAnchor,
  X402SellerPromotionRefusal,
  X402SellerPromotionResult,
} from './internal/x402-seller-onboarding'
