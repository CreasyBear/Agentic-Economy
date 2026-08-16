import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'
import type * as SourceWriteAdmissionModule from '@/lib/server/source-write-admission'
import type * as StripeMoneyProviderModule from '@/lib/server/stripe-money-provider'
import { SourceWriteAdmissionError } from '@/modules/security/source-write-admission'
import type * as TanstackReactStartModule from '@tanstack/react-start'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  LIVE_MONEY_GATE_POLICY,
  accountRefForOwner,
} from '@/modules/money/public'

const sourceMocks = vi.hoisted(() => ({
  callPublicSourceQuery: vi.fn(),
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
  callPublicSourceQuery: sourceMocks.callPublicSourceQuery,
  callSourceQuery: sourceMocks.callSourceQuery,
  callSourceMutation: sourceMocks.callSourceMutation,
  createConvexServerFunctionAssertion:
    sourceMocks.createConvexServerFunctionAssertion,
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

import {
  applyVerifiedStripeEventThroughSource,
  beginCreditTopupThroughSource,
  readCreditPaymentThroughSource,
  createOwnerConnectAccountThroughSource,
  readOwnerPayoutTransferThroughSource,
  runOwnerPayoutTransferThroughSource,
  type OwnerMoneyServerRuntime,
} from '@/modules/money/server'

const amount = { currency: 'USD', units: '5000', exponent: 2 }
const ownerProjection = {
  kind: 'available' as const,
  businessId: 'business-1',
  accounts: [
    {
      currency: 'USD',
      earnings: {
        businessId: 'business-1',
        grossAccrual: amount,
        rake: { currency: 'USD', units: '0', exponent: 2 },
        providerNet: amount,
        paidOut: { currency: 'USD', units: '0', exponent: 2 },
        held: amount,
        recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
        truncated: false,
        evidence: 'source' as const,
      },
      payout: {
        businessId: 'business-1',
        accountState: 'ready' as const,
        payoutState: 'held_threshold' as const,
        payoutRef: 'payout-1',
        providerNet: amount,
        minimumPayout: { currency: 'USD', units: '1000', exponent: 2 },
        evidence: 'source' as const,
      },
    },
  ],
  accountsTruncated: false,
}
const payoutAccount = {
  businessId: 'business-1',
  currency: 'USD',
  exponent: 2,
  stripeAccountId: 'acct_1',
  state: 'ready' as const,
  detailsSubmitted: true,
  recipientCapabilityActive: true,
}
const input = {
  businessId: 'business-1',
  currency: 'USD',
  payoutRef: 'payout-1',
  amount,
  idempotencyKey: 'owner-payout:test-1',
}
const config = {
  secretKey: 'sk_live_test',
  webhookSecret: 'whsec_test',
  publishableKey: 'pk_live_test',
  mode: 'live' as const,
}
const unavailable = {
  kind: 'refused' as const,
  code: 'payout_outcome_unknown' as const,
  retryable: true,
}
const acceptedGate = {
  ...LIVE_MONEY_GATE_POLICY,
  counselSignoffs: LIVE_MONEY_GATE_POLICY.counselSignoffs.map((row) => ({
    ...row,
    status: 'accepted' as const,
    artifactRef: 'counsel:test-accepted',
  })),
  stripe: { mode: 'live' as const, readiness: 'ready' as const },
}

type Provider = NonNullable<OwnerMoneyServerRuntime['provider']>

function runtime(
  createOrRecoverTransfer: Provider['createOrRecoverTransfer'],
  now: number,
  readTransfersByIdentity: Provider['readTransfersByIdentity'] = async () =>
    unavailable,
): OwnerMoneyServerRuntime {
  return {
    now,
    config,
    gatePolicy: acceptedGate,
    provider: {
      createOrRecoverTransfer,
      createOrRecoverConnectAccount: async () => unavailable,
      createOnboardingLink: async () => unavailable,
      readConnectAccount: async () => unavailable,
      readTransfer: async () => unavailable,
      readTransfersByIdentity,
    },
  }
}
function connectRuntime(
  createOrRecoverConnectAccount: Provider['createOrRecoverConnectAccount'],
  now = 100,
): OwnerMoneyServerRuntime {
  return {
    now,
    config,
    gatePolicy: acceptedGate,
    provider: {
      createOrRecoverConnectAccount,
      createOrRecoverTransfer: async () => unavailable,
      createOnboardingLink: async () => unavailable,
      readConnectAccount: async () => unavailable,
      readTransfer: async () => unavailable,
      readTransfersByIdentity: async () => unavailable,
    },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  sourceMocks.sourceWriteAdmissionFromContext.mockResolvedValue({
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
  })
})
describe('credit top-up reservation', () => {
  it('refuses a closed live-money gate before reserving or calling Stripe', async () => {
    const createOrRecoverCreditPayment = vi.fn()

    const result = await beginCreditTopupThroughSource(
      {
        principalId: 'clerk_api_key:key-1',
        accountRef: accountRefForOwner('owner-1', 'USD'),
        amount: { currency: 'USD', units: '1000', exponent: 2 },
        idempotencyKey: 'topup:test-1',
      },
      undefined,
      {
        provider: { createOrRecoverCreditPayment, readCreditPayment: vi.fn() },
      },
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'live_money_gate_open',
      retryable: false,
    })
    expect(createOrRecoverCreditPayment).not.toHaveBeenCalled()
    expect(sourceMocks.sourceWriteAdmissionFromContext).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })
})
describe('credit top-up outcome recovery', () => {
  const input = {
    principalId: 'clerk_api_key:key-1',
    accountRef: accountRefForOwner('owner-1', 'USD'),
    amount: { currency: 'USD', units: '1000', exponent: 2 },
    idempotencyKey: 'topup:unknown-1',
  } as const
  const command = {
    commandRef: canonicalDigest({
      format: 'money-topup-command:v1',
      principalId: input.principalId,
      accountRef: input.accountRef,
      idempotencyKey: input.idempotencyKey,
    }),
    principalId: input.principalId,
    accountRef: input.accountRef,
    amountUnits: '1000',
    processingFeeUnits: '50',
    chargeAmountUnits: '1050',
    currency: 'USD',
    exponent: 2,
    idempotencyKey: input.idempotencyKey,
    inputDigest: 'sha256:topup-input-1',
    successReturnRef: 'https://ae.test/agent-access',
    providerRecoveryDeadlineAt: 10,
    state: 'pending' as const,
  }

  it('durably marks exhausted creation unknown and replays the stable command handle', async () => {
    const createOrRecoverCreditPayment = vi.fn(async () => ({
      kind: 'refused' as const,
      code: 'credit_topup_outcome_unknown' as const,
      retryable: true,
    }))
    const provider = {
      createOrRecoverCreditPayment,
      readCreditPayment: vi.fn(),
    }
    const unknownCommand = { ...command, state: 'outcome_unknown' as const }
    sourceMocks.callSourceMutation
      .mockResolvedValueOnce({ kind: 'accepted' as const, command })
      .mockResolvedValueOnce({
        kind: 'accepted' as const,
        command: unknownCommand,
      })
      .mockResolvedValueOnce({
        kind: 'accepted' as const,
        command: unknownCommand,
      })

    const first = await beginCreditTopupThroughSource(
      input,
      {},
      { provider, gatePolicy: acceptedGate },
    )
    const replay = await beginCreditTopupThroughSource(
      input,
      {},
      { provider, gatePolicy: acceptedGate },
    )

    expect(first).toEqual({
      kind: 'outcome_unknown',
      code: 'credit_topup_outcome_unknown',
      retryable: false,
      commandRef: command.commandRef,
      status: 'outcome_unknown',
    })
    expect(replay).toEqual(first)
    expect(createOrRecoverCreditPayment).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledTimes(3)
  })
  it('keeps a no-ID provider outcome recoverable until the deadline and binds the same command on retry', async () => {
    const recoverableCommand = {
      ...command,
      providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
    }
    const recoveredSession = {
      evidence: {
        provider: 'stripe',
        externalRef: 'cs_recovered',
        amount: { currency: 'USD', units: '1050', exponent: 2 },
        status: 'pending',
        requestDigest: 'sha256:provider-request-1',
        metadataDigest: 'sha256:metadata-1',
        checkoutSessionDigest: 'sha256:checkout-1',
        evidenceDigest: 'sha256:evidence-1',
        evidenceRef: 'stripe:checkout:cs_recovered',
        observedAt: 100,
      },
      clientSecret: 'cs_secret_recovered',
    }
    const createOrRecoverCreditPayment = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'refused',
        code: 'credit_topup_outcome_unknown',
        retryable: true,
      })
      .mockResolvedValueOnce(recoveredSession)
    const provider = {
      createOrRecoverCreditPayment,
      readCreditPayment: vi.fn(),
    }
    sourceMocks.callSourceMutation
      .mockResolvedValueOnce({
        kind: 'accepted',
        command: recoverableCommand,
      })
      .mockResolvedValueOnce({
        kind: 'accepted',
        command: recoverableCommand,
      })
      .mockResolvedValueOnce({
        kind: 'accepted',
        command: {
          ...recoverableCommand,
          state: 'pending',
          externalRef: recoveredSession.evidence.externalRef,
        },
      })

    const first = await beginCreditTopupThroughSource(
      input,
      {},
      { provider, gatePolicy: acceptedGate },
    )
    const second = await beginCreditTopupThroughSource(
      input,
      {},
      { provider, gatePolicy: acceptedGate },
    )

    expect(first).toEqual({
      kind: 'refused',
      code: 'credit_topup_outcome_unknown',
      retryable: true,
    })
    expect(second).toEqual({
      kind: 'ok',
      commandRef: recoverableCommand.commandRef,
      session: recoveredSession,
    })
    expect(createOrRecoverCreditPayment).toHaveBeenCalledTimes(2)
    expect(createOrRecoverCreditPayment.mock.calls[0]?.[0]).toEqual(
      createOrRecoverCreditPayment.mock.calls[1]?.[0],
    )
    expect(createOrRecoverCreditPayment.mock.calls[0]?.[0]).toMatchObject({
      commandRef: recoverableCommand.commandRef,
      amount: { currency: 'USD', units: '1050', exponent: 2 },
      idempotencyKey: recoverableCommand.idempotencyKey,
      inputDigest: recoverableCommand.inputDigest,
      successReturnRef: recoverableCommand.successReturnRef,
      providerRecoveryDeadlineAt: recoverableCommand.providerRecoveryDeadlineAt,
    })
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledTimes(3)
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      commandRef: recoverableCommand.commandRef,
      idempotencyKey: recoverableCommand.idempotencyKey,
    })
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).toMatchObject({
      commandRef: recoverableCommand.commandRef,
      idempotencyKey: recoverableCommand.idempotencyKey,
    })
    expect(sourceMocks.callSourceMutation.mock.calls[2]?.[1]).toMatchObject({
      commandRef: recoverableCommand.commandRef,
      evidence: {
        externalRef: recoveredSession.evidence.externalRef,
        amount: recoveredSession.evidence.amount,
      },
    })
  })
  it('reads an unknown command through its exact command locator without provider IO', async () => {
    const unknownCommand = { ...command, state: 'outcome_unknown' as const }
    sourceMocks.callSourceQuery.mockResolvedValueOnce({
      kind: 'accepted' as const,
      command: unknownCommand,
    })
    const readCreditPayment = vi.fn()
    const result = await readCreditPaymentThroughSource(
      {
        commandRef: command.commandRef,
        idempotencyKey: command.idempotencyKey,
      },
      {},
      {
        provider: { createOrRecoverCreditPayment: vi.fn(), readCreditPayment },
        gatePolicy: acceptedGate,
      },
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'credit_topup_outcome_unknown',
      retryable: true,
    })
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledWith(
      expect.anything(),
      {
        commandRef: command.commandRef,
        idempotencyKey: command.idempotencyKey,
      },
    )
    expect(readCreditPayment).not.toHaveBeenCalled()
  })
})

