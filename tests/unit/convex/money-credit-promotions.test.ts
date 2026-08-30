import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))

import {
  applyCreditTopupHandler,
  reserveCreditTopupHandler,
} from '../../../convex/moneyCreditTopup'
import { accountRefForOwner } from '@/modules/money/public'

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

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const matches = () =>
      (this.tables.get(table) ?? []).filter((row) =>
        filters.every((filter) => filter(row)),
      )
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
        const rows = matches()
        if (rows.length > 1) throw new Error('expected_unique')
        // Convex never lets a handler mutate an already-read document through
        // its own patch calls; cloning keeps that snapshot semantics honest.
        const found = rows[0]
        return found === undefined ? null : { ...found }
      },
    }
    return query
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    const rows = this.tables.get(table) ?? []
    rows.push({ ...value, _id: id })
    this.tables.set(table, rows)
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
    idOrTable: string,
    valueOrId: Record<string, unknown> | string,
    maybeValue?: Record<string, unknown>,
  ): Promise<void> {
    const id = maybeValue === undefined ? idOrTable : valueOrId
    const value = maybeValue === undefined ? valueOrId : maybeValue
    if (typeof id !== 'string' || typeof value !== 'object' || value === null)
      throw new Error('invalid_patch')
    const row = await this.get(id)
    if (row === null) throw new Error(`missing_row:${id}`)
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
const apply = applyCreditTopupHandler as unknown as Handler
const reserveHandler = reserveCreditTopupHandler as unknown as Handler

const principalId = 'principal:promotions'
const ownerId = 'owner:promotions'
const accountRef = accountRefForOwner(ownerId, 'USD')
const sourceArgs = { operationKey: 'moneyLedger:test', correlationId: 'test' }
const identity = {
  getUserIdentity: async () => ({ subject: ownerId, tokenIdentifier: principalId }),
}

function seed(db: MemoryDb): void {
  db.insert('agentAccessPrincipals', {
    principalId,
    ownerId,
    credentialId: 'credential:promotions',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    scopes: [],
    authorityMode: 'inspect_only',
    grantGeneration: 1,
    policyDigest: 'policy:promotions',
    lifecycle: 'active',
    recordedAt: 1,
    lastSeenAt: 1,
  })
  db.insert('moneyAccounts', {
    accountRef,
    accountKind: 'operator_credit',
    accountId: ownerId,
    currency: 'USD',
    exponent: 2,
    balanceUnits: '0',
    recoveryDueUnits: '0',
    heldUnits: '0',
    version: 0,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
  })
}

function reserveArgs(commandRef: string, creditUnits: string): Record<string, unknown> {
  return {
    principalId,
    accountRef,
    amount: { currency: 'USD', units: creditUnits, exponent: 2 },
    commandRef,
    idempotencyKey: `topup:${commandRef}`,
    inputDigest: `sha256:${commandRef}`,
    successReturnRef: 'https://ae.test/owner/credit',
    ...sourceArgs,
  }
}

async function reserve(db: MemoryDb, commandRef: string, creditUnits: string): Promise<Record<string, unknown>> {
  const outcome = await reserveHandler({ db, auth: identity }, reserveArgs(commandRef, creditUnits))
  if (
    typeof outcome !== 'object' ||
    outcome === null ||
    !('kind' in outcome) ||
    !('command' in outcome) ||
    outcome.kind !== 'accepted' ||
    typeof outcome.command !== 'object' ||
    outcome.command === null
  ) throw new Error(`expected_reserved_topup:${commandRef}`)
  return outcome.command as Record<string, unknown>
}

function paidEvent(input: Readonly<{
  commandRef: string
  session: string
  metadataDigest: string
  chargeUnits: string
}>): Record<string, unknown> {
  return {
    kind: 'checkout' as const,
    stripeEventId: `evt:${input.session}`,
    eventType: 'checkout.session.completed' as const,
    externalRef: input.session,
    sessionId: input.session,
    commandRef: input.commandRef,
    paymentId: `pi:${input.session}`,
    checkoutSessionDigest: `sha256:checkout:${input.session}`,
    paymentIntentDigest: `sha256:payment-intent:${input.session}`,
    status: 'paid' as const,
    amount: { currency: 'USD', units: input.chargeUnits, exponent: 2 },
    metadataDigest: input.metadataDigest,
    payloadDigest: `sha256:event:${input.session}`,
    observedAt: 2,
  }
}

function paidReadback(event: Record<string, unknown>): Record<string, unknown> {
  const metadataDigest = String(event.metadataDigest)
  return {
    externalRef: event.externalRef,
    amount: event.amount,
    status: 'succeeded' as const,
    evidenceRef: `stripe:checkout:${String(event.sessionId)}`,
    requestDigest: `sha256:request:${String(event.sessionId)}`,
    metadataDigest,
    checkoutSessionDigest: event.checkoutSessionDigest,
    paymentIntentDigest: event.paymentIntentDigest,
    evidenceDigest: `sha256:evidence:${String(event.sessionId)}`,
    paymentId: event.paymentId,
  }
}

describe('Convex owner promotion postings on completed top-ups', () => {
  it('mints the one-time trial grant and the tier-one bonus exactly once on a qualifying $50 top-up', async () => {
    const db = new MemoryDb()
    seed(db)
    const context = { db, auth: identity }
    const command = await reserve(db, 'command:promo-50', '5000')
    const event = paidEvent({
      commandRef: 'command:promo-50',
      session: 'cs:promo-50',
      metadataDigest: String(command.metadataDigest),
      // reservation adds the 500 bps processing fee
      chargeUnits: '5250',
    })
    const args = { event, readback: paidReadback(event), ...sourceArgs }

    await expect(apply(context, args)).resolves.toMatchObject({
      kind: 'accepted',
      status: 'applied',
    })
    // $50 credit + $1.00 trial grant + $2.50 tier-one bonus (5% floored)
    expect(db.rows('moneyAccounts')[0]).toMatchObject({
      balanceUnits: '5350',
      version: 3,
    })
    const kinds = db.rows('moneyTransactions').map((row) => ({
      kind: row.kind,
      state: row.state,
      expectedAccountVersion: row.expectedAccountVersion,
    }))
    expect(kinds).toEqual([
      { kind: 'topup', state: 'applied', expectedAccountVersion: 0 },
      { kind: 'promo_grant', state: 'applied', expectedAccountVersion: 1 },
      { kind: 'topup_bonus', state: 'applied', expectedAccountVersion: 2 },
    ])
    const promoEntry = db.rows('moneyLedgerEntries').find(
      (row) => row.entryType === 'promo_grant',
    )
    const bonusEntry = db.rows('moneyLedgerEntries').find(
      (row) => row.entryType === 'topup_bonus',
    )
    expect(promoEntry).toMatchObject({
      direction: 'credit',
      amountUnits: '100',
      currency: 'USD',
      exponent: 2,
      accountRef,
    })
    expect(String(promoEntry?.evidenceRefs)).toContain('ae:promotion:owner-trial:v1')
    expect(bonusEntry).toMatchObject({
      direction: 'credit',
      amountUnits: '250',
      currency: 'USD',
      exponent: 2,
      accountRef,
    })
    expect(String(bonusEntry?.evidenceRefs)).toContain('ae:promotion:topup-bonus:v1')
    // Promotions mint spendable credit without touching usage/budget bookkeeping.
    expect(db.rows('moneyUsageEvents')).toHaveLength(0)
    expect(db.rows('moneyStripeEvents')).toHaveLength(1)
    expect(db.rows('moneyTopupCommands')[0]).toMatchObject({
      buyerBalanceBeforeUnits: '0',
      buyerBalanceAfterUnits: '5350',
    })

    // Same webhook replays: no double mint, nothing patched again.
    await expect(apply(context, args)).resolves.toMatchObject({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(db.rows('moneyAccounts')[0]).toMatchObject({
      balanceUnits: '5350',
      version: 3,
    })
    expect(db.rows('moneyTransactions')).toHaveLength(3)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(3)

    // Grant proves exactly-once at the storage layer: the deterministic
    // owner-keyed transactionRef is the single status row.
    const promoRows = db.rows('moneyTransactions').filter(
      (row) => row.kind === 'promo_grant',
    )
    expect(promoRows).toHaveLength(1)
    const rerun = await apply(context, {
      event: {
        ...(args.event as Record<string, unknown>),
        payloadDigest: 'sha256:event:different-source',
      },
      readback: paidReadback(event),
      ...sourceArgs,
    })
    expect(rerun).toMatchObject({ kind: 'refused' })
    expect(db.rows('moneyTransactions')).toHaveLength(3)
  })

  it('keeps the grant once-per-owner while later qualifying top-ups keep earning their own bonus', async () => {
    const db = new MemoryDb()
    seed(db)
    const context = { db, auth: identity }
    const first = await reserve(db, 'command:promo-first', '5000')
    const firstEvent = paidEvent({
      commandRef: 'command:promo-first',
      session: 'cs:promo-first',
      metadataDigest: String(first.metadataDigest),
      chargeUnits: '5250',
    })
    await expect(
      apply(context, { event: firstEvent, readback: paidReadback(firstEvent), ...sourceArgs }),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'applied' })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5350')

    const second = await reserve(db, 'command:promo-second', '10000')
    const secondEvent = paidEvent({
      commandRef: 'command:promo-second',
      session: 'cs:promo-second',
      metadataDigest: String(second.metadataDigest),
      chargeUnits: '10500',
    })
    await expect(
      apply(context, {
        event: secondEvent,
        readback: paidReadback(secondEvent),
        ...sourceArgs,
      }),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'applied' })

    // No second grant; $100 top-up earns the 10% tier ($10.00) instead.
    expect(
      db.rows('moneyTransactions').filter((row) => row.kind === 'promo_grant'),
    ).toHaveLength(1)
    const bonuses = db.rows('moneyTransactions').filter(
      (row) => row.kind === 'topup_bonus',
    )
    expect(bonuses).toHaveLength(2)
    expect(bonuses[0]?.transactionRef).not.toBe(bonuses[1]?.transactionRef)
    expect([...bonuses.map((row) => String(row.amountUnits))].sort()).toEqual([
      '1000',
      '250',
    ])
    expect(db.rows('moneyAccounts')[0]).toMatchObject({
      balanceUnits: '16350',
      // base bump 3->4 plus one bonus leg 4->5; grant does not repeat
      version: 5,
    })
  })
})
