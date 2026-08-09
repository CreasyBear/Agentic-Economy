import { z } from 'zod'
import { isProviderConnectionCredentialRef } from '../provider-connection'
import type { CapabilityTransportBindingRegistration } from '@/modules/capability-supply/public'
import { validateJsonSchema } from '@/modules/capability-contract/public'
import { exactAmountSchema } from '@/modules/money/public'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import { readJsonPointer } from '@/modules/common/json-pointer'
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  type HttpJsonTransportConfiguration,
} from './transport-adapters'

const HEALTHY_TTL_MS = 5 * 60_000
const UNHEALTHY_TTL_MS = 60_000
const MAX_RESPONSE_BYTES = 64 * 1024

const quoteResponse = z.looseObject({
  kind: z.literal('quoted'),
  expectedCost: exactAmountSchema,
  maximumCost: exactAmountSchema,
  expectedLatencyMs: z.number().int().nonnegative(),
  dataFields: z.array(z.string()).max(128),
  disclosures: z.array(z.string()).max(64),
})
const mcpToolsResponse = z.looseObject({
  jsonrpc: z.literal('2.0'), id: z.literal('ae-readiness-probe'),
  result: z.looseObject({ tools: z.array(z.looseObject({ name: z.string().min(1) })) }),
})

export type CapabilityProbeTarget = Readonly<{
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  authority: CapabilityTransportBindingRegistration['authority']
  adapterId: string
  probeKind?: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
  probeQuery?: readonly Readonly<{ parameter: string; value: string }>[]
  probeMethod?: 'GET' | 'HEAD'
  transportConfigJson?: string
  probeInputJson?: string
  outputSchemaJson?: string
}>

export type CapabilityProbeObservation = Readonly<{
  outcome: CapabilityProbeOutcome
  credentialState: 'ready' | 'unavailable'
  healthState: 'healthy' | 'unhealthy'
  validUntil: number
  evidenceRefs: readonly string[]
}>
export type CapabilityProbeOutcome =
  | 'healthy' | 'credential_unavailable' | 'credential_rejected' | 'target_not_public'
  | 'transport_unreachable' | 'http_redirect' | 'http_4xx' | 'http_5xx'
  | 'response_content_type_invalid' | 'response_too_large' | 'response_invalid'

export type CapabilityProbeDependencies = Readonly<{
  resolveProviderConnectionCredential: (
    authority: Extract<CapabilityTransportBindingRegistration['authority'], { kind: 'provider_connection' }>,
  ) => Promise<string | undefined>
  validateTarget: (url: URL) => Promise<boolean>
  send: (request: Request) => Promise<Response>
  now?: () => number
}>

