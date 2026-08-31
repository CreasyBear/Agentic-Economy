import {
  attemptRef,
  createWorker,
  digest,
  grantRef,
  handler,
  invocationRef,
  mocks,
} from './capability-operation-worker-harness'
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
  it('runs an exact sealed canary when only the live qualification digest is recomputed', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      alreadyLeased: true,
      currentOperation: (operation) => ({
        ...operation,
        readiness: {
          ...operation.readiness,
          qualificationDigest: digest('q'),
        },
      }),
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'completed',
      result: {
        kind: 'completed',
        receipt: {
          state: 'settled',
          settlementTransactionHash: '0xworker-settled',
        },
      },
    })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(worker.state.transportCalls).toBe(1)
  })

  it('refuses a sealed canary when exact operation material drifts before claim', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      currentOperation: (operation) => ({
        ...operation,
        identity: {
          ...operation.identity,
          contractDigest: digest('c'),
        },
      }),
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'operation_not_current' },
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'capabilityOperationInvocations:claimDispatch')).toHaveLength(0)
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
  })

  it('runs the sealed sandbox seller canary through managed custody with only external-spend accounting', async () => {
    const worker = createWorker('x402', { sellerCanary: true, alreadyLeased: true })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:authorizeInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:finalizeBrokeredInvocationCharge')
    expect(paths).not.toContain('qualifiedUse:recordQualifiedUse')
    expect(paths).not.toContain('capabilityProviderConnections:issueLease')
    expect(paths).not.toContain('capabilityProviderConnections:consumeLease')
    expect(worker.state.queryCalls).not.toContain('capabilityOperationInvocations:readProviderLeaseAuthority')
    expect(worker.state.queryCalls.filter((path) =>
      path === 'capabilityOperationInvocations:readCurrentProviderConnectionAuthority')).toHaveLength(5)
    expect(paths.filter((path) => path === 'moneyLedger:reserveExternalInvocationSpend')).toHaveLength(1)
    expect(paths.filter((path) => path === 'moneyLedger:finalizeExternalInvocationSpend')).toHaveLength(1)
    expect(worker.state.money).toBeUndefined()
    expect(worker.state.qualifiedUse).toEqual([])
    expect(mocks.invokeProviderConsequenceViaVercel).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).toHaveBeenCalledTimes(1)
    expect(worker.state.events.indexOf('fence-callback'))
      .toBeLessThan(worker.state.events.indexOf('authorization-read'))
    expect(worker.state.mutationCalls.find(({ path }) => path === 'moneyLedger:reserveExternalInvocationSpend')?.args)
      .toMatchObject({
        environment: 'sandbox',
        executionContext: {
          kind: 'seller_onboarding_canary',
          paymentProfile: 'base-sepolia-usdc-exact',
          canaryRef: expect.any(String),
          canaryCommitmentDigest: expect.any(String),
          fundingBudgetRef: 'budget:test-worker',
        },
    })
    const completed = worker.state.records.find((record) => record.state === 'completed')
    expect(completed).toMatchObject({
      state: 'completed',
      evidenceHash: expect.any(String),
      result: {
        kind: 'completed',
        receipt: {
          state: 'settled',
          network: 'eip155:84532',
          asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          providerQuotedAmount: { currency: 'USD', units: '2', exponent: 2 },
          agenticEconomyFee: { currency: 'USD', units: '0', exponent: 2 },
          totalBuyerAuthorization: { currency: 'USD', units: '0', exponent: 2 },
          paymentIdentifier: expect.any(String),
          settlementTransactionHash: '0xworker-settled',
          externalSettlementRef: expect.any(String),
          refundState: 'not_applicable',
          lossState: 'none',
        },
      },
    })
    expect(completed).not.toHaveProperty('usage')
    expect(completed?.result).not.toHaveProperty('usage')

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'none' })
    expect(worker.state.transportCalls).toBe(1)
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.payment.mark).toBeUndefined()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'reconciliation_required',
      result: { kind: 'reconciliation_required' },
    })
  })

  it('refuses a canary whose seller payee aliases the managed payer before signing or transport', async () => {
    const worker = createWorker('x402', {
      sellerCanary: true,
      sellerPayTo: '0x0000000000000000000000000000000000000001',
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'provider_refused' },
    })
  })

  it('keeps an ambiguous canary payment in reconciliation and never pays again on worker replay', async () => {
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'reconciliation_required' })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(worker.state.transportCalls).toBe(1)

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'none' })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledTimes(1)
    expect(worker.state.transportCalls).toBe(1)
  })

  it('brokers sandbox x402 with buyer and managed Base Sepolia custody reservations', async () => {
    const worker = createWorker('x402')
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '2', exponent: 2 },
      rakeBps: 1_000,
    })
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      state: 'completed',
      result: {
        receipt: {
          network: 'eip155:84532',
          settlementTransactionHash: '0xworker-settled',
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.events).toEqual([
      'final-grant-revalidation',
      'current-publication-price-revalidation',
      'buyer-reserve',
      'custody-reserve',
      'custody-prepare',
      'fence-callback',
      'authorization-read',
      'authorization-sign',
      'mark-possibly-submitted',
      'send',
    ])
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(1)
    expect(mocks.guardedFetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'Payment-Signature': 'signed:payment' },
    })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '2', exponent: 2 },
      rakeBps: 1_000,
      priceDigest: expect.any(String),
    })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths.indexOf('moneyLedger:reserveBrokeredInvocationCharge'))
      .toBeLessThan(paths.indexOf('moneyLedger:reserveExternalInvocationSpend'))
    expect(paths.filter((path) => path === 'moneyLedger:finalizeBrokeredInvocationCharge')).toHaveLength(1)
    expect(paths.filter((path) => path === 'moneyLedger:finalizeExternalInvocationSpend')).toHaveLength(1)
    expect(paths).not.toContain('qualifiedUse:recordQualifiedUse')
    expect(worker.state.money).toBeDefined()
    expect(worker.state.payment.prepare).toMatchObject({
      custodyBudgetRef: 'custody:test-worker',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '100000',
    })
    expect(worker.state.mutationCalls.find(({ path }) => path === 'moneyLedger:reserveExternalInvocationSpend')?.args)
      .toMatchObject({
        custodyRef: 'custody:test-worker',
        custodyGeneration: 7,
        custodyDailyMaximum: { currency: 'USD', units: '100000', exponent: 2 },
      })
    expect(mocks.createCdpEvmX402PaymentSignature).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: 'env:AE_X402_CDP_ACCOUNT_NAME',
      }),
      expect.objectContaining({
        onUnsignedMaterial: expect.any(Function),
        requestFingerprintContext: {
          method: 'GET',
          operationRef: worker.state.dispatch.operationRef,
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
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
      const result = handler(worker.ctx, { invocationRef })
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).not.toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).not.toContain('moneyX402PaymentAttempts:prepareX402PaymentAuthorization')
    expect(worker.state.payment.prepare).toBeUndefined()
  })
  it('releases both reservations when brokered signing fails before submission', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      failPaymentSignature: true,
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'payment_signature_unavailable' },
    })
  })
  it('releases the prepared spend without signing or paid send when the grant is revoked at the signing boundary', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      signingBoundaryGrant: null,
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyX402PaymentAttempts:claimX402PaymentAuthorization')
    expect(paths).not.toContain('moneyX402PaymentAttempts:recordX402PaymentSigningIntent')
    expect(paths).not.toContain('moneyX402PaymentAttempts:recordX402PaymentSignatureDigest')
    expect(paths).toContain('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure')
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyLedger:finalizeExternalInvocationSpend'))
    expect(worker.state.payment.authorization).toMatchObject({
      authorizationFailureCode: 'grant_invalid',
    })
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(worker.state.transportCalls).toBe(1)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'payment_signature_unavailable' },
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyLedger:finalizeExternalInvocationSpend'))
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyX402PaymentAttempts:claimX402PaymentAuthorization')
    expect(paths).toContain('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure')
    expect(paths.indexOf('moneyX402PaymentAttempts:recordX402PaymentAuthorizationFailure'))
      .toBeLessThan(paths.indexOf('moneyLedger:finalizeExternalInvocationSpend'))
    expect(worker.state.payment.authorization).toMatchObject({
      claimed: true,
      authorizationFailureCode: 'managed_authorization_unavailable',
    })
  })
  it('retains buyer and external reservations after a post-submit timeout', async () => {
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyLedger:reserveBrokeredInvocationCharge')
    expect(paths).toContain('moneyLedger:reserveExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:markBrokeredInvocationChargeOutcomeUnknown')
    expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
    expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpend')
    expect(worker.state.unknownCharges).toContainEqual(expect.objectContaining({
      transactionRef: expect.any(String),
    }))
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'reconciliation_required' })
  })
  it('reverses external settlement and journals provider loss on invalid paid output', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: invalidPaidOutputObservation,
    })

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
    expect(paths).toContain('moneyLedger:recordBrokeredInvalidOutputLoss')
    expect(paths.indexOf('moneyLedger:reverseExternalInvocationSpendForInvalidOutput'))
      .toBeLessThan(paths.indexOf('moneyLedger:recordBrokeredInvalidOutputLoss'))
    expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:finalizeBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpend')
    expect(paths).not.toContain('qualifiedUse:recordQualifiedUse')
    const reversal = worker.state.mutationCalls.find(({ path }) => path === 'moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
    expect(reversal?.args).toMatchObject({ invalidOutputEvidenceRef: expect.stringContaining('provider-output-invalid:') })
    const loss = worker.state.mutationCalls.find(({ path }) => path === 'moneyLedger:recordBrokeredInvalidOutputLoss')
    expect(loss?.args).toMatchObject({
      externalRef: '0xworker-invalid-output',
      invalidOutputEvidenceRef: expect.stringContaining('provider-output-invalid:'),
      invalidOutputEvidenceDigest: expect.any(String),
      reconciliationEvidenceRefs: expect.arrayContaining([expect.any(String)]),
    })
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: {
        kind: 'refused',
        code: 'provider_output_invalid',
        receipt: {
          externalSettlementRef: '0xworker-invalid-output',
          refundState: 'released',
          lossState: 'provider_output_invalid',
          accountingTransactionRefs: [
            worker.state.money?.transactionRef,
            expect.stringContaining('operation-money-loss:'),
          ],
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

      await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
      const paths = worker.state.mutationCalls.map(({ path }) => path)
      expect(paths).toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
      expect(paths).not.toContain('moneyLedger:recordBrokeredInvalidOutputLoss')
      expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
      expect(paths).not.toContain('moneyLedger:finalizeBrokeredInvocationCharge')
      expect(paths).not.toContain('moneyLedger:reverseExternalInvocationSpend')
      expect(worker.state.unknownCharges).toHaveLength(1)
      expect(worker.state.records.at(-1)).toMatchObject({ state: 'reconciliation_required' })
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

      await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
      const paths = worker.state.mutationCalls.map(({ path }) => path)
      expect(paths).toContain('moneyLedger:reverseExternalInvocationSpendForInvalidOutput')
      expect(paths.filter((path) => path === 'moneyLedger:recordBrokeredInvalidOutputLoss')).toHaveLength(1)
      expect(paths).not.toContain('moneyLedger:releaseBrokeredInvocationCharge')
      expect(paths).not.toContain('moneyLedger:finalizeBrokeredInvocationCharge')
      expect(worker.state.unknownCharges).toHaveLength(1)
      expect(worker.state.records.at(-1)).toMatchObject({
        state: 'reconciliation_required',
        result: { kind: 'reconciliation_required' },
      })
    },
  )
  it('releases both reservations when independent settlement proves not settled', async () => {
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

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths).toContain('moneyLedger:finalizeExternalInvocationSpend')
    expect(paths).toContain('moneyLedger:releaseBrokeredInvocationCharge')
    expect(paths).not.toContain('moneyLedger:finalizeBrokeredInvocationCharge')
    expect(worker.state.unknownCharges).toHaveLength(0)
  })
  it('replays a brokered retry without a second settlement or buyer charge', async () => {
    const worker = createWorker('x402', { environment: 'production' })
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
    const paths = worker.state.mutationCalls.map(({ path }) => path)
    expect(paths.filter((path) => path === 'moneyLedger:reserveBrokeredInvocationCharge')).toHaveLength(1)
    expect(paths.filter((path) => path === 'moneyLedger:finalizeBrokeredInvocationCharge')).toHaveLength(1)
    expect(paths.filter((path) => path === 'moneyLedger:finalizeExternalInvocationSpend')).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(1)
  })
  it('retries a successful invalid-output loss effect with one deterministic journal call', async () => {
    const worker = createWorker('x402', {
      environment: 'production',
      observation: invalidPaidOutputObservation,
    })
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
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    const lossCalls = worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:recordBrokeredInvalidOutputLoss')
    expect(lossCalls).toHaveLength(1)
    expect(lossCalls[0]?.args).toMatchObject({
      invocationRef,
      attemptRef,
    })
    expect(worker.state.records[0]).toMatchObject({
      result: {
        receipt: {
          accountingTransactionRefs: [
            worker.state.money?.transactionRef,
            `operation-money-loss:${invocationRef}:${attemptRef}:1`,
          ],
        },
      },
    })
  })
  it('refuses missing managed x402 custody before claim, charge, or transport', async () => {
    mocks.cdpX402CustodyConfigurationFromEnvironment.mockImplementationOnce(() => undefined as never)
    const worker = createWorker('x402')

    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
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
  it('settles exactly one AE-internal charge after valid output', async () => {
    const worker = createWorker('http')
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '1', exponent: 2 },
      freeTier: false,
      credentialBudgetGrantRef: grantRef,
      credentialBudgetGeneration: 1,
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'released',
    })
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        usageRef: 'usage:accepted-result',
        observedAt: expect.any(Number),
        chargeState: 'paid',
        amount: { units: '1', currency: 'USD', exponent: 2 },
        priceDigest: digest('p'),
        transactionRef: 'transaction:accepted-result',
      },
    })
    expect(worker.state.transportCalls).toBe(1)
    expect(mocks.createCdpEvmX402PaymentSignature).not.toHaveBeenCalled()
    expect(mocks.createSandboxEvmX402PaymentSignature).not.toHaveBeenCalled()
  })
  it('reverses an AE-internal charge for schema-invalid output before completion', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: false,
        requestDigest: digest('i'),
        outputJson: JSON.stringify({ unexpected: true }),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'not_released',
    })
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.records.at(-1)).toMatchObject({ state: 'refused' })
  })
  it('reverses an AE-internal charge for schema-invalid output after release without uncertainty', async () => {
    const worker = createWorker('http', {
      observation: {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: digest('i'),
        outputJson: JSON.stringify({ unexpected: true }),
      },
    })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.reconciliations).toHaveLength(1)
    expect(worker.state.reconciliations[0]).toMatchObject({
      transactionRef: 'transaction:accepted-result',
      outcome: 'not_released',
    })
    expect(worker.state.unknownCharges).toHaveLength(0)
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:markChargeOutcomeUnknown')).toHaveLength(0)
    expect(worker.state.records.some((record) => record.state === 'completed')).toBe(false)
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: { kind: 'refused' },
    })
  })
  it('authorizes exactly once after a prior top-up advances the operator account version', async () => {
    const worker = createWorker('http', { operatorAccountVersion: 1 })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.money).toMatchObject({ expectedAccountVersion: 1 })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(1)
  })

  it('fails closed on a stale operator-version read before provider I/O', async () => {
    const worker = createWorker('http', { operatorAccountVersion: 1, actualOperatorAccountVersion: 2 })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })

    expect(worker.state.money).toMatchObject({ expectedAccountVersion: 1 })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.transportCalls).toBe(0)
    expect(mocks.invokePreparedRouteTransport).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(worker.state.records.at(-1)).toMatchObject({
      state: 'refused',
      result: { kind: 'refused', code: 'ledger_cas_conflict', retryable: true },
    })
  })

  it('settles a zero-price accepted charge and projects free-tier usage', async () => {
    const worker = createWorker('http', { priceUnits: '0' })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '0', exponent: 2 },
      freeTier: false,
      credentialBudgetGrantRef: grantRef,
      credentialBudgetGeneration: 1,
    })
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        usageRef: 'usage:accepted-result',
        observedAt: expect.any(Number),
        chargeState: 'free_tier',
        amount: { units: '0', currency: 'USD', exponent: 2 },
        priceDigest: digest('p'),
      },
    })
  })

  it('bootstraps a missing money account on a zero-price authenticated charge with exact replay', async () => {
    const worker = createWorker('http', { operatorAccountVersion: null, priceUnits: '0' })
    await expect(handler(worker.ctx, { invocationRef })).resolves.toEqual({ kind: 'recorded' })
    expect(worker.state.money).toMatchObject({
      amount: { currency: 'USD', units: '0', exponent: 2 },
      expectedAccountVersion: 0,
      freeTier: false,
    })
    expect(worker.state.mutationCalls.filter(({ path }) => path === 'moneyLedger:authorizeInvocationCharge')).toHaveLength(1)
    expect(worker.state.reconciliations).toHaveLength(0)
    expect(worker.state.records.find((record) => record.state === 'completed')).toMatchObject({
      usage: {
        chargeState: 'free_tier',
        amount: { units: '0', currency: 'USD', exponent: 2 },
        priceDigest: digest('p'),
      },
    })
    const chargeArgs = worker.state.mutationCalls.find(
      ({ path }) => path === 'moneyLedger:authorizeInvocationCharge',
    )?.args
    expect(chargeArgs).toMatchObject({
      transactionRef: `operation-money:${invocationRef}:${attemptRef}:1`,
      idempotencyKey: `operation-money:${invocationRef}:${attemptRef}:1`,
      invocationRef,
      attemptRef,
    })
  })
})
