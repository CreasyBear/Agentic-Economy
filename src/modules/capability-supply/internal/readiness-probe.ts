import { z } from 'zod'

const HEALTHY_TTL_MS = 5 * 60_000
const UNHEALTHY_TTL_MS = 60_000
const MAX_RESPONSE_BYTES = 64 * 1024

const quoteResponse = z.object({
  kind: z.literal('quoted'),
  expectedCost: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative() }),
  maximumCost: z.object({ currency: z.string().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative() }),
  expectedLatencyMs: z.number().int().nonnegative(),
  dataFields: z.array(z.string()).max(128),
  disclosures: z.array(z.string()).max(64),
}).passthrough()
const mcpToolsResponse = z.object({
  jsonrpc: z.literal('2.0'), id: z.literal('ae-readiness-probe'),
  result: z.object({ tools: z.array(z.object({ name: z.string().min(1) }).passthrough()) }).passthrough(),
}).passthrough()

export type CapabilityProbeTarget = Readonly<{
  publicationRef: string
  revision: number
  bindingId: string
  capabilityId: string
  endpointUrl: string
  credentialRef: string
  adapterId: string
  probeKind?: 'ae_quote' | 'openapi_http' | 'mcp' | 'x402'
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
  resolveCredential: (credentialRef: string) => Promise<string | undefined>
  validateTarget: (url: URL) => Promise<boolean>
  send: (request: Request) => Promise<Response>
  now?: () => number
}>

export async function runCapabilityReadinessProbe(
  target: CapabilityProbeTarget,
  dependencies: CapabilityProbeDependencies,
): Promise<CapabilityProbeObservation> {
  const now = (dependencies.now ?? Date.now)()
  const credential = await dependencies.resolveCredential(target.credentialRef)
  if (credential === undefined || credential.trim() === '') {
    return unhealthy(now, 'unavailable', 'credential_unavailable', ['probe:credential_unavailable'])
  }
  let endpoint: URL
  let request: Request
  try {
    endpoint = new URL(target.endpointUrl)
    request = probeRequest(target, endpoint, credential)
  } catch {
    return unhealthy(now, 'ready', 'target_not_public', ['probe:credential_resolved', 'probe:target_not_public'])
  }
  if (!await dependencies.validateTarget(endpoint)) {
    return unhealthy(now, 'ready', 'target_not_public', ['probe:credential_resolved', 'probe:target_not_public'])
  }
  let response: Response
  try {
    response = await dependencies.send(request)
  } catch {
    return unhealthy(now, 'ready', 'transport_unreachable', [
      'probe:credential_resolved', 'probe:target_public', 'probe:transport_unreachable',
    ])
  }
  const baseEvidence = ['probe:credential_resolved', 'probe:target_public']
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
  if (target.probeKind === 'openapi_http') return healthy(now, baseEvidence, 'probe:http_2xx')
  if (!(response.headers.get('Content-Type') ?? '').toLowerCase().includes('application/json')) {
    return unhealthy(now, 'ready', 'response_content_type_invalid', [...baseEvidence, 'probe:response_content_type_invalid'])
  }
  const body = await response.text()
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
    return unhealthy(now, 'ready', 'response_too_large', [...baseEvidence, 'probe:response_too_large'])
  }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  if (target.adapterId === 'http-json:v1' && !quoteResponse.safeParse(parsed).success) {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  if ((target.probeKind === 'mcp' || target.adapterId === 'mcp-jsonrpc:v1') && !mcpToolsResponse.safeParse(parsed).success) {
    return unhealthy(now, 'ready', 'response_invalid', [...baseEvidence, 'probe:response_invalid'])
  }
  return healthy(now, baseEvidence, 'probe:http_2xx')
}

function probeRequest(target: CapabilityProbeTarget, endpoint: URL, credential: string): Request {
  const probeKind = target.probeKind ?? (target.adapterId === 'mcp-jsonrpc:v1' ? 'mcp' : 'ae_quote')
  const body = probeKind === 'mcp'
    ? { jsonrpc: '2.0', id: 'ae-readiness-probe', method: 'tools/list', params: {} }
    : {
        protocolVersion: 'ae-capability:v1', operation: 'quote',
        bindingId: target.bindingId, capabilityContractId: target.capabilityId,
      }
  return new Request(endpoint, {
    method: probeKind === 'openapi_http' || probeKind === 'x402' ? 'HEAD' : 'POST',
    redirect: 'manual', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(probeKind === 'openapi_http' || probeKind === 'x402' ? {} : { body: JSON.stringify(body) }),
  })
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
