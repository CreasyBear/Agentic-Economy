import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

const signingMocks = vi.hoisted(() => ({ replay: vi.fn() }))

vi.mock('@/modules/capability-execution/invocation-worker/x402Authorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-execution/invocation-worker/x402Authorization')>()),
  replayManagedX402SigningForRecovery: signingMocks.replay,
}))

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { recoverCapabilityOperationInvocation } from '@/modules/capability-execution/invocation-worker/recover'
import { externalSpendPaymentFactsFromDispatch } from '@/modules/capability-execution/invocation-worker/x402Settlement'
import { mintExternalSpendIdentity } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  createWorker,
  digest,
  mocks,
} from './capability-operation-worker-harness'

type QueryCall = (reference: unknown, args?: Record<string, unknown>) => Promise<unknown>
type MutationCall = (reference: unknown, args: Record<string, unknown>) => Promise<unknown>
type MockCall<T extends (...args: never[]) => unknown> = Readonly<{
  getMockImplementation: () => T | undefined
  mockImplementation: (implementation: T) => unknown
}>

type SetupOptions = Readonly<{
  recoveredPatch?: Record<string, unknown>
  paymentPatch?: Record<string, unknown>
  moneyResult?: 'accepted' | 'replayed' | 'not_reconciled' | 'throw'
  controlRetryable?: boolean
}>

