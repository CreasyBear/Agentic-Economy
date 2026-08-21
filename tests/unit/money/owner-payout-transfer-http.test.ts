import {
  amount,
  input,
  ownerProjection,
  payoutAccount,
  runtime,
  sourceMocks,
  unavailable,
  type Provider,
} from './owner-payout-server-harness'
import { describe, expect, it, vi } from 'vitest'
import {
  readOwnerPayoutTransferThroughSource,
  runOwnerPayoutTransferThroughSource,
} from '@/modules/money/server'

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
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).not.toHaveProperty(
      'transactionRef',
    )
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
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).not.toMatchObject({
      operationKey: 'moneyLedger:reconcilePayoutTransfer',
    })
    expect(sourceMocks.callSourceMutation.mock.calls[1]?.[1]).not.toHaveProperty(
      'transactionRef',
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
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).not.toHaveProperty(
      'transactionRef',
    )
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
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).not.toHaveProperty(
      'transactionRef',
    )
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
