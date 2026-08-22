import {
  CallToolResultSchema,
  InitializeResultSchema,
  JSONRPCResponseSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {
  NetworkSchemaV2,
  validatePaymentRequired,
} from '@x402/core/schemas'
import { z } from 'zod'
import type { JsonValue } from '@/modules/capability-contract/public'
import type {
  CapabilityCancellation,
  CapabilityContinuation,
  CapabilityTransportAuthority,
} from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
export function isMcpJsonRpcResult(value: unknown, expectedId: string): boolean {
  const parsed = JSONRPCResponseSchema.safeParse(value)
  return parsed.success && parsed.data.id === expectedId && 'result' in parsed.data
}
export function parseMcpJsonRpcResponse(value: unknown, expectedId: string): unknown | undefined {
  const parsed = JSONRPCResponseSchema.safeParse(value)
  return parsed.success && parsed.data.id === expectedId ? parsed.data : undefined
}


function mcpJsonRpcResult(value: unknown, expectedId: string): unknown {
  const parsed = JSONRPCResponseSchema.safeParse(value)
  return parsed.success && parsed.data.id === expectedId && 'result' in parsed.data ? parsed.data.result : undefined
}

export function parseMcpInitializeResult(value: unknown, expectedId: string) {
  const parsed = InitializeResultSchema.safeParse(mcpJsonRpcResult(value, expectedId))
  return parsed.success ? parsed.data : undefined
}

export function parseMcpListToolsResult(value: unknown, expectedId: string) {
  const parsed = ListToolsResultSchema.safeParse(mcpJsonRpcResult(value, expectedId))
  return parsed.success ? parsed.data : undefined
}

export function parseMcpCallToolResult(value: unknown, expectedId: string) {
  const parsed = CallToolResultSchema.safeParse(mcpJsonRpcResult(value, expectedId))
  return parsed.success ? parsed.data : undefined
}

export type X402CatalogPayment = Readonly<{
  network: string
  asset: string
  currency: string
  routeAmountExponent: number
  assetAmountExponent: number
}>

export const PUBLIC_CREDENTIAL_REF = 'none'
const MAX_ADAPTER_CONFIG_BYTES = 65_536
const encoder = new TextEncoder()
export type HttpJsonQueryParameterMapping = Readonly<{
  inputPointer: string
  parameter: string
  /**
   * OpenAPI's required flag. Older stored bindings omit this field and retain
   * the historical all-mapped-values-required behavior at the runtime seam.
   */
  required?: boolean
  style?: 'form'
  explode?: boolean
}>
export type HttpJsonPathParameterMapping = Readonly<{
  inputPointer: string
  parameter: string
  required?: boolean
  style?: 'simple'
  explode?: boolean
}>
export type HttpJsonHeaderParameterMapping = Readonly<{
  inputPointer: string
  parameter: string
  required?: boolean
  style?: 'simple'
  explode?: boolean
}>
export type HttpJsonFixedQueryParameter = Readonly<{
  parameter: string
  value: string
}>
export type HttpJsonCredential = Readonly<
  | { kind: 'none' }
  | { kind: 'api_key'; location: 'query' | 'header'; name: string }
  | { kind: 'bearer' }
>
export type HttpJsonTransportConfiguration = Readonly<{
  method: 'GET' | 'POST'
  query?: readonly HttpJsonQueryParameterMapping[]
  path?: readonly HttpJsonPathParameterMapping[]
  headers?: readonly HttpJsonHeaderParameterMapping[]
  fixedQuery?: readonly HttpJsonFixedQueryParameter[]
  requestContentType?: string
  responseContentType?: string
  responseStatus?: number
  requestTimeoutMs: number
  credential?: HttpJsonCredential
  reconciliation?: Readonly<{ path: string; requestTimeoutMs: number }>
  cancellation?: Readonly<{ path: string; requestTimeoutMs: number }>
}>
const inputPointer = z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/)
const queryParameterName = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/)
const headerParameterName = z.string().regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,100}$/)
const queryMapping = z.array(z.strictObject({
  inputPointer,
  parameter: queryParameterName,
  required: z.boolean().optional(),
  style: z.literal('form').optional(),
  explode: z.boolean().optional(),
})).min(1).max(64).superRefine((items, context) => {
  const pointers = new Set<string>()
  const parameters = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (pointers.has(item.inputPointer) || parameters.has(item.parameter)) {
      context.addIssue({ code: 'custom', path: [index], message: 'query_mapping_duplicate' })
    }
    pointers.add(item.inputPointer)
    parameters.add(item.parameter)
  }
})
const pathMapping = z.array(z.strictObject({
  inputPointer,
  parameter: queryParameterName,
  required: z.boolean().optional(),
  style: z.literal('simple').optional(),
  explode: z.boolean().optional(),
})).min(1).max(32).superRefine((items, context) => {
  const pointers = new Set<string>()
  const parameters = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (pointers.has(item.inputPointer) || parameters.has(item.parameter)) {
      context.addIssue({ code: 'custom', path: [index], message: 'path_mapping_duplicate' })
    }
    pointers.add(item.inputPointer)
    parameters.add(item.parameter)
  }
})
const headerMapping = z.array(z.strictObject({
  inputPointer,
  parameter: headerParameterName,
  required: z.boolean().optional(),
  style: z.literal('simple').optional(),
  explode: z.boolean().optional(),
})).min(1).max(64).superRefine((items, context) => {
  const pointers = new Set<string>()
  const parameters = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (pointers.has(item.inputPointer) || parameters.has(item.parameter)) {
      context.addIssue({ code: 'custom', path: [index], message: 'header_mapping_duplicate' })
    }
    pointers.add(item.inputPointer)
    parameters.add(item.parameter)
  }
})
const contentType = z.string().trim().regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/).max(200)
const fixedQueryMapping = z.array(z.strictObject({
  parameter: queryParameterName,
  value: z.string().trim().min(1).max(200),
})).max(64).superRefine((items, context) => {
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (seen.has(item.parameter)) context.addIssue({ code: 'custom', path: [index], message: 'fixed_query_duplicate' })
    seen.add(item.parameter)
  }
})
const httpJsonCredential = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({
    kind: z.literal('api_key'),
    location: z.enum(['query', 'header']),
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
  }),
  z.strictObject({ kind: z.literal('bearer') }),
])
const httpJsonConfiguration = z.strictObject({
  method: z.enum(['GET', 'POST']),
  query: queryMapping.optional(),
  path: pathMapping.optional(),
  headers: headerMapping.optional(),
  fixedQuery: fixedQueryMapping.optional(),
  requestContentType: contentType.optional(),
  responseContentType: contentType.optional(),
  responseStatus: z.number().int().min(200).max(299).optional(),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  credential: httpJsonCredential.optional(),
  reconciliation: z.strictObject({
    path: z.string().regex(/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/),
    requestTimeoutMs: z.number().int().min(100).max(120_000),
  }).optional(),
  cancellation: z.strictObject({
    path: z.string().regex(/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/),
    requestTimeoutMs: z.number().int().min(100).max(120_000),
  }).optional(),
}).refine((value) => value.method === 'GET'
  ? value.reconciliation === undefined
    && value.cancellation === undefined
  : true)
