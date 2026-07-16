import { z } from 'zod'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  SANDBOX_PROVIDER_PROFILES,
  SANDBOX_ROUTE_PROVIDER_PROFILES,
  type SandboxRouteProviderProfileKey,
} from '@/modules/sandbox-supply/public'
import {
  SANDBOX_WORKFLOW_PROVIDER_PROFILES,
  type SandboxWorkflowProviderKey,
} from '@/modules/sandbox-supply/workflow-cohorts'

const MAX_BODY_BYTES = 64 * 1024
const SANDBOX_OFFER_EXPIRES_AT = Date.UTC(2035, 0, 1)
const UNKNOWN_ROUTE_REQUEST_PHRASE = 'leave the quote outcome unknown'
const UNKNOWN_ROUTE_REFERENCE_PREFIX = 'sandbox-service:unknown:'
const MALFORMED_EVIDENCE_REQUEST_PHRASE = 'leave the quote evidence malformed'
const MALFORMED_EVIDENCE_REFERENCE_PREFIX = 'sandbox-service:malformed-evidence:'
const PROVIDER_DENIAL_REQUEST_PHRASE = 'provider denial scenario'
const PROVIDER_DENIAL_REFERENCE_PREFIX = 'sandbox-service:provider-denial:'
const PARTIAL_RESULT_REQUEST_PHRASE = 'only a partial result is available'
const PARTIAL_RESULT_REFERENCE_PREFIX = 'sandbox-service:partial-result:'
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

export async function readSandboxRouteProviderDiscovery(
  routeKey: SandboxRouteProviderProfileKey,
  request: Request,
): Promise<Response> {
  const profile = SANDBOX_ROUTE_PROVIDER_PROFILES[routeKey]
  const endpoint = new URL(request.url)
  endpoint.search = ''
  endpoint.hash = ''
  return json({
    format: 'ae.sandbox-capability-provider:v1',
    supplyClass: 'labelled_sandbox',
    sandbox: true,
    business: { slug: profile.slug, name: profile.label },
    operation: {
      method: 'POST',
      endpoint: endpoint.href,
      authentication: { scheme: 'bearer' },
      maximumCost: money(profile.amountMinor),
      inputSchema: profile.contract.inputSchema,
      outputSchema: profile.contract.outputSchema,
    },
    boundaries: [
      'This endpoint returns deterministic sandbox evidence only.',
      'It does not prove real supply, booking, payment, dispatch, or fulfilment.',
    ],
  })
}

export async function handleSandboxRouteProviderRequest(
  routeKey: SandboxRouteProviderProfileKey,
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return json({ kind: 'refused', reason: 'request_too_large' }, 413)
  let parsedJson: unknown
  try { parsedJson = JSON.parse(body.text) } catch { return json({ kind: 'refused', reason: 'request_invalid' }, 400) }
  return await routeProviderResponse(routeKey, SANDBOX_ROUTE_PROVIDER_PROFILES[routeKey], parsedJson, request, options)
}

export async function readSandboxWorkflowProviderDiscovery(
  providerKey: string,
  request: Request,
): Promise<Response> {
  const profile = workflowProfile(providerKey)
  if (profile === undefined) return json({ kind: 'refused', reason: 'sandbox_profile_unknown' }, 404)
  const endpoint = new URL(request.url)
  endpoint.searchParams.set('provider', providerKey)
  endpoint.hash = ''
  return json({
    format: 'ae.sandbox-capability-provider:v1',
    supplyClass: 'labelled_sandbox',
    sandbox: true,
    business: { slug: profile.slug, name: profile.businessName },
    operation: {
      method: 'POST',
      endpoint: endpoint.href,
      authentication: { scheme: 'bearer' },
      maximumCost: money(profile.amountMinor),
      inputSchema: workflowObjectSchema(profile.inputField),
      outputSchema: workflowObjectSchema(profile.outputField),
    },
    boundaries: [
      'This endpoint returns deterministic sandbox workflow evidence only.',
      'It does not prove independent supply, booking, payment, dispatch, or fulfilment.',
    ],
  })
}

export async function handleSandboxWorkflowProviderRequest(
  providerKey: string,
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const profile = workflowProfile(providerKey)
  if (profile === undefined) return json({ kind: 'refused', reason: 'sandbox_profile_unknown' }, 404)
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return json({ kind: 'refused', reason: 'request_too_large' }, 413)
  let parsed: unknown
  try { parsed = JSON.parse(body.text) } catch { return json({ kind: 'refused', reason: 'request_invalid' }, 400) }
  const probe = requestBody.safeParse(parsed)
  if (probe.success && probe.data.operation === 'quote') {
    if (
      probe.data.bindingId !== profile.bindingId
      || probe.data.capabilityContractId !== `sandbox.workflow.${providerKey}`
    ) return json({ kind: 'refused', reason: 'request_invalid' }, 400)
    const quoteDigest = canonicalDigest({
      providerKey,
      bindingId: probe.data.bindingId,
      capabilityContractId: probe.data.capabilityContractId,
    }).slice(7, 31)
    return json({
      kind: 'quoted',
      expectedCost: money(profile.amountMinor),
      maximumCost: money(profile.amountMinor),
      expectedLatencyMs: 50,
      dataFields: [],
      disclosures: [],
      providerQuoteRef: `sandbox-workflow-quote:${providerKey}:${quoteDigest}`,
      providerQuoteExpiresAt: SANDBOX_OFFER_EXPIRES_AT,
    })
  }
  const input = exactStringField(parsed, profile.inputField)
  if (input === undefined) {
    return json({ kind: 'refused', reason: 'request_invalid' }, 400)
  }
  const digest = canonicalDigest({
    cohortId: profile.cohortId,
    providerKey,
    inputField: profile.inputField,
    input,
  }).slice(7, 31)
  return json(
    { [profile.outputField]: sandboxWorkflowOutput(providerKey, input, digest) },
    200,
    { 'Provider-Receipt': `sandbox-workflow:${providerKey}:${digest}` },
  )
}

