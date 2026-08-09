import { describe, expect, it, vi } from 'vitest'

import {
  accountRefForOperator,
  applyCreditTopup,
  beginCreditTopup,
  createLedgerState,
  createTopupState,
  fixtureUsdTopupConfig,
  type CreditPaymentPort,
  type ExactAmount,
  type MoneyAccount,
} from '../../../src/modules/money/public'

const account: MoneyAccount = {
  accountRef: accountRefForOperator('key-1', 'USD'),
  accountKind: 'operator_credit',
  principalId: 'clerk_api_key:key-1',
  balance: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const fakePort: CreditPaymentPort = {
  createCreditPayment: async (input) => ({ provider: 'stripe', externalRef: `pi:${input.idempotencyKey}`, amount: input.amount, status: 'pending', evidenceRef: 'local/dev:payment-intent' }),
  readCreditPayment: async (input) => ({ provider: 'stripe', externalRef: input.externalRef, amount: amount('USD', '1050', 2), status: 'outcome_unknown', evidenceRef: 'local/dev:reconciliation' }),
}


describe('money injected Stripe topup adapter', () => {
  it('enforces configured min/max, fee line, and PaymentIntent idempotency', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const tooSmall = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '499', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(tooSmall.result).toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(started.result).toMatchObject({ commandRef: 'command-1', state: 'pending', amount: amount('USD', '1000', 2), processingFee: amount('USD', '50', 2), chargeAmount: amount('USD', '1050', 2) })
    const replay = await beginCreditTopup({ ...initial, state: started.state, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-2', successReturnRef: 'return-1', now: 2, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(replay.result).toMatchObject({ commandRef: 'command-1' })
  })

  it('refuses a top-up the credit account cannot represent before creating payment', async () => {
    const createCreditPayment = vi.fn(fakePort.createCreditPayment)
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
      port: { ...fakePort, createCreditPayment },
    })
    expect(result.result).toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    expect(createCreditPayment).not.toHaveBeenCalled()
  })

  it('keeps an unknown provider result pending for reconciliation', async () => {
    const result = await beginCreditTopup({ state: createTopupState(), ledgerState: createLedgerState([account]), principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-unknown', inputDigest: 'input-unknown', commandRef: 'command-unknown', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: { ...fakePort, createCreditPayment: async (input) => ({ provider: 'stripe', externalRef: `pi:${input.idempotencyKey}`, amount: input.amount, status: 'outcome_unknown', evidenceRef: 'local/dev:unknown' }) } })
    expect(result.result).toMatchObject({ state: 'outcome_unknown' })
  })
  it('credits only a matching signed success event and replays duplicate webhook delivery', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, amount: amount('USD', '1000', 2), idempotencyKey: 'topup-2', inputDigest: 'input-2', commandRef: 'command-2', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    if (typeof started.result !== 'object' || !('commandRef' in started.result)) throw new Error('expected topup command')
    const command = started.result
    const event = { stripeEventId: 'evt_2', eventType: 'payment_intent.succeeded' as const, externalRef: command.externalRef ?? '', principalId: command.principalId, accountRef: command.accountRef, amount: command.chargeAmount, payloadDigest: 'payload-2', observedAt: 2 }
    const transaction = { transactionRef: 'topup-tx-2', kind: 'topup' as const, idempotencyKey: 'topup-ledger-2', inputDigest: 'input-2', principalId: command.principalId, currency: 'USD', expectedAccountVersion: 0, now: 2 }
    const applied = applyCreditTopup({ state: started.state, ledgerState: started.ledgerState, commandRef: command.commandRef, event, transaction, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(applied.result).toMatchObject({ kind: 'accepted', amount: amount('USD', '1000', 2) })
    expect(applied.ledgerState.entries).toHaveLength(1)
    const replay = applyCreditTopup({ ...applied, commandRef: command.commandRef, transaction: { ...transaction, transactionRef: 'topup-tx-retry' }, event, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(replay.result).toMatchObject({ kind: 'accepted', transactionRef: 'topup-tx-2', amount: amount('USD', '1000', 2) })
    const digestConflict = applyCreditTopup({ ...applied, commandRef: command.commandRef, transaction, event: { ...event, payloadDigest: 'payload-conflict' }, sourceDigest: 'event-conflict', evidenceRefs: ['stripe:event:evt_2'] })
    expect(digestConflict.result).toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}
