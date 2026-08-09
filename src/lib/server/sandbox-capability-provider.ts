import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { z } from 'zod'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { constantTimeStringEqual } from '@/lib/server/constant-time'
import { problem } from '@/lib/server/problem'
import { response as json } from '@/lib/server/no-store-response'
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
const WORKFLOW_PROVIDER_DENIAL_MARKER = '[sandbox-scenario:provider_denied]'
const PARTIAL_RESULT_REQUEST_PHRASE = 'only a partial result is available'
const PARTIAL_RESULT_REFERENCE_PREFIX = 'sandbox-service:partial-result:'
const CANCEL_AFTER_CURRENT_REQUEST_PHRASE = 'pause the first step for cancellation'
const ACCEPT_PROVIDER_CANCELLATION_PHRASE = 'accept the provider cancellation'
const REJECT_PROVIDER_CANCELLATION_PHRASE = 'reject the provider cancellation'
const UNKNOWN_PROVIDER_CANCELLATION_PHRASE = 'leave the provider cancellation unknown'
const MAX_OBSERVED_SANDBOX_OPERATIONS = 256
const observedSandboxCancellationOutcomes = new Map<string, 'accepted' | 'rejected' | 'unknown'>()
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
const cancellationBody = z.strictObject({
  cancellationRequestRef: z.string().min(1).max(500),
  attemptRef: z.string().min(1).max(500),
  operationKeyDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
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
  const endpoint = providerDiscoveryEndpoint(request)
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
      maximumCost: profile.amount,
      inputSchema: profile.contract.inputSchema,
      outputSchema: profile.contract.outputSchema,
    },
    boundaries: [
      'This endpoint returns deterministic sandbox evidence only.',
      'It does not prove real supply, booking, payment, dispatch, or fulfilment.',
    ],
  }, 200)
}

export async function handleSandboxRouteProviderRequest(
  routeKey: SandboxRouteProviderProfileKey,
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const body = await readBoundedRequestJson(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return body.code === 'payload_too_large'
      ? problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large', detail: 'request_too_large' })
      : problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  }
  return await routeProviderResponse(routeKey, SANDBOX_ROUTE_PROVIDER_PROFILES[routeKey], body.value, request, options)
}

export async function readSandboxWorkflowProviderDiscovery(
  providerKey: string,
  request: Request,
): Promise<Response> {
  const profile = workflowProfile(providerKey)
  if (profile === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'sandbox_profile_unknown', detail: 'sandbox_profile_unknown' })
  const endpoint = providerDiscoveryEndpoint(request)
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
      maximumCost: profile.amount,
      inputSchema: workflowObjectSchema(
        profile.inputField,
        profile.decisionInputs,
        profile.optionalInputs?.map(({ field }) => field),
      ),
      outputSchema: workflowObjectSchema(profile.outputField),
    },
    boundaries: [
      'This endpoint returns deterministic sandbox workflow evidence only.',
      'It does not prove independent supply, booking, payment, dispatch, or fulfilment.',
    ],
  }, 200)
}

