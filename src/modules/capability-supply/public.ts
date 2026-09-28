import type { CapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  isPublicToolRef,
  type PublicToolRef,
} from '@/modules/common/tool-ref'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
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

export {
  capabilityToolId,
  createAdmittedToolRef,
  createPublicToolRef,
  validateAdmittedToolRef,
  type AdmittedToolRef,
} from './internal/public-tool-ref'
export {
  capabilityBindingEligibilityHash,
  capabilityBindingRegistrationHash,
  capabilityOfferingEligibilityHash,
  capabilityOfferingRegistrationHash,
  capabilitySupplyEligibilityHash,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  isAnonymousKeylessToolEligible,
  type AdmittedTransportMaterial,
  type AnonymousKeylessToolEffect,
  type CapabilityOfferingOrigin,
  type CapabilityOfferingRegistration,
  type CapabilityTransportBindingRegistration,
} from './internal/registration-schema'

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
export { publicationInputQuality } from './internal/publication/input-quality'
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
  PRODUCTION_PAYMENT_PROFILE,
  SANDBOX_PAYMENT_PROFILE,
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

export {
  buildX402AttemptObservation,
  claimX402SigningSlot,
  parseStoredX402Request,
  type StoredX402Request,
} from './internal/x402-payment-lifecycle'

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
