const readX402EvmReceiptMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/capability-execution/invocation-worker/x402Route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-execution/invocation-worker/x402Route')>()),
  readX402EvmReceipt: readX402EvmReceiptMock,
}))

import {
  attemptRef,
  createWorker,
  digest,
  handler,
  invocationRef,
  mocks,
} from './capability-operation-worker-harness'
import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi } from 'viem'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { materializeRuntimePublishedOperation } from '@/modules/capability-supply/public'
import { recoverCapabilityOperationInvocation, expireAuthorizationRecovery } from '@/modules/capability-execution/invocation-worker/recover'
import {
  failedX402SettlementAuthorizationDisposition,
  failedX402SettlementVerified,
} from '@/modules/capability-execution/invocation-worker/recovery/x402'
import {
  externalSpendIdentityFromAttempt,
  externalSpendPaymentFactsFromDispatch,
} from '@/modules/capability-execution/invocation-worker/x402Settlement'
import { mintExternalSpendIdentity } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'

type QueryCall = (reference: unknown, args?: Record<string, unknown>) => Promise<unknown>
type MutationCall = (reference: unknown, args: Record<string, unknown>) => Promise<unknown>
type MockCall<T extends (...args: never[]) => unknown> = Readonly<{
  getMockImplementation: () => T | undefined
  mockImplementation: (implementation: T) => unknown
}>

const unconfirmedReceipt = {
  transactionHash: `0x${'4'.repeat(64)}`,
  status: 'success' as const,
  confirmations: 11n,
  blockHash: `0x${'5'.repeat(64)}`,
  blockNumber: 100n,
  observedBlockTimestamp: 1_788_119_999n,
  authorizationState: false,
  transactionTo: null,
  transactionInput: '0x',
  logs: [],
} as const

const authorizationCanceledAbi = [{
  type: 'event',
  name: 'AuthorizationCanceled',
  inputs: [
    { name: 'authorizer', type: 'address', indexed: true },
    { name: 'nonce', type: 'bytes32', indexed: true },
  ],
  anonymous: false,
}] as const

