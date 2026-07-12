import { describe, expect, it } from 'vitest'

import { admit, recoverySnapshot, release } from '../../../convex/routingKernelAdmission'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Ctx = { db: FakeDb }
const admitHandler = (admit as unknown as { _handler: (ctx: Ctx, args: AdmissionArgs) => Promise<AdmissionResult> })._handler
const releaseHandler = (release as unknown as { _handler: (ctx: Ctx, args: { requestId: string; releasedAt: number }) => Promise<unknown> })._handler
const recoverySnapshotHandler = (recoverySnapshot as unknown as { _handler: (ctx: Ctx, args: { observedAt: number }) => Promise<any> })._handler

describe('routing-kernel transactional admission', () => {
  it('enforces per-agent saturation atomically and releases capacity explicitly', async () => {
    const db = database()
    const now = 1_783_818_000_000
    for (let index = 0; index < 8; index += 1) {
      await expect(admitHandler({ db }, input(`request-${index}`, now + index))).resolves.toMatchObject({ kind: 'admitted' })
    }
    await expect(admitHandler({ db }, input('request-saturated', now + 10))).resolves.toEqual({ kind: 'refused', reason: 'agent_saturated', retryAfterMs: 29_990 })

    await releaseHandler({ db }, { requestId: 'request-0', releasedAt: now + 11 })
    await expect(admitHandler({ db }, input('request-after-release', now + 12))).resolves.toMatchObject({ kind: 'admitted' })
    expect(db.rows('routingKernelAdmissionDecisions').at(-2)).toMatchObject({ disposition: 'refused', reason: 'agent_saturated' })
    expect(db.rows('routingKernelAdmissionDecisions')[0]).toMatchObject({ originDurationMs: 11, providerWaitMs: 0, kernelTimeMs: 11 })
    await expect(recoverySnapshotHandler({ db }, { observedAt: now + 12 })).resolves.toMatchObject({
      schemaVersion: 'routing-admission-recovery:v1',
      metrics: { sampleSize: 1, kernelTimeP95Ms: 11, providerWaitP95Ms: 0, saturationRefusals: 1 },
      alerts: [{ code: 'kernel_saturated', severity: 'critical', observedValue: 1, threshold: 0 }],
    })
  })

  it('enforces the fixed-window agent quota even after leases are released', async () => {
    const db = database()
    const now = 1_783_818_000_000
    for (let index = 0; index < 30; index += 1) {
      const requestId = `execute-${index}`
      await expect(admitHandler({ db }, input(requestId, now + index))).resolves.toMatchObject({ kind: 'admitted' })
      await releaseHandler({ db }, { requestId, releasedAt: now + index + 1 })
    }
    await expect(admitHandler({ db }, input('execute-over-quota', now + 40))).resolves.toEqual({ kind: 'refused', reason: 'agent_quota_exceeded', retryAfterMs: 59_960 })
  })
})

type AdmissionArgs = { requestId: string; agentId: string; operation: 'execute'; admittedAt: number }
type AdmissionResult = { kind: 'admitted'; requestId: string; expiresAt: number } | { kind: 'refused'; reason: string; retryAfterMs: number }
function input(requestId: string, admittedAt: number): AdmissionArgs { return { requestId, agentId: 'agent:test', operation: 'execute', admittedAt } }
function database() { return new FakeDb({ routingKernelAdmissionMeters: [], routingKernelAdmissionLeases: [], routingKernelAdmissionDecisions: [], routingKernelProviderTelemetry: [] }) }

class FakeDb {
  private sequence = 0
  constructor(private readonly tables: Record<string, Row[]>) { this.tables = structuredClone(tables) }
  query(table: string) { return new FakeQuery(this.tables[table] ?? []) }
  async insert(table: string, value: Record<string, unknown>) {
    const rows = this.tables[table] ?? (this.tables[table] = [])
    this.sequence += 1
    const id = `${table}:${this.sequence}`
    rows.push({ _id: id, _creationTime: this.sequence, ...value })
    return id
  }
  async patch(id: string, value: Record<string, unknown>) {
    const row = Object.values(this.tables).flat().find((candidate) => candidate._id === id)
    if (row === undefined) throw new Error('row_not_found')
    Object.assign(row, value)
  }
  rows(table: string) { return structuredClone(this.tables[table] ?? []) }
}

class FakeQuery {
  private predicates: Array<(row: Row) => boolean> = []
  constructor(private readonly rows: Row[]) {}
  withIndex(_name: string, callback: (query: FakeQuery) => FakeQuery) { return callback(this) }
  eq(field: string, value: unknown) { this.predicates.push((row) => row[field] === value); return this }
  gte(field: string, value: number) { this.predicates.push((row) => typeof row[field] === 'number' && row[field] >= value); return this }
  private matches() { return this.rows.filter((row) => this.predicates.every((predicate) => predicate(row))) }
  async unique() { const rows = this.matches(); if (rows.length > 1) throw new Error('not_unique'); return rows[0] ?? null }
  async take(limit: number) { return this.matches().slice(0, limit) }
}
