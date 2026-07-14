import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { SANDBOX_PROVIDER_PROFILES } from '@/modules/sandbox-supply/public'

const MAX_BODY_BYTES = 64 * 1024
const SANDBOX_OFFER_EXPIRES_AT = Date.UTC(2035, 0, 1)
const scenarioValue = z.enum(['success', 'refusal', 'timeout', 'expired', 'duplicate'])
const preparationEgressBody = z.strictObject({
  protocol: z.literal('ae.preparation-egress:v1'),
  operationRef: z.string().min(1).max(500),
  contractRef: z.strictObject({
    capabilityId: z.string().min(1).max(500),
    version: z.number().int().positive(),
    contractDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  }),
  selectionKey: z.string().min(1).max(500),
  semanticDigest: z.string().min(1).max(500),
  facts: z.array(z.record(z.string(), z.unknown())).max(128),
})
const requestBody = z.looseObject({
  protocolVersion: z.literal('ae-capability:v1'),
  operation: z.enum(['quote', 'structured_quote', 'structured_quote_reconcile', 'execute', 'reconcile', 'cancel']),
  bindingId: z.string().min(1).max(200),
  capabilityContractId: z.string().min(1).max(200),
})

type SandboxProfile = (typeof SANDBOX_PROVIDER_PROFILES)[keyof typeof SANDBOX_PROVIDER_PROFILES]
type HandlerOptions = Readonly<{
  providerKey?: string
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}>

