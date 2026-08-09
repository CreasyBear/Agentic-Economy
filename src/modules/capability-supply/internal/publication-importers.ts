import { validateX402PaymentRequired, type X402ValidatedPaymentRequired } from './x402-payment-signer'

import {
  CAPABILITY_CONTRACT_FORMAT,
  containsRemoteSchemaReference,
  defineCapabilityContract,
  type CapabilityContractDocument,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { compareExactAmounts, exactAmountSchema, rescaleExactAmount } from '@/modules/money/public'
import { isRecord } from '@/modules/common/is-record'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import type {
  CapabilityOfferingRegistration,
  CapabilityTransportBindingRegistration,
} from '../public'
import {
  admitProviderSchema,
  type AdmitCredentialSpec,
  type AdmitProviderSchemaRefusal,
  type SchemaDereferencer,
} from './admit-provider-schema'
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
  authority: CapabilityTransportBindingRegistration['authority']
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
      kind: 'agent_plugin_mcp'
      descriptorDigest: string
      selector: Readonly<{ serverName: string; toolName: string; protocolVersion: string }>
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
      fixedQuery?: readonly Readonly<{ parameter: string; value: string }>[]
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
      kind: 'agent_plugin_mcp'
      manifest: unknown
      serverName: string
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
  | AdmitProviderSchemaRefusal
  | 'transport_unsupported'
  | 'commercial_metadata_inconsistent'
  | 'payment_execution_unsupported'
  | 'payment_required_invalid'

export type CapabilityPublicationImportResult =
  | Readonly<{ kind: 'normalized'; draft: CanonicalCapabilityPublicationDraft }>
  | Readonly<{ kind: 'refused'; reason: CapabilityPublicationImportRefusal }>

export async function normalizeCapabilityPublication(
  input: CapabilityPublicationImport,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  switch (input.kind) {
    case 'ae_envelope': return normalizeDirectEnvelope(input)
    case 'openapi_http': return importOpenApiHttpCapability(input, derefSchema)
    case 'mcp': return importMcpCapability(input, derefSchema)
    case 'agent_plugin_mcp': return importAgentPluginMcpCapability(input, derefSchema)
    case 'x402': return importX402Capability(input)
  }
}

export async function importOpenApiHttpCapability(
  input: Extract<CapabilityPublicationImport, { kind: 'openapi_http' }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
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
  const credential = resolveOpenApiCredential(input.document, operation)
  if (credential.kind === 'refused') return { kind: 'refused', reason: 'transport_unsupported' }
  const fixedParameterNames = new Set((input.fixedQuery ?? []).map(({ parameter }) => parameter))
  const excludedParameters = new Set([...credential.parameterNames, ...fixedParameterNames])
  const query = input.operation.method === 'get' ? openApiQueryMapping(operation, excludedParameters) : undefined
  const fixedQuery = input.operation.method === 'get'
    ? fixedQueryMapping(input.fixedQuery, query?.mapping)
    : input.fixedQuery === undefined ? [] : undefined
  if (input.operation.method === 'get' && fixedQuery === undefined) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
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
  if (containsRemoteSchemaReference(inputSchema) || containsRemoteSchemaReference(outputSchema)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const admit = await admitProviderSchema({
    inputSchema,
    outputSchema,
    contract: input.contract,
    authority: input.commercial.authority,
    credential: credential.spec,
    resolutionRoot: input.document,
    credentialParameterNames: credential.parameterNames,
  }, derefSchema)
  if (admit.kind === 'refused') return { kind: 'refused', reason: admit.reason }
  const endpoint = new URL(input.operation.path.replace(/^\/+/, ''), ensureTrailingSlash(baseUrl)).toString()
  return normalizedFromSchemas({
    source: {
      kind: 'openapi_http', descriptorDigest: bounded.digest,
      selector: input.operation, evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema, outputSchema: admit.outputSchema,
    commercial: input.commercial,
    endpointUrl: endpoint,
    adapter: {
      adapterId: 'http-json:v1',
      config: input.operation.method === 'get'
        ? {
          method: 'GET',
          ...(query === undefined || query.mapping.length === 0 ? {} : { query: query.mapping }),
          ...(fixedQuery === undefined || fixedQuery.length === 0 ? {} : { fixedQuery }),
          requestTimeoutMs: input.commercial.requestTimeoutMs,
          credential: credential.spec.kind === 'keyless'
            ? { kind: 'none' as const }
            : credential.spec.kind === 'api_key'
              ? { kind: 'api_key' as const, location: credential.spec.location, name: credential.spec.name }
              : { kind: 'bearer' as const },
        }
        : {
          method: 'POST',
          requestTimeoutMs: input.commercial.requestTimeoutMs,
          credential: credential.spec.kind === 'keyless'
            ? { kind: 'none' as const }
            : credential.spec.kind === 'api_key'
              ? { kind: 'api_key' as const, location: credential.spec.location, name: credential.spec.name }
              : { kind: 'bearer' as const },
        },
    },
  })
}

export async function importMcpCapability(
  input: Extract<CapabilityPublicationImport, { kind: 'mcp' }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
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
  if (containsRemoteSchemaReference(inputSchema as Readonly<Record<string, JsonValue>>)
    || containsRemoteSchemaReference(outputSchema as Readonly<Record<string, JsonValue>>)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const admit = await admitProviderSchema({
    inputSchema: inputSchema as Readonly<Record<string, JsonValue>>,
    outputSchema: outputSchema as Readonly<Record<string, JsonValue>>,
    contract: input.contract,
    authority: input.commercial.authority,
    credential: { kind: 'keyless' },
    resolutionRoot: input.tool,
    credentialParameterNames: [],
  }, derefSchema)
  if (admit.kind === 'refused') return { kind: 'refused', reason: admit.reason }
  return normalizedFromSchemas({
    source: {
      kind: 'mcp', descriptorDigest: bounded.digest,
      selector: { toolName: input.tool.name, protocolVersion: input.protocolVersion },
      evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema, outputSchema: admit.outputSchema,
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
 
export async function importAgentPluginMcpCapability(
  input: Extract<CapabilityPublicationImport, { kind: 'agent_plugin_mcp' }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const manifest = inspectSource(input.manifest)
  if (manifest.kind === 'refused') return manifest
  if (!isRecord(input.manifest) || !boundedTrimmed(input.manifest.name, MAX_TOOL_NAME_LENGTH)) {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  if (!boundedTrimmed(input.serverName, MAX_TOOL_NAME_LENGTH)) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
  const servers = input.manifest.mcpServers
  if (!isRecord(servers)) return { kind: 'refused', reason: 'source_invalid' }
  const selectedServer = servers[input.serverName]
  if (!isRecord(selectedServer)) return { kind: 'refused', reason: 'transport_unsupported' }
  if (selectedServer.type !== 'http' && selectedServer.type !== 'sse') {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  if (selectedServer.command !== undefined || selectedServer.args !== undefined
    || selectedServer.env !== undefined || typeof selectedServer.url !== 'string') {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  const serverUrl = validHttpsUrl(selectedServer.url)
  if (serverUrl === undefined) return { kind: 'refused', reason: 'transport_unsupported' }
  const normalized = await importMcpCapability({
    kind: 'mcp',
    serverUrl,
    tool: input.tool,
    protocolVersion: input.protocolVersion,
    contract: input.contract,
    commercial: input.commercial,
    evidenceRefs: input.evidenceRefs,
  }, derefSchema)
  if (normalized.kind === 'refused') return normalized
  if (normalized.draft.source.kind !== 'mcp') return { kind: 'refused', reason: 'source_invalid' }
  return {
    kind: 'normalized',
    draft: {
      ...normalized.draft,
      source: {
        kind: 'agent_plugin_mcp',
        descriptorDigest: canonicalDigest({
          manifest: manifest.digest,
          serverName: input.serverName,
          tool: normalized.draft.source.descriptorDigest,
        }),
        selector: {
          serverName: input.serverName,
          toolName: normalized.draft.source.selector.toolName,
          protocolVersion: normalized.draft.source.selector.protocolVersion,
        },
        evidenceRefs: [...input.evidenceRefs],
      },
    },
  }
}


export function importX402Capability(
  input: Extract<CapabilityPublicationImport, { kind: 'x402' }>,
): CapabilityPublicationImportResult {
  // When the x402-kind submission carries a PaymentRequired (402 challenge) document, it must
  // validate against the canonical @x402/core schema and bind to the admitted payment terms.
  const resource = isRecord(input.resource) ? input.resource : undefined
  let paymentRequired: X402ValidatedPaymentRequired | undefined
  if (resource !== undefined && resource.paymentRequired !== undefined) {
    try {
      paymentRequired = validateX402PaymentRequired(resource.paymentRequired)
    } catch {
      return { kind: 'refused', reason: 'payment_required_invalid' }
    }
  }
  const bounded = inspectSource(input.resource)
  if (bounded.kind === 'refused') return bounded
  const resourceUrl = resource?.resourceUrl
  if (typeof resourceUrl !== 'string') {
    return { kind: 'refused', reason: 'source_invalid' }
  }
  const endpoint = validHttpsUrl(resourceUrl)
  if (endpoint === undefined || resource === undefined) {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  const inputSchema = resource.inputSchema
  const outputSchema = resource.outputSchema
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    return { kind: 'refused', reason: 'schema_missing' }
  }
  const method: 'GET' | 'POST' | undefined = resource.method === undefined
    ? 'POST'
    : resource.method === 'GET' || resource.method === 'POST'
      ? resource.method
      : undefined
  const query = method === 'GET' ? sourceQueryMapping(resource.query) : undefined
  if (method === undefined || (method === 'GET' && query === undefined)
    || (method === 'POST' && resource.query !== undefined)) {
    return { kind: 'refused', reason: 'selector_invalid' }
  }
  if (containsUnsupportedReference(inputSchema as Readonly<Record<string, JsonValue>>)
    || containsUnsupportedReference(outputSchema as Readonly<Record<string, JsonValue>>)) {
    return { kind: 'refused', reason: 'schema_profile_unsupported' }
  }
  const resourcePrice = exactAmountSchema.safeParse(resource.price)
  if (!resourcePrice.success) {
    return { kind: 'refused', reason: 'commercial_metadata_inconsistent' }
  }
  const offeredPrice = input.commercial.offering.presentation.price
  if (offeredPrice.kind !== 'fixed'
    || compareExactAmounts(offeredPrice.amount, resourcePrice.data) !== 0) {
    return { kind: 'refused', reason: 'commercial_metadata_inconsistent' }
  }
  const scheme = resource.scheme
  const network = resource.network
  const asset = resource.asset
  const payTo = resource.payTo
  const routeAmountExponent = resource.routeAmountExponent
  const assetAmountExponent = resource.assetAmountExponent
  if (scheme !== 'exact'
    || typeof network !== 'string'
    || !/^[A-Za-z0-9-]+:[A-Za-z0-9._-]+$/.test(network)
    || typeof asset !== 'string' || asset.trim().length === 0
    || typeof payTo !== 'string' || payTo.trim().length === 0
    || typeof routeAmountExponent !== 'number'
    || !Number.isSafeInteger(routeAmountExponent)
    || typeof assetAmountExponent !== 'number'
    || !Number.isSafeInteger(assetAmountExponent)
    || routeAmountExponent < 0
    || assetAmountExponent > 18
    || assetAmountExponent < routeAmountExponent) {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  const paymentAmount = rescaleExactAmount(resourcePrice.data, assetAmountExponent)
  if (paymentAmount === undefined) {
    return { kind: 'refused', reason: 'transport_unsupported' }
  }
  if (paymentRequired !== undefined) {
    const matches = paymentRequired.x402Version === 1
      ? paymentRequired.accepts.some((candidate) => {
          if (
            candidate.resource !== endpoint
            || candidate.scheme !== scheme
            || candidate.network !== network
            || candidate.asset.toLowerCase() !== asset.toLowerCase()
            || candidate.payTo.toLowerCase() !== payTo.toLowerCase()
          ) return false
          const parsedAmount = exactAmountSchema.safeParse({
            currency: resourcePrice.data.currency,
            units: candidate.maxAmountRequired,
            exponent: assetAmountExponent,
          })
          return parsedAmount.success && compareExactAmounts(parsedAmount.data, paymentAmount) === 0
        })
      : paymentRequired.resource.url === endpoint
        && paymentRequired.accepts.some((candidate) => {
          if (
            candidate.scheme !== scheme
            || candidate.network !== network
            || candidate.asset.toLowerCase() !== asset.toLowerCase()
            || candidate.payTo.toLowerCase() !== payTo.toLowerCase()
          ) return false
          const parsedAmount = exactAmountSchema.safeParse({
            currency: resourcePrice.data.currency,
            units: candidate.amount,
            exponent: assetAmountExponent,
          })
          return parsedAmount.success && compareExactAmounts(parsedAmount.data, paymentAmount) === 0
        })
    if (!matches) return { kind: 'refused', reason: 'payment_required_invalid' }
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
        scheme, network,
        currency: resourcePrice.data.currency,
        routeAmountExponent,
        assetAmountExponent,
        asset,
        payTo,
      },
    },
  })
}

function openApiQueryMapping(
  operation: Readonly<Record<string, unknown>>,
  excludedParameters: ReadonlySet<string> = new Set(),
): Readonly<{
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
    if (excludedParameters.has(parameter.name)) continue
    const inputName = parameter['x-ae-input-name'] === undefined
      ? parameter.name
      : parameter['x-ae-input-name']
    if (typeof inputName !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(inputName)
      || Object.hasOwn(properties, inputName)) return undefined
    properties[inputName] = parameter.schema as Readonly<Record<string, JsonValue>>
    mapping.push({
      inputPointer: `/${inputName.replace(/~/g, '~0').replace(/\//g, '~1')}`,
      parameter: parameter.name,
    })
    if (parameter.required === true) required.push(inputName)
  }
  return {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object', properties, required, additionalProperties: false,
    },
    mapping,
  }
}

function fixedQueryMapping(
  value: readonly Readonly<{ parameter: string; value: string }>[] | undefined,
  dynamic: readonly Readonly<{ parameter: string }> [] | undefined,
): readonly Readonly<{ parameter: string; value: string }>[] | undefined {
  if (value === undefined) return []
  if (value.length > 64) return undefined
  const dynamicNames = new Set((dynamic ?? []).map(({ parameter }) => parameter))
  const seen = new Set<string>()
  const result: Array<{ parameter: string; value: string }> = []
  for (const item of value) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(item.parameter)
      || typeof item.value !== 'string' || item.value.length === 0 || item.value.length > 200
      || seen.has(item.parameter) || dynamicNames.has(item.parameter)) {
      return undefined
    }
    seen.add(item.parameter)
    result.push({ parameter: item.parameter, value: item.value })
  }
  return result
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
        authority: input.commercial.authority,
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

type OpenApiCredentialResolution =
  | Readonly<{ kind: 'resolved'; spec: AdmitCredentialSpec; parameterNames: readonly string[] }>
  | Readonly<{ kind: 'refused' }>

function resolveOpenApiCredential(
  document: unknown,
  operation: Readonly<Record<string, unknown>>,
): OpenApiCredentialResolution {
  const securitySchemes = isRecord(document)
      && isRecord(document.components)
      && isRecord(document.components.securitySchemes)
    ? document.components.securitySchemes
    : undefined
  const operationSecurity = operation.security
  const documentSecurity = isRecord(document) && document.security !== undefined
    ? Array.isArray(document.security) ? document.security : null
    : undefined
  const security = operationSecurity === undefined
    ? documentSecurity
    : Array.isArray(operationSecurity) ? operationSecurity : null
  if (security === null) return { kind: 'refused' }
  if (security === undefined || security.length === 0) {
    return { kind: 'resolved', spec: { kind: 'keyless' }, parameterNames: [] }
  }
  if (securitySchemes === undefined || security.length !== 1) return { kind: 'refused' }
  const entry = security[0]
  if (!isRecord(entry)) return { kind: 'refused' }
  const schemes = Object.entries(entry)
  if (schemes.length !== 1 || schemes[0] === undefined) return { kind: 'refused' }
  const [schemeName, scope] = schemes[0]
  if (!Array.isArray(scope) || !scope.every((value) => typeof value === 'string')) {
    return { kind: 'refused' }
  }
  const scheme = securitySchemes[schemeName]
  if (!isRecord(scheme) || !boundedTrimmed(schemeName, MAX_TOOL_NAME_LENGTH)) {
    return { kind: 'refused' }
  }
  if (scheme.type === 'apiKey'
    && (scheme.in === 'query' || scheme.in === 'header')
    && typeof scheme.name === 'string'
    && /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(scheme.name)) {
    return {
      kind: 'resolved',
      spec: { kind: 'api_key', location: scheme.in, name: scheme.name, schemeName },
      parameterNames: scheme.in === 'query' ? [scheme.name] : [],
    }
  }
  if (scheme.type === 'http' && typeof scheme.scheme === 'string'
    && scheme.scheme.toLowerCase() === 'bearer') {
    return { kind: 'resolved', spec: { kind: 'http_bearer', schemeName }, parameterNames: [] }
  }
  return { kind: 'refused' }
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


