import { describe, expect, it, vi } from 'vitest'

import {
  accountRefForOwner,
  applyCreditTopup,
  beginCreditTopup,
  createLedgerState,
  createTopupState,
  fixtureUsdTopupConfig,
  type CreditPaymentPort,
  type ExactAmount,
  type MoneyAccount,
} from '../../../src/modules/money/public'
import type { StripeMoneyClient } from '../../../src/lib/server/stripe-money-provider'
import {
  applyVerifiedStripeEventThroughSource,
  readCreditPaymentThroughSource,
} from '../../../src/modules/money/server'

const ownerId = 'owner-stripe-1'

const account: MoneyAccount = {
  accountRef: accountRefForOwner(ownerId, 'USD'),
  accountKind: 'operator_credit',
  accountId: ownerId,
  balance: amount('USD', '0', 2),
  recoveryDue: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const fakePort: CreditPaymentPort = {
  createOrRecoverCreditPayment: async (input) => ({
    evidence: {
      provider: 'stripe',
      externalRef: `cs:${input.idempotencyKey}`,
      amount: input.amount,
      status: 'pending',
      requestDigest: input.inputDigest,
      metadataDigest: 'sha256:metadata',
      checkoutSessionDigest: 'sha256:checkout-session',
      evidenceDigest: 'sha256:evidence',
      evidenceRef: 'local/dev:checkout-session',
      observedAt: 1,
    },
    clientSecret: 'cs_secret_transient',
  }),
  readCreditPayment: async (input) => ({
    evidence: {
      provider: 'stripe',
      externalRef: input.externalRef,
      amount: amount('USD', '1050', 2),
      status: 'outcome_unknown',
      requestDigest: 'sha256:read',
      metadataDigest: 'sha256:metadata',
      checkoutSessionDigest: 'sha256:checkout-session',
      evidenceDigest: 'sha256:read-evidence',
      evidenceRef: 'local/dev:reconciliation',
      observedAt: 2,

    },
    clientSecret: 'cs_secret_transient',
  }),
}

describe('money Stripe top-up adapter', () => {
  it('enforces configured min/max, fee line, and Checkout idempotency', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const tooSmall = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '499', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(tooSmall.result).toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(started.result).toMatchObject({ commandRef: 'command-1', state: 'pending', amount: amount('USD', '1000', 2), processingFee: amount('USD', '50', 2), chargeAmount: amount('USD', '1050', 2) })
    const replay = await beginCreditTopup({ ...initial, state: started.state, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-2', successReturnRef: 'return-1', now: 2, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(replay.result).toMatchObject({ commandRef: 'command-1' })
  })

  it('refuses a top-up the credit account cannot represent before creating payment', async () => {
    const createOrRecoverCreditPayment = vi.fn(fakePort.createOrRecoverCreditPayment)
    const result = await beginCreditTopup({
      state: createTopupState(),
      ledgerState: createLedgerState([account]),
      principalId: 'clerk_api_key:key-1',
      accountRef: account.accountRef,
      amount: amount('USD', '10001', 3),
      idempotencyKey: 'topup-sub-cent',
      inputDigest: 'input-sub-cent',
      commandRef: 'command-sub-cent',
      successReturnRef: 'return-1',
      now: 1,
      config: fixtureUsdTopupConfig(),
      port: { ...fakePort, createOrRecoverCreditPayment },
    })
    expect(result.result).toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    expect(createOrRecoverCreditPayment).not.toHaveBeenCalled()
  })

  it('keeps an unknown provider result pending for reconciliation', async () => {
    const result = await beginCreditTopup({
      state: createTopupState(),
      ledgerState: createLedgerState([account]),
      principalId: 'clerk_api_key:key-1',
      accountRef: account.accountRef,
      amount: amount('USD', '1000', 2),
      idempotencyKey: 'topup-unknown',
      inputDigest: 'input-unknown',
      commandRef: 'command-unknown',
      successReturnRef: 'return-1',
      now: 1,
      config: fixtureUsdTopupConfig(),
      port: {
        ...fakePort,
        createOrRecoverCreditPayment: async (input) => ({
          evidence: {
            provider: 'stripe',
            externalRef: `cs:${input.idempotencyKey}`,
            amount: input.amount,
            status: 'outcome_unknown',
            requestDigest: input.inputDigest,
            metadataDigest: 'sha256:metadata',
            checkoutSessionDigest: 'sha256:checkout-session',
            evidenceDigest: 'sha256:unknown',
            evidenceRef: 'local/dev:unknown',
            observedAt: 1,
          },
          clientSecret: 'cs_secret_transient',
        }),
      },
    })
    expect(result.result).toMatchObject({ state: 'outcome_unknown' })
  })

  it('credits only a matching signed success event and replays duplicate webhook delivery', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-2', inputDigest: 'input-2', commandRef: 'command-2', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    if (typeof started.result !== 'object' || !('commandRef' in started.result)) throw new Error('expected topup command')
    const command = started.result
    const event = {
      kind: 'checkout' as const,
      stripeEventId: 'evt_2',
      eventType: 'checkout.session.async_payment_succeeded' as const,
      externalRef: command.externalRef ?? '',
      sessionId: command.externalRef ?? '',
      commandRef: command.commandRef,
      status: 'paid' as const,
      amount: command.chargeAmount,
      metadataDigest: 'sha256:metadata',
      checkoutSessionDigest: 'sha256:checkout-session',
      payloadDigest: 'payload-2',
      observedAt: 2,
    }
    const transaction = { transactionRef: 'topup-tx-2', kind: 'topup' as const, idempotencyKey: 'topup-ledger-2', inputDigest: 'input-2', principalId: command.principalId, currency: 'USD', expectedAccountVersion: 0, now: 2 }
    const applied = applyCreditTopup({ state: started.state, ledgerState: started.ledgerState, commandRef: command.commandRef, event, transaction, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(applied.result).toMatchObject({ kind: 'accepted', amount: amount('USD', '1000', 2) })
    expect(applied.ledgerState.entries).toHaveLength(1)
    expect(applied.state.commands.find((item) => item.commandRef === command.commandRef)).toMatchObject({ state: 'succeeded', buyerBalanceBefore: amount('USD', '0', 2), buyerBalanceAfter: amount('USD', '1000', 2) })
    const replay = applyCreditTopup({ state: applied.state, ledgerState: applied.ledgerState, commandRef: command.commandRef, transaction: { ...transaction, transactionRef: 'topup-tx-retry' }, event, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(replay.result).toMatchObject({ kind: 'accepted', transactionRef: 'topup-tx-2', amount: amount('USD', '1000', 2) })
    const digestConflict = applyCreditTopup({ state: applied.state, ledgerState: applied.ledgerState, commandRef: command.commandRef, transaction, event: { ...event, payloadDigest: 'payload-conflict' }, sourceDigest: 'event-conflict', evidenceRefs: ['stripe:event:evt_2'] })
    expect(digestConflict.result).toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
  })
  it('refuses durable read before source or provider IO when live money is gated', async () => {
    const readCreditPayment = vi.fn(fakePort.readCreditPayment)
    const result = await readCreditPaymentThroughSource(
      { externalRef: 'cs_gate', idempotencyKey: 'topup-gate-1' },
      undefined,
      { provider: { ...fakePort, readCreditPayment } },
    )
    expect(result).toMatchObject({ kind: 'refused', code: 'live_money_gate_open', retryable: false })
    expect(readCreditPayment).not.toHaveBeenCalled()
  })

  it('refuses checkout webhook before source or Stripe readback when live money is gated', async () => {
    const retrieve = vi.fn()
    const client = { checkout: { sessions: { retrieve } } } as unknown as StripeMoneyClient
    const result = await applyVerifiedStripeEventThroughSource({
      event: {
        kind: 'checkout',
        stripeEventId: 'evt_gate',
        eventType: 'checkout.session.completed',
        externalRef: 'cs_gate',
        sessionId: 'cs_gate',
        commandRef: 'command_gate',
        status: 'paid',
        amount: amount('USD', '1050', 2),
        metadataDigest: 'sha256:metadata',
        checkoutSessionDigest: 'sha256:checkout-session',
        payloadDigest: 'sha256:payload',
        observedAt: 1,
      },
      rawBody: '{}',
      request: new Request('http://localhost/api/stripe/webhook', { method: 'POST' }),
      client,
    })
    expect(result).toMatchObject({ kind: 'refused', code: 'live_money_gate_open', retryable: false })
    expect(retrieve).not.toHaveBeenCalled()
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
