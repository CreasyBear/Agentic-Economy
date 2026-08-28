import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Infer } from 'convex/values'
import {
  operationInvokeReceiptStateValues,
  operationInvokeReceiptSchema,
  operationInvokeResultKindValues,
  operationInvokeRefusalCodeValues,
  operationInvokeResultSchema,
  operationInvokeUsageSchema,
  type OperationInvokeResult,
  type OperationInvokeUsageSummary,
  type PublicReconciliationState,
} from '@/modules/capability-execution/operation-invoke-contracts'
import {
  operationInvokeStatusStateValues,
  type OperationInvokeRecoveryResult,
  type OperationInvokeStatusResult,
} from '@/modules/capability-execution/operation-recovery-contracts'
import { operationResultValue } from '@/modules/capability-execution/convex'
import { x402PaymentReconciliationEvidenceValue } from '@/modules/action-invocation/runtime'
import type {
  ActionAttemptView,
  ActionInvocationView,
  PreparedInvocation,
} from '@/modules/action-invocation/runtime'
import type { ActionResult } from '@/modules/common/action'
import type { MoneyAcceptedInvocationCharge } from '@/modules/money/public'

/**
 * P2 Wave A parity gate: proves every result/outcome variant and field consumed
 * from `DynamicPublishedInvocationResult` (legacy-dynamic bundle, retired in
 * P2 Wave C) has a named equivalent in `OperationInvokeResult`,
 * `operationResultValue`, and the action-invocation attempt/status types.
 * Read/test only — no runtime edits; this file is the deletion precondition.
 */

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
type Extends<A, B> = A extends B ? true : false

const amount = (units: string) => ({ currency: 'USD', units, exponent: 2 })
const iso = (ms: number) => new Date(ms).toISOString()

const usage = (chargeState: 'paid' | 'free_tier' | 'outcome_unknown') => ({
  usageRef: 'operation-usage:parity',
  observedAt: 1_000,
  chargeState,
  amount: amount('7'),
  priceDigest: 'sha256:price',
  transactionRef: 'operation-money:parity',
})

const reconciliationEvidence = (): PublicReconciliationState => ({
  attemptRef: 'operation-attempt:parity:1',
  effectGeneration: 2,
  requiredAt: iso(2_000),
  retry: 'reconcile_before_retry',
  evidenceSource: 'operation:operation:v1:parity',
})

// -- Type-level parity (real imports; the Wave B substitution proof) ---------

// The legacy bundle typed every P2B site as `ActionInvocationView<DynamicPublishedInvocationResult>`.
// Wave B substitutes the canonical result into the same ActionResult slot.
type AttemptOutcome = ActionAttemptView['outcome']
type AttemptOutcomeState = AttemptOutcome['state']
type AttemptRelease = ActionAttemptView['release']
type AttemptControl = ActionInvocationView['control']
type TimedOut = Extract<AttemptOutcome, { state: 'timed_out' }>
type Uncertain = Extract<AttemptOutcome, { state: 'uncertain' }>
type ReconciledReleased = Extract<AttemptOutcome, { state: 'reconciled_released' }>
type ReconciledNotReleased = Extract<AttemptOutcome, { state: 'reconciled_not_released' }>
type FailedAttempt = Extract<AttemptOutcome, { state: 'failed' }>
type CancelledControl = Extract<AttemptControl, { state: 'cancelled' }>
type X402Evidence = Infer<typeof x402PaymentReconciliationEvidenceValue>
type PersistedResult = Infer<typeof operationResultValue>

// Canonical kinds cover the legacy outcome classes 1:1.
type _canonicalKinds = Expect<Equal<
  (typeof operationInvokeResultKindValues)[number],
  'completed' | 'pending' | 'needs_authority' | 'reconciliation_required' | 'refused'
