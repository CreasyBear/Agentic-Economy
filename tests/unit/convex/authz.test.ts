import type { UserIdentity } from 'convex/server'
import { describe, expect, it } from 'vitest'

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

type AuthCtx = {
  db: Db
  auth: { getUserIdentity: () => Promise<UserIdentity | null> }
}

describe('Convex authz helpers', () => {
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

  it('requires active source-owned admin membership and the role/action matrix', async () => {
    const db = new FakeDb()
    db.seed('adminMemberships', {
      _id: 'adminMemberships:owner',
      _creationTime: 1,
      clerkUserId: 'user_sam',
      role: 'owner_admin',
      state: 'active',
      grantedBy: 'bootstrap:user_sam',
      grantedAt: 1,
      evidenceRef: 'evidence:bootstrap',
    })
    db.seed('adminMemberships', {
      _id: 'adminMemberships:support',
      _creationTime: 2,
      clerkUserId: 'user_support',
      role: 'support',
      state: 'active',
      grantedBy: 'user_sam',
      grantedAt: 2,
      evidenceRef: 'evidence:support',
    })
    db.seed('adminMemberships', {
      _id: 'adminMemberships:revoked',
      _creationTime: 3,
      clerkUserId: 'user_revoked',
      role: 'owner_admin',
      state: 'revoked',
      grantedBy: 'user_sam',
      grantedAt: 2,
      revokedBy: 'user_sam',
      revokedAt: 3,
    })

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
      reason: 'action_not_allowed',
    })

    await expect(resolveAdminAuthority(authCtx(db, revoked()), 'set_operator_control')).resolves.toEqual({
      kind: 'denied',
      reason: 'missing_membership',
    })

    const allowed = await resolveAdminAuthority(authCtx(db, sam()), 'set_operator_control')
    expect(allowed).toMatchObject({
      kind: 'allowed',
      membership: {
        clerkUserId: 'user_sam',
        role: 'owner_admin',
        state: 'active',
      },
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
    db,
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
