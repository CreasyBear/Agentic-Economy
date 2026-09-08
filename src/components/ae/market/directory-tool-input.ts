import { Validator, type Schema } from '@cfworker/json-schema'
import { createErrorHandler, getSchemaType, toErrorSchema, unwrapErrorHandler, validationDataMerge, type RJSFSchema, type RJSFValidationError, type ValidatorType } from '@rjsf/utils'

import { isBoundedJsonValue } from '@/modules/common/bounded-json'
import { isRecord } from '@/modules/common/is-record'

export function parsePlaygroundJson(text: string | undefined): unknown {
  if (text === undefined || text.length > 131_072) return undefined
  try {
    const value: unknown = JSON.parse(text)
    return isBoundedJsonValue(value) ? value : undefined
  } catch { return undefined }
}

export function playgroundSchema(text: string | undefined): RJSFSchema | undefined {
  const value = parsePlaygroundJson(text)
  return isRecord(value) ? value as RJSFSchema : undefined
}

/** RJSF's controls support these shapes. Richer contracts retain the exact JSON editor. */
export function supportsPlaygroundForm(schema: RJSFSchema | undefined): boolean {
  if (!schema) return false
  const fieldTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
  const unsupported = new Set(['$ref', '$dynamicRef', '$recursiveRef', 'prefixItems'])
  function walk(value: unknown, field: boolean): boolean {
    if (!isRecord(value)) return !field
    const draft = value.$schema
    if (draft !== undefined && draft !== 'https://json-schema.org/draft/2020-12/schema' && draft !== 'http://json-schema.org/draft-07/schema#') return false
    if (Object.keys(value).some(name => unsupported.has(name))) return false
    const type = getSchemaType(value as RJSFSchema)
    // RJSF infers object/enum/nullable fields itself. A genuinely untyped field
    // renders its UnsupportedField template rather than throwing to our boundary.
    if (field && (typeof type !== 'string' || !fieldTypes.has(type))) {
      const alternatives = value.oneOf ?? value.anyOf
      if (!Array.isArray(alternatives) || alternatives.length === 0 || !alternatives.every(child => walk(child, true))) return false
    }
    if (type === 'array' && value.items === undefined) return false
    for (const name of ['properties', 'patternProperties']) {
      const fields = value[name]
      if (isRecord(fields) && !Object.values(fields).every(child => walk(child, true))) return false
    }
    if (value.items !== undefined && !(Array.isArray(value.items) ? value.items.every(child => walk(child, true)) : walk(value.items, true))) return false
    for (const name of ['additionalProperties', 'additionalItems']) {
      if (isRecord(value[name]) && !walk(value[name], true)) return false
    }
    // These are schema fragments, not standalone controls. Traverse their field
    // definitions without treating defaults, examples or enum values as schemas.
    for (const name of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(value[name]) && !value[name].every(child => walk(child, false))) return false
    }
    for (const name of ['if', 'then', 'else', 'not', 'contains']) {
      if (isRecord(value[name]) && !walk(value[name], false)) return false
    }
    for (const name of ['$defs', 'definitions', 'dependencies', 'dependentSchemas']) {
      if (isRecord(value[name]) && !Object.values(value[name]).every(child => walk(child, false))) return false
    }
    return true
  }
  return walk(schema, true)
}

function validate(schema: RJSFSchema, value: unknown): RJSFValidationError[] {
  try {
    // cfworker annotates schemas during dereferencing; never mutate Provider or RJSF data.
    const result = new Validator(structuredClone(schema) as Schema, '2020-12', false).validate(value)
    return result.errors.map(error => {
      const path = error.instanceLocation.replace(/^#/u, '').split('/').slice(1)
        .map(segment => `[${JSON.stringify(segment.replaceAll('~1', '/').replaceAll('~0', '~'))}]`).join('')
      return { name: error.keyword, property: path, message: error.error, params: {}, stack: `${path || 'Input'}: ${error.error}`, schemaPath: error.keywordLocation }
    })
  } catch {
    return [{ name: 'schema', property: '', message: 'This schema cannot be validated here.', params: {}, stack: 'This schema cannot be validated here.' }]
  }
}

/** RJSF's documented validator interface, backed by AE's existing CSP-safe interpreter. */
export const playgroundValidator: ValidatorType<unknown> = {
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

export function playgroundCallCommand(toolRef: string | undefined, schema: RJSFSchema | undefined, inputJson: string): string | undefined {
  const value = parsePlaygroundJson(inputJson)
  if (!toolRef || !schema || value === undefined || !playgroundValidator.isValid(schema, value, schema)) return undefined
  return `ae call ${shellArgument(toolRef)} --input ${shellArgument(JSON.stringify(value))} --json`
}
