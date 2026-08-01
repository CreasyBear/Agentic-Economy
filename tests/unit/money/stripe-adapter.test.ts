import { describe, expect, it } from 'vitest'

import {
  accountRefForOperator,
  applyCreditTopup,
  beginCreditTopup,
  createLedgerState,
  createTopupState,
  fixtureUsdTopupConfig,
  type CreditPaymentPort,
  type MoneyAccount,
} from '../../../src/modules/money/public'

const account: MoneyAccount = {
  accountRef: accountRefForOperator('key-1', 'USD'),
  accountKind: 'operator_credit',
  principalId: 'clerk_api_key:key-1',
  currency: 'USD',
  balanceMinor: 0,
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const fakePort: CreditPaymentPort = {
  createCreditPayment: async (input) => ({ provider: 'stripe', externalRef: `pi:${input.idempotencyKey}`, currency: input.currency, amountMinor: input.amountMinor, status: 'pending', evidenceRef: 'local/dev:payment-intent' }),
  readCreditPayment: async (input) => ({ provider: 'stripe', externalRef: input.externalRef, currency: 'USD', amountMinor: 1_000, status: 'outcome_unknown', evidenceRef: 'local/dev:reconciliation' }),
}

describe('money injected Stripe topup adapter', () => {
  it('enforces configured min/max, fee line, and PaymentIntent idempotency', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const tooSmall = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, currency: 'USD', amountMinor: 499, idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(tooSmall.result).toMatchObject({ kind: 'refused', code: 'credit_topup_amount_invalid' })
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, currency: 'USD', amountMinor: 1_000, idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-1', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(started.result).toMatchObject({ commandRef: 'command-1', state: 'pending', amountMinor: 1_000, processingFeeMinor: 50, chargeAmountMinor: 1_050 })
    const replay = await beginCreditTopup({ ...initial, state: started.state, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, currency: 'USD', amountMinor: 1_000, idempotencyKey: 'topup-1', inputDigest: 'input-1', commandRef: 'command-2', successReturnRef: 'return-1', now: 2, config: fixtureUsdTopupConfig(), port: fakePort })
    expect(replay.result).toMatchObject({ commandRef: 'command-1' })
  })

  it('keeps an unknown provider result pending for reconciliation', async () => {
    const result = await beginCreditTopup({ state: createTopupState(), ledgerState: createLedgerState([account]), principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, currency: 'USD', amountMinor: 1_000, idempotencyKey: 'topup-unknown', inputDigest: 'input-unknown', commandRef: 'command-unknown', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: { ...fakePort, createCreditPayment: async (input) => ({ provider: 'stripe', externalRef: `pi:${input.idempotencyKey}`, currency: input.currency, amountMinor: input.amountMinor, status: 'outcome_unknown', evidenceRef: 'local/dev:unknown' }) } })
    expect(result.result).toMatchObject({ state: 'outcome_unknown' })
  })
  it('credits only a matching signed success event and replays duplicate webhook delivery', async () => {
    const initial = { state: createTopupState(), ledgerState: createLedgerState([account]) }
    const started = await beginCreditTopup({ ...initial, principalId: 'clerk_api_key:key-1', accountRef: account.accountRef, currency: 'USD', amountMinor: 1_000, idempotencyKey: 'topup-2', inputDigest: 'input-2', commandRef: 'command-2', successReturnRef: 'return-1', now: 1, config: fixtureUsdTopupConfig(), port: fakePort })
    if (typeof started.result !== 'object' || !('commandRef' in started.result)) throw new Error('expected topup command')
    const command = started.result
    const event = { stripeEventId: 'evt_2', eventType: 'payment_intent.succeeded' as const, externalRef: command.externalRef ?? '', principalId: command.principalId, accountRef: command.accountRef, currency: command.currency, amountMinor: command.chargeAmountMinor, payloadDigest: 'payload-2', observedAt: 2 }
    const transaction = { transactionRef: 'topup-tx-2', kind: 'topup' as const, idempotencyKey: 'topup-ledger-2', inputDigest: 'input-2', principalId: command.principalId, currency: 'USD', expectedAccountVersion: 0, now: 2 }
    const applied = applyCreditTopup({ state: started.state, ledgerState: started.ledgerState, commandRef: command.commandRef, event, transaction, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(applied.result).toMatchObject({ kind: 'accepted', amountMinor: 1_000 })
    expect(applied.ledgerState.entries).toHaveLength(1)
    const replay = applyCreditTopup({ state: applied.state, ledgerState: applied.ledgerState, commandRef: command.commandRef, event, transaction, sourceDigest: 'event-2', evidenceRefs: ['stripe:event:evt_2'] })
    expect(replay.ledgerState.entries).toHaveLength(1)
  })
})
