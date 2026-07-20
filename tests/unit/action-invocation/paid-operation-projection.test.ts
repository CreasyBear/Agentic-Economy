import { describe, expect, it } from 'vitest'

import {
  createPaidOperationSemantics,
  PAID_OPERATION_SEMANTIC_DIGEST_USE,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationSemantics,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'

function baseSemantics(): Omit<PaidOperationSemantics, 'schema'> {
  return {
    identity: {
      invocationRef: 'invocation:btc-usd:1',
      expectedInvocationVersion: 3,
    },
    operation: {
      operationKey: 'btc-usd-latest',
      providerId: 'provider:development-quote',
      providerName: 'Development Quote Provider',
      operationRevision: 'revision:1',
      materialInputs: { base: 'BTC', quote: 'USD' },
    },
    presentation: {
      title: 'Get the latest BTC price in USD',
      summary: 'Retrieve one current BTC/USD measurement.',
      blocks: [
        { kind: 'text', label: 'Pair', value: 'BTC/USD' },
        {
          kind: 'source',
          label: 'Provider',
          providerId: 'provider:development-quote',
          providerName: 'Development Quote Provider',
          operationRevision: 'revision:1',
        },
      ],
    },
    maximumAuthorizedCharge: { currency: 'USD', amountMinor: 1 },
    queryRelease: {
      state: 'released',
      recipient: 'provider:development-quote',
      evidenceRefs: ['evidence:query'],
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:1',
      custodyReference: 'custody:opaque:1',
      evidenceRefs: ['evidence:authorization'],
    },
    paymentSubmission: {
      state: 'possibly_submitted',
      evidenceRefs: ['evidence:dispatch'],
    },
    settlement: {
      state: 'unknown',
      evidenceRefs: ['evidence:settlement-pending'],
    },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'local-development',
      evidenceClass: 'labelled_local_mock',
      claimCeiling: 'mechanism_only_not_real_settlement_or_provider_fulfilment',
    },
    error: {
      code: 'provider_timeout',
      phase: 'paid_dispatch',
      queryReleaseStatus: 'released',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      resultStatus: 'not_delivered',
      retryability: 'reconcile_before_retry',
      safeNextAction: 'reconcile',
      evidenceRefs: ['evidence:dispatch'],
    },
    continuations: [{
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      requiredInput: ['reconciliationEvidence'],
      expectedInvocationVersion: 3,
      authorityRequired: false,
    }],
  }
}

