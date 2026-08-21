import { z } from 'zod'

import { isRecord } from '@/modules/common/is-record'

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const
const MAX_VALIDATED_VALUE_NODES = 10_000
const MAX_VALIDATED_VALUE_DEPTH = 64

const supportedSchemaKeywords = new Set([
  '$anchor', '$comment', '$defs', '$dynamicAnchor', '$dynamicRef', '$id', '$recursiveAnchor',
  '$recursiveRef', '$ref', '$schema', '$vocabulary', 'additionalItems', 'additionalProperties',
  'allOf', 'anyOf', 'const', 'contains', 'contentEncoding', 'contentMediaType', 'contentSchema',
  'default', 'definitions', 'dependencies', 'dependentRequired', 'dependentSchemas', 'deprecated',
  'description', 'else', 'enum', 'examples', 'exclusiveMaximum', 'exclusiveMinimum', 'format',
  'if', 'items', 'maxContains', 'maxItems', 'maxLength', 'maxProperties', 'maximum', 'minContains',
  'minItems', 'minLength', 'minProperties', 'minimum', 'multipleOf', 'not', 'oneOf', 'pattern',
  'patternProperties', 'prefixItems', 'properties', 'propertyNames', 'readOnly', 'required', 'then',
  'title', 'type', 'unevaluatedItems', 'unevaluatedProperties', 'uniqueItems', 'writeOnly',
])

const JSON_SCHEMA_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'])
const NON_NEGATIVE_INTEGER_KEYWORDS = [
  'maxContains', 'maxItems', 'maxLength', 'maxProperties',
  'minContains', 'minItems', 'minLength', 'minProperties',
] as const
const NUMBER_KEYWORDS = ['exclusiveMaximum', 'exclusiveMinimum', 'maximum', 'minimum', 'multipleOf'] as const
const SCHEMA_MAP_KEYWORDS = ['$defs', 'definitions', 'dependentSchemas', 'patternProperties', 'properties'] as const
const SCHEMA_KEYWORDS = [
  'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'items',
  'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties',
] as const
const SCHEMA_ARRAY_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>

export const identifier = z.string().trim().min(1).max(200)
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))

export const jsonSchema = z.record(z.string(), jsonValueSchema).superRefine((schema, context) => {
  if (schema.$schema !== JSON_SCHEMA_2020_12) {
    context.addIssue({ code: 'custom', message: 'json_schema_dialect_invalid' })
  }
  if (containsRemoteSchemaReference(schema)) {
    context.addIssue({ code: 'custom', message: 'json_schema_remote_reference_unsupported' })
  }
  if (containsUnsupportedReference(schema)) {
    context.addIssue({ code: 'custom', message: 'json_schema_reference_profile_unsupported' })
  }
})

export function isBoundedJsonValue(value: unknown): value is JsonValue {
  const active = new Set<object>()
  let nodes = 0
  function visit(candidate: unknown, depth: number): boolean {
    nodes += 1
    if (nodes > MAX_VALIDATED_VALUE_NODES || depth > MAX_VALIDATED_VALUE_DEPTH) return false
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return true
    if (typeof candidate === 'number') return Number.isFinite(candidate)
    if (typeof candidate !== 'object') return false
    if (!Array.isArray(candidate)) {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) return false
    }
    if (active.has(candidate)) return false
    active.add(candidate)
    const children = Array.isArray(candidate) ? candidate : Object.values(candidate)
    for (const child of children) if (!visit(child, depth + 1)) return false
    active.delete(candidate)
    return true
  }
  return visit(value, 0)
}

export function isJsonRecord(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return isRecord(value)
}

export function jsonDepth(value: JsonValue, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth
  const nested = Array.isArray(value) ? value : Object.values(value)
  return nested.reduce((maximum, item) => Math.max(maximum, jsonDepth(item, depth + 1)), depth)
}

export function containsRemoteSchemaReference(schema: Readonly<Record<string, JsonValue>>): boolean {
  for (const keyword of ['$ref', '$dynamicRef', '$recursiveRef'] as const) {
    const reference = schema[keyword]
    if (reference !== undefined && (typeof reference !== 'string' || !reference.startsWith('#'))) return true
  }
  return childSchemas(schema).some((child) => containsRemoteSchemaReference(child))
}

