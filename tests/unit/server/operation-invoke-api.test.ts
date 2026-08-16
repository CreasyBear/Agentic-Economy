import { describe, expect, it, vi } from 'vitest'

import { handleOperationInvokePost } from '@/lib/server/operation-invoke-api'

const operationRef = `operation:v1:${'a'.repeat(64)}`
const authenticate = async (scopes: readonly string[] = ['market_operations:invoke']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key:test',
  subject: 'owner:test',
  scopes,
})

function service(result: Record<string, unknown>) {
  return {
    invokeOperation: vi.fn().mockResolvedValue(result),
    readInvocationStatus: vi.fn(),
    cancelInvocation: vi.fn(),
    reconcileInvocation: vi.fn(),
  }
}

function post(body: unknown, path = '/api/v1/operations/call'): Request {
  return new Request(`https://ae.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('operation.invoke HTTP adapter', () => {
  it('dual-serves call and execute with identical results for the same request', async () => {
    const result = {
      kind: 'completed' as const,
      invocationRef: 'invocation:dual',
      operationRef,
      output: { ok: true },
      evidenceHash: 'evidence:dual',
      usage: {
        usageRef: 'usage:dual',
        observedAt: 1_700_000_000_000,
        chargeState: 'free_tier' as const,
        priceDigest: 'price:dual',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
    }
    const executor = service(result)
    const body = { operationRef, input: {}, idempotencyKey: 'key-dual' }
    const callResponse = await handleOperationInvokePost(post(body, '/api/v1/operations/call'), {
      authenticate,
      operationInvokeService: executor,
    })
    const executeResponse = await handleOperationInvokePost(post(body, '/api/v1/operations/execute'), {
      authenticate,
      operationInvokeService: executor,
    })

    expect(callResponse.status).toBe(200)
    expect(executeResponse.status).toBe(200)
    await expect(callResponse.json()).resolves.toEqual(await executeResponse.json())
    expect(executor.invokeOperation).toHaveBeenCalledTimes(2)
  })

  it('rejects unauthenticated call exactly as execute with the same status and problem shape', async () => {
    const executor = service({ kind: 'completed' })
    const body = { operationRef, input: {}, idempotencyKey: 'key-unauth' }
    const unauthenticated = async () => ({
      isAuthenticated: false as const,
      tokenType: null,
      id: null,
      subject: null,
      scopes: null,
    })
    const callResponse = await handleOperationInvokePost(post(body, '/api/v1/operations/call'), {
      authenticate: unauthenticated,
      operationInvokeService: executor,
    })
    const executeResponse = await handleOperationInvokePost(post(body, '/api/v1/operations/execute'), {
      authenticate: unauthenticated,
      operationInvokeService: executor,
    })

    expect(callResponse.status).toBe(401)
    expect(executeResponse.status).toBe(401)
    expect(callResponse.headers.get('www-authenticate')).toBe(executeResponse.headers.get('www-authenticate'))
    await expect(callResponse.json()).resolves.toEqual(await executeResponse.json())
    expect(executor.invokeOperation).not.toHaveBeenCalled()
  })

  it('returns a canonical bearer challenge for missing authentication', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleOperationInvokePost(post({ operationRef, input: {}, idempotencyKey: 'key-1' }), {
      authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }),
      operationInvokeService: executor,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('market_operations:invoke')
    expect(executor.invokeOperation).not.toHaveBeenCalled()
  })

  it('refuses insufficient scope before invoking the service', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleOperationInvokePost(post({ operationRef, input: {}, idempotencyKey: 'key-1' }), {
      authenticate: async () => await authenticate([]),
      operationInvokeService: executor,
    })
    expect(response.status).toBe(403)
    expect(executor.invokeOperation).not.toHaveBeenCalled()
  })

  it('rejects transport and credential injection through the shared action schema', async () => {
    const executor = service({ kind: 'completed' })
    const response = await handleOperationInvokePost(post({
      operationRef,
      input: {},
      idempotencyKey: 'key-1',
      endpointUrl: 'https://attacker.example',
      credentialRef: 'secret',
      method: 'POST',
    }), { authenticate, operationInvokeService: executor })
    expect(response.status).toBe(400)
    expect(executor.invokeOperation).not.toHaveBeenCalled()
  })
  it('requires body identity before invoking the service', async () => {
    const executor = service({
      kind: 'completed',
      invocationRef: 'invocation:body',
      operationRef,
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
    const missingBodyResponse = await handleOperationInvokePost(post({ operationRef, input: {} }), { authenticate, operationInvokeService: executor })

    expect(missingBodyResponse.status).toBe(400)
    expect(executor.invokeOperation).not.toHaveBeenCalled()

    const bodyIdentityResponse = await handleOperationInvokePost(post({ operationRef, input: {}, idempotencyKey: 'body:two' }), { authenticate, operationInvokeService: executor })

    expect(bodyIdentityResponse.status).toBe(200)
    expect(executor.invokeOperation).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ idempotencyKey: 'body:two' }),
    }))
  })

  it.each([
    { kind: 'pending', invocationRef: 'invocation:test', operationRef, retryAfterMs: 1000 },
    { kind: 'needs_authority', invocationRef: 'invocation:test', operationRef, authorityRequest: { kind: 'approve_each', operationRef, consequence: 'external_effect', retryClass: 'reconcile_before_retry', dataFields: [] } },
    { kind: 'reconciliation_required', invocationRef: 'invocation:test', operationRef, evidence: { attemptRef: 'attempt:test', effectGeneration: 1, requiredAt: '2026-01-01T00:00:00.000Z', retry: 'reconcile_before_retry', evidenceSource: 'ae' } },
    { kind: 'refused', operationRef, code: 'authority_required', retryable: false },
  ] as const)('keeps $kind as a typed domain response', async (result) => {
    const executor = service(result)
    const response = await handleOperationInvokePost(post({ operationRef, input: {}, idempotencyKey: 'key-1' }), {
      authenticate,
      operationInvokeService: executor,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: result.kind })
  })
  it('projects one bounded timing event when an invocation result returns', async () => {
    const executor = service({
      kind: 'completed',
      invocationRef: 'invocation:test',
      operationRef,
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
    const response = await handleOperationInvokePost(post({ operationRef, input: {}, idempotencyKey: 'key-1' }), {
      authenticate,
      operationInvokeService: executor,
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
})
