import { z } from 'zod'

import type { JsonValue } from '@/modules/capability-contract/public'
import type { CapabilityCancellation, CapabilityContinuation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

export const PUBLIC_CREDENTIAL_REF = 'none'
const MAX_ADAPTER_CONFIG_BYTES = 65_536
const encoder = new TextEncoder()
const queryMapping = z.array(z.strictObject({
  inputPointer: z.string().regex(/^\/(?:[^/~]|~[01])+(?:\/(?:[^/~]|~[01])+)*$/),
  parameter: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
})).min(1).max(64)
const httpJsonConfiguration = z.strictObject({
  method: z.enum(['GET', 'POST']),
  query: queryMapping.optional(),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  reconciliation: z.strictObject({
    path: z.string().regex(/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/),
    requestTimeoutMs: z.number().int().min(100).max(120_000),
  }).optional(),
  cancellation: z.strictObject({
    path: z.string().regex(/^\/(?!\/)[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/),
    requestTimeoutMs: z.number().int().min(100).max(120_000),
  }).optional(),
}).refine((value) => value.method === 'GET'
  ? value.query !== undefined && value.reconciliation === undefined && value.cancellation === undefined
  : value.query === undefined)
const mcpJsonRpcConfiguration = z.strictObject({
  protocolVersion: z.string().trim().min(1).max(64),
  toolName: z.string().trim().min(1).max(200),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
})
const x402FetchConfiguration = z.strictObject({
  method: z.enum(['GET', 'POST']),
  query: queryMapping.optional(),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  scheme: z.literal('exact'),
  network: z.string().trim().min(1).max(100),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  routeAmountExponent: z.number().int().min(0).max(18),
  assetAmountExponent: z.number().int().min(0).max(18),
  asset: z.string().trim().min(1).max(200),
  payTo: z.string().trim().min(1).max(200),
}).refine((value) => value.assetAmountExponent >= value.routeAmountExponent)
  .refine((value) => value.method === 'GET' ? (value.query?.length ?? 0) > 0 : value.query === undefined)

export type TransportAdmissionInput = Readonly<{
  adapterId: string
  endpointUrl: string
  credentialRef: string
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
function validCredentialRef(value: string, allowPublic: boolean): boolean {
  return /^env:[A-Z][A-Z0-9_]{1,199}$/.test(value)
    || (allowPublic && value === PUBLIC_CREDENTIAL_REF)
}

export function admitRegisteredTransport(input: TransportAdmissionInput): TransportAdmissionResult {
  const adapter = adapters.get(input.adapterId)
  return adapter === undefined
    ? { kind: 'refused', reason: 'adapter_not_registered' }
    : adapter.admit(input)
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
    || !validCredentialRef(input.credentialRef, true)
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
    || !validCredentialRef(input.credentialRef, false)
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
  const configuration = x402FetchConfiguration.safeParse(input.config)
  if (
    endpoint === undefined
    || !validCredentialRef(input.credentialRef, false)
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
    || hostname === 'metadata.google.internal' || hostname === 'instance-data') return true
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
