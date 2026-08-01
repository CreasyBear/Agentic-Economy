import {
  CAPABILITY_CONTRACT_FORMAT,
  defineCapabilityContract,
  type CapabilityContractDocument,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type {
  CapabilityOfferingRegistration,
  CapabilityTransportBindingRegistration,
} from '../public'
import { validPublicHttpsEndpoint } from './transport-adapters'

const MAX_SOURCE_BYTES = 262_144
const MAX_SOURCE_DEPTH = 64
const MAX_SOURCE_NODES = 10_000
const MAX_PROTOCOL_VERSION_LENGTH = 64
const MAX_TOOL_NAME_LENGTH = 200
const encoder = new TextEncoder()

export type CapabilityPublicationOfferingDraft = Readonly<
  Omit<CapabilityOfferingRegistration, 'businessId' | 'contractRef'>
>
export type CapabilityPublicationBindingDraft = Readonly<
  Omit<CapabilityTransportBindingRegistration, 'offeringId' | 'networkId' | 'contractRef'>
>
export type CapabilityContractMetadata = Readonly<
  Omit<CapabilityContractDocument, 'contractFormat' | 'inputSchema' | 'outputSchema'>
>
export type CapabilityImporterCommercialInput = Readonly<{
  offering: CapabilityPublicationOfferingDraft
  bindingId: string
  credentialRef: string
  registrationEvidenceRefs: readonly string[]
  requestTimeoutMs: number
}>

export type CapabilityPublicationSource =
  | Readonly<{ kind: 'ae_envelope'; descriptorDigest: string; evidenceRefs: readonly string[] }>
  | Readonly<{
      kind: 'openapi_http'
      descriptorDigest: string
      selector: Readonly<{ path: string; method: 'get' | 'post' }>
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: 'mcp'
      descriptorDigest: string
      selector: Readonly<{ toolName: string; protocolVersion: string }>
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: 'x402'
      descriptorDigest: string
      selector: Readonly<{ resourceUrl: string }>
      evidenceRefs: readonly string[]
    }>

export type CanonicalCapabilityPublicationDraft = Readonly<{
  source: CapabilityPublicationSource
  documentJson: string
  offering: CapabilityPublicationOfferingDraft
  binding: CapabilityPublicationBindingDraft
}>

export type CapabilityPublicationImport =
  | Readonly<{
      kind: 'ae_envelope'
      documentJson: string
      offering: CapabilityPublicationOfferingDraft
      binding: CapabilityPublicationBindingDraft
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: 'openapi_http'
      document: unknown
      operation: Readonly<{ path: string; method: 'get' | 'post' }>
      contract: CapabilityContractMetadata
      commercial: CapabilityImporterCommercialInput
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: 'mcp'
      serverUrl: string
      tool: unknown
      protocolVersion: string
      contract: CapabilityContractMetadata
      commercial: CapabilityImporterCommercialInput
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: 'x402'
      resource: unknown
      contract: CapabilityContractMetadata
      commercial: CapabilityImporterCommercialInput
      evidenceRefs: readonly string[]
    }>

export type CapabilityPublicationImportRefusal =
  | 'source_invalid'
  | 'source_too_large'
  | 'source_too_deep'
  | 'source_version_unsupported'
  | 'selector_invalid'
  | 'operation_not_found'
  | 'schema_missing'
  | 'schema_profile_unsupported'
  | 'transport_unsupported'
  | 'commercial_metadata_inconsistent'
  | 'payment_execution_unsupported'

export type CapabilityPublicationImportResult =
  | Readonly<{ kind: 'normalized'; draft: CanonicalCapabilityPublicationDraft }>
  | Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>

export function normalizeCapabilityPublication(input: CapabilityPublicationImport): CapabilityPublicationImportResult {
  switch (input.kind) {
    case 'ae_envelope': return normalizeDirectEnvelope(input)
    case 'openapi_http': return importOpenApiHttpCapability(input)
    case 'mcp': return importMcpCapability(input)
    case 'x402': return importX402Capability(input)
  }
}

export function importOpenApiHttpCapability(
  input: Extract<CapabilityPublicationImport, { kind: 'openapi_http' }>,
): CapabilityPublicationImportResult {
  const bounded = inspectSource(input.document)
  if (bounded.kind === 'refused') return bounded
  if (!isRecord(input.document) || typeof input.document.openapi !== 'string'
    || !input.document.openapi.startsWith('3.1.')) {
    return { kind: 'refused', reason: 'source_version_unsupported' }
  }
  if (!validPath(input.operation.path)) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
  const servers = input.document.servers
  if (!Array.isArray(servers) || servers.length !== 1 || !isRecord(servers[0])
    || typeof servers[0].url !== 'string') {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  const baseUrl = validHttpsUrl(servers[0].url)
  if (baseUrl === undefined) return { kind: 'refused', reason: 'transport_unsupported' }
  const paths = input.document.paths
  const pathItem = isRecord(paths) ? paths[input.operation.path] : undefined
  const operation = isRecord(pathItem) ? pathItem[input.operation.method] : undefined
  if (!isRecord(operation)) return { kind: 'refused', reason: 'operation_not_found' }
  const query = input.operation.method === 'get' ? openApiQueryMapping(operation) : undefined
  const inputSchema = input.operation.method === 'get'
    ? query?.schema
    : jsonContentSchema(isRecord(operation.requestBody) ? operation.requestBody.content : undefined)
  const responses = operation.responses
  const successful = isRecord(responses)
    ? Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status))
    : []
  if (successful.length !== 1 || !isRecord(successful[0]?.[1])) {
    return { kind: 'refused', reason: 'schema_missing' }
  }
  const outputSchema = jsonContentSchema(successful[0][1].content)
  if (inputSchema === undefined || outputSchema === undefined) {
    return { kind: 'refused', reason: 'schema_missing' }
  }
  if (containsUnsupportedReference(inputSchema) || containsUnsupportedReference(outputSchema)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const endpoint = new URL(input.operation.path, ensureTrailingSlash(baseUrl)).toString()
  return normalizedFromSchemas({
    source: {
      kind: 'openapi_http', descriptorDigest: bounded.digest,
      selector: input.operation, evidenceRefs: input.evidenceRefs,
    },
    contract: input.contract, inputSchema, outputSchema, commercial: input.commercial,
    endpointUrl: endpoint,
    adapter: {
      adapterId: 'http-json:v1',
      config: input.operation.method === 'get'
        ? { method: 'GET', query: query!.mapping, requestTimeoutMs: input.commercial.requestTimeoutMs }
        : { method: 'POST', requestTimeoutMs: input.commercial.requestTimeoutMs },
    },
  })
}

export function importMcpCapability(
  input: Extract<CapabilityPublicationImport, { kind: 'mcp' }>,
): CapabilityPublicationImportResult {
  const bounded = inspectSource(input.tool)
  if (bounded.kind === 'refused') return bounded
  const endpoint = validHttpsUrl(input.serverUrl)
  if (endpoint === undefined) return { kind: 'refused', reason: 'transport_unsupported' }
  if (!boundedTrimmed(input.protocolVersion, MAX_PROTOCOL_VERSION_LENGTH)) {
    return { kind: 'refused', reason: 'source_version_unsupported' }
  }
  if (!isRecord(input.tool) || !boundedTrimmed(input.tool.name, MAX_TOOL_NAME_LENGTH)) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
  const inputSchema = input.tool.inputSchema
  const outputSchema = input.tool.outputSchema
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    return { kind: 'refused', reason: 'schema_missing' }
  }
  if (containsUnsupportedReference(inputSchema as Readonly<Record<string, JsonValue>>)
    || containsUnsupportedReference(outputSchema as Readonly<Record<string, JsonValue>>)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  return normalizedFromSchemas({
    source: {
      kind: 'mcp', descriptorDigest: bounded.digest,
      selector: { toolName: input.tool.name, protocolVersion: input.protocolVersion },
      evidenceRefs: input.evidenceRefs,
    },
    contract: input.contract,
    inputSchema: inputSchema as Readonly<Record<string, JsonValue>>,
    outputSchema: outputSchema as Readonly<Record<string, JsonValue>>,
    commercial: input.commercial, endpointUrl: endpoint,
    adapter: {
      adapterId: 'mcp-jsonrpc:v1',
      config: {
        protocolVersion: input.protocolVersion,
        toolName: input.tool.name,
        requestTimeoutMs: input.commercial.requestTimeoutMs,
      },
    },
  })
}

export function importX402Capability(
  input: Extract<CapabilityPublicationImport, { kind: 'x402' }>,
): CapabilityPublicationImportResult {
  const bounded = inspectSource(input.resource)
  if (bounded.kind === 'refused') return bounded
  if (!isRecord(input.resource) || typeof input.resource.resourceUrl !== 'string') {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const endpoint = validHttpsUrl(input.resource.resourceUrl)
  if (endpoint === undefined) return { kind: 'refused', reason: 'transport_unsupported' }
  const inputSchema = input.resource.inputSchema
  const outputSchema = input.resource.outputSchema
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    return { kind: 'refused', reason: 'schema_missing' }
  }
  const method: 'GET' | 'POST' | undefined = input.resource.method === undefined
    ? 'POST'
    : input.resource.method === 'GET' || input.resource.method === 'POST'
      ? input.resource.method
      : undefined
  const query = method === 'GET' ? sourceQueryMapping(input.resource.query) : undefined
  if (method === undefined || (method === 'GET' && query === undefined)
    || (method === 'POST' && input.resource.query !== undefined)) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
  if (containsUnsupportedReference(inputSchema as Readonly<Record<string, JsonValue>>)
    || containsUnsupportedReference(outputSchema as Readonly<Record<string, JsonValue>>)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  if (!isRecord(input.resource.price)
    || typeof input.resource.price.currency !== 'string'
    || !Number.isSafeInteger(input.resource.price.amountMinor)) {
    return { kind: 'refused', reason: 'commercial_metadata_inconsistent' }
  }
  const offeredPrice = input.commercial.offering.presentation.price
  if (offeredPrice.kind !== 'fixed'
    || offeredPrice.currency !== input.resource.price.currency
    || offeredPrice.amountMinor !== input.resource.price.amountMinor) {
    return { kind: 'refused', reason: 'commercial_metadata_inconsistent' }
  }
  if (input.resource.scheme !== 'exact'
    || typeof input.resource.network !== 'string'
    || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(input.resource.network)
    || typeof input.resource.asset !== 'string' || input.resource.asset.trim().length === 0
    || typeof input.resource.payTo !== 'string' || input.resource.payTo.trim().length === 0
    || typeof input.resource.routeAmountExponent !== 'number'
    || !Number.isSafeInteger(input.resource.routeAmountExponent)
    || typeof input.resource.assetAmountExponent !== 'number'
    || !Number.isSafeInteger(input.resource.assetAmountExponent)
    || input.resource.routeAmountExponent < 0
    || input.resource.assetAmountExponent > 18
    || input.resource.assetAmountExponent < input.resource.routeAmountExponent) {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  return normalizedFromSchemas({
    source: {
      kind: 'x402', descriptorDigest: bounded.digest,
      selector: { resourceUrl: endpoint }, evidenceRefs: input.evidenceRefs,
    },
    contract: input.contract, inputSchema: inputSchema as Readonly<Record<string, JsonValue>>,
    outputSchema: outputSchema as Readonly<Record<string, JsonValue>>,
    commercial: input.commercial, endpointUrl: endpoint,
    adapter: {
      adapterId: 'x402-fetch:v2',
      config: {
        method, ...(query === undefined ? {} : { query: [...query] }),
        requestTimeoutMs: input.commercial.requestTimeoutMs,
        scheme: input.resource.scheme, network: input.resource.network,
        currency: input.resource.price.currency,
        routeAmountExponent: input.resource.routeAmountExponent,
        assetAmountExponent: input.resource.assetAmountExponent,
        asset: input.resource.asset,
        payTo: input.resource.payTo,
      },
    },
  })
}

function openApiQueryMapping(operation: Readonly<Record<string, unknown>>): Readonly<{
  schema: Readonly<Record<string, JsonValue>>
  mapping: readonly Readonly<{ inputPointer: string; parameter: string }>[]
}> | undefined {
  if (!Array.isArray(operation.parameters) || operation.parameters.length < 1) return undefined
  const properties: Record<string, JsonValue> = {}
  const required: string[] = []
  const mapping: { inputPointer: string; parameter: string }[] = []
  for (const parameter of operation.parameters) {
    if (!isRecord(parameter) || parameter.in !== 'query' || typeof parameter.name !== 'string'
      || !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(parameter.name) || !isRecord(parameter.schema)) return undefined
    properties[parameter.name] = parameter.schema as Readonly<Record<string, JsonValue>>
    mapping.push({ inputPointer: `/${parameter.name.replace(/~/g, '~0').replace(/\//g, '~1')}`, parameter: parameter.name })
    if (parameter.required === true) required.push(parameter.name)
  }
  return {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object', properties, required, additionalProperties: false,
    },
    mapping,
  }
}

function sourceQueryMapping(value: unknown): readonly Readonly<{
  inputPointer: string
  parameter: string
}>[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return undefined
  const seenPointers = new Set<string>()
  const seenParameters = new Set<string>()
  const result: { inputPointer: string; parameter: string }[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.inputPointer !== 'string' || typeof item.parameter !== 'string'
      || !/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/.test(item.inputPointer)
      || !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter)
      || seenPointers.has(item.inputPointer) || seenParameters.has(item.parameter)) return undefined
    seenPointers.add(item.inputPointer)
    seenParameters.add(item.parameter)
    result.push({ inputPointer: item.inputPointer, parameter: item.parameter })
  }
  return result
}