export async function handleSandboxWorkflowProviderRequest(
  providerKey: string,
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const profile = workflowProfile(providerKey)
  if (profile === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'sandbox_profile_unknown', detail: 'sandbox_profile_unknown' })
  const body = await readBoundedRequestJson(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return body.code === 'payload_too_large'
      ? problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large', detail: 'request_too_large' })
      : problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  }
  const probe = requestBody.safeParse(body.value)
  if (probe.success && probe.data.operation === 'quote') {
    if (
      probe.data.bindingId !== profile.bindingId
      || probe.data.capabilityContractId !== `sandbox.workflow.${providerKey}`
    ) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
    const quoteDigest = canonicalDigest({
      providerKey,
      bindingId: probe.data.bindingId,
      capabilityContractId: probe.data.capabilityContractId,
    }).slice(7, 31)
    return json({
      kind: 'quoted',
      expectedCost: profile.amount,
      maximumCost: profile.amount,
      expectedLatencyMs: 50,
      dataFields: [],
      disclosures: [],
      providerQuoteRef: `sandbox-workflow-quote:${providerKey}:${quoteDigest}`,
      providerQuoteExpiresAt: SANDBOX_OFFER_EXPIRES_AT,
    }, 200)
  }
  const input = exactWorkflowInput(
    body.value,
    profile.inputField,
    profile.decisionInputs ?? [],
    profile.optionalInputs?.map(({ field }) => field) ?? [],
  )
  if (input === undefined) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  }
  const digest = canonicalDigest({
    cohortId: profile.cohortId,
    providerKey,
    inputField: profile.inputField,
    input,
  }).slice(7, 31)
  const providerDenialScenario = hasWorkflowProviderDenialScenario(input)
  const eventFailure = eventWorkflowFailure(providerKey, input)
  if (eventFailure !== undefined) {
    return problem(
      { status: 409, kind: 'ALREADY_EXISTS', code: eventFailure, detail: eventFailure },
      { 'Provider-Receipt': `sandbox-workflow-refusal:${providerKey}:${digest}` },
    )
  }
  if (
    profile.completionEvidence
    && providerDenialScenario
  ) {
    return problem(
      { status: 409, kind: 'ALREADY_EXISTS', code: 'sandbox_provider_declined', detail: 'sandbox_provider_declined' },
      { 'Provider-Receipt': `sandbox-workflow-denial:${providerKey}:${digest}` },
    )
  }
  return json(
    {
      [profile.outputField]: sandboxWorkflowOutput(
        providerKey,
        input,
        digest,
        providerDenialScenario,
      ),
    },
    200,
    { 'Provider-Receipt': `sandbox-workflow:${providerKey}:${digest}` },
  )
}

function sandboxWorkflowOutput(
  providerKey: string,
  inputRecord: Readonly<Record<string, string>>,
  digest: string,
  providerDenialScenario: boolean,
): string {
  const prefix = `sandbox-${providerKey}:${digest}`
  const scenarioMarker = providerDenialScenario ? `${WORKFLOW_PROVIDER_DENIAL_MARKER} ` : ''
  const input = workflowInputSummary(inputRecord)
  const boundedInput = input.replace(/\s+/gu, ' ').trim().slice(0, 600)
  const eventOutput = sandboxEventWorkflowOutput(providerKey, inputRecord, digest)
  if (eventOutput !== undefined) return eventOutput
  if (providerKey === 'trip-constraints') {
    return `${prefix}: ${scenarioMarker}Trip brief preserves the stated dates, budget, accessibility, mobility, weather, and availability constraints. Customer request: ${boundedInput}`
  }
  if (providerKey === 'itinerary-builder') {
    return `${prefix}: ${scenarioMarker}Four-day Perth itinerary draft with one accessible activity per day and a weather fallback for every weather-sensitive day. Estimated activities remain planning estimates. Trip brief: ${boundedInput}`
  }
  if (providerKey === 'itinerary-readiness') {
    return `${prefix}: ${scenarioMarker}Readiness checklist: activity availability remains unknown until confirmed; recheck mobility requirements before choosing each activity; verify weather and use the documented fallback where needed. No reservation, ticket, or payment has occurred. Draft reviewed: ${boundedInput}`
  }
  if (providerKey === 'journey-case') {
    return `${prefix}: ${scenarioMarker}Resumable service case records the requested office move, overdue milestones, current ownership, ownership changes, blockers, and the last confirmed update. Customer request: ${boundedInput}`
  }
  if (providerKey === 'milestone-plan') {
    return `${prefix}: ${scenarioMarker}Milestone plan marks overdue or blocked work explicitly and assigns who owes the next update for each unresolved milestone. Service case: ${boundedInput}`
  }
  if (providerKey === 'progress-synthesis') {
    return `${prefix}: ${scenarioMarker}Resumable progress summary preserves completed, blocked, overdue, and ownership-changed milestones plus the next update owner. No physical move, dispatch, or third-party task has occurred. Milestone plan: ${boundedInput}`
  }
  return `${prefix}:${scenarioMarker}${boundedInput}`
}

