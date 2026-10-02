import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  handleToolCallPost as handleCallPostImpl,
  handleToolQuotePost,
  type CallHandlerOptions,
} from '@/lib/server/call-api'
import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { callMachineResultSchema } from '@/modules/capability-execution/call-contracts'
import { callStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => vi.unstubAllEnvs())

const operationRef = `operation:v1:${'a'.repeat(64)}`
const commitmentRef = `operation-commitment:v1:${'b'.repeat(64)}`
const authenticate = async (scopes: readonly string[] = ['market_tools:call']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key:test',
  subject: 'user_test',
  scopes,
  claims: { aeEnvironment: 'sandbox' },
})
const resolveCanonicalPrincipal: AgentAccessPrincipalResolver = async (projection) => ({
  ...projection,
  principalId: 'prn_00000000000040008000000000000043',
  ownerId: 'acc_00000000000040008000000000000043',
})

async function handleCallPost(
  request: Request,
  options: CallHandlerOptions = {},
): Promise<Response> {
  return await handleCallPostImpl(request, {
    ...(options.authenticate === undefined || options.resolvePrincipal !== undefined
      ? {}
      : { resolvePrincipal: resolveCanonicalPrincipal }),
    ...options,
  })
}

function service(result: Record<string, unknown>) {
  return {
    callTool: vi.fn().mockResolvedValue(result),
    quoteTool: vi.fn(),
    listCalls: vi.fn(),
    readCallStatus: vi.fn(),
    cancelCall: vi.fn(),
    reconcileCall: vi.fn(),
  }
}

function post(body: unknown, path = '/api/v1/tools/call'): Request {
  return new Request(`https://ae.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postWithContentType(
  body: unknown,
  path: string,
  contentType?: string,
): Request {
  const request = new Request(`https://ae.example${path}`, {
    method: 'POST',
    ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
    body: JSON.stringify(body),
  })
  if (contentType === undefined) request.headers.delete('content-type')
  return request
}

function invokeBody(idempotencyKey = 'key-12345') {
  return { quoteRef: commitmentRef, idempotencyKey }
}