describe('agentic-paid-operation:v1 projections', () => {
  it('gives rich and structured hosts independent projections with exact semantic parity', () => {
    const semantics = createPaidOperationSemantics(baseSemantics())
    const rich = projectRichPaidOperation(semantics)
    const structured = projectStructuredPaidOperation(semantics)

    expect(rich.semantics).not.toBe(structured.semantics)
    expect(rich.semanticDigest).toBe(structured.semanticDigest)
    expect(rich.semanticDigest).toBe(canonicalDigest(rich.semantics as any))
    expect(rich.semanticDigestUse).toBe(PAID_OPERATION_SEMANTIC_DIGEST_USE)
    expect(structured.semanticDigestUse).toBe('projection_equality_only_not_authority')
    expect(structured.semantics.environment.evidenceClass).toBe('labelled_local_mock')
    expect(structured.semantics.continuations).toEqual([expect.objectContaining({
      kind: 'reconcile',
      command: 'reconcile_paid_operation',
      expectedInvocationVersion: 3,
    })])
  })

  it('refuses retry while paid submission or settlement remains uncertain', () => {
    const input = baseSemantics()
    expect(() => createPaidOperationSemantics({
      ...input,
      continuations: [{
        kind: 'retry',
        command: 'retry_paid_operation',
        requiredInput: [],
        expectedInvocationVersion: 3,
        authorityRequired: true,
      }],
    })).toThrow('paid_operation_retry_requires_reconciliation')
  })

  it('represents a BTC quote through generic result blocks', () => {
    const semantics = createPaidOperationSemantics({
      ...baseSemantics(),
      error: null,
      resultDelivery: {
        state: 'valid',
        blocks: [
          { kind: 'measurement', label: 'BTC price', value: 123_456.78, unit: 'USD/BTC' },
          { kind: 'timestamp', label: 'Observed', value: '2026-07-20T00:00:00.000Z' },
          { kind: 'reference', label: 'Evidence', value: 'evidence:quote' },
        ],
        evidenceRefs: ['evidence:quote'],
      },
    })
    expect(semantics.resultDelivery).toEqual(expect.objectContaining({ state: 'valid' }))
  })

  it('uses the same contract for a non-crypto paid operation', () => {
    const input = baseSemantics()
    const semantics = createPaidOperationSemantics({
      ...input,
      error: null,
      operation: {
        operationKey: 'weather-perth-current',
        providerId: 'provider:weather',
        providerName: 'Development Weather Provider',
        operationRevision: 'revision:7',
        materialInputs: { city: 'Perth', country: 'AU' },
      },
      presentation: {
        title: 'Get the current temperature in Perth',
        summary: 'Retrieve one current weather observation.',
        blocks: [
          { kind: 'text', label: 'Location', value: 'Perth, AU' },
          {
            kind: 'source',
            label: 'Provider',
            providerId: 'provider:weather',
            providerName: 'Development Weather Provider',
            operationRevision: 'revision:7',
          },
        ],
      },
      resultDelivery: {
        state: 'valid',
        blocks: [
          { kind: 'measurement', label: 'Temperature', value: 24.5, unit: '°C' },
          {
            kind: 'status',
            label: 'Conditions',
            value: 'Clear',
            tone: 'positive',
          },
        ],
        evidenceRefs: ['evidence:weather'],
      },
    })
    const rich = projectRichPaidOperation(semantics)
    const structured = projectStructuredPaidOperation(semantics)
    expect(rich.title).toBe('Get the current temperature in Perth')
    expect(rich.semanticDigest).toBe(structured.semanticDigest)
    expect(structured.semantics.operation.materialInputs).toEqual({
      city: 'Perth',
      country: 'AU',
    })
  })

  it('refuses invalid generic presentation values', () => {
    expect(() => createPaidOperationSemantics({
      ...baseSemantics(),
      error: null,
      resultDelivery: {
        state: 'valid',
        blocks: [
          { kind: 'measurement', label: 'Result', value: Number.POSITIVE_INFINITY, unit: 'units' },
        ],
        evidenceRefs: ['evidence:invalid'],
      },
    })).toThrow('paid_operation_presentation_invalid')
  })

  it('keeps the six canonical replay states identical across human and agent projections', () => {
    const inspect = [{
      kind: 'inspect',
      command: 'inspect_paid_operation',
      requiredInput: [],
      expectedInvocationVersion: 3,
      authorityRequired: false,
    }] as const
    const states: Record<string, Omit<PaidOperationSemantics, 'schema'>> = {
      prepared: {
        ...baseSemantics(),
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: null,
        continuations: inspect,
      },
      refused_before_release: {
        ...baseSemantics(),
        queryRelease: { state: 'not_released' },
        paymentAuthorization: { state: 'not_created' },
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: {
          code: 'authority_refused',
          phase: 'authority',
          queryReleaseStatus: 'not_released',
          paymentSubmissionStatus: 'not_submitted',
          settlementStatus: 'no_evidence',
          resultStatus: 'not_delivered',
          retryability: 'not_retryable',
          safeNextAction: 'inspect',
          evidenceRefs: ['evidence:refusal'],
        },
        continuations: inspect,
      },
      possibly_submitted: baseSemantics(),
      reconciled_not_settled: {
        ...baseSemantics(),
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:dispatch'] },
        settlement: { state: 'not_settled', evidenceRefs: ['evidence:reconciliation'] },
        error: null,
        continuations: inspect,
      },
      settled_invalid_result: {
        ...baseSemantics(),
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'USD', amountMinor: 1 },
          evidenceRefs: ['evidence:settlement'],
        },
        resultDelivery: {
          state: 'invalid',
          code: 'result_invalid',
          evidenceRefs: ['evidence:result'],
        },
        error: null,
        continuations: inspect,
      },
      completed: {
        ...baseSemantics(),
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'USD', amountMinor: 1 },
          evidenceRefs: ['evidence:settlement'],
        },
        resultDelivery: {
          state: 'valid',
          blocks: [{ kind: 'measurement', label: 'Price', value: 123_456.78, unit: 'USD/BTC' }],
          evidenceRefs: ['evidence:result'],
        },
        error: null,
        continuations: inspect,
      },
    }
    for (const [name, state] of Object.entries(states)) {
      const semantics = createPaidOperationSemantics(state)
      const rich = projectRichPaidOperation(semantics)
      const structured = projectStructuredPaidOperation(semantics)
      expect(rich.semanticDigest, name).toBe(structured.semanticDigest)
      expect(rich.semantics, name).toEqual(structured.semantics)
    }
  })
})
