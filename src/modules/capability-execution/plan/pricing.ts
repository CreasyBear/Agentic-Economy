import { decodeJsonPointerSegments, escapePointerSegment, validateJsonSchema } from '@/modules/capability-contract/public'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import { resolveJsonPointer } from '@/modules/common/json-pointer'
import { normalizePricingConfig } from '@/modules/money/public'

import type { JsonValue, PlanNode, PlanNodePriceClass } from './contracts'

export const MAX_PLAN_CARDINALITY = 100

export type CardinalityProbeInputResult =
  | Readonly<{ kind: 'refused'; code: 'bound_missing_for_cardinality_price' | 'probe_failed' }>
  | Readonly<{ kind: 'ready'; input: Record<string, unknown> }>

/** Only published fixed AUD pricing is input-independent. `upto` has no admitted config. */
export function classifyPlanNodePrice(
  pricingConfig: unknown,
  _deferred: boolean,
): PlanNodePriceClass {
  const normalized = normalizePricingConfig(pricingConfig)
  return normalized.kind === 'valid' && normalized.config.kind === 'fixed_aud'
    ? 'fixed'
    : 'unknown'
}

/** Build the single maximum-cardinality, schema-valid input used for an unpaid 402 probe. */
export function buildCardinalityProbeInput(
  node: PlanNode,
  inputSchema: Readonly<Record<string, JsonValue>>,
  inputExamples: readonly Readonly<{ input: Readonly<Record<string, JsonValue>> }>[] | undefined,
): CardinalityProbeInputResult {
  const bounds = Object.entries(node.bounds ?? {})
  if (bounds.length === 0) return { kind: 'refused', code: 'bound_missing_for_cardinality_price' }
  if (inputExamples === undefined) return { kind: 'refused', code: 'probe_failed' }

  const orderedBounds = bounds.sort((left, right) => (
    decodeJsonPointerSegments(left[0]).length - decodeJsonPointerSegments(right[0]).length
  ))
  for (const [pointer, bound] of orderedBounds) {
    if (!Number.isSafeInteger(bound.maxItems) || bound.maxItems < 0 || bound.maxItems > MAX_PLAN_CARDINALITY) {
      return { kind: 'refused', code: 'bound_missing_for_cardinality_price' }
    }
  }

  for (const example of inputExamples) {
    if (!isBoundedJsonValue(example.input) || !validateJsonSchema(inputSchema, example.input)) continue
    const input = structuredClone(example.input)
    let usable = true
    for (const [pointer, bound] of orderedBounds) {
      const pointed = resolveJsonPointer(input, pointer)
      const arrayValue = pointed.found ? pointed.value : undefined
      if (!Array.isArray(arrayValue) || arrayValue.length > bound.maxItems) {
        usable = false
        break
      }
      if (bound.maxItems > 0 && arrayValue.length === 0) {
        usable = false
        break
      }
      const items = Array.from({ length: bound.maxItems }, (_, index) => (
        arrayValue.length === 0 ? undefined : arrayValue[index % arrayValue.length]
      ))
      if (items.some((item) => item === undefined) || !replaceJsonPointer(input, pointer, items)) {
        usable = false
        break
      }
    }
    if (usable && isBoundedJsonValue(input) && validateJsonSchema(inputSchema, input)) {
      return { kind: 'ready', input }
    }
  }
  return { kind: 'refused', code: 'probe_failed' }
}

/** A map always projects an array; exact pricing therefore needs an explicit bound. */
export function planNodeUsesCardinalityTransform(node: PlanNode): boolean {
  function visit(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false
    if (Array.isArray(value)) return value.some(visit)
    if (!isRecord(value)) return false
    if (Object.hasOwn(value, '$map')) return true
    if (Object.hasOwn(value, '$concat')) {
      return Array.isArray(value.$concat) && value.$concat.some(Array.isArray)
    }
    return Object.values(value).some(visit)
  }
  return Object.values(node.input).some(visit)
}

function replaceJsonPointer(root: Record<string, unknown>, pointer: string, value: unknown): boolean {
  const segments = decodeJsonPointerSegments(pointer)
  if (segments.length === 0
    || `/${segments.map(escapePointerSegment).join('/')}` !== pointer) return false
  const key = segments[segments.length - 1]
  if (key === undefined) return false
  const parentPointer = segments.length === 1
    ? ''
    : `/${segments.slice(0, -1).map(escapePointerSegment).join('/')}`
  const parent = resolveJsonPointer(root, parentPointer)
  if (!parent.found || parent.value === null || typeof parent.value !== 'object') return false
  if (Array.isArray(parent.value)) {
    if (!/^(?:0|[1-9]\d*)$/u.test(key)) return false
    const index = Number(key)
    if (!Number.isSafeInteger(index) || index >= parent.value.length) return false
    parent.value[index] = value
    return true
  }
  if (!Object.hasOwn(parent.value, key)) return false
  Object.defineProperty(parent.value, key, { value, enumerable: true, writable: true, configurable: true })
  return true
}