function sandboxEventWorkflowOutput(
  providerKey: string,
  parsedInput: Readonly<Record<string, string>>,
  digest: string,
): string | undefined {
  const upstream = parseEvidencePacket(parsedInput.requirementsPacket ?? parsedInput.siteEvidencePacket)
  if (providerKey === 'event-requirements') {
    const responseDeadline = extractEventResponseDeadline(parsedInput.eventProfile)
    return JSON.stringify({
      format: 'ae.synthetic-event-requirements:v1',
      packetRef: `synthetic-requirements:${digest}`,
      version: 1,
      checkedAt: '2026-07-19T00:00:00.000Z',
      reviewTrigger: 'Recheck when the site, activities, operating window, attendance, or official source changes.',
      sources: [
        { sourceRef: 'synthetic-source:local-authority-event-guidance', status: 'synthetic', checkedAt: '2026-07-19T00:00:00.000Z' },
        { sourceRef: 'synthetic-source:site-owner-conditions', status: 'unknown', checkedAt: null },
      ],
      requirements: [
        { item: 'Confirm site-owner permission', kind: 'unknown', nextOwner: 'fictional site owner' },
        { item: 'Confirm food-business obligations for declared hot-food stalls', kind: 'requires_authority_confirmation', nextOwner: 'fictional local authority' },
      ],
      suppliedFacts: parsedInput,
      disclosureAuthority: parsedInput.eventProfile,
      responseDeadline,
      unresolved: ['Site permission is unknown', 'No authority approval has been sought'],
      effects: [],
      boundary: 'Synthetic preparation only; not approval, permission, certification, booking, or fulfilment.',
    })
  }
  if (providerKey === 'event-site-evidence' && upstream !== undefined) {
    return JSON.stringify({
      format: 'ae.synthetic-event-site-evidence:v1',
      packetRef: `synthetic-site-evidence:${digest}`,
      version: 1,
      upstream: { packetRef: upstream.packetRef, version: upstream.version },
      disclosureAuthority: upstream.disclosureAuthority,
      responseDeadline: upstream.responseDeadline,
      checkedAt: '2026-07-19T00:00:00.000Z',
      responsibilityRows: [
        { item: 'Site plan', status: 'missing', nextOwner: 'fictional coordinator' },
        { item: 'Emergency and egress review', status: 'professional_judgement_required', nextOwner: 'fictional qualified adviser' },
        { item: 'Food-stall evidence', status: 'needs_confirmation', nextOwner: 'fictional stallholders' },
      ],
      invalidatesWhen: ['upstream packet reference or version changes', 'site or declared activities change'],
      operatorInterventions: [],
      effects: [],
      boundary: 'Synthetic checklist only; it does not certify safety or physical readiness.',
    })
  }
  if (providerKey === 'event-business-readiness' && upstream !== undefined) {
    return JSON.stringify({
      format: 'ae.synthetic-event-business-readiness:v1',
      packetRef: `synthetic-business-readiness:${digest}`,
      version: 1,
      upstream: { packetRef: upstream.packetRef, version: upstream.version },
      disclosureAuthority: upstream.disclosureAuthority,
      checkedAt: '2026-07-19T00:00:00.000Z',
      expiresAt: upstream.responseDeadline,
      responses: [
        { businessRole: 'packaged-food stall', state: 'can_respond', conditions: ['subject to site-owner and authority confirmation'], checkedAt: '2026-07-19T00:00:00.000Z', expiresAt: upstream.responseDeadline, evidence: ['synthetic:evidence:food-registration'], nextOwner: 'fictional stallholder' },
        { businessRole: 'hot-food stall', state: 'needs_confirmation', conditions: ['food obligations unresolved'], checkedAt: '2026-07-19T00:00:00.000Z', expiresAt: upstream.responseDeadline, evidence: [], nextOwner: 'fictional stallholder' },
        { businessRole: 'acoustic musician', state: 'no_response', conditions: [], checkedAt: '2026-07-19T00:00:00.000Z', expiresAt: upstream.responseDeadline, evidence: [], nextOwner: 'fictional coordinator' },
        { businessRole: 'temporary-structure supplier', state: 'declined', conditions: ['site plan unavailable'], checkedAt: '2026-07-19T00:00:00.000Z', expiresAt: upstream.responseDeadline, evidence: [], nextOwner: 'fictional coordinator' },
      ],
      operatorInterventions: [],
      unresolved: ['Availability is unknown', 'No booking or quote acceptance has occurred'],
      effects: [],
      boundary: 'Synthetic responses only; not independent supply, availability, booking, commitment, or fulfilment.',
    })
  }
  return undefined
}