>>
// The canonical result fits the ActionResult slot the legacy result occupied.
type _canonicalFitsActionSlot = Expect<Extends<OperationInvokeResult, ActionResult>>
// The canonical result substitutes into the view generic at every P2B site.
type _viewAcceptsCanonicalResult = Expect<Extends<ActionInvocationView<OperationInvokeResult>, ActionInvocationView>>
// The persisted Convex validator accepts every legacy-mapped canonical variant.
type _completedPersistable = Expect<Extends<Extract<OperationInvokeResult, { kind: 'completed' }>, PersistedResult>>
type _refusedPersistable = Expect<Extends<Extract<OperationInvokeResult, { kind: 'refused' }>, PersistedResult>>
type _pendingPersistable = Expect<Extends<Extract<OperationInvokeResult, { kind: 'pending' }>, PersistedResult>>
type _reconciliationPersistable = Expect<Extends<Extract<OperationInvokeResult, { kind: 'reconciliation_required' }>, PersistedResult>>
// Uncertain/timed-out attempt outcomes carry the reconciliation carriers.
type _timedOutIsNamed = Expect<Extends<'timed_out', AttemptOutcomeState>>
type _uncertainIsNamed = Expect<Extends<'uncertain', AttemptOutcomeState>>
type _timedOutRetry = Expect<Equal<TimedOut['retry'], 'reconcile_before_retry'>>
type _timedOutRequiredAt = Expect<Equal<TimedOut['reconciliationRequiredAt'], string>>
type _uncertainRetry = Expect<Equal<Uncertain['retry'], 'reconcile_before_retry'>>
type _uncertainRequiredAt = Expect<Equal<Uncertain['reconciliationRequiredAt'], string>>
// x402 reconciliation resolves through the reconciled attempt outcomes.
type _reconciledReleasedIsNamed = Expect<Extends<'reconciled_released', AttemptOutcomeState>>
type _reconciledNotReleasedIsNamed = Expect<Extends<'reconciled_not_released', AttemptOutcomeState>>
type _reconciledReleasedExternalUnknown = Expect<Equal<ReconciledReleased['externalOutcome'], 'unknown'>>
type _reconciledNotReleasedHasNoExternal = Expect<Equal<'externalOutcome' extends keyof ReconciledNotReleased ? true : false, false>>
// Release dispositions carry sourceDisposition's not_released/released truth.
type _releaseNotReleased = Expect<Extends<'not_released', AttemptRelease['state']>>
type _releaseReleased = Expect<Extends<'released', AttemptRelease['state']>>
type _releasePossiblyReleased = Expect<Extends<'possibly_released', AttemptRelease['state']>>
// Cancelled exists as a canonical control state with no released effect.
type _cancelledControl = Expect<Equal<CancelledControl['effect'], 'not_released'>>
// Failed attempts carry the legacy failureCode as an error digest.
type _failedErrorDigest = Expect<Equal<FailedAttempt['errorDigest'], string | undefined>>
// Digest carriers for requestDigest/responseDigest.
type _attemptMaterialDigest = Expect<Equal<ActionAttemptView['idempotency']['materialInputDigest'], string>>
type _attemptEffectGeneration = Expect<Equal<ActionAttemptView['effectGeneration'], number>>
type _preparedMaterialDigest = Expect<Equal<PreparedInvocation['materialInputDigest'], string>>
type _preparedAtCarrier = Expect<Equal<PreparedInvocation['preparedAt'], string>>
type _reconciliationRetryLiteral = Expect<Equal<PublicReconciliationState['retry'], 'reconcile_before_retry'>>
// x402 payment evidence carries the legacy payment fields.
type _x402ChallengeDigest = Expect<Equal<X402Evidence['challengeDigest'], string>>
type _x402PaymentIdentifier = Expect<Equal<X402Evidence['paymentIdentifier'], string>>
type _x402RequestDigest = Expect<Equal<X402Evidence['requestDigest'], string>>
type _x402TransactionHash = Expect<Equal<X402Evidence['transactionHash'], string>>
type _x402PaymentResponseDigest = Expect<Equal<X402Evidence['paymentResponseDigest'], string>>
// Status plane carries the cancelled state and the refused receipt.
type _statusCancelled = Expect<Extends<'cancelled', (typeof operationInvokeStatusStateValues)[number]>>
type _statusTerminal = Expect<Extends<'terminal', (typeof operationInvokeStatusStateValues)[number]>>
type _receiptStates = Expect<Equal<
  (typeof operationInvokeReceiptStateValues)[number],
  'settled' | 'refunded' | 'reconciliation_required'
>>

// -- Static mapping table (asserted non-empty per class) ---------------------

