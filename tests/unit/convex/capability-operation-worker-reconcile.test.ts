const recoverMock = vi.hoisted(() => vi.fn())

vi.mock('@/modules/capability-execution/invocation-worker/recover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-execution/invocation-worker/recover')>()),
  recoverCapabilityOperationInvocation: recoverMock,
}))

import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimAutomaticReconciliationCandidate,
  finishAutomaticReconciliation,
  listDueAutomaticReconciliationCandidates,
  record,
} from '../../../convex/capabilityOperationInvocations'
import { reconcileScheduled } from '../../../convex/capabilityOperationInvocationWorker'

type Reconciliation = {
  attemptCount: number
  nextAttemptAt: number
  leaseOwner?: string
  leaseExpiresAt?: number
  disposition: 'automatic' | 'manual_review'
  reason: 'unknown_settlement' | 'pending_accounting' | 'refund_pending' | 'custody_cap' | 'recovery_failed'
}
type Row = {
  _id: string
  invocationRef: string
  principalId: string
  credentialId: string
  state: string
  operationJson?: string
  inputJson?: string
  authority?: unknown
  reconciliation?: Reconciliation
  [key: string]: unknown
}
type Predicate = { field: string; operator: 'eq' | 'lte'; value: unknown }
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  lte: (field: string, value: unknown) => QueryBuilder
}

function readField(row: Row, field: string): unknown {
  return field.split('.').reduce<unknown>((value, part) => (
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined
  ), row)
}

class MemoryQuery {
  private readonly predicates: Predicate[] = []
  private indexed = false

  public constructor(private readonly source: Row[], private readonly indexes: string[]) {}

  public withIndex(index: string, apply: (builder: QueryBuilder) => unknown): MemoryQuery {
    this.indexed = true
    this.indexes.push(index)
    const builder: QueryBuilder = {
      eq: (field, value) => {
        this.predicates.push({ field, operator: 'eq', value })
        return builder
      },
      lte: (field, value) => {
        this.predicates.push({ field, operator: 'lte', value })
        return builder
      },
    }
    apply(builder)
    return this
  }

  public order(direction: 'asc' | 'desc'): MemoryQuery {
    if (this.indexed) {
      this.source.sort((left, right) => {
        const leftValue = readField(left, 'reconciliation.nextAttemptAt')
        const rightValue = readField(right, 'reconciliation.nextAttemptAt')
        const difference = Number(leftValue) - Number(rightValue)
        return direction === 'asc' ? difference : -difference
      })
    }
    return this
  }

  public take(limit: number): Row[] {
    return this.source
      .filter((row) => this.predicates.every(({ field, operator, value }) => {
        const actual = readField(row, field)
        return operator === 'eq'
          ? actual === value
          : typeof actual === 'number' && typeof value === 'number' && actual <= value
      }))
      .slice(0, limit)
  }

  public async unique(): Promise<Row | null> {
    const rows = this.take(2)
    if (rows.length > 1) throw new Error('unique_query_returned_multiple_rows')
    return rows[0] ?? null
  }
}

class MemoryDb {
  public readonly indexes: string[] = []

  public constructor(public readonly rows: Row[]) {}

  public query(_table: string): MemoryQuery {
    return new MemoryQuery(this.rows, this.indexes)
  }

  public async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    const row = this.rows.find((candidate) => candidate._id === id)
    if (row === undefined) throw new Error('row_not_found')
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete row[key]
      else row[key] = value
    }
  }
}

type Handler = (ctx: { db: MemoryDb }, args: Record<string, unknown>) => Promise<unknown>
const listHandler = (listDueAutomaticReconciliationCandidates as unknown as { _handler: Handler })._handler
const claimHandler = (claimAutomaticReconciliationCandidate as unknown as { _handler: Handler })._handler
const finishHandler = (finishAutomaticReconciliation as unknown as { _handler: Handler })._handler
const recordHandler = (record as unknown as { _handler: Handler })._handler
const scheduledHandler = (reconcileScheduled as unknown as { _handler: Handler })._handler

function row(
  invocationRef: string,
  reconciliation: Reconciliation = {
    attemptCount: 0,
    nextAttemptAt: 1_000,
    disposition: 'automatic',
    reason: 'recovery_failed',
  },
): Row {
  return {
    _id: `id:${invocationRef}`,
    invocationRef,
    principalId: `principal:${invocationRef}`,
    credentialId: `credential:${invocationRef}`,
    state: 'reconciliation_required',
    operationJson: 'secret-operation-json',
    inputJson: 'secret-input-json',
    authority: { secret: 'do-not-project' },
    reconciliation,
  }
}

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