export async function runCapabilityReadinessProbe(
  target: CapabilityProbeTarget,
  dependencies: CapabilityProbeDependencies,
): Promise<CapabilityProbeObservation> {
  const now = (dependencies.now ?? Date.now)()
  const httpConfiguration = target.adapterId === 'http-json:v1' && target.transportConfigJson !== undefined
    ? parseHttpJsonTransportConfiguration(parseJson(target.transportConfigJson))
    : undefined
  const probeKind = target.probeKind ?? (target.adapterId === 'mcp-jsonrpc:v1' ? 'mcp' : 'ae_quote')
  if (target.adapterId === 'http-json:v1'
    && target.transportConfigJson !== undefined
    && httpConfiguration === undefined) {
    return unhealthy(now, 'ready', 'response_invalid', ['probe:request_unrepresentable'])
  }
  if (probeKind === 'openapi_http') {
    const configuration: HttpJsonTransportConfiguration = httpConfiguration ?? {
      method: target.probeMethod === 'GET' ? 'GET' as const : 'POST' as const,
      requestTimeoutMs: 10_000,
      credential: { kind: 'none' as const },
    }
    const placement = configuration.credential
    const placementMatches = target.authority.kind === 'keyless'
      ? placement === undefined || placement.kind === 'none'
      : placement !== undefined && placement.kind !== 'none'
    if (!placementMatches) {
      return unhealthy(now, 'unavailable', 'credential_unavailable', ['probe:credential_unavailable'])
    }
    if (configuration.query !== undefined) {
      const input = parseJson(target.probeInputJson ?? '{}')
      if (!isRecord(input)) {
        return unhealthy(now, 'ready', 'response_invalid', ['probe:request_unrepresentable'])
      }
      for (const mapping of configuration.query) {
        const value = readJsonPointer(input, mapping.inputPointer)
        if (value !== undefined
          && typeof value !== 'string'
          && typeof value !== 'number'
          && typeof value !== 'boolean') {
          return unhealthy(now, 'ready', 'response_invalid', ['probe:request_unrepresentable'])
        }
      }
    }
  }
  let endpoint: URL
  try {
    endpoint = new URL(target.endpointUrl)
  } catch {
    return unhealthy(now, 'ready', 'target_not_public', ['probe:target_not_public'])
  }
  try {
    if (!await dependencies.validateTarget(endpoint)) {
      return unhealthy(now, 'ready', 'target_not_public', ['probe:target_not_public'])
    }
  } catch {
    return unhealthy(now, 'ready', 'target_not_public', ['probe:target_not_public'])
  }
  const providerAuthority = target.authority.kind === 'provider_connection'
    ? target.authority
    : undefined
  let credential: string | undefined
  if (providerAuthority !== undefined) {
    try {
      credential = await dependencies.resolveProviderConnectionCredential(providerAuthority)
    } catch {
      return unhealthy(now, 'unavailable', 'credential_unavailable', ['probe:credential_unavailable'])
    }
  }
  if (providerAuthority !== undefined && (credential === undefined || credential.trim() === '')) {
    return unhealthy(now, 'unavailable', 'credential_unavailable', ['probe:credential_unavailable'])
  }
  if (providerAuthority !== undefined && credential !== undefined && isProviderConnectionCredentialRef(credential)) {
    return unhealthy(now, 'unavailable', 'credential_unavailable', ['probe:credential_unavailable'])
  }
  const credentialEvidence = providerAuthority === undefined
    ? 'probe:credential_not_required'
    : 'probe:credential_resolved'
  let request: Request | undefined
  try {
    request = probeRequest(target, endpoint, credential, httpConfiguration)
  } catch {
    return unhealthy(now, 'ready', 'response_invalid', [credentialEvidence, 'probe:request_unrepresentable'])
  }
  if (request === undefined) {
    return unhealthy(now, 'ready', 'response_invalid', [credentialEvidence, 'probe:request_unrepresentable'])
  }
  let response: Response
  try {
    response = await dependencies.send(request)
  } catch {
    return unhealthy(now, 'ready', 'transport_unreachable', [
      credentialEvidence, 'probe:target_public', 'probe:transport_unreachable',
    ])
  }
  const baseEvidence = [credentialEvidence, 'probe:target_public']
  if (response.headers.get('X-AE-Probe-Outcome') === 'response_too_large') {
    return unhealthy(now, 'ready', 'response_too_large', [...baseEvidence, 'probe:response_too_large'])
  }
  if (response.status === 401 || response.status === 403) {
    return unhealthy(now, 'unavailable', 'credential_rejected', [...baseEvidence, 'probe:credential_rejected'])
  }
  if (target.probeKind === 'x402' && response.status === 402) {
    return healthy(now, baseEvidence, 'probe:x402_payment_required')
  }
  if (response.status >= 300 && response.status < 400) {
    return unhealthy(now, 'ready', 'http_redirect', [...baseEvidence, 'probe:http_redirect'])
  }
  if (response.status < 200 || response.status >= 300) {
    const outcome = response.status >= 500 ? 'http_5xx' as const : 'http_4xx' as const
    return unhealthy(now, 'ready', outcome, [...baseEvidence, `probe:${outcome}`])
  }
  if (target.probeKind === 'openapi_http' && target.outputSchemaJson === undefined) {
    return healthy(now, baseEvidence, 'probe:http_2xx')
  }
  if (!(response.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) {
    return unhealthy(now, 'ready', 'response_content_type_invalid', [...baseEvidence, 'probe:response_content_type_invalid'])
  }
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES)
  if (!bounded.ok) {
    return unhealthy(now, 'ready', 'response_too_large', [...baseEvidence, 'probe:response_too_large'])
  }
  const body = bounded.text
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  if (target.probeKind === 'openapi_http' && target.outputSchemaJson !== undefined) {
    const outputSchema = parseJson(target.outputSchemaJson)
    if (!isRecord(outputSchema) || !validateJsonSchema(outputSchema, parsed)) {
      return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
    }
  }
  if (target.probeKind !== 'openapi_http'
    && target.adapterId === 'http-json:v1' && !quoteResponse.safeParse(parsed).success) {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  if ((target.probeKind === 'mcp' || target.adapterId === 'mcp-jsonrpc:v1') && !mcpToolsResponse.safeParse(parsed).success) {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  return healthy(now, baseEvidence, 'probe:http_2xx')
}
function probeRequest(
  target: CapabilityProbeTarget,
  endpoint: URL,
  credential: string | undefined,
  configuration: HttpJsonTransportConfiguration | undefined,
): Request | undefined {
  const probeKind = target.probeKind ?? (target.adapterId === 'mcp-jsonrpc:v1' ? 'mcp' : 'ae_quote')
  if (probeKind === 'openapi_http') {
    const httpConfiguration = configuration ?? {
      method: target.probeMethod === 'GET' ? 'GET' as const : 'POST' as const,
      requestTimeoutMs: 10_000,
      credential: { kind: 'none' as const },
    }
    const targetUrl = new URL(endpoint)
    for (const query of target.probeQuery ?? httpConfiguration.fixedQuery ?? []) {
      targetUrl.searchParams.append(query.parameter, query.value)
    }
    if (httpConfiguration.query !== undefined) {
      const input = parseJson(target.probeInputJson ?? '{}')
      if (!isRecord(input)) return undefined
      for (const mapping of httpConfiguration.query) {
        const value = readJsonPointer(input, mapping.inputPointer)
        if (value === undefined) continue
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined
        targetUrl.searchParams.append(mapping.parameter, String(value))
      }
    }
    const applied = injectHttpJsonCredential(
      httpConfiguration,
      targetUrl,
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      credential,
    )
    if (applied === undefined) return undefined
    return new Request(applied.target, {
      method: target.probeMethod ?? httpConfiguration.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(httpConfiguration.requestTimeoutMs),
      headers: applied.headers,
    })
  }
  const body = probeKind === 'mcp'
    ? { jsonrpc: '2.0', id: 'ae-readiness-probe', method: 'tools/list', params: {} }
    : probeKind === 'x402'
      ? {}
      : {
          protocolVersion: 'ae-capability:v1', operation: 'quote',
          bindingId: target.bindingId, capabilityContractId: target.capabilityId,
        }
  const targetUrl = new URL(endpoint)
  for (const query of target.probeQuery ?? []) targetUrl.searchParams.append(query.parameter, query.value)
  return new Request(targetUrl, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
}
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function healthy(now: number, evidence: readonly string[], resultEvidence: string): CapabilityProbeObservation {
  return { outcome: 'healthy', credentialState: 'ready', healthState: 'healthy',
    validUntil: now + HEALTHY_TTL_MS, evidenceRefs: [...evidence, resultEvidence] }
}

function unhealthy(
  now: number,
  credentialState: 'ready' | 'unavailable',
  outcome: Exclude<CapabilityProbeOutcome, 'healthy'>,
  evidenceRefs: readonly string[],
): CapabilityProbeObservation {
  return { outcome, credentialState, healthState: 'unhealthy', validUntil: now + UNHEALTHY_TTL_MS, evidenceRefs }
}
