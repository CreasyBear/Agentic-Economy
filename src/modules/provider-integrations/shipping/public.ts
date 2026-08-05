import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'

export type ShippingQuoteRequest = Readonly<{
  requestId: string
  revision: number
  knownFacts: Readonly<Record<string, string | number | boolean>>
}>

const requiredFactFields = [
  'origin_name', 'origin_street1', 'origin_city', 'origin_region', 'origin_postcode', 'origin_country_code',
  'destination_name', 'destination_street1', 'destination_city', 'destination_region', 'destination_postcode', 'destination_country_code',
  'parcel_length_mm', 'parcel_width_mm', 'parcel_height_mm', 'parcel_weight_grams', 'delivery_deadline',
] as const

const addressSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  street1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(200),
  region: z.string().trim().min(1).max(200),
  postcode: z.string().trim().min(1).max(32),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
}).strict()

const quoteInputMaterialSchema = z.strictObject({
  schemaVersion: z.literal('ae-shipping-quote-input:v1'),
  source: z.strictObject({ requestId: z.string().min(1).max(200), requestRevision: z.number().int().positive() }).strict(),
  origin: addressSchema,
  destination: addressSchema,
  parcel: z.strictObject({
    lengthMillimetres: z.number().int().positive().max(1_000_000),
    widthMillimetres: z.number().int().positive().max(1_000_000),
    heightMillimetres: z.number().int().positive().max(1_000_000),
    weightGrams: z.number().int().positive().max(1_000_000_000),
  }).strict(),
  deliveryDeadline: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict()

export type ShippingQuoteInput = Readonly<z.infer<typeof quoteInputMaterialSchema> & { inputDigest: string }>

export type ShippingQuoteInputDerivation =
  | Readonly<{ kind: 'ready'; quoteInput: ShippingQuoteInput }>
  | Readonly<{
    kind: 'refused'
    reason: 'shipping_quote_input_missing' | 'shipping_quote_input_invalid'
    fields: readonly string[]
  }>

export function deriveShippingQuoteInput(request: ShippingQuoteRequest): ShippingQuoteInputDerivation {
  const missingFields = requiredFactFields.filter((field) => request.knownFacts[field] === undefined)
  if (missingFields.length > 0) return Object.freeze({
    kind: 'refused' as const,
    reason: 'shipping_quote_input_missing' as const,
    fields: Object.freeze([...missingFields]),
  })

  const material = {
    schemaVersion: 'ae-shipping-quote-input:v1' as const,
    source: { requestId: request.requestId, requestRevision: request.revision },
    origin: address(request.knownFacts, 'origin'),
    destination: address(request.knownFacts, 'destination'),
    parcel: {
      lengthMillimetres: request.knownFacts.parcel_length_mm,
      widthMillimetres: request.knownFacts.parcel_width_mm,
      heightMillimetres: request.knownFacts.parcel_height_mm,
      weightGrams: request.knownFacts.parcel_weight_grams,
    },
    deliveryDeadline: request.knownFacts.delivery_deadline,
  }
  const parsed = quoteInputMaterialSchema.safeParse(material)
  if (!parsed.success) return Object.freeze({
    kind: 'refused' as const,
    reason: 'shipping_quote_input_invalid' as const,
    fields: Object.freeze(uniqueSorted(parsed.error.issues.map((issue) => issue.path.join('.')))),
  })
  const frozenMaterial = deepFreeze(parsed.data)
  return Object.freeze({
    kind: 'ready',
    quoteInput: Object.freeze({
      ...frozenMaterial,
      inputDigest: canonicalDigest(frozenMaterial as StableHashValue),
    }),
  })
}

function address(
  facts: ShippingQuoteRequest['knownFacts'],
  prefix: 'origin' | 'destination',
): Readonly<Record<string, string | number | boolean | undefined>> {
  return {
    name: facts[`${prefix}_name`],
    street1: facts[`${prefix}_street1`],
    city: facts[`${prefix}_city`],
    region: facts[`${prefix}_region`],
    postcode: facts[`${prefix}_postcode`],
    countryCode: facts[`${prefix}_country_code`],
  }
}