.refine((value) => value.method !== 'GET'
  || (value.query?.length ?? 0) > 0
  || (value.path?.length ?? 0) > 0
  || (value.headers?.length ?? 0) > 0
  || (value.fixedQuery?.length ?? 0) > 0)
.refine((value) => {
  const credential = value.credential
  if (credential?.kind !== 'api_key' || credential.location !== 'query') return true
  const dynamic = value.query?.some(({ parameter }) => parameter === credential.name) ?? false
  const fixed = value.fixedQuery?.some(({ parameter }) => parameter === credential.name) ?? false
  return !dynamic && !fixed
})
.refine((value) => {
  const credential = value.credential
  if (credential?.kind !== 'api_key' || credential.location !== 'header') return true
  return !(value.headers?.some(({ parameter }) => parameter.toLowerCase() === credential.name.toLowerCase()) ?? false)
})
const mcpJsonRpcConfiguration = z.strictObject({
  protocolVersion: z.string().trim().min(1).max(64),
  toolName: z.string().trim().min(1).max(200),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  credential: httpJsonCredential.optional(),
})
const x402FetchConfiguration = z.strictObject({
  method: z.enum(['GET', 'POST']),
  query: queryMapping.optional(),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  scheme: z.literal('exact'),
  network: z.string().trim().min(1).max(200),
  currency: z.string().trim().regex(/^[A-Z][A-Z0-9]{2,19}$/),
  routeAmountExponent: z.number().int().min(0).max(18),
  assetAmountExponent: z.number().int().min(0).max(18),
  asset: z.string().trim().min(1).max(200),
  payTo: z.string().trim().min(1).max(200),
  paymentRequired: z.unknown(),
}).refine((value) => NetworkSchemaV2.safeParse(value.network).success)
  .refine((value) => {
    const segments = value.network.split(':')
    return segments.length === 2 && segments.every((segment) => segment.length > 0)
  })
  .refine((value) => value.assetAmountExponent >= value.routeAmountExponent)
  .refine((value) => value.method === 'GET' ? (value.query?.length ?? 0) > 0 : value.query === undefined)
  .superRefine((value, context) => {
    try {
      const paymentRequired = validatePaymentRequired(value.paymentRequired)
      if (paymentRequired.x402Version !== 2) {
        context.addIssue({
          code: 'custom',
          path: ['paymentRequired'],
          message: 'payment_required_version_unsupported',
        })
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['paymentRequired'], message: 'payment_required_invalid' })
    }
  })

