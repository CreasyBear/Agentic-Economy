import { describe, expect, it } from 'vitest'

import {
  claimX402PaymentAuthorization,
  listExpiredPreparedX402PaymentAttempts,
  markX402PaymentPossiblySubmitted,
  observeX402PaymentAttempt,
  prepareX402PaymentAuthorization,
  readX402PaymentAuthorization,
  readX402PaymentAuthorizationByDigest,
  reconcileX402PaymentAttempt,
  recordX402PaymentObservation,
  recordX402PaymentSignatureDigest,
  recordX402PaymentSigningIntent,
} from '../../../convex/moneyX402PaymentAttempts'
import { queueExpiredX402Authorization } from '../../../convex/capabilityOperationX402AuthorizationExpiry'
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
  get: (id: string) => Promise<Row | null>
  insert: (table: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}
type Handler = (
  ctx: { db: Db; runMutation?: () => Promise<null> },
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }

const claim = (claimX402PaymentAuthorization as unknown as HandlerExport)._handler
const prepare = (prepareX402PaymentAuthorization as unknown as HandlerExport)._handler
const read = (readX402PaymentAuthorization as unknown as HandlerExport)._handler
const readByDigest = (readX402PaymentAuthorizationByDigest as unknown as HandlerExport)._handler
const recordDigest = (recordX402PaymentSignatureDigest as unknown as HandlerExport)._handler
const recordIntent = (recordX402PaymentSigningIntent as unknown as HandlerExport)._handler
const markPossiblySubmitted = (markX402PaymentPossiblySubmitted as unknown as HandlerExport)._handler
const observe = (observeX402PaymentAttempt as unknown as HandlerExport)._handler
const recordObservation = (recordX402PaymentObservation as unknown as HandlerExport)._handler
const reconcile = (reconcileX402PaymentAttempt as unknown as HandlerExport)._handler
const listExpiredPrepared = (listExpiredPreparedX402PaymentAttempts as unknown as HandlerExport)._handler
const queueExpired = (queueExpiredX402Authorization as unknown as HandlerExport)._handler

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

  it.each([
    ['observed', 'settled'],
    ['reconciliation_required', 'unknown'],
  ] as const)('replays an already %s payment observation without patching', async (state, settlementStatus) => {
    const db = new MemoryDb()
    const args = paymentObservationArgs({ settlementStatus })
    db.seed({
      ...attempt(),
      state,
      operationRef: args.operationRef,
      inputDigest: args.inputDigest,
      paymentObservationDigest: args.paymentObservationDigest,
      transportObservationDigest: args.transportObservationDigest,
      transportRequestDigest: args.transportRequestDigest,
      settlementStatus,
      paymentResponseDigest: args.paymentResponseDigest,
      observedAt: 1_000,
    })
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))

    await expect(recordObservation({ db }, args)).resolves.toBeNull()

    expect(db.patchCalls).toHaveLength(0)
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it.each([
    ['operationRef', 'x402_payment_observation_attribution_invalid'],
    ['inputDigest', 'x402_payment_observation_attribution_invalid'],
    ['paymentObservationDigest', 'x402_payment_observation_attribution_invalid'],
    ['transportObservationDigest', 'x402_payment_observation_attribution_invalid'],
    ['transportRequestDigest', 'x402_payment_observation_attribution_invalid'],
    ['settlementStatus', 'x402_payment_settlement_identity_conflict'],
    ['paymentResponseDigest', 'x402_payment_response_identity_conflict'],
  ] as const)('rejects an already observed payment observation when %s drifts without patching', async (field, error) => {
    const db = new MemoryDb()
    const args = paymentObservationArgs()
    db.seed({
      ...attempt(),
      state: 'observed',
      operationRef: args.operationRef,
      inputDigest: args.inputDigest,
      paymentObservationDigest: args.paymentObservationDigest,
      transportObservationDigest: args.transportObservationDigest,
      transportRequestDigest: args.transportRequestDigest,
      settlementStatus: args.settlementStatus,
      paymentResponseDigest: args.paymentResponseDigest,
      observedAt: 1_000,
    })
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))
    const driftedArgs = {
      ...args,
      [field]: field === 'settlementStatus' ? 'not_settled' : 'sha256:drift',
    }

    await expect(recordObservation({ db }, driftedArgs)).rejects.toThrow(error)

    expect(db.patchCalls).toHaveLength(0)
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it('rechecks the persisted invocation grant before reconciling an x402 effect', async () => {
    const active = new MemoryDb()
    seedReconciliationAuthority(active, 'active')
    await expect(
      reconcile({ db: active, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({
      kind: 'settled',
      settlementStatus: 'settled',
    })
    expect(active.rows('moneyX402PaymentAttempts')[0]).toMatchObject({
      state: 'observed',
      settlementStatus: 'settled',
      reconciliationEvidenceRef: 'evidence:x402-reconciliation',
      reconciliationEvidenceDigest: 'sha256:x402-reconciliation',
    })

    const revoked = new MemoryDb()
    seedReconciliationAuthority(revoked, 'revoked')
    const before = JSON.stringify(revoked.rows('moneyX402PaymentAttempts'))
    await expect(
      reconcile({ db: revoked, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({
      kind: 'reconciliation_required',
    })
    expect(JSON.stringify(revoked.rows('moneyX402PaymentAttempts'))).toBe(before)
  })

  it.each([
    {
      name: 'expired credential',
      mutate: (db: MemoryDb) => {
        const row = db.rows('credentials')[0]
        if (row !== undefined) row.expiresAt = 1
      },
    },
    {
      name: 'stale credential generation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('externalIdentityBindings')[0]
        if (row !== undefined) row.credentialGeneration = 2
      },
    },
    {
      name: 'delegation scope mismatch',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.scopes = ['market.operations.read']
      },
    },
    {
      name: 'delegation ancestry cycle',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) {
          row.parentGrantRef = row.grantRef
          row.parentGeneration = row.generation
        }
      },
    },
    {
      name: 'cross-account delegation',
      mutate: (db: MemoryDb) => {
        const row = db.rows('authorityDelegationGrants')[0]
        if (row !== undefined) row.accountRef = `acc_${'8'.repeat(32)}`
      },
    },
  ])('keeps x402 ambiguity safe for $name', async ({ mutate }) => {
    const db = new MemoryDb()
    seedReconciliationAuthority(db, 'active')
    mutate(db)
    const before = JSON.stringify(db.rows('moneyX402PaymentAttempts'))
    await expect(
      reconcile({ db, runMutation: async () => null }, reconciliationArgs()),
    ).resolves.toEqual({ kind: 'reconciliation_required' })
    expect(JSON.stringify(db.rows('moneyX402PaymentAttempts'))).toBe(before)
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

  it('atomically queues an expired prepared authorization and replays by exact identity', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      _id: 'payment:expiry',
      operationRef: 'operation:test',
      inputDigest: 'sha256:input',
      reservationRef: 'reservation:test',
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt: 4_000,
      paymentSigningClaimedAt: 1,
    })
    db.seedTable('capabilityOperationInvocations', invocationRow())
    db.seedTable('actionInvocationControls', actionControlRow())
    const args = expiryArgs()

    await expect(queueExpired({ db }, args)).resolves.toMatchObject({ kind: 'queued', disposition: 'automatic', invocationRef: 'invocation:test', operationRef: 'operation:test', evidence: {
      attemptRef: 'attempt:test', effectGeneration: 1, evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
    } })
    const payment = db.rows('moneyX402PaymentAttempts')[0]
    const invocation = db.rows('capabilityOperationInvocations')[0]
    expect(payment).toMatchObject({
      state: 'reconciliation_required',
      paymentUnsignedMaterialDigest: unsignedMaterialDigest,
      paymentSigningIdempotencyKey: signingKey,
      paymentSignatureDigest: firstDigest,
      paymentPayer,
      paymentNonce,
      paymentAuthorizationValidBefore,
      paymentAuthorizationExpiresAt: 4_000,
      requestFingerprint: fingerprint,
      reservationRef: 'reservation:test',
      custodyRef,
      authorizationDigest,
    })
    expect(payment).not.toHaveProperty('paymentUnsignedMaterialJson')
    expect(payment).not.toHaveProperty('settlementStatus')
    expect(payment).not.toHaveProperty('paymentResponseDigest')
    expect(payment).not.toHaveProperty('submissionStartedAt')
    expect(invocation).toMatchObject({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      attemptRef: 'attempt:test',
      result: {
        kind: 'reconciliation_required',
        invocationRef: 'invocation:test',
        operationRef: 'operation:test',
        evidence: {
          attemptRef: 'attempt:test',
          effectGeneration: 1,
          requiredAt: new Date(5_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
        },
      },
      reconciliation: {
        attemptCount: 0,
        nextAttemptAt: 5_000,
        disposition: 'automatic',
        reason: 'authorization_expired',
      },
    })

    const committedSnapshot = JSON.stringify({ payment, invocation })
    await expect(queueExpired({ db }, args)).resolves.toMatchObject({ kind: 'queued', disposition: 'automatic', invocationRef: 'invocation:test', operationRef: 'operation:test', evidence: {
      attemptRef: 'attempt:test', effectGeneration: 1, evidenceSource: 'x402_authorization_expired:provider_transaction_or_chain_nonce_evidence_required',
    } })
    expect(JSON.stringify({
      payment: db.rows('moneyX402PaymentAttempts')[0],
      invocation: db.rows('capabilityOperationInvocations')[0],
    })).toBe(committedSnapshot)

    await expect(claim({ db }, claimArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordIntent({ db }, intentArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
    await expect(recordDigest({ db }, digestArgs())).rejects.toThrow('x402_payment_attempt_reconciliation_required')
  })

  it('refuses not-yet-expired and possibly submitted rows without changing either table', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      _id: 'payment:not-yet-expired',
      dispatchRef: 'invocation:not-yet-expired',
      attemptRef: 'attempt:not-yet-expired',
      custodyRef: 'sha256:custody:not-yet-expired',
      authorizationDigest: 'sha256:authorization:not-yet-expired',
      paymentAuthorizationExpiresAt: 6_000,
      paymentUnsignedMaterialJson: unsignedMaterialJson,
    })
    db.seedTable('capabilityOperationInvocations', invocationRow({
      invocationRef: 'invocation:not-yet-expired',
      attemptRef: 'attempt:not-yet-expired',
      principalId: 'principal:not-yet-expired',
      credentialId: 'credential:not-yet-expired',
    }))
    db.seedTable('actionInvocationControls', actionControlRow({
      invocationRef: 'invocation:not-yet-expired',
      attemptRef: 'attempt:not-yet-expired',
    }))
    db.seed({
      ...attempt(),
      _id: 'payment:possibly-submitted',
      dispatchRef: 'invocation:possibly-submitted',
      attemptRef: 'attempt:possibly-submitted',
      custodyRef: 'sha256:custody:possibly-submitted',
      authorizationDigest: 'sha256:authorization:possibly-submitted',
      state: 'possibly_submitted',
      submissionStartedAt: 2,
      paymentAuthorizationExpiresAt: 4_000,
      paymentUnsignedMaterialJson: unsignedMaterialJson,
    })
    db.seedTable('capabilityOperationInvocations', invocationRow({
      invocationRef: 'invocation:possibly-submitted',
      attemptRef: 'attempt:possibly-submitted',
      principalId: 'principal:possibly-submitted',
      credentialId: 'credential:possibly-submitted',
    }))
    db.seedTable('actionInvocationControls', actionControlRow({
      invocationRef: 'invocation:possibly-submitted',
      attemptRef: 'attempt:possibly-submitted',
    }))
    const notYetExpiredArgs = expiryArgs({
      invocationRef: 'invocation:not-yet-expired',
      principalId: 'principal:not-yet-expired',
      credentialId: 'credential:not-yet-expired',
      attemptRef: 'attempt:not-yet-expired',
      custodyRef: 'sha256:custody:not-yet-expired',
      authorizationDigest: 'sha256:authorization:not-yet-expired',
    })
    const possiblySubmittedArgs = expiryArgs({
      invocationRef: 'invocation:possibly-submitted',
      principalId: 'principal:possibly-submitted',
      credentialId: 'credential:possibly-submitted',
      attemptRef: 'attempt:possibly-submitted',
      custodyRef: 'sha256:custody:possibly-submitted',
      authorizationDigest: 'sha256:authorization:possibly-submitted',
    })
    const before = JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })

    await expect(queueExpired({ db }, notYetExpiredArgs)).resolves.toEqual({ kind: 'not_queued' })
    await expect(queueExpired({ db }, possiblySubmittedArgs)).resolves.toEqual({ kind: 'not_queued' })
    expect(JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })).toBe(before)
  })

  it('does not overwrite an unrelated outer reconciliation projection', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      operationRef: 'operation:test',
      inputDigest: 'sha256:input',
      reservationRef: 'reservation:test',
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentAuthorizationExpiresAt: 4_000,
    })
    db.seedTable('capabilityOperationInvocations', invocationRow({
      state: 'reconciliation_required',
      dispatchState: 'reconciliation_required',
      result: {
        kind: 'reconciliation_required',
        invocationRef: 'invocation:test',
        operationRef: 'operation:test',
        evidence: {
          attemptRef: 'attempt:test',
          effectGeneration: 1,
          requiredAt: new Date(1_000).toISOString(),
          retry: 'reconcile_before_retry',
          evidenceSource: 'operation:unrelated',
        },
      },
      reconciliation: {
        attemptCount: 2,
        nextAttemptAt: 6_000,
        disposition: 'automatic',
        reason: 'pending_accounting',
      },
    }))
    db.seedTable('actionInvocationControls', actionControlRow())
    const before = JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })

    await expect(queueExpired({ db }, expiryArgs())).resolves.toEqual({ kind: 'not_queued' })
    expect(JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })).toBe(before)
  })

  it('refuses the expiry transition when the canonical control version changed', async () => {
    const db = new MemoryDb()
    db.seed({
      ...attempt(),
      operationRef: 'operation:test',
      inputDigest: 'sha256:input',
      reservationRef: 'reservation:test',
      paymentUnsignedMaterialJson: unsignedMaterialJson,
      paymentAuthorizationExpiresAt: 4_000,
    })
    db.seedTable('capabilityOperationInvocations', invocationRow())
    db.seedTable('actionInvocationControls', actionControlRow({ invocationVersion: 3 }))
    const before = JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })

    await expect(queueExpired({ db }, expiryArgs())).resolves.toEqual({ kind: 'not_queued' })
    expect(JSON.stringify({ payments: db.rows('moneyX402PaymentAttempts'), invocations: db.rows('capabilityOperationInvocations') })).toBe(before)
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

function paymentObservationArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    paymentIdentifier,
    operationRef: 'operation:test',
    inputDigest: 'sha256:input',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    settlementStatus: 'settled',
    paymentResponseDigest: 'sha256:payment-response',
    observedAt: 2_000,
    ...overrides,
  }
}

function reconciliationArgs(): Record<string, unknown> {
  return {
    dispatchRef: 'invocation:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    operationRef: 'operation:test',
    inputDigest: 'sha256:input',
    evidenceRef: 'evidence:x402-reconciliation',
    evidenceDigest: 'sha256:x402-reconciliation',
    reservationRef: 'reservation:test',
    paymentIdentifier,
    challengeDigest: 'sha256:challenge',
    settlementStatus: 'settled',
    amountUnits: '1',
    currency: 'USDC',
    exponent: 6,
    paymentResponseDigest: 'sha256:payment-response',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    observedAt: 2_000,
  }
}

function seedReconciliationAuthority(
  db: MemoryDb,
  grantLifecycle: 'active' | 'revoked',
): void {
  db.seed({
    ...attempt(),
    state: 'reconciliation_required',
    operationRef: 'operation:test',
    inputDigest: 'sha256:input',
    reservationRef: 'reservation:test',
    transportObservationDigest: 'sha256:transport-observation',
    transportRequestDigest: 'sha256:transport-request',
    paymentObservationDigest: 'sha256:payment-observation',
    settlementStatus: 'unknown',
  })
  db.seedTable('capabilityOperationInvocations', invocationRow({
    principalId: `prn_${'2'.repeat(32)}`,
    ownerId: `acc_${'3'.repeat(32)}`,
    credentialId: `crd_${'4'.repeat(32)}`,
    grantRef: `grt_${'5'.repeat(32)}`,
    grantExpiresAt: 8_000_000_000_000,
  }))
  db.seedTable('principals', {
    _id: 'principals:agent',
    principalRef: `prn_${'2'.repeat(32)}`,
    kind: 'agent',
    lifecycle: 'active',
  })
  db.seedTable('accounts', {
    _id: 'accounts:owner',
    accountRef: `acc_${'3'.repeat(32)}`,
    lifecycle: 'active',
    currentOwnershipRef: `own_${'9'.repeat(32)}`,
  })
  db.seedTable('agentAccessPrincipals', {
    _id: 'agentAccessPrincipals:agent',
    principalId: `prn_${'2'.repeat(32)}`,
    ownerId: `acc_${'3'.repeat(32)}`,
    credentialId: `crd_${'4'.repeat(32)}`,
    applicationRef: 'application:test',
    environment: 'sandbox',
    scopes: ['market_operations:invoke'],
    grantGeneration: 1,
    policyDigest: 'sha256:policy',
    lifecycle: 'active',
    expiresAt: 8_000_000_000_000,
  })
  db.seedTable('agentAccessGrants', {
    _id: 'agentAccessGrants:grant',
    grantRef: `grt_${'5'.repeat(32)}`,
    principalId: `prn_${'2'.repeat(32)}`,
    ownerId: `acc_${'3'.repeat(32)}`,
    credentialId: `crd_${'4'.repeat(32)}`,
    applicationRef: 'application:test',
    environment: 'sandbox',
    generation: 1,
    policyDigest: 'sha256:policy',
    lifecycle: grantLifecycle,
    expiresAt: 8_000_000_000_000,
  })
  db.seedTable('memberships', {
    _id: 'memberships:agent',
    accountRef: `acc_${'3'.repeat(32)}`,
    memberPrincipalRef: `prn_${'2'.repeat(32)}`,
    lifecycle: 'active',
  })
  db.seedTable('externalIdentityBindings', {
    _id: 'externalIdentityBindings:agent',
    bindingRef: `eib_${'6'.repeat(32)}`,
    principalRef: `prn_${'2'.repeat(32)}`,
    providerNamespace: 'clerk/api-key',
    providerIdentifier: `crd_${'4'.repeat(32)}`,
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
  })
  db.seedTable('credentials', {
    _id: 'credentials:agent',
    credentialRef: `crd_${'7'.repeat(32)}`,
    bindingRef: `eib_${'6'.repeat(32)}`,
    principalRef: `prn_${'2'.repeat(32)}`,
    type: 'api_key',
    lifecycle: 'active',
    generation: 1,
    expiresAt: 8_000_000_000_000,
  })
  db.seedTable('authorityDelegationGrants', {
    _id: 'authorityDelegationGrants:grant',
    grantRef: `grt_${'5'.repeat(32)}`,
    accountRef: `acc_${'3'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`,
    subjectPrincipalRef: `prn_${'2'.repeat(32)}`,
    scopes: ['market_operations:invoke'],
    resourceRefs: ['operation:test'],
    budgetLimit: 1_000,
    budgetUsed: 0,
    expiresAt: 8_000_000_000_000,
    generation: 1,
    revision: 1,
    lifecycle: grantLifecycle,
    createdAt: 1,
  })
}

