import {
  decodeJsonPointerSegments,
  escapePointerSegment,
  pointerSyntaxIsCanonical,
  resolvePointedSchema,
  validateJsonSchema,
} from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { resolveJsonPointer } from '@/modules/common/json-pointer'

import { collectPlanFlowRefs } from './graph'
import type { FlowRef, JsonValue, PlanInput, PlanJson, PlanNodeId, PlanValidationRefusal } from './contracts'

type JsonSchema = Readonly<Record<string, JsonValue>>
type JsonType = 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string'
type TypeSet = ReadonlySet<JsonType>
type FlowLocation = Readonly<{ kind: 'direct' | 'map' | 'concat'; targetPointer: string; expression?: unknown }>
type LiteralSubtree = Readonly<{ value: unknown; pointer: string; targetPrefix: string }>
type LiteralScan = Readonly<{ hasReference: boolean; hasTransform: boolean }>
type ParsedRef = Readonly<{ nodeId: PlanNodeId; pointer: string }>

export type PlanEdgeValidation = Readonly<{
  from: PlanNodeId
  to: PlanNodeId
  sourcePointer: string
  targetPointer: string
  validation: 'typed' | 'untyped_ref'
}>

const flowReferencePattern = /^flow:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/output(?:#(.*))?$/u

function isJsonType(value: unknown): value is JsonType {
  return value === 'null' || value === 'boolean' || value === 'object'
    || value === 'array' || value === 'number' || value === 'integer' || value === 'string'
}

function schemaAtPointer(value: unknown, pointer: string): JsonSchema | undefined {
  if (!isRecord(value)) return undefined
  return resolvePointedSchema(value as JsonSchema, pointer)
}

function intersectTypes(left: TypeSet, right: TypeSet): Set<JsonType> {
  const intersection = new Set<JsonType>()
  for (const leftType of left) for (const rightType of right) {
    if (leftType === rightType) intersection.add(leftType)
    else if (leftType === 'integer' && rightType === 'number' || leftType === 'number' && rightType === 'integer') intersection.add('integer')
  }
  return intersection
}

/** Extract only declared JSON Schema type constraints; examples and format hints are not types. */
function jsonTypes(schema: JsonSchema | undefined): TypeSet | undefined {
  if (schema === undefined) return undefined
  let types: Set<JsonType> | undefined
  const declared = schema.type
  if (typeof declared === 'string' && isJsonType(declared)) types = new Set([declared])
  else if (Array.isArray(declared) && declared.length > 0 && declared.every(isJsonType)) types = new Set(declared)
  else if (declared !== undefined) return undefined

  const allOf = schema.allOf
  if (Array.isArray(allOf)) for (const part of allOf) {
    const partTypes = jsonTypes(isRecord(part) ? part as JsonSchema : undefined)
    if (partTypes !== undefined) types = types === undefined ? new Set(partTypes) : intersectTypes(types, partTypes)
  }
  const anyOf = schema.anyOf
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    const branches = anyOf.map((part) => jsonTypes(isRecord(part) ? part as JsonSchema : undefined))
    if (branches.every((branch) => branch !== undefined)) {
      const union = new Set(branches.flatMap((branch) => [...branch]))
      types = types === undefined ? union : intersectTypes(types, union)
    }
  }
  const oneOf = schema.oneOf
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    const branches = oneOf.map((part) => jsonTypes(isRecord(part) ? part as JsonSchema : undefined))
    const known = branches.filter((branch): branch is TypeSet => branch !== undefined && branch.size > 0)
    if (known.length !== branches.length) return undefined
    for (const [index, left] of known.entries()) {
      for (let other = index + 1; other < known.length; other += 1) {
        const right = known[other]
        if (right === undefined || intersectTypes(left, right).size > 0) return undefined
      }
    }
    const union = new Set(known.flatMap((branch) => [...branch]))
    types = types === undefined ? union : intersectTypes(types, union)
  }
  return types?.size ? types : undefined
}

function compatible(source: TypeSet, target: TypeSet): boolean {
  if (source.size === 0) return true
  if (target.size === 0) return false
  return [...source].every((kind) => target.has(kind) || (kind === 'integer' && target.has('number')))
}