export type TransportAdmissionInput = Readonly<{
  adapterId: string
  endpointUrl: string
  authority: CapabilityTransportAuthority
  continuation: CapabilityContinuation
  cancellation: CapabilityCancellation
  config: unknown
}>

export type TransportAdmissionResult =
  | Readonly<{
      kind: 'admitted'
      transport: Readonly<{
        adapterId: string
        configJson: string
        configDigest: string
      }>
    }>
  | Readonly<{
      kind: 'refused'
      reason: 'adapter_not_registered' | 'adapter_config_invalid' | 'adapter_config_too_large'
    }>

type TransportAdapterDefinition = Readonly<{
  adapterId: string
  admit: (input: TransportAdmissionInput) => TransportAdmissionResult
}>

const adapters = new Map<string, TransportAdapterDefinition>([
  ['http-json:v1', { adapterId: 'http-json:v1', admit: admitHttpJsonTransport }],
  ['mcp-jsonrpc:v1', { adapterId: 'mcp-jsonrpc:v1', admit: admitMcpJsonRpcTransport }],
  ['x402-fetch:v2', { adapterId: 'x402-fetch:v2', admit: admitX402FetchTransport }],
])

export type AdmittedTransportCatalogMetadata = Readonly<{
  method: 'GET' | 'POST'
  queryInputPointers: readonly string[]
}>

