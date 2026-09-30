// Invariant: Tool inputs retain Market's CSP-safe schema validation and JSON fallback.
import { Validator, type Schema } from '@cfworker/json-schema'
import { createErrorHandler, getSchemaType, toErrorSchema, unwrapErrorHandler, validationDataMerge, type RJSFSchema, type RJSFValidationError, type ValidatorType } from '@rjsf/utils'

import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'
import { degrade } from '@/lib/observability/degrade'
const MAX_FORM_SCHEMA_NODES = 2_048
const MAX_TOOL_INPUT_JSON_BYTES = 131_072
const UNSAFE_FIELD_NAMES: Record<string, boolean> = { ['__proto__']: true, constructor: true, prototype: true }

type PatternRisk = { repeated: boolean; alternatives: boolean }
type PatternQuantifier = Readonly<{ end: number; repeats: boolean; multiple: boolean }>

function quantifierAfter(pattern: string, index: number): PatternQuantifier | undefined {
  const character = pattern[index]
  if (character === '*' || character === '+') {
    const end = index + 1 + (pattern[index + 1] === '?' ? 1 : 0)
    return { end, repeats: true, multiple: true }
  }
  if (character === '?') {
    return { end: index + 1 + (pattern[index + 1] === '?' ? 1 : 0), repeats: true, multiple: false }
  }
  if (character !== '{') return undefined
  const close = pattern.indexOf('}', index + 1)
  if (close === -1) return undefined
  const bounds = pattern.slice(index + 1, close)
  const match = /^(\d+)(?:,(\d*))?$/u.exec(bounds)
  const minimumText = match?.[1]
  if (minimumText === undefined) return undefined
  const comma = bounds.indexOf(',')
  const maximumText = comma === -1 ? minimumText : bounds.slice(comma + 1)
  const maximum = maximumText.length === 0 ? Number.POSITIVE_INFINITY : Number(maximumText)
  const multiple = !Number.isFinite(maximum) || maximum > 1
  return {
    end: close + 1 + (pattern[close + 1] === '?' ? 1 : 0),
    repeats: multiple || Number(minimumText) !== 1 || maximum !== 1,
    multiple,
  }
}

function safeSchemaPattern(pattern: string): boolean {
  if (pattern.length > 256) return false
  try {
    new RegExp(pattern, 'u')
  } catch {
    return false
  }

  const groups: PatternRisk[] = []
  let previousMultiple = false
  let index = 0
  while (index < pattern.length) {
    const character = pattern[index]
    if (character === undefined) return false
    if (character === '(') {
      if (pattern[index + 1] === '?') {
        const mode = pattern[index + 2]
        if (mode === ':' || mode === '=' || mode === '!') index += 2
        else if (mode === '<' && (pattern[index + 3] === '=' || pattern[index + 3] === '!')) index += 3
        else return false
      }
      if (groups.length === 32) return false
      groups.push({ repeated: false, alternatives: false })
      index += 1
      continue
    }
    if (character === ')') {
      const group = groups.pop()
      if (group === undefined) return false
      const quantifier = quantifierAfter(pattern, index + 1)
      if (quantifier?.multiple && (group.repeated || group.alternatives)) return false
      if (quantifier?.multiple && previousMultiple) return false
      if (quantifier?.multiple) previousMultiple = true
      const parent = groups[groups.length - 1]
      if (parent !== undefined) {
        parent.repeated ||= group.repeated || quantifier?.repeats === true
        parent.alternatives ||= group.alternatives
      }
      index = quantifier?.end ?? index + 1
      continue
    }
    if (character === '|') {
      const group = groups[groups.length - 1]
      if (group !== undefined) group.alternatives = true
      previousMultiple = false
      index += 1
      continue
    }
    if (character === '^' || character === '$') {
      index += 1
      continue
    }

    let atomEnd = index + 1
    let escaped: string | undefined
    if (character === '[') {
      let closed = false
      while (atomEnd < pattern.length) {
        if (pattern[atomEnd] === '\\') atomEnd += 2
        else if (pattern[atomEnd] === ']') {
          atomEnd += 1
          closed = true
          break
        } else atomEnd += 1
      }
      if (!closed) return false
    } else if (character === '\\') {
      escaped = pattern[index + 1]
      if (escaped === undefined || (escaped >= '1' && escaped <= '9') || escaped === 'k') return false
      atomEnd = index + 2
      if ((escaped === 'p' || escaped === 'P' || escaped === 'u') && pattern[atomEnd] === '{') {
        const close = pattern.indexOf('}', atomEnd + 1)
        if (close === -1) return false
        atomEnd = close + 1
      }
    }

    const quantifier = quantifierAfter(pattern, atomEnd)
    if (quantifier?.multiple && previousMultiple) return false
    if (quantifier?.multiple) previousMultiple = true
    else if (quantifier === undefined && (escaped !== undefined
      ? !/[\p{L}\p{N}_]/u.test(escaped)
      : character !== '[' && character !== '.' && !'[]{}()*+?$^|\\'.includes(character)
        && !/[\p{L}\p{N}_]/u.test(character))) previousMultiple = false
    const group = groups[groups.length - 1]
    if (group !== undefined && quantifier?.repeats) group.repeated = true
    index = quantifier?.end ?? atomEnd
  }
  return groups.length === 0
}