function setupPreSubmissionRecovery(options: SetupOptions = {}) {
  const worker = createWorker('x402', { sellerCanary: true })
  const dispatch = worker.state.dispatch
  const operation = worker.state.operation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const recoveryInvocationRef = String(dispatch.invocationRef)
  const recoveryAttemptRef = `operation-attempt:${recoveryInvocationRef}:2`
  const effectGeneration = 2
  const requiredAt = new Date(Date.now() - 1_000).toISOString()
  const actor = {
    callerRef: String(dispatch.credentialId),
    principalRef: String(dispatch.principalId),
  }
  const control = {
    sourceRef: `operation-invocation-source:${recoveryInvocationRef}`,
    preparedMaterialDigest: String(dispatch.inputDigest),
    updatedAt: requiredAt,
    currentAttemptRef: recoveryAttemptRef,
    currentEffectGeneration: effectGeneration,
    control: {
      invocationRef: recoveryInvocationRef,
      invocationVersion: 7,
      origin: { kind: 'standalone' as const, ...actor },
      owner: actor,
      action: { id: operation.operationId, contractVersion: descriptor.version },
      desired: { state: 'invoke' as const },
      authority: { reference: 'authority:test-worker', expiresAt: requiredAt },
      acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test-worker' },
      freshness: { state: 'current' as const, observedAt: requiredAt },
      control: options.controlRetryable
        ? { state: 'retryable' as const, reason: 'reconciled_not_released' as const }
        : {
            state: 'reconciliation_required' as const,
            attemptRef: recoveryAttemptRef,
            effectGeneration,
          },
    },
  }
  const durableAttempt = {
    invocationRef: recoveryInvocationRef,
    attemptRef: recoveryAttemptRef,
    attemptNumber: 2,
    actor,
    effectGeneration,
    lease: { owner: 'operation-worker:test', expiresAt: requiredAt },
    idempotency: {
      operationKey: operation.operationId,
      materialInputDigest: String(dispatch.inputDigest),
      effectIdentity: digest('e'),
    },
    release: { state: 'possibly_released' as const },
    outcome: { state: 'uncertain' as const, reconciliationRequiredAt: requiredAt },
    recordedAt: requiredAt,
  }
  const recovered = {
    ...dispatch,
    state: 'reconciliation_required' as const,
    dispatchState: 'reconciliation_required' as const,
    attemptRef: recoveryAttemptRef,
    result: {
      kind: 'reconciliation_required' as const,
      invocationRef: recoveryInvocationRef,
      operationRef: String(dispatch.operationRef),
      evidence: {
        attemptRef: recoveryAttemptRef,
        effectGeneration,
        requiredAt,
        retry: 'reconcile_before_retry' as const,
        evidenceSource: 'transport_outcome_unknown',
      },
    },
    ...options.recoveredPatch,
  }
  if (operation.binding.authority.kind !== 'provider_connection') {
    throw new Error('provider_connection_fixture_missing')
  }
  const amount = descriptor.price.kind === 'fixed'
    ? descriptor.price.amount
    : { currency: 'USD', units: '1', exponent: 2 }
  const custody = {
    custodyRef: 'custody:test-worker',
    custodyGeneration: 7,
    custodyDailyMaximum: { currency: amount.currency, units: '100000', exponent: amount.exponent },
  } as const
  const paymentIdentifier = digest('5')
  const challengeDigest = digest('6')
  const reservation = mintExternalSpendIdentity(externalSpendPaymentFactsFromDispatch(
    dispatch as never,
    {
      attemptRef: recoveryAttemptRef,
      effectGeneration,
      providerRef: operation.binding.authority.providerRef,
      paymentIdentifier,
      challengeDigest,
      amount,
      ...custody,
    },
  ))
  const paymentAttempt = {
    dispatchRef: recoveryInvocationRef,
    attemptRef: recoveryAttemptRef,
    effectGeneration,
    operationRef: String(dispatch.operationRef),
    inputDigest: String(dispatch.inputDigest),
    paymentIdentifier,
    operationKeyDigest: digest('7'),
    challengeDigest,
    challengeJson: '{}',
    selectedRequirementJson: '{}',
    providerEndpoint: operation.binding.endpointUrl,
    scheme: 'exact',
    network: operation.identity.payment.kind === 'x402' ? operation.identity.payment.network : '',
    asset: operation.identity.payment.kind === 'x402' ? operation.identity.payment.asset : '',
    payTo: operation.identity.payment.kind === 'x402' ? operation.identity.payment.payTo : '',
    amountUnits: amount.units,
    currency: amount.currency,
    exponent: amount.exponent,
    credentialRef: 'env:AE_X402_CDP_ACCOUNT_NAME',
    custodyRef: 'authorization-custody:test-worker',
    custodyBudgetRef: custody.custodyRef,
    custodyGeneration: custody.custodyGeneration,
    custodyDailyMaximumUnits: custody.custodyDailyMaximum.units,
    authorizationDigest: digest('8'),
    reservationRef: reservation.reservationRef,
    paymentIdentityDigest: digest('9'),
    requestFingerprint: digest('a'),
    state: 'reconciliation_required' as const,
    preparedAt: Date.parse(requiredAt) - 100,
    observedAt: Date.parse(requiredAt),
    transportObservationDigest: digest('b'),
    settlementStatus: 'unknown' as const,
    evidenceRefs: [] as string[],
    ...options.paymentPatch,
  }
  const query = worker.ctx.runQuery as MockCall<QueryCall>
  const baseQuery = query.getMockImplementation()
  if (baseQuery === undefined) throw new Error('worker_query_implementation_missing')
  query.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
    const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
    switch (path) {
      case 'capabilityOperationInvocations:readRecovery': return recovered
      case 'actionInvocationControl:readControl': return control
      case 'actionInvocationControl:readAttempts': return [durableAttempt]
      case 'actionInvocationControl:readHistory': return []
      case 'actionInvocationControl:readHistoryCommand': return null
      case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return paymentAttempt
      default: return await baseQuery(reference, args)
    }
  })
  const moneyCalls: Record<string, unknown>[] = []
  const controlCalls: Record<string, unknown>[] = []
  const projectionCalls: Record<string, unknown>[] = []
  const mutation = worker.ctx.runMutation as MockCall<MutationCall>
  const baseMutation = mutation.getMockImplementation()
  if (baseMutation === undefined) throw new Error('worker_mutation_implementation_missing')
  mutation.mockImplementation(async (reference: unknown, args: Record<string, unknown>) => {
    const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
    worker.state.mutations.push(path)
    worker.state.mutationCalls.push({ path, args })
    if (
      path === 'capabilityOperationPreSubmissionRecovery:reconcilePreSubmissionX402Money'
      || path === 'capabilityOperationPreSubmissionRecovery:reconcileManagedSigningX402Money'
    ) {
      moneyCalls.push(args)
      if (options.moneyResult === 'throw') throw new Error('money_unavailable')
      return { kind: options.moneyResult ?? 'accepted' }
    }
    if (path === 'moneyX402PaymentAttempts:reconcileX402PaymentAttempt') {
      moneyCalls.push(args)
      return { kind: 'settled', settlementStatus: 'not_settled' }
    }
    if (path === 'moneyLedger:reconcileExternalInvocationSpend') {
      moneyCalls.push(args)
      return { kind: 'accepted', status: 'released' }
    }
    if (path === 'actionInvocationControl:transact') {
      controlCalls.push(args)
      return { kind: 'applied', invocationVersion: 8 }
    }
    if (path === 'capabilityOperationInvocations:projectRecovery') {
      projectionCalls.push(args)
      return { kind: 'recorded' }
    }
    return await baseMutation(reference, args)
  })
  const recover = async () => await recoverCapabilityOperationInvocation(worker.ctx as never, {
    invocationRef: recoveryInvocationRef,
    principalId: String(dispatch.principalId),
    credentialId: String(dispatch.credentialId),
    mode: 'reconcile_pre_submission',
  })
  const recoverManagedSigning = async () => await recoverCapabilityOperationInvocation(worker.ctx as never, {
    invocationRef: recoveryInvocationRef,
    principalId: String(dispatch.principalId),
    credentialId: String(dispatch.credentialId),
    mode: 'reconcile_managed_signing',
  })
  return {
    worker,
    recover,
    recoverManagedSigning,
    moneyCalls,
    controlCalls,
    projectionCalls,
    paymentAttempt,
    recovered,
    recoveryInvocationRef,
    recoveryAttemptRef,
  }
}

