import { describe, expect, it, vi } from 'vitest'

import {
  handleSandboxCapabilityRequest,
  handleSandboxRouteProviderRequest,
  handleSandboxWorkflowProviderRequest,
  readSandboxWorkflowProviderDiscovery,
  readSandboxRouteProviderDiscovery,
} from '@/lib/server/sandbox-capability-provider'
import { createHttpCapabilityBinding } from '@/modules/routing-kernel/http-capability-binding'

describe('sandbox capability provider', () => {
  it('returns profile-specific structured options through one protocol handler', async () => {
    const one = await call('one', 'sandbox.option.one:v1')
    const two = await call('two', 'sandbox.option.two:v1')

    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    await expect(one.json()).resolves.toMatchObject({ issuerBindingId: 'sandbox.option.one:v1', expectedCost: { amountMinor: 1_200 } })
    await expect(two.json()).resolves.toMatchObject({ issuerBindingId: 'sandbox.option.two:v1', expectedCost: { amountMinor: 900 } })
  })

  it('accepts and exactly echoes the registered current binding identity', async () => {
    const response = await call('one', 'binding:sandbox-option-one:http-json:v4')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      issuerBindingId: 'binding:sandbox-option-one:http-json:v4',
      expectedCost: { amountMinor: 1_200 },
    })
  })

  it('returns the registered current provider option envelope for preparation egress', async () => {
    const response = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v4'),
      { providerKey: 'secret' },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      format: 'ae.provider-option:v1',
      operationRef: 'preparation-egress:test-v3',
      contractRef: { capabilityId: 'sandbox.reference.lookup', version: 3 },
      offeringId: 'offering:sandbox-option-one:reference-lookup:v3',
      bindingId: 'binding:sandbox-option-one:http-json:v4',
      assertionRef: expect.stringMatching(/^sandbox-option:/),
      output: { optionSummary: 'Sandbox Option One — sandbox verification only' },
    })
  })

  it('supports the legacy and corrected binding endpoints during an ordered deployment', async () => {
    const legacy = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one'),
      { providerKey: 'secret' },
    )
    const corrected = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v2'),
      { providerKey: 'secret' },
    )
    const prior = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v3'),
      { providerKey: 'secret' },
    )
    const current = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v4'),
      { providerKey: 'secret' },
    )

    await expect(legacy.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json' })
    await expect(corrected.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v2' })
    await expect(prior.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v3' })
    await expect(current.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v4' })
  })

  it('composes two independently registered route capabilities through typed outputs', async () => {
    const resolved = await handleSandboxCapabilityRequest(new Request(
      'https://ae.test/api/sandbox/capability?route=resolver', {
        method: 'POST', headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ request: 'Resolve this labelled sandbox service' }),
      },
    ), { providerKey: 'secret' })
    expect(resolved.status).toBe(200)
    const resolvedBody = await resolved.json() as { serviceReference: string }
    expect(resolvedBody.serviceReference).toMatch(/^sandbox-service:/)
    expect(resolved.headers.get('Provider-Receipt')).toMatch(/^sandbox-resolver:/)

    const quoted = await handleSandboxCapabilityRequest(new Request(
      'https://ae.test/api/sandbox/capability?route=quoter', {
        method: 'POST', headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
      },
    ), { providerKey: 'secret' })
    expect(quoted.status).toBe(200)
    await expect(quoted.json()).resolves.toMatchObject({ quoteReference: expect.stringMatching(/^sandbox-quote:/) })
    expect(quoted.headers.get('Provider-Receipt')).toMatch(/^sandbox-quoter:/)
  })

  it('publishes distinct cold-agent discovery and invocation surfaces for each route business', async () => {
    const resolverUrl = 'https://ae.test/api/sandbox/providers/route-resolver'
    const quoterUrl = 'https://ae.test/api/sandbox/providers/route-quoter'
    const resolverDiscovery = await readSandboxRouteProviderDiscovery('resolver', new Request(resolverUrl))
    const quoterDiscovery = await readSandboxRouteProviderDiscovery('quoter', new Request(quoterUrl))

    expect(resolverDiscovery.status).toBe(200)
    expect(quoterDiscovery.status).toBe(200)
    await expect(resolverDiscovery.json()).resolves.toMatchObject({
      format: 'ae.sandbox-capability-provider:v1', supplyClass: 'labelled_sandbox',
      business: { name: 'Sandbox Route Resolver' },
      operation: {
        method: 'POST', endpoint: resolverUrl, maximumCost: { currency: 'AUD', amountMinor: 300 },
        inputSchema: { required: ['request'] }, outputSchema: { required: ['serviceReference'] },
      },
    })
    await expect(quoterDiscovery.json()).resolves.toMatchObject({
      format: 'ae.sandbox-capability-provider:v1', supplyClass: 'labelled_sandbox',
      business: { name: 'Sandbox Route Quoter' },
      operation: {
        method: 'POST', endpoint: quoterUrl, maximumCost: { currency: 'AUD', amountMinor: 700 },
        inputSchema: { required: ['serviceReference'] }, outputSchema: { required: ['quoteReference'] },
      },
    })

    const resolved = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ request: 'Resolve this labelled sandbox service' }),
    }), { providerKey: 'secret' })
    const resolvedBody = await resolved.json() as { serviceReference: string }
    const quoted = await handleSandboxRouteProviderRequest('quoter', new Request(quoterUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret' })
    await expect(quoted.json()).resolves.toMatchObject({ quoteReference: expect.stringMatching(/^sandbox-quote:/) })

    const wrongProvider = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret' })
    expect(wrongProvider.status).toBe(400)
  })

  it('delays only the labelled resolver execution used to prove released-step cancellation', async () => {
    const wait = vi.fn(async (_milliseconds: number, _signal: AbortSignal) => undefined)
    const response = await handleSandboxRouteProviderRequest('resolver', new Request(
      'https://ae.test/api/sandbox/providers/route-resolver', {
        method: 'POST', headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({
          request: 'Resolve a labelled sandbox service and pause the first step for cancellation.',
        }),
      },
    ), { providerKey: 'secret', wait })

    expect(response.status).toBe(200)
    expect(wait).toHaveBeenCalledOnce()
    expect(wait.mock.calls[0]?.[0]).toBe(2_000)
  })

  it.each([
    {
      request: 'Resolve this service and accept the provider cancellation.',
      expected: { kind: 'cancellation_accepted', providerReference: expect.stringMatching(/^sandbox-cancellation:accepted:/u) },
    },
    {
      request: 'Resolve this service and reject the provider cancellation.',
      expected: {
        kind: 'cancellation_rejected',
        reason: 'sandbox_provider_kept_current_work',
        providerReference: expect.stringMatching(/^sandbox-cancellation:rejected:/u),
      },
    },
    {
      request: 'Resolve this service and leave the provider cancellation unknown.',
      expected: { kind: 'cancellation_unknown' },
    },
  ])('correlates a deterministic $expected.kind outcome to the released operation', async ({
    request,
    expected,
  }) => {
    const endpoint = 'https://ae.test/api/sandbox/providers/route-resolver'
    const operationKeyDigest = `sha256:${'a'.repeat(64)}`
    const execution = await handleSandboxRouteProviderRequest('resolver', new Request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Idempotency-Key': operationKeyDigest,
      },
      body: JSON.stringify({ request }),
    }), { providerKey: 'secret' })
    expect(execution.status).toBe(200)

    const cancellation = await handleSandboxRouteProviderRequest('resolver', new Request(endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'Idempotency-Key': 'route-cancellation:v1:test',
      },
      body: JSON.stringify({
        cancellationRequestRef: 'route-cancellation:v1:test',
        attemptRef: 'route-attempt:v1:test',
        operationKeyDigest,
      }),
    }), { providerKey: 'secret' })

    expect(cancellation.status).toBe(200)
    await expect(cancellation.json()).resolves.toMatchObject(expected)
  })

  it('fails closed when a cancellation does not match a released sandbox operation', async () => {
    const response = await handleSandboxRouteProviderRequest('resolver', new Request(
      'https://ae.test/api/sandbox/providers/route-resolver',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({
          cancellationRequestRef: 'route-cancellation:v1:missing',
          attemptRef: 'route-attempt:v1:missing',
          operationKeyDigest: `sha256:${'b'.repeat(64)}`,
        }),
      },
    ), { providerKey: 'secret' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      kind: 'cancellation_unknown',
      reason: 'sandbox_operation_not_observed',
    })
  })

  it('executes the procurement workflow through three typed business endpoints', async () => {
    const requestText = 'Source comparable workplace catering options for 80 people next Thursday under AUD 4,000.'
    const brief = await workflowCall('procurement-brief', { request: requestText })
    expect(brief.status).toBe(200)
    const briefBody = await brief.json() as { requirementsBrief: string }
    expect(briefBody.requirementsBrief).toMatch(/^sandbox-procurement-brief:/u)

    const options = await workflowCall('supplier-options', {
      requirementsBrief: briefBody.requirementsBrief,
    })
    expect(options.status).toBe(200)
    const optionsBody = await options.json() as { supplierOptionSet: string }
    expect(optionsBody.supplierOptionSet).toMatch(/^sandbox-supplier-options:/u)

    const recommendation = await workflowCall('procurement-recommendation', {
      supplierOptionSet: optionsBody.supplierOptionSet,
    })
    expect(recommendation.status).toBe(200)
    await expect(recommendation.json()).resolves.toEqual({
      recommendation: expect.stringMatching(/^sandbox-procurement-recommendation:/u),
    })
    expect(recommendation.headers.get('Provider-Receipt'))
      .toMatch(/^sandbox-workflow:procurement-recommendation:/u)
  })

  it('executes the itinerary workflow through three typed business endpoints', async () => {
    const requestText = 'Build a four-day accessible Perth itinerary for two adults.'
    const constraints = await workflowCall('trip-constraints', { request: requestText })
    expect(constraints.status).toBe(200)
    const constraintsBody = await constraints.json()
    expect(constraintsBody.tripBrief).toMatch(/^sandbox-trip-constraints:/u)

    const itinerary = await workflowCall('itinerary-builder', {
      tripBrief: constraintsBody.tripBrief,
    })
    expect(itinerary.status).toBe(200)
    const itineraryBody = await itinerary.json()
    expect(itineraryBody.itineraryDraft).toMatch(/^sandbox-itinerary-builder:/u)

    const readiness = await workflowCall('itinerary-readiness', {
      itineraryDraft: itineraryBody.itineraryDraft,
    })
    expect(readiness.status).toBe(200)
    await expect(readiness.json()).resolves.toEqual({
      readinessChecklist: expect.stringMatching(/^sandbox-itinerary-readiness:/u),
    })
    expect(readiness.headers.get('Provider-Receipt'))
      .toMatch(/^sandbox-workflow:itinerary-readiness:/u)
  })

  it('assembles only the selected typed itinerary components', async () => {
    const request = 'Preserve the accessible transfer, hotel, and meetings. Remove dinner.'
    const transfer = await workflowCall('accessible-transfer', { request })
    const hotel = await workflowCall('accessible-hotel', { request })
    const meetings = await workflowCall('meeting-schedule', { request })
    expect([transfer.status, hotel.status, meetings.status]).toEqual([200, 200, 200])
    const transferPlan = (await transfer.json()).transferPlan
    const hotelPlan = (await hotel.json()).hotelPlan
    const meetingSchedule = (await meetings.json()).meetingSchedule

    const itinerary = await workflowCall('itinerary-builder', {
      tripBrief: 'sandbox-trip-brief', transferPlan, hotelPlan, meetingSchedule,
    })
    expect(itinerary.status).toBe(200)
    const { itineraryDraft } = await itinerary.json() as { itineraryDraft: string }
    expect(itineraryDraft).toContain('transferPlan')
    expect(itineraryDraft).toContain('hotelPlan')
    expect(itineraryDraft).toContain('meetingSchedule')
    expect(itineraryDraft).not.toContain('dinnerPlan')
  })

  it('keeps itinerary weather, mobility, and unknown availability visible in the final checklist', async () => {
    const constraints = await workflowCall('trip-constraints', {
      request: 'Plan four Perth days. Rain may invalidate one day, mobility needs may change, and activity availability is unknown.',
    })
    const { tripBrief } = await constraints.json() as { tripBrief: string }
    expect(tripBrief).toContain('mobility')

    const itinerary = await workflowCall('itinerary-builder', { tripBrief })
    const { itineraryDraft } = await itinerary.json() as { itineraryDraft: string }
    expect(itineraryDraft).toContain('weather fallback')
    expect(itineraryDraft).toContain('accessible activity')

    const readiness = await workflowCall('itinerary-readiness', { itineraryDraft })
    const { readinessChecklist } = await readiness.json() as { readinessChecklist: string }
    expect(readinessChecklist).toContain('availability remains unknown')
    expect(readinessChecklist).toContain('recheck mobility requirements')
    expect(readinessChecklist).toContain('No reservation, ticket, or payment')
  })

  it('executes journey management and preserves overdue work, ownership changes, and resume state', async () => {
    const intake = await workflowCall('journey-case', {
      request: 'Coordinate a small office move. One milestone is overdue, ownership changed, and I am resuming after an interruption.',
    })
    const { serviceCase } = await intake.json() as { serviceCase: string }
    expect(serviceCase).toContain('overdue')
    expect(serviceCase).toContain('ownership')

    const planned = await workflowCall('milestone-plan', { serviceCase })
    const { milestonePlan } = await planned.json() as { milestonePlan: string }
    expect(milestonePlan).toContain('blocked')
    expect(milestonePlan).toContain('next update')

    const synthesized = await workflowCall('progress-synthesis', { milestonePlan })
    const { progressSummary } = await synthesized.json() as { progressSummary: string }
    expect(progressSummary).toContain('Resumable')
    expect(progressSummary).toContain('No physical move, dispatch, or third-party task')
  })

  it('publishes exact procurement discovery and refuses cross-step input', async () => {
    const endpoint = 'https://ae.test/api/sandbox/providers/workflow?provider=supplier-options'
    const discovery = await readSandboxWorkflowProviderDiscovery(
      'supplier-options',
      new Request(endpoint),
    )
    await expect(discovery.json()).resolves.toMatchObject({
      format: 'ae.sandbox-capability-provider:v1',
      supplyClass: 'labelled_sandbox',
      business: { name: 'Supplier Options Network' },
      operation: {
        endpoint,
        inputSchema: { required: ['requirementsBrief'] },
        outputSchema: { required: ['supplierOptionSet'] },
      },
    })

    const refused = await workflowCall('supplier-options', {
      request: 'This belongs to the first procurement step.',
    })
    expect(refused.status).toBe(400)
    await expect(refused.json()).resolves.toEqual({ kind: 'refused', reason: 'request_invalid' })
  })

  it('answers the generic readiness quote with the exact workflow binding identity', async () => {
    const response = await workflowCall('procurement-brief', {
      protocolVersion: 'ae-capability:v1',
      operation: 'quote',
      bindingId: 'binding:sandbox-procurement-brief:http-json:v2',
      capabilityContractId: 'sandbox.workflow.procurement-brief',
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'quoted',
      expectedCost: { currency: 'AUD', amountMinor: 250 },
      maximumCost: { currency: 'AUD', amountMinor: 250 },
      providerQuoteRef: expect.stringMatching(/^sandbox-workflow-quote:procurement-brief:/u),
    })
  })

  it('lets registered sandbox providers exercise an uncertain second-step outcome', async () => {
    const resolverUrl = 'https://ae.test/api/sandbox/providers/route-resolver'
    const quoterUrl = 'https://ae.test/api/sandbox/providers/route-quoter'
    const resolved = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ request: 'Resolve a labelled sandbox service and leave the quote outcome unknown' }),
    }), { providerKey: 'secret' })
    const resolvedBody = await resolved.json() as { serviceReference: string }
    const wait = vi.fn(async () => { throw new DOMException('Timed out', 'TimeoutError') })

    await expect(handleSandboxRouteProviderRequest('quoter', new Request(quoterUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret', wait })).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(wait).toHaveBeenCalledOnce()
  })

  it('lets the route journey exercise malformed second-step evidence without fabricating success', async () => {
    const resolverUrl = 'https://ae.test/api/sandbox/providers/route-resolver'
    const quoterUrl = 'https://ae.test/api/sandbox/providers/route-quoter'
    const resolved = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        request: 'Resolve a labelled sandbox service, then prepare its quote, but leave the quote evidence malformed.',
      }),
    }), { providerKey: 'secret' })
    const resolvedBody = await resolved.json() as { serviceReference: string }

    const quoted = await handleSandboxRouteProviderRequest('quoter', new Request(quoterUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret' })

    expect(quoted.status).toBe(200)
    expect(quoted.headers.get('Provider-Receipt')).toBeNull()
    await expect(quoted.json()).resolves.toEqual({
      malformedSandboxEvidence: true,
    })
  })

  it('lets the route journey exercise a definite second-step provider denial', async () => {
    const resolverUrl = 'https://ae.test/api/sandbox/providers/route-resolver'
    const quoterUrl = 'https://ae.test/api/sandbox/providers/route-quoter'
    const resolved = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        request: 'Resolve a labelled sandbox service and prepare its quote. Use the provider denial scenario.',
      }),
    }), { providerKey: 'secret' })
    const resolvedBody = await resolved.json() as { serviceReference: string }

    const denied = await handleSandboxRouteProviderRequest('quoter', new Request(quoterUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret' })

    expect(denied.status).toBe(409)
    expect(denied.headers.get('Provider-Receipt')).toMatch(/^sandbox-quoter-denial:/)
    await expect(denied.json()).resolves.toEqual({
      kind: 'refused',
      reason: 'sandbox_provider_declined',
    })
  })

  it('lets the route journey exercise a schema-valid partial second-step result', async () => {
    const resolverUrl = 'https://ae.test/api/sandbox/providers/route-resolver'
    const quoterUrl = 'https://ae.test/api/sandbox/providers/route-quoter'
    const resolved = await handleSandboxRouteProviderRequest('resolver', new Request(resolverUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({
        request: 'Resolve a labelled sandbox service and prepare its quote, even if only a partial result is available.',
      }),
    }), { providerKey: 'secret' })
    const resolvedBody = await resolved.json() as { serviceReference: string }

    const partial = await handleSandboxRouteProviderRequest('quoter', new Request(quoterUrl, {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
    }), { providerKey: 'secret' })

    expect(partial.status).toBe(200)
    expect(partial.headers.get('Continuation-Token')).toEqual(expect.stringMatching(/^sandbox-continuation:/))
    expect(partial.headers.get('Provider-Receipt')).toEqual(expect.stringMatching(/^sandbox-quoter-partial:/))
    await expect(partial.json()).resolves.toEqual({
      quoteReference: expect.stringMatching(/^sandbox-partial-quote:/),
    })
  })

  it('refuses missing credentials and never commits a real-world effect', async () => {
    const unauthorized = await handleSandboxCapabilityRequest(new Request('https://ae.test/api/sandbox/capability?profile=one', {
      method: 'POST', body: JSON.stringify({}),
    }), { providerKey: 'secret' })
    expect(unauthorized.status).toBe(401)

    const execution = await handleSandboxCapabilityRequest(request('one', {
      operation: 'execute', bindingId: 'sandbox.option.one:v1', capabilityContractId: 'sandbox.option.quote:v1',
    }), { providerKey: 'secret' })
    await expect(execution.json()).resolves.toMatchObject({ kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects' })
  })

  it('makes provider selection a registration concern behind one binding interface', async () => {
    const one = binding('one', 'sandbox.option.one:v1', 'sandbox:option-one')
    const two = binding('two', 'sandbox.option.two:v1', 'sandbox:option-two')
    const results = await Promise.all([one, two].map(async (candidate) => await candidate.quoteStructured?.({
      quoteAttemptId: 'attempt:1', allocationId: `allocation:${candidate.binding.bindingId}`,
      recipient: { bindingId: candidate.binding.bindingId, nodeId: candidate.binding.nodeId },
      capabilityContractId: candidate.binding.capabilityContractId, capabilityContractVersion: 'v1',
      registrationHash: candidate.binding.registrationHash ?? '', environment: candidate.binding.environment ?? '', data: { requestContext: 'Compare options' },
    })))

    expect(results.map((result) => result?.kind)).toEqual(['quoted', 'quoted'])
    const quoted = results.filter((result) => result?.kind === 'quoted')
    expect(quoted.sort((left, right) => left.expectedCost.amountMinor - right.expectedCost.amountMinor)[0]?.issuerBindingId).toBe('sandbox.option.two:v1')
  })

  it('exercises deterministic refusal, expiry, timeout and reconciliation through the production adapter', async () => {
    const input = structuredInput('sandbox.option.one:v1', 'sandbox:option-one')
    await expect(binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'refusal').quoteStructured?.(input)).resolves.toEqual({
      kind: 'refused', reason: 'sandbox_deterministic_refusal',
    })
    await expect(binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'expired').quoteStructured?.(input)).resolves.toMatchObject({
      kind: 'quoted', providerQuoteExpiresAt: 1,
    })
    const timed = binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'timeout', async () => {
      throw new DOMException('Timed out', 'TimeoutError')
    })
    await expect(timed.quoteStructured?.(input)).resolves.toEqual({ kind: 'uncertain', reason: 'provider_quote_timeout' })
    const { data: _data, ...reconcileInput } = input
    await expect(timed.reconcileStructuredQuote?.(reconcileInput)).resolves.toMatchObject({
      kind: 'quoted', issuerBindingId: 'sandbox.option.one:v1',
    })
  })

  it('returns materially identical responses for an identical duplicate command', async () => {
    const body = {
      operation: 'structured_quote', bindingId: 'sandbox.option.one:v1', capabilityContractId: 'sandbox.option.quote:v1',
      capabilityContractVersion: 'v1', registrationHash: 'sha256:registration', environment: 'https://ae.test',
      quoteAttemptId: 'attempt:duplicate', allocationId: 'allocation:duplicate',
    }
    const first = await handleSandboxCapabilityRequest(request('one', body, 'duplicate'), { providerKey: 'secret' })
    const replay = await handleSandboxCapabilityRequest(request('one', body, 'duplicate'), { providerKey: 'secret' })
    expect(await replay.json()).toEqual(await first.json())
  })
})

