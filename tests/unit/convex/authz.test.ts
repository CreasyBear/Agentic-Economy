import type { UserIdentity } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import {
  readActiveAdminMembership,
  readCurrentActiveAdminMembership,
  resolveAdminAuthority,
  resolveBusinessActor,
} from '../../../convex/authz'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  take: (count: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
}

type Db = {
  query: (tableName: string) => Query
}

type AuthCtx = Parameters<typeof resolveAdminAuthority>[0]

describe('Convex authz helpers', () => {
  it('fails closed by naming the missing Clerk JWT issuer', async () => {
    vi.stubEnv('CLERK_JWT_ISSUER_DOMAIN', '')

    try {
      await expect(import('../../../convex/auth.config')).rejects.toThrow(
        'CLERK_JWT_ISSUER_DOMAIN is required for Convex auth configuration'
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('keeps anonymous reads explicit and fails closed for unmigrated Clerk identities', async () => {
    const anonymous = await resolveBusinessActor(authCtx(new FakeDb(), null))
    expect(anonymous).toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })

    await expect(resolveBusinessActor(authCtx(new FakeDb(), sam()))).resolves.toEqual({
      kind: 'anonymous',
      anonymousBucket: 'convex:anonymous',
    })

    await expect(resolveBusinessActor({
      ...authCtx(new FakeDb(), sam()),
      scheduler: {} as never,
    })).resolves.toEqual({
      kind: 'anonymous',
      anonymousBucket: 'convex:anonymous',
    })
  })

  it('denies callers without a durable admin membership', async () => {
    const db = new FakeDb()

    await expect(resolveAdminAuthority(authCtx(db, null), 'register_capability_supply')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })

    await expect(resolveAdminAuthority(authCtx(db, sam()), 'register_capability_supply')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
  })

  it('keeps action authority on the non-cached canonical boundary and rejects identity drift', async () => {
    const authority = {
      principalRef: `prn_${'1'.repeat(32)}`,
      accountRef: `acc_${'2'.repeat(32)}`,
      legacyOwnerId: 'owners:canonical',
      legacyOwnerLocator: 'legacy-owner-row',
      revision: {
        binding: 1,
        credential: 1,
        principal: 1,
        account: 1,
        access: 1,
        currentOwnership: 1,
        currentOwnerPrincipal: 1,
        compatibilityUpdatedAt: 1,
      },
      provenance: {
        providerNamespace: 'clerk/user' as const,
        bindingRef: `eib_${'3'.repeat(32)}`,
        credentialRef: `crd_${'4'.repeat(32)}`,
        credentialGeneration: 1,
        accessKind: 'ownership' as const,
        accessRef: `own_${'5'.repeat(32)}`,
        currentOwnershipRef: `own_${'5'.repeat(32)}`,
        resolvedAt: 1,
      },
    }
    const actor = await resolveBusinessActor({
      auth: authCtx(new FakeDb(), sam()).auth,
      runAction: async () => authority,
    } as Parameters<typeof resolveBusinessActor>[0])
    expect(actor).toMatchObject({
      kind: 'authenticated_owner',
      clerkUserId: 'legacy-owner-row',
      canonicalPrincipalRef: authority.principalRef,
      canonicalAccountRef: authority.accountRef,
    })
    expect(Object.isFrozen(actor)).toBe(true)

    await expect(resolveBusinessActor({
      auth: authCtx(new FakeDb(), sam()).auth,
      runAction: async () => null,
    } as Parameters<typeof resolveBusinessActor>[0])).resolves.toEqual({
      kind: 'anonymous',
      anonymousBucket: 'convex:anonymous',
    })

    const unexpected = new Error('database_unavailable')
    await expect(resolveBusinessActor({
      auth: authCtx(new FakeDb(), sam()).auth,
      runAction: async () => {
        throw unexpected
      },
    } as Parameters<typeof resolveBusinessActor>[0])).rejects.toBe(unexpected)
  })

  it('reads current admin membership with complete durable provenance', async () => {
    const db = new FakeDb()
    db.seed('adminMemberships', row('admin:complete', {
      clerkUserId: 'user_sam',
      tokenIdentifier: 'clerk|user_sam',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'root',
      grantedAt: 1,
      revokedBy: 'root-2',
      revokedAt: 2,
      evidenceRef: 'evidence:membership',
    }))

    await expect(readCurrentActiveAdminMembership(authCtx(db, null))).resolves.toBeUndefined()
    await expect(readCurrentActiveAdminMembership(authCtx(db, sam()))).resolves.toMatchObject({
      clerkUserId: 'user_sam',
      revokedBy: 'root-2',
      revokedAt: 2,
      evidenceRef: 'evidence:membership',
    })
    await expect(resolveAdminAuthority(authCtx(db, sam()), 'register_capability_supply'))
      .resolves.toMatchObject({ kind: 'allowed' })
  })

  it('returns the minimal admin projection and rejects empty token identifiers', async () => {
    const db = new FakeDb()
    db.seed('adminMemberships', row('admin:minimal', {
      clerkUserId: 'user_minimal',
      tokenIdentifier: 'clerk|user_minimal',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'root',
      grantedAt: 1,
    }))
    await expect(readActiveAdminMembership(db as unknown as AuthCtx['db'], {
      tokenIdentifier: 'clerk|user_minimal',
    })).resolves.toEqual({
      clerkUserId: 'user_minimal',
      tokenIdentifier: 'clerk|user_minimal',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'root',
      grantedAt: 1,
    })
    await expect(readActiveAdminMembership(db as unknown as AuthCtx['db'], {
      tokenIdentifier: '',
    })).resolves.toBeUndefined()
  })

  it('treats a missing canonical identity as unauthorized', async () => {
    const db = new FakeDb()
    const missingTokenIdentity = {
      subject: 'user_sam',
      issuer: 'https://clerk.example.test',
    } as UserIdentity
    await expect(resolveAdminAuthority(authCtx(db, missingTokenIdentity), 'register_capability_supply')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
  })
})

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: EqFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly rows: readonly Row[],
    private readonly filters: readonly EqFilter[] = []
  ) {}

  withIndex(_indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.rows, [...this.filters, ...builder.filters])
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
  }

  async take(count: number): Promise<Row[]> {
    return (await this.collect()).slice(0, count)
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
  }
}

class FakeDb implements Db {
  private readonly tables: Record<string, Row[]> = {}

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName))
  }

  seed(tableName: string, row: Row): void {
    this.table(tableName).push(row)
  }

  private table(tableName: string): Row[] {
    this.tables[tableName] ??= []
    return this.tables[tableName]
  }
}

function row(id: string, value: Record<string, unknown>): Row {
  return { _id: id, _creationTime: 1, ...value }
}

function authCtx(db: Db, identity: UserIdentity | null): AuthCtx {
  return {
    db: db as unknown as AuthCtx['db'],
    auth: {
      getUserIdentity: async () => identity,
    },
  }
}

function sam(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_sam',
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    name: 'Sam Owner',
    email: 'sam@example.test',
  }
}