export function parseAdmittedTransportCatalogMetadata(
  adapterId: string,
  configJson: string,
): AdmittedTransportCatalogMetadata | undefined {
  let value: unknown
  try {
    value = JSON.parse(configJson)
  } catch {
    return undefined
  }
  if (adapterId === 'http-json:v1') {
    const parsed = httpJsonConfiguration.safeParse(value)
    return parsed.success
      ? { method: parsed.data.method, queryInputPointers: parsed.data.query?.map(({ inputPointer }) => inputPointer) ?? [] }
      : undefined
  }
  if (adapterId === 'x402-fetch:v2') {
    const parsed = parseX402FetchTransportConfiguration(value)
    return parsed === undefined
      ? undefined
      : { method: parsed.method, queryInputPointers: parsed.query?.map(({ inputPointer }) => inputPointer) ?? [] }
  }
  return adapterId === 'mcp-jsonrpc:v1' && mcpJsonRpcConfiguration.safeParse(value).success
    ? { method: 'POST', queryInputPointers: [] }
    : undefined
}
export function parseHttpJsonTransportConfiguration(
  value: unknown,
): HttpJsonTransportConfiguration | undefined {
  const parsed = httpJsonConfiguration.safeParse(value)
  return parsed.success ? parsed.data as HttpJsonTransportConfiguration : undefined
}

export type McpJsonRpcTransportConfiguration = Readonly<{
  protocolVersion: string
  toolName: string
  requestTimeoutMs: number
  credential?: HttpJsonCredential
}>

export function parseMcpJsonRpcTransportConfiguration(
  value: unknown,
): McpJsonRpcTransportConfiguration | undefined {
  const parsed = mcpJsonRpcConfiguration.safeParse(value)
  return parsed.success ? parsed.data as McpJsonRpcTransportConfiguration : undefined
}

export type X402FetchTransportConfiguration = Readonly<{
  method: 'GET' | 'POST'
  query?: HttpJsonQueryParameterMapping[]
  requestTimeoutMs: number
  scheme: 'exact'
  network: string
  currency: string
  routeAmountExponent: number
  assetAmountExponent: number
  asset: string
  payTo: string
  paymentRequired: ReturnType<typeof validatePaymentRequired>
}>

export function parseX402FetchTransportConfiguration(
  value: unknown,
): X402FetchTransportConfiguration | undefined {
  const parsed = x402FetchConfiguration.safeParse(value)
  if (!parsed.success) return undefined
  try {
    const { query: parsedQuery, ...withoutQuery } = parsed.data
    const query = parsedQuery?.map((item) => ({
      inputPointer: item.inputPointer,
      parameter: item.parameter,
      ...(item.required === undefined ? {} : { required: item.required }),
      ...(item.style === undefined ? {} : { style: item.style }),
      ...(item.explode === undefined ? {} : { explode: item.explode }),
    }))
    return {
      ...withoutQuery,
      ...(query === undefined ? {} : { query }),
      paymentRequired: validatePaymentRequired(parsed.data.paymentRequired),
    }
  } catch {
    return undefined
  }
}

export function readHttpJsonProbeConfiguration(
  adapterId: string,
  configJson: string,
): HttpJsonProbeConfiguration {
  try {
    const value: unknown = JSON.parse(configJson)
    if (adapterId === 'http-json:v1') {
      const configuration = parseHttpJsonTransportConfiguration(value)
      return configuration === undefined
        ? { method: 'GET', query: [], path: [], headers: [], fixedQuery: [] }
        : {
            method: configuration.method,
            query: configuration.query ?? [],
            path: configuration.path ?? [],
            headers: configuration.headers ?? [],
            fixedQuery: configuration.fixedQuery ?? [],
            ...(configuration.requestContentType === undefined
              ? {} : { requestContentType: configuration.requestContentType }),
            ...(configuration.responseContentType === undefined
              ? {} : { responseContentType: configuration.responseContentType }),
            ...(configuration.responseStatus === undefined
              ? {} : { responseStatus: configuration.responseStatus }),
            ...(configuration.credential === undefined ? {} : { credential: configuration.credential }),
        }
    }
    if (adapterId === 'x402-fetch:v2') {
      const configuration = parseX402FetchTransportConfiguration(value)
      return configuration === undefined
        ? { method: 'GET', query: [], path: [], headers: [], fixedQuery: [] }
        : {
            method: configuration.method,
            query: configuration.query ?? [],
            path: [],
            headers: [],
            fixedQuery: [],
        }
    }
  } catch {
    // Fall through to the safe non-target default.
  }
  return { method: 'GET', query: [], path: [], headers: [], fixedQuery: [] }
}

