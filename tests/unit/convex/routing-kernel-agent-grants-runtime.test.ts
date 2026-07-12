import { describe, expect, it } from 'vitest'

import { register, registerInternal, resolve, revoke, revokeInternal } from '../../../convex/routingKernelAgentGrants'

type Row = Record<string, unknown> & { _id: string }
type Ctx = { db: FakeDb; auth: { getUserIdentity: () => Promise<ReturnType<typeof identity> | null> } }
const registerHandler = (register as unknown as { _handler: (ctx: Ctx, args: any) => Promise<any> })._handler
const registerInternalHandler = (registerInternal as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<any> })._handler
const revokeHandler = (revoke as unknown as { _handler: (ctx: Ctx, args: any) => Promise<any> })._handler
const revokeInternalHandler = (revokeInternal as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<any> })._handler
const resolveHandler = (resolve as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<any> })._handler

describe('routing-kernel external-agent grants', () => {
  it('binds one WBA agent identity to bounded principal authority and revokes it by hash', async () => {
    const db = database()
    const ctx = { db, auth: { getUserIdentity: async () => identity() } }
    const registered = await registerHandler(ctx, { grant: grant() })
    expect(registered).toMatchObject({ kind: 'registered', grantId: 'grant:tracer', grantHash: expect.any(String) })
    expect(registered.grantHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    await expect(resolveHandler({ db }, { agentId: 'agent:https://agent.example:key-1', networkId: 'registered-businesses', now: 2_000 })).resolves.toMatchObject({
      principalId: 'principal:tracer', maximumSpendMinor: 125, currency: 'AUD', allowedDataFields: ['scenario'], status: 'active',
    })
    await expect(resolveHandler({ db }, { agentId: 'agent:https://agent.example:key-1', networkId: 'other', now: 2_000 })).resolves.toBeNull()

    const revoked = await revokeHandler(ctx, { grantId: 'grant:tracer', expectedGrantHash: registered.grantHash, evidenceRefs: ['evidence:revoked'] })
    expect(revoked).toMatchObject({ kind: 'revoked', grantId: 'grant:tracer' })
    expect(revoked.grantHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    await expect(resolveHandler({ db }, { agentId: 'agent:https://agent.example:key-1', now: 2_000 })).resolves.toBeNull()
  })

  it('rejects non-admin registration and expired grants', async () => {
    const db = database('support')
    await expect(registerHandler({ db, auth: { getUserIdentity: async () => identity() } }, { grant: grant() })).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })
    expect(db.rows('routingKernelAgentGrants')).toEqual([])
  })

  it('ignores expired active rows but refuses two concurrently valid grants for one agent', async () => {
    const db = database()
    const now = Date.now()
    await registerInternalHandler({ db }, {
      grant: { ...grant(), grantId: 'grant:expired', expiresAt: now + 1_000 }, issuedAt: now,
    })
    await registerInternalHandler({ db }, {
      grant: { ...grant(), grantId: 'grant:current', expiresAt: now + 5_000 }, issuedAt: now,
    })
    await expect(resolveHandler({ db }, {
      agentId: 'agent:https://agent.example:key-1', networkId: 'registered-businesses', now: now + 2_500,
    })).resolves.toMatchObject({ grantId: 'grant:current', principalId: 'principal:tracer' })
    await registerInternalHandler({ db }, {
      grant: { ...grant(), grantId: 'grant:also-current', expiresAt: now + 6_000 }, issuedAt: now,
    })
    await expect(resolveHandler({ db }, {
      agentId: 'agent:https://agent.example:key-1', networkId: 'registered-businesses', now: now + 2_500,
    })).resolves.toBeNull()
  })

  it('provisions the same validated grant and cumulative authorities through the internal operator seam', async () => {
    const db = database()
    await expect(registerInternalHandler({ db }, { grant: grant(), issuedAt: 1_000 })).resolves.toMatchObject({ kind: 'registered', grantId: 'grant:tracer' })
    expect(db.rows('routingKernelBudgetAuthorities')).toEqual([expect.objectContaining({ budgetContract: 'cumulative_v1', maximumGrossMinor: 125, reservedGrossMinor: 0 })])
    expect(db.rows('routingKernelDataAuthorizationBudgets')).toEqual([expect.objectContaining({ dataContract: 'cumulative_v1', maximumAttempts: 2, reservedAttempts: 0, consumedAttempts: 0 })])
    const registered = db.rows('routingKernelAgentGrants')[0]
    await expect(revokeInternalHandler({ db }, {
      grantId: 'grant:tracer', expectedGrantHash: registered?.grantHash,
      evidenceRefs: ['evidence:hosted-trace-complete'], revokedAt: 2_000,
    })).resolves.toMatchObject({ kind: 'revoked', grantId: 'grant:tracer' })
    expect(db.rows('routingKernelBudgetAuthorities')).toEqual([expect.objectContaining({ status: 'revoked' })])
    expect(db.rows('routingKernelDataAuthorizationBudgets')).toEqual([expect.objectContaining({ status: 'revoked' })])
  })

  it('refuses a grant whose stored authority fields no longer match its digest', async () => {
    const db = database()
    const registered = await registerInternalHandler({ db }, { grant: grant(), issuedAt: 1_000 })
    const row = db.rows('routingKernelAgentGrants')[0]
    if (row === undefined) throw new Error('grant_missing')
    await db.patch(row._id, { maximumSpendMinor: 999_999 })
    await expect(resolveHandler({ db }, {
      agentId: 'agent:https://agent.example:key-1', networkId: 'registered-businesses', now: 2_000,
    })).resolves.toBeNull()
    await expect(revokeInternalHandler({ db }, {
      grantId: 'grant:tracer', expectedGrantHash: registered.grantHash,
      evidenceRefs: ['evidence:tamper-detected'], revokedAt: 2_000,
    })).resolves.toEqual({ kind: 'refused', reason: 'grant_changed' })
  })
})

