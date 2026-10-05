import { z } from 'zod'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { pointerSyntaxIsCanonical } from './pointed-schema'

/** Measurement semantics are part of the admitted contract, never a tariff.
 * Decimal quantities use reported strings so JSON float rounding cannot enter
 * the measurement. Overlapping subunits are reported separately, never summed. */
export const serviceUnitDefinitionSchema = z.strictObject({
  unitId: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u),
  version: z.number().int().positive().safe(),
  label: z.string().trim().min(1).max(100).regex(/^[^\p{Cc}\p{Cf}]+$/u),
  dimension: z.enum(['request', 'token', 'character', 'second', 'byte', 'item']),
  quantityExponent: z.number().int().min(0).max(12),
  outputPointer: z.string().min(1).max(500).refine(pointerSyntaxIsCanonical),
  encoding: z.enum(['integer_number', 'integer_string', 'decimal_string']),
  relationship: z.enum(['independent', 'subset']),
  parentUnitId: z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/u).exactOptional(),
}).refine(value => (value.relationship === 'subset') === (value.parentUnitId !== undefined))
export type ServiceUnitDefinition = z.infer<typeof serviceUnitDefinitionSchema>
export function serviceUnitDefinitionRef(definition: ServiceUnitDefinition): string {
  return `service-unit:${canonicalDigest({ format: 'ae.service-unit-definition:v1', ...definition }).slice(7)}`
}
