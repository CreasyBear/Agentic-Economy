import { sourceMocks, stripeMocks } from './owner-payout-server-harness'
import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  beginAccountFundingThroughSource,
  applyVerifiedStripeEventThroughSource,
  readAccountFundingThroughSource,
} from '@/modules/money/server'
import { createFundingHandoffService } from '@/lib/server/funding-handoff-api'

const input = {
  amount: { currency: 'AUD', units: '5000000', exponent: 6 },
  idempotencyKey: 'account-funding:test-one',
} as const

function command(overrides: Record<string, unknown> = {}) {
  const commandRef = canonicalDigest({
    format: 'ae.account-funding-command-ref:v1',
    ownerId: 'owner-1',
    idempotencyKey: input.idempotencyKey,
  })
  return {
    commandRef,
    accountRef: 'account:owner-1',
    actorPrincipalRef: 'principal:owner-1',
    environment: 'sandbox' as const,
    currency: 'AUD' as const,
    exponent: 6 as const,
    principalUnits: '5000000',
    serviceFeeUnits: '250000',
    taxUnits: '30000',
    totalUnits: '5280000',
    commercialPolicyDigest: `sha256:${'1'.repeat(64)}`,
    commercialPolicyRefs: ['sandbox:managed_x402_deterministic_v1'],
    idempotencyKey: input.idempotencyKey,
    inputDigest: canonicalDigest({
      format: 'ae.account-funding-input:v1',
      ownerId: 'owner-1',
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
    }),
    successReturnRef: 'https://ae.test/owner/credit?funding={CHECKOUT_SESSION_ID}',
    cancelReturnRef: 'https://ae.test/fund/cancelled',
    checkoutMode: 'hosted_page' as const,
    checkoutExpiresAt: 3_700_000,
    providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
    state: 'pending' as const,
    metadataDigest: canonicalDigest({ ae_command_ref: commandRef, ae_contract: 'account_funding_v2' }),
    ...overrides,
  }
}

