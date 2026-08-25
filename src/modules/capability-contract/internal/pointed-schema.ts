import { Validator, type Schema } from '@cfworker/json-schema'

import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  childSchemas,
  isJsonRecord,
  jsonDepth,
  jsonValueSchema,
  schemaAndChildrenMatchMetaSchema,
  type JsonValue,
} from './json-value'

const MAX_SCHEMA_BYTES = 131_072
const MAX_SCHEMA_DEPTH = 64
const MAX_COMPILED_CONTRACTS = 32
const MAX_COMPILED_POINTED_SCHEMAS = 128

type ValidationError = Readonly<{ instancePath?: string; keyword?: string; params?: Readonly<Record<string, unknown>> }>
export type SchemaValidator = ((value: unknown) => boolean) & { errors?: readonly ValidationError[] | null }
const compiledContracts = new Map<string, Readonly<{ input: SchemaValidator; output: SchemaValidator }>>()
const compiledPointedSchemas = new Map<string, SchemaValidator>()

declare const pointedSchemaIdentityBrand: unique symbol
export type PointedSchemaIdentity = string & Readonly<{ [pointedSchemaIdentityBrand]: true }>

export function rehydratePointedSchemaIdentity(value: string): PointedSchemaIdentity {
  if (!isCanonicalDigest(value)) throw new Error('pointed_schema_identity_invalid')
  return value as PointedSchemaIdentity
}

export function samePointedSchema(left: PointedSchemaIdentity, right: PointedSchemaIdentity): boolean {
  return left === right
}

/**
 * Validate a JSON value without allowing @cfworker/json-schema to mutate the
 * caller-owned schema. The validator dereferences and annotates its input, so
 * every call receives an isolated clone.
 */
export function validateJsonSchema(
  schema: Readonly<Record<string, unknown>>,
  value: unknown,
): boolean {
  try {
    const validator = new Validator(structuredClone(schema) as Schema, '2020-12', false)
    return validator.validate(value).valid
  } catch {
    return false
  }
}

export function pointerSyntaxIsCanonical(pointer: string): boolean {
  if (pointer === '') return true
  if (!pointer.startsWith('/')) return false
  return pointer.slice(1).split('/').every((segment) => (
    segment.length > 0
    && !/~(?:[^01]|$)/.test(segment)
  ))
}

export function escapePointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

export function decodeJsonPointerSegments(pointer: string): string[] {
  return pointer === '' ? [] : pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
}

export function pointerCovers(parent: string, child: string): boolean {
  return parent === child || child.startsWith(`${parent}/`)
}

export function pointersOverlap(left: string, right: string): boolean {
  return pointerCovers(left, right) || pointerCovers(right, left)
}

export function assertSchemaIsSafeAndValid(schema: Readonly<Record<string, JsonValue>>): void {
  if (JSON.stringify(schema).length > MAX_SCHEMA_BYTES || jsonDepth(schema) > MAX_SCHEMA_DEPTH || hasReferenceCycle(schema)) {
    throw new Error('capability_json_schema_too_complex')
  }
  try {
    if (!schemaAndChildrenMatchMetaSchema(schema)) throw new Error('schema_meta_validation_failed')
    createInterpreter(schema).validate(null)
  } catch {
    throw new Error('capability_json_schema_invalid')
  }
}

export function schemaCompilesIndependently(schema: Readonly<Record<string, JsonValue>>): boolean {
  try {
    const validator = createInterpreterValidator(schema)
    validator(null)
    return true
  } catch {
    return false
  }
}