function normalizeDirectEnvelope(
  input: Extract<CapabilityPublicationImport, { kind: 'ae_envelope' }>,
): CapabilityPublicationImportResult {
  if (encoder.encode(input.documentJson).byteLength > MAX_SOURCE_BYTES) {
    return { kind: 'refused', reason: 'source_too_large' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(input.documentJson)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const bounded = inspectSource(parsed)
  if (bounded.kind === 'refused') return bounded
  let contract
  try {
    contract = defineCapabilityContract(parsed)
  } catch {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const { ref: _ref, ...document } = contract
  return {
    kind: 'normalized',
    draft: {
      source: { kind: 'ae_envelope', descriptorDigest: bounded.digest, evidenceRefs: input.evidenceRefs },
      documentJson: stableStringify(document as StableHashValue),
      offering: input.offering,
      binding: input.binding,
    },
  }
}

function normalizedFromSchemas(input: Readonly<{
  source: CapabilityPublicationSource
  contract: CapabilityContractMetadata
  inputSchema: Readonly<Record<string, JsonValue>>
  outputSchema: Readonly<Record<string, JsonValue>>
  commercial: CapabilityImporterCommercialInput
  endpointUrl: string
  adapter: Readonly<{ adapterId: string; config: JsonValue }>
}>): CapabilityPublicationImportResult {
  let contract
  try {
    contract = defineCapabilityContract({
      contractFormat: CAPABILITY_CONTRACT_FORMAT,
      ...input.contract,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
    })
  } catch {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const { ref: _ref, ...document } = contract
  return {
    kind: 'normalized',
    draft: {
      source: input.source,
      documentJson: stableStringify(document as StableHashValue),
      offering: input.commercial.offering,
      binding: {
        bindingId: input.commercial.bindingId,
        endpointUrl: input.endpointUrl,
        credentialRef: input.commercial.credentialRef,
        continuation: { kind: 'single_response', evidenceRefs: [...input.commercial.registrationEvidenceRefs] },
        cancellation: { kind: 'unsupported', evidenceRefs: [...input.commercial.registrationEvidenceRefs] },
        adapter: input.adapter,
        registrationEvidenceRefs: [...input.commercial.registrationEvidenceRefs],
      },
    },
  }
}

type SourceInspection =
  | Readonly<{ kind: 'accepted'; digest: string }>
  | Readonly<{ kind: 'refused'; reason: 'source_invalid' | 'source_too_large' | 'source_too_deep' }>

function inspectSource(source: unknown): SourceInspection {
  let raw: string
  try {
    raw = JSON.stringify(source)
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (raw === undefined) return { kind: 'refused', reason: 'source_invalid' }
  if (encoder.encode(raw).byteLength > MAX_SOURCE_BYTES) return { kind: 'refused', reason: 'source_too_large' }
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [{ value: source, depth: 0 }]
  let nodes = 0
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) break
    nodes += 1
    if (nodes > MAX_SOURCE_NODES) return { kind: 'refused', reason: 'source_too_large' }
    if (current.depth > MAX_SOURCE_DEPTH) return { kind: 'refused', reason: 'source_too_deep' }
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 })
    } else if (isRecord(current.value)) {
      for (const [key, value] of Object.entries(current.value)) {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
          return { kind: 'refused', reason: 'source_invalid' }
        }
        pending.push({ value, depth: current.depth + 1 })
      }
    } else if (current.value !== null
      && typeof current.value !== 'string'
      && typeof current.value !== 'boolean'
      && (typeof current.value !== 'number' || !Number.isFinite(current.value))) {
      return { kind: 'refused', reason: 'source_invalid' }
    }
  }
  try {
    return { kind: 'accepted', digest: canonicalDigest(source as StableHashValue) }
  } catch {
    return { kind: 'refused', reason: 'source_invalid' }
  }
}

function jsonContentSchema(content: unknown): Readonly<Record<string, JsonValue>> | undefined {
  if (!isRecord(content)) return undefined
  const json = content['application/json']
  if (!isRecord(json)) return undefined
  const schema = json.schema
  return isRecord(schema) ? schema as Readonly<Record<string, JsonValue>> : undefined
}

function containsUnsupportedReference(value: JsonValue): boolean {
  const pending: JsonValue[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) break
    if (Array.isArray(current)) pending.push(...current)
    else if (isRecord(current)) {
      if ('$ref' in current) return true
      pending.push(...Object.values(current) as JsonValue[])
    }
  }
  return false
}

function validHttpsUrl(value: string): string | undefined {
  const url = validPublicHttpsEndpoint(value)
  return url !== undefined && url.hash === '' ? url.toString() : undefined
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function validPath(value: string): boolean {
  return /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/.test(value)
}

function boundedTrimmed(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && value === value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

