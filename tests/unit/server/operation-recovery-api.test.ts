import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import {
  createOperationInvokeService,
  handleOperationInvokeCancelPost,
  handleOperationInvokeReconcilePost,
  handleOperationInvokeStatusGet,
} from '@/lib/server/operation-invoke-api'
import {
  createPublicSourceTransport,
  setPublicSourceTransportForTests,
} from '@/lib/server/convex-source'
import { sourceWriteCommandDigest } from '@/modules/security/source-write-admission'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'
import { convexUrl } from './server-seams-harness'

const operationRef = `operation:v1:${'a'.repeat(64)}`
const invocationRef = `operation-invocation:v1:${'b'.repeat(64)}`
const principal = {
  principalId: 'clerk_api_key:credential:one',
  ownerId: 'user_one',
  credentialId: 'credential:one',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'inspect_only' as const,
}

const authenticate = async () => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: principal.credentialId,
  subject: principal.ownerId,
  scopes: principal.scopes,
})

function service(): OperationInvokeService {
  return {
    invokeOperation: vi.fn(),
    readInvocationStatus: vi.fn().mockResolvedValue({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'in_progress',
    }),
    cancelInvocation: vi.fn().mockResolvedValue({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'cancelled',
    }),
    reconcileInvocation: vi.fn().mockResolvedValue({
      kind: 'found',
      invocationRef,
      operationRef,
      state: 'terminal',
    }),
  } as unknown as OperationInvokeService
}

function reconciliationEvidence() {
  const material = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef: 'evidence:one',
    source: 'provider:one',
    invocationRef,
    attemptRef: 'attempt:one',
    effectGeneration: 1,
    resolution: 'not_released' as const,
    observedAt: '2026-08-09T00:00:00.000Z',
  }
  return { ...material, digest: canonicalDigest(material) }
}

describe('operation recovery HTTP adapters', () => {
  it('signs only the neutral internal admission command for status, cancel, and reconcile', async () => {
    installTestSourceWriteSecret()
    const calls: Array<{ path: string; args: [Record<string, unknown>] }> = []
    const results = [
      { kind: 'found', invocationRef, operationRef, state: 'in_progress' },
      { kind: 'found', invocationRef, operationRef, state: 'cancelled' },
      { kind: 'found', invocationRef, operationRef, state: 'terminal' },
    ]
    const transport = createPublicSourceTransport({
      env: { CONVEX_URL: convexUrl },
      fetch: async (_input, init) => {
        const payload = JSON.parse(String(init?.body)) as { path: string; args: [Record<string, unknown>] }
        calls.push(payload)
        return new Response(JSON.stringify({ status: 'success', value: results[calls.length - 1] }))
      },
    })
    const restore = setPublicSourceTransportForTests(transport)
    const correlationId = 'corr:recovery-source-write'
    const evidence = reconciliationEvidence()
    const request = new Request('https://ae.example/api/v1/operations/recovery', { method: 'POST' })
    const executor = createOperationInvokeService(request, '{}')
    try {
      await executor.readInvocationStatus({ invocationRef, principal, correlationId })
      await executor.cancelInvocation({
        invocationRef,
        idempotencyKey: 'cancel:source-write',
        principal,
        correlationId,
      })
      await executor.reconcileInvocation({
        invocationRef,
        idempotencyKey: 'reconcile:source-write',
        evidence,
        principal,
        correlationId,
      })
    } finally {
      restore()
    }

    expect(calls.map(({ path }) => path)).toEqual([
      'capabilityOperationInvocations:readInvocationStatus',
      'capabilityOperationInvocations:cancelInvocation',
      'capabilityOperationInvocations:reconcileInvocation',
    ])
    const expectedIdempotencyKeys = [
      `status:${invocationRef}`,
      'cancel:cancel:source-write',
      'reconcile:reconcile:source-write',
    ]
    for (const [index, call] of calls.entries()) {
      const outbound = call.args[0]
      const sourceWrite = outbound.sourceWrite as { commandDigest: string }
      expect(sourceWrite.commandDigest).toBe(sourceWriteCommandDigest({
        operationRef: '',
        input: {},
        idempotencyKey: expectedIdempotencyKeys[index],
        correlationId,
        operationKey: outbound.operationKey,
        principal,
      }))
      expect(outbound.invocationRef).toBe(invocationRef)
    }
    expect(calls[2]?.args[0]?.evidence).toEqual(evidence)
  })

  it('requires the authenticated invocation scope before status lookup', async () => {
    const executor = service()
    const response = await handleOperationInvokeStatusGet(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}`),
      invocationRef,
      {
        authenticate: async () => ({
          isAuthenticated: false,
          tokenType: null,
          id: null,
          subject: null,
          scopes: null,
        }),
        operationInvokeService: executor,
      },
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(executor.readInvocationStatus).not.toHaveBeenCalled()
  })

  it('projects status and cancellation through one principal and correlation', async () => {
    const executor = service()
    const statusResponse = await handleOperationInvokeStatusGet(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}`, {
        headers: { 'x-ae-request-id': 'corr_recovery_http' },
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )
    const cancelResponse = await handleOperationInvokeCancelPost(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'cancel:one' }),
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )

    expect(statusResponse.status).toBe(200)
    expect(cancelResponse.status).toBe(200)
    expect(executor.readInvocationStatus).toHaveBeenCalledWith({
      invocationRef,
      principal,
      correlationId: 'corr_recovery_http',
    })
    expect(executor.cancelInvocation).toHaveBeenCalledWith({
      invocationRef,
      idempotencyKey: 'cancel:one',
      principal,
      correlationId: expect.any(String),
    })
  })

  it('accepts only canonical reconciliation evidence and preserves uncertain cancellation', async () => {
    const executor = service()
    vi.mocked(executor.cancelInvocation).mockResolvedValueOnce({
      kind: 'reconciliation_required',
      invocationRef,
      operationRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'provider:one',
      },
    })
    const evidence = reconciliationEvidence()
    const response = await handleOperationInvokeReconcilePost(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}/reconcile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'reconcile:one', evidence }),
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )
    const cancelled = await handleOperationInvokeCancelPost(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'cancel:after-release' }),
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )

    expect(response.status).toBe(200)
    expect(cancelled.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    await expect(cancelled.json()).resolves.toMatchObject({ kind: 'reconciliation_required' })
    expect(executor.reconcileInvocation).toHaveBeenCalledWith(expect.objectContaining({
      invocationRef,
      evidence,
      idempotencyKey: 'reconcile:one',
    }))
  })

  it('requires body identity before cancelling', async () => {
    const secret = 'provider-token-should-never-cross-the-boundary'
    const executor = service()
    const missingBodyResponse = await handleOperationInvokeCancelPost(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: secret }),
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )
    const missingBody = await missingBodyResponse.text()

    expect(missingBodyResponse.status).toBe(400)
    expect(missingBodyResponse.headers.get('content-type')).toContain('application/problem+json')
    expect(missingBody).not.toContain(secret)
    expect(executor.cancelInvocation).not.toHaveBeenCalled()

    const bodyIdentityResponse = await handleOperationInvokeCancelPost(
      new Request(`https://ae.example/api/v1/operations/${invocationRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'body:two' }),
      }),
      invocationRef,
      { authenticate, operationInvokeService: executor },
    )

    expect(bodyIdentityResponse.status).toBe(200)
    expect(executor.cancelInvocation).toHaveBeenCalledWith(expect.objectContaining({
      invocationRef,
      idempotencyKey: 'body:two',
    }))
  })
})