function containsUnsupportedReference(schema: Readonly<Record<string, JsonValue>>): boolean {
  const reference = schema.$ref
  if (reference !== undefined && (typeof reference !== 'string' || !reference.startsWith('#/'))) return true
  if (schema.$dynamicRef !== undefined || schema.$recursiveRef !== undefined || schema.$recursiveAnchor !== undefined) return true
  return childSchemas(schema).some((child) => containsUnsupportedReference(child))
}

export function childSchemas(schema: Readonly<Record<string, JsonValue>>): ReadonlyArray<Readonly<Record<string, JsonValue>>> {
  const children: Array<Readonly<Record<string, JsonValue>>> = []
  for (const keyword of ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'] as const) {
    const schemaMap = schema[keyword]
    if (isJsonRecord(schemaMap)) children.push(...Object.values(schemaMap).filter(isJsonRecord))
  }
  for (const keyword of ['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'contentSchema', 'if', 'then', 'else', 'not', 'items', 'unevaluatedItems'] as const) {
    const child = schema[keyword]
    if (isJsonRecord(child)) children.push(child)
  }
  for (const keyword of ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const) {
    const nested = schema[keyword]
    if (Array.isArray(nested)) children.push(...nested.filter(isJsonRecord))
  }
  return children
}

export function schemaAndChildrenMatchMetaSchema(schema: Readonly<Record<string, JsonValue>>): boolean {
  if (Object.keys(schema).some((keyword) => !supportedSchemaKeywords.has(keyword))) return false
  if (!schemaKeywordValuesAreValid(schema)) return false
  return childSchemas(schema).every(schemaAndChildrenMatchMetaSchema)
}

function schemaKeywordValuesAreValid(schema: Readonly<Record<string, JsonValue>>): boolean {
  const type = schema.type
  if (type !== undefined && !validSchemaType(type)) return false
  if (schema.$schema !== undefined && typeof schema.$schema !== 'string') return false
  for (const keyword of ['$anchor', '$comment', '$dynamicAnchor', '$dynamicRef', '$id', '$ref', 'contentEncoding', 'contentMediaType', 'description', 'format', 'pattern', 'title'] as const) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== 'string') return false
  }
  for (const keyword of NON_NEGATIVE_INTEGER_KEYWORDS) {
    const value = schema[keyword]
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) return false
  }
  for (const keyword of NUMBER_KEYWORDS) {
    const value = schema[keyword]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) return false
  }
  if (schema.multipleOf !== undefined && (schema.multipleOf as number) <= 0) return false
  for (const keyword of ['deprecated', 'readOnly', 'uniqueItems', 'writeOnly'] as const) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== 'boolean') return false
  }
  if (schema.required !== undefined && !uniqueStringArray(schema.required)) return false
  if (schema.dependentRequired !== undefined && (
    !isJsonRecord(schema.dependentRequired)
    || Object.values(schema.dependentRequired).some((value) => !uniqueStringArray(value))
  )) return false
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) return false
  for (const keyword of SCHEMA_MAP_KEYWORDS) {
    const value = schema[keyword]
    if (value !== undefined && (!isJsonRecord(value) || Object.values(value).some((child) => !isSchemaValue(child)))) return false
  }
  for (const keyword of SCHEMA_KEYWORDS) {
    const value = schema[keyword]
    if (value !== undefined && !isSchemaValue(value)) return false
  }
  for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
    const value = schema[keyword]
    if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some((child) => !isSchemaValue(child)))) return false
  }
  return true
}

function validSchemaType(value: JsonValue): boolean {
  if (typeof value === 'string') return JSON_SCHEMA_TYPES.has(value)
  return Array.isArray(value)
    && value.length > 0
    && value.every((entry) => typeof entry === 'string' && JSON_SCHEMA_TYPES.has(entry))
    && new Set(value).size === value.length
}

function uniqueStringArray(value: JsonValue): boolean {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string')
    && new Set(value).size === value.length
}

function isSchemaValue(value: JsonValue): boolean {
  return typeof value === 'boolean' || isJsonRecord(value)
}
