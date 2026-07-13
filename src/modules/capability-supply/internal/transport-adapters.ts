import { z } from 'zod'

import type { JsonValue } from '@/modules/capability-contract/public'
import type { CapabilityCancellation, CapabilityContinuation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

const MAX_ADAPTER_CONFIG_BYTES = 65_536
const encoder = new TextEncoder()
const httpJsonConfiguration = z.object({
  method: z.literal('POST'),
  requestTimeoutMs: z.number().int().min(100).max(120_000),
  reconciliation: z.object({
    path: z.string().regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/),
    requestTimeoutMs: z.number().int().min(100).max(120_000),
  }).strict().optional(),
}).strict()

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
])

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
  const endpoint = validHttpsEndpoint(input.endpointUrl)
  const configuration = httpJsonConfiguration.safeParse(input.config)
  if (
    endpoint === undefined
    || !/^env:[A-Z][A-Z0-9_]{1,199}$/.test(input.credentialRef)
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

function validHttpsEndpoint(value: string): URL | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? url : undefined
  } catch {
    return undefined
  }
}

function stringifyForSize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}
