import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import type * as StripeMoneyProviderModule from '@/lib/server/stripe-money-provider'
import type * as TanstackReactStartModule from '@tanstack/react-start'

const sourceMocks = vi.hoisted(() => ({
  callPublicSourceAction: vi.fn(),
  callSourceAction: vi.fn(),
  callPublicSourceQuery: vi.fn(),
  callPublicSourceMutation: vi.fn(),
  callSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  createConvexServerFunctionAssertion: vi.fn(),
  sourceWriteAdmissionFromContext: vi.fn(),
  sourceWriteAdmissionFromRequest: vi.fn(),
}))
const stripeMocks = vi.hoisted(() => ({
  createStripeMoneyProvider: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceAction: sourceMocks.callPublicSourceAction,
  callSourceAction: sourceMocks.callSourceAction,
  callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
  callPublicSourceMutation: sourceMocks.callPublicSourceMutation,
  callSourceQuery: sourceMocks.callSourceQuery,
  callSourceMutation: sourceMocks.callSourceMutation,
  createConvexServerFunctionAssertion: sourceMocks.createConvexServerFunctionAssertion,
}))
vi.mock('@/lib/server/stripe-money-provider', async (importOriginal) => ({
  ...(await importOriginal<typeof StripeMoneyProviderModule>()),
  createStripeMoneyProvider: stripeMocks.createStripeMoneyProvider,
}))
vi.mock('@/lib/server/source-write-admission', async (importOriginal) => ({
  ...(await importOriginal<typeof SourceWriteAdmissionModule>()),
  sourceWriteAdmissionFromContext: sourceMocks.sourceWriteAdmissionFromContext,
  sourceWriteAdmissionFromRequest: sourceMocks.sourceWriteAdmissionFromRequest,
}))

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  beginAccountFundingThroughSource,
  ingestVerifiedStripeEventThroughSource,
  readAccountFundingConstraintsThroughSource,
  readAccountFundingThroughSource,
  readPlatformFundingConstraintsThroughSource,
} from '@/modules/money/server'
import { createFundingHandoffService } from '@/lib/server/funding-handoff-api'