const LEGACY_TO_CANONICAL: Record<string, string> = {
  'completed/succeeded':
    'OperationInvokeResult kind "completed" (operationInvokeResultKindValues) with output (jsonValueSchema), evidenceHash (legacy responseDigest), and usage (operationInvokeUsageSchema)',
  refused:
    'OperationInvokeResult kind "refused" with code from operationInvokeRefusalCodeValues (legacy failureCode) and optional receipt',
  'uncertain/timed-out':
    'OperationInvokeResult kind "reconciliation_required" (PublicReconciliationState: attemptRef/effectGeneration/requiredAt/retry/evidenceSource) + ActionAttemptView outcome "uncertain"/"timed_out" carrying reconciliationRequiredAt and retry "reconcile_before_retry"',
  'provider-output-invalid':
    'refused with named codes: "result_invalid" (legacy published_operation_invalid_evidence, operation-invoke.ts projectDynamicInvocation) and "provider_output_invalid" (worker parse gate); receipt.lossState "provider_output_invalid"',
  'x402-reconciliation':
    'reconciliation_required result + receipt.state "reconciliation_required" + x402PaymentReconciliationEvidenceValue (challengeDigest/paymentIdentifier/requestDigest/paymentResponseDigest/transactionHash) + attempt outcomes "reconciled_released"/"reconciled_not_released" (externalOutcome "unknown")',
  cancelled:
    'refused code "invocation_cancelled" + operationInvokeStatusStateValues "cancelled" + ActionInvocationView control state "cancelled" (effect "not_released")',
  'recovery-evidence':
    'OperationInvokeStatusResult / OperationInvokeRecoveryResult (statusResultValue/recoveryResultValue in capability-execution/convex) with status state, attemptRef/effectGeneration, usage, evidenceHash, and receipt carriers',
  'field:kind':
    'OperationInvokeResult["kind"] discriminator (five canonical kinds; legacy kind literals rejected by operationInvokeResultSchema)',
  'field:sourceDisposition':
    'attempt release states (not_released/released/possibly_released) + observedResolution.execution ("runner_returned" | "pre_release_refused") + refusal codes',
  'field:operationId':
    'OperationInvokeResult["operationRef"] (invocation-bound operation identity)',
  'field:operationVersion':
    'ActionInvocationView attempts[].action.contractVersion',
  'field:requestDigest':
    'attempt idempotency.materialInputDigest + PreparedInvocation.materialInputDigest + OperationInvokePersistedAuthority.inputDigest + x402PaymentReconciliationEvidenceValue.requestDigest + reconciliationEvidenceValue.requestDigest',
  'field:responseDigest':
    'OperationInvokeResult kind "completed" evidenceHash + OperationInvokeReceipt.evidenceHash',
  'field:output': 'OperationInvokeResult kind "completed" output (jsonValueSchema)',
  'field:providerReceipt':
    'RouteTransportObservation.providerReceipt observation plane + providerReceiptDigest (x402-invocation-policy/money external-spend); operationInvokeReceiptSchema carries digest-only evidence and rejects a raw providerReceipt key',
  'field:paymentProof':
    'OperationInvokeReceipt.paymentIdentifier/settlementTransactionHash + x402PaymentReconciliationEvidenceValue.paymentIdentifier/transactionHash',
  'field:paymentChallengeDigest': 'x402PaymentReconciliationEvidenceValue.challengeDigest',
  'field:failureCode':
    'refused code (operationInvokeRefusalCodeValues) + attempt outcome "failed".errorDigest + invocationReconciliationValue.reason',
  'field:usage':
    'operationInvokeUsageSchema (usageRef/observedAt/chargeState/amount/priceDigest/transactionRef + durationMs)',
}

const REQUIRED_LEGACY_CLASSES = [
  'completed/succeeded',
  'refused',
  'uncertain/timed-out',
  'provider-output-invalid',
  'x402-reconciliation',
  'cancelled',
  'recovery-evidence',
] as const

const REQUIRED_LEGACY_FIELDS = [
  'kind',
  'sourceDisposition',
  'operationId',
  'operationVersion',
  'requestDigest',
  'responseDigest',
  'output',
  'providerReceipt',
  'paymentProof',
  'paymentChallengeDigest',
  'failureCode',
  'usage',
] as const

const P2B_IMPORT_SITES = [
  'src/modules/capability-execution/operation-invoke.ts',
  'src/modules/capability-execution/convex.ts',
  'src/modules/capability-execution/invocation-worker/recovery/index.ts',
  'src/modules/capability-execution/invocation-worker/recovery/loading.ts',
] as const

const LEGACY_KINDS = [
  'published_operation_succeeded',
  'published_operation_refused',
  'published_operation_invalid_evidence',
] as const

