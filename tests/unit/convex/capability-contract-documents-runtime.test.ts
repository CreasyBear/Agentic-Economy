import { describe, expect, it } from 'vitest'

import {
  getActiveExactInternal,
  register,
} from '../../../convex/capabilityContractDocuments'
import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Context = { db: FakeDb }
type PublicContext = Context & { auth: { getUserIdentity: () => Promise<Record<string, unknown> | null> } }

const getHandler = (getActiveExactInternal as unknown as {
  _handler: (ctx: Context, args: { capabilityId: string; version: number; contractDigest: string }) => Promise<unknown>
})._handler
const publicRegisterHandler = (register as unknown as {
  _handler: (ctx: PublicContext, args: PublicRegistrationArgs) => Promise<unknown>
})._handler

describe('V2 capability contract Convex registry', () => {
  it('registers one immutable identity slot and replays exact material', async () => {
    const db = new FakeDb()
    const owner = ownerContext(db)
    const documentJson = JSON.stringify(capabilityContractV2())
    const first = await publicRegisterHandler(owner, publicArgs(documentJson))
    const replay = await publicRegisterHandler(owner, publicArgs(documentJson))

    expect(first).toMatchObject({
      kind: 'registered',
      ref: { capabilityId: 'reference.lookup', version: 1, contractDigest: expect.stringMatching(/^sha256:/) },
    })
    expect(replay).toMatchObject({
      kind: 'registered',
      ref: { capabilityId: 'reference.lookup', version: 1, contractDigest: expect.stringMatching(/^sha256:/) },
    })
    expect(db.rows('capabilityContractDocuments')).toHaveLength(1)
  })

  it('refuses changed semantics in the same ID and version slot', async () => {
    const db = new FakeDb()
    const owner = ownerContext(db)
    await publicRegisterHandler(owner, publicArgs(JSON.stringify(capabilityContractV2())))

    await expect(publicRegisterHandler(owner, {
      ...publicArgs(JSON.stringify(capabilityContractV2({ name: 'Changed semantics' }))),
      operationKey: 'op:capability-contract:register:changed',
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
    expect(db.rows('capabilityContractDocuments')).toHaveLength(1)
  })

  it('resolves only an active, intact exact reference', async () => {
    const db = new FakeDb()
    const registered = await publicRegisterHandler(
      ownerContext(db),
      publicArgs(JSON.stringify(capabilityContractV2())),
    ) as { kind: 'registered'; ref: { capabilityId: string; version: number; contractDigest: string } }

    await expect(getHandler({ db }, registered.ref)).resolves.toMatchObject({
      kind: 'found', ref: registered.ref, registeredAt: expect.any(Number),
    })
    await expect(getHandler({ db }, { ...registered.ref, version: 2 })).resolves.toEqual({
      kind: 'unavailable', reason: 'not_found',
    })
    await expect(getHandler({ db }, {
      ...registered.ref, contractDigest: `sha256:${'0'.repeat(64)}`,
    })).resolves.toEqual({ kind: 'unavailable', reason: 'not_found' })

    db.patchFirst('capabilityContractDocuments', { documentJson: '{' })
    await expect(getHandler({ db }, registered.ref)).resolves.toEqual({
      kind: 'unavailable', reason: 'integrity_failure',
    })
  })

  it('stores the canonical document, not caller formatting or a derived ref', async () => {
    const db = new FakeDb()
    const owner = ownerContext(db)
    const input = capabilityContractV2()
    const expected = encodeCapabilityContractDocument(input)
    await publicRegisterHandler(owner, publicArgs(JSON.stringify(input, null, 2)))

    expect(db.rows('capabilityContractDocuments')[0]).toMatchObject({
      capabilityId: expected.contract.ref.capabilityId,
      version: expected.contract.ref.version,
      contractDigest: expected.contract.ref.contractDigest,
      documentJson: expected.documentJson,
      status: 'active',
    })
    expect(JSON.parse(String(db.rows('capabilityContractDocuments')[0]?.documentJson))).not.toHaveProperty('ref')
  })

  it('requires the dedicated owner-admin authority on the public writer', async () => {
    const anonymousDb = new FakeDb()
    await expect(publicRegisterHandler({
      db: anonymousDb,
      auth: { getUserIdentity: async () => null },
    }, publicArgs(JSON.stringify(capabilityContractV2())))).resolves.toEqual({
      kind: 'refused', reason: 'authorization_denied',
    })
    expect(anonymousDb.rows('capabilityContractDocuments')).toHaveLength(0)

    const ownerDb = new FakeDb()
    const owner = ownerContext(ownerDb)
    await expect(publicRegisterHandler(owner, publicArgs(JSON.stringify(capabilityContractV2())))).resolves.toMatchObject({
      kind: 'registered', ref: { capabilityId: 'reference.lookup', version: 1 },
    })
    expect(ownerDb.rows('capabilityContractDocuments')).toHaveLength(1)
    expect(ownerDb.rows('auditEvents')[0]).toMatchObject({
      eventType: 'capability_contract.registered', actorKind: 'admin', actorRef: 'user_owner',
    })
    expect(ownerDb.rows('operationKeys')[0]).toMatchObject({
      actorRef: 'user_owner', operationName: 'registerCapabilityContract', status: 'succeeded',
    })

    await expect(publicRegisterHandler(owner, publicArgs(JSON.stringify(capabilityContractV2()))))
      .resolves.toMatchObject({ kind: 'registered' })
    expect(ownerDb.rows('capabilityContractDocuments')).toHaveLength(1)
    expect(ownerDb.rows('auditEvents')).toHaveLength(1)
    expect(ownerDb.rows('operationKeys')).toHaveLength(1)

    await expect(publicRegisterHandler(owner, {
      ...publicArgs(JSON.stringify(capabilityContractV2())),
      reasonCode: 'changed_reason_under_same_key',
    })).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    await expect(publicRegisterHandler(owner, publicArgs(JSON.stringify(capabilityContractV2({ capabilityId: 'reference.other' })))))
      .resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })
    expect(ownerDb.rows('capabilityContractDocuments')).toHaveLength(1)
  })

  it('rejects oversized raw registration material before parsing it', async () => {
    const db = new FakeDb()
    await expect(publicRegisterHandler(ownerContext(db), publicArgs(`${' '.repeat(300_001)}{}`)))
      .resolves.toEqual({ kind: 'refused', reason: 'contract_too_large' })
    expect(db.rows('capabilityContractDocuments')).toHaveLength(0)
  })

  it('refuses incomplete audit and idempotency context before any write', async () => {
    const db = new FakeDb()
    await expect(publicRegisterHandler(ownerContext(db), {
      ...publicArgs(JSON.stringify(capabilityContractV2())), evidenceRefs: [],
    })).resolves.toEqual({
      kind: 'refused', reason: 'registration_context_invalid',
    })
    expect(db.rows('capabilityContractDocuments')).toHaveLength(0)
    expect(db.rows('operationKeys')).toHaveLength(0)
    expect(db.rows('auditEvents')).toHaveLength(0)
  })
})

class FakeDb {
  private readonly tables: Record<string, Row[]> = {
    capabilityContractDocuments: [], adminMemberships: [], auditEvents: [], operationKeys: [],
  }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    rows.push({ _id: `${table}:${rows.length + 1}`, _creationTime: rows.length + 1, ...value })
    return `${table}:${rows.length}`
  }
  async patch(id: string, value: Record<string, unknown>) {
    for (const rows of Object.values(this.tables)) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) { Object.assign(row, value); return }
    }
    throw new Error('row_not_found')
  }
  patchFirst(table: string, value: Record<string, unknown>) { Object.assign(this.tables[table]?.[0] ?? {}, value) }
  seed(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    rows.push({ _id: `${table}:${rows.length + 1}`, _creationTime: rows.length + 1, ...value })
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

type PublicRegistrationArgs = Readonly<{
  documentJson: string
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>

function publicArgs(documentJson: string): PublicRegistrationArgs {
  return {
    documentJson,
    operationKey: 'op:capability-contract:register',
    correlationId: 'corr:capability-contract:register',
    reasonCode: 'source_test_registration',
    evidenceRefs: ['test:capability-contract-registry'],
  }
}

function ownerContext(db: FakeDb): PublicContext {
  db.seed('adminMemberships', {
    clerkUserId: 'user_owner', tokenIdentifier: 'token_owner', role: 'owner_admin', state: 'active',
    grantedBy: 'bootstrap', grantedAt: 1,
  })
  return {
    db,
    auth: { getUserIdentity: async () => ({
      subject: 'user_owner', issuer: 'https://identity.example', tokenIdentifier: 'token_owner',
    }) },
  }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  async unique() {
    const rows = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    if (rows.length > 1) throw new Error('not_unique')
    return rows[0] ?? null
  }
}