afterEach(() => {
  recoverMock.mockReset()
  vi.restoreAllMocks()
})

describe('scheduled capability invocation reconciliation primitives', () => {
  it('uses the reconciliation index, caps at 25, and redacts candidate rows', async () => {
    const db = new MemoryDb(Array.from({ length: 30 }, (_, index) => row(`candidate:${index}`, {
      attemptCount: index,
      nextAttemptAt: 1_000 + index,
      disposition: 'automatic',
      reason: 'unknown_settlement',
    })))

    const candidates = await listHandler({ db }, { now: 2_000, limit: 100 }) as Array<{
      invocationRef: string
      attemptCount: number
      nextAttemptAt: number
    }>

    expect(db.indexes).toContain('by_state_and_reconciliation_nextAttemptAt')
    expect(candidates).toHaveLength(25)
    expect(candidates[0]).toEqual({ invocationRef: 'candidate:0', attemptCount: 0, nextAttemptAt: 1_000 })
    expect(Object.keys(candidates[0] as object)).toEqual(['invocationRef', 'attemptCount', 'nextAttemptAt'])
    expect(JSON.stringify(candidates)).not.toContain('operationJson')
    expect(JSON.stringify(candidates)).not.toContain('inputJson')
    expect(JSON.stringify(candidates)).not.toContain('authority')
    expect(JSON.stringify(candidates)).not.toContain('secret')
  })

  it('wins the first lease, blocks a live lease, rejects stale finishes, and permits takeover after expiry', async () => {
    const db = new MemoryDb([row('claimable')])

    await expect(claimHandler({ db }, { invocationRef: 'claimable', leaseOwner: 'worker:one', now: 1_000 }))
      .resolves.toEqual({ kind: 'claimed', principalId: 'principal:claimable', credentialId: 'credential:claimable' })
    await expect(claimHandler({ db }, { invocationRef: 'claimable', leaseOwner: 'worker:two', now: 1_001 }))
      .resolves.toEqual({ kind: 'not_claimed' })
    await expect(finishHandler({ db }, {
      invocationRef: 'claimable', leaseOwner: 'worker:two', now: 1_001, outcome: 'terminal',
    })).resolves.toEqual({ kind: 'refused', code: 'stale_lease' })

    await expect(claimHandler({ db }, { invocationRef: 'claimable', leaseOwner: 'worker:two', now: 61_000 }))
      .resolves.toMatchObject({ kind: 'claimed' })
    expect(db.rows[0]?.reconciliation).toMatchObject({ leaseOwner: 'worker:two', leaseExpiresAt: 121_000 })
  })

  it('applies the exact four backoffs and sends the fifth failure to manual review', async () => {
    const db = new MemoryDb([row('backoff')])
    const backoffs = [60_000, 300_000, 900_000, 3_600_000, 3_600_000]
    let now = 1_000

    for (const [index, backoff] of backoffs.entries()) {
      const dueAt = db.rows[0]?.reconciliation?.nextAttemptAt
      if (dueAt === undefined) throw new Error('reconciliation_due_time_missing')
      now = dueAt
      const owner = `worker:backoff:${index}`
      await expect(claimHandler({ db }, { invocationRef: 'backoff', leaseOwner: owner, now }))
        .resolves.toMatchObject({ kind: 'claimed' })
      const result = await finishHandler({ db }, {
        invocationRef: 'backoff', leaseOwner: owner, now, outcome: 'reconciliation_required',
      })
      if (index < 4) {
        expect(result).toEqual({ kind: 'retried', attemptCount: index + 1, nextAttemptAt: now + backoff })
      } else {
        expect(result).toEqual({ kind: 'manual_review' })
      }
      expect(db.rows[0]?.reconciliation?.nextAttemptAt).toBe(now + backoff)
    }

    expect(db.rows[0]?.reconciliation).toEqual({
      attemptCount: 5,
      nextAttemptAt: now + 3_600_000,
      disposition: 'manual_review',
      reason: 'recovery_failed',
    })
  })

  it('clears reconciliation after a terminal recovery result', async () => {
    const db = new MemoryDb([row('complete')])
    await expect(claimHandler({ db }, { invocationRef: 'complete', leaseOwner: 'worker:complete', now: 1_000 }))
      .resolves.toMatchObject({ kind: 'claimed' })
    await expect(finishHandler({ db }, {
      invocationRef: 'complete', leaseOwner: 'worker:complete', now: 1_001, outcome: 'terminal',
    })).resolves.toEqual({ kind: 'completed' })
    expect(db.rows[0]).not.toHaveProperty('reconciliation')
  })

  it('initializes only absent schedules when an existing mutation projects reconciliation', async () => {
    const absent = row('absent')
    delete absent.reconciliation
    const existing = row('existing', {
      attemptCount: 4,
      nextAttemptAt: 99_000,
      disposition: 'manual_review',
      reason: 'pending_accounting',
    })
    const db = new MemoryDb([absent, existing])

    await recordHandler({ db }, {
      invocationRef: 'absent', principalId: 'principal:absent', state: 'reconciliation_required',
      dispatchState: 'reconciliation_required', now: 5_000,
    })
    await recordHandler({ db }, {
      invocationRef: 'existing', principalId: 'principal:existing', state: 'reconciliation_required',
      dispatchState: 'reconciliation_required', now: 5_000,
    })

    expect(absent.reconciliation).toEqual({
      attemptCount: 0,
      nextAttemptAt: 5_000,
      disposition: 'automatic',
      reason: 'recovery_failed',
    })
    expect(existing.reconciliation).toEqual({
      attemptCount: 4,
      nextAttemptAt: 99_000,
      disposition: 'manual_review',
      reason: 'pending_accounting',
    })
  })
})

