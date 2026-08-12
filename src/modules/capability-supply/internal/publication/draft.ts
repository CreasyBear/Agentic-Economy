import {
  encodeCapabilityContractDocumentJson,
  type EncodedCapabilityContractDocument,
} from '@/modules/capability-contract-registry/public'
import { isCanonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  admitRegisteredTransport,
  defineCapabilityOfferingRegistration,
  defineCapabilityTransportBindingRegistration,
  type CapabilityOfferingOrigin,
  type CapabilityOfferingRegistration,
  type CapabilityPublicationBindingDraft,
  type CapabilityPublicationImport,
  type CapabilityPublicationOfferingDraft,
  type CapabilityPublicationSourceSelector,
  type CapabilityTransportBindingRegistration,
  type CanonicalCapabilityPublicationDraft,
  type TransportAdmissionResult,
} from '@/modules/capability-supply/public'
import {
  compareExactAmounts,
  normalizePricingConfig,
  pricingConfigDigest,
  type PricingConfig,
} from '@/modules/money/public'
import { transportAdmissionInput } from '../binding/registration'
import { validCapabilityPublicationSourceRevision } from './provenance'
import {
  normalizeCapabilityPublication,
  type CapabilityPublicationImportRefusal,
} from '../publication-importers'
import type { SchemaDereferencer } from '../admit-provider-schema'
import {
  publicationMaterialContainsCredential,
  publicationSourceDescriptorIsCanonical,
  publicationSourceDescriptorJson,
  publicationSourceDigest,
  publicationSourceSelector,
} from './source'

const encoder = new TextEncoder()
const MAX_SOURCE_DESCRIPTOR_BYTES = 262_144
const sourceKindAdapterId: Readonly<
  Record<
    CanonicalCapabilityPublicationDraft['source']['kind'],
    'http-json:v1' | 'mcp-jsonrpc:v1' | 'x402-fetch:v2'
  >
> = {
  // Direct envelopes have no alternate readiness contract yet.
  ae_envelope: 'http-json:v1',
  openapi_http: 'http-json:v1',
  mcp: 'mcp-jsonrpc:v1',
  agent_plugin_mcp: 'mcp-jsonrpc:v1',
  x402: 'x402-fetch:v2',
}

export function pricingConfigForOffering(
  offering: CapabilityPublicationOfferingDraft,
): PricingConfig | undefined {
  const price = offering.presentation.price
  if (price.kind !== 'fixed') return undefined
  return { version: 'pricing:v2', unit: 'call', paidAmount: price.amount }
}

type PublicationPricingRefusal = 'pricing_config_invalid' | 'price_unavailable'

export type PreparedPublicationMaterial = Readonly<{
  sourceKind: CanonicalCapabilityPublicationDraft['source']['kind']
  sourceSelector: CapabilityPublicationSourceSelector
  sourceDescriptorJson: string
  sourceRevision: string
  sourceDigest: string
  documentJson: string
  offering: CapabilityPublicationOfferingDraft
  binding: CapabilityPublicationBindingDraft
  evidenceRefs: readonly string[]
  pricingConfigJson: string
  priceDigest: string
}>

export type PreparedPublicationDraft = PreparedPublicationMaterial & Readonly<{
  draft: CanonicalCapabilityPublicationDraft
  encoded: EncodedCapabilityContractDocument
  pricingConfig: PricingConfig
  prepared: PreparedPublicationMaterial
}>

export type AdmittedPublicationDraft = PreparedPublicationMaterial & Readonly<{
  encoded: EncodedCapabilityContractDocument
  offering: CapabilityOfferingRegistration
  binding: CapabilityTransportBindingRegistration
  admittedTransport: Extract<TransportAdmissionResult, { kind: 'admitted' }>
}>

export type PreparePublicationDraftRefusal =
  | CapabilityPublicationImportRefusal
  | 'contract_too_large'
  | 'contract_invalid'
  | 'source_revision_invalid'
  | PublicationPricingRefusal