function eventWorkflowFailure(
  providerKey: string,
  input: Readonly<Record<string, string>>,
): string | undefined {
  if (!providerKey.startsWith('event-')) return undefined
  const upstream = parseEvidencePacket(input.requirementsPacket ?? input.siteEvidencePacket)
  if (providerKey !== 'event-requirements' && upstream === undefined) return 'synthetic_upstream_packet_invalid'
  if (Object.values(input).some((value) => value.includes('[synthetic-scenario:stale_upstream]'))) {
    return 'synthetic_upstream_packet_stale'
  }
  if (providerKey === 'event-business-readiness'
    && (upstream?.disclosureAuthority?.includes('authorized:') !== true
      || upstream.responseDeadline === undefined)) {
    return 'synthetic_disclosure_authority_missing'
  }
  return undefined
}

function parseEvidencePacket(value: string | undefined): {
  packetRef: string
  version: number
  disclosureAuthority?: string
  responseDeadline?: string
} | undefined {
  if (value === undefined) return undefined
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return typeof parsed.packetRef === 'string' && typeof parsed.version === 'number'
      ? {
          packetRef: parsed.packetRef,
          version: parsed.version,
          ...(typeof parsed.disclosureAuthority === 'string'
            ? { disclosureAuthority: parsed.disclosureAuthority } : {}),
          ...(typeof parsed.responseDeadline === 'string'
            ? { responseDeadline: parsed.responseDeadline } : {}),
        }
      : undefined
  } catch {
    return undefined
  }
}

function extractEventResponseDeadline(eventProfile: string | undefined): string | undefined {
  return /response deadline (\d{4}-\d{2}-\d{2})/iu.exec(eventProfile ?? '')?.[1]
}

function hasWorkflowProviderDenialScenario(input: Readonly<Record<string, string>>): boolean {
  return Object.values(input).some((value) => {
    const normalized = value.toLowerCase()
    return normalized.includes(PROVIDER_DENIAL_REQUEST_PHRASE)
      || normalized.includes(WORKFLOW_PROVIDER_DENIAL_MARKER)
  })
}

