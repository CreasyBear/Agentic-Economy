import { describe, expect, it } from 'vitest'

import {
  claimX402PaymentAuthorization,
  listExpiredPreparedX402PaymentAttempts,
  markX402PaymentPossiblySubmitted,
  observeX402PaymentAttempt,
  prepareX402PaymentAuthorization,
  readX402PaymentAuthorization,
  readX402PaymentAuthorizationByDigest,
  recordX402PaymentSignatureDigest,
  recordX402PaymentSigningIntent,
} from '../../../convex/moneyX402PaymentAttempts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import type { StableHashValue } from '@/modules/common/stable-hash'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  lte: (field: string, value: unknown) => QueryBuilder
}
type Query = {
  withIndex: (name: string, build: (query: QueryBuilder) => QueryBuilder) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}
type Db = {
  query: (table: string) => Query
  insert: (table: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}
type Handler = (ctx: { db: Db }, args: Record<string, unknown>) => Promise<unknown>
type HandlerExport = { _handler: Handler }

const claim = (claimX402PaymentAuthorization as unknown as HandlerExport)._handler
const prepare = (prepareX402PaymentAuthorization as unknown as HandlerExport)._handler
const read = (readX402PaymentAuthorization as unknown as HandlerExport)._handler
const readByDigest = (readX402PaymentAuthorizationByDigest as unknown as HandlerExport)._handler
const recordDigest = (recordX402PaymentSignatureDigest as unknown as HandlerExport)._handler
const recordIntent = (recordX402PaymentSigningIntent as unknown as HandlerExport)._handler
const markPossiblySubmitted = (markX402PaymentPossiblySubmitted as unknown as HandlerExport)._handler
const observe = (observeX402PaymentAttempt as unknown as HandlerExport)._handler
const listExpiredPrepared = (listExpiredPreparedX402PaymentAttempts as unknown as HandlerExport)._handler

const custodyRef = 'sha256:custody'
const authorizationDigest = 'sha256:authorization'
const fingerprint = 'sha256:request-one'
const paymentIdentifier = 'ae_payment-one'
const firstDigest = canonicalDigest('header:first')
const secondDigest = canonicalDigest('header:second')
const paymentPayer = '0x0000000000000000000000000000000000000001'
const paymentNonce = `0x${'11'.repeat(32)}`
const signingKey = '11111111-1111-4111-8111-111111111111'
const paymentAuthorizationValidBefore = '999'
const paymentAuthorizationExpiresAt = 999_000

const unsignedMaterial = {
  x402Version: 2,
  resource: { url: 'https://provider.example/pay' },
  accepted: {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1',
    asset: '0x833589',
    payTo: '0xrecipient',
    maxTimeoutSeconds: 60,
    extra: { assetTransferMethod: 'eip3009' },
  },
  authorization: {
    from: paymentPayer,
    to: '0xrecipient',
    value: '1',
    validAfter: '0',
    validBefore: '999',
    nonce: paymentNonce,
  },
  typedData: {
    domain: { chainId: '8453' },
    types: { TransferWithAuthorization: [{ name: 'value', type: 'uint256' }] },
    primaryType: 'TransferWithAuthorization',
    message: { value: '1', validBefore: '999' },
  },
} as const

const unsignedMaterialJson = stableStringify(unsignedMaterial as unknown as StableHashValue)
const unsignedMaterialDigest = canonicalDigest(unsignedMaterial)

describe('money x402 payment authorization attempt', () => {
  it.each([
    ['partial', { custodyBudgetRef: 'wallet:budget' }],
    ['blank budget ref', { custodyBudgetRef: '  ', custodyGeneration: 1, custodyDailyMaximumUnits: '100' }],
    ['zero generation', { custodyBudgetRef: 'wallet:budget', custodyGeneration: 0, custodyDailyMaximumUnits: '100' }],
    ['unsafe generation', { custodyBudgetRef: 'wallet:budget', custodyGeneration: Number.MAX_SAFE_INTEGER + 1, custodyDailyMaximumUnits: '100' }],
    ['zero daily maximum', { custodyBudgetRef: 'wallet:budget', custodyGeneration: 1, custodyDailyMaximumUnits: '0' }],
    ['noncanonical daily maximum', { custodyBudgetRef: 'wallet:budget', custodyGeneration: 1, custodyDailyMaximumUnits: '01' }],
  ])('rejects invalid managed custody policy: %s', async (_label, override) => {
    const db = new MemoryDb()
    await expect(prepare({ db }, { ...prepareArgs(), ...override }))
      .rejects.toThrow('x402_payment_custody_policy_invalid')
    expect(db.rows('moneyX402PaymentAttempts')).toEqual([])
  })

  it('persists and replays unsigned intent identity without a raw header', async () => {
    const db = new MemoryDb()
    const args = prepareArgs({
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 3,
      custodyDailyMaximumUnits: '1000000',
    })
    const first = await prepare({ db }, args)
    const row = db.rows('moneyX402PaymentAttempts')[0]
    if (row === undefined) throw new Error('missing_prepared_attempt')

    await expect(recordIntent({ db }, intentArgs({
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      custodyGeneration: 3,
    }))).resolves.toBeNull()
    await expect(recordDigest({ db }, digestArgs({
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      custodyGeneration: 3,
    }))).resolves.toBeNull()

    const material = await read({ db }, {
      custodyRef: row.custodyRef,
      authorizationDigest: row.authorizationDigest,
      requestFingerprint: fingerprint,
      custodyGeneration: 3,
    })
    expect(material).toMatchObject({
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
      requestFingerprint: fingerprint,
    })
    expect(material).not.toHaveProperty('paymentSignature')
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).not.toContain('header:first')
    expect(await prepare({ db }, args)).toEqual(first)
    await expect(prepare({ db }, { ...args, custodyGeneration: 4 }))
      .rejects.toThrow('x402_payment_attempt_attribution_invalid')
  })

  it('validates the UUID and canonical unsigned identity at the mutation boundary', async () => {
    const db = new MemoryDb()
    db.seed(attempt())

    await expect(recordIntent({ db }, intentArgs({ paymentSigningIdempotencyKey: 'not-a-uuid' })))
      .rejects.toThrow('x402_payment_signing_idempotency_key_invalid')
    await expect(recordIntent({ db }, intentArgs({ paymentUnsignedMaterialDigest: 'sha256:wrong' })))
      .rejects.toThrow('x402_payment_unsigned_material_invalid')
    await recordIntent({ db }, intentArgs())
    await expect(recordIntent({ db }, intentArgs({ paymentUnsignedMaterialJson: `${unsignedMaterialJson} ` })))
      .rejects.toThrow('x402_payment_unsigned_material_invalid')
    await expect(recordIntent({ db }, intentArgs({
      paymentAuthorizationValidBefore: '1000',
      paymentAuthorizationExpiresAt: 1_000_000,
    }))).rejects.toThrow('x402_payment_unsigned_identity_conflict')
    await expect(recordIntent({ db }, intentArgs({ paymentSigningIdempotencyKey: '22222222-2222-4222-8222-222222222222' })))
      .rejects.toThrow('x402_payment_unsigned_identity_conflict')
    await expect(recordDigest({ db }, digestArgs({ paymentPayer: '0xother' })))
      .rejects.toThrow('x402_payment_authorization_material_invalid')
  })

  it.each([
    ['non-decimal', '1e3', 1_000_000],
    ['noncanonical', '0999', 999_000],
    ['overflow', '9007199254740992', Number.MAX_SAFE_INTEGER],
    ['mismatched milliseconds', paymentAuthorizationValidBefore, paymentAuthorizationExpiresAt + 1],
  ] as const)('rejects invalid expiry identity: %s', async (_label, validBefore, expiresAt) => {
    const db = new MemoryDb()
    db.seed(attempt())
    await expect(recordIntent({ db }, intentArgs({
      paymentAuthorizationValidBefore: validBefore,
      paymentAuthorizationExpiresAt: expiresAt,
    }))).rejects.toThrow('x402_payment_unsigned_material_invalid')
  })

  it('refuses a partial first-win expiry identity', async () => {
    const db = new MemoryDb()
    db.seed({ ...attempt(), paymentAuthorizationValidBefore })
    await expect(recordIntent({ db }, intentArgs()))
      .rejects.toThrow('x402_payment_unsigned_identity_conflict')
  })

  it('refuses to record a signature digest for a partial expiry identity', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
    })

    await expect(recordDigest({ db }, digestArgs()))
      .rejects.toThrow('x402_payment_authorization_material_invalid')
    expect(db.rows('moneyX402PaymentAttempts')[0]).not.toHaveProperty('paymentSignatureDigest')
  })

  it('gates managed authorization reads and writes on the expected generation', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '1000000',
    })

    await expect(read({ db }, { ...readArgs(), custodyGeneration: 8 })).resolves.toBeNull()
    await expect(readByDigest({ db }, { ...readArgs(), custodyGeneration: 8 })).resolves.toBeNull()
    await expect(read({ db }, { ...readArgs(), custodyGeneration: 7 })).resolves.toMatchObject({
      custodyBudgetRef: 'wallet:budget',
      custodyGeneration: 7,
      custodyDailyMaximumUnits: '1000000',
    })
    await expect(claim({ db }, { ...claimArgs(), custodyGeneration: 8 }))
      .rejects.toThrow('x402_payment_custody_generation_conflict')
    await expect(recordDigest({ db }, { ...digestArgs(), custodyGeneration: 8 }))
      .rejects.toThrow('x402_payment_custody_generation_conflict')
  })

  it('makes the first claim authoritative and rejects mismatched concurrent identity', async () => {
    const db = new MemoryDb()
    db.seed(attempt())

    await expect(claim({ db }, claimArgs())).resolves.toEqual({ kind: 'claimed' })
    expect(await claim({ db }, claimArgs())).toEqual({ kind: 'pending' })
    await recordIntent({ db }, intentArgs())
    await expect(Promise.all([
      recordDigest({ db }, digestArgs()),
      recordDigest({ db }, digestArgs({ paymentSignatureDigest: secondDigest })),
    ])).rejects.toThrow('x402_payment_signature_identity_conflict')

    const material = await read({ db }, readArgs())
    expect(material).toMatchObject({
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
    })
    expect(material).not.toHaveProperty('paymentSignature')
    await expect(claim({ db }, claimArgs())).resolves.toMatchObject({
      kind: 'stored',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
    })
  })

  it('refuses a different request fingerprint before reading or claiming', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
      paymentSignatureDigest: firstDigest,
      paymentSigningClaimedAt: 1,
    })

    await expect(claim({ db }, { ...claimArgs(), requestFingerprint: 'sha256:request-two' }))
      .rejects.toThrow('x402_payment_request_fingerprint_conflict')
    await expect(read({ db }, { ...readArgs(), requestFingerprint: 'sha256:request-two' }))
      .rejects.toThrow('x402_payment_request_fingerprint_conflict')
  })

  it('keeps unsigned identity evidence after submission may have started and blocks re-authorization', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
      paymentSigningClaimedAt: 1,
    })

    await markPossiblySubmitted({ db }, eventArgs())
    const row = db.rows('moneyX402PaymentAttempts')[0]
    expect(row).toMatchObject({
      state: 'possibly_submitted',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      requestFingerprint: fingerprint,
    })
    expect(row).not.toHaveProperty('paymentSignature')
    expect(await read({ db }, readArgs())).not.toHaveProperty('paymentSignature')
    await expect(claim({ db }, claimArgs()))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordDigest({ db }, digestArgs({ paymentSignatureDigest: secondDigest })))
      .rejects.toThrow('x402_payment_attempt_reconciliation_required')
  })

  it('replays a committed mark after its response is lost without changing safe evidence', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt,
      paymentSigningClaimedAt: 1,
    })
    db.loseAcknowledgementAfterNextPatch()

    await expect(markPossiblySubmitted({ db }, eventArgs())).rejects.toThrow('acknowledgement_lost')
    await expect(markPossiblySubmitted({ db }, eventArgs())).resolves.toBeNull()
    expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'possibly_submitted',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSignatureDigest: firstDigest,
    })
  })

  it.each(['possibly_submitted', 'observed', 'reconciliation_required'] as const)(
    'replaying a mark keeps an already advanced %s state',
    async (state) => {
      const db = new MemoryDb()
      db.seed({ ...attempt(), state, submissionStartedAt: 11 })
      await expect(markPossiblySubmitted({ db }, eventArgs())).resolves.toBeNull()
      expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({ state, submissionStartedAt: 11 })
    },
  )

  it('replays a committed observation after its response is lost without replacing evidence', async () => {
    const db = new MemoryDb()
    db.seed({ ...attempt(), state: 'possibly_submitted', submissionStartedAt: 11 })
    const args = observationArgs()
    db.loseAcknowledgementAfterNextPatch()

    await expect(observe({ db }, args)).rejects.toThrow('acknowledgement_lost')
    await expect(observe({ db }, args)).resolves.toBeNull()
    expect(db.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'observed',
      settlementStatus: 'settled',
      paymentResponseDigest: 'sha256:settlement',
      evidenceRefs: ['evidence:receipt'],
    })
  })

  it('lists at most 25 redacted expired prepared candidates through the expiry index', async () => {
    const db = new MemoryDb()
    for (let index = 0; index < 30; index += 1) {
      db.seed({
        ...attempt(),
        _id: `expired:${index}`,
        dispatchRef: `dispatch:${index}`,
        attemptRef: `attempt:${index}`,
        custodyRef: `custody:${index}`,
        authorizationDigest: `authorization:${index}`,
        reservationRef: `reservation:${index}`,
        paymentAuthorizationExpiresAt: 4_000 + index,
      })
    }
    db.seed({ ...attempt(), state: 'prepared', paymentAuthorizationExpiresAt: 6_000 })
    db.seed({ ...attempt(), state: 'possibly_submitted', paymentAuthorizationExpiresAt: 1_000 })
    db.seed({ ...attempt(), state: 'observed', paymentAuthorizationExpiresAt: 1_000 })
    db.seed({ ...attempt(), paymentAuthorizationExpiresAt: undefined })

    const result = await listExpiredPrepared({ db }, { now: 5_000, limit: 25 }) as Array<Record<string, unknown>>
    expect(db.indexCalls).toContain('by_state_and_paymentAuthorizationExpiresAt')
    expect(result).toHaveLength(25)
    expect(result[0]).toEqual({
      dispatchRef: 'dispatch:0',
      attemptRef: 'attempt:0',
      effectGeneration: 1,
      custodyRef: 'custody:0',
      authorizationDigest: 'authorization:0',
      reservationRef: 'reservation:0',
      paymentAuthorizationExpiresAt: 4_000,
    })
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      'attemptRef',
      'authorizationDigest',
      'custodyRef',
      'dispatchRef',
      'effectGeneration',
      'paymentAuthorizationExpiresAt',
      'reservationRef',
    ])
    expect(JSON.stringify(result)).not.toContain('paymentUnsignedMaterialJson')
    expect(JSON.stringify(result)).not.toContain('paymentSigningIdempotencyKey')
    expect(JSON.stringify(result)).not.toContain('paymentPayer')
    expect(JSON.stringify(result)).not.toContain('paymentNonce')
  })

  it.each([0, 26, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects expired prepared candidate limit %s',
    async (limit) => {
      const db = new MemoryDb()
      await expect(listExpiredPrepared({ db }, { now: 5_000, limit }))
        .rejects.toThrow('x402_payment_expired_prepared_limit_invalid')
    },
  )
})