describe('capability operation invocation worker recover', () => {
  it('does not rearm a reverted EIP-3009 authorization before its exclusive validBefore boundary', () => {
    const payer = '0x0000000000000000000000000000000000000002'
    const nonce = `0x${'a'.repeat(64)}` as const
    const asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    const expiresAt = 1_788_120_000_000
    const payTo = '0x0000000000000000000000000000000000000003'
    const amount = 10_000n
    const reverted = {
      transactionHash: `0x${'4'.repeat(64)}`,
      status: 'reverted' as const,
      confirmations: 12n,
      blockHash: `0x${'5'.repeat(64)}`,
      blockNumber: 100n,
      observedBlockTimestamp: BigInt(expiresAt / 1_000) - 1n,
      authorizationState: false,
      transactionTo: asset,
      transactionInput: encodeFunctionData({
        abi: eip3009ABI,
        functionName: 'transferWithAuthorization',
        args: [
          payer,
          payTo,
          amount,
          0n,
          BigInt(expiresAt / 1_000),
          nonce,
          27,
          `0x${'b'.repeat(64)}`,
          `0x${'c'.repeat(64)}`,
        ],
      }),
      logs: [],
    }
    const attempt = {
      asset,
      paymentPayer: payer,
      paymentNonce: nonce,
      paymentAuthorizationExpiresAt: expiresAt,
    }

    expect(failedX402SettlementAuthorizationDisposition(attempt, reverted, 'sandbox'))
      .toBeUndefined()
    expect(failedX402SettlementAuthorizationDisposition(
      attempt,
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) },
      'sandbox',
    ))
      .toBe('expired')
    expect(failedX402SettlementAuthorizationDisposition(
      attempt,
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) + 1n },
      'sandbox',
    ))
      .toBe('expired')
    const verification = {
      aeEnvironment: 'sandbox' as const,
      response: {
        success: true,
        transaction: reverted.transactionHash,
        network: 'eip155:84532',
        amount: amount.toString(),
        payer,
      },
      requirement: {
        scheme: 'exact',
        network: 'eip155:84532',
        amount: amount.toString(),
        asset,
        payTo,
      },
      payer,
      paymentNonce: nonce,
    }
    expect(failedX402SettlementVerified(verification, attempt, reverted))
      .toBe(false)
    expect(failedX402SettlementVerified(
      verification,
      attempt,
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) },
    ))
      .toBe(true)
    expect(failedX402SettlementVerified(
      verification,
      attempt,
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) + 1n },
    ))
      .toBe(true)
    expect(failedX402SettlementVerified(
      { ...verification, requirement: { ...verification.requirement, amount: '9999' } },
      attempt,
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) },
    )).toBe(false)
    expect(failedX402SettlementVerified(
      verification,
      { ...attempt, paymentAuthorizationExpiresAt: expiresAt + 1_000 },
      { ...reverted, observedBlockTimestamp: BigInt(expiresAt / 1_000) + 1n },
    )).toBe(false)
  })

  it('rearms only from an exact confirmed EIP-3009 cancellation event before expiry', () => {
    const payer = '0x0000000000000000000000000000000000000002'
    const nonce = `0x${'a'.repeat(64)}` as const
    const asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    const attempt = {
      asset,
      paymentPayer: payer,
      paymentNonce: nonce,
      paymentAuthorizationExpiresAt: 1_788_120_000_000,
    }
    const cancellation = {
      transactionHash: `0x${'4'.repeat(64)}`,
      status: 'success' as const,
      confirmations: 12n,
      blockHash: `0x${'5'.repeat(64)}`,
      blockNumber: 100n,
      observedBlockTimestamp: 1n,
      authorizationState: true,
      transactionTo: asset,
      transactionInput: '0x',
      logs: [{
        address: asset,
        data: '0x' as const,
        topics: encodeEventTopics({
          abi: authorizationCanceledAbi,
          eventName: 'AuthorizationCanceled',
          args: { authorizer: payer, nonce },
        }) as string[],
      }],
    }

    expect(failedX402SettlementAuthorizationDisposition(attempt, cancellation, 'sandbox'))
      .toBe('cancelled')
    expect(failedX402SettlementAuthorizationDisposition(
      attempt,
      { ...cancellation, logs: [{ ...cancellation.logs[0]!, address: `0x${'f'.repeat(40)}` }] },
      'sandbox',
    )).toBeUndefined()
    expect(failedX402SettlementAuthorizationDisposition(
      attempt,
      { ...cancellation, logs: [] },
      'sandbox',
    )).toBeUndefined()
  })

  it('reconstructs managed custody identity and rejects partial persisted custody fields', () => {
    const worker = createWorker('x402', { environment: 'production' })
    const providerRef = worker.state.operation.binding.authority.kind === 'provider_connection'
      ? worker.state.operation.binding.authority.providerRef
      : 'provider:test-worker'
    const custody = {
      custodyRef: 'custody:test-worker',
      custodyGeneration: 7,
      custodyDailyMaximum: { currency: 'USD', units: '100000', exponent: 2 },
    } as const
    const reservation = mintExternalSpendIdentity({
      principalId: String(worker.state.dispatch.principalId),
      credentialId: String(worker.state.dispatch.credentialId),
      grantRef: String(worker.state.dispatch.grantRef),
      grantGeneration: Number(worker.state.dispatch.grantGeneration),
      environment: 'production',
      invocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: String(worker.state.dispatch.operationRef),
      providerRef,
      paymentIdentifier: 'payment:test-worker',
      challengeDigest: digest('c'),
      amount: { currency: 'USD', units: '1', exponent: 2 },
      ...custody,
    })
    const attempt = {
      reservationRef: reservation.reservationRef,
      selectedRequirementJson: '{}',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      paymentIdentifier: 'payment:test-worker',
      challengeDigest: digest('c'),
      amountUnits: '1',
      currency: 'USD',
      exponent: 2,
      custodyBudgetRef: custody.custodyRef,
      custodyGeneration: custody.custodyGeneration,
      custodyDailyMaximumUnits: custody.custodyDailyMaximum.units,
    }

    const identity = externalSpendIdentityFromAttempt(
      worker.state.dispatch as never,
      worker.state.operation,
      attempt,
      attemptRef,
      1,
    )
    expect(identity).toMatchObject(custody)
    expect(externalSpendIdentityFromAttempt(
      worker.state.dispatch as never,
      worker.state.operation,
      { ...attempt, asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
      attemptRef,
      1,
    )).toBeUndefined()
    const { custodyGeneration: _custodyGeneration, ...partialAttempt } = attempt
    void _custodyGeneration
    expect(externalSpendIdentityFromAttempt(
      worker.state.dispatch as never,
      worker.state.operation,
      partialAttempt,
      attemptRef,
      1,
    )).toBeUndefined()
  })

  it('cold-recovers a possibly submitted canary payment with its original context-bound reservation and no re-sign', async () => {
    readX402EvmReceiptMock.mockReset()
    mocks.createCdpEvmX402PaymentSignature.mockClear()
    const worker = createWorker('x402', { sellerCanary: true })
    const dispatch = worker.state.dispatch
    const recoveryInvocationRef = String(dispatch.invocationRef)
    const operation = worker.state.operation
    const descriptor = materializeRuntimePublishedOperation(operation)
    const providerRef = operation.binding.authority.kind === 'provider_connection'
      ? operation.binding.authority.providerRef
      : 'provider:test-worker'
    const payment = operation.identity.payment
    if (payment.kind !== 'x402') throw new Error('x402_payment_profile_missing')
    const observedAt = new Date().toISOString()
    const actor = {
      callerRef: String(dispatch.credentialId),
      principalRef: String(dispatch.principalId),
    }
    const control = {
      sourceRef: `operation-invocation-source:${recoveryInvocationRef}`,
      preparedMaterialDigest: String(dispatch.inputDigest),
      updatedAt: observedAt,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      control: {
        invocationRef: recoveryInvocationRef,
        invocationVersion: 1,
        origin: { kind: 'standalone' as const, ...actor },
        owner: actor,
        action: { id: operation.operationId, contractVersion: String(descriptor.version) },
        desired: { state: 'invoke' as const },
        authority: { reference: 'authority:test-worker', expiresAt: observedAt },
        acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test-worker' },
        freshness: { state: 'current' as const, observedAt },
        control: {
          state: 'reconciliation_required' as const,
          attemptRef,
          effectGeneration: 1,
          release: 'possibly_started' as const,
        },
      },
    }
    const durableAttempt = {
      invocationRef: recoveryInvocationRef,
      attemptRef,
      attemptNumber: 1,
      actor,
      effectGeneration: 1,
      lease: { owner: 'worker:test-worker', expiresAt: observedAt },
      idempotency: {
        operationKey: operation.operationId,
        materialInputDigest: String(dispatch.inputDigest),
        effectIdentity: digest('e'),
      },
      release: { state: 'possibly_released' as const },
      outcome: { state: 'reconciliation_required' as const },
      recordedAt: observedAt,
    }
    const payer = '0x0000000000000000000000000000000000000002'
    const nonce = `0x${'a'.repeat(64)}` as const
    const payTo = '0x0000000000000000000000000000000000000003'
    const custody = {
      custodyRef: 'custody:test-worker',
      custodyGeneration: 7,
      custodyDailyMaximum: { currency: 'USD', units: '100000', exponent: 2 },
    } as const
    const paymentIdentifier = 'payment:test-worker'
    const challengeDigest = digest('c')
    const paymentFacts = externalSpendPaymentFactsFromDispatch(dispatch as never, {
      attemptRef,
      effectGeneration: 1,
      providerRef,
      paymentIdentifier,
      challengeDigest,
      amount: { currency: 'USD', units: '1', exponent: 2 },
      ...custody,
    })
    const reservation = mintExternalSpendIdentity(paymentFacts)
    const paymentAttempt = {
      dispatchRef: recoveryInvocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: String(dispatch.operationRef),
      inputDigest: String(dispatch.inputDigest),
      reservationRef: reservation.reservationRef,
      paymentIdentifier,
      challengeDigest,
      amountUnits: '1',
      currency: 'USD',
      exponent: 2,
      state: 'possibly_submitted' as const,
      scheme: 'exact',
      network: payment.network,
      asset: payment.asset,
      payTo,
      custodyRef: 'sha256:authorization-custody',
      custodyBudgetRef: custody.custodyRef,
      custodyGeneration: custody.custodyGeneration,
      custodyDailyMaximumUnits: custody.custodyDailyMaximum.units,
      paymentPayer: payer,
      paymentNonce: nonce,
      paymentResponseDigest: digest('s'),
    }
    let currentPaymentAttempt: typeof paymentAttempt | Omit<typeof paymentAttempt, 'custodyGeneration'>
      = paymentAttempt
    const transactionHash = `0x${'4'.repeat(64)}` as const
    const transferAmount = 1n
    const transactionInput = encodeFunctionData({
      abi: eip3009ABI,
      functionName: 'transferWithAuthorization',
      args: [
        payer,
        payTo,
        transferAmount,
        0n,
        9_999_999_999n,
        nonce,
        27,
        `0x${'b'.repeat(64)}`,
        `0x${'c'.repeat(64)}`,
      ],
    })
    readX402EvmReceiptMock.mockResolvedValue({
      transactionHash,
      status: 'success',
      confirmations: 12n,
      blockHash: `0x${'5'.repeat(64)}`,
      blockNumber: 100n,
      observedBlockTimestamp: 1_788_120_000n,
      authorizationState: true,
      transactionTo: payment.asset,
      transactionInput,
      logs: [{
        address: payment.asset,
        data: encodeAbiParameters([{ type: 'uint256' }], [transferAmount]),
        topics: encodeEventTopics({
          abi: erc20Abi,
          eventName: 'Transfer',
          args: { from: payer, to: payTo },
        }),
      }],
    })
    const evidenceMaterial = {
      kind: 'x402_payment_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'evidence:test-worker',
      source: providerRef,
      invocationRef: recoveryInvocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: String(dispatch.operationRef),
      inputDigest: String(dispatch.inputDigest),
      requestDigest: digest('r'),
      transportObservationDigest: digest('t'),
      paymentObservationDigest: digest('o'),
      providerRef,
      paymentIdentifier,
      reservationRef: reservation.reservationRef,
      challengeDigest,
      amount: { currency: 'USD', units: '1', exponent: 2 },
      settlementStatus: 'settled' as const,
      paymentResponseDigest: digest('s'),
      transactionHash,
      observedAt,
    }
    const evidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial as StableHashValue),
    }
    const recovered = { ...dispatch, state: 'reconciliation_required' as const }
    const runQuery = worker.ctx.runQuery as MockCall<QueryCall>
    const queryImplementation = runQuery.getMockImplementation()
    if (queryImplementation === undefined) throw new Error('worker_query_implementation_missing')
    runQuery.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      switch (path) {
        case 'capabilityOperationInvocations:readRecovery': return recovered
        case 'actionInvocationControl:readControl': return control
        case 'actionInvocationControl:readAttempts': return [durableAttempt]
        case 'actionInvocationControl:readHistory': return []
        case 'actionInvocationControl:readHistoryCommand': return null
        case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return currentPaymentAttempt
        default: return await queryImplementation(reference, args)
      }
    })
    const runMutation = worker.ctx.runMutation as MockCall<MutationCall>
    const mutationImplementation = runMutation.getMockImplementation()
    if (mutationImplementation === undefined) throw new Error('worker_mutation_implementation_missing')
    runMutation.mockImplementation(async (reference: unknown, args: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      worker.state.mutations.push(path)
      worker.state.mutationCalls.push({ path, args })
      if (path === 'capabilityOperationPreSubmissionRecovery:reconcilePostSubmissionX402Money') {
        return { kind: 'accepted' }
      }
      if (path === 'moneyX402PaymentAttempts:reconcileX402PaymentAttempt') {
        return { kind: 'settled', settlementStatus: 'settled' }
      }
      if (path === 'moneyLedger:reconcileExternalInvocationSpend') {
        return { kind: 'accepted', status: 'settled', replayed: false }
      }
      if (path === 'capabilityOperationInvocations:projectRecovery') {
        return { kind: 'recorded' }
      }
      return await mutationImplementation(reference, args)
    })

    const {
      custodyGeneration: _custodyGeneration,
      ...partialCustodyAttempt
    } = paymentAttempt
    void _custodyGeneration
    currentPaymentAttempt = partialCustodyAttempt
    const partialRecovery = await recoverCapabilityOperationInvocation(worker.ctx as never, {
        invocationRef: recoveryInvocationRef,
        principalId: String(dispatch.principalId),
        credentialId: String(dispatch.credentialId),
        mode: 'reconcile',
        evidence,
      })
    expect(partialRecovery).toMatchObject({ kind: 'reconciliation_required' })
    expect(readX402EvmReceiptMock).not.toHaveBeenCalled()

    currentPaymentAttempt = paymentAttempt
    const recoveredCanary = await recoverCapabilityOperationInvocation(worker.ctx as never, {
        invocationRef: recoveryInvocationRef,
        principalId: String(dispatch.principalId),
        credentialId: String(dispatch.credentialId),
        mode: 'reconcile',
        evidence,
      })
    expect(recoveredCanary).toMatchObject({
      kind: 'found',
      receipt: {
        state: 'settled',
        network: payment.network,
        asset: payment.asset,
        paymentIdentifier,
        settlementTransactionHash: transactionHash,
        refundState: 'not_applicable',
        lossState: 'none',
        agenticEconomyFee: { units: '0' },
        totalBuyerAuthorization: { units: '0' },
      },
    })
    if (recoveredCanary.kind !== 'found' || recoveredCanary.receipt === undefined) {
      throw new Error('seller_canary_recovery_receipt_missing')
    }
    expect(recoveredCanary.receipt).not.toHaveProperty('transactionRef')
    expect(recoveredCanary.receipt).not.toHaveProperty('accountingTransactionRefs')

    expect(worker.state.mutationCalls).toContainEqual(expect.objectContaining({
      path: 'capabilityOperationPreSubmissionRecovery:reconcilePostSubmissionX402Money',
      args: expect.objectContaining({
        reservationRef: reservation.reservationRef,
        idempotencyDigest: reservation.idempotencyDigest,
        custodyRef: custody.custodyRef,
        custodyGeneration: custody.custodyGeneration,
        custodyDailyMaximum: custody.custodyDailyMaximum,
        executionContext: paymentFacts.executionContext,
      }),
    }))
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('cancels before buyer reserve with no buyer or external transaction', async () => {
    const worker = createWorker('x402', { environment: 'production' })
    const dispatch = worker.state.dispatch
    const operation = worker.state.operation
    const descriptor = materializeRuntimePublishedOperation(operation)
    const now = new Date().toISOString()
    const actor = {
      callerRef: String(dispatch.credentialId),
      principalRef: String(dispatch.principalId),
    }
    const control = {
      sourceRef: `operation-invocation-source:${invocationRef}`,
      preparedMaterialDigest: String(dispatch.inputDigest),
      updatedAt: now,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      control: {
        invocationRef,
        invocationVersion: 1,
        origin: { kind: 'standalone' as const, ...actor },
        owner: actor,
        action: { id: operation.operationId, contractVersion: String(descriptor.version) },
        desired: { state: 'invoke' as const },
        authority: { reference: 'authority:test-worker', expiresAt: now },
        acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test-worker' },
        freshness: { state: 'current' as const, observedAt: now },
        control: {
          state: 'leased' as const,
          attemptRef,
          effectGeneration: 1,
          leaseOwner: 'worker:test-worker',
          leaseExpiresAt: now,
          release: 'not_started' as const,
        },
      },
    }
    const attempt = {
      invocationRef,
      attemptRef,
      attemptNumber: 1,
      actor,
      effectGeneration: 1,
      lease: { owner: 'worker:test-worker', expiresAt: now },
      idempotency: {
        operationKey: operation.operationId,
        materialInputDigest: String(dispatch.inputDigest),
        effectIdentity: digest('e'),
      },
      release: { state: 'not_released' as const },
      outcome: { state: 'running' as const },
      recordedAt: now,
    }
    const recoveryRow = {
      ...dispatch,
      state: 'pending' as const,
    }
    const runQuery = worker.ctx.runQuery as MockCall<QueryCall>
    const queryImplementation = runQuery.getMockImplementation()
    if (queryImplementation === undefined) throw new Error('worker_query_implementation_missing')
    runQuery.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      switch (path) {
        case 'capabilityOperationInvocations:readRecovery': return recoveryRow
        case 'actionInvocationControl:readControl': return control
        case 'actionInvocationControl:readAttempt': return attempt
        case 'actionInvocationControl:readAttempts': return [attempt]
        case 'actionInvocationControl:readHistory': return []
        case 'actionInvocationControl:readHistoryCommand': return null
        case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return null
        case 'moneyLedger:readInvocationChargeExpectedAccountVersion': return null
        default: return await queryImplementation(reference, args)
      }
    })
    const runMutation = worker.ctx.runMutation as MockCall<MutationCall>
    const mutationImplementation = runMutation.getMockImplementation()
    if (mutationImplementation === undefined) throw new Error('worker_mutation_implementation_missing')
    runMutation.mockImplementation(async (reference: unknown, args: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'capabilityOperationInvocations:cancelBeforeClaim') return { kind: 'claimed' }
      if (path === 'moneyLedger:reconcileInvocationCharge') return { kind: 'none' }
      if (path === 'moneyLedger:releaseBrokeredInvocationCharge') {
        return { kind: 'refused', code: 'charge_reconciliation_required', retryable: false }
      }
      if (path === 'actionInvocationControl:transact') return { kind: 'applied', invocationVersion: 2 }
      if (path === 'capabilityOperationInvocations:projectRecovery') {
        worker.state.records.push(args)
        return { kind: 'recorded' }
      }
      return await mutationImplementation(reference, args)
    })

    const result = await recoverCapabilityOperationInvocation(worker.ctx as never, {
      invocationRef,
      principalId: String(dispatch.principalId),
      credentialId: String(dispatch.credentialId),
      mode: 'cancel',
      idempotencyKey: String(dispatch.idempotencyKey),
    })

    expect(result).toMatchObject({
      kind: 'found',
      invocationRef,
      operationRef: dispatch.operationRef,
      state: 'cancelled',
      result: { kind: 'refused', code: 'invocation_cancelled', retryable: false },
    })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
  })

  it('retains the managed reservation when payment-attempt recovery is unavailable', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      preparePaymentErrorState: 'possibly_submitted',
    })
    const runQuery = worker.ctx.runQuery as MockCall<QueryCall>
    const implementation = runQuery.getMockImplementation()
    if (implementation === undefined) throw new Error('worker_query_implementation_missing')
    let attemptReads = 0
    runQuery.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'moneyX402PaymentAttempts:readX402PaymentAttempt') {
        attemptReads += 1
        if (attemptReads === 1) throw new Error('attempt_read_unavailable')
        return null
      }
      return await implementation(reference, args)
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(paths).not.toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
    })
  })

  it('keeps a possibly submitted x402 reservation for reconciliation after retry', async () => {
    const worker = createWorker('x402', {
      preparePaymentErrorState: 'possibly_submitted',
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).not.toContain('moneyLedger:markBrokeredInvocationChargeOutcomeUnknown')
    expect(paths).toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(paths).not.toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
    })
  })

  it.each([
    ['missing receipt evidence', undefined],
    ['reorged receipt evidence', undefined],
    ['conflicting endpoint evidence', undefined],
    ['unconfirmed receipt evidence', unconfirmedReceipt],
  ])('keeps a submitted not_settled reservation when %s', async (_label, independentReceipt) => {
    readX402EvmReceiptMock.mockReset()
    readX402EvmReceiptMock.mockResolvedValue(independentReceipt)
    const worker = createWorker('x402', { environment: 'sandbox' })
    const dispatch = worker.state.dispatch
    const operation = worker.state.operation
    const descriptor = materializeRuntimePublishedOperation(operation)
    const now = new Date().toISOString()
    const actor = {
      callerRef: String(dispatch.credentialId),
      principalRef: String(dispatch.principalId),
    }
    const control = {
      sourceRef: `operation-invocation-source:${invocationRef}`,
      preparedMaterialDigest: String(dispatch.inputDigest),
      updatedAt: now,
      currentAttemptRef: attemptRef,
      currentEffectGeneration: 1,
      control: {
        invocationRef,
        invocationVersion: 1,
        origin: { kind: 'standalone' as const, ...actor },
        owner: actor,
        action: { id: operation.operationId, contractVersion: String(descriptor.version) },
        desired: { state: 'invoke' as const },
        authority: { reference: 'authority:test-worker', expiresAt: now },
        acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test-worker' },
        freshness: { state: 'current' as const, observedAt: now },
        control: {
          state: 'leased' as const,
          attemptRef,
          effectGeneration: 1,
          leaseOwner: 'worker:test-worker',
          leaseExpiresAt: now,
          release: 'not_started' as const,
        },
      },
    }
    const attempt = {
      invocationRef,
      attemptRef,
      attemptNumber: 1,
      actor,
      effectGeneration: 1,
      lease: { owner: 'worker:test-worker', expiresAt: now },
      idempotency: {
        operationKey: operation.operationId,
        materialInputDigest: String(dispatch.inputDigest),
        effectIdentity: digest('e'),
      },
      release: { state: 'not_released' as const },
      outcome: { state: 'running' as const },
      recordedAt: now,
    }
    const providerRef = operation.binding.authority.kind === 'provider_connection'
      ? operation.binding.authority.providerRef
      : 'provider:test-worker'
    const payer = '0x0000000000000000000000000000000000000002'
    const nonce = `0x${'a'.repeat(64)}`
    const reservationRef = mintExternalSpendIdentity({
      principalId: String(dispatch.principalId),
      credentialId: String(dispatch.credentialId),
      grantRef: String(dispatch.grantRef),
      grantGeneration: Number(dispatch.grantGeneration),
      environment: 'sandbox',
      invocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: String(dispatch.operationRef),
      providerRef,
      paymentIdentifier: 'payment:test-worker',
      challengeDigest: digest('c'),
      amount: { currency: 'USD', units: '1', exponent: 2 },
    }).reservationRef
    const paymentAttempt = {
      attemptRef,
      effectGeneration: 1,
      reservationRef,
      selectedRequirementJson: '{}',
      paymentIdentifier: 'payment:test-worker',
      challengeDigest: digest('c'),
      amountUnits: '1',
      currency: 'USD',
      exponent: 2,
      state: 'possibly_submitted',
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x0000000000000000000000000000000000000003',
      paymentPayer: payer,
      paymentNonce: nonce,
      paymentResponseDigest: digest('s'),
    }
    const evidenceMaterial = {
      kind: 'x402_payment_reconciliation' as const,
      version: 1 as const,
      evidenceRef: 'evidence:test-worker',
      source: 'provider:test-worker',
      invocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: String(dispatch.operationRef),
      inputDigest: String(dispatch.inputDigest),
      requestDigest: digest('r'),
      transportObservationDigest: digest('t'),
      paymentObservationDigest: digest('p'),
      providerRef,
      paymentIdentifier: 'payment:test-worker',
      reservationRef,
      challengeDigest: digest('c'),
      amount: { currency: 'USD', units: '1', exponent: 2 },
      settlementStatus: 'not_settled' as const,
      paymentResponseDigest: digest('s'),
      transactionHash: `0x${'4'.repeat(64)}`,
      observedAt: now,
    }
    const evidence = {
      ...evidenceMaterial,
      digest: canonicalDigest(evidenceMaterial as StableHashValue),
    }
    const recovered = { ...dispatch, state: 'pending' as const }
    const runQuery = worker.ctx.runQuery as MockCall<QueryCall>
    const queryImplementation = runQuery.getMockImplementation()
    if (queryImplementation === undefined) throw new Error('worker_query_implementation_missing')
    runQuery.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      switch (path) {
        case 'capabilityOperationInvocations:readRecovery': return recovered
        case 'actionInvocationControl:readControl': return control
        case 'actionInvocationControl:readAttempt': return attempt
        case 'actionInvocationControl:readAttempts': return [attempt]
        case 'actionInvocationControl:readHistory': return []
        case 'actionInvocationControl:readHistoryCommand': return null
        case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return paymentAttempt
        default: return await queryImplementation(reference, args)
      }
    })
    const runMutation = worker.ctx.runMutation as MockCall<MutationCall>
    const mutationImplementation = runMutation.getMockImplementation()
    if (mutationImplementation === undefined) throw new Error('worker_mutation_implementation_missing')
    runMutation.mockImplementation(async (reference: unknown, args: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'capabilityOperationInvocations:projectRecovery') {
        worker.state.records.push(args)
        return { kind: 'recorded' }
      }
      return await mutationImplementation(reference, args)
    })

    const result = await recoverCapabilityOperationInvocation(worker.ctx as never, {
      invocationRef,
      principalId: String(dispatch.principalId),
      credentialId: String(dispatch.credentialId),
      mode: 'reconcile',
      evidence,
    })

    expect(result).toMatchObject({
      kind: 'reconciliation_required',
    })
    expect(readX402EvmReceiptMock).toHaveBeenCalledWith(
      paymentAttempt.network,
      paymentAttempt.asset,
      evidence.transactionHash,
      expect.anything(),
      'sandbox',
      payer,
      nonce,
    )
    expect(worker.state.mutationCalls.map(({ path }) => path)).not.toContain(
      'moneyLedger:reconcileExternalInvocationSpend',
    )
    expect(worker.state.mutationCalls.map(({ path }) => path)).not.toContain(
      'moneyLedger:finalizeExternalInvocationSpend',
    )
  })
  it('replays the canonical terminal effect without a second money entry', async () => {
    const worker = createWorker('http')
    mocks.claimCanonicalInvocation.mockReset()
    mocks.claimCanonicalInvocation
      .mockResolvedValueOnce({
        kind: 'claimed',
        snapshot: {
          control: { currentAttemptRef: attemptRef },
          attempt: { attemptRef, effectGeneration: 1 },
        },
      })
      .mockResolvedValueOnce({ kind: 'terminal_replay' })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'none' })

    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.records.filter((record) => record.state === 'completed')).toHaveLength(1)
  })
  it('restores an AE-internal hold when a leased retry refuses before reclaim', async () => {
    const worker = createWorker('http', { alreadyLeased: true, stalePrincipal: true })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.reconciliations).toEqual([
      expect.objectContaining({
        transactionRef: `operation-money:${invocationRef}:${attemptRef}:1`,
        outcome: 'not_released',
      }),
    ])
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused', code: 'grant_generation_stale' },
    })
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
  })

  it('refuses a leased retry without a hold as refused, not reconciliation_required', async () => {
    const worker = createWorker('http', {
      alreadyLeased: true,
      stalePrincipal: true,
      reconcileNone: true,
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'grant_generation_stale' },
    })
    expect(worker.state.records.some((record) => record.state === 'reconciliation_required')).toBe(false)
  })

  it('keeps reconciliation required when pre-release money settlement refuses', async () => {
    const worker = createWorker('http', {
      releaseFenceResult: { kind: 'refused' },
      reconcileRefused: true,
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
  })

  it('marks an uncertain possible release unknown and requires reconciliation', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: digest('u'),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.unknownCharges).toContainEqual(expect.objectContaining({
      transactionRef: 'transaction:accepted-result',
      principalId: 'principal:test-worker',
    }))
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.reconciliations).toHaveLength(0)
  })

  it('keeps managed x402 reconciliation required when payment evidence persistence fails', async () => {
    const worker = createWorker('x402', { failPaymentObservation: true })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.unknownCharges).toContainEqual(expect.objectContaining({
      invocationRef,
    }))
    expect(worker.state.reconciliations).toHaveLength(0)
    const managedPaths = worker.state.mutationCalls.map(({ path }) => path)
    expect(managedPaths).toContain('moneyManagedCallLifecycle:markPossiblySubmitted')
    expect(managedPaths).toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(managedPaths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(managedPaths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
    const expiryWorker = createWorker('x402')
    const appliedSetup = configureExpiryRecovery(expiryWorker, 'applied')
    const appliedResult = await expireAuthorizationRecovery(expiryWorker.ctx as never, {
      invocationRef,
      principalId: String(expiryWorker.state.dispatch.principalId),
      credentialId: String(expiryWorker.state.dispatch.credentialId),
    })
    expect(appliedResult).toMatchObject({
      kind: 'reconciliation_required',
      expiryDisposition: 'automatic',
      evidence: {
        attemptRef,
        effectGeneration: 1,
        evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
      },
    })
    expect(appliedSetup.nativeCalls).toHaveLength(1)
    expect(appliedSetup.nativeCalls[0]).toMatchObject({
      expectedInvocationVersion: 1,
      expectedEffectGeneration: 1,
      history: { kind: 'publish_observation' },
      row: { control: { control: { state: 'reconciliation_required', attemptRef } } },
    })
    expect(appliedSetup.expiryCalls).toEqual([
      expect.objectContaining({ nativeTransition: 'applied' }),
    ])
    const appliedPaths = expiryWorker.state.mutationCalls.map(({ path }) => path)
    expect(appliedPaths).toContain('actionInvocationControl:transact')
    expect(appliedPaths).toContain('capabilityOperationX402AuthorizationExpiry:queueExpiredX402Authorization')
    expect(appliedPaths).not.toContain('actionInvocationControls:patch')
    expect(appliedPaths.some((path) => path.startsWith('moneyLedger:'))).toBe(false)

    const manualWorker = createWorker('x402')
    const manualSetup = configureExpiryRecovery(manualWorker, 'failed')
    const manualResult = await expireAuthorizationRecovery(manualWorker.ctx as never, {
      invocationRef,
      principalId: String(manualWorker.state.dispatch.principalId),
      credentialId: String(manualWorker.state.dispatch.credentialId),
    })
    expect(manualResult).toMatchObject({
      kind: 'reconciliation_required',
      expiryDisposition: 'manual_review',
      evidence: {
        evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
      },
    })
    expect(manualSetup.nativeCalls).toHaveLength(1)
    expect(manualSetup.expiryCalls).toEqual([
      expect.objectContaining({ nativeTransition: 'manual_review' }),
    ])
    expect(manualWorker.state.mutationCalls.some(({ path }) => path.startsWith('moneyLedger:'))).toBe(false)
  })
})