describe('owner Connect account reservation', () => {
  const connectInput = {
    businessId: 'business-1',
    currency: 'USD',
    idempotencyKey: 'owner-connect:test-1',
  }
  it('refuses a closed counsel gate before reserving a Connect command', async () => {
    const createOrRecoverConnectAccount =
      vi.fn<Provider['createOrRecoverConnectAccount']>()
    const closedGate = {
      ...acceptedGate,
      counselSignoffs: acceptedGate.counselSignoffs.map((row, index) =>
        index === 0 ? { decision: row.decision, status: 'open' as const } : row,
      ),
    }

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      {
        ...connectRuntime(createOrRecoverConnectAccount),
        gatePolicy: closedGate,
      },
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'live_money_gate_open',
      retryable: false,
    })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.sourceWriteAdmissionFromContext).not.toHaveBeenCalled()
  })

  it('refuses unavailable Stripe readiness before reserving a Connect command', async () => {
    const createOrRecoverConnectAccount =
      vi.fn<Provider['createOrRecoverConnectAccount']>()
    const closedConfigGate = {
      ...acceptedGate,
      stripe: { mode: 'live' as const, readiness: 'unavailable' as const },
    }

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      {
        ...connectRuntime(createOrRecoverConnectAccount),
        gatePolicy: closedConfigGate,
      },
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'stripe_setup_required',
      retryable: false,
    })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
    expect(sourceMocks.sourceWriteAdmissionFromContext).not.toHaveBeenCalled()
  })

  it('maps a missing source-write request to a billing identity refusal before reservation', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    sourceMocks.sourceWriteAdmissionFromContext.mockRejectedValue(
      new SourceWriteAdmissionError(
        'missing_source_write_request',
        'missing request',
      ),
    )
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_never',
      evidenceRef: 'evidence:never',
    }))

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount),
    )

    expect(result).toMatchObject({
      kind: 'refused',
      code: 'billing_identity_missing',
    })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it.each([
    'missing_source_write_secret',
    'invalid_source_write_key_id',
    'source_write_crypto_unavailable',
    'source_write_body_mismatch',
    'source_write_command_mismatch',
  ] as const)('propagates source-write admission failure %s', async (code) => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    sourceMocks.sourceWriteAdmissionFromContext.mockRejectedValue(
      new SourceWriteAdmissionError(code, code),
    )
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_never',
      evidenceRef: 'evidence:never',
    }))

    await expect(
      createOwnerConnectAccountThroughSource(
        connectInput,
        {},
        connectRuntime(createOrRecoverConnectAccount),
      ),
    ).rejects.toMatchObject({ code })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('propagates unknown source-write failures', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    const error = new Error('signing_rejected')
    sourceMocks.sourceWriteAdmissionFromContext.mockRejectedValue(error)
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_never',
      evidenceRef: 'evidence:never',
    }))

    await expect(
      createOwnerConnectAccountThroughSource(
        connectInput,
        {},
        connectRuntime(createOrRecoverConnectAccount),
      ),
    ).rejects.toBe(error)
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('replays a completed reservation without calling Stripe again', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    sourceMocks.callSourceMutation.mockImplementationOnce(
      async (_ref, args) => ({
        kind: 'accepted' as const,
        command: {
          commandRef: args.commandRef,
          businessId: args.businessId,
          currency: args.currency,
          exponent: args.exponent,
          idempotencyKey: args.idempotencyKey,
          inputDigest: args.inputDigest,
          providerRequestDigest: args.providerRequestDigest,
          providerRecoveryDeadlineAt: 100_000,
          recoveryLeaseGeneration: 1,
          state: 'succeeded' as const,
          stripeAccountId: 'acct_replay',
          providerEvidenceRef: 'evidence:replay',
          createdAt: 1,
          updatedAt: 2,
        },
        execute: false,
      }),
    )
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_never',
      evidenceRef: 'evidence:never',
    }))

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount),
    )

    expect(result).toEqual({
      kind: 'ok',
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_replay',
      evidenceRef: 'evidence:replay',
    })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledOnce()
  })

  it('lets only one distinct idempotency key execute for a business and currency', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    let winner: string | undefined
    sourceMocks.callSourceMutation.mockImplementation(async (_ref, args) => {
      if (args.operationKey === 'moneyLedger:reserveConnectAccount') {
        if (winner !== undefined)
          return {
            kind: 'refused' as const,
            code: 'payout_reconciliation_required' as const,
            retryable: false,
          }
        winner = args.idempotencyKey
        return {
          kind: 'accepted' as const,
          command: {
            commandRef: args.commandRef,
            businessId: args.businessId,
            currency: args.currency,
            exponent: args.exponent,
            idempotencyKey: args.idempotencyKey,
            inputDigest: args.inputDigest,
            providerRequestDigest: args.providerRequestDigest,
            providerRecoveryDeadlineAt: 100_000,
            recoveryLeaseGeneration: 1,
            recoveryLeaseOwner: args.recoveryLeaseOwner,
            recoveryLeaseExpiresAt: 100_000,
            state: 'pending' as const,
            createdAt: 1,
            updatedAt: 1,
          },
          execute: true,
        }
      }
      return {
        kind: 'accepted' as const,
        command: {
          commandRef: args.commandRef,
          businessId: args.businessId,
          currency: args.currency,
          exponent: args.exponent,
          idempotencyKey: args.idempotencyKey,
          inputDigest: args.inputDigest,
          providerRequestDigest: args.providerRequestDigest,
          providerRecoveryDeadlineAt: 100_000,
          recoveryLeaseGeneration: 1,
          state: 'succeeded' as const,
          stripeAccountId: 'acct_one',
          providerEvidenceRef: 'evidence:one',
          createdAt: 1,
          updatedAt: 2,
        },
        execute: false,
      }
    })
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_one',
      evidenceRef: 'evidence:one',
    }))

    const [first, second] = await Promise.all([
      createOwnerConnectAccountThroughSource(
        connectInput,
        {},
        connectRuntime(createOrRecoverConnectAccount),
      ),
      createOwnerConnectAccountThroughSource(
        { ...connectInput, idempotencyKey: 'owner-connect:test-2' },
        {},
        connectRuntime(createOrRecoverConnectAccount),
      ),
    ])

    expect(createOrRecoverConnectAccount).toHaveBeenCalledOnce()
    expect([first, second]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ok', stripeAccountId: 'acct_one' }),
        expect.objectContaining({
          kind: 'refused',
          code: 'payout_reconciliation_required',
        }),
      ]),
    )
  })

  it('keeps an ambiguous provider result recoverable before the deadline', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    const order: string[] = []
    let providerRequest:
      Parameters<Provider['createOrRecoverConnectAccount']>[0] | undefined
    sourceMocks.callSourceMutation.mockImplementation(async (_ref, args) => {
      order.push(args.operationKey)
      if (args.operationKey === 'moneyLedger:reserveConnectAccount') {
        return {
          kind: 'accepted' as const,
          command: {
            commandRef: args.commandRef,
            businessId: args.businessId,
            currency: args.currency,
            exponent: args.exponent,
            idempotencyKey: args.idempotencyKey,
            inputDigest: args.inputDigest,
            providerRequestDigest: args.providerRequestDigest,
            providerRecoveryDeadlineAt: 100_000,
            recoveryLeaseGeneration: 1,
            recoveryLeaseOwner: args.recoveryLeaseOwner,
            recoveryLeaseExpiresAt: 100_000,
            state: 'pending' as const,
            createdAt: 1,
            updatedAt: 1,
          },
          execute: true,
        }
      }
      return {
        kind: 'refused' as const,
        code: 'payout_outcome_unknown' as const,
        retryable: false,
      }
    })
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async (request) => {
      providerRequest = request
      order.push('provider')
      throw new Error('provider_timeout')
    })

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount),
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'payout_outcome_unknown',
      retryable: false,
    })
    expect(createOrRecoverConnectAccount).toHaveBeenCalledOnce()
    const reserveArgs = sourceMocks.callSourceMutation.mock.calls[0]?.[1]
    if (providerRequest === undefined || reserveArgs === undefined)
      throw new Error('Expected persisted Connect request.')
    expect(providerRequest).toMatchObject({
      providerRequestDigest: reserveArgs.providerRequestDigest,
      providerRecoveryDeadlineAt: 100_000,
      recoveryLeaseOwner: reserveArgs.recoveryLeaseOwner,
      recoveryLeaseGeneration: 1,
    })
    expect(order).toEqual([
      'moneyLedger:reserveConnectAccount',
      'provider',
      'moneyLedger:finalizeConnectAccount',
    ])
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).toMatchObject({
      operationKey: 'moneyLedger:finalizeConnectAccount',
      providerRequestDigest: reserveArgs.providerRequestDigest,
      recoveryLeaseOwner: reserveArgs.recoveryLeaseOwner,
      recoveryLeaseGeneration: 1,
      outcome: {
        state: 'outcome_unknown',
        failureCode: 'payout_outcome_unknown',
        failureRetryable: false,
      },
    })
  })
  it('forwards a reacquired lease generation and preserves stale finalizer refusal', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    let finalizeArgs: Record<string, unknown> | undefined
    sourceMocks.callSourceMutation.mockImplementation(async (_ref, args) => {
      if (args.operationKey === 'moneyLedger:reserveConnectAccount') {
        return {
          kind: 'accepted' as const,
          command: {
            commandRef: args.commandRef,
            businessId: args.businessId,
            currency: args.currency,
            exponent: args.exponent,
            idempotencyKey: args.idempotencyKey,
            inputDigest: args.inputDigest,
            providerRequestDigest: args.providerRequestDigest,
            providerRecoveryDeadlineAt: 100_000,
            recoveryLeaseGeneration: 2,
            recoveryLeaseOwner: args.recoveryLeaseOwner,
            recoveryLeaseExpiresAt: 100_000,
            state: 'pending' as const,
            createdAt: 1,
            updatedAt: 1,
          },
          execute: true,
        }
      }
      finalizeArgs = args
      return {
        kind: 'refused' as const,
        code: 'ledger_idempotency_conflict' as const,
        retryable: false,
      }
    })
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async () => ({
      provider: 'stripe',
      stripeAccountId: 'acct_late',
      evidenceRef: 'evidence:late',
    }))

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount),
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
      retryable: false,
    })
    expect(createOrRecoverConnectAccount).toHaveBeenCalledOnce()
    expect(finalizeArgs).toMatchObject({
      operationKey: 'moneyLedger:finalizeConnectAccount',
      recoveryLeaseGeneration: 2,
      outcome: {
        state: 'succeeded',
        stripeAccountId: 'acct_late',
        providerEvidenceRef: 'evidence:late',
      },
    })
  })
  it('recovers a retained Connect account with the persisted request identity', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    let providerRequest:
      Parameters<Provider['createOrRecoverConnectAccount']>[0] | undefined
    sourceMocks.callSourceMutation
      .mockImplementationOnce(async (_ref, args) => ({
        kind: 'accepted' as const,
        command: {
          commandRef: args.commandRef,
          businessId: args.businessId,
          currency: args.currency,
          exponent: args.exponent,
          idempotencyKey: 'persisted-connect-key',
          inputDigest: 'sha256:persisted-input',
          providerRequestDigest: 'sha256:persisted-request',
          providerRecoveryDeadlineAt: 100_000,
          recoveryLeaseGeneration: 3,
          recoveryLeaseOwner: args.recoveryLeaseOwner,
          recoveryLeaseExpiresAt: 100_000,
          state: 'pending' as const,
          stripeAccountId: 'acct_retained',
          providerEvidenceRef: 'evidence:retained',
          createdAt: 1,
          updatedAt: 2,
        },
        execute: true,
      }))
      .mockImplementationOnce(async (_ref, args) => ({
        kind: 'accepted' as const,
        command: {
          commandRef: args.commandRef,
          businessId: args.businessId,
          currency: args.currency,
          exponent: args.exponent,
          idempotencyKey: 'persisted-connect-key',
          inputDigest: 'sha256:persisted-input',
          providerRequestDigest: 'sha256:persisted-request',
          providerRecoveryDeadlineAt: 100_000,
          recoveryLeaseGeneration: 3,
          state: 'succeeded' as const,
          stripeAccountId: 'acct_retained',
          providerEvidenceRef: 'evidence:retrieved',
          createdAt: 1,
          updatedAt: 3,
        },
        execute: false,
      }))
    const createOrRecoverConnectAccount = vi.fn<
      Provider['createOrRecoverConnectAccount']
    >(async (request) => {
      providerRequest = request
      return {
        provider: 'stripe',
        stripeAccountId: 'acct_retained',
        evidenceRef: 'evidence:retrieved',
      }
    })

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount),
    )

    expect(result).toEqual({
      kind: 'ok',
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_retained',
      evidenceRef: 'evidence:retrieved',
    })
    expect(providerRequest).toMatchObject({
      idempotencyKey: 'persisted-connect-key',
      providerRequestDigest: 'sha256:persisted-request',
      recoveryLeaseGeneration: 3,
      boundStripeAccountId: 'acct_retained',
    })
    expect(createOrRecoverConnectAccount).toHaveBeenCalledOnce()
  })

  it('does not call Stripe after the persisted Connect recovery deadline', async () => {
    sourceMocks.callSourceQuery.mockResolvedValue(ownerProjection)
    sourceMocks.callSourceMutation.mockResolvedValue({
      kind: 'accepted' as const,
      command: {
        commandRef: 'connect-command-expired',
        businessId: 'business-1',
        currency: 'USD',
        exponent: 2,
        idempotencyKey: 'persisted-connect-key',
        inputDigest: 'sha256:persisted-input',
        providerRequestDigest: 'sha256:persisted-request',
        providerRecoveryDeadlineAt: 99,
        recoveryLeaseGeneration: 3,
        recoveryLeaseOwner: 'lease-expired',
        recoveryLeaseExpiresAt: 10_000,
        state: 'pending' as const,
        createdAt: 1,
        updatedAt: 2,
      },
      execute: true,
    })
    const createOrRecoverConnectAccount =
      vi.fn<Provider['createOrRecoverConnectAccount']>()

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      connectRuntime(createOrRecoverConnectAccount, 100),
    )

    expect(result).toEqual({
      kind: 'refused',
      code: 'payout_reconciliation_required',
      retryable: false,
    })
    expect(createOrRecoverConnectAccount).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledOnce()
  })
})
describe('verified Connect account readback', () => {
  it('refuses provider currency drift before admitting a binding mutation', async () => {
    const readConnectAccount = vi.fn().mockResolvedValue({
      provider: 'stripe',
      businessId: 'business-1',
      currency: 'EUR',
      stripeAccountId: 'acct_1',
      detailsSubmitted: true,
      recipientCapabilityActive: true,
      restricted: false,
      requirementsDigest: 'sha256:requirements',
      evidenceRef: 'stripe:account:acct_1',
      observedAt: 10,
      providerObjectDigest: 'sha256:provider-object',
    })
    stripeMocks.createStripeMoneyProvider.mockReturnValue({
      readConnectAccount,
    })
    sourceMocks.createConvexServerFunctionAssertion.mockResolvedValue({})
    sourceMocks.callPublicSourceQuery.mockResolvedValue([payoutAccount])

    const result = await applyVerifiedStripeEventThroughSource({
      event: {
        kind: 'account',
        stripeEventId: 'evt-account-1',
        eventType: 'account.updated',
        externalRef: 'acct_1',
        stripeAccountId: 'acct_1',
        providerObjectDigest: 'sha256:event-object',
        payloadDigest: 'sha256:event-payload',
        observedAt: 10,
      },
      rawBody: '{}',
      request: new Request('https://ae.test/api/stripe/webhook', {
        method: 'POST',
        body: '{}',
      }),
      config,
      gatePolicy: acceptedGate,
    })

    expect(result).toEqual({
      kind: 'refused',
      code: 'payment_binding_invalid',
      retryable: false,
    })
    expect(readConnectAccount).toHaveBeenCalledOnce()
    expect(readConnectAccount).toHaveBeenCalledWith({
      businessId: 'business-1',
      currency: 'USD',
      stripeAccountId: 'acct_1',
    })
    expect(sourceMocks.sourceWriteAdmissionFromRequest).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })
})

