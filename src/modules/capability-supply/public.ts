import { z } from 'zod'

import type { JsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

export { admitRegisteredTransport } from './internal/transport-adapters'
export type { TransportAdmissionInput, TransportAdmissionResult } from './internal/transport-adapters'
export {
  importMcpCapability,
  importOpenApiHttpCapability,
  importX402Capability,
  normalizeCapabilityPublication,
} from './internal/publication-importers'
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
} from './internal/publication-importers'
export { runCapabilityReadinessProbe } from './internal/readiness-probe'
export type { CapabilityProbeOutcome } from './internal/readiness-probe'

const identifier = z.string().trim().min(1).max(200)
const MAX_OPAQUE_CONFIG_BYTES = 65_536
const encoder = new TextEncoder()
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))
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
const priceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('fixed'),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.strictObject({
    kind: z.literal('range'),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    minimumAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    maximumAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).refine((value) => value.minimumAmountMinor <= value.maximumAmountMinor),
  z.strictObject({ kind: z.literal('on_request') }),
])
const offeringSchema = z.strictObject({
  offeringId: identifier,
  businessId: identifier,
  networkId: identifier,
  contractRef: contractRefSchema,
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
const bindingSchema = z.strictObject({
  bindingId: identifier,
  offeringId: identifier,
  networkId: identifier,
  contractRef: contractRefSchema,
  endpointUrl: z.string().trim().min(1).max(2_000),
  credentialRef: z.string().trim().min(1).max(500),
  continuation: continuationSchema,
  cancellation: cancellationSchema,
  adapter: z.strictObject({ adapterId: identifier, config: jsonValueSchema }),
  registrationEvidenceRefs: evidenceRefs,
})

export type CapabilityOfferingRegistration = Readonly<z.infer<typeof offeringSchema>>
export type CapabilityTransportBindingRegistration = Readonly<z.infer<typeof bindingSchema>>
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
