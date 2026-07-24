import { describe, expect, it } from 'vitest'
import { ensureGreenfieldOfferingCutover, persistOfferingSourceState } from '../../../convex/catalog'
import type { RuntimeDb, RuntimeDocument } from '../../../convex/source_state'
import type { OfferingSourceState } from '@/modules/catalog/public'

const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }

describe('Offering persistence tenancy', () => {
  it('refuses an Offering ref owned by another business before any write', async () => {
    const db = new CollisionDb({ businessOfferings: [{ _id: 'existing', offeringRef: 'offering:shared', businessId: 'business:other' }] })
    const result = await persistOfferingSourceState(db as unknown as RuntimeDb, 'business:mine', empty, {
      ...empty,
      offerings: [{ offeringRef: 'offering:shared' as never, businessId: 'business:mine' as never, currentRevision: 1, status: 'draft', createdAt: 1, updatedAt: 1 }],
    })
    expect(result).toMatchObject({ kind: 'error', code: 'operation_conflict' })
    expect(db.writes).toBe(0)
  })

  it('refuses an access-path ref owned by another business before any write', async () => {
    const db = new CollisionDb({ offeringAccessPaths: [{ _id: 'existing', accessPathRef: 'access:shared', businessId: 'business:other' }] })
    const result = await persistOfferingSourceState(db as unknown as RuntimeDb, 'business:mine', empty, {
      ...empty,
      accessPaths: [{ accessPathRef: 'access:shared' as never, businessId: 'business:mine' as never, offeringRef: 'offering:mine' as never, offeringRevision: 1, offeringSourceHash: 'hash:o' as never, status: 'draft', descriptor: { kind: 'human_request', channel: 'phone', disclosure: 'Call' }, sourceHash: 'hash:a' as never, createdAt: 1, updatedAt: 1 }],
    })
    expect(result).toMatchObject({ kind: 'error', code: 'operation_conflict' })
    expect(db.writes).toBe(0)
  })

  it('boots a no-legacy business into Offering mode and preserves a legacy business', async () => {
    const greenfield = new CollisionDb({ catalogSupplyCutovers: [], businessServices: [] })
    expect(await ensureGreenfieldOfferingCutover(greenfield as unknown as RuntimeDb, 'business:new', 10)).toBe('created')
    expect(greenfield.tables.catalogSupplyCutovers).toContainEqual(expect.objectContaining({ businessId: 'business:new', mode: 'offering' }))

    const legacy = new CollisionDb({ catalogSupplyCutovers: [], businessServices: [{ _id: 'service:1', businessId: 'business:legacy' }] })
    expect(await ensureGreenfieldOfferingCutover(legacy as unknown as RuntimeDb, 'business:legacy', 10)).toBe('legacy_preserved')
    expect(legacy.tables.catalogSupplyCutovers).toEqual([])
  })
})

class CollisionDb {
  writes = 0
  constructor(readonly tables: Record<string, RuntimeDocument[]>) {}
  query(table: string) {
    let rows = [...(this.tables[table] ?? [])]
    const query = { withIndex: (_: string, select: (builder: any) => unknown) => { const builder = { eq: (field: string, value: unknown) => { rows = rows.filter((row) => row[field] === value); return builder } }; select(builder); return query }, unique: async () => rows.length === 1 ? rows[0]! : null, collect: async () => rows }
    return query
  }
  async insert(table: string, value: Record<string, unknown>) { this.writes++; (this.tables[table] ??= []).push({ _id: `${table}:new`, ...value }); return `${table}:new` }
  async patch() { this.writes++ }
  async get() { return null }
}