function grant() {
  return { grantId: 'grant:tracer', agentId: 'agent:https://agent.example:key-1', principalId: 'principal:tracer', networkIds: ['registered-businesses'], maximumSpendMinor: 125, currency: 'AUD', allowedDataFields: ['scenario'], protectedFieldSetId: 'field-set:tracer:v1', maximumDisclosureAttempts: 2, maximumDisclosureExposures: 2, allowedRecipientBindingIds: ['binding:tracer:v1'], allowedDisclosurePurposes: ['capability:tracer:v1'], expiresAt: Date.now() + 60_000, evidenceRefs: ['evidence:operator-grant'] }
}
function identity() { return { issuer: 'https://clerk.example', subject: 'admin_1', tokenIdentifier: 'token:admin_1' } }
function database(role: 'owner_admin' | 'support' = 'owner_admin') {
  return new FakeDb({ routingKernelAgentGrants: [], routingKernelBudgetAuthorities: [], routingKernelDataAuthorizationBudgets: [], adminMemberships: [{ _id: 'admin:1', clerkUserId: 'admin_1', tokenIdentifier: 'token:admin_1', role, state: 'active', grantedBy: 'bootstrap', grantedAt: 1 }] })
}

class FakeDb {
  constructor(private readonly tables: Record<string, Row[]>) { this.tables = structuredClone(tables) }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) { const rows = this.tables[table] ?? (this.tables[table] = []); const id = `${table}:${rows.length + 1}`; rows.push({ _id: id, ...value }); return id }
  async patch(id: string, value: Record<string, unknown>) { const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id); if (row === undefined) throw new Error('row_not_found'); Object.assign(row, value) }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}
class FakeQuery {
  private filters: Array<[string, unknown]> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  private matches() { return this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value)) }
  async unique() { const rows = this.matches(); if (rows.length > 1) throw new Error('not_unique'); return rows[0] ?? null }
  async take(limit: number) { return this.matches().slice(0, limit) }
  async collect() { return this.matches() }
}