export function compiledValidator(
  contract: Readonly<{
    ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    inputSchema: Readonly<Record<string, JsonValue>>
    outputSchema: Readonly<Record<string, JsonValue>>
  }>,
  document: 'input' | 'output',
): SchemaValidator {
  const cacheKey = `${contract.ref.capabilityId}:${contract.ref.version}:${contract.ref.contractDigest}`
  let cached = compiledContracts.get(cacheKey)
  if (cached === undefined) {
    cached = {
      input: createInterpreterValidator(contract.inputSchema),
      output: createInterpreterValidator(contract.outputSchema),
    }
    compiledContracts.set(cacheKey, cached)
    if (compiledContracts.size > MAX_COMPILED_CONTRACTS) {
      const oldestKey = compiledContracts.keys().next().value
      if (typeof oldestKey === 'string') compiledContracts.delete(oldestKey)
    }
  } else {
    compiledContracts.delete(cacheKey)
    compiledContracts.set(cacheKey, cached)
  }
  return cached[document]
}

export function compiledPointedValidator(
  identity: PointedSchemaIdentity,
  schema: Readonly<Record<string, JsonValue>>,
): SchemaValidator {
  let validator = compiledPointedSchemas.get(identity)
  if (validator === undefined) {
    validator = createInterpreterValidator(schema)
    compiledPointedSchemas.set(identity, validator)
    if (compiledPointedSchemas.size > MAX_COMPILED_POINTED_SCHEMAS) {
      const oldestKey = compiledPointedSchemas.keys().next().value
      if (typeof oldestKey === 'string') compiledPointedSchemas.delete(oldestKey)
    }
  } else {
    compiledPointedSchemas.delete(identity)
    compiledPointedSchemas.set(identity, validator)
  }
  return validator
}

export function resolvePointedSchema(
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
): Readonly<Record<string, JsonValue>> | undefined {
  const schema = resolveInstanceSchema(root, pointer)
  return schema === undefined ? undefined : normalizePointedSchema(schema, root, new Set())
}

export function instancePointerExists(schema: Readonly<Record<string, JsonValue>>, pointer: string): boolean {
  return instancePointerStatus(schema, pointer).declared
}

export function instancePointerStatus(schema: Readonly<Record<string, JsonValue>>, pointer: string): Readonly<{ declared: boolean; guaranteed: boolean }> {
  const segments = decodeJsonPointerSegments(pointer)
  return schemaPathStatus(schema, segments, schema, new Set())
}

export function schemaIsClosedObject(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): boolean {
  const patternProperties = schema.patternProperties
  const hasDynamicProperties = isJsonRecord(patternProperties) && Object.keys(patternProperties).length > 0
  if (schema.type === 'object' && schema.additionalProperties === false && !hasDynamicProperties) return true
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined && schemaIsClosedObject(target, root, new Set([...seenReferences, reference]))) return true
  }
  const allOf = schema.allOf
  if (Array.isArray(allOf) && allOf.some((candidate) => isJsonRecord(candidate) && schemaIsClosedObject(candidate, root, seenReferences))) return true
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (Array.isArray(alternatives) && alternatives.length > 0 && alternatives.every((candidate) => (
      isJsonRecord(candidate) && schemaIsClosedObject(candidate, root, seenReferences)
    ))) return true
  }
  return false
}

export function declaredTopLevelProperties(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): readonly string[] {
  const properties = new Set<string>()
  if (isJsonRecord(schema.properties)) {
    for (const property of Object.keys(schema.properties)) properties.add(property)
  }
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      for (const property of declaredTopLevelProperties(target, root, new Set([...seenReferences, reference]))) properties.add(property)
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    for (const candidate of alternatives) {
      if (!isJsonRecord(candidate)) continue
      for (const property of declaredTopLevelProperties(candidate, root, seenReferences)) properties.add(property)
    }
  }
  return [...properties]
}