export function injectHttpJsonCredential(
  configuration: HttpJsonTransportConfiguration,
  endpoint: URL,
  headers: Readonly<Record<string, string>>,
  credential: string | undefined,
): Readonly<{ target: URL; headers: Record<string, string> }> | undefined {
  const placement = configuration.credential
  if (credential === undefined) {
    return placement === undefined || placement.kind === 'none'
      ? { target: new URL(endpoint), headers: { ...headers } }
      : undefined
  }
  if (credential.trim().length === 0 || placement === undefined || placement.kind === 'none') return undefined
  const target = new URL(endpoint)
  const nextHeaders = { ...headers }
  if (placement.kind === 'api_key' && placement.location === 'query') {
    target.searchParams.set(placement.name, credential)
  } else if (placement.kind === 'api_key') {
    nextHeaders[placement.name] = credential
  } else {
    nextHeaders.Authorization = `Bearer ${credential}`
  }
  return { target, headers: nextHeaders }
}

export type HttpJsonProbeConfiguration = Readonly<{
  method: 'GET' | 'POST'
  query: readonly HttpJsonQueryParameterMapping[]
  path: readonly HttpJsonPathParameterMapping[]
  headers: readonly HttpJsonHeaderParameterMapping[]
  fixedQuery: readonly HttpJsonFixedQueryParameter[]
  requestContentType?: string
  responseContentType?: string
  responseStatus?: number
  credential?: HttpJsonCredential
}>
function validAuthority(value: CapabilityTransportAuthority, allowKeyless: boolean): boolean {
  if (value.kind === 'keyless') return allowKeyless
  return /^connection:[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(value.connectionRef)
    && /^provider:[A-Za-z0-9][A-Za-z0-9:_.-]{0,199}$/.test(value.providerRef)
}

export function admitRegisteredTransport(input: TransportAdmissionInput): TransportAdmissionResult {
  const adapter = adapters.get(input.adapterId)
  return adapter === undefined
    ? { kind: 'refused', reason: 'adapter_not_registered' }
    : adapter.admit(input)
}


export function parseAdmittedX402CatalogPayment(
  adapterId: string,
  configJson: string,
): X402CatalogPayment | undefined {
  if (adapterId !== 'x402-fetch:v2') return undefined
  try {
    const configuration = x402FetchConfiguration.safeParse(JSON.parse(configJson))
    if (!configuration.success) return undefined
    const { network, asset, currency, routeAmountExponent, assetAmountExponent } = configuration.data
    return { network, asset, currency, routeAmountExponent, assetAmountExponent }
  } catch {
    return undefined
  }
}

function admitHttpJsonTransport(input: TransportAdmissionInput): TransportAdmissionResult {
  const rawConfigJson = stringifyForSize(input.config)
  if (rawConfigJson === undefined) return { kind: 'refused', reason: 'adapter_config_invalid' }
  if (encoder.encode(rawConfigJson).byteLength > MAX_ADAPTER_CONFIG_BYTES) {
    return { kind: 'refused', reason: 'adapter_config_too_large' }
  }
  const endpoint = validPublicHttpsEndpoint(input.endpointUrl)
  const configuration = httpJsonConfiguration.safeParse(input.config)
  if (
    endpoint === undefined
    || !validAuthority(input.authority, true)
    || input.continuation.kind !== 'single_response'
    || (input.cancellation.kind === 'adapter_managed') !== (configuration.success
      && configuration.data.cancellation !== undefined)
    || !configuration.success
  ) {
    return { kind: 'refused', reason: 'adapter_config_invalid' }
  }
  const config = configuration.data as JsonValue
  const configJson = stableStringify(config as StableHashValue)
  return {
    kind: 'admitted',
    transport: {
      adapterId: input.adapterId,
      configJson,
      configDigest: canonicalDigest(config as StableHashValue),
    },
  }
}

function admitMcpJsonRpcTransport(input: TransportAdmissionInput): TransportAdmissionResult {
  const rawConfigJson = stringifyForSize(input.config)
  if (rawConfigJson === undefined) return { kind: 'refused', reason: 'adapter_config_invalid' }
  if (encoder.encode(rawConfigJson).byteLength > MAX_ADAPTER_CONFIG_BYTES) {
    return { kind: 'refused', reason: 'adapter_config_too_large' }
  }
  const endpoint = validPublicHttpsEndpoint(input.endpointUrl)
  const configuration = mcpJsonRpcConfiguration.safeParse(input.config)
  if (
    endpoint === undefined
    || !validAuthority(input.authority, true)
    || input.continuation.kind !== 'single_response'
    || input.cancellation.kind !== 'unsupported'
    || !configuration.success
  ) {
    return { kind: 'refused', reason: 'adapter_config_invalid' }
  }
  const config = configuration.data as JsonValue
  const configJson = stableStringify(config as StableHashValue)
  return {
    kind: 'admitted',
    transport: {
      adapterId: input.adapterId,
      configJson,
      configDigest: canonicalDigest(config as StableHashValue),
    },
  }
}

function admitX402FetchTransport(input: TransportAdmissionInput): TransportAdmissionResult {
  const rawConfigJson = stringifyForSize(input.config)
  if (rawConfigJson === undefined) return { kind: 'refused', reason: 'adapter_config_invalid' }
  if (encoder.encode(rawConfigJson).byteLength > MAX_ADAPTER_CONFIG_BYTES) {
    return { kind: 'refused', reason: 'adapter_config_too_large' }
  }
  const endpoint = validPublicHttpsEndpoint(input.endpointUrl)
  const configuration = parseX402FetchTransportConfiguration(input.config)
  if (
    endpoint === undefined
    || !validAuthority(input.authority, false)
    || input.continuation.kind !== 'single_response'
    || input.cancellation.kind !== 'unsupported'
    || configuration === undefined
  ) {
    return { kind: 'refused', reason: 'adapter_config_invalid' }
  }
  const config = configuration as JsonValue
  const configJson = stableStringify(config)
  return {
    kind: 'admitted',
    transport: {
      adapterId: input.adapterId,
      configJson,
      configDigest: canonicalDigest(config),
    },
  }
}

export function validPublicHttpsEndpoint(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && !staticallyPrivateHostname(url.hostname)
      ? url
      : undefined
  } catch {
    return undefined
  }
}

