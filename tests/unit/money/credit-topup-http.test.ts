import { sourceMocks } from './owner-payout-server-harness'
import { describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { accountRefForOwner } from '@/modules/money/public'
import {
  beginCreditTopupThroughSource,
  readCreditPaymentThroughSource,
} from '@/modules/money/server'

describe('credit top-up reservation', () => {
  it('derives the owner account ref before digesting or reserving a forged runtime input', async () => {
    const input = {
      principalId: 'clerk_api_key:key-1',
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      idempotencyKey: 'topup:forged-account-ref',
      accountRef: accountRefForOwner('attacker', 'USD'),
    }
    const provider = {
      createOrRecoverCreditPayment: vi.fn(),
      readCreditPayment: vi.fn(),
    }
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })

    const result = await beginCreditTopupThroughSource(
      input,
      {},
      {
        provider,
        resolveOwnerId: async () => 'owner-1',
      },
    )

    const accountRef = accountRefForOwner('owner-1', 'USD')
    expect(result).toEqual({
      kind: 'refused',
      code: 'billing_identity_mismatch',
      retryable: false,
    })
    expect(sourceMocks.callSourceMutation).toHaveBeenCalledOnce()
    expect(sourceMocks.callSourceMutation.mock.calls[0]?.[1]).toMatchObject({
      accountRef,
      commandRef: canonicalDigest({
        format: 'money-topup-command:v1',
        principalId: input.principalId,
        accountRef,
        idempotencyKey: input.idempotencyKey,
      }),
      inputDigest: canonicalDigest({
        format: 'money-topup-input:v1',
        principalId: input.principalId,
        accountRef,
        amount: input.amount,
        idempotencyKey: input.idempotencyKey,
      }),
    })
  })
})
describe('credit top-up outcome recovery', () => {
  const input = {
    principalId: 'clerk_api_key:key-1',
    amount: { currency: 'USD', units: '1000', exponent: 2 },
    idempotencyKey: 'topup:unknown-1',
  } as const
  const accountRef = accountRefForOwner('owner-1', 'USD')
  const command = {
    commandRef: canonicalDigest({
      format: 'money-topup-command:v1',
      principalId: input.principalId,
      accountRef,
      idempotencyKey: input.idempotencyKey,
    }),
    principalId: input.principalId,
    accountRef,
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
      {
        provider,
        resolveOwnerId: async () => 'owner-1',
      },
    )
    const replay = await beginCreditTopupThroughSource(
      input,
      {},
      {
        provider,
        resolveOwnerId: async () => 'owner-1',
      },
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
      {
        provider,
        resolveOwnerId: async () => 'owner-1',
      },
    )
    const second = await beginCreditTopupThroughSource(
      input,
      {},
      {
        provider,
        resolveOwnerId: async () => 'owner-1',
      },
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
