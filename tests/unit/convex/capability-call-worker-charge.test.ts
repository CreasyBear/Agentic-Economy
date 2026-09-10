import {
  attemptRef,
  createWorker,
  digest,
  handler,
  invocationRef,
  mocks,
} from './capability-call-worker-harness'
import type { RouteTransportObservation } from '@/modules/capability-supply/route-transport-runtime'
import { describe, expect, it, vi } from 'vitest'

const invalidPaidOutputObservation = {
  transport: 'x402',
  disposition: 'succeeded',
  releaseStarted: true,
  requestDigest: digest('i'),
  outputJson: JSON.stringify({ unexpected: true }),
  paymentSubmissionStatus: 'observed',
  settlementEvidence: {
    kind: 'settled',
    response: {
      success: true,
      transaction: '0xworker-invalid-output',
      network: 'eip155:8453',
      amount: '10000',
    },
    digest: digest('s'),
  },
} satisfies RouteTransportObservation

describe('capability operation invocation worker charge/x402', () => {
  it('retires the sealed seller canary before signing or transport', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      alreadyLeased: true,
      currentTool: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          qualificationDigest: digest('q'),
        },
      }),
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'operation_unsupported' },
    })
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('refuses a sealed canary when exact operation material drifts before claim', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      currentTool: (operation) => ({
        ...operation,
        identity: {
          ...operation.identity,
          contractDigest: digest('c'),
        },
      }),
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_not_current' },
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'capabilityCalls:claimDispatch')).toHaveLength(0)
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('does not preserve a shadow external-spend lane for seller canaries', async () => {
    const worker = createWorker('x402', { sellerCanary: true, alreadyLeased: true })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'operation_unsupported' },
    })
    expect(worker.state.mutationCalls.map(({ path }) => path)
      .filter((path) => path.includes('moneyLedger'))).toEqual([])
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
  })

  it('stops a sealed canary when the staged operation drifts at the authorization boundary', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      alreadyLeased: true,
      authorizationCurrentOperation: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          validUntil: operation.readiness.validUntil - 1,
        },
      }),
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.payment.mark).toBeUndefined()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'operation_unsupported' },
    })
  })

  it('refuses a canary whose seller payee aliases the managed payer before signing or transport', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      sellerPayTo: '0x0000000000000000000000000000000000000001',
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'provider_refused' },
    })
  })

  it('refuses an ambiguous seller canary before any payment can become uncertain', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      alreadyLeased: true,
      observation: {
        transport: 'x402',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: digest('u'),
        paymentSubmissionStatus: 'possibly_submitted',
        settlementEvidence: { kind: 'unknown', reason: 'network_timeout' },
      },
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused', result: { kind: 'refused', code: 'operation_unsupported' },
    })
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('brokers sandbox x402 with buyer and managed Base Sepolia custody reservations', async () => {
    const worker = createWorker('x402')
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      state: 'completed',
      result: {
        receipt: {
          commercialModel: 'account_aud',
          buyerCharge: { currency: 'AUD', units: '20000', exponent: 6 },
          providerSettlement: {
            network: 'eip155:84532',
            transactionHash: '0xworker-settled',
          },
        },
      },
    })
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.payment.prepare).toMatchObject({
      dispatchRef: invocationRef,
      attemptRef,
      effectGeneration: 1,
      credentialRef: 'env:AE_X402_CDP_ACCOUNT_NAME',
      custodyBudgetRef: 'custody:test-worker',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '100000',
    })
    expect(worker.state.payment.mark).toMatchObject({ dispatchRef: invocationRef, effectGeneration: 1 })
    expect(worker.state.payment.observe).toMatchObject({ dispatchRef: invocationRef, effectGeneration: 1 })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(mocks.createSandboxEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.x402PaymentCredentialRefFromEnvironment).not.toHaveBeenCalled()
    expect(mocks.credentialFromEnvironment).not.toHaveBeenCalled()
    expect(mocks.cdpX402CustodyConfigurationFromEnvironment).toHaveBeenCalled()
    expect(mocks.cdpX402CustodyBudgetRef).toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).toHaveBeenCalledTimes(1)
    expect(worker.state.qualifiedUse).toEqual([])
  })
  it('brokers production x402 with a buyer reservation and exact external payment', async () => {
    const worker = createWorker('x402', { environment: 'production' })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.events).toEqual([
      'final-grant-revalidation',
      'current-publication-price-revalidation',
      'custody-prepare',
      'fence-callback',
      'managed-call-submission-fence',
      'authorization-read',
      'authorization-sign',
      'mark-possibly-submitted',
      'send',
    ])
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'Payment-Signature': 'signed:payment' },
    })
    expect(worker.state.money).toBeUndefined()
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:markPossiblySubmitted')
    expect(paths).toContain('moneyManagedCallLifecycle:settle')
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).not.toContain('qualifiedUse:recordQualifiedUse')
    expect(worker.state.payment.prepare).toMatchObject({
      custodyBudgetRef: 'custody:test-worker',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '100000',
    })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: 'env:AE_X402_CDP_ACCOUNT_NAME',
      }),
      expect.objectContaining({
        onUnsignedMaterial: expect.any(Function),
        requestFingerprintContext: {
          method: 'GET',
          toolRef: worker.state.dispatch.toolRef,
          aeEnvironment: 'production',
        },
      }),
    )
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(mocks.credentialFromEnvironment).not.toHaveBeenCalled()
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({ state: 'completed' })
  })
  it('continues after atomically reclaiming an expired bare signing claim', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      paymentSigningClaim: 'expired',
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({ state: 'completed' })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(worker.state.mutationCalls.filter(({ path }) =>
      path === 'moneyX402PaymentAttempts:recordX402PaymentSigningIntent')).toHaveLength(1)
  })
  it('leaves an unexpired signing claim pending without minting a second intent', async () => {
    vi.useFakeTimers()
    try {
      const worker = createWorker('x402', {
        environment: 'production',
        paymentSigningClaim: 'unexpired',
      })
      const result = handler(worker.ctx, { callRef: invocationRef })
      await vi.advanceTimersByTimeAsync(1_100)

      await expect(result).resolves.toEqual({ kind: 'recorded' })
      expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
      expect(worker.state.mutationCalls.filter(({ path }) =>
        path === 'moneyX402PaymentAttempts:recordX402PaymentSigningIntent')).toHaveLength(0)
      expect(worker.state.records.at(-1)).toMatchObject({ state: 'reconciliation_required' })
    } finally {
      vi.useRealTimers()
    }
  })
  it('refuses managed x402 without custody configuration before either persistence write', async () => {
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockImplementationOnce(() => undefined as never)
    const worker = createWorker('x402', { environment: 'production' })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).not.toContain('moneyX402PaymentAttempts:prepareX402PaymentAuthorization')
    expect(worker.state.payment.prepare).toBeUndefined()
  })
  it('releases the reservation when the Provider requirement changes before payment', async () => {
    const worker = createWorker('x402', { environment: 'production' })
    mocks.invokePreparedRouteTransport.mockResolvedValueOnce({
      transport: 'x402', disposition: 'refused', releaseStarted: false,
      requestDigest: digest('c'), failureCode: 'payment_provider_requirement_stale',
      paymentSubmissionStatus: 'not_submitted',
    } satisfies RouteTransportObservation)
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(paths).not.toContain('moneyX402PaymentAttempts:recordX402PaymentSigningIntent')
    expect(worker.state.payment.prepare).toBeUndefined()
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'refused', result: { code: 'payment_provider_requirement_stale' } })
  })

  it('releases the managed reservation when signing fails before submission', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      failPaymentSignature: true,
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'payment_signature_unavailable' },
    })
  })
  it('requires proof reconciliation when the grant is revoked after the submission fence', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      signingBoundaryGrant: null,
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).not.toContain('moneyX402PaymentAttempts:claimX402PaymentAuthorization')
    expect(paths).not.toContain('moneyX402PaymentAttempts:recordX402PaymentSigningIntent')
    expect(paths).not.toContain('moneyX402PaymentAttempts:recordX402PaymentSignatureDigest')
    expect(paths).toContain('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure')
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyManagedCallLifecycle:releaseBeforeSubmission'))
    expect(worker.state.payment.authorization).toMatchObject({
      authorizationFailureCode: 'grant_invalid',
    })
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
  })

  it.each([
    ['invalid', 'connection_not_found'],
    ['throw', 'authority_read_failed'],
  ] as const)('records and releases a %s provider authority failure before signing', async (mode, detail) => {
    const worker = createWorker('x402', {
      environment: 'production',
      signingBoundaryProviderAuthority: mode,
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyManagedCallLifecycle:releaseBeforeSubmission'))
    expect(paths).not.toContain('moneyX402PaymentAttempts:claimX402PaymentAuthorization')
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(worker.state.payment.authorization).toMatchObject({
      authorizationFailureCode: 'provider_authority_invalid',
      authorizationFailureDetail: detail,
    })
  })

  it('records a managed authorization that returns no header after the signing claim', async () => {
    const worker = createWorker('x402', { environment: 'production' })
    mocks.createCdpEvmX402PaymentSignature.mockImplementationOnce(async () => undefined as never)

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyX402PaymentAttempts:claimX402PaymentAuthorization')
    expect(paths).toContain('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure')
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyManagedCallLifecycle:releaseBeforeSubmission'))
    expect(worker.state.payment.authorization).toMatchObject({
      claimed: true,
      authorizationFailureCode: 'managed_authorization_unavailable',
    })
  })
  it('retains the managed reservation after a post-submit timeout', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: {
        transport: 'x402',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: digest('u'),
        paymentSubmissionStatus: 'possibly_submitted',
        settlementEvidence: { kind: 'unknown', reason: 'network_timeout' },
      },
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:markPossiblySubmitted')
    expect(paths).toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(paths).not.toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(worker.state.unknownCharges).toHaveLength(1)
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'reconciliation_required' })
  })
  it('settles the Provider obligation while refusing invalid delivered output', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: invalidPaidOutputObservation,
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:settle')
    expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
    expect(paths).not.toContain('moneyLedger:recordBrokeredInvalidOutputLoss')
    expect(paths).not.toContain('qualifiedUse:recordQualifiedUse')
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: {
        kind: 'refused',
        code: 'provider_output_invalid',
        receipt: {
          commercialModel: 'account_aud',
          state: 'settled',
          refundState: 'not_applicable',
          lossState: 'none',
        },
      },
    })
  })
  it.each(['refused', 'throw'] as const)(
    'retains the buyer reservation when invalid-output settlement transition %s',
    async (invalidOutputTransitionResult) => {
      const worker = createWorker('x402', {
        environment: 'production',
        observation: invalidPaidOutputObservation,
        invalidOutputTransitionResult,
      })

      await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
      const paths = worker.state.mutationCalls.map(({ path }) => path)
      expect(paths).toContain('moneyManagedCallLifecycle:settle')
      expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
      expect(worker.state.unknownCharges).toHaveLength(0)
      expect(worker.state.records.at(-1)).toMatchObject({ state: 'refused' })
    },
  )
  it.each(['refused', 'throw'] as const)(
    'marks the buyer reservation unknown when invalid-output loss accounting %s',
    async (invalidOutputLossResult) => {
      const worker = createWorker('x402', {
        environment: 'production',
        observation: invalidPaidOutputObservation,
        invalidOutputLossResult,
      })

      await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
      const paths = worker.state.mutationCalls.map(({ path }) => path)
      expect(paths).toContain('moneyManagedCallLifecycle:settle')
      expect(paths).not.toContain('moneyLedger:recordBrokeredInvalidOutputLoss')
      expect(worker.state.unknownCharges).toHaveLength(0)
      expect(worker.state.records.at(-1)).toMatchObject({ state: 'refused' })
    },
  )
  it('retains the managed reservation after any possible submission even when the Provider reports not settled', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: {
        transport: 'x402',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: digest('n'),
        failureCode: 'payment_not_settled',
        paymentSubmissionStatus: 'observed',
        settlementEvidence: {
          kind: 'not_settled',
          response: {
            success: false,
            transaction: '0xworker-not-settled',
            network: 'eip155:8453',
            amount: '10000',
          },
          digest: digest('n'),
        },
      },
    })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyManagedCallLifecycle:markOutcomeUnknown')
    expect(paths).not.toContain('moneyManagedCallLifecycle:releaseBeforeSubmission')
    expect(worker.state.unknownCharges).toHaveLength(1)
  })
  it('replays a managed Call without a second settlement or transport', async () => {
    const worker = createWorker('x402', { environment: 'production' })
    mocks.claimCanonicalExecution.mockReset()
    mocks.claimCanonicalExecution
      .mockResolvedValueOnce({
        kind: 'claimed',
        snapshot: {
          control: { currentAttemptRef: attemptRef },
          attempt: { attemptRef, effectGeneration: 1 },
        },
      })
      .mockResolvedValueOnce({ kind: 'terminal_replay' })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'none' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths.filter((path) => path === 'moneyManagedCallLifecycle:settle')).toHaveLength(1)
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(worker.state.transportCalls).toBe(1)
  })
  it('replays an invalid-output terminal result without a second managed settlement', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: invalidPaidOutputObservation,
    })
    mocks.claimCanonicalExecution.mockReset()
    mocks.claimCanonicalExecution
      .mockResolvedValueOnce({
        kind: 'claimed',
        snapshot: {
          control: { currentAttemptRef: attemptRef },
          attempt: { attemptRef, effectGeneration: 1 },
        },
      })
      .mockResolvedValueOnce({ kind: 'terminal_replay' })

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'none' })
    const settlementCalls = worker.state.mutationCalls.filter(({ path }) => path === 'moneyManagedCallLifecycle:settle')
    expect(settlementCalls).toHaveLength(1)
    expect(worker.state.records[0]).toMatchObject({
      result: {
        receipt: {
          commercialModel: 'account_aud',
          state: 'settled',
        },
      },
    })
  })
  it('refuses missing managed x402 custody before claim, charge, or transport', async () => {
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockImplementationOnce(() => undefined as never)
    const worker = createWorker('x402')

    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused' },
    })
    expect(mocks.x402PaymentCredentialRefFromEnvironment).not.toHaveBeenCalled()
    expect(mocks.credentialFromEnvironment).not.toHaveBeenCalled()
    expect(mocks.cdpX402CustodyConfigurationFromEnvironment).toHaveBeenCalled()
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(worker.state.qualifiedUse).toHaveLength(0)
  })
  it('refuses paid fixed-AUD execution before Provider I/O', async () => {
    const worker = createWorker('http')
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_unsupported' },
    })
  })

  it('executes a zero-price fixed Operation without creating legacy money state', async () => {
    const worker = createWorker('http', { priceUnits: '0' })
    await expect(handler(worker.ctx, { callRef: invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.mutationCalls.map(({ path }) => path)).not.toContain('moneyLedger:authorizeInvocationCharge')
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        usageRef: `operation-usage:${invocationRef}:${attemptRef}`,
        observedAt: expect.any(Number),
        chargeState: 'free_tier',
        amount: { units: '0', currency: 'AUD', exponent: 6 },
        priceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    })
    expect(worker.state.transportCalls).toBe(1)
  })
})