export function inputSchemaSupportsStageProjection(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
  annotationPointers: ReadonlySet<string>,
  seenReferences: ReadonlySet<string>,
): boolean {
  if (pointer.length > 0 && annotationPointers.has(pointer)) return true
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const siblings = Object.keys(schema).filter((key) => !['$schema', '$defs', 'definitions', '$ref'].includes(key))
    const target = resolveSchemaReference(root, reference)
    return siblings.length === 0
      && target !== undefined
      && inputSchemaSupportsStageProjection(target, root, pointer, annotationPointers, new Set([...seenReferences, reference]))
  }
  const crossInputKeywords = [
    'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
    'dependentRequired', 'dependentSchemas', 'minProperties', 'maxProperties',
    'patternProperties', 'propertyNames', 'unevaluatedProperties', 'const', 'enum',
  ]
  if (crossInputKeywords.some((keyword) => schema[keyword] !== undefined)) return false
  if (!isJsonRecord(schema.properties)) return true
  return Object.entries(schema.properties).every(([property, child]) => {
    const childPointer = `${pointer}/${escapePointerSegment(property)}`
    const hasSemanticDescendant = [...annotationPointers].some((candidate) => pointerCovers(childPointer, candidate))
    return !hasSemanticDescendant || !isJsonRecord(child)
      || inputSchemaSupportsStageProjection(child, root, childPointer, annotationPointers, seenReferences)
  })
}

export function requiredInputPointers(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  prefix: string,
  seenReferences: ReadonlySet<string>,
): readonly string[] {
  const pointers = new Set<string>()
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      for (const pointer of requiredInputPointers(target, root, prefix, new Set([...seenReferences, reference]))) pointers.add(pointer)
    }
  }
  if (Array.isArray(schema.required) && isJsonRecord(schema.properties)) {
    for (const property of schema.required) {
      if (typeof property !== 'string') continue
      const pointer = `${prefix}/${escapePointerSegment(property)}`
      const child = schema.properties[property]
      const nested = isJsonRecord(child)
        ? requiredInputPointers(child, root, pointer, seenReferences)
        : []
      if (nested.length === 0) pointers.add(pointer)
      else for (const nestedPointer of nested) pointers.add(nestedPointer)
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    const sets: Array<Set<string>> = []
    for (const candidate of alternatives) {
      if (isJsonRecord(candidate)) {
        sets.push(new Set(requiredInputPointers(candidate, root, prefix, seenReferences)))
      }
    }
    if (keyword === 'allOf') {
      for (const set of sets) for (const pointer of set) pointers.add(pointer)
    } else if (sets.length > 0) {
      for (const pointer of sets[0] ?? []) if (sets.every((set) => set.has(pointer))) pointers.add(pointer)
    }
  }
  return [...pointers]
}

function createInterpreter(schema: Readonly<Record<string, JsonValue>>): Validator {
  return new Validator(mutableInterpreterSchema(schema), '2020-12', false)
}

function createInterpreterValidator(schema: Readonly<Record<string, JsonValue>>): SchemaValidator {
  const interpreter = createInterpreter(schema)
  const validator = ((value: unknown) => {
    const result = interpreter.validate(value)
    validator.errors = result.errors.map((error) => ({
      instancePath: error.instanceLocation === '#' ? '' : error.instanceLocation.replace(/^#/u, ''),
      keyword: error.keyword,
      params: { keywordLocation: error.keywordLocation },
    }))
    return result.valid
  }) as SchemaValidator
  return validator
}

function mutableInterpreterSchema(input: unknown): Schema {
  const clone = jsonValueSchema.parse(structuredClone(input))
  if (!isJsonRecord(clone)) throw new Error('capability_json_schema_invalid')
  stripSchemaFormats(clone)
  return clone as Schema
}

function stripSchemaFormats(schema: Record<string, JsonValue>): void {
  delete schema.format
  for (const child of childSchemas(schema)) stripSchemaFormats(child as Record<string, JsonValue>)
}

function hasReferenceCycle(root: Readonly<Record<string, JsonValue>>): boolean {
  function visit(schema: Readonly<Record<string, JsonValue>>, activeReferences: ReadonlySet<string>): boolean {
    const reference = schema.$ref
    if (typeof reference === 'string' && reference.startsWith('#/')) {
      if (activeReferences.has(reference)) return true
      const target = resolveSchemaReference(root, reference)
      if (target !== undefined && visit(target, new Set([...activeReferences, reference]))) return true
    }
    return childSchemas(schema).some((child) => visit(child, activeReferences))
  }
  return visit(root, new Set())
}

function resolveInstanceSchema(
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
): Readonly<Record<string, JsonValue>> | undefined {
  const segments = decodeJsonPointerSegments(pointer)
  return resolveInstanceSchemaSegments(root, segments, root, new Set())
}

function normalizePointedSchema(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> {
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const normalizedTarget = normalizePointedSchema(target, root, new Set([...seenReferences, reference]))
      const siblings = normalizeSchemaChildren(schema, root, seenReferences, new Set(['$ref']))
      return Object.keys(siblings).length === 0 ? normalizedTarget : { allOf: [normalizedTarget, siblings] }
    }
  }
  return normalizeSchemaChildren(schema, root, seenReferences, new Set())
}

