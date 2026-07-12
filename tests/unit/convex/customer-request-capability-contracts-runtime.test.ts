import { describe, expect, it } from 'vitest'

import { listActiveInternal, registerInternal } from '../../../convex/customerRequestCapabilityContracts'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Contract = ReturnType<typeof contract>
type Context = { db: FakeDb }

const registerHandler = (registerInternal as unknown as {
  _handler: (ctx: Context, args: { contract: Contract; registeredAt: number }) => Promise<unknown>
})._handler
const listHandler = (listActiveInternal as unknown as {
  _handler: (ctx: Context, args: Record<string, never>) => Promise<unknown>
})._handler

describe('customer request capability contract registry', () => {
  it('registers one immutable version and replays the same contract', async () => {
    const db = new FakeDb()
    const first = await registerHandler({ db }, { contract: contract(), registeredAt: 1_000 })
    const replay = await registerHandler({ db }, { contract: contract(), registeredAt: 2_000 })

    expect(first).toMatchObject({ kind: 'registered', capabilityContractId: 'reference.option.quote:v1', contractDigest: expect.stringMatching(/^sha256:/) })
    expect(replay).toEqual(first)
    expect(db.rows('customerRequestCapabilityContracts')).toHaveLength(1)
    await expect(listHandler({ db }, {})).resolves.toEqual([contract()])
  })

  it('refuses changed material under the same versioned identity', async () => {
    const db = new FakeDb()
    await registerHandler({ db }, { contract: contract(), registeredAt: 1_000 })

    await expect(registerHandler({ db }, {
      contract: { ...contract(), name: 'Changed after publication' }, registeredAt: 2_000,
    })).resolves.toEqual({ kind: 'refused', reason: 'contract_identity_conflict' })
    expect(db.rows('customerRequestCapabilityContracts')).toHaveLength(1)
  })
})

function contract() {
  return {
    capabilityContractId: 'reference.option.quote:v1', name: 'Prepare a reference option', operation: 'quote' as const,
    input: {
      requestContext: { valueType: 'string' as const, customerLabel: 'Request details', required: true, decisionRelevance: 'option_selection' as const },
    },
    output: {
      offerRef: { valueType: 'provider_offer_ref' as const, customerLabel: 'Business option', required: true, decisionRelevance: 'option_selection' as const, evidenceRole: 'provider_offer' as const },
    },
    consequence: { commitment: 'none' as const, spend: 'none' as const, reversibility: 'not_applicable' as const, approval: 'none' as const },
  }
}

class FakeDb {
  private readonly tables: Record<string, Row[]> = { customerRequestCapabilityContracts: [] }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    rows.push({ _id: `${table}:${rows.length + 1}`, _creationTime: rows.length + 1, ...value })
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  async unique() {
    const rows = this.filtered()
    if (rows.length > 1) throw new Error('not_unique')
    return rows[0] ?? null
  }
  async take(limit: number) { return this.filtered().slice(0, limit) }
  private filtered() { return this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value)) }
}
