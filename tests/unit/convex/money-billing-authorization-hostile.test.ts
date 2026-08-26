import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canonicalBillingPrincipalContext,
  canonicalBillingTopupContext,
  canonicalBillingTransactionContext,
  ownerPrincipalAllowed,
  persistedInvocationAuthorityIsCurrent,
  principalAllowed,
  requireBillingSourceWrite,
  type PersistedInvocationAuthorityExpectation,
} from '../../../convex/moneyBillingAuthorization'
import {
  MemoryDb,
  attemptRef,
  credentialId,
  inputDigest,
  invocationRef,
  now,
  ownerId,
  principalId,
  transactionRef,
  type Row,
} from './money-ledger-test-harness'
import { seedCurrentMoneyInvocationAuthority } from './money-ledger-test-fixtures'

type ActorProbe =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{
      kind: 'authenticated_owner'
      canonicalAccountRef: string
      canonicalPrincipalRef: string
    }>

const probes = vi.hoisted(() => ({
  actor: {
    kind: 'authenticated_owner',
    canonicalAccountRef: 'owner:test-money',
    canonicalPrincipalRef: 'owner-principal:test-money',
  } as ActorProbe,
  sourceWrite: { kind: 'admitted' } as
    | Readonly<{ kind: 'admitted' }>
    | Readonly<{ kind: 'rejected'; reason: string }>,
}))

vi.mock('../../../convex/authz', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../convex/authz')>(),
  resolveBusinessActor: async () => probes.actor,
}))

vi.mock('../../../convex/sourceWriteAdmission', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../convex/sourceWriteAdmission')>(),
  requireSourceWrite: async () => probes.sourceWrite,
}))

type Identity = Readonly<{
  issuer?: string
  subject?: string
  tokenIdentifier?: string
}>

function authorityDb(): MemoryDb {
  const db = new MemoryDb()
  seedCurrentMoneyInvocationAuthority(db)
  return db
}

function row(db: MemoryDb, table: string): Row {
  const value = db.rows(table)[0]
  if (value === undefined) throw new Error(`fixture_row_missing:${table}`)
  return value
}

function queryContext(
  db: MemoryDb,
  identity: Identity | null = { subject: 'owner-subject', tokenIdentifier: 'owner-token' },
) {
  return {
    db,
    auth: { getUserIdentity: async () => identity },
  }
}

function mutationContext(
  db: MemoryDb,
  identity: Identity | null = { subject: 'owner-subject', tokenIdentifier: 'owner-token' },
) {
  return {
    ...queryContext(db, identity),
    scheduler: {},
  }
}

function current(
  db: MemoryDb,
  expected: PersistedInvocationAuthorityExpectation = {
    invocationRef,
    principalId,
    credentialId,
    grantRef: 'grant:money',
    grantGeneration: 1,
    operationRef: 'operation:money',
    inputDigest,
    attemptRef,
  },
): Promise<boolean> {
  return persistedInvocationAuthorityIsCurrent({ db } as never, expected)
}

function seedChargeJournal(
  db: MemoryDb,
  overrides: Readonly<{
    transaction?: Record<string, unknown>
    entries?: readonly Record<string, unknown>[]
  }> = {},
): void {
  db.seed('moneyTransactions', {
    _id: 'transaction:money',
    transactionRef,
    kind: 'charge',
    principalId,
    credentialId,
    inputDigest,
    ...(overrides.transaction ?? {}),
  })
  for (const [index, entry] of (overrides.entries ?? [{ invocationRef, attemptRef }]).entries()) {
    db.seed('moneyLedgerEntries', {
      _id: `ledger-entry:${index}`,
      transactionRef,
      invocationRef,
      attemptRef,
      ...entry,
    })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  probes.actor = {
    kind: 'authenticated_owner',
    canonicalAccountRef: ownerId,
    canonicalPrincipalRef: 'owner-principal:test-money',
  }
  probes.sourceWrite = { kind: 'admitted' }
})