describe('owner payout recovery', () => {
  it('persists an ambiguous provider result and keeps the exact command key recoverable', async () => {
    let providerRequest:
      Parameters<Provider['createOrRecoverTransfer']>[0] | undefined
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async (request) => {
        providerRequest = request
        return unavailable
      },
    )
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce(payoutAccount)
    sourceMocks.callSourceMutation
      .mockImplementationOnce(async (_ref, args) => ({
        kind: 'accepted',
        transfer: {
          payoutRef: args.payoutRef,
          payoutCommandId: args.commandId,
          state: 'transfer_pending',
          idempotencyKey: args.idempotencyKey,
          inputDigest: args.inputDigest,
          amount: args.amount,
          destinationAccountId: args.destinationAccountId,
          requestDigest: args.requestDigest,
          providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
          transferStatus: 'pending',
        },
      }))
      .mockImplementationOnce(async (_ref, args) => ({
        kind: 'accepted',
        transfer: {
          payoutRef: args.payoutRef,
          payoutCommandId: args.commandId,
          state: 'outcome_unknown',
          idempotencyKey: args.idempotencyKey,
          inputDigest: args.inputDigest,
          amount: args.amount,
          destinationAccountId: args.destinationAccountId,
          requestDigest: args.requestDigest,
          providerRecoveryDeadlineAt: args.providerRecoveryDeadlineAt,
          transferStatus: 'outcome_unknown',
        },
      }))

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      {},
      runtime(createOrRecoverTransfer, 100),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: { state: 'outcome_unknown', recoveryState: 'idempotency_key' },
    })
    expect(createOrRecoverTransfer).toHaveBeenCalledOnce()
    const beginCommand = sourceMocks.callSourceMutation.mock.calls[0]?.[1]
    if (providerRequest === undefined)
      throw new Error('Expected one provider transfer request.')
    expect(providerRequest).toMatchObject({
      idempotencyKey: input.idempotencyKey,
      inputDigest: beginCommand.requestDigest,
    })
    expect(providerRequest.inputDigest).not.toBe(beginCommand.inputDigest)
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).toMatchObject({
      commandId: beginCommand.commandId,
      idempotencyKey: input.idempotencyKey,
      failureCode: 'payout_outcome_unknown',
    })
  })
  it('recovers an older payout by its exact durable identity after a newer owner projection', async () => {
    const oldInput = {
      ...input,
      payoutRef: 'payout-old',
      idempotencyKey: 'owner-payout:old',
    }
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce({
        kind: 'accepted',
        transfer: {
          payoutRef: oldInput.payoutRef,
          payoutCommandId: 'command-old',
          state: 'outcome_unknown',
          idempotencyKey: oldInput.idempotencyKey,
          inputDigest: 'sha256:old-input',
          amount,
          destinationAccountId: 'acct_1',
          requestDigest: 'sha256:old-request',
          providerRecoveryDeadlineAt: 10_000,
          transferStatus: 'outcome_unknown',
        },
      })
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'accepted',
      transfer: {
        payoutRef: oldInput.payoutRef,
        payoutCommandId: 'command-old',
        state: 'outcome_unknown',
        idempotencyKey: oldInput.idempotencyKey,
        inputDigest: 'sha256:old-input',
        amount,
        destinationAccountId: 'acct_1',
        requestDigest: 'sha256:old-request',
        providerRecoveryDeadlineAt: 10_000,
        transferStatus: 'outcome_unknown',
      },
    })

    const result = await runOwnerPayoutTransferThroughSource(
      oldInput,
      {},
      { recovery: true },
      runtime(
        vi.fn(async () => unavailable),
        100,
      ),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: {
        payoutRef: 'payout-old',
        state: 'outcome_unknown',
        recoveryState: 'idempotency_key',
      },
    })
    expect(sourceMocks.callSourceQuery.mock.calls[1]?.[1]).toEqual({
      businessId: 'business-1',
      currency: 'USD',
      payoutRef: 'payout-old',
      idempotencyKey: 'owner-payout:old',
    })

    sourceMocks.callSourceQuery.mockReset()
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce({
        kind: 'accepted',
        transfer: {
          payoutRef: oldInput.payoutRef,
          payoutCommandId: 'command-old',
          state: 'outcome_unknown',
          idempotencyKey: oldInput.idempotencyKey,
          inputDigest: 'sha256:old-input',
          amount,
          destinationAccountId: 'acct_1',
          requestDigest: 'sha256:old-request',
          providerRecoveryDeadlineAt: 10_000,
          transferStatus: 'outcome_unknown',
        },
      })
    await expect(
      readOwnerPayoutTransferThroughSource(
        {
          businessId: oldInput.businessId,
          currency: oldInput.currency,
          payoutRef: oldInput.payoutRef,
          idempotencyKey: oldInput.idempotencyKey,
        },
        {},
        { now: 100 },
      ),
    ).resolves.toMatchObject({
      kind: 'ok',
      transfer: { payoutRef: 'payout-old', state: 'outcome_unknown' },
    })
  })
  it('stops a begin-route replay after the persisted deadline before provider I/O', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => unavailable,
    )
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce(payoutAccount)
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'accepted',
      transfer: {
        payoutRef: input.payoutRef,
        payoutCommandId: 'command-expired',
        state: 'transfer_pending',
        idempotencyKey: input.idempotencyKey,
        inputDigest: 'sha256:input-expired',
        amount,
        destinationAccountId: 'acct_1',
        requestDigest: 'sha256:request-expired',
        providerRecoveryDeadlineAt: 99,
        transferStatus: 'pending',
      },
    })

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      {},
      runtime(createOrRecoverTransfer, 100),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: {
        state: 'transfer_pending',
        recoveryState: 'admin_intervention',
      },
    })
    expect(createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledOnce()
  })

  it('routes definitive failure from transfer_pending through complete and retains funds', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => ({
        provider: 'stripe',
        transferId: 'tr_failed',
        destinationAccountId: 'acct_1',
        amount,
        status: 'failed',
        requestDigest: 'sha256:request-failed',
        evidenceDigest: 'sha256:evidence-failed',
        observedAt: 101,
      }),
    )
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce(payoutAccount)
    sourceMocks.callSourceMutation
      .mockResolvedValueOnce({
        kind: 'accepted',
        transfer: {
          payoutRef: input.payoutRef,
          payoutCommandId: 'command-failed',
          state: 'transfer_pending',
          idempotencyKey: input.idempotencyKey,
          inputDigest: 'sha256:input-failed',
          amount,
          destinationAccountId: 'acct_1',
          requestDigest: 'sha256:request-failed',
          providerRecoveryDeadlineAt: 10_000,
          transferStatus: 'pending',
        },
      })
      .mockResolvedValueOnce({
        kind: 'accepted',
        transfer: {
          payoutRef: input.payoutRef,
          payoutCommandId: 'command-failed',
          state: 'held_threshold',
          idempotencyKey: input.idempotencyKey,
          inputDigest: 'sha256:input-failed',
          amount,
          destinationAccountId: 'acct_1',
          requestDigest: 'sha256:request-failed',
          providerRecoveryDeadlineAt: 10_000,
          transferStatus: 'failed',
        },
      })

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      {},
      runtime(createOrRecoverTransfer, 100),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).toMatchObject({
      operationKey: 'moneyLedger:completePayoutTransfer',
    })
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).not.toMatchObject(
      {
        operationKey: 'moneyLedger:reconcilePayoutTransfer',
      },
    )
  })

  const expiredCommand = {
    payoutRef: input.payoutRef,
    payoutCommandId: 'command-expired-recovery',
    state: 'outcome_unknown' as const,
    idempotencyKey: input.idempotencyKey,
    inputDigest: 'sha256:input',
    amount,
    destinationAccountId: 'acct_1',
    requestDigest: 'sha256:request',
    providerRecoveryDeadlineAt: 99,
    transferStatus: 'outcome_unknown' as const,
  }
  function mockExpiredCommand(command = expiredCommand): void {
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce({ kind: 'accepted' as const, transfer: command })
  }
  it('reconciles a complete zero-match provider read to held without creating a transfer', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => unavailable,
    )
    const readTransfersByIdentity = vi.fn<
      Provider['readTransfersByIdentity']
    >().mockResolvedValueOnce([])
    mockExpiredCommand()
    sourceMocks.callSourceQuery
      .mockResolvedValueOnce(ownerProjection)
      .mockResolvedValueOnce({
        kind: 'accepted' as const,
        transfer: {
          ...expiredCommand,
          state: 'held_threshold' as const,
          transferStatus: 'failed' as const,
          evidenceDigest: 'sha256:empty',
        },
      })
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'accepted' as const,
      transfer: {
        ...expiredCommand,
        state: 'held_threshold' as const,
        transferStatus: 'failed' as const,
        evidenceDigest: 'sha256:empty',
      },
    })

    const first = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      { recovery: true },
      runtime(createOrRecoverTransfer, 100, readTransfersByIdentity),
    )
    const replay = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      { recovery: true },
      runtime(createOrRecoverTransfer, 100, readTransfersByIdentity),
    )

    expect(first).toMatchObject({
      kind: 'ok',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    expect(replay).toEqual(first)
    expect(createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(readTransfersByIdentity).toHaveBeenCalledOnce()
    expect(readTransfersByIdentity).toHaveBeenCalledWith({
      payoutRef: input.payoutRef,
      commandId: expiredCommand.payoutCommandId,
      destinationAccountId: 'acct_1',
      amount,
      inputDigest: expiredCommand.requestDigest,
      idempotencyKey: input.idempotencyKey,
    })
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      operationKey: 'moneyLedger:reconcilePayoutTransfer',
      outcome: 'not_released',
      evidence: {
        provider: 'stripe',
        resolution: 'not_released',
        status: 'failed',
      },
    })
  })

  it('binds one matching transfer through complete evidence without creating another transfer', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => unavailable,
    )
    const readTransfersByIdentity = vi.fn<
      Provider['readTransfersByIdentity']
    >().mockResolvedValueOnce([
      {
        provider: 'stripe',
        transferId: 'tr_match',
        destinationAccountId: 'acct_1',
        amount,
        status: 'succeeded',
        requestDigest: expiredCommand.requestDigest,
        evidenceDigest: 'sha256:match',
        observedAt: 101,
      },
    ])
    mockExpiredCommand()
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'accepted' as const,
      transfer: {
        ...expiredCommand,
        state: 'paid' as const,
        stripeTransferId: 'tr_match',
        transferStatus: 'succeeded' as const,
        evidenceDigest: 'sha256:match',
        providerHeldBefore: amount,
        providerHeldAfter: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidAfter: amount,
      },
    })

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      { recovery: true },
      runtime(createOrRecoverTransfer, 100, readTransfersByIdentity),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: {
        state: 'paid',
        stripeTransferId: 'tr_match',
        transferStatus: 'succeeded',
      },
    })
    expect(createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(readTransfersByIdentity).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      operationKey: 'moneyLedger:completePayoutTransfer',
    })
  })

  it('keeps ambiguous provider matches unknown after the deadline', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => unavailable,
    )
    const readTransfersByIdentity = vi.fn<
      Provider['readTransfersByIdentity']
    >().mockResolvedValue([
      {
        provider: 'stripe',
        transferId: 'tr_one',
        destinationAccountId: 'acct_1',
        amount,
        status: 'succeeded',
        requestDigest: expiredCommand.requestDigest,
        evidenceDigest: 'sha256:one',
        observedAt: 101,
      },
      {
        provider: 'stripe',
        transferId: 'tr_two',
        destinationAccountId: 'acct_1',
        amount,
        status: 'succeeded',
        requestDigest: expiredCommand.requestDigest,
        evidenceDigest: 'sha256:two',
        observedAt: 102,
      },
    ])
    mockExpiredCommand()

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      { recovery: true },
      runtime(createOrRecoverTransfer, 100, readTransfersByIdentity),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: {
        state: 'outcome_unknown',
        recoveryState: 'admin_intervention',
      },
    })
    expect(createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(readTransfersByIdentity).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('keeps provider lookup failures unknown after the deadline', async () => {
    const createOrRecoverTransfer = vi.fn<Provider['createOrRecoverTransfer']>(
      async () => unavailable,
    )
    const readTransfersByIdentity = vi.fn<
      Provider['readTransfersByIdentity']
    >().mockResolvedValue(unavailable)
    mockExpiredCommand()

    const result = await runOwnerPayoutTransferThroughSource(
      input,
      {},
      { recovery: true },
      runtime(createOrRecoverTransfer, 100, readTransfersByIdentity),
    )

    expect(result).toMatchObject({
      kind: 'ok',
      transfer: {
        state: 'outcome_unknown',
        recoveryState: 'admin_intervention',
      },
    })
    expect(createOrRecoverTransfer).not.toHaveBeenCalled()
    expect(readTransfersByIdentity).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation).not.toHaveBeenCalled()
  })
})
