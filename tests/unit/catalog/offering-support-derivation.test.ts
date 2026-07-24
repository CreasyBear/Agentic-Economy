import { describe, expect, it } from 'vitest'
import { deriveBusinessOfferingSupportFromCapabilitySupply, rebuildBusinessSupplyProjectionSnapshotCommand } from '../../../convex/catalogSupplyProjection'
import type { RuntimeDb, RuntimeDocument } from '../../../convex/source_state'

describe('catalogue support derivation', () => {
  it('removes routeability when readiness expires or the declared origin is withdrawn', async () => {
    const db = new MemoryDb(seed())
    expect(await deriveBusinessOfferingSupportFromCapabilitySupply(db as unknown as RuntimeDb, 'business:1', 100)).toMatchObject({
      'offering:1': { integrated: true, routeable: true, validUntil: 200 },
    })
    expect(await deriveBusinessOfferingSupportFromCapabilitySupply(db as unknown as RuntimeDb, 'business:1', 201)).toMatchObject({
      'offering:1': { integrated: true, routeable: false },
    })
    db.tables.offeringAccessPaths![0]!.status = 'withdrawn'
    expect(await deriveBusinessOfferingSupportFromCapabilitySupply(db as unknown as RuntimeDb, 'business:1', 100)).toEqual({})
  })

  it('marks the prior snapshot pending when a current Offering revision is missing', async () => {
    const db = new MemoryDb({
      businesses: [{ _id: 'business:1', publicStatus: 'published', slug: 'one', name: 'One', updatedAt: 1 }],
      businessContexts: [{ _id: 'context:1', businessId: 'business:1', category: 'Data', suburb: 'Perth', stateTerritory: 'WA' }],
      businessOfferings: [{ _id: 'o', businessId: 'business:1', offeringRef: 'offering:1', currentRevision: 2, status: 'published', createdAt: 1, updatedAt: 2 }],
      businessOfferingRevisions: [], offeringAccessPaths: [], suppressionRules: [],
      operatorControls: [{ _id: 'control', key: 'offering_public_projection_enabled', enabled: true }],
      businessSupplyProjectionSnapshots: [{ _id: 'snapshot', businessId: 'business:1', status: 'current', disposition: 'current', projectionJson: '{"old":true}' }],
      operationKeys: [],
    })
    expect(await rebuildBusinessSupplyProjectionSnapshotCommand(db as unknown as RuntimeDb, 'business:1', {}, 10)).toEqual({ kind: 'error', code: 'offering_revision_missing' })
    expect(db.tables.businessSupplyProjectionSnapshots![0]).toMatchObject({ status: 'projection_pending', disposition: 'stale', projectionJson: '{"old":true}' })
  })
})

function seed(): Record<string, RuntimeDocument[]> {
  return {
    capabilityOfferings: [{ _id: 'co', businessId: 'business:1', status: 'active', offeringId: 'co:1', origin: { kind: 'catalog_offering', offeringRef: 'offering:1', offeringRevision: 1, offeringSourceHash: 'hash:o', declaredAccessPathRef: 'access:1', accessPathSourceHash: 'hash:a' } }],
    businessOfferings: [{ _id: 'o', businessId: 'business:1', offeringRef: 'offering:1', currentRevision: 1, status: 'published' }],
    businessOfferingRevisions: [{ _id: 'r', businessId: 'business:1', offeringRef: 'offering:1', revision: 1, sourceHash: 'hash:o' }],
    offeringAccessPaths: [{ _id: 'a', accessPathRef: 'access:1', status: 'published', sourceHash: 'hash:a' }],
    capabilityTransportBindings: [{ _id: 'b', offeringId: 'co:1', bindingId: 'binding:1', admission: 'admitted', conformance: 'conformant' }],
    capabilityPublications: [{ _id: 'p', bindingId: 'binding:1', disposition: 'current', credentialState: 'ready', healthState: 'healthy', readinessObservedAt: 90, readinessValidUntil: 200 }],
  }
}

class MemoryDb {
  constructor(readonly tables: Record<string, RuntimeDocument[]>) {}
  async get(id: string) { return Object.values(this.tables).flat().find((row) => row._id === id) ?? null }
  async insert(table: string, value: Record<string, unknown>) { const id = `${table}:new`; (this.tables[table] ??= []).push({ _id: id, ...value }); return id }
  async patch(id: string, value: Record<string, unknown>) { const row = Object.values(this.tables).flat().find((item) => item._id === id); if (row) Object.assign(row, value) }
  query(table: string) {
    let rows = [...(this.tables[table] ?? [])]
    const query = {
      withIndex: (_name: string, select: (builder: { eq: (field: string, value: unknown) => typeof builder }) => unknown) => {
        const builder = { eq: (field: string, value: unknown) => { rows = rows.filter((row) => row[field] === value); return builder } }
        select(builder)
        return query
      },
      collect: async () => rows,
      unique: async () => rows.length === 1 ? rows[0]! : null,
    }
    return query
  }
}