function appendPointer(pointer: string, segment: string): string {
  return `${pointer}/${escapePointerSegment(segment)}`
}

function pointerFromSegments(segments: readonly string[]): string {
  return segments.reduce(appendPointer, '')
}

function flowLocation(input: PlanInput, slotPointer: string): FlowLocation {
  const segments = decodeJsonPointerSegments(slotPointer)
  const last = segments.at(-1)
  const previous = segments.at(-2)
  if (last === 'from' && previous === '$map') {
    const targetPointer = pointerFromSegments(segments.slice(0, -2))
    const expression = resolveJsonPointer(input, targetPointer)
    if (expression.found && isRecord(expression.value) && Object.hasOwn(expression.value, '$map')) {
      return { kind: 'map', targetPointer, expression: expression.value }
    }
  }
  if (previous === '$concat' && last !== undefined && /^(?:0|[1-9]\d*)$/u.test(last)) {
    const targetPointer = pointerFromSegments(segments.slice(0, -2))
    const expression = resolveJsonPointer(input, targetPointer)
    if (expression.found && isRecord(expression.value) && Object.hasOwn(expression.value, '$concat')) {
      return { kind: 'concat', targetPointer, expression: expression.value }
    }
  }
  return { kind: 'direct', targetPointer: slotPointer }
}

function parseReference(
  ref: FlowRef,
  nodesById: ReadonlyMap<PlanNodeId, PlanJson['nodes'][number]>,
  consumerNodeId: PlanNodeId,
): ParsedRef | PlanValidationRefusal {
  const match = flowReferencePattern.exec(ref)
  if (match === null || !pointerSyntaxIsCanonical(match[2] ?? '')) return { kind: 'refused', code: 'bad_pointer', nodeId: consumerNodeId }
  const nodeId = match[1] as PlanNodeId
  if (!nodesById.has(nodeId)) return { kind: 'refused', code: 'unknown_dependency', nodeId: consumerNodeId }
  const pointer = match[2] ?? ''
  const roundTrip = decodeJsonPointerSegments(pointer).map(escapePointerSegment).join('/')
  if (roundTrip !== (pointer === '' ? '' : pointer.slice(1))) return { kind: 'refused', code: 'bad_pointer', nodeId: consumerNodeId }
  return { nodeId, pointer }
}

function jsonValueType(value: JsonValue): JsonType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'object') return 'object'
  return typeof value as Exclude<JsonType, 'object' | 'array' | 'integer'>
}

function literalArrayTypes(values: readonly JsonValue[]): TypeSet {
  return new Set(values.map(jsonValueType))
}

function arrayItemTypes(schema: JsonSchema | undefined, root: unknown, pointer: string, itemPath: string): TypeSet | undefined {
  if (schema === undefined) return undefined
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : []
  const items = schema.items
  const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : Number.POSITIVE_INFINITY
  if (maxItems === 0 || (prefixItems.length === 0 && items === false)) return new Set()
  const itemIndices: number[] = []
  for (let index = 0; index < Math.min(prefixItems.length, maxItems); index += 1) itemIndices.push(index)
  if (maxItems > prefixItems.length) {
    if (isRecord(items)) itemIndices.push(prefixItems.length)
    else if (items !== false) return undefined
  }
  if (itemIndices.length === 0) return undefined
  const types = new Set<JsonType>()
  for (const index of itemIndices) {
    const itemPointer = `${appendPointer(pointer, String(index))}${itemPath}`
    const itemTypes = jsonTypes(schemaAtPointer(root, itemPointer))
    if (itemTypes === undefined) return undefined
    for (const type of itemTypes) types.add(type)
  }
  return types
}
function collectLiteralSubtrees(
  value: unknown,
  pointer: string,
  targetPrefix: string,
  referencePointers: readonly string[],
  candidates: LiteralSubtree[],
): LiteralScan {
  const hasReference = referencePointers.some((reference) => (
    reference === pointer || reference.startsWith(pointer === '' ? '/' : `${pointer}/`)
  ))
  if (referencePointers.includes(pointer)) return { hasReference: true, hasTransform: false }
  if (isRecord(value) && (Object.hasOwn(value, '$map') || Object.hasOwn(value, '$concat'))) {
    return { hasReference, hasTransform: true }
  }
  if (Array.isArray(value) || isRecord(value)) {
    const start = candidates.length
    let childHasReference = false
    let childHasTransform = false
    const entries = Array.isArray(value)
      ? value.map((child, index) => [String(index), child] as const)
      : Object.entries(value)
    for (const [key, child] of entries) {
      const childScan = collectLiteralSubtrees(child, appendPointer(pointer, key), targetPrefix, referencePointers, candidates)
      childHasReference ||= childScan.hasReference
      childHasTransform ||= childScan.hasTransform
    }
    if (!childHasReference && !childHasTransform) {
      candidates.length = start
      candidates.push({ value, pointer, targetPrefix })
    }
    return { hasReference: childHasReference, hasTransform: childHasTransform }
  }
  if (!hasReference) candidates.push({ value, pointer, targetPrefix })
  return { hasReference, hasTransform: false }
}