export async function handleSandboxCapabilityRequest(request: Request, options: HandlerOptions = {}): Promise<Response> {
  const authenticationFailure = authenticateSandboxProvider(request, options)
  if (authenticationFailure !== undefined) return authenticationFailure
  const url = new URL(request.url)
  const routeKey = url.searchParams.get('route') as SandboxRouteProviderProfileKey | null
  const routeProfile = routeKey === null ? undefined : SANDBOX_ROUTE_PROVIDER_PROFILES[routeKey]
  const profile = SANDBOX_PROVIDER_PROFILES[url.searchParams.get('profile') as keyof typeof SANDBOX_PROVIDER_PROFILES]
  if (profile === undefined && routeProfile === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'sandbox_profile_unknown', detail: 'sandbox_profile_unknown' })
  const bindingVersion = url.searchParams.get('binding')
  if (bindingVersion !== null && bindingVersion !== 'v2' && bindingVersion !== 'v3' && bindingVersion !== 'v4' && bindingVersion !== 'v5') {
    return problem({ status: 404, kind: 'NOT_FOUND', code: 'sandbox_binding_unknown', detail: 'sandbox_binding_unknown' })
  }
  const scenarioResult = scenarioValue.safeParse(url.searchParams.get('scenario') ?? 'success')
  if (!scenarioResult.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'sandbox_scenario_unknown', detail: 'sandbox_scenario_unknown' })
  const scenario = scenarioResult.data
  const body = await readBoundedRequestJson(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return body.code === 'payload_too_large'
      ? problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: 'request_too_large', detail: 'request_too_large' })
      : problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  }
  const parsedJson = body.value
  if (routeKey !== null && routeProfile !== undefined) return routeProviderResponse(routeKey, routeProfile, parsedJson)
  if (profile === undefined) return problem({ status: 404, kind: 'NOT_FOUND', code: 'sandbox_profile_unknown', detail: 'sandbox_profile_unknown' })
  const preparationEgress = preparationEgressBody.safeParse(parsedJson)
  if (preparationEgress.success) {
    const bindingId = bindingVersion === 'v5'
      ? profile.v4BindingId
      : bindingVersion === 'v4'
        ? profile.priorV3BindingId
        : bindingVersion === 'v3' ? profile.v2BindingId
          : bindingVersion === 'v2' ? profile.priorV2BindingId : profile.legacyV2BindingId
    const offeringId = bindingVersion === 'v5'
      ? profile.offeringId
      : bindingVersion === 'v4'
        ? profile.priorV3OfferingId
        : bindingVersion === 'v3' ? profile.priorV2OfferingId : profile.priorOfferingId
    return providerOption(profile, offeringId, bindingId, preparationEgress.data)
  }
  const parsed = requestBody.safeParse(parsedJson)
  const registeredBindingIds: readonly string[] = [
    profile.bindingId, profile.legacyV2BindingId, profile.priorV2BindingId, profile.v2BindingId,
    profile.priorV3BindingId, profile.v4BindingId,
  ]
  if (!parsed.success || !registeredBindingIds.includes(parsed.data.bindingId)) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  }
  if (scenario === 'refusal' && (parsed.data.operation === 'quote' || parsed.data.operation === 'structured_quote')) {
    return json({ kind: 'refused', reason: 'sandbox_deterministic_refusal' }, 200)
  }
  if (scenario === 'timeout' && parsed.data.operation === 'structured_quote') {
    await (options.wait ?? waitForDelay)(10_100, request.signal)
  }

  if (parsed.data.operation === 'quote') return json({
    kind: 'quoted', expectedCost: profile.amount, maximumCost: profile.amount,
    expectedLatencyMs: profile.latencyMs, dataFields: [], disclosures: [],
    providerQuoteRef: quoteRef(profile, parsed.data), providerQuoteExpiresAt: expiresAt(scenario),
  }, 200)
  if (parsed.data.operation === 'structured_quote' || parsed.data.operation === 'structured_quote_reconcile') {
    return structuredQuote(profile, parsed.data, scenario)
  }
  if (parsed.data.operation === 'execute') return json({
    kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects',
    providerReference: quoteRef(profile, parsed.data),
  }, 200)
  if (parsed.data.operation === 'reconcile') return json({ kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects' }, 200)
  return json({ kind: 'cancellation_rejected', reason: 'sandbox_provider_has_no_real_world_effect' }, 200)
}

function authenticateSandboxProvider(request: Request, options: HandlerOptions): Response | undefined {
  const expectedKey = options.providerKey ?? process.env.AE_SANDBOX_PROVIDER_KEY?.trim()
  if (expectedKey === undefined || expectedKey.length === 0) {
    return problem({ status: 503, kind: 'UNAVAILABLE', code: 'sandbox_provider_unconfigured', detail: 'sandbox_provider_unconfigured' })
  }
  const presented = request.headers.get('Authorization')
  if (presented === null || !constantTimeStringEqual(presented, `Bearer ${expectedKey}`)) {
    return problem(
      { status: 401, kind: 'UNAUTHENTICATED', code: 'authentication_required', detail: 'authentication_required' },
      { 'WWW-Authenticate': 'Bearer', Vary: 'Authorization' },
    )
  }
  return undefined
}

function providerDiscoveryEndpoint(request: Request): URL {
  const endpoint = new URL(request.url)
  const forwardedProtocol = request.headers.get('X-Forwarded-Proto')?.split(',', 1)[0]?.trim()
  if (forwardedProtocol === 'https') endpoint.protocol = 'https:'
  return endpoint
}

async function routeProviderResponse(
  routeKey: SandboxRouteProviderProfileKey,
  profile: (typeof SANDBOX_ROUTE_PROVIDER_PROFILES)[SandboxRouteProviderProfileKey],
  input: unknown,
  request?: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  if (routeKey === 'resolver') {
    const cancellation = cancellationBody.safeParse(input)
    if (cancellation.success) return sandboxCancellationResponse(cancellation.data)
  }
  const probe = requestBody.safeParse(input)
  if (probe.success && probe.data.operation === 'quote') return json({
    kind: 'quoted', expectedCost: profile.amount, maximumCost: profile.amount,
    expectedLatencyMs: 50, dataFields: [], disclosures: [],
    providerQuoteRef: `sandbox-route-quote:${routeKey}`, providerQuoteExpiresAt: SANDBOX_OFFER_EXPIRES_AT,
  }, 200)
  if (routeKey === 'resolver') {
    const parsed = z.strictObject({ request: z.string().min(1) }).safeParse(input)
    if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
    const normalizedRequest = parsed.data.request.toLowerCase()
    rememberSandboxCancellationOutcome(
      request?.headers.get('Idempotency-Key'),
      sandboxCancellationOutcome(normalizedRequest),
    )
    if (normalizedRequest.includes(CANCEL_AFTER_CURRENT_REQUEST_PHRASE)) {
      await (options.wait ?? waitForDelay)(2_000, request?.signal ?? new AbortController().signal)
    }
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
  if (!parsed.success) return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'request_invalid', detail: 'request_invalid' })
  if (parsed.data.serviceReference.startsWith(UNKNOWN_ROUTE_REFERENCE_PREFIX)) {
    await (options.wait ?? waitForDelay)(10_100, request?.signal ?? new AbortController().signal)
  }
  if (parsed.data.serviceReference.startsWith(MALFORMED_EVIDENCE_REFERENCE_PREFIX)) {
    return json({ malformedSandboxEvidence: true }, 200)
  }
  if (parsed.data.serviceReference.startsWith(PROVIDER_DENIAL_REFERENCE_PREFIX)) {
    const denialRef = `sandbox-quoter-denial:${canonicalDigest(parsed.data).slice(7, 31)}`
    return problem(
      { status: 409, kind: 'ALREADY_EXISTS', code: 'sandbox_provider_declined', detail: 'sandbox_provider_declined' },
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

function sandboxCancellationOutcome(request: string): 'accepted' | 'rejected' | 'unknown' {
  if (request.includes(REJECT_PROVIDER_CANCELLATION_PHRASE)) return 'rejected'
  if (request.includes(UNKNOWN_PROVIDER_CANCELLATION_PHRASE)) return 'unknown'
  if (request.includes(ACCEPT_PROVIDER_CANCELLATION_PHRASE)) return 'accepted'
  return 'accepted'
}

function rememberSandboxCancellationOutcome(
  operationKeyDigest: string | null | undefined,
  outcome: 'accepted' | 'rejected' | 'unknown',
): void {
  if (operationKeyDigest === undefined || operationKeyDigest === null
    || !/^sha256:[0-9a-f]{64}$/u.test(operationKeyDigest)) return
  if (!observedSandboxCancellationOutcomes.has(operationKeyDigest)
    && observedSandboxCancellationOutcomes.size >= MAX_OBSERVED_SANDBOX_OPERATIONS) {
    const oldest = observedSandboxCancellationOutcomes.keys().next().value
    if (typeof oldest === 'string') observedSandboxCancellationOutcomes.delete(oldest)
  }
  observedSandboxCancellationOutcomes.set(operationKeyDigest, outcome)
}

function sandboxCancellationResponse(input: z.infer<typeof cancellationBody>): Response {
  const outcome = observedSandboxCancellationOutcomes.get(input.operationKeyDigest)
  if (outcome === undefined) {
    return problem({
      status: 409,
      kind: 'ALREADY_EXISTS',
      code: 'sandbox_operation_not_observed',
      detail: 'sandbox_operation_not_observed',
    })
  }
  const providerReference = `sandbox-cancellation:${outcome}:${canonicalDigest(input).slice(7, 31)}`
  if (outcome === 'accepted') {
    return json({ kind: 'cancellation_accepted', providerReference }, 200)
  }
  if (outcome === 'rejected') {
    return json({
      kind: 'cancellation_rejected',
      reason: 'sandbox_provider_kept_current_work',
      providerReference,
    }, 200)
  }
  return json({ kind: 'cancellation_unknown' }, 200)
}

function structuredQuote(profile: SandboxProfile, body: Record<string, unknown>, scenario: z.infer<typeof scenarioValue>): Response {
  const version = typeof body.capabilityContractVersion === 'string' ? body.capabilityContractVersion : undefined
  const registrationHash = typeof body.registrationHash === 'string' ? body.registrationHash : undefined
  const environment = typeof body.environment === 'string' ? body.environment : undefined
  if (version === undefined || registrationHash === undefined || environment === undefined) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'structured_quote_contract_incomplete', detail: 'structured_quote_contract_incomplete' })
  }
  return json({
    kind: 'quoted', issuerBindingId: body.bindingId, issuerNodeId: profile.nodeId,
    capabilityContractId: body.capabilityContractId, capabilityContractVersion: version, registrationHash, environment,
    expectedCost: profile.amount, maximumCost: profile.amount, expectedLatencyMs: profile.latencyMs,
    dataFields: [], disclosures: [], providerQuoteRef: quoteRef(profile, body), providerQuoteExpiresAt: expiresAt(scenario),
    offerOutputs: [{ field: 'optionSummary', valueType: 'string', value: `${profile.label} — sandbox verification only` }],
    priceComponents: [{ label: 'Sandbox quoted amount', amount: profile.amount }],
    materialTerms: [{ key: 'sandbox', label: 'Supply status', value: 'Verification only; no real service or fulfilment.' }],
    cancellation: { kind: 'unsupported', summary: 'No cancellation is needed because this sandbox cannot create an effect.' },
  }, 200)
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
  }, 200)
}