describe('legacy DynamicPublishedInvocationResult parity gate', () => {
  it('maps every legacy outcome class onto a named canonical variant', () => {
    for (const legacyClass of REQUIRED_LEGACY_CLASSES) {
      expect(LEGACY_TO_CANONICAL[legacyClass], `unmapped class: ${legacyClass}`).toBeTruthy()
    }
    expect(REQUIRED_LEGACY_CLASSES.length).toBe(7)
  })

  it('carries every legacy field consumed at the P2B import sites on a named canonical carrier', () => {
    for (const field of REQUIRED_LEGACY_FIELDS) {
      expect(LEGACY_TO_CANONICAL[`field:${field}`], `unmapped field: ${field}`).toBeTruthy()
    }
    for (const site of P2B_IMPORT_SITES) {
      expect(existsSync(site), `P2B import site missing: ${site}`).toBe(true)
    }
  })

  it('parses a canonical representative for each legacy outcome class', () => {
    // completed/succeeded (with legacy output + responseDigest + usage carriers)
    expect(operationInvokeResultSchema.safeParse({
      kind: 'completed',
      invocationRef: 'operation-invocation:v1:parity',
      operationRef: 'operation:v1:parity',
      output: { result: 'ok' },
      evidenceHash: 'sha256:response',
      usage: usage('paid'),
    }).success).toBe(true)

    // refused (legacy published_operation_refused + failureCode)
    expect(operationInvokeResultSchema.safeParse({
      kind: 'refused',
      operationRef: 'operation:v1:parity',
      code: 'provider_refused',
      retryable: false,
    }).success).toBe(true)

    // provider output invalid (legacy published_operation_invalid_evidence)
    expect(operationInvokeResultSchema.safeParse({
      kind: 'refused',
      operationRef: 'operation:v1:parity',
      code: 'result_invalid',
      retryable: false,
    }).success).toBe(true)

    // provider output invalid via the worker parse gate, with loss receipt
    expect(operationInvokeResultSchema.safeParse({
      kind: 'refused',
      operationRef: 'operation:v1:parity',
      code: 'provider_output_invalid',
      retryable: false,
      receipt: {
        receiptRef: 'receipt:parity',
        state: 'refunded',
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        providerQuotedAmount: amount('7'),
        agenticEconomyFee: amount('0'),
        totalBuyerAuthorization: amount('7'),
        priceDigest: 'sha256:price',
        evidenceHash: 'sha256:evidence',
        issuedAt: iso(1_000),
        lossState: 'provider_output_invalid',
      },
    }).success).toBe(true)

    // uncertain/timed-out → reconciliation_required
    expect(operationInvokeResultSchema.safeParse({
      kind: 'reconciliation_required',
      invocationRef: 'operation-invocation:v1:parity',
      operationRef: 'operation:v1:parity',
      evidence: reconciliationEvidence(),
    }).success).toBe(true)

    // x402 reconciliation → reconciliation_required with a reconciliation receipt
    expect(operationInvokeResultSchema.safeParse({
      kind: 'reconciliation_required',
      invocationRef: 'operation-invocation:v1:parity',
      operationRef: 'operation:v1:parity',
      evidence: reconciliationEvidence(),
      receipt: {
        receiptRef: 'receipt:parity-x402',
        state: 'reconciliation_required',
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        providerQuotedAmount: amount('700'),
        agenticEconomyFee: amount('35'),
        totalBuyerAuthorization: amount('735'),
        priceDigest: 'sha256:price',
        paymentIdentifier: 'payment:parity',
        settlementTransactionHash: '0xparity',
        evidenceHash: 'sha256:evidence',
        issuedAt: iso(1_000),
      },
    }).success).toBe(true)

    // cancelled → refused with the named cancellation code
    expect(operationInvokeResultSchema.safeParse({
      kind: 'refused',
      operationRef: 'operation:v1:parity',
      code: 'invocation_cancelled',
      retryable: false,
    }).success).toBe(true)
  })

  it('rejects smuggling legacy result kinds through the canonical schema', () => {
    for (const legacyKind of LEGACY_KINDS) {
      expect((operationInvokeResultKindValues as readonly string[]).includes(legacyKind)).toBe(false)
      const smuggled = operationInvokeResultSchema.safeParse({
        kind: legacyKind,
        sourceDisposition: 'succeeded',
        operationId: 'operation:parity',
        operationVersion: 'v1',
        requestDigest: 'sha256:request',
        responseDigest: 'sha256:response',
        output: { result: 'ok' },
        providerReceipt: 'raw-receipt',
        paymentProof: 'raw-proof',
        paymentChallengeDigest: 'sha256:challenge',
        failureCode: 'some_failure',
        usage: usage('paid'),
      })
      expect(smuggled.success, `legacy kind accepted: ${legacyKind}`).toBe(false)
    }
  })

  it('parses the legacy usage pick into the canonical usage schema', () => {
    const legacyUsage = {
      usageRef: 'operation-usage:parity',
      observedAt: 1_000,
      chargeState: 'paid',
      amount: amount('7'),
      priceDigest: 'sha256:price',
      transactionRef: 'operation-money:parity',
    } satisfies Pick<
      MoneyAcceptedInvocationCharge,
      'usageRef' | 'observedAt' | 'chargeState' | 'amount' | 'priceDigest' | 'transactionRef'
    >
    expect(operationInvokeUsageSchema.safeParse(legacyUsage).success).toBe(true)

    // The canonical charge-state enum additionally carries the outcome_unknown
    // lane the money worker records after an uncertain release.
    const unknownOutcomeUsage = {
      usageRef: 'operation-usage:parity',
      observedAt: 1_000,
      chargeState: 'outcome_unknown',
      amount: amount('7'),
      priceDigest: 'sha256:price',
    } satisfies OperationInvokeUsageSummary
    expect(operationInvokeUsageSchema.safeParse(unknownOutcomeUsage).success).toBe(true)
  })

  it('binds recovery evidence to the canonical status/recovery result shapes', () => {
    // Free-tier / paid settlement status recovered from the persisted row.
    const statusFound = {
      kind: 'found',
      invocationRef: 'operation-invocation:v1:parity',
      operationRef: 'operation:v1:parity',
      state: 'reconciliation_required',
      attemptRef: 'operation-attempt:parity:1',
      effectGeneration: 2,
      usage: usage('outcome_unknown'),
      evidenceHash: 'sha256:response',
    } satisfies OperationInvokeStatusResult

    // Status refusal carries the legacy failureCode as a named code + receipt.
    const statusRefused = {
      kind: 'refused',
      invocationRef: 'operation-invocation:v1:parity',
      code: 'invocation_not_found',
      retryable: false,
    } satisfies OperationInvokeStatusResult

    // Reconciliation recovery result (statusResultValue union extension).
    const recoveryReconcile = {
      kind: 'reconciliation_required',
      invocationRef: 'operation-invocation:v1:parity',
      operationRef: 'operation:v1:parity',
      evidence: reconciliationEvidence(),
    } satisfies OperationInvokeRecoveryResult

    expect(statusFound.state).toBe('reconciliation_required')
    expect(statusRefused.code).toBe('invocation_not_found')
    expect(recoveryReconcile.evidence.retry).toBe('reconcile_before_retry')

    // The x402 payment reconciliation evidence validator is the named carrier.
    expect(typeof x402PaymentReconciliationEvidenceValue).toBe('object')

    // Status-plane state and refusal vocabularies stay parseable members.
    const statusStates = operationInvokeStatusStateValues as readonly string[]
    for (const state of ['cancelled', 'reconciliation_required', 'terminal'] as const) {
      expect(statusStates).toContain(state)
    }
    const refusalCodes = operationInvokeRefusalCodeValues as readonly string[]
    for (const code of [
      'provider_refused',
      'result_invalid',
      'provider_output_invalid',
      'reconciliation_required',
      'outcome_unknown',
      'invocation_cancelled',
    ] as const) {
      expect(refusalCodes).toContain(code)
    }
    const receiptStates = operationInvokeReceiptStateValues as readonly string[]
    expect(receiptStates).toEqual(['settled', 'refunded', 'reconciliation_required'])
    expect(operationInvokeReceiptSchema.safeParse({
      receiptRef: 'receipt:parity',
      state: 'settled',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      providerQuotedAmount: amount('700'),
      agenticEconomyFee: amount('35'),
      totalBuyerAuthorization: amount('735'),
      priceDigest: 'sha256:price',
      evidenceHash: 'sha256:evidence',
      issuedAt: iso(1_000),
    }).success).toBe(true)
  })
})

