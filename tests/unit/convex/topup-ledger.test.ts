import Stripe from 'stripe'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))
vi.mock('../../../src/modules/money/public', async () => {
  const actual = await vi.importActual('../../../src/modules/money/public')
  return {
    ...actual,
    evaluateLiveMoneyGate: () => ({
      kind: 'accepted' as const,
      policyId: 'test-money-policy',
    }),
  }
})

import {
  applyCreditTopup,
  bindCreditPaymentSession,
  reserveCreditTopup,
} from '../../../convex/moneyLedger'
import {
  accountRefForOwner,
  type CreditPaymentRequest,
} from '../../../src/modules/money/public'
import {
  mapStripeCheckoutSessionEvidence,
  verifyStripeMoneyWebhook,
  type StripeMoneyProviderConfig,
} from '../../../src/lib/server/stripe-money-provider'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = { eq: (field: string, value: unknown) => QueryBuilder }
type Query = {
  withIndex: (
    name: string,
    build: (query: QueryBuilder) => QueryBuilder,
  ) => Query
  unique: () => Promise<Row | null>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const rows = (this.tables.get(table) ?? []).filter((row) =>
          filters.every((filter) => filter(row)),
        )
        if (rows.length > 1) throw new Error('expected_unique')
        return rows[0] ?? null
      },
    }
    return query
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...value, _id: id })
    return id
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }

  async patch(
    table: string,
    id: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.get(id)
    if (row === null || !this.tables.has(table))
      throw new Error(`missing_row:${id}`)
    for (const [key, next] of Object.entries(value)) {
      if (next === undefined) delete row[key]
      else row[key] = next
    }
  }
}

