import {
  authenticateWithScopes,
  currentOperationRef,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  ReconciliationEvidence,
  ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation/reconciliation-evidence'
import {
  operationReconciliationEvidenceSchema,
} from '@/modules/capability-execution/operation-recovery.actions'
import type {
  OperationInvokeRecoveryResult,
  OperationInvokeStatusResult,
} from '@/modules/capability-execution/operation-recovery-contracts'

const invocationRef = `operation-invocation:v1:${'b'.repeat(64)}`
const reconciliationEvidenceMaterial: ReconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation',
  version: 1,
  evidenceRef: 'evidence:recovery:one',
  source: 'provider:one',
  invocationRef,
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  operationRef: currentOperationRef,
  inputDigest: 'sha256:input',
  requestDigest: 'sha256:request',
  providerIdentity: 'provider:one',
  paymentIdentifier: 'payment:one',
  transportObservationDigest: 'sha256:transport',
  paymentObservationDigest: 'sha256:payment',
  resolution: 'not_released',
  observedAt: '2026-08-09T00:00:00.000Z',
}
const reconciliationEvidence: ReconciliationEvidence = operationReconciliationEvidenceSchema.parse({
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
})

afterEach(() => vi.unstubAllEnvs())

describe('MCP host adapter operation recovery', () => {
  it('returns the canonical bearer challenge for an unauthenticated status request without calling the service', async () => {
    vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://canonical.example')
    const operationInvokeService = {
      invokeOperation: vi.fn(),
      readInvocationStatus: vi.fn(),
      cancelInvocation: vi.fn(),
      reconcileInvocation: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'unauthenticated-status',
      method: 'tools/call',
      params: {
        name: 'ae_operation_status',
        arguments: { invocationRef },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: false,
        tokenType: null,
        id: null,
        subject: null,
        scopes: null,
      }),
      operationInvokeService,
    })

    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://canonical.example/.well-known/oauth-protected-resource", scope="market_operations:invoke"',
    )
    expect(operationInvokeService.readInvocationStatus).not.toHaveBeenCalled()
  })

  it('lists all operation invocation and recovery tools for an operation principal', async () => {
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-recovery-list',
      method: 'tools/list',
      params: {},
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'ae_operation_invoke' }),
        expect.objectContaining({ name: 'ae_operation_status' }),
        expect.objectContaining({ name: 'ae_operation_cancel' }),
        expect.objectContaining({ name: 'ae_operation_reconcile' }),
      ]),
    })
  })

  it('delegates authenticated status once and returns a structured found reconciliation state', async () => {
    const statusResult: OperationInvokeStatusResult = {
      kind: 'found',
      invocationRef,
      operationRef: currentOperationRef,
      state: 'reconciliation_required',
      attemptRef: 'attempt:one',
      effectGeneration: 1,
    }
    const operationInvokeService = {
      invokeOperation: vi.fn(),
      readInvocationStatus: vi.fn().mockResolvedValue(statusResult),
      cancelInvocation: vi.fn(),
      reconcileInvocation: vi.fn(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-status',
      method: 'tools/call',
      params: {
        name: 'ae_operation_status',
        arguments: { invocationRef },
      },
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      operationInvokeService,
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      structuredContent: { result: statusResult },
    })
    expect(operationInvokeService.readInvocationStatus).toHaveBeenCalledOnce()
    expect(operationInvokeService.readInvocationStatus).toHaveBeenCalledWith(expect.objectContaining({
      invocationRef,
      principal: expect.objectContaining({
        credentialId: 'key:test',
        ownerId: 'user_test',
      }),
      correlationId: expect.any(String),
    }))
  })

  it('delegates the caller cancellation key once and returns reconciliation required', async () => {
    const cancelResult: OperationInvokeRecoveryResult = {
      kind: 'reconciliation_required',
      invocationRef,
      operationRef: currentOperationRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'provider:one',
      },
    }
    const operationInvokeService = {
      invokeOperation: vi.fn(),
      readInvocationStatus: vi.fn(),
      cancelInvocation: vi.fn().mockResolvedValue(cancelResult),
      reconcileInvocation: vi.fn(),
    }
    const idempotencyKey = 'cancel:caller-one'
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-cancel',
      method: 'tools/call',
      params: {
        name: 'ae_operation_cancel',
        arguments: { invocationRef, idempotencyKey },
      },
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      operationInvokeService,
    }, {
      authorization: 'Bearer operation-recovery',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect(body.result).toMatchObject({
      structuredContent: { result: cancelResult },
    })
    expect(operationInvokeService.cancelInvocation).toHaveBeenCalledOnce()
    expect(operationInvokeService.cancelInvocation).toHaveBeenCalledWith(expect.objectContaining({
      invocationRef,
      idempotencyKey,
    }))
  })

  it('delegates canonical reconciliation evidence once per request and repeats the same terminal result', async () => {
    const reconcileResult: OperationInvokeRecoveryResult = {
      kind: 'found',
      invocationRef,
      operationRef: currentOperationRef,
      state: 'terminal',
    }
    const operationInvokeService = {
      invokeOperation: vi.fn(),
      readInvocationStatus: vi.fn(),
      cancelInvocation: vi.fn(),
      reconcileInvocation: vi.fn().mockResolvedValue(reconcileResult),
    }
    const idempotencyKey = 'reconcile:caller-one'
    const request = {
      jsonrpc: '2.0',
      id: 'operation-reconcile',
      method: 'tools/call',
      params: {
        name: 'ae_operation_reconcile',
        arguments: { invocationRef, evidence: reconciliationEvidence, idempotencyKey },
      },
    }
    const options = {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      operationInvokeService,
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
    expect(operationInvokeService.reconcileInvocation).toHaveBeenCalledTimes(2)
    expect(operationInvokeService.reconcileInvocation).toHaveBeenNthCalledWith(1, expect.objectContaining({
      invocationRef,
      evidence: reconciliationEvidence,
      idempotencyKey,
    }))
    expect(operationInvokeService.reconcileInvocation).toHaveBeenNthCalledWith(2, expect.objectContaining({
      invocationRef,
      evidence: reconciliationEvidence,
      idempotencyKey,
    }))
  })
})
