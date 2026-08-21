import {
  config,
  connectRuntime,
  ownerProjection,
  payoutAccount,
  sourceMocks,
  stripeMocks,
  type Provider,
} from './owner-payout-server-harness'
import { describe, expect, it, vi } from 'vitest'
import { SourceWriteAdmissionError } from '@/modules/security/source-write-admission'
import {
  applyVerifiedStripeEventThroughSource,
  createOwnerConnectAccountThroughSource,
} from '@/modules/money/server'

describe('owner Connect account reservation', () => {
  const connectInput = {
    businessId: 'business-1',
    currency: 'USD',
    idempotencyKey: 'owner-connect:test-1',
  }
  it('refuses a Stripe config and mode mismatch before reserving a Connect command', async () => {
    const createOrRecoverConnectAccount =
      vi.fn<Provider['createOrRecoverConnectAccount']>()

    const result = await createOwnerConnectAccountThroughSource(
      connectInput,
      {},
      {
        ...connectRuntime(createOrRecoverConnectAccount),
        mode: 'test',
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