export async function handleSandboxCapabilityRequest(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const expectedKey = options.providerKey ?? process.env.AE_SANDBOX_PROVIDER_KEY?.trim()
  if (expectedKey === undefined || expectedKey.length === 0) return json({ kind: 'refused', reason: 'sandbox_provider_unconfigured' }, 503)
  if (request.headers.get('Authorization') !== `Bearer ${expectedKey}`) return json({ kind: 'refused', reason: 'authentication_required' }, 401)
  const url = new URL(request.url)
  const profile = SANDBOX_PROVIDER_PROFILES[url.searchParams.get('profile') as keyof typeof SANDBOX_PROVIDER_PROFILES]
  if (profile === undefined) return json({ kind: 'refused', reason: 'sandbox_profile_unknown' }, 404)
  const bindingVersion = url.searchParams.get('binding')
  if (bindingVersion !== null && bindingVersion !== 'v2' && bindingVersion !== 'v3') {
    return json({ kind: 'refused', reason: 'sandbox_binding_unknown' }, 404)
  }
  const scenarioResult = scenarioValue.safeParse(url.searchParams.get('scenario') ?? 'success')
  if (!scenarioResult.success) return json({ kind: 'refused', reason: 'sandbox_scenario_unknown' }, 400)
  const scenario = scenarioResult.data
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return json({ kind: 'refused', reason: 'request_too_large' }, 413)
  let parsedJson: unknown
  try { parsedJson = JSON.parse(body.text) } catch { return json({ kind: 'refused', reason: 'request_invalid' }, 400) }
  const preparationEgress = preparationEgressBody.safeParse(parsedJson)
  if (preparationEgress.success) {
    const bindingId = bindingVersion === 'v3'
      ? profile.v2BindingId
      : bindingVersion === 'v2' ? profile.priorV2BindingId : profile.legacyV2BindingId
    const offeringId = bindingVersion === 'v3' ? profile.offeringId : profile.priorOfferingId
    return providerOption(profile, offeringId, bindingId, preparationEgress.data)
  }
  const parsed = requestBody.safeParse(parsedJson)
  const registeredBindingIds: readonly string[] = [
    profile.bindingId, profile.legacyV2BindingId, profile.priorV2BindingId, profile.v2BindingId,
  ]
  if (!parsed.success || !registeredBindingIds.includes(parsed.data.bindingId)) {
    return json({ kind: 'refused', reason: 'request_invalid' }, 400)
  }
  if (scenario === 'refusal' && (parsed.data.operation === 'quote' || parsed.data.operation === 'structured_quote')) {
    return json({ kind: 'refused', reason: 'sandbox_deterministic_refusal' })
  }
  if (scenario === 'timeout' && parsed.data.operation === 'structured_quote') {
    await (options.wait ?? waitForDelay)(10_100, request.signal)
  }

  if (parsed.data.operation === 'quote') return json({
    kind: 'quoted', expectedCost: money(profile.amountMinor), maximumCost: money(profile.amountMinor),
    expectedLatencyMs: profile.latencyMs, dataFields: [], disclosures: [],
    providerQuoteRef: quoteRef(profile, parsed.data), providerQuoteExpiresAt: expiresAt(scenario),
  })
  if (parsed.data.operation === 'structured_quote' || parsed.data.operation === 'structured_quote_reconcile') {
    return structuredQuote(profile, parsed.data, scenario)
  }
  if (parsed.data.operation === 'execute') return json({
    kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects',
    providerReference: quoteRef(profile, parsed.data),
  })
  if (parsed.data.operation === 'reconcile') return json({ kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects' })
  return json({ kind: 'cancellation_rejected', reason: 'sandbox_provider_has_no_real_world_effect' })
}

function structuredQuote(profile: SandboxProfile, body: Record<string, unknown>, scenario: z.infer<typeof scenarioValue>): Response {
  const version = typeof body.capabilityContractVersion === 'string' ? body.capabilityContractVersion : undefined
  const registrationHash = typeof body.registrationHash === 'string' ? body.registrationHash : undefined
  const environment = typeof body.environment === 'string' ? body.environment : undefined
  if (version === undefined || registrationHash === undefined || environment === undefined) {
    return json({ kind: 'refused', reason: 'structured_quote_contract_incomplete' }, 400)
  }
  return json({
    kind: 'quoted', issuerBindingId: body.bindingId, issuerNodeId: profile.nodeId,
    capabilityContractId: body.capabilityContractId, capabilityContractVersion: version, registrationHash, environment,
    expectedCost: money(profile.amountMinor), maximumCost: money(profile.amountMinor), expectedLatencyMs: profile.latencyMs,
    dataFields: [], disclosures: [], providerQuoteRef: quoteRef(profile, body), providerQuoteExpiresAt: expiresAt(scenario),
    offerOutputs: [{ field: 'optionSummary', valueType: 'string', value: `${profile.label} — sandbox verification only` }],
    priceComponents: [{ label: 'Sandbox quoted amount', amountMinor: profile.amountMinor }],
    materialTerms: [{ key: 'sandbox', label: 'Supply status', value: 'Verification only; no real service or fulfilment.' }],
    cancellation: { kind: 'unsupported', summary: 'No cancellation is needed because this sandbox cannot create an effect.' },
  })
}

function providerOption(
  profile: SandboxProfile,
  offeringId: string,
  bindingId: string,
  body: z.infer<typeof preparationEgressBody>,
): Response {
  const assertedAt = Date.UTC(2026, 0, 1)
  const assertionRef = `sandbox-option:${canonicalDigest({
    operationRef: body.operationRef,
    contractRef: body.contractRef,
    bindingId,
  }).slice(7, 31)}`
  return json({
    format: 'ae.provider-option:v1',
    operationRef: body.operationRef,
    contractRef: body.contractRef,
    offeringId,
    bindingId,
    assertionRef,
    assertedAt,
    validUntil: SANDBOX_OFFER_EXPIRES_AT,
    output: { optionSummary: `${profile.label} — sandbox verification only` },
  })
}

function quoteRef(profile: SandboxProfile, body: Record<string, unknown>): string {
  return `sandbox-offer:${canonicalDigest({ bindingId: profile.bindingId, body: JSON.stringify(body) }).slice(7, 31)}`
}

function expiresAt(scenario: z.infer<typeof scenarioValue>): number {
  return scenario === 'expired' ? 1 : SANDBOX_OFFER_EXPIRES_AT
}

async function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds)
    const abort = () => { clearTimeout(timeout); reject(new DOMException('Sandbox timeout aborted.', 'AbortError')) }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

function money(amountMinor: number) { return { currency: 'AUD', amountMinor } }

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
