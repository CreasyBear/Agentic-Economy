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
  markCreditTopupOutcomeUnknown,
  readCreditTopupCommand,
  reserveCreditTopup,
} from '../../../convex/moneyLedger'
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
        return rows[0] ?? null
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
type HandlerExport = { _handler: Handler }
const reserve = (reserveCreditTopup as unknown as HandlerExport)._handler
const markUnknown = (markCreditTopupOutcomeUnknown as unknown as HandlerExport)
  ._handler
const read = (readCreditTopupCommand as unknown as HandlerExport)._handler
const apply = (applyCreditTopup as unknown as HandlerExport)._handler

const principalId = 'principal:topup'
const ownerId = 'owner:topup'
const accountRef = accountRefForOwner(ownerId, 'USD')
const commandRef = 'command:topup'
const idempotencyKey = 'topup:idempotency'
const sourceArgs = {
  operationKey: 'moneyLedger:test',
  correlationId: commandRef,
}
const identity = {
  getUserIdentity: async () => ({ subject: ownerId, tokenIdentifier: principalId }),
}

function seedPrincipal(db: MemoryDb): void {
  db.insert('agentAccessPrincipals', {
    principalId,
    ownerId,
    credentialId: 'credential:topup',
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
}

function seedAccount(db: MemoryDb): void {
  seedPrincipal(db)
  db.insert('moneyAccounts', {
    accountRef,
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
}

function reserveArgs(): Record<string, unknown> {
  return {
    principalId,
    accountRef,
    amount: { currency: 'USD', units: '1000', exponent: 2 },
    commandRef,
    idempotencyKey,
    inputDigest: 'sha256:topup-input',
    successReturnRef: 'https://ae.test/agent-access',
    ...sourceArgs,
  }
}

describe('Convex credit topup recovery', () => {
  it('marks the reserved command unknown, rejects identity drift, and resolves it once from an exact webhook', async () => {
    const db = new MemoryDb()
    await seedAccount(db)
    const context = { db, auth: identity }
    await expect(reserve(context, reserveArgs())).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'pending', commandRef },
    })
    const row = db.rows('moneyTopupCommands')[0]
    if (row === undefined || typeof row.providerRecoveryDeadlineAt !== 'number')
      throw new Error('missing reserved topup')
    const markArgs = {
      commandRef,
      principalId,
      accountRef,
      amount: { currency: 'USD', units: '1000', exponent: 2 },
      idempotencyKey,
      inputDigest: 'sha256:topup-input',
      successReturnRef: 'https://ae.test/agent-access',
      providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
      ...sourceArgs,
    }

    await expect(markUnknown(context, markArgs)).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'outcome_unknown', commandRef },
    })
    await expect(
      read(context, { commandRef, idempotencyKey }),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'outcome_unknown', commandRef },
    })
    await expect(read(context, { idempotencyKey })).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    await expect(
      read(context, { commandRef, externalRef: 'cs:topup', idempotencyKey }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
    await expect(
      markUnknown(
        {
          db,
          auth: {
            getUserIdentity: async () => ({
              tokenIdentifier: 'principal:other',
            }),
          },
        },
        markArgs,
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'billing_identity_missing',
    })
    await expect(
      markUnknown(context, { ...markArgs, inputDigest: 'sha256:changed' }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    await expect(markUnknown(context, markArgs)).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'outcome_unknown', commandRef },
    })

    const metadataDigest = String(row.metadataDigest)
    const event = {
      kind: 'checkout' as const,
      stripeEventId: 'evt:topup',
      eventType: 'checkout.session.completed' as const,
      externalRef: 'cs:topup',
      sessionId: 'cs:topup',
      commandRef,
      paymentId: 'pi:topup',
      checkoutSessionDigest: 'sha256:checkout',
      paymentIntentDigest: 'sha256:payment-intent',
      status: 'paid' as const,
      amount: { currency: 'USD', units: '1050', exponent: 2 },
      metadataDigest,
      payloadDigest: 'sha256:event',
      observedAt: 2,
    }
    const readback = {
      externalRef: event.externalRef,
      amount: event.amount,
      status: 'succeeded' as const,
      evidenceRef: 'stripe:checkout:cs:topup',
      requestDigest: 'sha256:provider-request',
      metadataDigest,
      checkoutSessionDigest: event.checkoutSessionDigest,
      paymentIntentDigest: event.paymentIntentDigest,
      evidenceDigest: 'sha256:evidence',
      paymentId: event.paymentId,
    }

    await expect(
      apply(context, { event, readback, ...sourceArgs }),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'applied' })
    expect(db.rows('moneyTopupCommands')[0]?.state).toBe('succeeded')
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    await expect(
      apply(context, { event, readback, ...sourceArgs }),
    ).resolves.toMatchObject({ kind: 'accepted', status: 'replayed' })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    await expect(
      apply(context, {
        event: { ...event, payloadDigest: 'sha256:changed' },
        readback,
        ...sourceArgs,
      }),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
  })
  it('materializes the canonical operator account once before the first top-up', async () => {
    const db = new MemoryDb()
    seedPrincipal(db)
    const context = { db, auth: identity }

    await expect(reserve(context, reserveArgs())).resolves.toMatchObject({
      kind: 'accepted',
      command: { commandRef, accountRef },
    })
    await expect(reserve(context, reserveArgs())).resolves.toMatchObject({
      kind: 'accepted',
      command: { commandRef, accountRef },
    })

    expect(db.rows('moneyAccounts')).toEqual([
      expect.objectContaining({
        accountRef,
        accountKind: 'operator_credit',
        accountId: ownerId,
        currency: 'USD',
        exponent: 2,
        balanceUnits: '0',
        recoveryDueUnits: '0',
        version: 0,
        state: 'active',
      }),
    ])
  })
})
