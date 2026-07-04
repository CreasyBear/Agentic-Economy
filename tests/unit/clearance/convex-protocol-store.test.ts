import { describe, expect, it } from 'vitest'

import {
  commitClearanceGatewayCheck,
  commitClearanceIsolationState,
  consumeClearanceGreenlight,
  putClearanceRecordIfAbsentOrSame,
  recordClearanceProofGap,
} from '@/modules/clearance/internal/convex-protocol-store'

const NOW = 1_804_150_000

const baseGreenlight = {
  recordId: 'greenlight:001',
  recordKind: 'greenlight',
  status: 'accepted',
  principalId: 'principal:wba:agent-one',
  actionClass: 'business_action',
  actionRef: 'business-action:provision-paid-intake-endpoint',
  mandateId: 'mandate:001',
  requestRef: 'request:001',
  idempotencyKey: 'idem:greenlight:001',
  createdAt: NOW - 60,
  expiresAt: NOW + 600,
  payloadHash: 'hash:greenlight-payload-001',
  signaturePosture: 'local_hmac',
  keyIdentityRef: 'clearance-key:local:001',
  signedAt: '2026-07-04T12:00:00.000Z',
  signature: 'signature:greenlight:001',
} as const

describe('ConvexProtocolStore clearance record operations', () => {
  it('inserts an absent record and replays the same idempotent payload without duplicating source rows', async () => {
    const db = new FakeDb()

    await expect(putClearanceRecordIfAbsentOrSame(db, baseGreenlight)).resolves.toMatchObject({
      kind: 'inserted',
      record: expect.objectContaining({
        recordId: 'greenlight:001',
        idempotencyKey: 'idem:greenlight:001',
        payloadHash: 'hash:greenlight-payload-001',
      }),
    })

    await expect(putClearanceRecordIfAbsentOrSame(db, { ...baseGreenlight })).resolves.toMatchObject({
      kind: 'replayed',
      record: expect.objectContaining({ recordId: 'greenlight:001' }),
    })

    expect(db.rowsFor('handshakeRecords')).toHaveLength(1)
  })

  it('rejects a conflicting replay for the same record or idempotency key', async () => {
    const db = new FakeDb()
    await putClearanceRecordIfAbsentOrSame(db, baseGreenlight)

    await expect(
      putClearanceRecordIfAbsentOrSame(db, {
        ...baseGreenlight,
        payloadHash: 'hash:tampered-payload',
      }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_record_conflict',
      record: expect.objectContaining({ payloadHash: 'hash:greenlight-payload-001' }),
    })

    await expect(
      putClearanceRecordIfAbsentOrSame(db, {
        ...baseGreenlight,
        recordId: 'greenlight:conflicting-id',
        payloadHash: 'hash:other-record-same-idempotency-key',
      }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_record_conflict',
      record: expect.objectContaining({ idempotencyKey: 'idem:greenlight:001' }),
    })

    expect(db.rowsFor('handshakeRecords')).toHaveLength(1)
  })

  it('consumes one accepted greenlight exactly once and persists the consume marker', async () => {
    const db = new FakeDb()
    await putClearanceRecordIfAbsentOrSame(db, baseGreenlight)

    await expect(consumeClearanceGreenlight(db, consumeCommand())).resolves.toMatchObject({
      kind: 'consumed',
      record: expect.objectContaining({
        recordId: 'greenlight:001',
        consumedAt: NOW,
        consumedByRef: 'gate-attempt:001',
      }),
    })

    expect(db.rowsFor('handshakeRecords')).toEqual([
      expect.objectContaining({
        recordId: 'greenlight:001',
        status: 'consumed',
        consumedAt: NOW,
        consumedByRef: 'gate-attempt:001',
      }),
    ])

    await expect(consumeClearanceGreenlight(db, consumeCommand({ consumedByRef: 'gate-attempt:replay' }))).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_greenlight_replay_rejected',
      record: expect.objectContaining({ consumedByRef: 'gate-attempt:001' }),
    })
  })

  it.each([
    {
      name: 'missing greenlight',
      seed: undefined,
      command: consumeCommand({ greenlightRef: 'greenlight:missing' }),
      expected: 'clearance_greenlight_required',
    },
    {
      name: 'receipt record',
      seed: { ...baseGreenlight, recordKind: 'receipt' as const, recordId: 'receipt:001' } as const,
      command: consumeCommand({ greenlightRef: 'receipt:001' }),
      expected: 'clearance_greenlight_kind_mismatch',
    },
    {
      name: 'wrong principal',
      seed: baseGreenlight,
      command: consumeCommand({ principalId: 'principal:wba:other-agent' }),
      expected: 'clearance_greenlight_principal_mismatch',
    },
    {
      name: 'wrong action',
      seed: baseGreenlight,
      command: consumeCommand({ actionRef: 'business-action:other' }),
      expected: 'clearance_greenlight_action_mismatch',
    },
    {
      name: 'expired greenlight',
      seed: { ...baseGreenlight, expiresAt: NOW - 1 } as const,
      command: consumeCommand(),
      expected: 'clearance_greenlight_expired',
    },
    {
      name: 'proof-gap greenlight',
      seed: { ...baseGreenlight, status: 'proof_gap' as const, proofGapReason: 'missing_provider_evidence' } as const,
      command: consumeCommand(),
      expected: 'clearance_greenlight_not_accepted',
    },
  ])('rejects $name consume without mutating the source row', async ({ seed, command, expected }) => {
    const db = new FakeDb()
    if (seed !== undefined) {
      await putClearanceRecordIfAbsentOrSame(db, seed)
    }

    await expect(consumeClearanceGreenlight(db, command)).resolves.toMatchObject({
      kind: 'rejected',
      reason: expected,
    })

    expect(db.allRows().some((row) => row.consumedAt !== undefined || row.consumedByRef !== undefined)).toBe(false)
  })

  it('persists terminal proof-gap records idempotently and rejects conflicting proof-gap payloads', async () => {
    const db = new FakeDb()
    const proofGap = {
      ...baseGreenlight,
      recordId: 'greenlight:proof-gap',
      status: 'proof_gap',
      proofGapReason: 'missing_provider_evidence',
      idempotencyKey: 'idem:greenlight:proof-gap',
      payloadHash: 'hash:proof-gap-payload',
    } as const

    await expect(recordClearanceProofGap(db, proofGap)).resolves.toMatchObject({
      kind: 'inserted',
      record: expect.objectContaining({
        recordId: 'greenlight:proof-gap',
        status: 'proof_gap',
        proofGapReason: 'missing_provider_evidence',
      }),
    })

    await expect(recordClearanceProofGap(db, { ...proofGap })).resolves.toMatchObject({
      kind: 'replayed',
      record: expect.objectContaining({ recordId: 'greenlight:proof-gap' }),
    })

    await expect(
      recordClearanceProofGap(db, {
        ...proofGap,
        payloadHash: 'hash:conflicting-proof-gap-payload',
      }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_record_conflict',
      record: expect.objectContaining({ payloadHash: 'hash:proof-gap-payload' }),
    })

    expect(db.rowsFor('handshakeRecords')).toEqual([
      expect.objectContaining({
        recordId: 'greenlight:proof-gap',
        status: 'proof_gap',
        proofGapReason: 'missing_provider_evidence',
      }),
    ])
  })

  it('commits gateway checks and isolation states with replay-safe CAS', async () => {
    const db = new FakeDb()
    const gatewayCheck = {
      checkId: 'gateway-check:001',
      principalId: 'principal:wba:agent-one',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      status: 'accepted',
      sourceHash: 'hash:gateway-check:001',
      checkedAt: NOW,
    } as const
    const isolationState = {
      isolationId: 'isolation:001',
      principalId: 'principal:wba:agent-one',
      status: 'available',
      updatedAt: NOW,
    } as const

    await expect(commitClearanceGatewayCheck(db, gatewayCheck)).resolves.toMatchObject({
      kind: 'committed',
      record: expect.objectContaining({ checkId: 'gateway-check:001', status: 'accepted' }),
    })
    await expect(commitClearanceGatewayCheck(db, { ...gatewayCheck })).resolves.toMatchObject({
      kind: 'replayed',
      record: expect.objectContaining({ checkId: 'gateway-check:001' }),
    })
    await expect(
      commitClearanceGatewayCheck(db, { ...gatewayCheck, status: 'proof_gap', sourceHash: 'hash:gateway-check:changed' }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_record_conflict',
      record: expect.objectContaining({ status: 'accepted' }),
    })

    await expect(commitClearanceIsolationState(db, isolationState)).resolves.toMatchObject({
      kind: 'committed',
      record: expect.objectContaining({ isolationId: 'isolation:001', status: 'available' }),
    })
    await expect(commitClearanceIsolationState(db, { ...isolationState })).resolves.toMatchObject({
      kind: 'replayed',
      record: expect.objectContaining({ isolationId: 'isolation:001' }),
    })
    await expect(
      commitClearanceIsolationState(db, { ...isolationState, status: 'isolated', reasonCode: 'sandbox_block' }),
    ).resolves.toMatchObject({
      kind: 'rejected',
      reason: 'clearance_record_conflict',
      record: expect.objectContaining({ status: 'available' }),
    })
  })

  it('rejects corrupted persisted gateway and isolation statuses loudly', async () => {
    const db = new FakeDb()
    await db.insert('handshakeGatewayChecks', {
      checkId: 'gateway-check:bad',
      principalId: 'principal:wba:agent-one',
      actionClass: 'business_action',
      actionRef: 'business-action:provision-paid-intake-endpoint',
      status: 'not-a-status',
      sourceHash: 'hash:bad',
      checkedAt: NOW,
    })
    await db.insert('handshakeIsolationStates', {
      isolationId: 'isolation:bad',
      principalId: 'principal:wba:agent-one',
      status: 'not-a-status',
      updatedAt: NOW,
    })

    await expect(
      commitClearanceGatewayCheck(db, {
        checkId: 'gateway-check:bad',
        principalId: 'principal:wba:agent-one',
        actionClass: 'business_action',
        actionRef: 'business-action:provision-paid-intake-endpoint',
        status: 'accepted',
        sourceHash: 'hash:bad',
        checkedAt: NOW,
      }),
    ).rejects.toThrow()
    await expect(
      commitClearanceIsolationState(db, {
        isolationId: 'isolation:bad',
        principalId: 'principal:wba:agent-one',
        status: 'available',
        updatedAt: NOW,
      }),
    ).rejects.toThrow()
  })
})