// -- Destination coverage (source-shape proof, faux-runtime-surfaces style) --

const DESTINATION_COVERAGE = [
  {
    assertionClass: 'adapter/idempotency/transact',
    destinations: [
      {
        path: 'tests/unit/capability-execution/operation-invoke-dispatch.test.ts',
        keywords: ['abandons', 'outcome_unknown', 'requires reconciliation', 'idempotency key'],
      },
      {
        path: 'tests/unit/action-invocation/durable-action-invocation-transact.test.ts',
        keywords: ['non-monotonic', 'duplicate idempotency'],
      },
      {
        path: 'tests/unit/action-invocation/durable-action-invocation-release.test.ts',
        keywords: ['fences', 'rehydrates the winner'],
      },
    ],
  },
  {
    assertionClass: 'snapshot/material digest',
    destinations: [
      {
        path: 'tests/unit/capability-execution/operation-invoke-admit.test.ts',
        keywords: ['stale publication material', 'contract-invalid input'],
      },
      {
        path: 'tests/integration/current-operation-snapshot-stability.test.ts',
        keywords: ['currentdigest stable', 'expired or changed authority'],
      },
    ],
  },
  {
    assertionClass: 'uncertain/recovery/timeout',
    destinations: [
      {
        path: 'tests/unit/capability-execution/operation-invoke-recover.test.ts',
        keywords: ['partial response reconcilable', 'schema-invalid response reconcilable'],
      },
      {
        path: 'tests/unit/capability-execution/operation-recovery-actions.test.ts',
        keywords: ['status/cancel/reconcile', 'receipts for success, refund, and reconciliation'],
      },
      {
        path: 'tests/unit/convex/capability-operation-worker-recover.test.ts',
        keywords: ['uncertain possible release unknown', 'reconciliation required when pre-release money settlement refuses'],
      },
    ],
  },
  {
    assertionClass: 'charge/refund/invalid-output/loss',
    destinations: [
      {
        path: 'tests/unit/convex/capability-operation-worker-charge.test.ts',
        keywords: ['provider loss on invalid paid output', 'reverses an ae-internal charge for schema-invalid output', 'free-tier usage'],
      },
      {
        path: 'tests/unit/convex/money-ledger-reconcile-invocation-charge.test.ts',
        keywords: ['refunds an accepted charge', 'refund proof fails'],
      },
      {
        path: 'tests/unit/convex/money-ledger-reverse-disputed-qualified-use.test.ts',
        keywords: ['reverses a brokered external settlement'],
      },
    ],
  },
  {
    assertionClass: 'provider selection/route transport',
    destinations: [
      {
        path: 'tests/unit/capability-supply/route-transport-identity.test.ts',
        keywords: ['provider idempotency-key', 'binds x402 payment identifiers'],
      },
      {
        path: 'tests/unit/capability-supply/transport-adapter-registry.test.ts',
        keywords: ['refuses unknown adapters', 'x402 as a bounded payment transport'],
      },
    ],
  },
  {
    assertionClass: 'cancelled',
    destinations: [
      {
        path: 'tests/unit/action-invocation/durable-action-invocation-cancel.test.ts',
        keywords: ['cancels before release'],
      },
    ],
  },
  {
    assertionClass: 'ui paid card / receipt presentation',
    destinations: [
      {
        path: 'tests/integration/chat-durable-messaging-share.test.ts',
        keywords: ['allowlisted text and operation cards'],
      },
      {
        path: 'tests/unit/routes/operation-detail-route.test.tsx',
        keywords: ['authenticated invoke', 'never advertises anonymous execute'],
      },
      {
        path: 'tests/unit/capability-execution/invocation-receipt-view.test.ts',
        keywords: ['uncertain paid outcome', 'canonical completed result'],
      },
      {
        path: 'tests/unit/capability-execution/operation-receipt-contract.test.ts',
        keywords: ['safe fixed receipt contract', 'additive receipts on terminal result variants'],
      },
    ],
  },
] as const

describe('legacy assertion destination coverage', () => {
  it('keeps a named destination suite with claimed coverage for every assertion class', () => {
    for (const row of DESTINATION_COVERAGE) {
      expect(row.destinations.length, `no destination for class: ${row.assertionClass}`).toBeGreaterThan(0)
      for (const destination of row.destinations) {
        expect(existsSync(destination.path), `destination file missing: ${destination.path}`).toBe(true)
        const source = readFileSync(destination.path, 'utf8').toLowerCase()
        for (const keyword of destination.keywords) {
          expect(
            source.includes(keyword.toLowerCase()),
            `coverage keyword "${keyword}" missing from ${destination.path} (class: ${row.assertionClass})`,
          ).toBe(true)
        }
      }
    }
  })
})