function configureExpiryRecovery(
  worker: ReturnType<typeof createWorker>,
  nativeResult: 'applied' | 'failed',
): {
  nativeCalls: Array<Record<string, unknown>>
  expiryCalls: Array<Record<string, unknown>>
} {
  const dispatch = worker.state.dispatch
  const operation = worker.state.operation
  const descriptor = materializeRuntimePublishedOperation(operation)
  const now = new Date().toISOString()
  const actor = {
    callerRef: String(dispatch.credentialId),
    principalRef: String(dispatch.principalId),
  }
  const control = {
    sourceRef: `operation-invocation-source:${invocationRef}`,
    preparedMaterialDigest: String(dispatch.inputDigest),
    updatedAt: now,
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    control: {
      invocationRef,
      invocationVersion: 1,
      origin: { kind: 'standalone' as const, ...actor },
      owner: actor,
      action: { id: operation.operationId, contractVersion: String(descriptor.version) },
      desired: { state: 'invoke' as const },
      authority: { reference: 'authority:test-worker', expiresAt: now },
      acceptedAuthority: { kind: 'approve_each' as const, authorityRef: 'authority:test-worker' },
      freshness: { state: 'current' as const, observedAt: now },
      control: {
        state: 'leased' as const,
        attemptRef,
        effectGeneration: 1,
        leaseOwner: 'worker:test-worker',
        leaseExpiresAt: now,
        release: 'not_started' as const,
      },
    },
  }
  const attempt = {
    invocationRef,
    attemptRef,
    attemptNumber: 1,
    actor,
    effectGeneration: 1,
    lease: { owner: 'worker:test-worker', expiresAt: now },
    idempotency: {
      operationKey: operation.operationId,
      materialInputDigest: String(dispatch.inputDigest),
      effectIdentity: digest('e'),
    },
    release: { state: 'not_released' as const },
    outcome: { state: 'running' as const },
    recordedAt: now,
  }
  const recoveryRow = { ...dispatch, state: 'pending' as const }
  const paymentAttempt = {
    dispatchRef: invocationRef,
    attemptRef,
    effectGeneration: 1,
    custodyRef: 'custody:test-worker',
    authorizationDigest: digest('a'),
    reservationRef: 'reservation:test-worker',
    state: 'prepared' as const,
    paymentAuthorizationExpiresAt: 1,
    evidenceRefs: [],
  }
  const nativeCalls: Array<Record<string, unknown>> = []
  const expiryCalls: Array<Record<string, unknown>> = []
  const runQuery = worker.ctx.runQuery as MockCall<QueryCall>
  const queryImplementation = runQuery.getMockImplementation()
  if (queryImplementation === undefined) throw new Error('worker_query_implementation_missing')
  runQuery.mockImplementation(async (reference: unknown, args?: Record<string, unknown>) => {
    const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
    switch (path) {
      case 'capabilityOperationInvocations:readRecovery': return recoveryRow
      case 'actionInvocationControl:readControl': return control
      case 'actionInvocationControl:readAttempt': return attempt
      case 'actionInvocationControl:readAttempts': return [attempt]
      case 'actionInvocationControl:readHistory': return []
      case 'actionInvocationControl:readHistoryCommand': return null
      case 'moneyX402PaymentAttempts:readX402PaymentAttempt': return paymentAttempt
      default: return await queryImplementation(reference, args)
    }
  })
  const runMutation = worker.ctx.runMutation as MockCall<MutationCall>
  const mutationImplementation = runMutation.getMockImplementation()
  if (mutationImplementation === undefined) throw new Error('worker_mutation_implementation_missing')
  runMutation.mockImplementation(async (reference: unknown, args: Record<string, unknown>) => {
    const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
    worker.state.mutations.push(path)
    worker.state.mutationCalls.push({ path, args })
    if (path === 'actionInvocationControl:transact') {
      nativeCalls.push(args)
      if (nativeResult === 'failed') throw new Error('native_observation_unavailable')
      return { kind: 'applied', invocationVersion: 2 }
    }
    if (path === 'capabilityOperationX402AuthorizationExpiry:queueExpiredX402Authorization') {
      expiryCalls.push(args)
      const evidence = {
        attemptRef,
        effectGeneration: 1,
        requiredAt: new Date().toISOString(),
        retry: 'reconcile_before_retry' as const,
        evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
      }
      return nativeResult === 'failed'
        ? { kind: 'manual_review', disposition: 'manual_review', invocationRef, operationRef: worker.state.dispatch.operationRef, evidence }
        : { kind: 'queued', disposition: 'automatic', invocationRef, operationRef: worker.state.dispatch.operationRef, evidence }
    }
    return await mutationImplementation(reference, args)
  })
  return { nativeCalls, expiryCalls }
}