describe('Account AUD funding HTTP boundary', () => {
  it('returns one direct hosted Checkout handoff after durable reserve and evidence bind', async () => {
    sourceMocks.sourceWriteAdmissionFromRequest.mockResolvedValue({
      version: 'source-write:v2', keyId: 'test', scope: 'billing', operationKey: 'test',
      correlationId: 'correlation:test', commandDigest: `sha256:${'a'.repeat(64)}`, nonce: 'test',
      issuedAt: 100, method: 'POST', initiatorOrigin: 'https://agent.test', targetOrigin: 'https://ae.test',
      targetPath: '/api/v1/account/funding-sessions', targetQuery: '', bodyDigest: `sha256:${'b'.repeat(64)}`,
      signature: 'redacted', signatureInput: 'redacted',
    })
    let durable: ReturnType<typeof command> & {
      initiationKind: 'agent_handoff'; checkoutMode: 'hosted_page'; checkoutExpiresAt: number;
      cancelReturnRef: string; requesterDisplayName: string
    }
    sourceMocks.callPublicSourceMutation.mockImplementation(async (_reference, args: Record<string, unknown>) => {
      if ('principalAmountUnits' in args) {
        const commandRef = `sha256:${'c'.repeat(64)}`
        durable = {
          ...command({
            commandRef, actorPrincipalRef: 'principal:agent-one', accountRef: 'account:one',
            idempotencyKey: `sha256:${'d'.repeat(64)}`, inputDigest: `sha256:${'e'.repeat(64)}`,
            successReturnRef: args.successReturnRef, metadataDigest: canonicalDigest({ ae_command_ref: commandRef, ae_contract: 'account_funding_v2' }),
          }),
          initiationKind: 'agent_handoff', checkoutMode: 'hosted_page', checkoutExpiresAt: args.checkoutExpiresAt as number,
          cancelReturnRef: args.cancelReturnRef as string, requesterDisplayName: 'Buyer agent',
        }
        return { kind: 'accepted', command: durable }
      }
      return { kind: 'accepted', command: durable! }
    })
    const createOrRecoverCreditPayment = vi.fn(async (request) => ({
      kind: 'hosted_redirect' as const,
      expiresAt: request.checkoutExpiresAt!,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_agent_one',
      evidence: {
        provider: 'stripe' as const, externalRef: 'cs_agent_one', amount: request.amount, status: 'pending' as const,
        checkoutStatus: 'open' as const, paymentStatus: 'unpaid' as const, checkoutMode: 'hosted_page' as const,
        checkoutExpiresAt: request.checkoutExpiresAt, requestDigest: `sha256:${'f'.repeat(64)}`,
        metadataDigest: durable!.metadataDigest!, checkoutSessionDigest: `sha256:${'1'.repeat(64)}`,
        evidenceDigest: `sha256:${'2'.repeat(64)}`, evidenceRef: 'stripe:checkout:cs_agent_one', observedAt: 100,
      },
    }))
    const service = createFundingHandoffService(
      new Request('https://ae.test/api/v1/account/funding-sessions', { method: 'POST' }),
      '{}', { createOrRecoverCreditPayment, readCreditPayment: vi.fn() },
    )
    const result = await service.create({
      input: { principalAmount: { currency: 'AUD', exponent: 6, units: '5000000' }, idempotencyKey: 'logical-attempt-one' },
      principal: {
        principalId: 'principal:agent-one', ownerId: 'account:one', credentialId: 'credential:one',
        applicationRef: 'agentic-economy', environment: 'sandbox', scopes: ['market_operations:invoke'], authorityMode: 'inspect_only',
      },
      correlationId: 'correlation:test',
    })
    expect(result).toMatchObject({
      kind: 'funding_session', fundingSessionId: 'cs_agent_one',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_agent_one', pollAfterMs: 5000,
      humanHandoff: { instruction: expect.stringContaining('persist fundingSessionId') },
    })
    expect(createOrRecoverCreditPayment).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'principal:agent-one', accountRef: 'account:one',
    }))
    const bindArgs = sourceMocks.callPublicSourceMutation.mock.calls[1]?.[1]
    expect(bindArgs).not.toHaveProperty('checkoutUrl')
    expect(JSON.stringify(bindArgs)).not.toContain('logical-attempt-one')
  })

  it('reserves the authenticated Account before creating one Stripe checkout', async () => {
    const durable = command()
    const session = {
      kind: 'hosted_redirect' as const,
      expiresAt: durable.checkoutExpiresAt,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_account_funding_one',
      evidence: {
        provider: 'stripe' as const,
        externalRef: 'cs_account_funding_one',
        amount: { currency: 'AUD', units: '5280000', exponent: 6 },
        status: 'pending' as const,
        checkoutStatus: 'open' as const,
        paymentStatus: 'unpaid' as const,
        checkoutMode: 'hosted_page' as const,
        checkoutExpiresAt: durable.checkoutExpiresAt,
        requestDigest: `sha256:${'2'.repeat(64)}`,
        metadataDigest: durable.metadataDigest,
        checkoutSessionDigest: `sha256:${'3'.repeat(64)}`,
        evidenceDigest: `sha256:${'4'.repeat(64)}`,
        evidenceRef: 'stripe:checkout.session:cs_account_funding_one',
        observedAt: 100,
      },
    }
    const createOrRecoverCreditPayment = vi.fn(async () => session)
    sourceMocks.callSourceMutation
      .mockResolvedValueOnce({ kind: 'accepted', command: durable })
      .mockResolvedValueOnce({
        kind: 'accepted',
        command: { ...durable, externalRef: session.evidence.externalRef },
      })

    await expect(beginAccountFundingThroughSource(input, {}, {
      resolveOwnerId: async () => 'owner-1',
      provider: {
        createOrRecoverCreditPayment,
        readCreditPayment: vi.fn(),
      },
    })).resolves.toEqual({ kind: 'ok', commandRef: durable.commandRef, session })

    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      amountUnits: '5000000',
      environment: 'sandbox',
      commandRef: durable.commandRef,
      inputDigest: durable.inputDigest,
    })
    expect(createOrRecoverCreditPayment).toHaveBeenCalledWith(expect.objectContaining({
      commandRef: durable.commandRef,
      principalId: durable.actorPrincipalRef,
      accountRef: durable.accountRef,
      amount: { currency: 'AUD', units: '5280000', exponent: 6 },
    }))
  })

  it('uses live Stripe configuration only as a production policy gate signal', async () => {
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'refused',
      code: 'commercial_policy_required',
      retryable: false,
    })
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn(),
    }

    await expect(beginAccountFundingThroughSource(input, {}, {
      resolveOwnerId: async () => 'owner-1',
      provider,
      mode: 'live',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'commercial_policy_required',
      retryable: false,
    })
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      environment: 'production',
    })
    expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
  })

  it('reads an uncertain command without creating another payment', async () => {
    const durable = command({ state: 'outcome_unknown' as const })
    sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: durable })
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn(),
    }

    await expect(readAccountFundingThroughSource({
      commandRef: durable.commandRef,
      idempotencyKey: durable.idempotencyKey,
    }, {}, { provider })).resolves.toEqual({
      kind: 'refused',
      code: 'funding_outcome_unknown',
      retryable: true,
    })
    expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
    expect(provider.readCreditPayment).not.toHaveBeenCalled()
  })

  it('uses verified Stripe readback and the Account funding mutation for webhook settlement', async () => {
    const durable = command({ externalRef: 'cs_account_funding_webhook' })
    const evidence = {
      provider: 'stripe' as const,
      externalRef: 'cs_account_funding_webhook',
      amount: { currency: 'AUD', units: '528', exponent: 2 },
      status: 'succeeded' as const,
      checkoutStatus: 'complete' as const,
      paymentStatus: 'paid' as const,
      requestDigest: `sha256:${'5'.repeat(64)}`,
      metadataDigest: durable.metadataDigest,
      checkoutSessionDigest: `sha256:${'6'.repeat(64)}`,
      paymentIntentDigest: `sha256:${'7'.repeat(64)}`,
      paymentId: 'pi_account_funding_webhook',
      evidenceDigest: `sha256:${'8'.repeat(64)}`,
      evidenceRef: 'stripe:checkout.session:cs_account_funding_webhook',
      observedAt: 100,
    }
    const event = {
      kind: 'checkout' as const,
      stripeEventId: 'evt_account_funding_webhook',
      eventType: 'checkout.session.completed' as const,
      externalRef: evidence.externalRef,
      sessionId: evidence.externalRef,
      commandRef: durable.commandRef,
      paymentId: evidence.paymentId,
      checkoutSessionDigest: evidence.checkoutSessionDigest,
      paymentIntentDigest: evidence.paymentIntentDigest,
      status: 'paid' as const,
      amount: evidence.amount,
      metadataDigest: evidence.metadataDigest,
      payloadDigest: `sha256:${'9'.repeat(64)}`,
      observedAt: 100,
    }
    sourceMocks.createConvexServerFunctionAssertion.mockResolvedValueOnce({
      principalId: 'server', ownerId: 'server', credentialId: 'server',
      scopes: ['money:funding_webhook_read'], issuedAt: 100, signature: 'redacted',
    })
    sourceMocks.callPublicSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: durable })
    stripeMocks.createStripeMoneyProvider.mockReturnValueOnce({
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn(async () => ({
        kind: 'hosted_redirect' as const,
        evidence,
        expiresAt: durable.checkoutExpiresAt,
      })),
    })
    sourceMocks.sourceWriteAdmissionFromRequest.mockResolvedValueOnce({
      version: 'source-write:v2',
      keyId: 'test', scope: 'billing', operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      correlationId: event.stripeEventId, commandDigest: `sha256:${'a'.repeat(64)}`,
      nonce: 'test', issuedAt: 100, method: 'POST', initiatorOrigin: 'https://stripe.test',
      targetOrigin: 'https://ae.test', targetPath: '/api/stripe/webhook', targetQuery: '',
      bodyDigest: `sha256:${'b'.repeat(64)}`, signature: 'redacted',
      signatureInput: 'test-signature-input',
    })
    sourceMocks.callPublicSourceAction.mockResolvedValueOnce({
      kind: 'accepted', status: 'applied', appliedRef: 'journal:funding:one',
    })

    await expect(applyVerifiedStripeEventThroughSource({
      event,
      rawBody: '{}',
      request: new Request('https://ae.test/api/stripe/webhook', { method: 'POST' }),
      config: {
        secretKey: 'sk_test_redacted', webhookSecret: 'whsec_redacted',
        mode: 'test',
      },
    })).resolves.toEqual({
      kind: 'accepted', status: 'applied', appliedRef: 'journal:funding:one',
    })
    expect(sourceMocks.createConvexServerFunctionAssertion).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'moneyAccountFunding:readWebhookCommand',
      scope: 'money:funding_webhook_read',
    }))
    expect(sourceMocks.callPublicSourceAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event,
        readback: expect.objectContaining({ amount: evidence.amount }),
        operationKey: 'moneyAccountFunding:applyVerifiedEvent',
      }),
    )
  })
})