/** Check every declared FlowRef against its direct dependency and pointed input/output schemas. */
export function checkPlanReferences(
  plan: PlanJson,
  schemas: Readonly<Record<string, { inputSchema: unknown; outputSchema?: unknown }>>,
): readonly PlanEdgeValidation[] | PlanValidationRefusal {
  const nodesById = new Map(plan.nodes.map((node) => [node.id, node] as const))
  const edges: PlanEdgeValidation[] = []
  for (const node of plan.nodes) {
    const nodeSchema = schemas[node.toolRef]
    const refsBySlot = Object.entries(node.input).map(([key, input]) => ({
      input,
      targetPrefix: appendPointer('', key),
      refs: collectPlanFlowRefs(input),
    }))
    const literalSubtrees: LiteralSubtree[] = []
    let hasReference = false
    let hasTransform = false
    for (const { input, targetPrefix, refs } of refsBySlot) {
      const scan = collectLiteralSubtrees(input, '', targetPrefix, refs.map(({ slotPointer }) => slotPointer), literalSubtrees)
      hasReference ||= scan.hasReference
      hasTransform ||= scan.hasTransform
    }
    if (!hasReference && !hasTransform && isRecord(nodeSchema?.inputSchema)
      && !validateJsonSchema(nodeSchema.inputSchema, node.input)) {
      return { kind: 'refused', code: 'input_schema_mismatch', nodeId: node.id }
    }
    if (hasReference || hasTransform) for (const { value, pointer, targetPrefix } of literalSubtrees) {
      const targetSchema = schemaAtPointer(nodeSchema?.inputSchema, `${targetPrefix}${pointer}`)
      if (targetSchema !== undefined && !validateJsonSchema(targetSchema, value)) {
        return { kind: 'refused', code: 'input_schema_mismatch', nodeId: node.id }
      }
    }
    for (const { input, targetPrefix, refs } of refsBySlot) for (const { ref, slotPointer } of refs) {
      const parsed = parseReference(ref, nodesById, node.id)
      if ('kind' in parsed) return parsed
      const sourceNode = nodesById.get(parsed.nodeId)
      if (sourceNode === undefined) return { kind: 'refused', code: 'unknown_dependency', nodeId: node.id }
      if (!node.dependsOn.includes(sourceNode.id)) return { kind: 'refused', code: 'ref_not_in_depends_on', nodeId: node.id }
      const sourceSchema = schemas[sourceNode.toolRef]
      const outputRootTypes = jsonTypes(schemaAtPointer(sourceSchema?.outputSchema, ''))
      if (parsed.pointer !== '' && outputRootTypes !== undefined
        && !outputRootTypes.has('object') && !outputRootTypes.has('array')) {
        return { kind: 'refused', code: 'bad_pointer', nodeId: node.id }
      }
      const sourceTypes = jsonTypes(schemaAtPointer(sourceSchema?.outputSchema, parsed.pointer))
      const location = flowLocation(input, slotPointer)
      const targetPointer = `${targetPrefix}${location.targetPointer}`
      const targetSchema = schemaAtPointer(nodeSchema?.inputSchema, targetPointer)
      const targetTypes = jsonTypes(targetSchema)
      let validation: PlanEdgeValidation['validation'] = sourceTypes !== undefined && targetTypes !== undefined
        ? 'typed' : 'untyped_ref'
      if (location.kind === 'direct') {
        if (sourceTypes !== undefined && targetTypes !== undefined && !compatible(sourceTypes, targetTypes)) {
          return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
        }
      } else if (location.kind === 'map') {
        const expression = location.expression as { $map: { path?: string } }
        const path = expression.$map.path ?? ''
        if (!pointerSyntaxIsCanonical(path)) return { kind: 'refused', code: 'bad_pointer', nodeId: node.id }
        if (sourceTypes !== undefined && (sourceTypes.size !== 1 || !sourceTypes.has('array'))) {
          return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
        }
        if (targetTypes !== undefined && !compatible(new Set(['array']), targetTypes)) {
          return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
        }
        const sourceArraySchema = schemaAtPointer(sourceSchema?.outputSchema, parsed.pointer)
        const mappedTypes = arrayItemTypes(sourceArraySchema, sourceSchema?.outputSchema, parsed.pointer, path)
        const targetItemTypes = arrayItemTypes(targetSchema, nodeSchema?.inputSchema, targetPointer, '')
        if (mappedTypes !== undefined && targetItemTypes !== undefined && !compatible(mappedTypes, targetItemTypes)) {
          return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
        }
        if (mappedTypes === undefined || targetItemTypes === undefined) validation = 'untyped_ref'
      } else {
        const expression = location.expression as { $concat: readonly (string | FlowRef | readonly JsonValue[])[] }
        let category: 'string' | 'array' | undefined
        let incomplete = targetTypes === undefined
        const arrayOperands: Array<TypeSet | undefined> = []
        for (const operand of expression.$concat) {
          let operandTypes: TypeSet | undefined
          if (typeof operand === 'string' && operand.startsWith('flow://')) {
            const part = parseReference(operand as FlowRef, nodesById, node.id)
            if ('kind' in part) return part
            const partNode = nodesById.get(part.nodeId)
            if (partNode === undefined) return { kind: 'refused', code: 'unknown_dependency', nodeId: node.id }
            if (!node.dependsOn.includes(partNode.id)) return { kind: 'refused', code: 'ref_not_in_depends_on', nodeId: node.id }
            const outputSchema = schemas[partNode.toolRef]?.outputSchema
            const operandSchema = schemaAtPointer(outputSchema, part.pointer)
            operandTypes = jsonTypes(operandSchema)
            if (operandTypes?.size === 1 && operandTypes.has('array')) {
              arrayOperands.push(arrayItemTypes(operandSchema, outputSchema, part.pointer, ''))
            }
          } else if (typeof operand === 'string') operandTypes = new Set(['string'])
          else if (Array.isArray(operand)) {
            operandTypes = new Set(['array'])
            arrayOperands.push(literalArrayTypes(operand))
          }
          if (operandTypes === undefined) {
            incomplete = true
            continue
          }
          const operandCategory = operandTypes.size === 1 && operandTypes.has('string') ? 'string'
            : operandTypes.size === 1 && operandTypes.has('array') ? 'array' : undefined
          if (operandCategory === undefined || (category !== undefined && category !== operandCategory)) {
            return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
          }
          category = operandCategory
        }
        if (category !== undefined && targetTypes !== undefined && !compatible(new Set([category]), targetTypes)) {
          return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
        }
        if (category === 'array') {
          const targetItemTypes = arrayItemTypes(targetSchema, nodeSchema?.inputSchema, targetPointer, '')
          for (const operandItems of arrayOperands) {
            if (operandItems === undefined) {
              incomplete = true
              continue
            }
            if (operandItems.size === 0) continue
            if (targetItemTypes === undefined) {
              incomplete = true
              continue
            }
            if (!compatible(operandItems, targetItemTypes)) return { kind: 'refused', code: 'ref_type_mismatch', nodeId: node.id }
          }
        }
        if (incomplete) validation = 'untyped_ref'
      }
      edges.push({
        from: parsed.nodeId,
        to: node.id,
        sourcePointer: parsed.pointer,
        targetPointer,
        validation,
      })
    }
  }
  return edges
}