const input = {
  amount: { currency: 'AUD', units: '5000000', exponent: 6 },
  expectedPolicyDigest: `sha256:${'1'.repeat(64)}`,
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
    taxUnits: '530000',
    totalUnits: '5780000',
    commercialPolicyDigest: `sha256:${'1'.repeat(64)}`,
    commercialPolicyRefs: ['sandbox:managed_x402_deterministic_v1'],
    idempotencyKey: input.idempotencyKey,
    inputDigest: canonicalDigest({
      format: 'ae.account-funding-input:v1',
      ownerId: 'owner-1',
      amount: input.amount,
      expectedPolicyDigest: input.expectedPolicyDigest,
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
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const sourceWriteAdmission = {
      keyId: 'test',
      scope: 'billing',
      operationKey: 'test',
      correlationId: 'test',
      commandDigest: 'sha256:test',
      nonce: 'test',
      issuedAt: 1,
      method: 'POST',
      initiatorOrigin: 'https://ae.test',
      targetOrigin: 'https://ae.test',
      targetPath: '/test',
      targetQuery: '',
      bodyDigest: 'sha256:body',
      signature: 'test',
    }
    sourceMocks.sourceWriteAdmissionFromContext.mockResolvedValue(sourceWriteAdmission)
    sourceMocks.sourceWriteAdmissionFromRequest.mockResolvedValue(sourceWriteAdmission)
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('refuses live Stripe configuration in a development deployment', async () => {
    await expect(readAccountFundingConstraintsThroughSource({
      env: {
        AE_DEPLOYMENT_ENVIRONMENT: 'development',
        STRIPE_SECRET_KEY: 'rk_live_secret_key_material',
        STRIPE_WEBHOOK_SECRET: 'whsec_secret',
      },
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'stripe_setup_required',
      retryable: false,
    })
  })

  it.each([undefined, 'preview'] as const)(
    'refuses funding with %s declaration before source or provider effects', async (declaration) => {
      const env = { AE_DEPLOYMENT_ENVIRONMENT: declaration }
      const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }
      const resolveOwnerId = vi.fn(async () => 'owner-1')
      const runtime = { env, provider, resolveOwnerId }
      await expect(readPlatformFundingConstraintsThroughSource(runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      await expect(readAccountFundingConstraintsThroughSource(runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      await expect(beginAccountFundingThroughSource(input, {}, runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      await expect(readAccountFundingThroughSource({ commandRef: 'missing', idempotencyKey: 'missing' }, {}, runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      expect(resolveOwnerId).not.toHaveBeenCalled()
      expect(sourceMocks.callSourceQuery).not.toHaveBeenCalled()
      expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
      expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
      expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
      expect(provider.readCreditPayment).not.toHaveBeenCalled()
    },
  )

  it.each(['development', 'production'] as const)(
    'refuses public and owner constraints without Stripe configuration in %s', async (declaration) => {
      const runtime = { env: { AE_DEPLOYMENT_ENVIRONMENT: declaration } }
      await expect(readPlatformFundingConstraintsThroughSource(runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      await expect(readAccountFundingConstraintsThroughSource(runtime))
        .resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
      expect(sourceMocks.callSourceQuery).not.toHaveBeenCalled()
      expect(stripeMocks.createStripeMoneyProvider).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['development', 'sandbox', 'rk_test_configured'],
    ['production', 'production', 'rk_live_configured'],
  ] as const)('reads public constraints only for the configured %s rail', async (declaration, environment, key) => {
    sourceMocks.callPublicSourceQuery.mockResolvedValueOnce({ kind: 'available', environment })
    await expect(readPlatformFundingConstraintsThroughSource({ env: {
      AE_DEPLOYMENT_ENVIRONMENT: declaration, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: 'whsec_configured',
    } })).resolves.toMatchObject({ kind: 'available', environment })
    expect(sourceMocks.callPublicSourceQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ environment }))
  })

  it.each([
    ['development', 'rk_live_wrong'],
    ['production', 'rk_test_wrong'],
    ['production', 'sk_live_unrestricted'],
  ] as const)('refuses public constraints for %s with %s before source access', async (declaration, key) => {
    await expect(readPlatformFundingConstraintsThroughSource({ env: {
      AE_DEPLOYMENT_ENVIRONMENT: declaration, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: 'whsec_configured',
    } })).resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
    expect(sourceMocks.callPublicSourceQuery).not.toHaveBeenCalled()
    expect(stripeMocks.createStripeMoneyProvider).not.toHaveBeenCalled()
  })

  it('refuses an opposite caller mode before funding source or provider effects', async () => {
    const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }
    const resolveOwnerId = vi.fn(async () => 'owner-1')
    await expect(beginAccountFundingThroughSource(input, {}, {
      env: { AE_DEPLOYMENT_ENVIRONMENT: 'development' }, mode: 'live', provider, resolveOwnerId,
    })).resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
    expect(resolveOwnerId).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
  })

  it.each([undefined, 'preview', 'production'] as const)(
    'refuses a sandbox agent handoff under %s deployment before reserve or payment', async (declaration) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
      const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }
      const service = createFundingHandoffService(
        new Request('https://ae.test/api/v1/account/funding-sessions', { method: 'POST' }), '{}', provider,
      )
      const result = await service.create({
        input: { principalAmount: { currency: 'AUD', exponent: 6, units: '5000000' }, idempotencyKey: 'fenced' },
        principal: {
          principalId: 'principal:agent-one', ownerId: 'account:one', credentialId: 'credential:one',
          applicationRef: 'agentic-economy', environment: 'sandbox',
          scopes: ['market_operations:invoke'], authorityMode: 'read_only',
        },
        correlationId: 'fenced',
      })
      expect(result).toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      expect(sourceMocks.callPublicSourceMutation).not.toHaveBeenCalled()
      expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
    },
  )

  it('reads display constraints from the same environment selected for funding admission', async () => {
    const constraints = {
      kind: 'available' as const,
      environment: 'production' as const,
      currency: 'AUD' as const,
      exponent: 6 as const,
      minimumPrincipalUnits: '5000000',
      maximumPrincipalUnits: '25000000000',
      incrementUnits: '10000',
      serviceFeeBps: 500,
      taxOnServiceFeeBps: 1000,
      legalCustomerMaximumAccessibleUnits: '4999999999',
      policyDigest: `sha256:${'a'.repeat(64)}`,
    }
    sourceMocks.callSourceQuery.mockResolvedValueOnce(constraints)
    const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }

    await expect(readAccountFundingConstraintsThroughSource({
      provider, mode: 'live', env: { AE_DEPLOYMENT_ENVIRONMENT: 'production' },
    })).resolves.toEqual(constraints)
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ environment: 'production' }))
  })

  it.each([
    ['development', 'production'],
    ['production', 'sandbox'],
  ] as const)(
    'refuses owner readback in declared %s for stored %s command before provider read or bind',
    async (declaration, storedEnvironment) => {
      const durable = command({ environment: storedEnvironment, externalRef: 'cs_opposite_owner' })
      sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: durable })
      const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }

      await expect(readAccountFundingThroughSource({ externalRef: 'cs_opposite_owner' }, {}, {
        env: { AE_DEPLOYMENT_ENVIRONMENT: declaration }, provider,
      })).resolves.toMatchObject({ kind: 'refused', code: 'stripe_setup_required' })
      expect(provider.readCreditPayment).not.toHaveBeenCalled()
      expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
      expect(sourceMocks.callSourceAction).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['development', 'production'],
    ['production', 'sandbox'],
  ] as const)(
    'refuses pending handoff status in declared %s for stored %s command before provider read or bind',
    async (declaration, storedEnvironment) => {
      vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
      sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: command({
        environment: storedEnvironment, externalRef: 'cs_opposite_handoff', state: 'pending',
      }) })
      const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }
      const service = createFundingHandoffService(
        new Request('https://ae.test/api/v1/account/funding-sessions/cs_opposite_handoff'), '{}', provider,
      )
      const result = await service.status({
        input: { fundingSessionId: 'cs_opposite_handoff' },
        principal: {
          principalId: 'principal:agent-one', ownerId: 'account:one', credentialId: 'credential:one',
          applicationRef: 'agentic-economy', environment: storedEnvironment,
          scopes: ['market_operations:invoke'], authorityMode: 'read_only',
        },
        correlationId: 'opposite-handoff',
      })
      expect(result).toMatchObject({ kind: 'error', code: 'stripe_setup_required', nextAction: { kind: 'poll' } })
      expect(provider.readCreditPayment).not.toHaveBeenCalled()
      expect(sourceMocks.callPublicSourceMutation).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['expired', 'expired'],
    ['async_payment_failed', 'failed'],
  ] as const)('keeps terminal %s handoff status readable after a declaration change', async (terminalReason, kind) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: command({
      environment: 'sandbox', externalRef: 'cs_terminal_handoff', state: 'failed', terminalReason,
    }) })
    const provider = { createOrRecoverCreditPayment: vi.fn(), readCreditPayment: vi.fn() }
    const service = createFundingHandoffService(
      new Request('https://ae.test/api/v1/account/funding-sessions/cs_terminal_handoff'), '{}', provider,
    )
    const result = await service.status({
      input: { fundingSessionId: 'cs_terminal_handoff' },
      principal: {
        principalId: 'principal:agent-one', ownerId: 'account:one', credentialId: 'credential:one',
        applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: ['market_operations:invoke'], authorityMode: 'read_only',
      },
      correlationId: 'terminal-handoff',
    })
    expect(result).toMatchObject({ kind, fundingSessionId: 'cs_terminal_handoff' })
    expect(provider.readCreditPayment).not.toHaveBeenCalled()
    expect(sourceMocks.callPublicSourceMutation).not.toHaveBeenCalled()
  })

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
        applicationRef: 'agentic-economy', environment: 'sandbox', scopes: ['market_operations:invoke'], authorityMode: 'read_only',
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
    const reserveArgs = sourceMocks.callPublicSourceMutation.mock.calls[0]?.[1]
    expect(reserveArgs?.successReturnRef).toMatch(/\/fund\/\{CHECKOUT_SESSION_ID\}$/u)
    expect(reserveArgs?.cancelReturnRef).toBe(reserveArgs?.successReturnRef)
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
        amount: { currency: 'AUD', units: '5780000', exponent: 6 },
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
      expectedPolicyDigest: input.expectedPolicyDigest,
      commandRef: durable.commandRef,
      inputDigest: durable.inputDigest,
    })
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      successReturnRef: expect.stringMatching(/\/owner\/credit\?funding=\{CHECKOUT_SESSION_ID\}$/u),
      cancelReturnRef: expect.stringMatching(/\/owner\/credit\?funding=\{CHECKOUT_SESSION_ID\}$/u),
    })
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1].cancelReturnRef)
      .toBe(sourceMocks.callSourceMutation.mock.calls[0]?.[1].successReturnRef)
    expect(createOrRecoverCreditPayment).toHaveBeenCalledWith(expect.objectContaining({
      commandRef: durable.commandRef,
      principalId: durable.actorPrincipalRef,
      accountRef: durable.accountRef,
      amount: { currency: 'AUD', units: '5780000', exponent: 6 },
    }))
  })

  it('does not return a paid recovery session before its durable funding booking succeeds', async () => {
    const durable = { ...command(), externalRef: 'cs_paid_recovery_pending' }
    const payment = {
      kind: 'hosted_redirect' as const,
      expiresAt: durable.checkoutExpiresAt,
      evidence: {
        provider: 'stripe' as const,
        externalRef: durable.externalRef!,
        amount: { currency: 'AUD' as const, units: durable.totalUnits, exponent: 6 as const },
        status: 'succeeded' as const,
        checkoutStatus: 'complete' as const,
        paymentStatus: 'paid' as const,
        requestDigest: `sha256:${'a'.repeat(64)}`,
        metadataDigest: durable.metadataDigest!,
        checkoutSessionDigest: `sha256:${'b'.repeat(64)}`,
        paymentIntentDigest: `sha256:${'c'.repeat(64)}`,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
        evidenceRef: 'stripe:checkout:cs_paid_recovery_pending',
        observedAt: 100,
      },
    }
    sourceMocks.callSourceMutation
      .mockResolvedValueOnce({ kind: 'accepted', command: durable })
      .mockResolvedValueOnce({ kind: 'accepted', command: { ...durable, state: 'pending' } })
    const provider = {
      createOrRecoverCreditPayment: vi.fn().mockResolvedValue(payment),
      readCreditPayment: vi.fn(),
    }

    await expect(beginAccountFundingThroughSource(input, {}, {
      resolveOwnerId: async () => 'owner-1',
      provider,
    })).resolves.toEqual({ kind: 'refused', code: 'funding_pending', retryable: true })
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
      env: { AE_DEPLOYMENT_ENVIRONMENT: 'production' },
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

  it('AM-09 reads an uncertain command without creating another payment', async () => {
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

  it('fulfils a paid return without a webhook, then reads the durable credited state', async () => {
    const externalRef = 'cs_paid_before_ledger'
    const durable = command({ externalRef })
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce({ kind: 'accepted', command: durable })
      .mockResolvedValueOnce({ kind: 'accepted', command: { ...durable, state: 'succeeded' } })
    sourceMocks.callSourceMutation.mockResolvedValue({ kind: 'accepted', command: durable })
    sourceMocks.callSourceAction.mockResolvedValue({ kind: 'accepted', status: 'applied', appliedRef: 'funding:one' })
    const payment = {
      kind: 'hosted_redirect' as const,
      expiresAt: durable.checkoutExpiresAt,
      evidence: {
        provider: 'stripe' as const,
        externalRef,
        amount: { currency: 'AUD' as const, units: durable.totalUnits, exponent: 6 as const },
        status: 'succeeded' as const,
        checkoutStatus: 'complete' as const,
        paymentStatus: 'paid' as const,
        requestDigest: `sha256:${'a'.repeat(64)}`,
        metadataDigest: durable.metadataDigest!,
        checkoutSessionDigest: `sha256:${'b'.repeat(64)}`,
        paymentIntentDigest: `sha256:${'c'.repeat(64)}`,
        paymentId: 'pi_paid_before_ledger',
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
        evidenceRef: 'stripe:checkout:cs_paid_before_ledger',
        observedAt: 100,
      },
    }
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn().mockResolvedValue(payment),
    }

    await expect(readAccountFundingThroughSource({
      externalRef,
    }, {}, { provider })).resolves.toEqual(payment)
    expect(sourceMocks.callSourceAction).toHaveBeenCalledWith(
      expect.anything(),
      { externalRef },
    )
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledTimes(2)
    expect(provider.createOrRecoverCreditPayment).not.toHaveBeenCalled()
  })

  it('exposes paid provider evidence only after durable funding settlement', async () => {
    const durable = command({ externalRef: 'cs_paid_after_ledger' })
    sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: durable })
    sourceMocks.callSourceMutation.mockResolvedValueOnce({ kind: 'accepted', command: { ...durable, state: 'succeeded' } })
    const payment = {
      kind: 'hosted_redirect' as const,
      expiresAt: durable.checkoutExpiresAt,
      evidence: {
        provider: 'stripe' as const,
        externalRef: 'cs_paid_after_ledger',
        amount: { currency: 'AUD' as const, units: durable.totalUnits, exponent: 6 as const },
        status: 'succeeded' as const,
        checkoutStatus: 'complete' as const,
        paymentStatus: 'paid' as const,
        requestDigest: `sha256:${'a'.repeat(64)}`,
        metadataDigest: durable.metadataDigest!,
        checkoutSessionDigest: `sha256:${'b'.repeat(64)}`,
        paymentIntentDigest: `sha256:${'c'.repeat(64)}`,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
        evidenceRef: 'stripe:checkout:cs_paid_after_ledger',
        observedAt: 100,
      },
    }
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn().mockResolvedValue(payment),
    }

    await expect(readAccountFundingThroughSource({
      commandRef: durable.commandRef,
      idempotencyKey: durable.idempotencyKey,
    }, {}, { provider })).resolves.toEqual(payment)
  })

  it('preserves an unpaid open Checkout session while its funding command is pending', async () => {
    const durable = command({ externalRef: 'cs_open_pending' })
    sourceMocks.callSourceQuery.mockResolvedValueOnce({ kind: 'accepted', command: durable })
    sourceMocks.callSourceMutation.mockResolvedValueOnce({ kind: 'accepted', command: durable })
    const payment = {
      kind: 'hosted_redirect' as const,
      expiresAt: durable.checkoutExpiresAt,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_open_pending',
      evidence: {
        provider: 'stripe' as const,
        externalRef: 'cs_open_pending',
        amount: { currency: 'AUD' as const, units: durable.totalUnits, exponent: 6 as const },
        status: 'pending' as const,
        checkoutStatus: 'open' as const,
        paymentStatus: 'unpaid' as const,
        checkoutMode: 'hosted_page' as const,
        checkoutExpiresAt: durable.checkoutExpiresAt,
        requestDigest: `sha256:${'a'.repeat(64)}`,
        metadataDigest: durable.metadataDigest!,
        checkoutSessionDigest: `sha256:${'b'.repeat(64)}`,
        evidenceDigest: `sha256:${'d'.repeat(64)}`,
        evidenceRef: 'stripe:checkout:cs_open_pending',
        observedAt: 100,
      },
    }
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn().mockResolvedValue(payment),
    }

    await expect(readAccountFundingThroughSource({
      commandRef: durable.commandRef,
      idempotencyKey: durable.idempotencyKey,
    }, {}, { provider })).resolves.toEqual(payment)
  })

  it('durably admits a verified Stripe event without synchronous provider work', async () => {
    const durable = command({ externalRef: 'cs_account_funding_webhook' })
    const evidence = {
      provider: 'stripe' as const,
      externalRef: 'cs_account_funding_webhook',
      amount: { currency: 'AUD', units: '578', exponent: 2 },
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
    sourceMocks.sourceWriteAdmissionFromRequest.mockResolvedValueOnce({
      version: 'source-write:v2',
      keyId: 'test', scope: 'billing', operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: event.stripeEventId, commandDigest: `sha256:${'a'.repeat(64)}`,
      nonce: 'test', issuedAt: 100, method: 'POST', initiatorOrigin: 'https://stripe.test',
      targetOrigin: 'https://ae.test', targetPath: '/api/stripe/webhook', targetQuery: '',
      bodyDigest: `sha256:${'b'.repeat(64)}`, signature: 'redacted',
      signatureInput: 'test-signature-input',
    })
    sourceMocks.callPublicSourceMutation.mockResolvedValueOnce({ kind: 'accepted', status: 'queued' })

    await expect(ingestVerifiedStripeEventThroughSource({
      destination: 'snapshot',
      event,
      rawBody: '{}',
      request: new Request('https://ae.test/api/stripe/webhook', { method: 'POST' }),
    })).resolves.toEqual({
      kind: 'accepted', status: 'queued',
    })
    expect(sourceMocks.sourceWriteAdmissionFromRequest).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'moneyStripeWebhookInbox:ingest',
      correlationId: event.stripeEventId,
    }))
    expect(sourceMocks.callPublicSourceMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        destination: 'snapshot',
        event,
        operationKey: 'moneyStripeWebhookInbox:ingest',
      }),
    )
    expect(stripeMocks.createStripeMoneyProvider).not.toHaveBeenCalled()
  })
})