function sandboxWorkflowOutput(providerKey: string, input: string, digest: string): string {
  const prefix = `sandbox-${providerKey}:${digest}`
  const boundedInput = input.replace(/\s+/gu, ' ').trim().slice(0, 600)
  if (providerKey === 'trip-constraints') {
    return `${prefix}: Trip brief preserves the stated dates, budget, accessibility, mobility, weather, and availability constraints. Customer request: ${boundedInput}`
  }
  if (providerKey === 'itinerary-builder') {
    return `${prefix}: Four-day Perth itinerary draft with one accessible activity per day and a weather fallback for every weather-sensitive day. Estimated activities remain planning estimates. Trip brief: ${boundedInput}`
  }
  if (providerKey === 'itinerary-readiness') {
    return `${prefix}: Readiness checklist: activity availability remains unknown until confirmed; recheck mobility requirements before choosing each activity; verify weather and use the documented fallback where needed. No reservation, ticket, or payment has occurred. Draft reviewed: ${boundedInput}`
  }
  if (providerKey === 'journey-case') {
    return `${prefix}: Resumable service case records the requested office move, overdue milestones, current ownership, ownership changes, blockers, and the last confirmed update. Customer request: ${boundedInput}`
  }
  if (providerKey === 'milestone-plan') {
    return `${prefix}: Milestone plan marks overdue or blocked work explicitly and assigns who owes the next update for each unresolved milestone. Service case: ${boundedInput}`
  }
  if (providerKey === 'progress-synthesis') {
    return `${prefix}: Resumable progress summary preserves completed, blocked, overdue, and ownership-changed milestones plus the next update owner. No physical move, dispatch, or third-party task has occurred. Milestone plan: ${boundedInput}`
  }
  return `${prefix}:${boundedInput}`
}

