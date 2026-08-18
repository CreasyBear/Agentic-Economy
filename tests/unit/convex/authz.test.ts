import type { UserIdentity } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { resolveAdminAuthority, resolveBusinessActor } from '../../../convex/authz'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EqFilter = { field: string; value: unknown }

type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
}

type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
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

  it('derives business actors from Convex Clerk identity and never from browser authority payloads', async () => {
    const anonymous = await resolveBusinessActor(authCtx(new FakeDb(), null))
    expect(anonymous).toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })

    const actor = await resolveBusinessActor(authCtx(new FakeDb(), sam()), {
      actor: { kind: 'authenticated_owner', clerkUserId: 'browser_supplied' },
      ownerId: 'browser-owner',
      adminId: 'browser-admin',
      clerkUserId: 'browser-clerk',
    })

    expect(actor).toMatchObject({
      kind: 'authenticated_owner',
      clerkUserId: 'user_sam',
      displayName: 'Sam Owner',
      sessionRef: 'clerk|user_sam',
    })
    expect(actor).not.toMatchObject({ clerkUserId: 'browser_supplied' })
  })

  it('fails closed for admin membership once listed memberships were unlisted', async () => {
    const db = new FakeDb()

    await expect(resolveAdminAuthority(authCtx(db, null), 'set_operator_control')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })

    await expect(resolveAdminAuthority(authCtx(db, alex()), 'set_operator_control')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })

    await expect(resolveAdminAuthority(authCtx(db, support()), 'set_operator_control')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })

    await expect(resolveAdminAuthority(authCtx(db, sam()), 'set_operator_control')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })
  })

  it('treats a missing canonical identity as unauthorized', async () => {
    const db = new FakeDb()
    const missingTokenIdentity = {
      subject: 'user_sam',
      issuer: 'https://clerk.example.test',
    } as UserIdentity
    await expect(resolveAdminAuthority(authCtx(db, missingTokenIdentity), 'set_operator_control')).resolves.toEqual({
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


function alex(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_alex',
    subject: 'user_alex',
    issuer: 'https://clerk.example.test',
  }
}

function support(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_support',
    subject: 'user_support',
    issuer: 'https://clerk.example.test',
  }
}

function revoked(): UserIdentity {
  return {
    tokenIdentifier: 'clerk|user_revoked',
    subject: 'user_revoked',
    issuer: 'https://clerk.example.test',
  }
}