function schemaPatternsSafe(schema: RJSFSchema): boolean {
  const active = new WeakSet<object>()
  let visited = 0
  const mapKeywords: Record<string, true> = {
    properties: true, patternProperties: true, $defs: true, definitions: true, dependentSchemas: true, dependencies: true,
  }
  const directKeywords = [
    'additionalProperties', 'additionalItems', 'items', 'prefixItems', 'contains', 'propertyNames',
    'unevaluatedItems', 'unevaluatedProperties', 'not', 'if', 'then', 'else', 'contentSchema',
    'allOf', 'anyOf', 'oneOf',
  ] as const

  function walkChild(value: unknown, depth: number): boolean {
    if (Array.isArray(value)) {
      if (value.length > MAX_FORM_SCHEMA_NODES) return false
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (descriptor === undefined || !('value' in descriptor) || !walkChild(descriptor.value, depth + 1)) return false
      }
      return true
    }
    return !isRecord(value) || walk(value, depth)
  }

  function walk(value: Record<string, unknown>, depth: number): boolean {
    if (depth > 64 || visited === MAX_FORM_SCHEMA_NODES || active.has(value)) return false
    visited += 1
    active.add(value)
    try {
      if (value.pattern !== undefined && (typeof value.pattern !== 'string' || !safeSchemaPattern(value.pattern))) return false
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined || !('value' in descriptor)
          || (Array.isArray(descriptor.value) && descriptor.value.length > MAX_FORM_SCHEMA_NODES)) return false
      }
      for (const name of Object.keys(mapKeywords)) {
        const map = value[name]
        if (!isRecord(map)) continue
        for (const key in map) {
          if (!Object.hasOwn(map, key)) continue
          if (Object.hasOwn(UNSAFE_FIELD_NAMES, key)) return false
          if (name === 'patternProperties') {
            if (!safeSchemaPattern(key)) return false
            const pattern = new RegExp(key, 'u')
            if (Object.keys(UNSAFE_FIELD_NAMES).some(unsafe => pattern.test(unsafe))) return false
          }
          if (!walkChild(map[key], depth + 1)) return false
        }
      }
      for (const name of directKeywords) if (!walkChild(value[name], depth + 1)) return false
      return true
    } finally {
      active.delete(value)
    }
  }

  try {
    return isBoundedJsonValue(schema) && walk(schema, 0)
  } catch {
    return false
  }
}

export function parseToolInputJson(text: string | undefined): unknown {
  if (text === undefined || text.length > MAX_TOOL_INPUT_JSON_BYTES
    || new TextEncoder().encode(text).byteLength > MAX_TOOL_INPUT_JSON_BYTES) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return isBoundedJsonValue(value) ? value : undefined
  } catch (cause) { return degrade(cause, undefined, { site: 'parseToolInputJson', reason: 'invalid_response' }) }
}

export function toolInputSchema(text: string | undefined): RJSFSchema | undefined {
  const value = parseToolInputJson(text)
  return isRecord(value) ? value as RJSFSchema : undefined
}