export async function handleSandboxCapabilityRequest(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const url = new URL(request.url)
  const routeKey = url.searchParams.get('route') as SandboxRouteProviderProfileKey | null
  const routeProfile = routeKey === null ? undefined : SANDBOX_ROUTE_PROVIDER_PROFILES[routeKey]
  const profile = SANDBOX_PROVIDER_PROFILES[url.searchParams.get('profile') as keyof typeof SANDBOX_PROVIDER_PROFILES]
  if (profile === undefined && routeProfile === undefined) return json({ kind: 'refused', reason: 'sandbox_profile_unknown' }, 404)
  const bindingVersion = url.searchParams.get('binding')
  if (bindingVersion !== null && bindingVersion !== 'v2' && bindingVersion !== 'v3' && bindingVersion !== 'v4') {
    return json({ kind: 'refused', reason: 'sandbox_binding_unknown' }, 404)
  }
  const scenarioResult = scenarioValue.safeParse(url.searchParams.get('scenario') ?? 'success')
  if (!scenarioResult.success) return json({ kind: 'refused', reason: 'sandbox_scenario_unknown' }, 400)
  const scenario = scenarioResult.data
  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) return json({ kind: 'refused', reason: 'request_too_large' }, 413)
  let parsedJson: unknown
  try { parsedJson = JSON.parse(body.text) } catch { return json({ kind: 'refused', reason: 'request_invalid' }, 400) }
  if (routeKey !== null && routeProfile !== undefined) return routeProviderResponse(routeKey, routeProfile, parsedJson)
  if (profile === undefined) return json({ kind: 'refused', reason: 'sandbox_profile_unknown' }, 404)
  const preparationEgress = preparationEgressBody.safeParse(parsedJson)
  if (preparationEgress.success) {
    const bindingId = bindingVersion === 'v4'
      ? profile.v3BindingId
      : bindingVersion === 'v3' ? profile.v2BindingId
      : bindingVersion === 'v2' ? profile.priorV2BindingId : profile.legacyV2BindingId
    const offeringId = bindingVersion === 'v4'
      ? profile.offeringId
      : bindingVersion === 'v3' ? profile.priorV2OfferingId : profile.priorOfferingId
    return providerOption(profile, offeringId, bindingId, preparationEgress.data)
  }
  const parsed = requestBody.safeParse(parsedJson)
  const registeredBindingIds: readonly string[] = [
    profile.bindingId, profile.legacyV2BindingId, profile.priorV2BindingId, profile.v2BindingId, profile.v3BindingId,
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

function authenticateSandboxProvider(request: Request, options: HandlerOptions): Response | undefined {
  const expectedKey = options.providerKey ?? process.env.AE_SANDBOX_PROVIDER_KEY?.trim()
  if (expectedKey === undefined || expectedKey.length === 0) {
    return json({ kind: 'refused', reason: 'sandbox_provider_unconfigured' }, 503)
  }
  if (request.headers.get('Authorization') !== `Bearer ${expectedKey}`) {
    return json({ kind: 'refused', reason: 'authentication_required' }, 401)
  }
  return undefined
}

async function routeProviderResponse(
  routeKey: SandboxRouteProviderProfileKey,
  profile: (typeof SANDBOX_ROUTE_PROVIDER_PROFILES)[SandboxRouteProviderProfileKey],
  input: unknown,
  request?: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const probe = requestBody.safeParse(input)
  if (probe.success && probe.data.operation === 'quote') return json({
    kind: 'quoted', expectedCost: money(profile.amountMinor), maximumCost: money(profile.amountMinor),
    expectedLatencyMs: 50, dataFields: [], disclosures: [],
    providerQuoteRef: `sandbox-route-quote:${routeKey}`, providerQuoteExpiresAt: SANDBOX_OFFER_EXPIRES_AT,
  })
  if (routeKey === 'resolver') {
    const parsed = z.strictObject({ request: z.string().min(1) }).safeParse(input)
    if (!parsed.success) return json({ kind: 'refused', reason: 'request_invalid' }, 400)
    const normalizedRequest = parsed.data.request.toLowerCase()
    const prefix = normalizedRequest.includes(UNKNOWN_ROUTE_REQUEST_PHRASE)
      ? UNKNOWN_ROUTE_REFERENCE_PREFIX
      : normalizedRequest.includes(MALFORMED_EVIDENCE_REQUEST_PHRASE)
        ? MALFORMED_EVIDENCE_REFERENCE_PREFIX
        : normalizedRequest.includes(PROVIDER_DENIAL_REQUEST_PHRASE)
          ? PROVIDER_DENIAL_REFERENCE_PREFIX
          : normalizedRequest.includes(PARTIAL_RESULT_REQUEST_PHRASE)
            ? PARTIAL_RESULT_REFERENCE_PREFIX
            : 'sandbox-service:'
    const serviceReference = `${prefix}${canonicalDigest(parsed.data).slice(7, 31)}`
    return json({ serviceReference }, 200, { 'Provider-Receipt': `sandbox-resolver:${serviceReference}` })
  }
  const parsed = z.strictObject({ serviceReference: z.string().min(1) }).safeParse(input)
  if (!parsed.success) return json({ kind: 'refused', reason: 'request_invalid' }, 400)
  if (parsed.data.serviceReference.startsWith(UNKNOWN_ROUTE_REFERENCE_PREFIX)) {
    await (options.wait ?? waitForDelay)(10_100, request?.signal ?? new AbortController().signal)
  }
  if (parsed.data.serviceReference.startsWith(MALFORMED_EVIDENCE_REFERENCE_PREFIX)) {
    return json({ malformedSandboxEvidence: true })
  }
  if (parsed.data.serviceReference.startsWith(PROVIDER_DENIAL_REFERENCE_PREFIX)) {
    const denialRef = `sandbox-quoter-denial:${canonicalDigest(parsed.data).slice(7, 31)}`
    return json(
      { kind: 'refused', reason: 'sandbox_provider_declined' },
      409,
      { 'Provider-Receipt': denialRef },
    )
  }
  if (parsed.data.serviceReference.startsWith(PARTIAL_RESULT_REFERENCE_PREFIX)) {
    const digest = canonicalDigest(parsed.data).slice(7, 31)
    return json(
      { quoteReference: `sandbox-partial-quote:${digest}` },
      200,
      {
        'Provider-Receipt': `sandbox-quoter-partial:${digest}`,
        'Continuation-Token': `sandbox-continuation:${digest}`,
      },
    )
  }
  const quoteReference = `sandbox-quote:${canonicalDigest(parsed.data).slice(7, 31)}`
  return json({ quoteReference }, 200, { 'Provider-Receipt': `sandbox-quoter:${quoteReference}` })
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

function workflowProfile(providerKey: string) {
  return SANDBOX_WORKFLOW_PROVIDER_PROFILES[providerKey as SandboxWorkflowProviderKey]
}

function workflowObjectSchema(field: string) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { [field]: { type: 'string', minLength: 1 } },
    required: [field],
    additionalProperties: false,
  }
}

function exactStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
  const entry = entries[0]
  return entries.length === 1 && entry?.[0] === field
    && typeof entry[1] === 'string' && entry[1].length > 0
    ? entry[1]
    : undefined
}

function json(body: unknown, status = 200, headers: Readonly<Record<string, string>> = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}
