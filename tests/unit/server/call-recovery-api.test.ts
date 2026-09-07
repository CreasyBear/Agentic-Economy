import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { CallService } from '@/modules/capability-execution/call-authority'
import type { AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import {
  createCallService,
  handleCallCancelPost,
  handleCallReconcilePost,
  handleCallStatusGet,
} from '@/lib/server/call-api'
import {
  createPublicSourceTransport,
  setPublicSourceTransportForTests,
} from '@/lib/server/convex-source'
import { sourceWriteCommandDigest } from '@/modules/security/source-write-admission'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'
import { convexUrl } from './server-seams-harness'

const toolRef = `operation:v1:${'a'.repeat(64)}`
const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
const principal = {
  principalId: `prn_${'1'.repeat(32)}`,
  ownerId: `acc_${'2'.repeat(32)}`,
  credentialId: 'credential:one',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

const resolveCanonicalPrincipal: AgentAccessPrincipalResolver = async () => principal

const authenticate = async () => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: principal.credentialId,
  subject: 'user_operation-recovery',
  scopes: principal.scopes,
})

function service(): CallService {
  return {
    callTool: vi.fn(),
    readCallStatus: vi.fn().mockResolvedValue({
      kind: 'found',
      callRef,
      version: 1,
      toolRef,
      state: 'in_progress',
    }),
    cancelCall: vi.fn().mockResolvedValue({
      kind: 'found',
      callRef,
      version: 2,
      toolRef,
      state: 'cancelled',
    }),
    reconcileCall: vi.fn().mockResolvedValue({
      kind: 'found',
      callRef,
      version: 3,
      toolRef,
      state: 'terminal',
    }),
  } as unknown as CallService
}

function reconciliationEvidence() {
  const material = {
    kind: 'action_invocation_reconciliation' as const,
    version: 1 as const,
    evidenceRef: 'evidence:one',
    source: 'provider:one',
    invocationRef: callRef,
    attemptRef: 'attempt:one',
    effectGeneration: 1,
    resolution: 'not_released' as const,
    observedAt: '2026-08-09T00:00:00.000Z',
  }
  return { ...material, digest: canonicalDigest(material) }
}

function x402ReconciliationEvidence() {
  const material = {
    kind: 'x402_payment_reconciliation' as const,
    version: 1 as const,
    evidenceRef: 'evidence:x402:one',
    source: 'provider:one',
    invocationRef: callRef,
    attemptRef: 'operation-attempt:one',
    effectGeneration: 1,
    operationRef: toolRef,
    inputDigest: 'sha256:input',
    requestDigest: 'sha256:request',
    transportObservationDigest: 'sha256:transport',
    paymentObservationDigest: 'sha256:payment',
    providerRef: 'provider:one',
    paymentIdentifier: 'payment:one',
    reservationRef: 'external-spend:one',
    challengeDigest: 'sha256:challenge',
    amount: { currency: 'USDC', units: '10000', exponent: 6 },
    settlementStatus: 'settled' as const,
    paymentResponseDigest: 'sha256:payment-response',
    transactionHash: `0x${'4'.repeat(64)}`,
    observedAt: '2026-08-30T22:32:40.000Z',
  }
  return { ...material, digest: canonicalDigest(material) }
}