export function supportsToolInputForm(schema: RJSFSchema | undefined): boolean {
  const fieldTypes: Record<string, true> = { object: true, array: true, string: true, number: true, integer: true, boolean: true, null: true }
  const unsupported: Record<string, true> = { $ref: true, $dynamicRef: true, $recursiveRef: true, prefixItems: true }
  const active = new WeakSet<object>()
  let visited = 0

  function walk(value: unknown, field: boolean, depth: number): boolean {
    if (!isRecord(value)) return !field
    if (depth > 64 || visited === MAX_FORM_SCHEMA_NODES || active.has(value)) return false
    visited += 1
    active.add(value)
    try {
      const draft = value.$schema
      if (draft !== undefined && draft !== 'https://json-schema.org/draft/2020-12/schema' && draft !== 'http://json-schema.org/draft-07/schema#') return false
      if (Object.keys(unsupported).some(name => Object.hasOwn(value, name))) return false
      if (Array.isArray(value.type) && value.type.length > MAX_FORM_SCHEMA_NODES) return false
      const type = getSchemaType(value as RJSFSchema)
      // RJSF infers object/enum/nullable fields itself. A genuinely untyped field
      if (field && (typeof type !== 'string' || !Object.hasOwn(fieldTypes, type))) {
        const alternatives = value.oneOf ?? value.anyOf
        if (!Array.isArray(alternatives) || alternatives.length === 0
          || alternatives.length > MAX_FORM_SCHEMA_NODES || !alternatives.every(child => walk(child, true, depth + 1))) return false
      }
      if (type === 'array' && value.items === undefined) return false
      for (const name of ['properties', 'patternProperties']) {
        const fields = value[name]
        if (!isRecord(fields)) continue
        for (const key in fields) {
          if (!Object.hasOwn(fields, key)) continue
          if ((name === 'properties' && Object.hasOwn(UNSAFE_FIELD_NAMES, key))
            || !walk(fields[key], true, depth + 1)) return false
        }
      }
      if (Array.isArray(value.items)) {
        if (value.items.length > MAX_FORM_SCHEMA_NODES || !value.items.every(child => walk(child, true, depth + 1))) return false
      } else if (value.items !== undefined && !walk(value.items, true, depth + 1)) return false
      for (const name of ['additionalProperties', 'additionalItems']) {
        if (isRecord(value[name]) && !walk(value[name], true, depth + 1)) return false
      }
      // These are schema fragments, not standalone controls. Traverse their field
      // definitions without treating defaults, examples or enum values as schemas.
      for (const name of ['allOf', 'anyOf', 'oneOf']) {
        const alternatives = value[name]
        if (Array.isArray(alternatives) && (alternatives.length > MAX_FORM_SCHEMA_NODES
          || !alternatives.every(child => walk(child, false, depth + 1)))) return false
      }
      for (const name of ['if', 'then', 'else', 'not', 'contains']) {
        if (isRecord(value[name]) && !walk(value[name], false, depth + 1)) return false
      }
      for (const name of ['$defs', 'definitions', 'dependencies', 'dependentSchemas']) {
        const definitions = value[name]
        if (!isRecord(definitions)) continue
        for (const key in definitions) {
          if (Object.hasOwn(definitions, key) && !walk(definitions[key], false, depth + 1)) return false
        }
      }
      return true
    } finally {
      active.delete(value)
    }
  }

  try {
    return schema !== undefined && schemaPatternsSafe(schema) && walk(schema, true, 0)
  } catch {
    return false
  }
}

function validate(schema: RJSFSchema, value: unknown): RJSFValidationError[] {
  try {
    if (!schemaPatternsSafe(schema)) {
      return degrade(new TypeError('tool_input_schema_invalid'), [{ name: 'schema', property: '', message: 'This schema cannot be validated here.', params: {}, stack: 'This schema cannot be validated here.' }], { site: 'validateToolInput', reason: 'invalid_response' })
    }
    // cfworker annotates schemas during dereferencing; never mutate Provider or RJSF data.
    const result = new Validator(structuredClone(schema) as Schema, '2020-12', false).validate(value)
    return result.errors.map(error => {
      const path = error.instanceLocation.replace(/^#/u, '').split('/').slice(1)
        .map(segment => `[${JSON.stringify(segment.replaceAll('~1', '/').replaceAll('~0', '~'))}]`).join('')
      return { name: error.keyword, property: path, message: error.error, params: {}, stack: `${path || 'Input'}: ${error.error}`, schemaPath: error.keywordLocation }
    })
  } catch (cause) {
    return degrade(cause, [{ name: 'schema', property: '', message: 'This schema cannot be validated here.', params: {}, stack: 'This schema cannot be validated here.' }], { site: 'validateToolInput', reason: 'invalid_response' })
  }
}

/** RJSF's documented validator interface, backed by AE's existing CSP-safe interpreter. */
export const toolInputValidator: ValidatorType<unknown> = {
  isValid(schema, value) { return validate(schema, value).length === 0 },
  rawValidation<Result>(schema: RJSFSchema, value?: unknown) {
    return { errors: validate(schema, value) as Result[] }
  },
  validateFormData(value, schema, customValidate, transformErrors, uiSchema) {
    let errors = validate(schema, value)
    if (transformErrors) errors = transformErrors(errors, uiSchema)
    const result = { errors, errorSchema: toErrorSchema<unknown>(errors) }
    return customValidate
      ? validationDataMerge(result, unwrapErrorHandler(customValidate(value, createErrorHandler(value), uiSchema)))
      : result
  },
}

function shellArgument(value: string): string { return `'${value.replaceAll("'", "'\"'\"'")}'` }

export function toolInputCallCommand(toolRef: string | undefined, schema: RJSFSchema | undefined, inputJson: string): string | undefined {
  const value = parseToolInputJson(inputJson)
  if (!toolRef || !schema || value === undefined || !toolInputValidator.isValid(schema, value, schema)) return undefined
  return `ae call ${shellArgument(toolRef)} --input ${shellArgument(JSON.stringify(value))} --json`
}