async function workflowCall(providerKey: string, body: unknown): Promise<Response> {
  return await handleSandboxWorkflowProviderRequest(providerKey, new Request(
    `https://ae.test/api/sandbox/providers/workflow?provider=${providerKey}`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify(body),
    },
  ), { providerKey: 'secret' })
}

function binding(
  profile: string,
  bindingId: string,
  nodeId: string,
  scenario = 'success',
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>,
) {
  const endpointUrl = `https://ae.test/api/sandbox/capability?profile=${profile}&scenario=${scenario}`
  return createHttpCapabilityBinding({
    endpointUrl, credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    binding: {
      bindingId, nodeId, networkId: 'ae:public', capabilityContractId: 'sandbox.option.quote:v1', operation: 'quote',
      admission: 'admitted', conformance: 'conformant', queryTerms: ['sandbox option'], registrationHash: `sha256:${profile.padEnd(64, '0')}`,
      environment: 'https://ae.test', adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
    },
  }, {
    validateTarget: async () => true,
    resolveCredential: async () => 'secret',
    now: () => 1_000,
    send: async (outbound) => await handleSandboxCapabilityRequest(new Request(endpointUrl, {
      method: 'POST', headers: outbound.headers, body: await outbound.text(),
    }), { providerKey: 'secret', ...(wait === undefined ? {} : { wait }) }),
  })
}