function quoteRef(profile: SandboxProfile, body: Record<string, unknown>): string {
  return `sandbox-offer:${canonicalDigest({ bindingId: profile.bindingId, body: JSON.stringify(body) }).slice(7, 31)}`
}

function expiresAt(scenario: z.infer<typeof scenarioValue>): number {
  return scenario === 'expired' ? 1 : SANDBOX_OFFER_EXPIRES_AT
}

function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}


function workflowProfile(providerKey: string) {
  return SANDBOX_WORKFLOW_PROVIDER_PROFILES[providerKey as SandboxWorkflowProviderKey]
}

function workflowInputSchema(
  field: string,
  requiredInputs: readonly Readonly<{ field: string; pattern: string }>[] = [],
  optionalFields: readonly string[] = [],
) {
  const shape: Record<string, z.ZodType> = {
    [field]: z.string().min(1),
  }
  for (const { field: requiredField, pattern } of requiredInputs) {
    shape[requiredField] = z.string().regex(new RegExp(pattern, 'u'))
  }
  for (const optionalField of optionalFields) {
    shape[optionalField] = z.string().min(1).optional()
  }
  return z.strictObject(shape)
}

function workflowObjectSchema(
  field: string,
  requiredInputs: readonly Readonly<{ field: string; pattern: string }>[] = [],
  optionalFields: readonly string[] = [],
) {
  const schema = convertSchemaToJsonSchema(workflowInputSchema(field, requiredInputs, optionalFields))
  if (schema === undefined) throw new Error('sandbox_workflow_schema_conversion_failed')
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema,
  }
}

function exactWorkflowInput(
  value: unknown,
  requiredField: string,
  requiredInputs: readonly Readonly<{ field: string; pattern: string }>[],
  optionalFields: readonly string[],
): Readonly<Record<string, string>> | undefined {
  const parsed = workflowInputSchema(requiredField, requiredInputs, optionalFields).safeParse(value)
  if (!parsed.success) return undefined
  const input: Record<string, string> = {}
  for (const [field, entry] of Object.entries(parsed.data).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof entry !== 'string') return undefined
    input[field] = entry
  }
  return Object.freeze(input)
}

function workflowInputSummary(input: Readonly<Record<string, string>>): string {
  return Object.entries(input).map(([field, value]) => `${field}: ${value}`).join(' | ')
}