type Handler = (
  ctx: {
    db: MemoryDb
    auth: {
      getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>
    }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const reserve = (reserveCreditTopup as unknown as HandlerExport)._handler
const bind = (bindCreditPaymentSession as unknown as HandlerExport)._handler
const apply = (applyCreditTopup as unknown as HandlerExport)._handler

const config: StripeMoneyProviderConfig = {
  secretKey: 'sk_test_topup',
  webhookSecret: 'whsec_topup',
  publishableKey: 'pk_test_topup',
  mode: 'test',
}
const ownerId = 'owner-topup-1'
const request: CreditPaymentRequest = {
  commandRef: 'command-topup-1',
  principalId: 'principal-topup-1',
  accountRef: accountRefForOwner(ownerId, 'USD'),
  amount: { currency: 'USD', units: '1050', exponent: 2 },
  idempotencyKey: 'topup-idempotency-1',
  inputDigest: 'sha256:input-topup-1',
  successReturnRef: 'https://app.example.test/agent-access',
  providerRecoveryDeadlineAt: Number.MAX_SAFE_INTEGER,
}
const sourceArgs = {
  operationKey: 'money:test',
  correlationId: 'money:test:1',
}
const identity = {
  getUserIdentity: async () => ({ subject: ownerId, tokenIdentifier: request.principalId }),
}

describe('Stripe Checkout top-up lifecycle', () => {
  it('credits once across open/unpaid creation, signed paid webhook, expanded readback, replay, and drift refusal', async () => {
    const db = new MemoryDb()
    db.seed('agentAccessPrincipals', {
      _id: 'agentAccessPrincipals:1',
      principalId: request.principalId,
      ownerId,
      credentialId: 'credential-topup-1',
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: [],
      authorityMode: 'inspect_only',
      grantGeneration: 1,
      policyDigest: 'policy:topup',
      lifecycle: 'active',
      recordedAt: 1,
      lastSeenAt: 1,
    })
    db.seed('moneyAccounts', {
      _id: 'moneyAccounts:1',
      accountRef: request.accountRef,
      accountKind: 'operator_credit',
      accountId: ownerId,
      currency: 'USD',
      exponent: 2,
      balanceUnits: '0',
      recoveryDueUnits: '0',
      version: 0,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    })

    const reserved = await reserve(
      { db, auth: identity },
      {
        principalId: request.principalId,
        accountRef: request.accountRef,
        amount: { currency: 'USD', units: '1000', exponent: 2 },
        commandRef: request.commandRef,
        idempotencyKey: request.idempotencyKey,
        inputDigest: request.inputDigest,
        successReturnRef: request.successReturnRef,
        ...sourceArgs,
      },
    )
    expect(reserved).toMatchObject({
      kind: 'accepted',
      command: { state: 'pending', chargeAmountUnits: '1050' },
    })
    if (!isAcceptedCommand(reserved))
      throw new Error('expected reserved top-up')

    const openEvidence = mapStripeCheckoutSessionEvidence({
      session: checkoutSession(),
      config,
      expected: request,
    })
    expect(openEvidence).toMatchObject({
      status: 'pending',
      paymentStatus: 'unpaid',
      checkoutStatus: 'open',
    })
    if (isRefusal(openEvidence))
      throw new Error('expected open Stripe evidence')
    await expect(
      bind(
        { db, auth: identity },
        {
          commandRef: request.commandRef,
          evidence: openEvidence,
          ...sourceArgs,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        state: 'pending',
        externalRef: 'cs_test_topup_1',
        evidenceDigest: openEvidence.evidenceDigest,
      },
    })

    const paidSession = checkoutSession({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: {
        id: 'pi_test_topup_1',
        object: 'payment_intent',
        amount: 1050,
        currency: 'usd',
        status: 'succeeded',
        livemode: false,
        created: 1_700_000_001,
      },
      line_items: {
        object: 'list',
        data: [
          {
            id: 'li_test_topup_1',
            object: 'item',
            amount_subtotal: 1050,
            amount_total: 1050,
            currency: 'usd',
            description: 'AE credit',
            price: { id: 'price_expanded_topup_1' },
            quantity: 1,
            discounts: [],
            taxes: [],
          },
        ],
        has_more: false,
        url: '/v1/checkout/sessions/cs_test_topup_1/line_items',
      },
    })
    const paidEvidence = mapStripeCheckoutSessionEvidence({
      session: paidSession,
      config,
      expected: request,
    })
    if (isRefusal(paidEvidence))
      throw new Error('expected paid Stripe evidence')
    expect(paidEvidence.checkoutSessionDigest).toBe(
      openEvidence.checkoutSessionDigest,
    )
    expect(paidEvidence.paymentIntentDigest).toBe(
      openEvidence.paymentIntentDigest,
    )
    expect(paidEvidence.evidenceDigest).not.toBe(openEvidence.evidenceDigest)

    const { line_items: _lineItems, ...unexpandedPaidSession } = paidSession
    const payload = JSON.stringify({
      id: 'evt_topup_paid_1',
      object: 'event',
      api_version: Stripe.API_VERSION,
      created: 1_700_000_002,
      livemode: false,
      pending_webhooks: 1,
      type: 'checkout.session.completed',
      data: {
        object: { ...unexpandedPaidSession, payment_intent: 'pi_test_topup_1' },
      },
    })
    const signature = new Stripe(
      config.secretKey,
    ).webhooks.generateTestHeaderString({
      payload,
      secret: config.webhookSecret,
      timestamp: Math.floor(Date.now() / 1000),
    })
    const verified = await verifyStripeMoneyWebhook({
      rawBody: payload,
      signature,
      config,
    })
    expect(verified).toMatchObject({
      kind: 'checkout',
      status: 'paid',
      eventType: 'checkout.session.completed',
      paymentId: 'pi_test_topup_1',
    })
    if (isRefusal(verified) || verified.kind !== 'checkout')
      throw new Error('expected signed paid event')

    const drift = await apply(
      { db, auth: identity },
      {
        event: {
          ...verified,
          amount: { currency: 'USD', units: '1051', exponent: 2 },
        },
        readback: {
          ...paidEvidence,
          amount: { currency: 'USD', units: '1051', exponent: 2 },
        },
        ...sourceArgs,
      },
    )
    expect(drift).toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)

    const applied = await apply(
      { db, auth: identity },
      { event: verified, readback: paidEvidence, ...sourceArgs },
    )
    expect(applied).toMatchObject({ kind: 'accepted', status: 'applied' })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)

    await expect(
      apply(
        { db, auth: identity },
        { event: verified, readback: paidEvidence, ...sourceArgs },
      ),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'replayed' })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    const frozenCommand = db.rows('moneyTopupCommands')[0]
    await expect(
      apply(
        { db, auth: identity },
        {
          event: {
            ...verified,
            stripeEventId: 'evt_topup_paid_2',
            payloadDigest: 'sha256:payload-topup-2',
          },
          readback: paidEvidence,
          ...sourceArgs,
        },
      ),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'replayed' })
    expect(db.rows('moneyTopupCommands')[0]).toMatchObject({
      appliedStripeEventId: frozenCommand?.appliedStripeEventId,
      appliedPayloadDigest: frozenCommand?.appliedPayloadDigest,
      evidenceDigest: frozenCommand?.evidenceDigest,
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    await expect(
      apply(
        { db, auth: identity },
        {
          event: verified,
          readback: {
            ...paidEvidence,
            evidenceDigest: 'sha256:terminal-drift',
          },
          ...sourceArgs,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })
})

function isAcceptedCommand(
  value: unknown,
): value is { command: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'command' in value &&
    typeof value.command === 'object' &&
    value.command !== null
  )
}

function isRefusal(value: unknown): value is { kind: 'refused'; code: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'refused'
  )
}

function checkoutSession(
  overrides: Readonly<Record<string, unknown>> = {},
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_topup_1',
    object: 'checkout.session',
    amount_total: 1050,
    client_reference_id: request.commandRef,
    client_secret: 'cs_secret_topup_1',
    created: 1_700_000_000,
    currency: 'usd',
    livemode: false,
    metadata: { ae_command_ref: request.commandRef },
    mode: 'payment',
    payment_intent: 'pi_test_topup_1',
    payment_status: 'unpaid',
    status: 'open',
    ui_mode: 'elements',
    return_url: request.successReturnRef,
    line_items: {
      object: 'list',
      data: [
        {
          id: 'li_test_topup_1',
          object: 'item',
          amount_subtotal: 1050,
          amount_total: 1050,
          currency: 'usd',
          description: 'AE credit',
          price: null,
          quantity: 1,
          discounts: [],
          taxes: [],
        },
      ],
      has_more: false,
      url: '/v1/checkout/sessions/cs_test_topup_1/line_items',
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}