function invocationRow(overrides: Record<string, unknown> = {}): Row {
  return {
    _id: 'invocation:row',
    invocationRef: 'invocation:test',
    principalId: 'principal:test',
    ownerId: 'owner:test',
    credentialId: 'credential:test',
    applicationRef: 'application:test',
    operationRef: 'operation:test',
    idempotencyKey: 'idempotency:test',
    environment: 'sandbox',
    grantRef: 'grant:test',
    grantGeneration: 1,
    policyDigest: 'sha256:policy',
    grantExpiresAt: 99_999,
    inputDigest: 'sha256:input',
    requestDigest: 'sha256:request',
    state: 'pending',
    dispatchState: 'running',
    attemptRef: 'attempt:test',
    updatedAt: 1,
    createdAt: 1,
    ...overrides,
  }
}

function expiryArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    invocationRef: 'invocation:test',
    principalId: 'principal:test',
    credentialId: 'credential:test',
    attemptRef: 'attempt:test',
    effectGeneration: 1,
    custodyRef,
    authorizationDigest,
    reservationRef: 'reservation:test',
    nativeTransition: 'applied',
    controlInvocationVersion: 2,
    observedControlState: 'leased',
    now: 5_000,
    ...overrides,
  }
}

function actionControlRow(overrides: Record<string, unknown> = {}): Row {
  const invocationRef = String(overrides.invocationRef ?? 'invocation:test')
  const attemptRef = String(overrides.attemptRef ?? 'attempt:test')
  const invocationVersion = Number(overrides.invocationVersion ?? 2)
  return {
    _id: `control:${invocationRef}`,
    invocationRef,
    invocationVersion,
    control: {
      invocationRef,
      invocationVersion,
      control: { state: 'reconciliation_required', attemptRef },
    },
    currentAttemptRef: attemptRef,
    currentEffectGeneration: 1,
    ...overrides,
  }
}

class MemoryDb implements Db {
  private readonly tables = new Map<string, Row[]>()
  private throwAfterNextPatch = false
  private nextId = 1
  readonly indexCalls: string[] = []
  readonly patchCalls: Array<{ id: string; value: Record<string, unknown> }> = []

  seed(row: Row): void {
    this.seedTable('moneyX402PaymentAttempts', row)
  }

  seedTable(table: string, row: Row): void {
    const rows = this.tables.get(table) ?? []
    this.tables.set(table, [...rows, row])
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

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
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
      this.patchCalls.push({ id, value })
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