function consumeCommand(overrides: Partial<ClearanceGreenlightConsumeCommand> = {}): ClearanceGreenlightConsumeCommand {
  return {
    greenlightRef: 'greenlight:001',
    principalId: 'principal:wba:agent-one',
    actionClass: 'business_action',
    actionRef: 'business-action:provision-paid-intake-endpoint',
    now: NOW,
    consumedByRef: 'gate-attempt:001',
    ...overrides,
  }
}

type ClearanceGreenlightConsumeCommand = Readonly<{
  greenlightRef: string
  principalId: string
  actionClass: 'business_action' | 'contact_follow_up'
  actionRef: string
  now: number
  consumedByRef: string
}>

type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type Filter = Readonly<{ field: string; value: unknown }>

type Query = Readonly<{
  withIndex(indexName: string, callback: (builder: IndexBuilder) => IndexBuilder): Query
  unique(): Promise<Row | null>
  first(): Promise<Row | null>
  collect(): Promise<Row[]>
}>

type IndexBuilder = Readonly<{
  eq(field: string, value: unknown): IndexBuilder
}>

class FakeDb {
  private readonly tables = new Map<string, Row[]>()
  private sequence = 0

  query(tableName: string): Query {
    return new FakeQuery(this, tableName)
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    const row = {
      ...value,
      _id: `${tableName}:${++this.sequence}`,
      _creationTime: this.sequence,
    }
    const rows = this.tables.get(tableName) ?? []
    rows.push(row)
    this.tables.set(tableName, rows)
    return row._id
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) {
        Object.assign(row, patch)
        return
      }
    }

    throw new Error(`missing fake row ${id}`)
  }

  rowsMatching(tableName: string, filters: readonly Filter[]): Row[] {
    const rows = this.tables.get(tableName) ?? []
    return rows.filter((row) => filters.every((filter) => row[filter.field] === filter.value))
  }

  rowsFor(tableName: string): Row[] {
    return this.tables.get(tableName) ?? []
  }

  allRows(): Row[] {
    return Array.from(this.tables.values()).flat()
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly db: FakeDb,
    private readonly tableName: string,
    private readonly filters: readonly Filter[] = [],
  ) {}

  withIndex(_indexName: string, callback: (builder: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    return new FakeQuery(this.db, this.tableName, builder.filters)
  }

  async unique(): Promise<Row | null> {
    const rows = this.db.rowsMatching(this.tableName, this.filters)
    if (rows.length > 1) {
      throw new Error(`expected unique fake row for ${this.tableName}, found ${rows.length}`)
    }

    return rows[0] ?? null
  }

  async first(): Promise<Row | null> {
    return this.db.rowsMatching(this.tableName, this.filters)[0] ?? null
  }

  async collect(): Promise<Row[]> {
    return this.db.rowsMatching(this.tableName, this.filters)
  }
}

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: Filter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ field, value })
    return this
  }
}
