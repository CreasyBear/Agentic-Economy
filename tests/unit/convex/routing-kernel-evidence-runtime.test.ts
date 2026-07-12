import { describe, expect, it } from 'vitest'

import { canonicalAuthorityDigest, createBindingRoutingEvidenceSnapshot } from '@/modules/routing-kernel/public'
import { admitInternal, listCurrent } from '../../../convex/routingKernelEvidence'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
const admit = (admitInternal as unknown as { _handler: (ctx: { db: FakeDb }, args: Record<string, unknown>) => Promise<unknown> })._handler
const list = (listCurrent as unknown as { _handler: (ctx: { db: FakeDb }, args: { networkId: string }) => Promise<unknown> })._handler

describe('routing evidence admission ledger', () => {
  it('admits immutable exact-binding snapshots idempotently and returns only the newest snapshot', async () => {
    const db = database()
    const first = evidence(1_000, 2_000, 700)
    await expect(admit({ db }, { snapshot: first, admittedAt: 1_100 })).resolves.toEqual({ kind: 'admitted', snapshotDigest: first.snapshotDigest })
    await expect(admit({ db }, { snapshot: first, admittedAt: 1_101 })).resolves.toEqual({ kind: 'admitted', snapshotDigest: first.snapshotDigest })

    const second = evidence(1_200, 2_200, 850)
    await expect(admit({ db }, { snapshot: second, admittedAt: 1_300 })).resolves.toEqual({ kind: 'admitted', snapshotDigest: second.snapshotDigest })
    expect(db.rows('routingKernelBindingEvidenceSnapshots')).toHaveLength(2)
    await expect(list({ db }, { networkId: 'registered-businesses' })).resolves.toEqual([
      expect.objectContaining({ snapshotDigest: second.snapshotDigest, standing: expect.objectContaining({ executionReliability: expect.objectContaining({ lowerConfidenceBoundPermille: 850 }) }) }),
    ])
    await db.insert('routingKernelIncidentEvidenceQuarantines', {
      quarantineId: 'quarantine:1', evidenceRef: second.snapshotDigest,
    })
    await expect(list({ db }, { networkId: 'registered-businesses' })).resolves.toEqual([
      expect.objectContaining({ snapshotDigest: first.snapshotDigest }),
    ])
  })

  it('rejects stale, changed-target, malformed, and non-canonical snapshots', async () => {
    const db = database()
    const current = evidence(1_000, 2_000, 700)
    await admit({ db }, { snapshot: current, admittedAt: 1_100 })
    const stale = evidence(900, 2_000, 900)
    await expect(admit({ db }, { snapshot: stale, admittedAt: 1_200 })).resolves.toEqual({ kind: 'refused', reason: 'snapshot_not_newer' })
    await expect(admit({ db }, { snapshot: { ...evidence(1_200, 2_200, 900), bindingRegistrationHash: 'sha256:changed' }, admittedAt: 1_300 }))
      .resolves.toEqual({ kind: 'refused', reason: 'binding_identity_mismatch' })
    await expect(admit({ db }, { snapshot: { ...evidence(1_200, 2_200, 900), snapshotDigest: canonicalAuthorityDigest({ forged: true }) }, admittedAt: 1_300 }))
      .resolves.toEqual({ kind: 'refused', reason: 'snapshot_digest_mismatch' })
    const malformed = evidence(1_200, 2_200, 900)
    await expect(admit({ db }, { snapshot: { ...malformed, incident: { ...malformed.incident, routingEffect: 'freeze', activeIncidentIds: [] } }, admittedAt: 1_300 }))
      .resolves.toEqual({ kind: 'refused', reason: 'snapshot_invalid' })
  })
})

function evidence(observedAt: number, expiresAt: number, reliability: number) {
  return createBindingRoutingEvidenceSnapshot({
    contractVersion: 'routing-evidence:v1', networkId: 'registered-businesses', bindingId: 'binding:labels',
    bindingRegistrationHash: 'sha256:binding-registration', environment: 'https://provider.example',
    networkPolicyVersion: 'network-policy:binding-evidence:v2', estimatorVersion: 'execution-reliability-lcb:v1',
    sourceCommitment: canonicalAuthorityDigest({ runsThrough: observedAt }), observedAt, expiresAt,
    health: { state: 'healthy', evidenceStanding: 'eligible_observed' },
    incident: { routingEffect: 'none', activeIncidentIds: [], evidenceStanding: 'eligible_corroborated' },
    standing: { evidenceStanding: 'eligible_run_bound', executionReliability: { status: 'sufficient', sampleSize: 20, lowerConfidenceBoundPermille: reliability } },
  })
}

function database() {
  return new FakeDb({
    routingKernelBindings: [{
      _id: 'routingKernelBindings:1', _creationTime: 1, bindingId: 'binding:labels', networkId: 'registered-businesses',
      registrationHash: 'sha256:binding-registration', endpointUrl: 'https://provider.example/capability',
    }],
    routingKernelBindingEvidenceSnapshots: [],
    routingKernelIncidentEvidenceQuarantines: [],
  })
}

class FakeDb {
  private readonly tables: Record<string, Row[]>
  constructor(rows: Record<string, Row[]>) { this.tables = structuredClone(rows) }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    const id = `${table}:${rows.length + 1}`
    rows.push({ _id: id, _creationTime: rows.length + 1, ...value })
    return id
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

class FakeQuery {
  private readonly filters: Array<[string, unknown]> = []
  private direction: 'asc' | 'desc' = 'asc'
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (builder: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this }
  order(direction: 'asc' | 'desc') { this.direction = direction; return this }
  private matches() {
    const rows = this.rows.filter((row) => this.filters.every(([field, value]) => row[field] === value))
    return this.direction === 'desc' ? [...rows].reverse() : rows
  }
  async unique() { const rows = this.matches(); if (rows.length > 1) throw new Error('not_unique'); return rows[0] ?? null }
  async first() { return this.matches()[0] ?? null }
  async take(count: number) { return this.matches().slice(0, count) }
}