describe('x402 pre-submission server recovery', () => {
  it('closes an expired CDP-invalid managed signing intent before allowing a new generation', async () => {
    signingMocks.replay.mockResolvedValueOnce({
      kind: 'definitive_rejection',
      statusCode: 400,
      errorType: 'invalid_request',
      evidenceDigest: digest('f'),
    })
    const setup = setupPreSubmissionRecovery({
      paymentPatch: {
        paymentUnsignedMaterialJson: '{}',
        paymentUnsignedMaterialDigest: digest('c'),
        paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
        paymentPayer: '0x0000000000000000000000000000000000000001',
        paymentNonce: `0x${'1'.repeat(64)}`,
        paymentAuthorizationValidBefore: '1',
        paymentAuthorizationExpiresAt: Date.now() - 500,
        paymentSigningClaimedAt: 1,
        transportRequestDigest: digest('d'),
        paymentObservationDigest: digest('e'),
      },
    })

    const recovered = await setup.recoverManagedSigning()
    expect(signingMocks.replay).toHaveBeenCalledTimes(1)
    expect(setup.moneyCalls).toHaveLength(1)
    expect(setup.moneyCalls[0]).toMatchObject({
      attemptRef: setup.recoveryAttemptRef,
      paymentResponseDigest: expect.stringMatching(/^sha256:/),
      reservationRef: setup.paymentAttempt.reservationRef,
      evidenceRef: expect.stringContaining('x402-managed-signing-recovery:'),
      replayKind: 'definitive_rejection',
    })
    expect(setup.controlCalls).toHaveLength(1)
    expect(setup.projectionCalls).toHaveLength(1)
    expect(recovered).toMatchObject({ kind: 'found', state: 'retryable' })
  })

  it('releases a pristine seller canary attempt, records canonical not-released evidence, and replays deterministically', async () => {
    mocks.createCdpEvmX402PaymentSignature.mockClear()
    mocks.invokeProviderConsequenceViaVercel.mockClear()
    const setup = setupPreSubmissionRecovery()

    const first = await setup.recover()
    const second = await setup.recover()

    expect(first).toMatchObject({
      kind: 'found',
      invocationRef: setup.recoveryInvocationRef,
      state: 'retryable',
    })
    expect(second).toMatchObject({ kind: 'found', state: 'retryable' })
    expect(setup.moneyCalls).toHaveLength(2)
    expect(setup.moneyCalls[1]).toEqual(setup.moneyCalls[0])
    expect(setup.moneyCalls[0]).toMatchObject({
      attemptRef: setup.recoveryAttemptRef,
      effectGeneration: 2,
      inputDigest: setup.paymentAttempt.inputDigest,
      authorizationDigest: setup.paymentAttempt.authorizationDigest,
    })
    expect(setup.controlCalls).toHaveLength(2)
    expect(setup.controlCalls[0]).toMatchObject({
      history: {
        kind: 'reconcile',
        observation: { release: 'not_released' },
      },
    })
    expect(setup.controlCalls[0]?.row).toMatchObject({
      control: {
        invocationRef: setup.recoveryInvocationRef,
        control: { state: 'retryable' },
      },
    })
    expect((setup.controlCalls[0]?.row as { control?: unknown } | undefined)?.control)
      .not.toHaveProperty('persistence')
    expect(setup.projectionCalls).toHaveLength(2)
    expect(setup.projectionCalls[0]).toMatchObject({
      state: 'pending',
      clearResult: true,
      clearWorkId: true,
      clearAttemptRef: true,
      clearEvidenceHash: true,
      clearDispatchState: true,
    })
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.invokeProviderConsequenceViaVercel).not.toHaveBeenCalled()
    expect(canonicalDigest(setup.moneyCalls[0] as StableHashValue)).toEqual(
      canonicalDigest(setup.moneyCalls[1] as StableHashValue),
    )
  })

  it.each([
    'paymentUnsignedMaterialJson',
    'paymentUnsignedMaterialDigest',
    'paymentSigningIdempotencyKey',
    'paymentSigningClaimedAt',
    'paymentSignatureDigest',
    'paymentPayer',
    'paymentNonce',
    'paymentAuthorizationValidBefore',
    'paymentAuthorizationExpiresAt',
    'submissionStartedAt',
  ])('rejects when %s exists', async (field) => {
    const values: Record<string, unknown> = {
      paymentUnsignedMaterialJson: '{}',
      paymentUnsignedMaterialDigest: digest('c'),
      paymentSigningIdempotencyKey: '11111111-1111-4111-8111-111111111111',
      paymentSigningClaimedAt: 1,
      paymentSignatureDigest: digest('d'),
      paymentPayer: '0x0000000000000000000000000000000000000001',
      paymentNonce: `0x${'1'.repeat(64)}`,
      paymentAuthorizationValidBefore: '9999999999',
      paymentAuthorizationExpiresAt: 9_999_999_999_000,
      submissionStartedAt: 1,
    }
    const setup = setupPreSubmissionRecovery({ paymentPatch: { [field]: values[field] } })
    await expect(setup.recover()).resolves.toMatchObject({
      kind: 'refused',
      code: 'invocation_not_found',
    })
    expect(setup.moneyCalls).toHaveLength(0)
    expect(setup.controlCalls).toHaveLength(0)
  })

  it.each([
    ['ordinary invocation', { sellerOnboardingCanary: undefined }],
    ['production invocation', { environment: 'production' }],
  ])('rejects a %s', async (_label, recoveredPatch) => {
    const setup = setupPreSubmissionRecovery({ recoveredPatch })
    await expect(setup.recover()).resolves.toMatchObject({ kind: 'refused' })
    expect(setup.moneyCalls).toHaveLength(0)
  })

  it('rejects mismatched persisted payment identity', async () => {
    const setup = setupPreSubmissionRecovery({ paymentPatch: { operationRef: 'operation:mismatch' } })
    await expect(setup.recover()).resolves.toMatchObject({ kind: 'refused' })
    expect(setup.moneyCalls).toHaveLength(0)
  })

  it.each(['not_reconciled', 'throw'] as const)('does not reconcile lifecycle when the money mutation returns %s', async (moneyResult) => {
    const setup = setupPreSubmissionRecovery({ moneyResult })
    await expect(setup.recover()).resolves.toMatchObject({
      kind: 'found',
      state: 'reconciliation_required',
    })
    expect(setup.moneyCalls).toHaveLength(1)
    expect(setup.controlCalls).toHaveLength(0)
    expect(setup.projectionCalls).toHaveLength(0)
  })

  it('does not let retryable control bypass the idempotent money proof', async () => {
    const evidenceRef = 'reconciliation:retryable-replay'
    const evidenceDigest = canonicalDigest(evidenceRef)
    const setup = setupPreSubmissionRecovery({
      controlRetryable: true,
      moneyResult: 'not_reconciled',
      paymentPatch: {
        state: 'observed',
        settlementStatus: 'not_settled',
        paymentResponseDigest: canonicalDigest('payment-response:retryable-replay'),
        reconciliationEvidenceRef: evidenceRef,
        reconciliationEvidenceDigest: evidenceDigest,
      },
    })

    await expect(setup.recover()).resolves.toMatchObject({
      kind: 'found',
      state: 'reconciliation_required',
    })
    expect(setup.moneyCalls).toHaveLength(1)
    expect(setup.controlCalls).toHaveLength(0)
    expect(setup.projectionCalls).toHaveLength(0)
  })
})
