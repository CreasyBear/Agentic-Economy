import { z } from 'zod'

import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import { identifier, jsonValueSchema } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import {
  authoritySchema,
  cancellationSchema,
  continuationSchema,
} from './transport-terms-schema'

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