describe('operation.invoke HTTP adapter', () => {
  it('refuses production Quote and Call before an injected service when money configuration is incomplete', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_X402_CUSTODY_ENABLED', 'false')
    const executor = service({ kind: 'completed' })
    const options = {
      authenticate: async () => ({ ...(await authenticate()), claims: { aeEnvironment: 'production' } }),
      resolvePrincipal: resolveCanonicalPrincipal,
      callService: executor,
    }
    const quote = await handleToolQuotePost(post({ toolRef: operationRef, input: {} }, '/api/v1/tools/quote'), options)
    const call = await handleCallPostImpl(post(invokeBody()), options)
    expect(quote.status).toBe(200)
    await expect(quote.json()).resolves.toMatchObject({ kind: 'refused', code: 'payments_not_ready' })
    expect(call.status).toBe(200)
    await expect(call.json()).resolves.toMatchObject({ kind: 'refused', code: 'operation_not_ready' })
    expect(executor.quoteTool).not.toHaveBeenCalled()
    expect(executor.callTool).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'missing', contentType: undefined },
    { label: 'text/plain', contentType: 'text/plain' },
    { label: 'malformed', contentType: 'application/json nonsense' },
  ] as const)('rejects $label media for Tool Call before service dispatch', async ({ contentType }) => {
    const executor = service({ kind: 'completed' })
    const response = await handleCallPostImpl(
      postWithContentType(invokeBody(), '/api/v1/tools/call', contentType),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'UNSUPPORTED_MEDIA_TYPE',
      code: 'invalid_content_type',
    })
    expect(executor.callTool).not.toHaveBeenCalled()
  })

  it('accepts mixed-case parameterized JSON media for Tool Call', async () => {
    const executor = service({
      kind: 'completed',
      callRef: 'invocation:mixed-case-media',
      toolRef: operationRef,
      output: { ok: true },
      evidenceHash: 'evidence:mixed-case-media',
      usage: {
        usageRef: 'usage:mixed-case-media',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier',
        priceDigest: 'price:mixed-case-media',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const response = await handleCallPostImpl(
      postWithContentType(invokeBody('mixed-case-media'), '/api/v1/tools/call', 'Application/JSON;charset=UTF-8'),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(200)
    expect(executor.callTool).toHaveBeenCalledOnce()
  })

  it('preserves malformed JSON and over-limit body failures for Tool Call', async () => {
    const executor = service({ kind: 'completed' })
    const malformed = await handleCallPostImpl(
      new Request('https://ae.example/api/v1/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )
    const oversized = await handleCallPostImpl(
      postWithContentType({ quoteRef: commitmentRef, idempotencyKey: 'x'.repeat(256 * 1024) }, '/api/v1/tools/call', 'application/json'),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(malformed.status).toBe(400)
    await expect(malformed.json()).resolves.toMatchObject({ code: 'invalid_json' })
    expect(oversized.status).toBe(413)
    expect(executor.callTool).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'missing', contentType: undefined },
    { label: 'text/plain', contentType: 'text/plain' },
    { label: 'malformed', contentType: 'application/json nonsense' },
  ] as const)('rejects $label media for Tool Quote before service dispatch', async ({ contentType }) => {
    const executor = service({ kind: 'completed' })
    const response = await handleToolQuotePost(
      postWithContentType({ toolRef: operationRef, input: {} }, '/api/v1/tools/quote', contentType),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'UNSUPPORTED_MEDIA_TYPE',
      code: 'invalid_content_type',
    })
    expect(executor.quoteTool).not.toHaveBeenCalled()
  })

  it('rate-limits Tool Quote before service dispatch when admission is denied', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 5_000 }))
    const executor = service({ kind: 'completed' })
    const response = await handleToolQuotePost(
      postWithContentType({ toolRef: operationRef, input: {} }, '/api/v1/tools/quote', 'application/json'),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(429)
    expect(executor.quoteTool).not.toHaveBeenCalled()
  })

  it('accepts mixed-case parameterized JSON media for Tool Quote', async () => {
    const executor = service({ kind: 'completed' })
    vi.mocked(executor.quoteTool).mockResolvedValue({
      kind: 'committed',
      quoteRef: commitmentRef,
      toolRef: operationRef,
      toolVersion: 42,
      expiresAt: 1_900_000_000_000,
      normalizedInput: { query: 'bounded current input' },
      price: { currency: 'AUD', units: '1234567', exponent: 6 },
      sourceRequirement: { currency: 'USDC', units: '765432', exponent: 6 },
      account: {
        accountRef: 'account:machine-budget',
        available: { currency: 'AUD', units: '9000000', exponent: 6 },
      },
      budget: {
        principalRef: 'principal:machine-budget',
        maximumPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
      },
      policyRefs: [
        'policy:commercial',
        'policy:tax',
        'policy:accounting',
        'policy:privacy',
        'policy:treasury',
        'policy:operations',
      ],
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
      continuation: {
        action: 'tool.call',
        method: 'POST',
        path: '/api/v1/tools/call',
        input: { quoteRef: commitmentRef, idempotencyKey: 'replace-with-stable-command-id' },
      },
    })
    const response = await handleToolQuotePost(
      postWithContentType({ toolRef: operationRef, input: {} }, '/api/v1/tools/quote', 'Application/JSON;charset=UTF-8'),
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(200)
    expect(executor.quoteTool).toHaveBeenCalledOnce()
  })

  it('passes the protected operation scope into canonical production-style resolution', async () => {
    const executor = service({
      kind: 'completed',
      callRef: 'invocation:canonical-scope',
      toolRef: operationRef,
      output: { ok: true },
      evidenceHash: 'evidence:canonical-scope',
      usage: {
        usageRef: 'usage:canonical-scope',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier',
        priceDigest: 'price:canonical-scope',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const resolvedScopes: Array<readonly string[]> = []
    const resolvedResources: string[] = []
    const response = await handleCallPost(post(invokeBody('canonical-scope')), {
      authenticate,
      resolvePrincipal: async (projection, requiredScopes, consequenceResource) => {
        resolvedScopes.push(requiredScopes)
        resolvedResources.push(consequenceResource)
        return {
          ...projection,
          principalId: 'prn_00000000000040008000000000000043',
          ownerId: 'acc_00000000000040008000000000000043',
        }
      },
      callService: executor,
    })

    expect(response.status).toBe(200)
    expect(resolvedScopes).toEqual([['market_tools:call']])
    expect(resolvedResources).toEqual(['surface:http:tools-call'])
    expect(executor.callTool).toHaveBeenCalledWith(expect.objectContaining({
      principal: expect.objectContaining({
        principalId: 'prn_00000000000040008000000000000043',
        ownerId: 'acc_00000000000040008000000000000043',
      }),
    }))
  })

  it('returns a canonical bearer challenge for missing authentication', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleCallPost(post(invokeBody()), {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
      callService: executor,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('market_tools:call')
    expect(executor.callTool).not.toHaveBeenCalled()
  })

  it('refuses insufficient scope before invoking the service', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleCallPost(post(invokeBody()), {
      authenticate: async () => await authenticate([]),
      callService: executor,
    })
    expect(response.status).toBe(403)
    expect(executor.callTool).not.toHaveBeenCalled()
  })

  it('rejects transport and credential injection through the shared action schema', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleCallPost(post({
      ...invokeBody(),
      endpointUrl: 'https://attacker.example',
      credentialRef: 'secret',
      method: 'POST',
    }), { authenticate, callService: executor })
    expect(response.status).toBe(400)
    expect(executor.callTool).not.toHaveBeenCalled()
  })
  it('requires body identity before invoking the service', async () => {
    const executor = service({
      kind: 'completed',
      callRef: 'invocation:body',
      toolRef: operationRef,
      output: { ok: true },
      evidenceHash: 'evidence:body',
      usage: {
        usageRef: 'usage:body',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier',
        priceDigest: 'price:body',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const missingBodyResponse = await handleCallPost(post({ quoteRef: commitmentRef }), { authenticate, callService: executor })

    expect(missingBodyResponse.status).toBe(400)
    expect(executor.callTool).not.toHaveBeenCalled()

    const bodyIdentityResponse = await handleCallPost(post(invokeBody('body:two')), { authenticate, callService: executor })

    expect(bodyIdentityResponse.status).toBe(200)
    expect(executor.callTool).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ idempotencyKey: 'body:two' }),
    }))
  })

  it.each([
    { label: 'pending', kind: 'pending' as const, callRef: 'invocation:test', toolRef: operationRef, retryAfterMs: 1000 },
    { label: 'needs_authority', kind: 'needs_authority' as const, callRef: 'invocation:test', toolRef: operationRef, authorityRequest: { kind: 'approval_required' as const, toolRef: operationRef, consequence: 'external_effect' as const, retryClass: 'reconcile_before_retry' as const, dataFields: [] } },
    { label: 'reconciliation_required', kind: 'reconciliation_required' as const, callRef: 'invocation:test', toolRef: operationRef, evidence: { attemptRef: 'attempt:test', effectGeneration: 1, requiredAt: '2026-01-01T00:00:00.000Z', retry: 'reconcile_before_retry' as const, evidenceSource: 'ae' } },
    { label: 'refused', kind: 'refused' as const, toolRef: operationRef, code: 'authority_required' as const, retryable: false },
  ])('keeps $label as a typed domain response', async ({ label: _label, ...domainResult }) => {
    const executor = service(domainResult as Parameters<typeof service>[0])
    const response = await handleCallPost(post(invokeBody()), {
      authenticate,
      callService: executor,
    })
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({
      kind: domainResult.kind === 'needs_authority'
        ? 'refused'
        : domainResult.kind === 'reconciliation_required'
          ? 'outcome_unknown'
          : domainResult.kind,
    })
    if (domainResult.kind === 'needs_authority') {
      expect(body).toMatchObject({
        code: 'authority_required',
        retryable: false,
        nextAction: 'Ask the Account owner to approve this Call at /agent-access.',
        ownerHandoff: { kind: 'authorize', callRef: 'invocation:test', toolRef: operationRef },
      })
    }
  })
  it('projects one bounded timing event when an invocation result returns', async () => {
    const executor = service({
      kind: 'completed',
      callRef: 'invocation:test',
      toolRef: operationRef,
      output: { ok: true },
      evidenceHash: 'evidence:test',
      usage: {
        usageRef: 'usage:test',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier',
        priceDigest: 'price:test',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const record = vi.fn()
    const response = await handleCallPost(post(invokeBody()), {
      authenticate,
      callService: executor,
      timing: { record },
    })

    expect(response.status).toBe(200)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('gateway.operation', expect.any(Number), expect.objectContaining({
      outcome: 'completed',
      operationRef,
      pricing: 'free',
      costUnits: '0',
    }))
  })

  it('keeps inspection, unchanged status, refusal, and uncertainty payloads within machine budgets', () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
    const committed = toolQuoteResultSchema.parse({
      kind: 'committed',
      quoteRef: commitmentRef,
      toolRef: operationRef,
      toolVersion: 42,
      expiresAt: 1_900_000_000_000,
      normalizedInput: { query: 'bounded current input' },
      price: { currency: 'AUD', units: '1234567', exponent: 6 },
      sourceRequirement: { currency: 'USDC', units: '765432', exponent: 6 },
      account: {
        accountRef: 'account:machine-budget',
        available: { currency: 'AUD', units: '9000000', exponent: 6 },
      },
      budget: {
        principalRef: 'principal:machine-budget',
        maximumPerCall: { currency: 'AUD', units: '5000000', exponent: 6 },
      },
      policyRefs: [
        'policy:commercial',
        'policy:tax',
        'policy:accounting',
        'policy:privacy',
        'policy:treasury',
        'policy:operations',
      ],
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
      continuation: {
        action: 'tool.call',
        method: 'POST',
        path: '/api/v1/tools/call',
        input: { quoteRef: commitmentRef, idempotencyKey: 'replace-with-stable-command-id' },
      },
    })
    const unchanged = callStatusResultSchema.parse({
      kind: 'unchanged',
      callRef: 'invocation:machine-budget',
      version: 42,
      retryAfterMs: 1_000,
    })
    const refused = callMachineResultSchema.parse({
      kind: 'refused',
      toolRef: operationRef,
      code: 'commercial_policy_unavailable',
      retryable: false,
      nextAction: 'Ask the Account owner to review current commercial approvals.',
    })
    const outcomeUnknown = callMachineResultSchema.parse({
      kind: 'outcome_unknown',
      callRef: 'invocation:machine-budget',
      toolRef: operationRef,
      evidence: {
        attemptRef: 'attempt:machine-budget',
        effectGeneration: 1,
        requiredAt: '2026-09-02T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'transport_outcome_unknown',
      },
    })

    expect(bytes(committed)).toBeLessThanOrEqual(4 * 1024)
    expect(bytes(unchanged)).toBeLessThanOrEqual(512)
    expect(bytes(refused)).toBeLessThanOrEqual(1024)
    expect(bytes(outcomeUnknown)).toBeLessThanOrEqual(1024)
  })
})
