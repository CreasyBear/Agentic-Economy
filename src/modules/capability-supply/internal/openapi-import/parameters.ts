import type { JsonValue } from '@/modules/capability-contract/public'

import type { SchemaDereferencer } from '../admit-provider-schema'
import type { CapabilityPublicationImportRefusal } from '../publication-importer-types'
import type {
  HttpJsonHeaderParameterMapping,
  HttpJsonPathParameterMapping,
  HttpJsonQueryParameterMapping,
} from '../transport-adapters'
import type { OpenApiParameterExclusions } from './credentials'
import { resolveOpenApiRecord } from './document'

export type OpenApiParameterMappingsResult =
  | Readonly<{
      kind: 'mapped'
      schema: Readonly<Record<string, JsonValue>>
      query: readonly HttpJsonQueryParameterMapping[]
      path: readonly HttpJsonPathParameterMapping[]
      headers: readonly HttpJsonHeaderParameterMapping[]
    }>
  | Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>

type ParameterLocation = 'query' | 'path' | 'header'
type ResolvedParameter = Readonly<Record<string, unknown>> & Readonly<{
  in: ParameterLocation
  name: string
}>
type ParameterAccumulator = {
  properties: Record<string, JsonValue>
  required: string[]
  query: HttpJsonQueryParameterMapping[]
  path: HttpJsonPathParameterMapping[]
  headers: HttpJsonHeaderParameterMapping[]
  seenInputNames: Set<string>
}

const UNSAFE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'content-type', 'accept', 'x-api-key',
  'api-key', 'host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade',
])
const SCALAR_PARAMETER_TYPES = new Set(['string', 'number', 'integer', 'boolean'])