function attempt(): Row {
  return {
    _id: `attempt-row:${Math.random()}`,
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
    operationKeyDigest: 'sha256:operation',
    challengeDigest: 'sha256:challenge',
    challengeJson: '{}',
    selectedRequirementJson: '{}',
    providerEndpoint: 'https://provider.example/pay',
    credentialRef: 'credential:test',
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589',
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    custodyRef,
    authorizationDigest,
    requestFingerprint: fingerprint,
    state: 'prepared',
    preparedAt: 1,
    evidenceRefs: [],
  }
}

function prepareArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    operationRef: 'operation:test',
    inputDigest: 'sha256:input',
    paymentIdentifier,
    operationKeyDigest: 'sha256:operation',
    challengeDigest: 'sha256:challenge',
    challengeJson: '{}',
    selectedRequirementJson: '{}',
    providerEndpoint: 'https://provider.example/pay',
    credentialRef: 'credential:test',
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589',
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    reservationRef: 'reservation:test',
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

function claimArgs(): Record<string, unknown> {
  return { custodyRef, authorizationDigest, requestFingerprint: fingerprint }
}

function readArgs(): Record<string, unknown> {
  return { custodyRef, authorizationDigest, requestFingerprint: fingerprint }
}

function intentArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    custodyRef,
    authorizationDigest,
    paymentUnsignedMaterialJson: unsignedMaterialJson,
    paymentUnsignedMaterialDigest: unsignedMaterialDigest,
    paymentSigningIdempotencyKey: signingKey,
    paymentPayer,
    paymentNonce,
    paymentAuthorizationValidBefore,
    paymentAuthorizationExpiresAt,
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

function digestArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    custodyRef,
    authorizationDigest,
    paymentSignatureDigest: firstDigest,
    paymentPayer,
    paymentNonce,
    requestFingerprint: fingerprint,
    ...overrides,
  }
}

function eventArgs(): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
    challengeDigest: 'sha256:challenge',
    scheme: 'exact',
    network: 'eip155:8453',
    asset: '0x833589',
    payTo: '0xrecipient',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    providerEndpoint: 'https://provider.example/pay',
    custodyRef,
    authorizationDigest,
  }
}

function observationArgs(): Record<string, unknown> {
  return {
    ...eventArgs(),
    state: 'observed',
    settlementStatus: 'settled',
    settlementDigest: 'sha256:settlement',
    evidenceRefs: ['evidence:receipt'],
  }
}

class MemoryDb implements Db {
  private readonly tables = new Map<string, Row[]>()
  private throwAfterNextPatch = false
  private nextId = 1
  readonly indexCalls: string[] = []

  seed(row: Row): void {
    const rows = this.tables.get('moneyX402PaymentAttempts') ?? []
    this.tables.set('moneyX402PaymentAttempts', [...rows, row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  loseAcknowledgementAfterNextPatch(): void {
    this.throwAfterNextPatch = true
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:row:${this.nextId++}`
    const rows = this.tables.get(table) ?? []
    this.tables.set(table, [...rows, { ...value, _id: id } as Row])
    return id
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const query: Query = {
      withIndex: (name, build) => {
        this.indexCalls.push(name)
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          lte: (field, value) => {
            filters.push((row) => (
              typeof row[field] === 'number'
              && typeof value === 'number'
              && row[field] <= value
            ))
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const matches = (this.tables.get(table) ?? []).filter((row) => filters.every((filter) => filter(row)))
        if (matches.length > 1) throw new Error('expected_unique')
        return matches[0] ?? null
      },
      take: async (limit) => (this.tables.get(table) ?? [])
        .filter((row) => filters.every((filter) => filter(row)))
        .slice(0, limit),
    }
    return query
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row === undefined) continue
      for (const [key, next] of Object.entries(value)) {
        if (next === undefined) delete row[key]
        else row[key] = next
      }
      if (this.throwAfterNextPatch) {
        this.throwAfterNextPatch = false
        throw new Error('acknowledgement_lost')
      }
      return
    }
    throw new Error(`missing_row:${id}`)
  }
}
