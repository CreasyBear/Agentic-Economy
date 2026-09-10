import {
  authenticateWithScopes,
  currentToolRef,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  ReconciliationEvidence,
  ReconciliationEvidenceMaterial,
} from '@/modules/action-execution/runtime'
import {
  callReconciliationEvidenceSchema,
} from '@/modules/capability-execution/call-recovery.actions'
import type {
  CallRecoveryResult,
  CallStatusResult,
} from '@/modules/capability-execution/call-recovery-contracts'

const callRef = `operation-invocation:v1:${'b'.repeat(64)}`
const reconciliationEvidenceMaterial: ReconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation',
  version: 1,
  evidenceRef: 'evidence:recovery:one',
  source: 'provider:one',
  invocationRef: callRef,
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  operationRef: currentToolRef,
  inputDigest: 'sha256:input',
  requestDigest: 'sha256:request',
  providerIdentity: 'provider:one',
  paymentIdentifier: 'payment:one',
  transportObservationDigest: 'sha256:transport',
  paymentObservationDigest: 'sha256:payment',
  resolution: 'not_released',
  observedAt: '2026-08-09T00:00:00.000Z',
}
const reconciliationEvidence: ReconciliationEvidence = callReconciliationEvidenceSchema.parse({
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
})

afterEach(() => vi.unstubAllEnvs())

describe('MCP host adapter operation recovery', () => {
  it('returns the canonical bearer challenge for an unauthenticated status request without calling the service', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.example')
    const callService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'unauthenticated-status',
      method: 'tools/call',
      params: {
        name: 'ae_call_status',
        arguments: { callRef },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: false,
        tokenType: null,
        id: null,
        subject: null,
        scopes: null,
      }),
      callService,
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://canonical.example/.well-known/oauth-protected-resource", scope="market_tools:call"',
    )
    expect(callService.readCallStatus).not.toHaveBeenCalled()
  })

  it('lists all operation invocation and recovery tools for an operation principal', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-recovery-list',
      method: 'tools/list',
      params: {},
    }, {
      authenticate: authenticateWithScopes(['market_tools:call']),
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'ae_tool_call' }),
        expect.objectContaining({ name: 'ae_call_list' }),
        expect.objectContaining({ name: 'ae_call_status' }),
        expect.objectContaining({ name: 'ae_call_cancel' }),
        expect.objectContaining({ name: 'ae_call_reconcile' }),
      ]),
    })
  })

  it('delegates one bounded history page without exposing invocation input or output', async () => {
    const historyResult = {
      kind: 'available' as const,
      items: [{
        callRef,
        toolRef: currentToolRef,
        state: 'completed' as const,
        createdAt: 10,
        updatedAt: 20,
      }],
      hasMore: false,
    }
    const callService = {
      callTool: vi.fn(),
      listCalls: vi.fn().mockResolvedValue(historyResult),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-list',
      method: 'tools/call',
      params: {
        name: 'ae_call_list',
        arguments: { limit: 5, state: 'completed' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_tools:call']),
      callService,
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({ structuredContent: { result: historyResult } })
    expect(JSON.stringify(body)).not.toContain('previousInput')
    expect(callService.listCalls).toHaveBeenCalledWith(expect.objectContaining({
      input: { limit: 5, state: 'completed' },
    }))
  })

  it('delegates authenticated status once and returns a structured found reconciliation state', async () => {
    const statusResult: CallStatusResult = {
      kind: 'found',
      version: 1,
      callRef,
      toolRef: currentToolRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:one',
      effectGeneration: 1,
    }
    const callService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn().mockResolvedValue(statusResult),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-status',
      method: 'tools/call',
      params: {
        name: 'ae_call_status',
        arguments: { callRef },
      },
    }, {
      authenticate: authenticateWithScopes(['market_tools:call']),
      callService,
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      structuredContent: { result: statusResult },
    })
    expect(callService.readCallStatus).toHaveBeenCalledOnce()
    expect(callService.readCallStatus).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      principal: expect.objectContaining({
        credentialId: 'key:test',
        ownerId: 'acc_00000000000040008000000000000044',
      }),
      correlationId: expect.any(String),
    }))
  })

  it('delegates the caller cancellation key once and returns reconciliation required', async () => {
    const cancelResult: CallRecoveryResult = {
      kind: 'reconciliation_required',
      callRef,
      toolRef: currentToolRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'provider:one',
      },
    }
    const callService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn().mockResolvedValue(cancelResult),
      reconcileCall: vi.fn(),
    }
    const idempotencyKey = 'cancel:caller-one'
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-cancel',
      method: 'tools/call',
      params: {
        name: 'ae_call_cancel',
        arguments: { callRef, idempotencyKey },
      },
    }, {
      authenticate: authenticateWithScopes(['market_tools:call']),
      callService,
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      structuredContent: { result: cancelResult },
    })
    expect(callService.cancelCall).toHaveBeenCalledOnce()
    expect(callService.cancelCall).toHaveBeenCalledWith(expect.objectContaining({
      callRef,
      idempotencyKey,
    }))
  })

  it('delegates canonical reconciliation evidence once per request and repeats the same terminal result', async () => {
    const reconcileResult: CallRecoveryResult = {
      kind: 'found',
      version: 1,
      callRef,
      toolRef: currentToolRef,
      state: 'terminal',
    }
    const callService = {
      callTool: vi.fn(),
      readCallStatus: vi.fn(),
      cancelCall: vi.fn(),
      reconcileCall: vi.fn().mockResolvedValue(reconcileResult),
    }
    const idempotencyKey = 'reconcile:caller-one'
    const request = {
      jsonrpc: '2.0',
      id: 'operation-reconcile',
      method: 'tools/call',
      params: {
        name: 'ae_call_reconcile',
        arguments: { callRef, evidence: reconciliationEvidence, idempotencyKey },
      },
    }
    const options = {
      authenticate: authenticateWithScopes(['market_tools:call']),
      callService,
    }
    const headers = { authorization: 'Bearer operation-recovery' }
    const firstResponse = await postMcp(request, options, headers)
    const secondResponse = await postMcp(request, options, headers)

    expect(firstResponse.status).toBe(200)
    expect(secondResponse.status).toBe(200)
    const firstBody = await readMcpBody(firstResponse)
    const secondBody = await readMcpBody(secondResponse)
    expect(firstBody.result).toMatchObject({
      structuredContent: { result: reconcileResult },
    })
    expect(secondBody.result).toMatchObject({
      structuredContent: { result: reconcileResult },
    })
    expect(callService.reconcileCall).toHaveBeenCalledTimes(2)
    expect(callService.reconcileCall).toHaveBeenNthCalledWith(1, expect.objectContaining({
      callRef,
      evidence: reconciliationEvidence,
      idempotencyKey,
    }))
    expect(callService.reconcileCall).toHaveBeenNthCalledWith(2, expect.objectContaining({
      callRef,
      evidence: reconciliationEvidence,
      idempotencyKey,
    }))
  })
})
