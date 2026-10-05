import { brandNonEmpty } from '@/modules/common/ids'
import { z } from 'zod'

import { pointerSyntaxIsCanonical } from '@/modules/capability-contract/public'

import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'

import type {
  AudUnits,
  FlowRef,
  JsonPointer,
  PlanInput,
  PlanJson,
  PlanNodeId,
  PlanNodePriceClass,
  PlanNodeQuote,
  PlanQuote,
  PlanQuoteInput,
  PlanQuoteResult,
  PlanRef,
  PlanValidationRefusal,
  ToolRef,
} from './contracts'

const MAX_PLAN_NODES = 10
const MAX_PLAN_JSON_BYTES = 262_144
const MAX_PROJECTED_ITEMS = 100
const planJsonEncoder = new TextEncoder()
const nodeIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const toolRefPattern = /^operation:v1:[0-9a-f]{64}$/u
const flowRefPattern = /^flow:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/output(?:#(.*))?$/u

function isJsonPointer(value: unknown): value is JsonPointer {
  return typeof value === 'string' && pointerSyntaxIsCanonical(value)
}

function isPlanNodeId(value: unknown): value is PlanNodeId {
  return typeof value === 'string' && nodeIdPattern.test(value)
}

function isToolRef(value: unknown): value is ToolRef {
  return typeof value === 'string' && toolRefPattern.test(value)
}

function isFlowRef(value: unknown): value is FlowRef {
  if (typeof value !== 'string') return false
  const match = flowRefPattern.exec(value)
  return match !== null && (match[2] === undefined || isJsonPointer(match[2]))
}

function isTransform(value: Readonly<Record<string, unknown>>): value is Readonly<Record<string, unknown>> & PlanInput {
  const keys = Object.keys(value)
  if (keys.length !== 1) return false
  if (keys[0] === '$map') {
    const map = value.$map
    if (!isRecord(map)) return false
    const mapKeys = Object.keys(map)
    return (mapKeys.length === 1 || (mapKeys.length === 2 && Object.hasOwn(map, 'path')))
      && Object.hasOwn(map, 'from')
      && isFlowRef(map.from)
      && (map.path === undefined || isJsonPointer(map.path))
  }
  if (keys[0] === '$concat') {
    const operands = value.$concat
    if (!Array.isArray(operands) || operands.length === 0 || operands.length > MAX_PROJECTED_ITEMS) return false
    let literalKind: 'string' | 'array' | undefined
    let projectedItems = 0
    for (const operand of operands) {
      if (typeof operand === 'string') {
        if (operand.startsWith('flow://')) {
          if (!isFlowRef(operand)) return false
          continue
        }
        if (literalKind === 'array') return false
        literalKind = 'string'
        continue
      }
      if (!Array.isArray(operand) || operand.length > MAX_PROJECTED_ITEMS
        || !operand.every(isPlanInput)) return false
      if (literalKind === 'string') return false
      literalKind = 'array'
      projectedItems += operand.length
      if (projectedItems > MAX_PROJECTED_ITEMS) return false
    }
    return true
  }
  return false
}

function isPlanInput(value: unknown): value is PlanInput {
  if (typeof value === 'string') return !value.startsWith('flow://') || isFlowRef(value)
  if (Array.isArray(value)) return value.every(isPlanInput)
  if (!isRecord(value)) return true
  const keys = Object.keys(value)
  if (keys.some((key) => key.startsWith('$'))) return isTransform(value)
  return Object.values(value).every(isPlanInput)
}

const planNodeIdSchema = z.string().regex(nodeIdPattern).transform((value) => (
  brandNonEmpty(value, 'PlanNodeId')
))
const toolRefSchema = z.string().regex(toolRefPattern).transform((value) => (
  brandNonEmpty(value, 'ToolRef')
))
const jsonPointerPattern = /^(?:\/(?:[^~/]|~[01])+)*$/u
const planNodeBoundsSchema = z.record(z.string().regex(jsonPointerPattern), z.strictObject({
  maxItems: z.number().int().min(0).max(MAX_PROJECTED_ITEMS),
}))
const planNodeSchema = z.strictObject({
  id: planNodeIdSchema,
  toolRef: toolRefSchema,
  input: z.record(z.string(), z.json()),
  dependsOn: z.array(planNodeIdSchema),
  bounds: planNodeBoundsSchema.exactOptional(),
})
const planNodesSchema = z.array(planNodeSchema).min(1).max(MAX_PLAN_NODES)
const planJsonShapeSchema: z.ZodType<PlanJson> = z.strictObject({ nodes: planNodesSchema })

export const planJsonSchema: z.ZodType<PlanJson> = planJsonShapeSchema
export const planQuoteInputSchema: z.ZodType<PlanQuoteInput> = z.strictObject({ plan: planJsonSchema })

const planRefSchema = z.string().min(1).max(300).regex(/^[\s\S]*\S[\s\S]*$/u).transform((value) => (
  brandNonEmpty(value, 'PlanRef')
))
const audUnitsSchema = z.string().regex(/^(?:0|[1-9]\d*)$/u).transform((value) => (
  brandNonEmpty(value, 'AudUnits')
))
const planNodePriceClassSchema: z.ZodType<PlanNodePriceClass> = z.enum([
  'fixed', 'cardinality_bounded', 'upto_bounded', 'unknown',
])
const planRateEvidenceSchema = z.strictObject({
  source: z.string(),
  observedAt: z.number().finite(),
  digest: z.string(),
})

const planNodeQuoteSchema: z.ZodType<PlanNodeQuote> = z.strictObject({
  nodeId: planNodeIdSchema,
  toolRef: toolRefSchema,
  inputMode: z.enum(['literal', 'deferred']),
  priceClass: planNodePriceClassSchema,
  pricingDigest: z.string(),
  bounds: planNodeBoundsSchema.exactOptional(),
  ceilingAudUnits: audUnitsSchema,
  rateEvidence: planRateEvidenceSchema.exactOptional(),
  validation: z.enum(['typed', 'untyped_ref']),
  dependsOn: z.array(planNodeIdSchema),
})
const planQuoteSchema: z.ZodType<PlanQuote> = z.strictObject({
  kind: z.literal('quoted'),
  planRef: planRefSchema,
  planDigest: z.string(),
  nodes: z.array(planNodeQuoteSchema),
  stages: z.array(z.array(planNodeIdSchema)),
  approvedTotalAudUnits: audUnitsSchema,
  currency: z.literal('AUD'),
  exponent: z.literal(6),
  expiresAt: z.number().finite(),
  rateEvidence: planRateEvidenceSchema.exactOptional(),
  dataFlows: z.array(z.strictObject({
    from: planNodeIdSchema,
    to: planNodeIdSchema,
    destinationProviderHost: z.string(),
  })),
})
const planValidationRefusalSchema: z.ZodType<PlanValidationRefusal> = z.strictObject({
  kind: z.literal('refused'),
  code: z.enum([
    'plan_empty', 'plan_too_large', 'duplicate_node_id', 'unknown_dependency', 'cycle',
    'duplicate_dependency', 'plan_too_deep', 'ref_not_in_depends_on', 'bad_pointer',
    'tool_not_admitted', 'input_schema_mismatch', 'ref_type_mismatch',
    'deferred_node_dynamic_price', 'bound_missing_for_cardinality_price', 'probe_failed',
    'ceiling_exceeds_per_call_cap', 'total_exceeds_available',
  ]),
  nodeId: planNodeIdSchema.exactOptional(),
})
export const planQuoteResultSchema: z.ZodType<PlanQuoteResult> = z.union([
  planQuoteSchema,
  planValidationRefusalSchema,
])
/**
 * Requires bounded JSON input and a strict 1–10 Node Plan with unique IDs and exact ToolRefs.
 * Invalid input, malformed pointers, and parser exceptions become closed refusal values.
 */

export function parsePlan(input: unknown): PlanJson | PlanValidationRefusal {
  try {
    const nodes = isRecord(input) && Array.isArray(input.nodes) ? input.nodes : undefined
    if (nodes?.length === 0) return { kind: 'refused', code: 'plan_empty' }
    if (nodes !== undefined && nodes.length > MAX_PLAN_NODES) {
      return { kind: 'refused', code: 'plan_too_large' }
    }
    if (!isBoundedJsonValue(input)) return { kind: 'refused', code: 'plan_too_large' }

    const encoded = JSON.stringify(input)
    if (encoded === undefined || planJsonEncoder.encode(encoded).byteLength > MAX_PLAN_JSON_BYTES) {
      return { kind: 'refused', code: 'plan_too_large' }
    }
    if (hasBadPointer(input)) return { kind: 'refused', code: 'bad_pointer' }

    const parsed = planJsonSchema.safeParse(input)
    if (!parsed.success) return { kind: 'refused', code: 'input_schema_mismatch' }
    if (hasDuplicateNodeId(parsed.data.nodes)) return { kind: 'refused', code: 'duplicate_node_id' }
    if (parsed.data.nodes.some((node) => Object.values(node.input).some((value) => !isPlanInput(value)))) {
      return { kind: 'refused', code: 'input_schema_mismatch' }
    }
    return parsed.data
  } catch {
    return { kind: 'refused', code: 'input_schema_mismatch' }
  }
}

function hasDuplicateNodeId(nodes: readonly unknown[]): boolean {
  const seen = new Set<string>()
  for (const node of nodes) {
    if (!isRecord(node) || typeof node.id !== 'string') continue
    if (seen.has(node.id)) return true
    seen.add(node.id)
  }
  return false
}

function hasBadPointer(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('flow://') && !isFlowRef(value)
  if (Array.isArray(value)) return value.some(hasBadPointer)
  if (!isRecord(value)) return false
  if (Object.hasOwn(value, 'id') && Object.hasOwn(value, 'toolRef') && isRecord(value.bounds)
    && Object.keys(value.bounds).some((pointer) => !isJsonPointer(pointer))) return true
  if (Object.hasOwn(value, '$map')) {
    const map = value.$map
    if (isRecord(map)
      && ((typeof map.from === 'string' && map.from.startsWith('flow://') && !isFlowRef(map.from))
        || (map.path !== undefined && !isJsonPointer(map.path)))) return true
  }
  return Object.values(value).some(hasBadPointer)
}