async function call(profile: string, bindingId: string): Promise<Response> {
  return await handleSandboxCapabilityRequest(request(profile, {
    operation: 'structured_quote', bindingId, capabilityContractId: 'sandbox.option.quote:v1',
    capabilityContractVersion: 'v1', registrationHash: 'sha256:registration', environment: 'https://ae.test',
  }), { providerKey: 'secret' })
}

function request(profile: string, body: Record<string, unknown>, scenario = 'success'): Request {
  return new Request(`https://ae.test/api/sandbox/capability?profile=${profile}&scenario=${scenario}`, {
    method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 'ae-capability:v1', ...body }),
  })
}

function preparationRequest(url: string): Request {
  return new Request(url, {
    method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'ae.preparation-egress:v1', operationRef: 'preparation-egress:test-v3',
      contractRef: {
        capabilityId: 'sandbox.reference.lookup', version: 3,
        contractDigest: 'sha256:' + 'a'.repeat(64),
      },
      selectionKey: 'ae_selection:test', semanticDigest: 'sha256:' + 'b'.repeat(64),
      facts: [{ inputPointer: '/requestContext', value: 'Compare sandbox options' }],
    }),
  })
}

function structuredInput(bindingId: string, nodeId: string) {
  return {
    quoteAttemptId: 'attempt:scenario', allocationId: 'allocation:scenario', recipient: { bindingId, nodeId },
    capabilityContractId: 'sandbox.option.quote:v1', capabilityContractVersion: 'v1',
    registrationHash: `sha256:${'one'.padEnd(64, '0')}`, environment: 'https://ae.test', data: { requestContext: 'Compare options' },
  }
}