describe('money billing authorization hostile boundaries', () => {
  it('accepts only exact direct or Clerk API-key principal identities', () => {
    expect(principalAllowed(null, principalId)).toBe(false)
    expect(principalAllowed({}, principalId)).toBe(false)
    expect(principalAllowed({ tokenIdentifier: principalId }, principalId)).toBe(true)
    expect(principalAllowed({ tokenIdentifier: 'credential:test' }, 'clerk_api_key:credential:test'))
      .toBe(true)
    expect(principalAllowed({ tokenIdentifier: 'other' }, principalId)).toBe(false)
  })

  it('allows owner identity only from durable owner facts', async () => {
    const directLoader = vi.fn(async () => null)
    await expect(ownerPrincipalAllowed({ tokenIdentifier: principalId }, principalId, directLoader))
      .resolves.toBe(true)
    expect(directLoader).not.toHaveBeenCalled()

    const cases: ReadonlyArray<readonly [Identity | null, Record<string, unknown> | null, boolean]> = [
      [null, null, false],
      [{ tokenIdentifier: 'other' }, null, false],
      [{ subject: 'owner-subject' }, null, false],
      [{ subject: 'owner-subject' }, { ownerId: 'other-owner' }, false],
      [{ subject: 'owner-subject' }, { ownerId: 'owner-subject' }, true],
      [
        { issuer: 'issuer:test', subject: 'owner-subject' },
        { ownerId: 'owner-subject', ownerTokenIdentifier: 'issuer:test|owner-subject' },
        true,
      ],
      [
        { subject: 'owner-subject', tokenIdentifier: 'owner-token' },
        { ownerId: 'owner-subject', ownerTokenIdentifier: 'owner-token' },
        true,
      ],
      [
        { subject: 'owner-subject', tokenIdentifier: 'owner-token' },
        { ownerId: 'owner-subject', ownerTokenIdentifier: 'wrong-token' },
        false,
      ],
    ]
    for (const [identity, principal, allowed] of cases) {
      await expect(ownerPrincipalAllowed(
        identity,
        principalId,
        async () => principal as never,
      )).resolves.toBe(allowed)
    }
  })

  it('rebases a current account read but denies anonymous and revoked durable identities', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = authorityDb()
    const adapted = await canonicalBillingPrincipalContext(
      queryContext(db) as never,
      principalId,
      credentialId,
    ) as unknown as ReturnType<typeof queryContext> | null
    expect(adapted).not.toBeNull()
    await expect(adapted?.auth.getUserIdentity()).resolves.toMatchObject({
      subject: ownerId,
      tokenIdentifier: 'owner-token',
    })

    probes.actor = { kind: 'anonymous' }
    await expect(canonicalBillingPrincipalContext(queryContext(db) as never, principalId))
      .resolves.toBeNull()
    probes.actor = {
      kind: 'authenticated_owner',
      canonicalAccountRef: ownerId,
      canonicalPrincipalRef: 'owner-principal:test-money',
    }
    await expect(canonicalBillingPrincipalContext(queryContext(db, null) as never, principalId))
      .resolves.toBeNull()
    row(db, 'agentAccessPrincipals').lifecycle = 'revoked'
    await expect(canonicalBillingPrincipalContext(queryContext(db) as never, principalId))
      .resolves.toBeNull()
  })

  it('keeps current cached reads available but denies expired mutation consequences exactly', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = authorityDb()
    row(db, 'agentAccessPrincipals').expiresAt = now

    await expect(canonicalBillingPrincipalContext(queryContext(db) as never, principalId))
      .resolves.not.toBeNull()
    await expect(canonicalBillingPrincipalContext(mutationContext(db) as never, principalId))
      .resolves.toBeNull()
  })

  it('resolves top-ups by either durable locator and rejects absent or conflicting locators', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = authorityDb()
    db.seed('moneyTopupCommands', {
      _id: 'topup:one',
      commandRef: 'topup-command:one',
      externalRef: 'topup-external:one',
      idempotencyKey: 'topup-idempotency:one',
      principalId,
    })
    const ctx = queryContext(db) as never

    await expect(canonicalBillingTopupContext(ctx, { commandRef: 'topup-command:one' }))
      .resolves.not.toBeNull()
    await expect(canonicalBillingTopupContext(ctx, { externalRef: 'topup-external:one' }))
      .resolves.not.toBeNull()
    await expect(canonicalBillingTopupContext(ctx, {})).resolves.toBeNull()
    await expect(canonicalBillingTopupContext(ctx, { commandRef: 'topup-command:missing' }))
      .resolves.toBeNull()
    await expect(canonicalBillingTopupContext(ctx, {
      commandRef: 'topup-command:one',
      idempotencyKey: 'topup-idempotency:wrong',
    })).resolves.toBeNull()
    await expect(canonicalBillingTopupContext(ctx, {
      commandRef: 'topup-command:one',
      externalRef: 'topup-external:wrong',
      idempotencyKey: 'topup-idempotency:one',
    })).resolves.not.toBeNull()
  })

  it('denies missing, caller-mismatched, refused, and cancelled durable invocations', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const missing = authorityDb()
    missing.remove('capabilityOperationInvocations', () => true)
    await expect(current(missing)).resolves.toBe(false)

    for (const [field, value] of [
      ['principalId', 'prn_wrong'],
      ['credentialId', 'credential:wrong'],
      ['grantRef', 'grant:wrong'],
      ['grantGeneration', 2],
      ['operationRef', 'operation:wrong'],
      ['inputDigest', 'sha256:wrong'],
      ['attemptRef', 'attempt:wrong'],
    ] as const) {
      const db = authorityDb()
      await expect(current(db, { invocationRef, [field]: value }))
        .resolves.toBe(false)
    }
    for (const state of ['refused', 'cancelled'] as const) {
      const db = authorityDb()
      row(db, 'capabilityOperationInvocations').state = state
      await expect(current(db, { invocationRef })).resolves.toBe(false)
    }
    await expect(current(authorityDb(), { invocationRef })).resolves.toBe(true)
  })

  it('denies invalid durable binding and credential lifecycle facts', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const cases: ReadonlyArray<readonly [string, (db: MemoryDb) => void]> = [
      ['missing binding', (db) => db.remove('externalIdentityBindings', () => true)],
      ['wrong principal', (db) => { row(db, 'externalIdentityBindings').principalRef = 'prn_wrong' }],
      ['revoked binding', (db) => { row(db, 'externalIdentityBindings').lifecycle = 'revoked' }],
      ['unknown provider state', (db) => {
        row(db, 'externalIdentityBindings').providerState = { kind: 'unknown' }
      }],
      ['inactive provider state', (db) => {
        row(db, 'externalIdentityBindings').providerState = { kind: 'known', value: 'revoked' }
      }],
      ['unsafe generation', (db) => {
        row(db, 'externalIdentityBindings').credentialGeneration = Number.NaN
      }],
      ['negative generation', (db) => {
        row(db, 'externalIdentityBindings').credentialGeneration = -1
      }],
      ['missing credential', (db) => db.remove('credentials', () => true)],
      ['wrong credential principal', (db) => { row(db, 'credentials').principalRef = 'prn_wrong' }],
      ['wrong credential type', (db) => { row(db, 'credentials').type = 'provider_token' }],
      ['expired credential', (db) => { row(db, 'credentials').expiresAt = now }],
      ['stale materialized generation', (db) => {
        row(db, 'credentials').expiryMaterialization = {
          credentialGeneration: 2,
          credentialExpiresAt: 8_000_000_000_000,
          state: 'scheduled',
        }
      }],
      ['stale materialized expiry', (db) => {
        row(db, 'credentials').expiryMaterialization = {
          credentialGeneration: 1,
          credentialExpiresAt: 7_000_000_000_000,
          state: 'scheduled',
        }
      }],
      ['unscheduled materialized expiry', (db) => {
        row(db, 'credentials').expiryMaterialization = {
          credentialGeneration: 1,
          credentialExpiresAt: 8_000_000_000_000,
          state: 'expired',
        }
      }],
    ]
    for (const [, corrupt] of cases) {
      const db = authorityDb()
      corrupt(db)
      await expect(current(db)).resolves.toBe(false)
    }
  })

  it('denies a durable invocation whose owning account no longer exists', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = authorityDb()
    db.remove('accounts', () => true)

    await expect(current(db)).resolves.toBe(false)
  })

  it('requires one invocation and one attempt attribution in a charge journal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const valid = authorityDb()
    seedChargeJournal(valid)
    const adapted = await canonicalBillingTransactionContext(
      mutationContext(valid, null) as never,
      { transactionRef, principalId },
    ) as unknown as ReturnType<typeof mutationContext> | null
    expect(adapted).not.toBeNull()
    await expect(adapted?.auth.getUserIdentity()).resolves.toEqual({ tokenIdentifier: principalId })

    const transactionCases: ReadonlyArray<readonly [string, Record<string, unknown> | null]> = [
      ['missing transaction', null],
      ['non-charge transaction', { kind: 'topup' }],
      ['wrong principal', { principalId: 'prn_wrong' }],
      ['missing credential', { credentialId: undefined }],
    ]
    for (const [, transaction] of transactionCases) {
      const db = authorityDb()
      if (transaction !== null) seedChargeJournal(db, { transaction })
      await expect(canonicalBillingTransactionContext(
        mutationContext(db) as never,
        { transactionRef, principalId },
      )).resolves.toBeNull()
    }

    const journalCases: ReadonlyArray<readonly [string, readonly Record<string, unknown>[]]> = [
      ['missing invocation', [{ invocationRef: undefined, attemptRef }]],
      ['ambiguous invocation', [
        { invocationRef, attemptRef },
        { invocationRef: 'operation-invocation:other', attemptRef },
      ]],
      ['missing attempt', [{ invocationRef, attemptRef: undefined }]],
      ['ambiguous attempt', [
        { invocationRef, attemptRef },
        { invocationRef, attemptRef: 'operation-attempt:other' },
      ]],
      ['unknown durable invocation', [{ invocationRef: 'operation-invocation:missing', attemptRef }]],
    ]
    for (const [, entries] of journalCases) {
      const db = authorityDb()
      seedChargeJournal(db, { entries })
      await expect(canonicalBillingTransactionContext(
        mutationContext(db) as never,
        { transactionRef, principalId },
      )).resolves.toBeNull()
    }
  })

  it('preserves prior identity when adapting a valid charge journal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const db = authorityDb()
    seedChargeJournal(db)
    const adapted = await canonicalBillingTransactionContext(
      mutationContext(db, { subject: 'prior-subject', tokenIdentifier: 'prior-token' }) as never,
      { transactionRef, principalId },
    ) as unknown as ReturnType<typeof mutationContext> | null
    await expect(adapted?.auth.getUserIdentity()).resolves.toEqual({
      subject: 'prior-subject',
      tokenIdentifier: principalId,
    })
  })

  it('admits valid source writes and exposes deterministic rejection reasons', async () => {
    const args = { operationKey: 'billing:test', correlationId: 'correlation:test' }
    await expect(requireBillingSourceWrite({} as never, args)).resolves.toBeUndefined()
    probes.sourceWrite = { kind: 'rejected', reason: 'source_write_missing' }
    await expect(requireBillingSourceWrite({} as never, args))
      .rejects.toThrow('money_billing_source_write_rejected:source_write_missing')
  })
})
