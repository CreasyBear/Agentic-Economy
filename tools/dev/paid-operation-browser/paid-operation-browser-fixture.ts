import {
  createPaidOperationSemantics,
  projectRichPaidOperation,
  projectStructuredPaidOperation,
  type PaidOperationApplicationService,
  type PaidOperationContinuation,
  type PaidOperationProjection,
  type PaidOperationSemantics,
} from '../../../src/modules/action-invocation'
import type { PaidOperationSurfaceRef } from '../paid-operation-surface-host'

export const PAID_OPERATION_BROWSER_STATES = [
  'prepared',
  'refused_before_release',
  'possibly_submitted',
  'reconciled_not_settled',
  'settled_invalid_result',
  'completed',
] as const

export type PaidOperationBrowserState = typeof PAID_OPERATION_BROWSER_STATES[number]

const ref = Object.freeze({
  invocationRef: 'invocation:local-document-translation',
  expectedInvocationVersion: 3,
})

const inspect = Object.freeze([{
  kind: 'inspect',
  command: 'inspect_paid_operation',
  requiredInput: [],
  expectedInvocationVersion: 3,
  authorityRequired: false,
}] satisfies readonly PaidOperationContinuation[])

const reconcile = Object.freeze([{
  kind: 'reconcile',
  command: 'reconcile_paid_operation',
  requiredInput: ['reconciliationEvidence', 'paymentReconciliationEvidence'],
  expectedInvocationVersion: 3,
  authorityRequired: false,
}] satisfies readonly PaidOperationContinuation[])

export function paidOperationBrowserFixture(requestedState: string): Readonly<{
  service: PaidOperationApplicationService
  ref: PaidOperationSurfaceRef
  resolveReconciliationEvidence: NonNullable<
    Parameters<typeof import('../paid-operation-surface-host').AePaidOperationDevelopmentSurface>[0][
      'resolveReconciliationEvidence'
    ]
  >
}> {
  const state = isBrowserState(requestedState) ? requestedState : 'prepared'
  const projection = project(state)
  const service: PaidOperationApplicationService = {
    inspect: () => ({ kind: 'accepted', value: projection }),
    command: async () => ({ kind: 'accepted', value: projection }),
  }
  return {
    service,
    ref,
    resolveReconciliationEvidence: () => ({
      reconciliationEvidence: {
        kind: 'provider_reconciliation',
        invocationRef: ref.invocationRef,
        attemptRef: 'attempt:local-document-translation',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        providerId: 'provider:local-translation',
        providerRequestId: 'provider-request:local-translation',
        outcome: 'not_released',
        source: 'provider_api',
        evidenceRefs: ['evidence:local-provider-reconciliation'],
      },
      paymentReconciliationEvidence: {
        kind: 'x402_payment_reconciliation',
        invocationRef: ref.invocationRef,
        attemptRef: 'attempt:local-document-translation',
        effectGeneration: 1,
        observedAt: '2026-07-20T00:00:00.000Z',
        source: 'payment_facilitator',
        paymentIdentifier: 'payment:local-document-translation',
        challengeDigest: `sha256:${'1'.repeat(64)}`,
        custodyRef: 'custody:local-document-translation',
        settlement: 'not_settled',
        evidenceRefs: ['evidence:local-payment-reconciliation'],
      },
    }),
  }
}

function project(state: PaidOperationBrowserState): PaidOperationProjection {
  const semantics = createPaidOperationSemantics(stateSemantics(state))
  return {
    semantics,
    human: projectRichPaidOperation(semantics),
    agent: projectStructuredPaidOperation(semantics),
  }
}

function stateSemantics(
  state: PaidOperationBrowserState,
): Omit<PaidOperationSemantics, 'schema'> {
  const base = baseSemantics()
  switch (state) {
    case 'prepared':
      return {
        ...base,
        paymentSubmission: { state: 'not_submitted' },
        settlement: { state: 'no_evidence' },
        error: null,
        continuations: inspect,
      }
    case 'refused_before_release':
      return {
        ...base,
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
          evidenceRefs: ['evidence:local-refusal'],
        },
        continuations: inspect,
      }
    case 'possibly_submitted':
      return base
    case 'reconciled_not_settled':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: { state: 'not_settled', evidenceRefs: ['evidence:local-reconciliation'] },
        error: null,
        continuations: inspect,
      }
    case 'settled_invalid_result':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'AUD', amountMinor: 250 },
          evidenceRefs: ['evidence:local-settlement'],
        },
        resultDelivery: {
          state: 'invalid',
          code: 'result_invalid',
          evidenceRefs: ['evidence:local-invalid-result'],
        },
        error: null,
        continuations: inspect,
      }
    case 'completed':
      return {
        ...base,
        paymentSubmission: { state: 'observed', evidenceRefs: ['evidence:local-dispatch'] },
        settlement: {
          state: 'settled',
          amount: { currency: 'AUD', amountMinor: 250 },
          evidenceRefs: ['evidence:local-settlement'],
        },
        resultDelivery: {
          state: 'valid',
          blocks: [{
            kind: 'status',
            label: 'Translation',
            value: 'Validated local mock result',
            tone: 'positive',
          }],
          evidenceRefs: ['evidence:local-result'],
        },
        error: null,
        continuations: inspect,
      }
  }
}

function baseSemantics(): Omit<PaidOperationSemantics, 'schema'> {
  return {
    identity: ref,
    operation: {
      operationKey: 'documents.translate',
      providerId: 'provider:local-translation',
      providerName: 'Local Translation Provider',
      operationRevision: 'local-development:v1',
      materialInputs: {
        documentRef: 'document:labelled-local-fixture',
        targetLanguage: 'French',
      },
    },
    presentation: {
      title: 'Translate the supplied document',
      summary: 'A labelled local mock operation for browser evaluation only.',
      blocks: [{ kind: 'text', label: 'Target language', value: 'French' }],
    },
    maximumAuthorizedCharge: { currency: 'AUD', amountMinor: 250 },
    queryRelease: {
      state: 'unknown',
      evidenceRefs: ['evidence:local-release-unknown'],
    },
    paymentAuthorization: {
      state: 'created',
      paymentIdentifier: 'payment:local-document-translation',
      custodyReference: {
        kind: 'opaque_digest_reference',
        algorithm: 'sha256',
        digest: `sha256:${'0'.repeat(64)}`,
      },
      evidenceRefs: ['evidence:local-payment-prepared'],
    },
    paymentSubmission: {
      state: 'possibly_submitted',
      evidenceRefs: ['evidence:local-submission-unknown'],
    },
    settlement: {
      state: 'unknown',
      evidenceRefs: ['evidence:local-settlement-unknown'],
    },
    resultDelivery: { state: 'not_delivered' },
    environment: {
      name: 'Labelled local mock',
      evidenceClass: 'labelled_local_mock',
      claimCeiling: 'browser_mechanics_only',
    },
    error: {
      code: 'reconciliation_required',
      phase: 'reconciliation',
      queryReleaseStatus: 'unknown',
      paymentSubmissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      resultStatus: 'not_delivered',
      retryability: 'reconcile_before_retry',
      safeNextAction: 'reconcile',
      evidenceRefs: [
        'evidence:local-release-unknown',
        'evidence:local-submission-unknown',
        'evidence:local-settlement-unknown',
      ],
    },
    continuations: reconcile,
  }
}

function isBrowserState(value: string): value is PaidOperationBrowserState {
  return (PAID_OPERATION_BROWSER_STATES as readonly string[]).includes(value)
}