export async function openApiParameterMappings(
  inherited: unknown,
  operationParameters: unknown,
  path: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiParameterMappingsResult> {
  const candidates = parameterCandidates(inherited, operationParameters)
  if (candidates === undefined) return refused('selector_invalid')
  const selectedResult = await selectParameters(candidates, root, derefSchema)
  if (selectedResult.kind === 'refused') return selectedResult
  const pathRefusal = requiredPathParameterRefusal(path, selectedResult.selected)
  if (pathRefusal !== undefined) return refused(pathRefusal)
  return await mapParameters(
    selectedResult.selected,
    path,
    excludedParameters,
    root,
    derefSchema,
  )
}

function parameterCandidates(inherited: unknown, direct: unknown): readonly unknown[] | undefined {
  const inheritedParameters = inherited === undefined ? [] : inherited
  const directParameters = direct === undefined ? [] : direct
  return Array.isArray(inheritedParameters) && Array.isArray(directParameters)
    ? [...inheritedParameters, ...directParameters]
    : undefined
}

async function selectParameters(
  candidates: readonly unknown[],
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<
  | Readonly<{ kind: 'selected'; selected: ReadonlyMap<string, ResolvedParameter> }>
  | Extract<OpenApiParameterMappingsResult, { kind: 'refused' }>
> {
  const selected = new Map<string, ResolvedParameter>()
  for (const candidate of candidates) {
    const resolved = await resolveOpenApiRecord(candidate, root, derefSchema)
    if (resolved.kind === 'refused') return refused(resolved.reason)
    const parameter = resolvedParameter(resolved.value)
    if (parameter === undefined) return refused('selector_invalid')
    selected.set(parameterKey(parameter), parameter)
  }
  return { kind: 'selected', selected }
}

function resolvedParameter(value: Readonly<Record<string, unknown>> | undefined): ResolvedParameter | undefined {
  if (value === undefined || typeof value.in !== 'string' || typeof value.name !== 'string') return undefined
  if (value.in !== 'query' && value.in !== 'path' && value.in !== 'header') return value as ResolvedParameter
  return value as ResolvedParameter
}

function parameterKey(parameter: ResolvedParameter): string {
  const name = parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name
  return `${parameter.in}:${name}`
}

function requiredPathParameterRefusal(
  path: string,
  selected: ReadonlyMap<string, ResolvedParameter>,
): CapabilityPublicationImportRefusal | undefined {
  for (const match of path.matchAll(/\{([A-Za-z][A-Za-z0-9_.-]{0,99})\}/g)) {
    const parameter = selected.get(`path:${match[1]}`)
    if (parameter === undefined || parameter.required !== true) return 'openapi_path_parameter_required'
  }
  return undefined
}

async function mapParameters(
  selected: ReadonlyMap<string, ResolvedParameter>,
  path: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<OpenApiParameterMappingsResult> {
  const accumulator = createAccumulator()
  for (const parameter of selected.values()) {
    const result = await mapParameter(parameter, accumulator, path, excludedParameters, root, derefSchema)
    if (result !== undefined) return refused(result)
  }
  return mapped(accumulator)
}

function createAccumulator(): ParameterAccumulator {
  return { properties: {}, required: [], query: [], path: [], headers: [], seenInputNames: new Set() }
}

async function mapParameter(
  parameter: ResolvedParameter,
  accumulator: ParameterAccumulator,
  path: string,
  excludedParameters: OpenApiParameterExclusions,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportRefusal | undefined> {
  const definitionRefusal = parameterDefinitionRefusal(parameter, excludedParameters)
  if (definitionRefusal === 'excluded') return undefined
  if (definitionRefusal !== undefined) return definitionRefusal
  const schemaResult = await parameterSchema(parameter, root, derefSchema)
  if (schemaResult.kind === 'refused') return schemaResult.reason
  const serialization = parameterSerialization(parameter, path)
  if (serialization.kind === 'refused') return serialization.reason
  const inputName = parameterInputName(parameter, accumulator.seenInputNames)
  if (inputName === undefined) return 'selector_invalid'
  appendParameter(accumulator, parameter, schemaResult.schema, serialization.explode, inputName)
  return undefined
}

function parameterDefinitionRefusal(
  parameter: ResolvedParameter,
  excluded: OpenApiParameterExclusions,
): CapabilityPublicationImportRefusal | 'excluded' | undefined {
  if (!supportedLocation(parameter.in)) return 'openapi_operation_unsupported'
  if (isExcludedParameter(parameter, excluded)) return 'excluded'
  if (parameter.in === 'header' && isUnsafeOpenApiHeader(parameter.name)) {
    return 'openapi_header_parameter_unsafe'
  }
  if (Object.hasOwn(parameter, 'content')) return contentDefinitionRefusal(parameter.in)
  if (parameter.required !== undefined && typeof parameter.required !== 'boolean') {
    return 'openapi_query_parameter_definition_unsupported'
  }
  return undefined
}

function supportedLocation(location: string): location is ParameterLocation {
  return location === 'query' || location === 'path' || location === 'header'
}

function isExcludedParameter(parameter: ResolvedParameter, excluded: OpenApiParameterExclusions): boolean {
  if (parameter.in === 'query') return excluded.query.has(parameter.name)
  if (parameter.in === 'header') return excluded.header.has(parameter.name.toLowerCase())
  return false
}

function contentDefinitionRefusal(location: ParameterLocation): CapabilityPublicationImportRefusal {
  if (location === 'query') return 'openapi_query_parameter_definition_unsupported'
  if (location === 'path') return 'openapi_path_parameter_serialization_unsupported'
  return 'openapi_header_parameter_serialization_unsupported'
}

async function parameterSchema(
  parameter: ResolvedParameter,
  root: unknown,
  derefSchema?: SchemaDereferencer,
): Promise<
  | Readonly<{ kind: 'resolved'; schema: Readonly<Record<string, JsonValue>> }>
  | Extract<OpenApiParameterMappingsResult, { kind: 'refused' }>
> {
  const result = await resolveOpenApiRecord(parameter.schema, root, derefSchema)
  if (result.kind === 'refused') return result
  if (result.value === undefined || !supportedOpenApiParameterSchema(result.value)) {
    return refused(schemaRefusal(parameter.in))
  }
  return { kind: 'resolved', schema: result.value as Readonly<Record<string, JsonValue>> }
}

function schemaRefusal(location: ParameterLocation): CapabilityPublicationImportRefusal {
  if (location === 'query') return 'openapi_query_parameter_schema_unsupported'
  if (location === 'path') return 'openapi_path_parameter_serialization_unsupported'
  return 'openapi_header_parameter_serialization_unsupported'
}

function parameterSerialization(
  parameter: ResolvedParameter,
  path: string,
):
  | Readonly<{ kind: 'supported'; explode: boolean }>
  | Extract<OpenApiParameterMappingsResult, { kind: 'refused' }> {
  if (!allowReservedSupported(parameter)) {
    return refused(serializationRefusal(parameter.in, path, parameter.name))
  }
  const expectedStyle = parameter.in === 'query' ? 'form' : 'simple'
  const style = parameter.style === undefined ? expectedStyle : parameter.style
  const defaultExplode = parameter.in === 'query' && expectedStyle === 'form'
  const explode = parameter.explode === undefined ? defaultExplode : parameter.explode
  if (!serializationShapeSupported(style, expectedStyle, explode)) {
    return refused(serializationRefusal(parameter.in, path, parameter.name))
  }
  if (!pathParameterSupported(parameter, path)) {
    return refused('openapi_path_parameter_required')
  }
  if (!validParameterName(parameter)) return refused('selector_invalid')
  return { kind: 'supported', explode }
}

function allowReservedSupported(parameter: ResolvedParameter): boolean {
  return parameter.allowReserved === undefined || parameter.allowReserved === false
}

function serializationShapeSupported(style: unknown, expectedStyle: string, explode: unknown): explode is boolean {
  return typeof explode === 'boolean' && style === expectedStyle
}

function pathParameterSupported(parameter: ResolvedParameter, path: string): boolean {
  return parameter.in !== 'path'
    || (path.includes(`{${parameter.name}}`) && parameter.required === true)
}

function serializationRefusal(
  location: ParameterLocation,
  path: string,
  name: string,
): CapabilityPublicationImportRefusal {
  if (location === 'query') return 'openapi_query_parameter_serialization_unsupported'
  if (location === 'header') return 'openapi_header_parameter_serialization_unsupported'
  return path.includes(`{${name}}`)
    ? 'openapi_path_parameter_serialization_unsupported'
    : 'openapi_path_parameter_required'
}

function validParameterName(parameter: ResolvedParameter): boolean {
  if (parameter.in === 'header') return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/.test(parameter.name)
  return /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(parameter.name)
}

function parameterInputName(parameter: ResolvedParameter, seen: Set<string>): string | undefined {
  const inputName = parameter['x-ae-input-name'] === undefined
    ? parameter.name
    : parameter['x-ae-input-name']
  if (typeof inputName !== 'string') return undefined
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(inputName) || seen.has(inputName)) return undefined
  seen.add(inputName)
  return inputName
}

function appendParameter(
  accumulator: ParameterAccumulator,
  parameter: ResolvedParameter,
  schema: Readonly<Record<string, JsonValue>>,
  explode: boolean,
  inputName: string,
): void {
  accumulator.properties[inputName] = schema
  if (parameter.required === true) accumulator.required.push(inputName)
  const inputPointer = `/${inputName.replace(/~/g, '~0').replace(/\//g, '~1')}`
  const mapping = { inputPointer, parameter: parameter.name, explode }
  if (parameter.in === 'query') {
    accumulator.query.push({ ...mapping, required: parameter.required === true, style: 'form' })
  } else if (parameter.in === 'path') {
    accumulator.path.push({ ...mapping, required: true, style: 'simple' })
  } else {
    accumulator.headers.push({ ...mapping, required: parameter.required === true, style: 'simple' })
  }
}

function mapped(accumulator: ParameterAccumulator): Extract<OpenApiParameterMappingsResult, { kind: 'mapped' }> {
  return {
    kind: 'mapped',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: accumulator.properties,
      required: accumulator.required,
      additionalProperties: false,
    },
    query: accumulator.query,
    path: accumulator.path,
    headers: accumulator.headers,
  }
}

function refused(reason: CapabilityPublicationImportRefusal): Extract<OpenApiParameterMappingsResult, { kind: 'refused' }> {
  return { kind: 'refused', reason }
}

function supportedOpenApiParameterSchema(schema: Readonly<Record<string, unknown>>): boolean {
  const type = schema.type
  if (SCALAR_PARAMETER_TYPES.has(String(type))) return true
  if (type !== 'array' || typeof schema.items !== 'object' || schema.items === null || Array.isArray(schema.items)) {
    return false
  }
  const itemType = (schema.items as Readonly<Record<string, unknown>>).type
  return SCALAR_PARAMETER_TYPES.has(String(itemType))
}

function isUnsafeOpenApiHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.startsWith('ae-') || UNSAFE_HEADERS.has(lower)
}
