import { validateJsonSchema } from '@/modules/capability-contract/public'
import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveJsonPointer } from '@/modules/common/json-pointer'
import { isRecord } from '@/modules/common/is-record'

import type { NoCallOutcome, PlanNode } from './contracts'
import { collectPlanFlowRefs } from './graph'

const MAX_PROJECTED_ITEMS = 100
const MAX_INPUT_BYTES = 262_144
const encoder = new TextEncoder()
const flowReferencePattern = /^flow:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/output(?:#(.*))?$/u

type ValueResult = { kind: 'resolved'; value: unknown } | { kind: 'failed'; code: NoCallOutcome }
export type PlanInputResolution =
  | { kind: 'resolved'; input: Record<string, unknown>; inputDigest: string }
  | { kind: 'failed'; code: NoCallOutcome }

/** Resolve only the frozen Node input; provider data is inert, never a new expression. */
export function resolvePlanInput(
  node: PlanNode,
  outputs: Readonly<Record<string, unknown>>,
  targetSchema: Readonly<Record<string, unknown>>,
): PlanInputResolution {
  const references = new Map<string, unknown>()
  for (const slot of Object.values(node.input)) {
    for (const { ref } of collectPlanFlowRefs(slot)) {
      if (references.has(ref)) continue
      const match = flowReferencePattern.exec(ref)
      const sourceId = match?.[1]
      const pointer = match?.[2] ?? ''
      if (sourceId === undefined || !node.dependsOn.some((id) => id === sourceId)
        || !Object.hasOwn(outputs, sourceId)) return { kind: 'failed', code: 'ref_type_mismatch' }
      const pointed = resolveJsonPointer(outputs[sourceId], pointer)
      if (!pointed.found) return { kind: 'failed', code: 'ref_type_mismatch' }
      references.set(ref, pointed.value)
    }
  }

  function resolveValue(value: unknown): ValueResult {
    if (typeof value === 'string' && value.startsWith('flow://')) {
      return references.has(value)
        ? { kind: 'resolved', value: references.get(value) }
        : { kind: 'failed', code: 'ref_type_mismatch' }
    }
    if (value === null || typeof value !== 'object') return { kind: 'resolved', value }
    if (Array.isArray(value)) {
      const items: unknown[] = []
      for (const item of value) {
        const resolved = resolveValue(item)
        if (resolved.kind === 'failed') return resolved
        items.push(resolved.value)
      }
      return { kind: 'resolved', value: items }
    }
    if (isRecord(value) && Object.hasOwn(value, '$map')) {
      const expression = value.$map
      if (!isRecord(expression) || typeof expression.from !== 'string'
        || (expression.path !== undefined && typeof expression.path !== 'string')) {
        return { kind: 'failed', code: 'ref_type_mismatch' }
      }
      const source = references.get(expression.from)
      if (!Array.isArray(source)) return { kind: 'failed', code: 'ref_type_mismatch' }
      if (source.length > MAX_PROJECTED_ITEMS) return { kind: 'failed', code: 'input_exceeds_bound' }
      const items: unknown[] = []
      for (const item of source) {
        const pointed = resolveJsonPointer(item, expression.path ?? '')
        if (!pointed.found) return { kind: 'failed', code: 'ref_type_mismatch' }
        items.push(pointed.value)
      }
      return { kind: 'resolved', value: items }
    }
    if (isRecord(value) && Object.hasOwn(value, '$concat')) {
      const operands = value.$concat
      if (!Array.isArray(operands) || operands.length === 0) {
        return { kind: 'failed', code: 'ref_type_mismatch' }
      }
      let category: 'string' | 'array' | undefined
      const stringParts: string[] = []
      const arrayParts: unknown[] = []
      for (const operand of operands) {
        const resolved = resolveValue(operand)
        if (resolved.kind === 'failed') return resolved
        if (typeof resolved.value === 'string') {
          if (category === 'array') return { kind: 'failed', code: 'ref_type_mismatch' }
          category = 'string'
          stringParts.push(resolved.value)
        } else if (Array.isArray(resolved.value)) {
          if (category === 'string') return { kind: 'failed', code: 'ref_type_mismatch' }
          category = 'array'
          if (resolved.value.length + arrayParts.length > MAX_PROJECTED_ITEMS) {
            return { kind: 'failed', code: 'input_exceeds_bound' }
          }
          arrayParts.push(...resolved.value)
        } else {
          return { kind: 'failed', code: 'ref_type_mismatch' }
        }
      }
      return category === 'string'
        ? { kind: 'resolved', value: stringParts.join('') }
        : { kind: 'resolved', value: arrayParts }
    }
    const entries: [string, unknown][] = []
    for (const [key, child] of Object.entries(value)) {
      const resolved = resolveValue(child)
      if (resolved.kind === 'failed') return resolved
      entries.push([key, resolved.value])
    }
    return { kind: 'resolved', value: Object.fromEntries(entries) }
  }

  const input: Record<string, unknown> = {}
  for (const [key, slot] of Object.entries(node.input)) {
    const resolved = resolveValue(slot)
    if (resolved.kind === 'failed') return resolved
    Object.defineProperty(input, key, { value: resolved.value, enumerable: true, writable: true, configurable: true })
  }
  if (!isBoundedJsonValue(input)) return { kind: 'failed', code: 'input_invalid' }
  for (const [pointer, bound] of Object.entries(node.bounds ?? {})) {
    const pointed = resolveJsonPointer(input, pointer)
    if (!pointed.found || !Array.isArray(pointed.value)) return { kind: 'failed', code: 'input_invalid' }
    if (pointed.value.length > bound.maxItems) return { kind: 'failed', code: 'input_exceeds_bound' }
  }

  function exceedsArrayBound(value: unknown): boolean {
    if (Array.isArray(value)) return value.length > MAX_PROJECTED_ITEMS || value.some(exceedsArrayBound)
    return value !== null && typeof value === 'object'
      && Object.values(value).some(exceedsArrayBound)
  }
  if (exceedsArrayBound(input)) return { kind: 'failed', code: 'input_exceeds_bound' }
  const encodedInput = JSON.stringify(input)
  if (encodedInput === undefined || encoder.encode(encodedInput).byteLength > MAX_INPUT_BYTES
    || !validateJsonSchema(targetSchema, input)) return { kind: 'failed', code: 'input_invalid' }
  return { kind: 'resolved', input, inputDigest: canonicalDigest(input) }
}