function normalizeSchemaChildren(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
  omitted: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> {
  const normalized: Record<string, JsonValue> = {}
  const schemaMaps = new Set(['properties', 'patternProperties', 'dependentSchemas'])
  const schemaValues = new Set(['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'contentSchema', 'if', 'then', 'else', 'not', 'items', 'unevaluatedItems'])
  const schemaArrays = new Set(['prefixItems', 'allOf', 'anyOf', 'oneOf'])
  for (const [key, value] of Object.entries(schema)) {
    if (omitted.has(key) || key === '$defs' || key === 'definitions' || key === '$schema' || key === '$id') continue
    if (schemaMaps.has(key) && isJsonRecord(value)) {
      normalized[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [
        name,
        isJsonRecord(child) ? normalizePointedSchema(child, root, seenReferences) : child,
      ]))
    } else if (schemaValues.has(key) && isJsonRecord(value)) {
      normalized[key] = normalizePointedSchema(value, root, seenReferences)
    } else if (schemaArrays.has(key) && Array.isArray(value)) {
      normalized[key] = value.map((child) => isJsonRecord(child) ? normalizePointedSchema(child, root, seenReferences) : child)
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

function resolveInstanceSchemaSegments(
  schema: Readonly<Record<string, JsonValue>>,
  segments: readonly string[],
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> | undefined {
  if (segments.length === 0) return schema
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const resolved = resolveInstanceSchemaSegments(target, segments, root, new Set([...seenReferences, reference]))
      if (resolved !== undefined) return resolved
    }
  }
  const [head, ...tail] = segments
  const properties = schema.properties
  if (head !== undefined && isJsonRecord(properties) && isJsonRecord(properties[head])) {
    return resolveInstanceSchemaSegments(properties[head], tail, root, seenReferences)
  }
  if (head !== undefined && /^(?:0|[1-9]\d*)$/.test(head)) {
    const index = Number(head)
    const prefixItems = schema.prefixItems
    const itemSchema = Array.isArray(prefixItems) && isJsonRecord(prefixItems[index])
      ? prefixItems[index]
      : isJsonRecord(schema.items) ? schema.items : undefined
    if (itemSchema !== undefined) return resolveInstanceSchemaSegments(itemSchema, tail, root, seenReferences)
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const candidates = schema[keyword]
    if (!Array.isArray(candidates)) continue
    const resolved: Array<Readonly<Record<string, JsonValue>>> = []
    for (const candidate of candidates) {
      if (!isJsonRecord(candidate)) continue
      const branch = resolveInstanceSchemaSegments(candidate, segments, root, seenReferences)
      if (branch !== undefined) resolved.push(branch)
    }
    if (resolved.length > 0 && resolved.every((candidate) => canonicalDigest(candidate as StableHashValue) === canonicalDigest(resolved[0] as StableHashValue))) {
      return resolved[0]
    }
  }
  return undefined
}

function schemaPathStatus(
  schema: Readonly<Record<string, JsonValue>>,
  segments: readonly string[],
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<{ declared: boolean; guaranteed: boolean }> {
  if (segments.length === 0) return { declared: true, guaranteed: true }
  let declared = false
  let guaranteed = false
  const reference = schema.$ref
  const referenceKey = `${String(reference)}:${segments.join('/')}`
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(referenceKey)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const status = schemaPathStatus(target, segments, root, new Set([...seenReferences, referenceKey]))
      declared ||= status.declared
      guaranteed ||= status.guaranteed
    }
  }
  const [head, ...tail] = segments
  const properties = schema.properties
  if (isJsonRecord(properties) && head !== undefined && isJsonRecord(properties[head])) {
    const child = schemaPathStatus(properties[head], tail, root, seenReferences)
    const required = Array.isArray(schema.required) && schema.required.includes(head)
    declared ||= child.declared
    guaranteed ||= required && schemaGuaranteesType(schema, 'object', root, seenReferences) && child.guaranteed
  }
  if (head !== undefined && /^(?:0|[1-9]\d*)$/.test(head)) {
    const index = Number(head)
    const prefixItems = schema.prefixItems
    const itemSchema = Array.isArray(prefixItems) && isJsonRecord(prefixItems[index])
      ? prefixItems[index]
      : isJsonRecord(schema.items) ? schema.items : undefined
    if (itemSchema !== undefined) {
      const child = schemaPathStatus(itemSchema, tail, root, seenReferences)
      const itemGuaranteed = typeof schema.minItems === 'number' && schema.minItems > index
      declared ||= child.declared
      guaranteed ||= itemGuaranteed && schemaGuaranteesType(schema, 'array', root, seenReferences) && child.guaranteed
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives) || alternatives.length === 0) continue
    const statuses = alternatives.map((candidate) => isJsonRecord(candidate)
      ? schemaPathStatus(candidate, segments, root, seenReferences)
      : { declared: false, guaranteed: false })
    declared ||= statuses.some((status) => status.declared)
    guaranteed ||= keyword === 'allOf'
      ? statuses.some((status) => status.guaranteed)
      : statuses.every((status) => status.guaranteed)
  }
  const thenSchema = schema.then
  const elseSchema = schema.else
  if (isJsonRecord(thenSchema) || isJsonRecord(elseSchema)) {
    const thenStatus = isJsonRecord(thenSchema) ? schemaPathStatus(thenSchema, segments, root, seenReferences) : { declared: false, guaranteed: false }
    const elseStatus = isJsonRecord(elseSchema) ? schemaPathStatus(elseSchema, segments, root, seenReferences) : { declared: false, guaranteed: false }
    declared ||= thenStatus.declared || elseStatus.declared
    guaranteed ||= thenStatus.guaranteed && elseStatus.guaranteed
  }
  return { declared, guaranteed }
}

function schemaGuaranteesType(
  schema: Readonly<Record<string, JsonValue>>,
  expected: 'array' | 'object',
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): boolean {
  const declaredType = schema.type
  if (typeof declaredType === 'string') return declaredType === expected
  if (Array.isArray(declaredType)) return declaredType.length > 0 && declaredType.every((value) => value === expected)
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined && schemaGuaranteesType(target, expected, root, new Set([...seenReferences, reference]))) return true
  }
  const allOf = schema.allOf
  if (Array.isArray(allOf) && allOf.some((candidate) => isJsonRecord(candidate) && schemaGuaranteesType(candidate, expected, root, seenReferences))) return true
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (Array.isArray(alternatives) && alternatives.length > 0 && alternatives.every((candidate) => (
      isJsonRecord(candidate) && schemaGuaranteesType(candidate, expected, root, seenReferences)
    ))) return true
  }
  return false
}

function resolveSchemaReference(root: Readonly<Record<string, JsonValue>>, reference: string): Readonly<Record<string, JsonValue>> | undefined {
  let current: JsonValue = root
  for (const segment of decodeJsonPointerSegments(reference.slice(1))) {
    if (!isJsonRecord(current)) return undefined
    const next: JsonValue | undefined = current[segment]
    if (next === undefined) return undefined
    current = next
  }
  return isJsonRecord(current) ? current : undefined
}
