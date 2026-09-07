import { canonicalDigest } from '@/modules/common/canonical-digest'
import { describe, expect, it, vi } from 'vitest'

import {
  callCancelAction,
  callReconcileAction,
  callStatusAction,
  callReconciliationEvidenceInputSchema,
  callReconciliationEvidenceSchema,
  x402CallReconciliationEvidenceSchema,
} from '@/modules/capability-execution/call-recovery.actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { callAction } from '@/modules/capability-execution/call.actions'
import type { CallReceipt } from '@/modules/capability-execution/call-contracts'

const principal = {
  principalId: 'principal:one',
  ownerId: 'owner:one',
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

const status = {
  kind: 'found' as const,
  version: 1,
  callRef: 'operation-invocation:v1:one',
  toolRef: 'operation:one',
  state: 'terminal' as const,
}
const reconciliationEvidenceMaterial = {
  kind: 'action_invocation_reconciliation',
  version: 1,
  evidenceRef: 'evidence:recovery:one',
  source: 'operation:one',
  invocationRef: status.callRef,
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  resolution: 'not_released',
  observedAt: '2026-08-09T00:00:00.000Z',
} as const
const reconciliationEvidence = {
  ...reconciliationEvidenceMaterial,
  digest: canonicalDigest(reconciliationEvidenceMaterial),
}
const x402ReconciliationEvidenceMaterial = {
  kind: 'x402_payment_reconciliation',
  version: 1,
  evidenceRef: 'evidence:x402:one',
  source: 'provider:one',
  invocationRef: status.callRef,
  attemptRef: 'operation-attempt:one',
  effectGeneration: 1,
  operationRef: status.toolRef,
  inputDigest: 'sha256:input',
  requestDigest: 'sha256:request',
  transportObservationDigest: 'sha256:transport',
  paymentObservationDigest: 'sha256:payment',
  providerRef: 'provider:one',
  paymentIdentifier: 'payment:one',
  reservationRef: 'external-spend:one',
  challengeDigest: 'sha256:challenge',
  amount: { currency: 'USDC', units: '10000', exponent: 6 },
  settlementStatus: 'settled',
  paymentResponseDigest: 'sha256:payment-response',
  transactionHash: `0x${'4'.repeat(64)}`,
  observedAt: '2026-08-30T22:32:40.000Z',
} as const
const x402ReconciliationEvidence = {
  ...x402ReconciliationEvidenceMaterial,
  digest: canonicalDigest(x402ReconciliationEvidenceMaterial),
}
const receipt: CallReceipt = {
  commercialModel: 'seller_canary_x402',
  receiptRef: 'receipt:operation-one',
  state: 'settled',
  network: 'eip155:8453',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  providerQuotedAmount: { currency: 'USDC', units: '100', exponent: 6 },
  agenticEconomyFee: { currency: 'USDC', units: '10', exponent: 6 },
  totalBuyerAuthorization: { currency: 'USDC', units: '110', exponent: 6 },
  priceDigest: 'sha256:price',
  transactionRef: 'money:operation-one',
  settlementTransactionHash: '0xsettlement',
  paymentIdentifier: 'payment:opaque',
  accountingTransactionRefs: ['money:operation-one'],
  refundState: 'not_applicable',
  lossState: 'none',
  externalSettlementRef: 'settlement:opaque',
  evidenceHash: 'sha256:evidence',
  issuedAt: '2026-08-09T00:00:00.000Z',
}

describe('Call recovery actions', () => {
  it('declare one credential-admitted status/cancel/reconcile family', () => {
    expect([callStatusAction, callCancelAction, callReconcileAction].map((action) => action.id))
      .toEqual(['call.status', 'call.cancel', 'call.reconcile'])
    for (const action of [callStatusAction, callCancelAction, callReconcileAction]) {
      expect(action.credentialAdmission).toEqual({
        scope: 'market_tools:call',
        authority: 'descriptor_classified',
      })
      expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
    }
  })
  it('keeps the route/action graph and optional evidence fields in parity', () => {
    expect(callAction.id).toBe(CALL_ROUTE_CONTRACT.call.actionId)
    expect(callStatusAction.id).toBe(CALL_ROUTE_CONTRACT.status.actionId)
    expect(callCancelAction.id).toBe(CALL_ROUTE_CONTRACT.cancel.actionId)
    expect(callReconcileAction.id).toBe(CALL_ROUTE_CONTRACT.reconcile.actionId)
    expect(CALL_ROUTE_CONTRACT.status.path).toBe('/api/v1/calls/{callRef}')
    expect(CALL_ROUTE_CONTRACT.cancel.path).toBe('/api/v1/calls/{callRef}/cancel')
    expect(CALL_ROUTE_CONTRACT.reconcile.path).toBe('/api/v1/calls/{callRef}/reconcile')

    const statusWithGeneration = callStatusAction.outputSchema.parse({ ...status, effectGeneration: 4 })
    expect(statusWithGeneration).toMatchObject({ state: 'terminal', effectGeneration: 4 })
    const cancelledStatus = callCancelAction.outputSchema.parse({
      kind: 'found',
      version: 1,
      callRef: status.callRef,
      toolRef: status.toolRef,
      state: 'cancelled',
      result: {
        kind: 'refused',
        toolRef: status.toolRef,
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
      operationRef: status.toolRef,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      providerIdentity: 'provider:one',
      paymentIdentifier: 'payment:one',
      transportObservationDigest: 'sha256:transport',
      paymentObservationDigest: 'sha256:payment',
    } as const
    const x402Evidence = callReconciliationEvidenceSchema.parse({
      ...x402Material,
      digest: canonicalDigest(x402Material),
    })
    expect(x402Evidence).toMatchObject({
      operationRef: status.toolRef,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      paymentIdentifier: 'payment:one',
      transportObservationDigest: 'sha256:transport',
      paymentObservationDigest: 'sha256:payment',
    })
  })

  it('accepts the exact public x402 recovery evidence shape', () => {
    expect(x402CallReconciliationEvidenceSchema.parse(x402ReconciliationEvidence))
      .toEqual(x402ReconciliationEvidence)
    expect(callReconciliationEvidenceInputSchema.parse(x402ReconciliationEvidence))
      .toEqual(x402ReconciliationEvidence)
    expect(callReconcileAction.schema.parse({
      callRef: status.callRef,
      idempotencyKey: 'reconcile:x402:one',
      evidence: x402ReconciliationEvidence,
    })).toEqual({
      callRef: status.callRef,
      idempotencyKey: 'reconcile:x402:one',
      evidence: x402ReconciliationEvidence,
    })
  })

  it.each([
    ['wrong discriminant', { kind: 'action_invocation_reconciliation' }],
    ['unknown settlement', { settlementStatus: 'unknown' }],
    ['malformed transaction hash', { transactionHash: '0x1234' }],
    ['non-canonical units', { amount: { currency: 'USDC', units: '010000', exponent: 6 } }],
    ['non-canonical currency', { amount: { currency: 'usdc', units: '10000', exponent: 6 } }],
    ['invalid exponent', { amount: { currency: 'USDC', units: '10000', exponent: 19 } }],
    ['invalid observed time', { observedAt: 'not-a-time' }],
    ['unknown field', { providerCredential: 'must-not-cross' }],
  ])('rejects malformed x402 evidence: %s', (_case, override) => {
    const malformed = { ...x402ReconciliationEvidence, ...override }
    expect(x402CallReconciliationEvidenceSchema.safeParse(malformed).success).toBe(false)
    expect(callReconciliationEvidenceInputSchema.safeParse(malformed).success).toBe(false)
  })

  it('rejects x402 evidence whose canonical digest no longer matches', () => {
    expect(x402CallReconciliationEvidenceSchema.safeParse({
      ...x402ReconciliationEvidence,
      providerRef: 'provider:tampered',
    }).success).toBe(false)
  })

  it('round-trips additive receipts for success, refund, and reconciliation while preserving absence', () => {
    const settled = callStatusAction.outputSchema.parse({ ...status, receipt })
    expect(settled).toMatchObject({
      receipt: {
        state: 'settled',
        commercialModel: 'seller_canary_x402',
        paymentIdentifier: 'payment:opaque',
      },
    })

    const refunded = callCancelAction.outputSchema.parse({
      kind: 'found',
      version: 1,
      callRef: status.callRef,
      toolRef: status.toolRef,
      state: 'terminal',
      receipt: { ...receipt, state: 'refunded', refundState: 'released', lossState: 'provider_output_invalid' },
    })
    expect(refunded).toMatchObject({ receipt: { state: 'refunded', refundState: 'released', lossState: 'provider_output_invalid' } })

    const reconciliation = callReconcileAction.outputSchema.parse({
      kind: 'reconciliation_required',
      callRef: status.callRef,
      toolRef: status.toolRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry',
        evidenceSource: 'operation:one',
      },
      receipt: { ...receipt, state: 'reconciliation_required', refundState: 'unknown', lossState: 'unknown' },
    })
    expect(reconciliation).toMatchObject({ receipt: { state: 'reconciliation_required', refundState: 'unknown', lossState: 'unknown' } })

    expect(callStatusAction.outputSchema.parse(status)).not.toHaveProperty('receipt')
    expect(callCancelAction.outputSchema.parse({
      kind: 'refused',
      callRef: status.callRef,
      code: 'invocation_not_found',
      retryable: false,
    })).not.toHaveProperty('receipt')
  })

  it('rejects transport and provider overrides at the action boundary', () => {
    expect(callStatusAction.schema.safeParse({
      callRef: 'operation-invocation:v1:one',
      endpoint: 'https://supplier.example',
    }).success).toBe(false)
    expect(callCancelAction.schema.safeParse({
      callRef: 'operation-invocation:v1:one',
      idempotencyKey: 'cancel:one',
      provider: 'supplier:one',
    }).success).toBe(false)
    expect(callReconcileAction.schema.safeParse({
      callRef: 'operation-invocation:v1:one',
      evidence: { resolution: 'not_released' },
      idempotencyKey: 'reconcile:one',
      credentialRef: 'secret-ref',
    }).success).toBe(false)
    expect(callReconcileAction.schema.safeParse({
      callRef: status.callRef,
      evidence: { ...reconciliationEvidence, observedAt: new Date() },
      idempotencyKey: 'reconcile:date',
    }).success).toBe(false)
  })

  it('delegates status, cancellation, and reconciliation with server principal and correlation', async () => {
    const readCallStatus = vi.fn().mockResolvedValue(status)
    const cancelCall = vi.fn().mockResolvedValue({ ...status, state: 'cancelled' as const })
    const reconcileCall = vi.fn().mockResolvedValue({
      ...status,
      state: 'terminal' as const,
    })
    const context = {
      agentAccessPrincipal: principal,
      correlationId: 'corr_recovery_1',
      callService: {
        callTool: vi.fn(),
        readCallStatus,
        cancelCall,
        reconcileCall,
      },
    }

    await expect(callStatusAction.run({
      data: { callRef: status.callRef },
      context,
    })).resolves.toEqual(status)
    await expect(callCancelAction.run({
      data: { callRef: status.callRef, idempotencyKey: 'cancel:one' },
      context,
    })).resolves.toMatchObject({ state: 'cancelled' })
    await expect(callReconcileAction.run({
      data: {
        callRef: status.callRef,
        evidence: reconciliationEvidence,
        idempotencyKey: 'reconcile:one',
      },
      context,
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })

    expect(readCallStatus).toHaveBeenCalledWith({
      callRef: status.callRef,
      principal,
      correlationId: 'corr_recovery_1',
    })
    expect(cancelCall).toHaveBeenCalledWith({
      callRef: status.callRef,
      idempotencyKey: 'cancel:one',
      principal,
      correlationId: 'corr_recovery_1',
    })
    expect(reconcileCall).toHaveBeenCalledWith({
      callRef: status.callRef,
      evidence: reconciliationEvidence,
      idempotencyKey: 'reconcile:one',
      principal,
      correlationId: 'corr_recovery_1',
    })
  })

  it('preserves reconciliation-required cancellation after a possible release', async () => {
    const cancelCall = vi.fn().mockResolvedValue({
      kind: 'reconciliation_required' as const,
      callRef: status.callRef,
      toolRef: status.toolRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-09T00:00:00.000Z',
        retry: 'reconcile_before_retry' as const,
        evidenceSource: 'operation:one',
      },
    })
    const result = await callCancelAction.run({
      data: { callRef: status.callRef, idempotencyKey: 'cancel:post-release' },
      context: {
        agentAccessPrincipal: principal,
        correlationId: 'corr_recovery_2',
        callService: {
          callTool: vi.fn(),
          readCallStatus: vi.fn(),
          cancelCall,
          reconcileCall: vi.fn(),
        },
      },
    })
    expect(result).toMatchObject({ kind: 'reconciliation_required', evidence: { retry: 'reconcile_before_retry' } })
  })
})