describe('operation recovery HTTP adapters', () => {
  it('signs only the neutral internal admission command for status, cancel, and reconcile', async () => {
    installTestSourceWriteSecret()
    const calls: Array<{ path: string; args: [Record<string, unknown>] }> = []
    const results = [
      { kind: 'found', callRef, version: 1, toolRef, state: 'in_progress' },
      { kind: 'found', callRef, version: 2, toolRef, state: 'cancelled' },
      { kind: 'found', callRef, version: 3, toolRef, state: 'terminal' },
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
    const request = new Request('https://ae.example/api/v1/calls/recovery', { method: 'POST' })
    const executor = createCallService(request, '{}')
    try {
      await executor.readCallStatus({ callRef, principal, correlationId })
      await executor.cancelCall({
        callRef,
        idempotencyKey: 'cancel:source-write',
        principal,
        correlationId,
      })
      await executor.reconcileCall({
        callRef,
        idempotencyKey: 'reconcile:source-write',
        evidence,
        principal,
        correlationId,
      })
    } finally {
      restore()
    }

    expect(calls.map(({ path }) => path)).toEqual([
      'capabilityCalls:readCallStatus',
      'capabilityCalls:cancelCall',
      'capabilityCalls:reconcileCall',
    ])
    const expectedIdempotencyKeys = [
      `status:${callRef}`,
      'cancel:cancel:source-write',
      'reconcile:reconcile:source-write',
    ]
    for (const [index, call] of calls.entries()) {
      const outbound = call.args[0]
      const sourceWrite = outbound.sourceWrite as { commandDigest: string }
      expect(sourceWrite.commandDigest).toBe(sourceWriteCommandDigest({
        toolRef: '',
        input: {},
        idempotencyKey: expectedIdempotencyKeys[index],
        correlationId,
        operationKey: outbound.operationKey,
        principal,
      }))
      expect(outbound.callRef).toBe(callRef)
    }
    expect(calls[2]?.args[0]?.evidence).toEqual(evidence)
  })

  it('preserves original operation-key material across renamed purchase, Tool, and Call fields', async () => {
    installTestSourceWriteSecret()
    const quoteRef = `operation-commitment:v1:${'c'.repeat(64)}`
    const nestedInput = {
      operationRef: 'opaque:nested-operation-ref',
      requestMandate: 'opaque:nested-request-mandate',
      payload: { operationRef: 'opaque:deep-operation-ref' },
    }
    const quoteInput = { toolRef, input: nestedInput }
    const listInput = { limit: 7, cursor: 'cursor:one', state: 'completed' as const }
    const evidence = reconciliationEvidence()
    const values: Record<string, unknown> = {
      'capabilityCalls:call': {
        kind: 'completed',
        callRef,
        toolRef,
        output: { ok: true },
        evidenceHash: 'evidence:invoke',
        usage: {
          usageRef: 'usage:invoke',
          observedAt: 1_700_000_000_000,
          chargeState: 'free_tier',
          priceDigest: 'price:invoke',
          amount: { currency: 'AUD', units: '0', exponent: 2 },
        },
      },
      'capabilityQuotes:quote': {
        kind: 'committed',
        quoteRef,
        toolRef,
        toolVersion: 1,
        expiresAt: 1_900_000_000_000,
        normalizedInput: nestedInput,
        price: { currency: 'AUD', units: '100', exponent: 2 },
        account: {
          accountRef: 'account:operation-key',
          available: { currency: 'AUD', units: '1000', exponent: 2 },
        },
        budget: {
          principalRef: principal.principalId,
          maximumPerCall: { currency: 'AUD', units: '500', exponent: 2 },
        },
        policyRefs: ['policy:operation-key'],
        evidenceDigest: 'evidence:quote',
        continuation: {
          action: 'tool.call',
          method: 'POST',
          path: '/api/v1/tools/call',
          input: { quoteRef, idempotencyKey: 'invoke:one' },
        },
      },
      'capabilityCalls:listCalls': {
        page: [{ callRef, toolRef, state: 'completed', createdAt: 1, updatedAt: 1 }],
        isDone: true,
        continueCursor: '',
      },
      'capabilityCalls:readCallStatus': { kind: 'found', callRef, version: 1, toolRef, state: 'in_progress' },
      'capabilityCalls:cancelCall': { kind: 'found', callRef, version: 2, toolRef, state: 'cancelled' },
      'capabilityCalls:reconcileCall': { kind: 'found', callRef, version: 3, toolRef, state: 'terminal' },
    }
    const calls: Array<{ path: string; args: [Record<string, unknown>] }> = []
    const transport = createPublicSourceTransport({
      env: { CONVEX_URL: convexUrl },
      fetch: async (_input, init) => {
        const payload = JSON.parse(String(init?.body)) as { path: string; args: [Record<string, unknown>] }
        calls.push(payload)
        return new Response(JSON.stringify({ status: 'success', value: values[payload.path] }))
      },
    })
    const restore = setPublicSourceTransportForTests(transport)
    const correlationId = 'corr:operation-key-material'
    const executor = createCallService(new Request('https://ae.example/api/v1/calls'), '{}')
    try {
      await executor.callTool({
        input: { quoteRef, idempotencyKey: 'invoke:one' },
        principal,
        correlationId,
      })
      if (executor.quoteTool === undefined) throw new Error('quote_tool_service_unavailable')
      if (executor.listCalls === undefined) throw new Error('call_history_service_unavailable')
      await executor.quoteTool({ input: quoteInput, principal, correlationId })
      await executor.listCalls({ input: listInput, principal, correlationId })
      await executor.readCallStatus({ callRef, principal, correlationId })
      await executor.cancelCall({ callRef, idempotencyKey: 'cancel:one', principal, correlationId })
      await executor.reconcileCall({ callRef, idempotencyKey: 'reconcile:one', evidence, principal, correlationId })
    } finally {
      restore()
    }

    expect(calls.map(({ path }) => path)).toEqual([
      'capabilityCalls:call',
      'capabilityQuotes:quote',
      'capabilityCalls:listCalls',
      'capabilityCalls:readCallStatus',
      'capabilityCalls:cancelCall',
      'capabilityCalls:reconcileCall',
    ])
    const expectedCommands: readonly unknown[] = [
      { commitmentRef: quoteRef, idempotencyKey: 'invoke:one' },
      { operationRef: toolRef, input: nestedInput },
      listInput,
      callRef,
      { invocationRef: callRef, idempotencyKey: 'cancel:one' },
      { invocationRef: callRef, idempotencyKey: 'reconcile:one', evidence },
    ]
    const expectedOperationKeys = [
      'sha256:d1d2b4680059e2d845aae9a0e244940364b81a4a0b1b5ba6f0838db21904318d',
      'sha256:7c8e4e19029e78dbbc2c042e4294c0079200f8a46e1df59c6872b4ef149d5c52',
      'sha256:8c6b384bbe3033d38464c12e8555a0da80d45faf38d7a478b0c35669c8ac6c3d',
      'sha256:fdd9c0097b904cdc179f63fbfee4cf0586fa17872584aa8603cab79d19f2ea6e',
      'sha256:d15f2fe0ce96da19980439babee23a4e7f3214267dc7aed8b47348c6feaa9b1b',
      'sha256:3b134dc606334f6a81959a92893c57105bb75a314ff4ecec84d533b7567f905e',
    ] as const
    expect(expectedCommands.map((command) => canonicalDigest({
      contract: 'operation.invoke',
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      applicationRef: principal.applicationRef,
      environment: principal.environment,
      command,
    }))).toEqual(expectedOperationKeys)
    expect(calls.map(({ args }) => args[0].operationKey)).toEqual(expectedOperationKeys)
    expect(calls[0]?.args[0]).toMatchObject({ quoteRef, idempotencyKey: 'invoke:one' })
    expect(calls[1]?.args[0]).toMatchObject({ toolRef, input: nestedInput })
    expect(calls[3]?.args[0]).toMatchObject({ callRef })
    expect(calls[4]?.args[0]).toMatchObject({ callRef, idempotencyKey: 'cancel:one' })
    expect(calls[5]?.args[0]).toMatchObject({ callRef, idempotencyKey: 'reconcile:one', evidence })
  })

  it('requires the authenticated invocation scope before status lookup', async () => {
    const executor = service()
    const response = await handleCallStatusGet(
      new Request(`https://ae.example/api/v1/calls/${callRef}`),
      callRef,
      {
        authenticate: async () => ({
          isAuthenticated: false,
          tokenType: null,
          id: null,
          subject: null,
          scopes: null,
        }),
        callService: executor,
      },
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(executor.readCallStatus).not.toHaveBeenCalled()
  })

  it('projects status and cancellation through one principal and correlation', async () => {
    const executor = service()
    const statusResponse = await handleCallStatusGet(
      new Request(`https://ae.example/api/v1/calls/${callRef}`, {
        headers: { 'x-ae-request-id': 'corr_recovery_http' },
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )
    const cancelResponse = await handleCallCancelPost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'cancel:one' }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(statusResponse.status).toBe(200)
    expect(cancelResponse.status).toBe(200)
    expect(executor.readCallStatus).toHaveBeenCalledWith({
      callRef,
      principal,
      correlationId: 'corr_recovery_http',
    })
    expect(executor.cancelCall).toHaveBeenCalledWith({
      callRef,
      idempotencyKey: 'cancel:one',
      principal,
      correlationId: expect.any(String),
    })
  })

  it('accepts only canonical reconciliation evidence and preserves uncertain cancellation', async () => {
    const executor = service()
    vi.mocked(executor.cancelCall).mockResolvedValueOnce({
      kind: 'reconciliation_required',
      callRef,
      toolRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'provider:one',
      },
    })
    const evidence = reconciliationEvidence()
    const response = await handleCallReconcilePost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/reconcile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'reconcile:one', evidence }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )
    const cancelled = await handleCallCancelPost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'cancel:after-release' }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(response.status).toBe(200)
    expect(cancelled.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    await expect(cancelled.json()).resolves.toMatchObject({ kind: 'reconciliation_required' })
    expect(executor.reconcileCall).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      evidence,
      idempotencyKey: 'reconcile:one',
    }))
  })

  it('admits exact x402 recovery evidence and rejects malformed evidence before service dispatch', async () => {
    const executor = service()
    const evidence = x402ReconciliationEvidence()
    const accepted = await handleCallReconcilePost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/reconcile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'reconcile:x402:one', evidence }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )
    const malformed = await handleCallReconcilePost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/reconcile`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: 'reconcile:x402:malformed',
          evidence: { ...evidence, transactionHash: '0x1234' },
        }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(accepted.status).toBe(200)
    expect(malformed.status).toBe(400)
    expect(executor.reconcileCall).toHaveBeenCalledTimes(1)
    expect(executor.reconcileCall).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      idempotencyKey: 'reconcile:x402:one',
      evidence,
    }))
  })

  it('requires body identity before cancelling', async () => {
    const secret = 'provider-token-should-never-cross-the-boundary'
    const executor = service()
    const missingBodyResponse = await handleCallCancelPost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: secret }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )
    const missingBody = await missingBodyResponse.text()

    expect(missingBodyResponse.status).toBe(400)
    expect(missingBodyResponse.headers.get('content-type')).toContain('application/problem+json')
    expect(missingBody).not.toContain(secret)
    expect(executor.cancelCall).not.toHaveBeenCalled()

    const bodyIdentityResponse = await handleCallCancelPost(
      new Request(`https://ae.example/api/v1/calls/${callRef}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: 'body:two' }),
      }),
      callRef,
      { authenticate, resolvePrincipal: resolveCanonicalPrincipal, callService: executor },
    )

    expect(bodyIdentityResponse.status).toBe(200)
    expect(executor.cancelCall).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      idempotencyKey: 'body:two',
    }))
  })
})