function staticallyPrivateHostname(rawHostname: string): boolean {
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname === 'local' || hostname.endsWith('.local')
    || hostname === 'metadata' || hostname === 'metadata.google.internal' || hostname === 'instance-data') return true
  const ipv4 = parseIpv4(hostname)
  if (ipv4 !== undefined) {
    const [first, second] = ipv4
    return first === 0 || first === 10 || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || first >= 224
  }
  if (!hostname.includes(':')) return false
  return hostname === '::' || hostname === '::1'
    || hostname.startsWith('fc') || hostname.startsWith('fd')
    || /^fe[89ab]/.test(hostname)
    || /^fe[c-f]/.test(hostname)
    || hostname.startsWith('ff')
    || hostname.startsWith('::ffff:')
}

function parseIpv4(hostname: string): readonly [number, number, number, number] | undefined {
  const segments = hostname.split('.')
  if (segments.length !== 4 || segments.some((segment) => !/^\d{1,3}$/.test(segment))) return undefined
  const octets = segments.map(Number)
  if (!octets.every((octet) => octet >= 0 && octet <= 255)) return undefined
  const [first, second, third, fourth] = octets
  return first === undefined || second === undefined || third === undefined || fourth === undefined
    ? undefined
    : [first, second, third, fourth]
}

function stringifyForSize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}