describe('scheduled capability invocation reconciliation worker', () => {
  it('processes candidates serially and continues after one item fails', async () => {
    const candidates = [
      { invocationRef: 'first', attemptCount: 0, nextAttemptAt: 1_000 },
      { invocationRef: 'second', attemptCount: 1, nextAttemptAt: 1_000 },
      { invocationRef: 'third', attemptCount: 2, nextAttemptAt: 1_000 },
    ]
    const order: string[] = []
    let active = 0
    let maximumActive = 0
    const finished: string[] = []
    recoverMock.mockImplementation(async (_ctx: unknown, args: { invocationRef: string }) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      order.push(args.invocationRef)
      await Promise.resolve()
      active -= 1
      if (args.invocationRef === 'first') throw new Error('recovery_failed')
      return { kind: 'found', invocationRef: args.invocationRef, operationRef: 'operation', state: 'terminal' }
    })
    const ctx = {
      runQuery: vi.fn(async () => candidates),
      runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        const path = functionPath(reference)
        if (path.endsWith(':claimAutomaticReconciliationCandidate')) {
          return { kind: 'claimed', principalId: `principal:${args.invocationRef}`, credentialId: `credential:${args.invocationRef}` }
        }
        if (path.endsWith(':finishAutomaticReconciliation')) {
          finished.push(String(args.invocationRef))
          return args.invocationRef === 'first' ? { kind: 'retried', attemptCount: 1, nextAttemptAt: 61_000 } : { kind: 'completed' }
        }
        throw new Error(`unexpected_mutation:${path}`)
      }),
    }

    await expect(scheduledHandler(ctx as never, {})).resolves.toEqual({
      selected: 3, claimed: 3, completed: 2, retried: 1, manualReview: 0,
    })
    expect(order).toEqual(['first', 'second', 'third'])
    expect(finished).toEqual(['first', 'second', 'third'])
    expect(maximumActive).toBe(1)
  })

  it('stops starting new candidates after 45 seconds', async () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const candidates = [
      { invocationRef: 'first', attemptCount: 0, nextAttemptAt: 1_000 },
      { invocationRef: 'second', attemptCount: 0, nextAttemptAt: 1_000 },
    ]
    const claimed: string[] = []
    recoverMock.mockImplementation(async (_ctx: unknown, args: { invocationRef: string }) => {
      claimed.push(args.invocationRef)
      now = 46_000
      return { kind: 'found', invocationRef: args.invocationRef, operationRef: 'operation', state: 'terminal' }
    })
    const ctx = {
      runQuery: vi.fn(async () => candidates),
      runMutation: vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
        const path = functionPath(reference)
        if (path.endsWith(':claimAutomaticReconciliationCandidate')) {
          return { kind: 'claimed', principalId: 'principal', credentialId: 'credential' }
        }
        if (path.endsWith(':finishAutomaticReconciliation')) return { kind: 'completed' }
        throw new Error(`unexpected_mutation:${path}`)
      }),
    }

    await expect(scheduledHandler(ctx as never, {})).resolves.toMatchObject({ selected: 2, claimed: 1, completed: 1 })
    expect(claimed).toEqual(['first'])
  })
})
