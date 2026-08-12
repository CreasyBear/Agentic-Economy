import { canonicalDigest } from '@/modules/common/canonical-digest'
import { describe, expect, it, vi } from 'vitest'

import {
  operationCancelAction,
  operationReconcileAction,
  operationStatusAction,
  operationReconciliationEvidenceSchema,
} from '@/modules/capability-execution/operation-recovery.actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { operationInvokeAction } from '@/modules/capability-execution/operation-invoke.actions'

const principal = {
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_operations:invoke'],
  authorityMode: 'approve_each' as const,
}

const status = {
  kind: 'found' as const,
  invocationRef: 'operation-invocation:v1:one',
  operationRef: 'operation:one',
  state: 'terminal' as const,
}
const reconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation',
  version: 1,
  evidenceRef: 'evidence:recovery:one',
  source: 'operation:one',
  invocationRef: status.invocationRef,
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  resolution: 'not_released',
  observedAt: '2026-08-09T00:00:00.000Z',
} as const
const reconciliationEvidence = {
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
}

describe('operation recovery actions', () => {
  it('declare one credential-admitted status/cancel/reconcile family', () => {
    expect([operationStatusAction, operationCancelAction, operationReconcileAction].map((action) => action.id))
      .toEqual(['operation.status', 'operation.cancel', 'operation.reconcile'])
    for (const action of [operationStatusAction, operationCancelAction, operationReconcileAction]) {
      expect(action.credentialAdmission).toEqual({
        scope: 'market_operations:invoke',
        authority: 'descriptor_classified',
      })
      expect(action.surfaces).toEqual(operationInvokeAction.surfaces)
    }
  })
  it('keeps the route/action graph and optional evidence fields in parity', () => {
    expect(operationStatusAction.id).toBe(OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId)
    expect(operationCancelAction.id).toBe(OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId)
    expect(operationReconcileAction.id).toBe(OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId)
    expect(OPERATION_INVOKE_ROUTE_CONTRACT.status.path).toBe('/api/v1/operations/{invocationRef}')
    expect(OPERATION_INVOKE_ROUTE_CONTRACT.cancel.path).toBe('/api/v1/operations/{invocationRef}/cancel')
    expect(OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.path).toBe('/api/v1/operations/{invocationRef}/reconcile')

    const statusWithGeneration = operationStatusAction.outputSchema.parse({ ...status, effectGeneration: 4 })
    expect(statusWithGeneration).toMatchObject({ state: 'terminal', effectGeneration: 4 })
    const cancelledStatus = operationCancelAction.outputSchema.parse({
      kind: 'found',
      invocationRef: status.invocationRef,
      operationRef: status.operationRef,
      state: 'cancelled',
      result: {
        kind: 'refused',
        operationRef: status.operationRef,
        code: 'invocation_cancelled',
        retryable: false,
      },
    })
    expect(cancelledStatus).toMatchObject({
      state: 'cancelled',
      result: { code: 'invocation_cancelled' },
    })

    const x402Material = {
      ...reconciliationEvidenceMaterial,
      operationRef: status.operationRef,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      providerIdentity: 'provider:one',
      paymentIdentifier: 'payment:one',
      transportObservationDigest: 'sha256:transport',
      paymentObservationDigest: 'sha256:payment',
    } as const
    const x402Evidence = operationReconciliationEvidenceSchema.parse({
      ...x402Material,
      digest: canonicalDigest(x402Material),
    })
    expect(x402Evidence).toMatchObject({
      operationRef: status.operationRef,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      paymentIdentifier: 'payment:one',
      transportObservationDigest: 'sha256:transport',
      paymentObservationDigest: 'sha256:payment',
    })
  })

  it('rejects transport and provider overrides at the action boundary', () => {
    expect(operationStatusAction.schema.safeParse({
      invocationRef: 'operation-invocation:v1:one',
      endpoint: 'https://supplier.example',
    }).success).toBe(false)
    expect(operationCancelAction.schema.safeParse({
      invocationRef: 'operation-invocation:v1:one',
      idempotencyKey: 'cancel:one',
      provider: 'supplier:one',
    }).success).toBe(false)
    expect(operationReconcileAction.schema.safeParse({
      invocationRef: 'operation-invocation:v1:one',
      evidence: { resolution: 'not_released' },
      idempotencyKey: 'reconcile:one',
      credentialRef: 'secret-ref',
    }).success).toBe(false)
    expect(operationReconcileAction.schema.safeParse({
      invocationRef: status.invocationRef,
      evidence: { ...reconciliationEvidence, observedAt: new Date() },
      idempotencyKey: 'reconcile:date',
    }).success).toBe(false)
  })

  it('delegates status, cancellation, and reconciliation with server principal and correlation', async () => {
    const readInvocationStatus = vi.fn().mockResolvedValue(status)
    const cancelInvocation = vi.fn().mockResolvedValue({ ...status, state: 'cancelled' as const })
    const reconcileInvocation = vi.fn().mockResolvedValue({
      ...status,
      state: 'terminal' as const,
    })
    const context = {
      agentAccessPrincipal: principal,
      correlationId: 'corr_recovery_1',
      operationInvokeService: {
        invokeOperation: vi.fn(),
        readInvocationStatus,
        cancelInvocation,
        reconcileInvocation,
      },
    }

    await expect(operationStatusAction.run({
      data: { invocationRef: status.invocationRef },
      context,
    })).resolves.toEqual(status)
    await expect(operationCancelAction.run({
      data: { invocationRef: status.invocationRef, idempotencyKey: 'cancel:one' },
      context,
    })).resolves.toMatchObject({ state: 'cancelled' })
    await expect(operationReconcileAction.run({
      data: {
        invocationRef: status.invocationRef,
        evidence: reconciliationEvidence,
        idempotencyKey: 'reconcile:one',
      },
      context,
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })

    expect(readInvocationStatus).toHaveBeenCalledWith({
      invocationRef: status.invocationRef,
      principal,
      correlationId: 'corr_recovery_1',
    })
    expect(cancelInvocation).toHaveBeenCalledWith({
      invocationRef: status.invocationRef,
      idempotencyKey: 'cancel:one',
      principal,
      correlationId: 'corr_recovery_1',
    })
    expect(reconcileInvocation).toHaveBeenCalledWith({
      invocationRef: status.invocationRef,
      evidence: reconciliationEvidence,
      idempotencyKey: 'reconcile:one',
      principal,
      correlationId: 'corr_recovery_1',
    })
  })

  it('preserves reconciliation-required cancellation after a possible release', async () => {
    const cancelInvocation = vi.fn().mockResolvedValue({
      kind: 'reconciliation_required' as const,
      invocationRef: status.invocationRef,
      operationRef: status.operationRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry' as const,
        evidenceSource: 'operation:one',
      },
    })
    const result = await operationCancelAction.run({
      data: { invocationRef: status.invocationRef, idempotencyKey: 'cancel:post-release' },
      context: {
        agentAccessPrincipal: principal,
        correlationId: 'corr_recovery_2',
        operationInvokeService: {
          invokeOperation: vi.fn(),
          readInvocationStatus: vi.fn(),
          cancelInvocation,
          reconcileInvocation: vi.fn(),
        },
      },
    })
    expect(result).toMatchObject({ kind: 'reconciliation_required', evidence: { retry: 'reconcile_before_retry' } })
  })
})