export type AdmitPublicationDraftRefusal =
  | PreparePublicationDraftRefusal
  | 'offering_invalid'
  | 'binding_invalid'
  | Extract<TransportAdmissionResult, { kind: 'refused' }>['reason']

export async function preparePublicationDraft(input: Readonly<{
  source: CapabilityPublicationImport
  sourceRevision: string
  pricingConfig: unknown
  evidenceRefs: readonly string[]
  offering?: CapabilityPublicationOfferingDraft | undefined
  binding?: CapabilityPublicationBindingDraft | undefined
  origin?: CapabilityOfferingOrigin | undefined
  derefSchema?: SchemaDereferencer | undefined
}>): Promise<
  | Readonly<{ kind: 'prepared'; draft: CanonicalCapabilityPublicationDraft; encoded: EncodedCapabilityContractDocument; prepared: PreparedPublicationMaterial } & PreparedPublicationDraft>
  | Readonly<{ kind: 'refused'; reason: PreparePublicationDraftRefusal }>
> {
  if (!validCapabilityPublicationSourceRevision(input.sourceRevision)) {
    return { kind: 'refused', reason: 'source_revision_invalid' }
  }
  const pricing = normalizePricingConfig(input.pricingConfig)
  if (pricing.kind === 'invalid') return { kind: 'refused', reason: 'pricing_config_invalid' }
  const pricingConfig = pricing.config

  let normalized
  try {
    normalized = await normalizeCapabilityPublication(input.source, input.derefSchema)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (normalized.kind === 'refused') return { kind: 'refused', reason: normalized.reason }

  const offering = input.origin === undefined && input.offering === undefined
    ? normalized.draft.offering
    : {
        ...(input.offering ?? normalized.draft.offering),
        ...(input.origin === undefined ? {} : { origin: input.origin }),
      }
  const binding = input.binding ?? normalized.draft.binding
  const draft: CanonicalCapabilityPublicationDraft = {
    ...normalized.draft,
    offering,
    binding,
  }
  const displayedPrice = draft.offering.presentation.price
  if (displayedPrice.kind !== 'fixed' || compareExactAmounts(displayedPrice.amount, pricingConfig.paidAmount) !== 0) {
    return { kind: 'refused', reason: 'price_unavailable' }
  }

  let encoded: EncodedCapabilityContractDocument
  try {
    encoded = encodeCapabilityContractDocumentJson(draft.documentJson)
  } catch (error) {
    return {
      kind: 'refused',
      reason: error instanceof Error && error.message === 'capability_contract_too_large'
        ? 'contract_too_large'
        : 'contract_invalid',
    }
  }
  let sourceDescriptorJson: string
  try {
    sourceDescriptorJson = publicationSourceDescriptorJson(input.source)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (encoder.encode(sourceDescriptorJson).byteLength > MAX_SOURCE_DESCRIPTOR_BYTES) {
    return { kind: 'refused', reason: 'source_too_large' }
  }
  const sourceSelector = publicationSourceSelector(draft)
  const sourceDigest = publicationSourceDigest({
    sourceKind: draft.source.kind,
    selector: sourceSelector,
    descriptorJson: sourceDescriptorJson,
  })
  const pricingConfigJson = stableStringify(pricingConfig as StableHashValue)
  let sourceDescriptor: unknown
  try {
    sourceDescriptor = JSON.parse(sourceDescriptorJson)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (!publicationSourceDescriptorIsCanonical(draft.source.kind, sourceDescriptor)
    || publicationMaterialContainsCredential({
      sourceDescriptor,
      sourceSelector,
      sourceRevision: input.sourceRevision,
      contractDocument: encoded.document,
      offering: draft.offering,
      binding: draft.binding,
      evidenceRefs: input.evidenceRefs,
      pricing: pricingConfig,
    })) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const prepared: PreparedPublicationMaterial = {
    sourceKind: draft.source.kind,
    sourceSelector,
    sourceDescriptorJson,
    sourceRevision: input.sourceRevision,
    sourceDigest,
    documentJson: encoded.documentJson,
    offering: draft.offering,
    binding: draft.binding,
    evidenceRefs: [...input.evidenceRefs],
    pricingConfigJson,
    priceDigest: pricingConfigDigest(pricingConfig),
  }
  return {
    kind: 'prepared',
    ...prepared,
    draft: { ...draft, documentJson: encoded.documentJson },
    encoded,
    pricingConfig,
    prepared,
  }
}

export async function admitPublicationDraft(input: Readonly<{
  prepared: PreparedPublicationMaterial
  businessId: string
  origin?: CapabilityOfferingOrigin | undefined
}>): Promise<
  | Readonly<{ kind: 'admitted' } & AdmittedPublicationDraft>
  | Readonly<{ kind: 'refused'; reason: AdmitPublicationDraftRefusal }>
> {
  let encoded: EncodedCapabilityContractDocument
  try {
    encoded = encodeCapabilityContractDocumentJson(input.prepared.documentJson)
  } catch (error) {
    return {
      kind: 'refused',
      reason: error instanceof Error && error.message === 'capability_contract_too_large'
        ? 'contract_too_large'
        : 'contract_invalid',
    }
  }
  const prepared = input.prepared
  if (!isCanonicalDigest(prepared.sourceDigest) || !isCanonicalDigest(prepared.priceDigest)) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  let descriptor: unknown
  let pricingInput: unknown
  try {
    descriptor = JSON.parse(prepared.sourceDescriptorJson)
    pricingInput = JSON.parse(prepared.pricingConfigJson)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const expectedSourceDigest = publicationSourceDigest({
    sourceKind: prepared.sourceKind,
    selector: prepared.sourceSelector,
    descriptorJson: prepared.sourceDescriptorJson,
  })
  if (expectedSourceDigest !== prepared.sourceDigest
    || prepared.sourceDescriptorJson !== stableStringify(descriptor as StableHashValue)) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const pricing = normalizePricingConfig(pricingInput)
  if (pricing.kind === 'invalid' || pricingConfigDigest(pricing.config) !== prepared.priceDigest) {
    return { kind: 'refused', reason: 'pricing_config_invalid' }
  }
  const offeringDraft = input.origin === undefined
    ? prepared.offering
    : { ...prepared.offering, origin: input.origin }
  if (!publicationSourceDescriptorIsCanonical(prepared.sourceKind, descriptor)
    || publicationMaterialContainsCredential({
      sourceDescriptor: descriptor,
      sourceSelector: prepared.sourceSelector,
      sourceRevision: prepared.sourceRevision,
      contractDocument: encoded.document,
      offering: offeringDraft,
      binding: prepared.binding,
      evidenceRefs: prepared.evidenceRefs,
      pricing: pricing.config,
    })) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const offeringInput = {
    ...offeringDraft,
    businessId: input.businessId,
    contractRef: encoded.contract.ref,
  }
  const bindingInput = {
    ...prepared.binding,
    offeringId: prepared.offering.offeringId,
    networkId: prepared.offering.networkId,
    contractRef: encoded.contract.ref,
  }
  let offering: CapabilityOfferingRegistration
  try {
    offering = defineCapabilityOfferingRegistration(offeringInput)
  } catch {
    return { kind: 'refused', reason: 'offering_invalid' }
  }
  let binding: CapabilityTransportBindingRegistration
  let admittedTransport: TransportAdmissionResult
  try {
    binding = defineCapabilityTransportBindingRegistration(bindingInput)
    admittedTransport = admitRegisteredTransport(transportAdmissionInput(binding))
  } catch {
    return { kind: 'refused', reason: 'binding_invalid' }
  }
  if (admittedTransport.kind === 'refused') return admittedTransport
  if (binding.adapter.adapterId !== sourceKindAdapterId[prepared.sourceKind]) {
    return { kind: 'refused', reason: 'binding_invalid' }
  }
  return {
    kind: 'admitted',
    ...prepared,
    encoded,
    offering,
    binding,
    admittedTransport,
  }
}

